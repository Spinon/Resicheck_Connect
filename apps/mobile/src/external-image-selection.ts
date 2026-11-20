import type {ConversationMediaCapability} from './conversation-media-scope.ts';

export const EXTERNAL_IMAGE_SELECTION_MS=120000;
type Source={captureMediaScope:()=>ConversationMediaCapability|null;subscribe:(listener:()=>void)=>()=>void};
/** Retains only the ORIGINAL domain owner during an explicit external selection.
 * Never asserts foreground, releases the native curtain or grants file/network
 * access. A pending OS operation occupies its slot even after the hold expires. */
export function createExternalImageSelection(source:Source,foreground:()=>boolean,schedule:(callback:()=>void,ms:number)=>()=>void,now:()=>number=Date.now){
 type Ticket={cap:ConversationMediaCapability;cancel:()=>void;timer:()=>void;retired:boolean;started:number;deadline:number};
 let closed=false,work=false,ticket:Ticket|null=null;const listeners=new Set<()=>void>(),waiters=new Set<()=>void>();
 const valid=(t:Ticket)=>{
  if(closed||t.retired||ticket!==t)return false;
  try{const time=now();if(!Number.isSafeInteger(time)||time<t.started||time>=t.deadline){retire(t,true);return false;}
   const live=t.cap.current()===true&&source.captureMediaScope()?.token===t.cap.token;
   if(live&&!closed&&!t.retired&&ticket===t)return true;
  }catch{}
  retire(t,true);return false;
 };
 const wake=()=>{for(const check of [...waiters])check();};
 const notify=()=>{wake();for(const listener of [...listeners])try{listener();}catch{}};
 function retire(t:Ticket,cancel:boolean){
  if(t.retired)return;t.retired=true;if(ticket===t)ticket=null;
  try{t.timer();}catch{}
  // Invalidate the draft synchronously before publishing hold release. Do not
  // await disposal: it may itself await the outstanding OS picker operation.
  if(cancel)try{t.cancel();}catch{}
  notify();
 }
 function waitForeground(t:Ticket):Promise<boolean>{
  return new Promise(resolve=>{
   let done=false;
   const finish=(value:boolean)=>{if(done)return;done=true;waiters.delete(check);resolve(value);};
   const check=()=>{if(done)return;if(!valid(t)){finish(false);return;}try{if(foreground())finish(true);}catch{retire(t,true);finish(false);}};
   waiters.add(check);check();
  });
 }
 const stop=source.subscribe(()=>{const t=ticket;if(t&&!valid(t))retire(t,true);});
 return Object.freeze({
  retainDomain:()=>ticket!==null&&valid(ticket),
  // Android may deliver onActivityResult BEFORE focus/AppState resume. Keep
  // ownership under the curtain until real lifecycle returns, or the original
  // deadline/revocation cancels it. This notification does not assert focus.
  foregroundChanged:wake,
  subscribe:(listener:()=>void)=>{if(closed)return()=>{};listeners.add(listener);return()=>{listeners.delete(listener);};},
  async run(operation:()=>Promise<boolean>,cancel:()=>void,expected?:ConversationMediaCapability){
   if(closed||work)return false;
   let cap:ConversationMediaCapability|null,started:number;try{if(!foreground())return false;cap=source.captureMediaScope();started=now();if(!cap?.current()||expected&&(cap.token!==expected.token||!expected.current())||!Number.isSafeInteger(started)||started<0||!Number.isSafeInteger(started+EXTERNAL_IMAGE_SELECTION_MS))return false;}catch{return false;}
   const t:Ticket={cap,cancel,timer:()=>{},retired:false,started,deadline:started+EXTERNAL_IMAGE_SELECTION_MS};ticket=t;work=true;
   try{
    const clear=schedule(()=>retire(t,true),EXTERNAL_IMAGE_SELECTION_MS);t.timer=clear;if(t.retired)clear();
    notify();if(!valid(t))return false;
    const result=await operation(),current=await waitForeground(t),live=valid(t),active=foreground()===true;
    return result===true&&current&&live&&active;
   }catch{retire(t,true);return false;}
   finally{retire(t,false);work=false;}
  },
  dispose(){if(closed)return;closed=true;stop();if(ticket)retire(ticket,true);listeners.clear();},
 });
}
