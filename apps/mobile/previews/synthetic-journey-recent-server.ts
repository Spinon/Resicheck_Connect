import {createMembershipDirectory,type MembershipRpc} from '../../../packages/chat-client/src/membership-directory.ts';
import {analyzeMessage} from '../../../packages/text/src/message-text.ts';

type Access=Readonly<{patientId:string;role:'patient'|'staff'}>;
// QA-only HTTP-shaped fixture, no global fetch or persistent state. Uses the
// original synthetic Auth verifier and membership RPCs, not caller identity.
export function createSyntheticJourneyRecentServer(deps:{fetch:typeof fetch;json:(v:unknown,status?:number)=>Response;rpc:(user:string)=>MembershipRpc;createId:()=>string;schedule:(fn:()=>void,ms:number)=>()=>void}){
 type Row={id:string;company_id:string;conversation_id:string;sender_id:string;sender_role:'patient'|'staff';sequence:number;accepted_at:string;kind:'text';body:string;important:boolean};
 const messages:Row[]=[],receipts=new Map<string,Row>();let drop=false,wait:Promise<void>|null=null,release:(()=>void)|null=null;
 async function access(user:string,co:string,cv:string,signal:AbortSignal):Promise<Access|null>{
  const api=createMembershipDirectory({rpc:deps.rpc(user),current:()=>!signal.aborted,schedule:deps.schedule,timeoutMs:3000});
  try{let cursor:Parameters<typeof api.myMemberships>[0]=null,staff=false;
   for(let budget=0;budget<100;budget++){const r=await api.myMemberships(cursor,signal);if(!r.ok)return null;for(const m of r.value.items)if(m.companyId===co&&m.state==='active'){if(m.role==='patient'&&m.conversationId===cv)return{patientId:user,role:'patient'};if(m.role==='staff')staff=true;}cursor=r.value.nextCursor;if(!cursor)break;if(budget===99)return null;}
   if(!staff)return null;let after:string|null=null;
   for(let budget=0;budget<100;budget++){const r=await api.inbox(co,after,signal);if(!r.ok)return null;const row=r.value.items.find(c=>c.conversationId===cv);if(row)return{patientId:row.patientId,role:'staff'};after=r.value.nextCursor;if(!after)break;}
   return null;
  }finally{api.close();}
 }
 let recentWait:Promise<void>|null=null,recentRelease:(()=>void)|null=null,ackWait:Promise<void>|null=null,ackRelease:(()=>void)|null=null;
 const fetchRequest:typeof fetch=async(input,init)=>{
  const url=new URL(String(input));if(url.origin!=='https://abcdefghijklmnopqrst.supabase.co')throw Error('Synthetic origin refused');
  if(!['/rest/v1/conversations','/rest/v1/messages','/rest/v1/rpc/send_text'].includes(url.pathname))return deps.fetch(input,init);
  const signal=init?.signal??new AbortController().signal;if(signal.aborted)throw Error('Synthetic cancelled');
  const verified=await deps.fetch(url.origin+'/auth/v1/user',{headers:init?.headers,signal});if(verified.status!==200)return deps.json({code:'42501'},403);
  const reader=verified.body?.getReader();if(!reader)return deps.json({code:'42501'},403);let body='';try{let size=0;const decoder=new TextDecoder('utf-8',{fatal:true});while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>1024)throw Error('Synthetic identity envelope');body+=decoder.decode(part.value,{stream:true});}body+=decoder.decode();}finally{reader.releaseLock();}const identity=JSON.parse(body) as {id?:unknown};if(typeof identity.id!=='string')return deps.json({code:'42501'},403);const user=identity.id;
  const p=init?.body?JSON.parse(String(init.body)):null,q=url.searchParams,co=p?.p_company??q.get('company_id')?.slice(3)??'',cv=p?.p_conversation??(q.get('id')??q.get('conversation_id'))?.slice(3)??'';
  const permission=await access(user,co,cv,signal);if(!permission)return deps.json({code:'42501'},403);
  if(url.pathname==='/rest/v1/conversations')return deps.json([{id:cv,company_id:co,patient_id:permission.patientId}]);
  if(url.pathname==='/rest/v1/messages'&&q.get('order')==='sequence.desc'){const raw=q.get('sequence'),before=raw===null?null:/^lt\.[1-9][0-9]*$/.test(raw)?Number(raw.slice(3)):NaN;if(q.get('limit')!=='26'||before!==null&&(!Number.isSafeInteger(before)||before<1))return deps.json([],400);const rows=messages.filter(m=>m.company_id===co&&m.conversation_id===cv&&(before===null||m.sequence<before)).sort((a,b)=>b.sequence-a.sequence).slice(0,26).map(m=>({...m}));if(recentWait){const held=recentWait;recentWait=null;await held;}return deps.json(rows);}
  if(url.pathname==='/rest/v1/messages'){const after=Number(q.get('sequence')?.slice(3)),limit=Number(q.get('limit'));if(!Number.isSafeInteger(after)||after<0||!Number.isSafeInteger(limit)||limit<1||limit>25)return deps.json([],400);const rows=messages.filter(m=>m.company_id===co&&m.conversation_id===cv&&m.sequence>after).slice(0,limit).map(m=>({...m}));if(wait){const held=wait;wait=null;await held;}return deps.json(rows);}
  if(typeof p.p_body!=='string'||!analyzeMessage(p.p_body).valid||Array.from(p.p_body).length>2000||typeof p.p_client_id!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(p.p_client_id))return deps.json({code:'P0001'},400);
  const key=[user,co,cv,p.p_client_id].join(':');let row=receipts.get(key);if(row&&row.body!==p.p_body)return deps.json({code:'P0001'},400);
  if(!row){row={id:deps.createId(),company_id:co,conversation_id:cv,sender_id:user,sender_role:permission.role,sequence:1+Math.max(0,...messages.filter(m=>m.company_id===co&&m.conversation_id===cv).map(m=>m.sequence)),accepted_at:new Date().toISOString(),kind:'text',body:p.p_body,important:false};messages.push(row);receipts.set(key,row);}
  if(ackWait){const held=ackWait;ackWait=null;await held;}
  if(drop){drop=false;throw Error('Synthetic committed acknowledgement lost');}return deps.json({...row});
 };
 return Object.freeze({fetch:fetchRequest,holdNextRecent:()=>{if(recentRelease)throw Error('Synthetic hold active');recentWait=new Promise(r=>{recentRelease=r;});},releaseRecent:()=>{const done=recentRelease;recentRelease=null;done?.();},holdNextAck:()=>{if(ackRelease)throw Error('Synthetic hold active');ackWait=new Promise(r=>{ackRelease=r;});},releaseAck:()=>{const done=ackRelease;ackRelease=null;done?.();},dropNextAck:()=>{drop=true;},holdNextHistory:()=>{if(release)throw Error('Synthetic hold already active');wait=new Promise(r=>{release=r;});},releaseHistory:()=>{const done=release;release=null;done?.();},counts:()=>Object.freeze({writes:receipts.size,messages:messages.length})});
}
