import type{createRecentConversation}from '../../../packages/chat-client/src/recent-conversation.ts';
type Host=ReturnType<typeof createRecentConversation>;
/** Up to three serialized read-only checks per original intent; never resends or
 * treats an absent receipt as proof that sending failed. Budget survives edits. */
export function createUncertainSendRecovery(deps:Readonly<{host:Host;current:()=>boolean;schedule:(fn:()=>void,ms:number)=>()=>void}>){
 const delays=[500,2000,5000] as const;
 let closed=false,intent:string|null=null,attempts=0,inFlight=false,ticket:object|null=null,cancel=()=>{};
 const live=()=>{try{return !closed&&deps.current()===true;}catch{return false;}};
 function eligible(){if(!live())return null;const v=deps.host.snapshot();if(v.status!=='active'||v.sending||deps.host.history.snapshot().busy)return null;const e=v.pending[0];return e?.status==='failed'&&e.failure?.acceptanceUncertain===true?e.clientMessageId:null;}
 function clear(){ticket=null;const stop=cancel;cancel=()=>{};stop();}
 function sync(){
  const id=eligible();if(!id){clear();return;}
  if(intent!==id){clear();intent=id;attempts=0;}
  if(inFlight||ticket||attempts>=delays.length)return;
  const own=Object.freeze({});ticket=own;let returned=false;
  const stop=deps.schedule(()=>{
   if(!returned){ticket=null;attempts=delays.length;return;}
   if(ticket!==own)return;clear();if(eligible()!==id)return;
   attempts++;inFlight=true;
   let request:Promise<boolean>;try{request=Promise.resolve(deps.host.recoverPending());}catch{request=Promise.resolve(false);}
   void request.catch(()=>false).then(()=>{inFlight=false;if(!closed)sync();});
  },delays[attempts]);returned=true;if(ticket===own)cancel=stop;else stop();
 }
 const stopHost=deps.host.subscribe(sync),stopHistory=deps.host.history.subscribe(sync);sync();
 return Object.freeze({dispose(){if(closed)return;closed=true;clear();stopHost();stopHistory();}});
}
