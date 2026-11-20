import type {ConversationCache,CacheScope} from './conversation-cache.ts';
import type {TextConversation} from '../../../packages/chat-client/src/text-session-channel.ts';
import {createAudioMessageResolver} from '../../../packages/chat-client/src/audio-message-resolver.ts';
import type {createRecentConversationHost} from './recent-conversation-host.ts';
/** Three recent clips per conversation entry; opt-in, foreground, no playback or receipts. */
export function createAudioAutoDownload(d:{cache:ConversationCache;scope:CacheScope;conversation:TextConversation;host:ReturnType<typeof createRecentConversationHost>;current:()=>boolean;schedule:(f:()=>void,ms:number)=>()=>void}) {
 let closed=false,busy=false,cancel:(()=>void)|null=null,request:AbortController|null=null;
 const epoch=d.cache.ticket(),attempted=new Set<string>();
 const live=()=>!closed&&d.current()&&d.conversation.active()&&d.cache.ticket()===epoch&&d.cache.snapshot().automatic;
 const resolver=createAudioMessageResolver({enabled:true,companyId:d.scope.companyId,conversationId:d.scope.conversationId,current:live,rpc:async(c,s)=>{const r=await d.conversation.audioResolve!(c,s);if(r.error)throw Error('Audio unavailable');return r.data;}});
 function changed(){
  if(!live()){cancel?.();cancel=null;request?.abort();return;}
  const h=d.host.history.snapshot();
  if(busy||cancel||h.status!=='ready'||h.busy||d.host.snapshot().sending||attempted.size>=3)return;
  const row=[...h.messages].reverse().find(m=>m.kind==='audio'&&!attempted.has(m.id));if(!row)return;
  cancel=d.schedule(()=>{cancel=null;void run(row.id);},700);
 }
 async function run(id:string){
  if(!live()||busy)return;const h=d.host.history.snapshot();
  if(h.status!=='ready'||h.busy||!h.messages.some(m=>m.id===id&&m.kind==='audio')||d.host.snapshot().sending)return;
  busy=true;attempted.add(id);const ac=new AbortController();request=ac;let bytes:Uint8Array|null=null;
  try{const {messageId,...command}=await resolver(id,ac.signal);if(!live()||ac.signal.aborted||messageId!==id)return;
   // Existing local bytes need no speculative request. Explicit playback still reauthorizes.
   bytes=await d.cache.audio(d.scope,command);if(bytes)return;
   if(!live()||ac.signal.aborted)return;bytes=await d.conversation.audioTransfer!.read(command,ac.signal,true);
  }catch{/* Automatic fetch is optional; the play button remains an explicit retry. */}
  finally{bytes?.fill(0);ac.abort();if(request===ac)request=null;busy=false;changed();}
 }
 const stopHost=d.host.subscribe(changed),stopCache=d.cache.subscribe(changed);changed();
 return {dispose(){if(closed)return;closed=true;cancel?.();request?.abort();stopHost();stopCache();}};
}
