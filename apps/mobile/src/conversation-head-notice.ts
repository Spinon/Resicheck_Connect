import {isConversationHead,type ConversationHead} from '../../../packages/chat-client/src/conversation-head-read.ts';
import type {createHistoryWindow} from '../../../packages/chat-client/src/history-window.ts';
type History=Pick<ReturnType<typeof createHistoryWindow>,'snapshot'|'subscribe'>;
/** Advisory only. Never loads a page, sends, scrolls or marks a receipt. The
 * owner supplies only deadline-accepted probes. Older pages keep the last
 * successfully loaded latest watermark, even after newer rows are trimmed. */
export function createConversationHeadNotice(deps:Readonly<{history:History;current:()=>boolean;changed:()=>void}>){
 let disposed=false,baseline:number|null=null,head:number|null=null,visible=false;
 const live=()=>{try{return !disposed&&deps.current()===true&&!disposed;}catch{return false;}};
 function publish(value:boolean){if(visible===value)return;visible=value;deps.changed();}
 function sync(){
  if(!live()){baseline=null;head=null;publish(false);return;}
  const h=deps.history.snapshot();if(!live()){baseline=null;head=null;publish(false);return;}
  if(['failed','unavailable','closed'].includes(h.status)){baseline=null;head=null;}
  else if(h.status==='ready'&&!h.busy&&!h.olderWindow)baseline=h.messages.at(-1)?.sequence??0;
  publish(baseline!==null&&head!==null&&head>baseline);
 }
 const stop=deps.history.subscribe(sync);sync();
 return Object.freeze({snapshot:()=>{sync();return visible;},
  accept(value:ConversationHead|null){if(!live())return false;if(!isConversationHead(value)){baseline=null;head=null;publish(false);return false;}head=Math.max(head??0,value?.sequence??0);sync();return live();},
  dispose(){if(disposed)return;disposed=true;stop();baseline=null;head=null;publish(false);},
 });
}
