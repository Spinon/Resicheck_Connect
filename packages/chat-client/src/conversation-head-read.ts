export type ConversationHead=Readonly<{id:string;sequence:number}>;
/** null is an authorized empty conversation, never unknown/denied access. */
export type ConversationHeadProbe=(signal?:AbortSignal)=>Promise<ConversationHead|null>;
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const unavailable=()=>Error('Text channel unavailable');
export function isConversationHead(value:unknown):value is ConversationHead|null{
 if(value===null)return true;if(!value||typeof value!=='object'||Array.isArray(value))return false;
 try{const keys=Reflect.ownKeys(value),v=value as Record<string,unknown>;return keys.length===2&&keys.includes('id')&&keys.includes('sequence')&&uuid(v.id)&&typeof v.sequence==='number'&&Number.isSafeInteger(v.sequence)&&v.sequence>0;}catch{return false;}
}
/** This is a GET of the newest row's two fields, not HTTP HEAD and not content
 * authorization. Both guards use the same captured context/session as get. */
export function createConversationHeadProbe(deps:Readonly<{companyId:string;conversationId:string;imageHistory?:boolean;current:()=>boolean;guard:(signal?:AbortSignal)=>Promise<string|null>;get:(path:string,signal?:AbortSignal)=>Promise<unknown>;close:()=>void}>):ConversationHeadProbe{
 const {companyId,conversationId,current,guard,get,close}=deps;
 if(!uuid(companyId)||!uuid(conversationId))throw unavailable();let pending=false;
 const live=(signal?:AbortSignal)=>{try{return !signal?.aborted&&current()===true;}catch{return false;}};
 return async signal=>{
  if(pending||!live(signal))throw unavailable();pending=true;
  try{
   const patient=await guard(signal);if(patient===null||!live(signal))throw unavailable();
   const query=new URLSearchParams({select:'id,sequence',company_id:'eq.'+companyId,conversation_id:'eq.'+conversationId,order:'sequence.desc',limit:'1'});
   const projection=new URLSearchParams({p_company:companyId,p_conversation:conversationId,p_limit:'1'});
   const raw=await get(deps.imageHistory?'/rest/v1/rpc/read_connect_messages_v3?'+projection.toString():'/rest/v1/messages?'+query.toString(),signal);
   const verified=await guard(signal);if(verified===null||verified!==patient||!live(signal))throw unavailable();
   if(!Array.isArray(raw)||raw.length>1)throw unavailable();
   if(raw.length===0)return null;
   const projected=raw[0];if(deps.imageHistory&&(!projected||typeof projected!=='object'||projected.company_id!==companyId||projected.conversation_id!==conversationId))throw unavailable();
   const row:unknown=deps.imageHistory?{id:projected.id,sequence:projected.sequence}:projected;if(!row||typeof row!=='object'||Array.isArray(row)||Reflect.ownKeys(row).length!==2||!Object.hasOwn(row,'id')||!Object.hasOwn(row,'sequence'))throw unavailable();
   const {id,sequence}=row as Record<string,unknown>;
   const seq=typeof sequence==='string'&&/^[1-9][0-9]{0,15}$/.test(sequence)?Number(sequence):sequence;
   if(!uuid(id)||typeof seq!=='number'||!Number.isSafeInteger(seq)||seq<1||!live(signal))throw unavailable();
   return Object.freeze({id,sequence:seq});
  }catch{try{close();}catch{}throw unavailable();}
  finally{pending=false;}
 };
}
