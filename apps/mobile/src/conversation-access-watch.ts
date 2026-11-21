type Options=Readonly<{
 current:()=>boolean;
 revalidate:(signal:AbortSignal)=>PromiseLike<boolean>;
 close:()=>void;
 onValidated?:()=>void;
 now:()=>number;
 schedule:(fn:()=>void,ms:number)=>()=>void;
 intervalMs:number;
 timeoutMs:number;
}>;
const unavailable=()=>Error('Conversation access watch unavailable');

/** Read-only, owner-bound display freshness. No default I/O or authorization.
 * First probe starts after intervalMs. A successful probe schedules the next
 * interval; the next proof or fail-closed deadline is within interval+timeout.
 * The monotonic clock and scheduler are injected. close must already refer to
 * this captured owner; it must never resolve a mutable global "current" owner.
 * Disposal is silent because its caller is already closing that owner. */
export function createConversationAccessWatch(options:Options){
 const {current,revalidate,close,onValidated,now,schedule,intervalMs,timeoutMs}=options;
 if(onValidated!==undefined&&typeof onValidated!=='function'||[current,revalidate,close,now,schedule].some(fn=>typeof fn!=='function')
  ||!Number.isSafeInteger(intervalMs)||intervalMs<1||intervalMs>60000
  ||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000)throw unavailable();
 type Timer={cancel:(()=>void)|null;live:boolean};
 type Probe={controller:AbortController;deadline:number};
 let stopped=false,paused=false,lastTime=-1,timer:Timer|null=null,probe:Probe|null=null;
 const resumed=new Set<(allowed:boolean)=>void>();
 function finishResume(allowed:boolean){for(const finish of [...resumed])finish(allowed);}
 function cancelTimer(){const old=timer;timer=null;if(old){old.live=false;try{old.cancel?.();}catch{}}}
 function retire(){if(stopped)return false;stopped=true;cancelTimer();const old=probe;probe=null;old?.controller.abort();finishResume(false);return true;}
 function fail(){if(retire())try{close();}catch{/* A captured owner failure cannot restart work. */}}
 function clock():number|null{
  if(stopped)return null;let value:number;
  try{value=now();}catch{fail();return null;}
  if(stopped)return null;
  if(!Number.isSafeInteger(value)||value<0||value<lastTime){fail();return null;}lastTime=value;return value;
 }
 function live(){if(stopped||paused)return false;try{if(current()===true&&!stopped)return true;}catch{}fail();return false;}
 function dueAfter(value:number,delay:number){const deadline=value+delay;if(!Number.isSafeInteger(deadline)){fail();return null;}return deadline;}
 function arm(deadline:number,kind:'interval'|'timeout',capturedProbe:Probe|null=null){
  if(!live())return;const at=clock();if(at===null)return;cancelTimer();if(stopped)return;
  const owned:Timer={cancel:null,live:true};timer=owned;let returned=false,synchronous=false;
  const callback=()=>{
   // A scheduler invoking inline must not recursively arm or perform I/O.
   if(!returned){synchronous=true;return;}
   if(stopped||timer!==owned||!owned.live)return;
   owned.live=false;timer=null;try{owned.cancel?.();}catch{fail();return;}
   if(!live())return;const observed=clock();if(observed===null)return;
   if(observed<deadline){arm(deadline,kind,capturedProbe);return;}
   if(kind==='timeout'){if(probe===capturedProbe)fail();return;}
   // A late interval callback never receives a fresh timeout allowance.
   // Its final deadline stays anchored to the originally scheduled interval.
   startProbe(deadline);
  };
  try{
   const cancel=schedule(callback,Math.max(0,deadline-at));returned=true;
   if(typeof cancel!=='function'){fail();return;}owned.cancel=cancel;
   if(synchronous){owned.live=false;if(timer===owned)timer=null;try{cancel();}catch{}fail();return;}
   if(stopped||timer!==owned||!owned.live){try{cancel();}catch{}return;}
  }catch{returned=true;fail();}
 }
 function startProbe(at:number){
  if(probe||!live())return;const deadline=dueAfter(at,timeoutMs);if(deadline===null)return;
  const owned:Probe={controller:new AbortController(),deadline};probe=owned;
  arm(deadline,'timeout',owned);if(stopped||probe!==owned||!live())return;
  const before=clock();if(before===null)return;if(before>=deadline){fail();return;}
  let result:PromiseLike<boolean>;
  try{result=revalidate(owned.controller.signal);}catch{fail();return;}
  // Promise assimilation/errors stay generic and cannot create a second probe.
  void Promise.resolve(result).then(allowed=>{
   if(stopped||probe!==owned||!live())return;const settled=clock();if(settled===null)return;
   if(allowed!==true||settled>=owned.deadline){fail();return;}
   // Publish a probe's advisory data only after this exact owner and its
   // original absolute deadline have accepted the authorization result.
   try{onValidated?.();}catch{fail();return;}
   if(stopped||probe!==owned||!live())return;
   cancelTimer();probe=null;finishResume(true);const next=dueAfter(settled,intervalMs);if(next!==null)arm(next,'interval');
  },()=>{if(!stopped&&probe===owned)fail();});
 }
 if(live()){const at=clock();if(at!==null){const deadline=dueAfter(at,intervalMs);if(deadline!==null)arm(deadline,'interval');}}
 return Object.freeze({
  // Only the native covered external-selection boundary uses this pause. No
  // visible deadline is extended; resume requires a fresh bounded server proof.
  pause(){if(stopped)return false;if(paused)return true;paused=true;cancelTimer();const old=probe;probe=null;old?.controller.abort();finishResume(false);return true;},
  resume(signal:AbortSignal):Promise<boolean>{
   if(stopped||signal.aborted)return Promise.resolve(false);
   return new Promise(resolve=>{let done=false;const finish=(allowed:boolean)=>{if(done)return;done=true;resumed.delete(finish);signal.removeEventListener('abort',abort);resolve(allowed&&!signal.aborted);},abort=()=>finish(false);resumed.add(finish);signal.addEventListener('abort',abort,{once:true});paused=false;if(!live()){finish(false);return;}if(!probe){cancelTimer();const at=clock();if(at!==null)startProbe(at);}});
  },dispose(){retire();}
 });
}
