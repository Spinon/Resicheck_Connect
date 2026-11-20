export type NativePrivacyState=Readonly<{epoch:number;covered:boolean}>;
export type NativePrivacyPort=Readonly<{cover:()=>Promise<NativePrivacyState>;getState:()=>Promise<NativePrivacyState>;release:(epoch:number)=>Promise<boolean>;invalidate:(epoch:number)=>Promise<boolean>}>;
export type NativePrivacyBindingView=Readonly<{stage:'covered'|'preparing'|'visible'|'blocked'|'closed';epoch:number|null}>;
type ForegroundPort=Readonly<{current:()=>boolean;subscribe:(listener:(active:boolean)=>void)=>()=>void}>;
const unavailable=()=>new Error('Privacy unavailable');
function nativeState(raw:unknown):NativePrivacyState{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw unavailable();
  const keys=Reflect.ownKeys(raw);if(keys.length!==2||!keys.every(key=>key==='epoch'||key==='covered'))throw unavailable();
  const {epoch,covered}=raw as NativePrivacyState;
  if(!Number.isSafeInteger(epoch)||epoch<0||typeof covered!=='boolean')throw unavailable();return Object.freeze({epoch,covered});
}

// The native release must atomically verify foreground + window focus + epoch.
// JS cannot enforce that boundary. resumePrivate prepares current content under
// the cover, renders nativeID connect-private-ready-<epoch> only when ready, and
// must honor AbortSignal before committing any asynchronous UI. Native release
// must also observe that current marker, rather than trusting this Promise alone.
// No identity, business state, credentials or diagnostics cross this bridge.
// JS-initiated cover/close is an asynchronous bridge request, not a guarantee
// about the first native frame. Lifecycle coverage must remain synchronous native.
// Native epochs must not be reused across Activity generations. cover returns
// its acquired epoch, not the possibly newer epoch at Promise delivery time.
export function createNativePrivacyBinding(options:Readonly<{native:NativePrivacyPort;foreground:ForegroundPort;suspendPrivate:()=>void;resumePrivate:(epoch:number,signal:AbortSignal)=>Promise<boolean>}>){
  let cover:()=>Promise<NativePrivacyState>,getState:()=>Promise<NativePrivacyState>,release:(epoch:number)=>Promise<boolean>,invalidate:(epoch:number)=>Promise<boolean>,current:()=>boolean,subscribe:ForegroundPort['subscribe'],suspendPrivate:()=>void,resumePrivate:(epoch:number,signal:AbortSignal)=>Promise<boolean>;
  try{
    const {native,foreground,suspendPrivate:suspend,resumePrivate:resume}=options;
    const {cover:shield,getState:get,release:uncover,invalidate:cancel}=native,{current:read,subscribe:listen}=foreground;
    if([shield,get,uncover,cancel,read,listen,suspend,resume].some(value=>typeof value!=='function'))throw unavailable();
    cover=()=>shield.call(native);getState=()=>get.call(native);release=epoch=>uncover.call(native,epoch);invalidate=epoch=>cancel.call(native,epoch);current=()=>read.call(foreground);subscribe=listener=>listen.call(foreground,listener);suspendPrivate=suspend;resumePrivate=resume;
  }catch{throw unavailable();}
  let closed=false,subscribed=false,generation=0,job:AbortController|null=null,unsubscribe=()=>{};
  type Ownership={epoch:number|null;retired:boolean;invalidationSent:boolean};
  let ownership:Ownership|null=null;
  let retryTimer:ReturnType<typeof setTimeout>|null=null;
  let view:NativePrivacyBindingView=Object.freeze({stage:'covered',epoch:null});const listeners=new Set<()=>void>();
  function publish(stage:NativePrivacyBindingView['stage'],epoch:number|null=null){
    view=Object.freeze({stage,epoch});for(const listener of [...listeners])try{listener();}catch{/* Never expose private diagnostics. */}
  }
  function retire(owner:Ownership|null){
    if(!owner)return;owner.retired=true;
    if(ownership===owner)ownership=null;
    if(owner.epoch!==null&&!owner.invalidationSent){
      owner.invalidationSent=true;
      try{void Promise.resolve(invalidate(owner.epoch)).catch(()=>{});}catch{/* CAS best effort; never cover another owner. */}
    }
  }
  function suspend(stage:NativePrivacyBindingView['stage']='covered'){
    if(retryTimer!==null){clearTimeout(retryTimer);retryTimer=null;}
    const version=++generation,previous=job,previousOwner=ownership;job=null;previous?.abort();
    retire(previousOwner);
    try{suspendPrivate();}catch{if(stage!=='closed')stage='blocked';}
    if(version===generation)publish(stage);return version;
  }
  const matches=(version:number,task:AbortController)=>!closed&&generation===version&&job===task&&!task.signal.aborted;
  function active(){try{if(closed||!subscribed)return false;const value=current();return !closed&&subscribed&&value===true;}catch{return false;}}
  function check(version:number,task:AbortController){if(!matches(version,task))return false;if(!active()){suspend();return false;}return matches(version,task);}
  async function refresh(retries=2):Promise<boolean>{
    if(closed)return false;
    const version=suspend();if(closed||generation!==version||view.stage==='blocked'||!active())return false;
    const task=new AbortController(),owner:Ownership={epoch:null,retired:false,invalidationSent:false};job=task;ownership=owner;publish('preparing');
    try{
      if(!check(version,task))return false;
      const shield=nativeState(await cover());if(!shield.covered)throw unavailable();
      // Even if this acquisition resolves after close/supersession, clean up
      // only its own returned epoch. Never overwrite a newer owner's binding.
      owner.epoch=shield.epoch;
      if(owner.retired||!check(version,task)){retire(owner);return false;}
      const first=nativeState(await getState());if(!check(version,task))return false;
      if(!first.covered||first.epoch!==shield.epoch)throw unavailable();
      const ready=await resumePrivate(first.epoch,task.signal);if(!check(version,task))return false;
      if(ready!==true)throw unavailable();
      const second=nativeState(await getState());if(!check(version,task))return false;
      if(!second.covered||second.epoch!==first.epoch)throw unavailable();
      const released=await release(first.epoch);if(!check(version,task))return false;
      if(released!==true)throw unavailable();publish('visible',first.epoch);
      return check(version,task)&&view.stage==='visible';
    }catch{
      if(matches(version,task)){
        const blocked=suspend('blocked');
        // A native focus/epoch transition or a slow layout may reject one
        // handshake. Retry readiness under a NEW cover, never release by time.
        if(retries>0&&active())retryTimer=setTimeout(()=>{retryTimer=null;if(!closed&&generation===blocked&&active())void refresh(retries-1);},300);
      }
      return false;
    }
    finally{if(!matches(version,task)||view.stage!=='visible')retire(owner);if(job===task)job=null;}
  }
  function onForeground(value:boolean){
    if(closed)return;
    if(value!==true){suspend();return;}
    // A new foreground/focus notification may follow a native-only epoch loss
    // even when JS missed the background event. Always establish a fresh cover.
    void refresh();
  }
  // Suspend before subscribing or invoking native methods, including startup.
  suspend();
  try{
    const stop=subscribe(onForeground);if(typeof stop!=='function')throw unavailable();
    unsubscribe=stop;subscribed=true;
    if(!closed&&active())void refresh();
  }catch{subscribed=false;suspend('blocked');}
  return Object.freeze({
    snapshot:()=>view,
    subscribe(listener:()=>void){if(closed)return()=>{};listeners.add(listener);return()=>{listeners.delete(listener);};},
    refresh:()=>refresh(),
    close(){if(closed)return;closed=true;subscribed=false;try{unsubscribe();}catch{}suspend('closed');listeners.clear();},
  });
}
