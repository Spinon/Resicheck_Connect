import{decodeMessageProjection}from './message-content.ts';
import {analyzeMessage} from '../../text/src/message-text.ts';
import {parseHistoryTimestamp} from './history-timestamp.ts';
import type {HistoryWindowRequest} from './history-window.ts';
export type RecentHistoryWireMessage=Readonly<{id:string;company_id:string;conversation_id:string;sender_id:string;sender_role:'patient'|'staff';sequence:number;accepted_at:string;kind:'text'|'audio'|'image';body:string|null;important:boolean;removed_scope?:'self'|'all'|null}>;
export type RecentHistoryPage=Readonly<{items:readonly RecentHistoryWireMessage[];hasOlder:boolean;checkpoint?:boolean}>;
export type RecentHistoryRead=(request:HistoryWindowRequest,signal?:AbortSignal)=>Promise<RecentHistoryPage>;
const fields=['id','company_id','conversation_id','sender_id','sender_role','sequence','accepted_at','kind','body','important'] as const;
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,keys:readonly string[])=>{const own=Reflect.ownKeys(v);return own.length===keys.length&&own.every(key=>typeof key==='string'&&keys.includes(key));};
const unavailable=()=>Error('Text channel unavailable');

/** Read-only capability bound to the channel's existing subject/context owner.
 * get/guard carry its verified session and budgets; no credentials or fetch here.
 * Public REST operators: select, order=sequence.desc, sequence=lt.N, limit=26.
 */
export function createRecentHistoryRead(deps:Readonly<{companyId:string;conversationId:string;allowAudio?:boolean;allowRemoval?:boolean;allowImage?:boolean;current:()=>boolean;guard:(signal?:AbortSignal)=>Promise<string|null>;get:(path:string,signal?:AbortSignal)=>Promise<unknown>;close:()=>void}>):RecentHistoryRead{
  const {companyId,conversationId,current,guard,get,close}=deps;
  if(deps.allowImage===true&&deps.allowRemoval!==true)throw unavailable();
  if(!uuid(companyId)||!uuid(conversationId))throw unavailable();
  const live=(signal?:AbortSignal)=>{try{return !signal?.aborted&&current()===true;}catch{return false;}};
  return async(input,signal)=>{
    try{
      if(!live(signal)||!record(input)||!exact(input,['companyId','conversationId','before','limit']))throw unavailable();
      const {companyId:co,conversationId:cv,before,limit}=input; // getters captured once before IO
      if(co!==companyId||cv!==conversationId||limit!==25||before!==null&&(!Number.isSafeInteger(before)||typeof before!=='number'||before<1))throw unavailable();
      const patient=await guard(signal);if(patient===null||!live(signal))throw unavailable();
      const query=new URLSearchParams({select:fields.join(','),company_id:'eq.'+companyId,conversation_id:'eq.'+conversationId,order:'sequence.desc',limit:'26'});
      if(before!==null)query.set('sequence','lt.'+before);
      const projection=new URLSearchParams({p_company:companyId,p_conversation:conversationId,p_limit:'26'});if(before!==null)projection.set('p_before',String(before));
      const raw=await get(deps.allowRemoval?'/rest/v1/rpc/'+(deps.allowImage?'read_connect_messages_v3?':'read_connect_messages_v2?')+projection.toString():'/rest/v1/messages?'+query.toString(),signal);
      const verified=await guard(signal);
      if(verified===null||!live(signal))throw unavailable();
      if(verified!==patient){close();throw unavailable();}
      if(!Array.isArray(raw)||raw.length>26)throw unavailable();
      const length=raw.length,ids=new Set<string>(),items:RecentHistoryWireMessage[]=[];let last=before??Infinity;
      // Validate the entire lookahead, not just the 25 rows exposed to the window.
      for(let index=0;index<length;index++){
        const row=raw[index];if(!record(row)||!exact(row,deps.allowRemoval?[...fields,'removed_scope']:fields))throw unavailable();
        const {id,company_id,conversation_id,sender_id,sender_role,sequence,accepted_at,kind,body,important}=row;
        const seq=typeof sequence==='string'&&/^[1-9][0-9]{0,15}$/.test(sequence)?Number(sequence):sequence;
        if(!uuid(id)||ids.has(id)||company_id!==companyId||conversation_id!==conversationId||!uuid(sender_id)||(sender_role!=='patient'&&sender_role!=='staff')
          ||typeof seq!=='number'||!Number.isSafeInteger(seq)||seq<1||seq>=last||typeof important!=='boolean'
          ||typeof accepted_at!=='string'||parseHistoryTimestamp(accepted_at)===null)throw unavailable();
        const content=decodeMessageProjection(kind,body,important,row.removed_scope,deps.allowAudio,deps.allowRemoval,deps.allowImage);
        ids.add(id);last=seq;
        items.push(Object.freeze({id,company_id,conversation_id,sender_id,sender_role,sequence:seq,accepted_at,kind:content.kind,body:content.body,important,...(deps.allowRemoval?{removed_scope:content.removedScope??null}:{})}));
      }
      if(!live(signal))throw unavailable();
      return Object.freeze({items:Object.freeze(items.slice(0,25)),hasOlder:length===26});
    }catch{throw unavailable();}
  };
}
