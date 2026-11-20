import {createTextHistory} from './text-history.ts';import {createTextSendQueue} from './text-send-queue.ts';import {createSupabaseSendAdapter} from './supabase-send.ts';import type {TextSession} from './text-session-channel.ts';
// In-memory host candidate. No UI, credentials, automatic polling or real login.
export function bindTextConversation(session:TextSession,companyId:string,conversationId:string,options:{createId:()=>string;schedule:(callback:()=>void,ms:number)=>()=>void;timeoutMs:number}){
 const channel=session.openConversation(companyId,conversationId);if(!channel)throw Error('Conversation unavailable');
 const context=Object.freeze({userId:session.userId,sessionKey:session.sessionKey,companyId,conversationId});
 const adapter=createSupabaseSendAdapter(options),sender=adapter.openContext(context,channel.rpc),queue=createTextSendQueue({...options,transport:sender.send}),q=queue.openContext(context);
 let closed=false;const listeners=new Set<()=>void>();
 const history=createTextHistory({...options,transport:channel.history,pageSize:25}),h=history.openContext(context,()=>publish());
 let view=Object.freeze({entries:q.snapshot(),history:h.snapshot()});
 function notify(){for(const f of listeners)try{f();}catch{}}
 function publish(){if(closed||!channel!.active())return;view=Object.freeze({entries:q.snapshot(),history:h.snapshot()});notify();}
 function clear(){if(closed)return;closed=true;adapter.signOut();queue.signOut();history.signOut();view=Object.freeze({entries:q.snapshot(),history:h.snapshot()});notify();}
 const unsubscribe=channel.onClose(clear);
 return Object.freeze({
  enqueue:(text:unknown)=>{const result=q.enqueue(text);publish();return result;},
  send:async(id:string)=>{const pending=q.send(id);publish();const outcome=await pending;publish();return outcome;},
  loadNext:async()=>{const outcome=await h.loadNext();return closed?'unavailable' as const:outcome;},
  snapshot:()=>{if(!channel.active())clear();return view;},
  subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},
  close:()=>{unsubscribe();channel.close();clear();},
 });
}
