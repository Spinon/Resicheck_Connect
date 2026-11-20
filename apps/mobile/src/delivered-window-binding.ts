import type{createHistoryWindow}from '../../../packages/chat-client/src/history-window.ts';import{messagesReceivedCommand,decodeMessagesReceived}from '../../../packages/chat-client/src/message-delivery.ts';import type{MessageReceiptsRpc}from '../../../packages/chat-client/src/message-receipts.ts';
/** Only a committed decoded history window, never an arbitrary GET or inbox. */
export function createDeliveredWindowBinding(deps:Readonly<{enabled?:boolean;history:ReturnType<typeof createHistoryWindow>;userId:string;recipientRole:'patient'|'staff';companyId:string;conversationId:string;current:()=>boolean;rpc:MessageReceiptsRpc}>){
 deps=Object.freeze({...deps});
 if(!['patient','staff'].includes(deps.recipientRole))throw Error('Delivery unavailable');
 let closed=false,job:AbortController|null=null,attempted:object|null=null;const acknowledged=new Set<string>();
 const live=()=>{try{return !closed&&deps.enabled===true&&deps.current()===true&&!closed;}catch{return false;}};
 let stop=()=>{};if(deps.enabled===true){const unsubscribe=deps.history.subscribe(check);if(closed)unsubscribe();else stop=unsubscribe;}
 function check(){
  if(!live()){if(deps.enabled===true)dispose();return;}const page=deps.history.snapshot();if(page.status!=='ready'||page.busy||attempted===page.messages||job)return;
  const retained=new Set(page.messages.map(m=>m.id));for(const id of acknowledged)if(!retained.has(id))acknowledged.delete(id);
  const ids=[...page.messages].reverse().filter(m=>!m.removedScope&&m.senderId!==deps.userId&&m.senderRole===(deps.recipientRole==='patient'?'staff':'patient')&&!acknowledged.has(m.id)).slice(0,25).map(m=>m.id);
  attempted=page.messages;if(!ids.length)return;const own=new AbortController();job=own;
  void(async()=>{try{const command=messagesReceivedCommand(deps.companyId,deps.conversationId,ids);const reply=await deps.rpc(command,own.signal);if(!live()||own.signal.aborted||reply.error!==null)return;decodeMessagesReceived(reply.data,deps.companyId,deps.conversationId,ids);if(!live()||own.signal.aborted)return;for(const id of ids)acknowledged.add(id);attempted=null;}catch{}finally{if(job===own)job=null;own.abort();if(live()&&deps.history.snapshot().messages!==attempted)check();}})();
 }
 function dispose(){if(closed)return;closed=true;try{stop();}catch{}job?.abort();job=null;acknowledged.clear();}
 check();return Object.freeze({dispose});
}
