import {createNativePrivacyBinding,type NativePrivacyPort} from './native-privacy-binding.ts';
import type {createDemoSession} from './demo-session.ts';
type Session=ReturnType<typeof createDemoSession>;
type Foreground=Parameters<typeof createNativePrivacyBinding>[0]['foreground'];
export type PrivacyDemoView=Readonly<{revision:number;prepareEpoch:number|null;readyEpoch:number|null}>;

// Presentation-only coordinator. Keeps the demo/media owners mounted across
// native picker blur/focus; never dispatches logout or clears domain capabilities.
export function createPrivacyDemoRuntime(deps:Readonly<{session:Session;native:NativePrivacyPort;foreground:Foreground}>){
  const {session,native,foreground}=deps,current=foreground.current,listen=foreground.subscribe;
  let closed=false,version=0,binding:ReturnType<typeof createNativePrivacyBinding>|null=null;
  let view:PrivacyDemoView=Object.freeze({revision:0,prepareEpoch:null,readyEpoch:null});
  const listeners=new Set<()=>void>();
  type Waiter={epoch:number;version:number;signal:AbortSignal;finish:(ready:boolean)=>void};
  let pending:Waiter|null=null;
  function foregroundNow(){try{return !closed&&current.call(foreground)===true;}catch{return false;}}
  function signature():readonly unknown[]{
    const s=session.getSnapshot(),a=s.actor;
    const capability=s.activeConversationId?session.captureConversationContext(s.activeConversationId)?.token:null;
    // Opaque in-memory comparison only: no message/draft/body serialization,
    // no identifiers or capability exposed through the public privacy view.
    return[a?.id??null,a?.role??null,a?.companyId??null,a?.approved??null,s.companyId,s.activeConversationId,capability??null];
  }
  const same=(a:readonly unknown[],b:readonly unknown[])=>a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
  let boundary=signature();
  function publish(prepareEpoch:number|null,readyEpoch:number|null,bump=false){
    if(closed||!bump&&view.prepareEpoch===prepareEpoch&&view.readyEpoch===readyEpoch)return;
    view=Object.freeze({revision:view.revision+1,prepareEpoch,readyEpoch});
    for(const f of [...listeners])try{f();}catch{/* No observer diagnostics cross the privacy boundary. */}
  }
  function suspend(){pending?.finish(false);publish(null,null);}
  function contextChanged(){
    if(closed)return;
    try{const next=signature();if(same(boundary,next))return;boundary=next;}catch{/* Fail closed if the context cannot be read. */}
    version++;pending?.finish(false);publish(null,null,true);
    if(binding&&foregroundNow())void binding.refresh();
  }
  const unsubscribe=session.subscribe(contextChanged);
  binding=createNativePrivacyBinding({native,foreground:{current:foregroundNow,subscribe:listener=>listen.call(foreground,value=>{
    if(closed)return;if(value!==true)suspend();listener(value===true);
  })},suspendPrivate:suspend,resumePrivate:(epoch,signal)=>new Promise<boolean>(resolve=>{
    pending?.finish(false);
    if(closed||signal.aborted||!foregroundNow()){resolve(false);return;}
    let finished=false;
    const waiter:Waiter={epoch,version,signal,finish:ready=>{
      if(finished)return;finished=true;signal.removeEventListener('abort',abort);if(pending===waiter)pending=null;resolve(ready);
    }};
    const abort=()=>waiter.finish(false);
    pending=waiter;signal.addEventListener('abort',abort,{once:true});
    // Subscriber may synchronously ACK this epoch; install the waiter first.
    publish(epoch,null,true);
    if(closed||signal.aborted||waiter.version!==version||!foregroundNow())waiter.finish(false);
  })});
  const coordinator=binding;
  return Object.freeze({session,binding:coordinator,snapshot:()=>view,
    subscribe(f:()=>void){if(closed)return()=>{};listeners.add(f);return()=>{listeners.delete(f);};},
    confirmPrepared(epoch:number):boolean{
      const waiter=pending;
      if(!Number.isSafeInteger(epoch)||epoch<0||!waiter||waiter.epoch!==epoch||waiter.version!==version||waiter.signal.aborted||!foregroundNow())return false;
      try{if(!same(boundary,signature())){contextChanged();return false;}}catch{suspend();return false;}
      publish(epoch,epoch,true);
      if(closed||waiter.signal.aborted||waiter.version!==version||pending!==waiter||!foregroundNow()){waiter.finish(false);return false;}
      waiter.finish(true);return true;
    },
    dispose(){if(closed)return;closed=true;version++;pending?.finish(false);view=Object.freeze({revision:view.revision+1,prepareEpoch:null,readyEpoch:null});unsubscribe();coordinator.close();listeners.clear();},
  });
}
