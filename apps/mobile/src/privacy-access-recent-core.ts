import {createNativePrivacyBinding,type NativePrivacyPort} from './native-privacy-binding.ts';
import type {AccessRecentControllerPort} from './access-recent-controllers.ts';
type Foreground=Parameters<typeof createNativePrivacyBinding>[0]['foreground'];
export type PrivacyAccessRecentView=Readonly<{revision:number;readyEpoch:number|null}>;

// One presentation/native owner shared by the legacy and reusable compositions.
export function createPrivacyAccessRecentRuntimeCore<A extends AccessRecentControllerPort>(deps:Readonly<{createApp:()=>A;native:NativePrivacyPort;foreground:Foreground;retainDomainWhileBackground?:()=>boolean}>){
  const {createApp,native,foreground}=deps;
  const app=createApp(),readForeground=foreground.current,listenForeground=foreground.subscribe;
  let closed=false,foregroundActive=false,domainSuspended=false,boundaryVersion=0,binding:ReturnType<typeof createNativePrivacyBinding>|null=null;
  let view:PrivacyAccessRecentView=Object.freeze({revision:0,readyEpoch:null});
  const listeners=new Set<()=>void>(),waiters=new Set<()=>void>();
  function publish(epoch:number|null,bump=false){
    if(closed||view.readyEpoch===epoch&&!bump)return;
    view=Object.freeze({revision:view.revision+1,readyEpoch:epoch});for(const listener of [...listeners])try{listener();}catch{}
  }
  function isForeground(){try{return !closed&&foregroundActive&&readForeground.call(foreground)===true;}catch{return false;}}
  function signature():readonly unknown[]{
    // Compare an explicit internal tuple, never serialize entire Auth objects,
    // credentials, drafts, messages or the signature into a public view/log.
    let a=app.auth.snapshot(),lease=a.status==='authenticated'?app.auth.currentLease():null;
    if(app.auth.snapshot()!==a){a=app.auth.snapshot();lease=a.status==='authenticated'?app.auth.currentLease():null;}
    const m=app.members.snapshot(),t=app.recent.snapshot(),e=app.patientEntry.snapshot();
    return[a.status,a.userId,lease?.sessionKey??null,a.companyLoading,a.companyId,m.stage,m.scopeKey,m.managedCompany,m.inboxCompany,
      m.context?.companyId??null,m.context?.conversationId??null,m.context?.kind??null,
      t.route,t.host,e.stage,e.company?.companyId??null,e.busy];
  }
  const same=(a:readonly unknown[],b:readonly unknown[])=>a.length===b.length&&a.every((value,index)=>Object.is(value,b[index]));
  let boundary:readonly unknown[]=[];
  function settled(){
    const a=app.auth.snapshot(),m=app.members.snapshot();
    return a.status!=='authenticating'&&a.status!=='refreshing'&&!a.companyLoading
      &&m.stage!=='paused'&&!m.busy&&!app.registration.snapshot().busy&&app.recent.snapshot().route!=='opening';
  }
  function changed(){
    if(closed)return;
    try{
      const next=signature();
      if(!same(boundary,next)){
        boundary=next;boundaryVersion++;publish(null,true);
        // Presentation-only invalidation. Suspending the domain here would
        // erase the very membership/conversation selection being prepared.
        if(isForeground()&&binding)void binding.refresh();
      }
    }catch{boundaryVersion++;publish(null,true);if(binding)void binding.refresh();}
    for(const wake of [...waiters])wake();
  }
  function waitReady(version:number,signal:AbortSignal):Promise<boolean>{
    return new Promise(resolve=>{
      let finished=false;
      const finish=(result:boolean)=>{if(finished)return;finished=true;waiters.delete(check);signal.removeEventListener('abort',abort);resolve(result);};
      const abort=()=>finish(false);
      const check=()=>{if(closed||signal.aborted||version!==boundaryVersion||!isForeground()){finish(false);return;}try{if(settled())finish(true);}catch{finish(false);}};
      waiters.add(check);signal.addEventListener('abort',abort,{once:true});check();
    });
  }
  function setForeground(active:boolean){
    publish(null);
    const next=active===true;
    foregroundActive=next;
    if(next){app.auth.resume();if(domainSuspended){domainSuspended=false;app.resume();}}
    else{
      // An explicitly owned external picker may retain its original domain
      // beneath the cover. This never changes real foreground/native checks.
      // Hold changes also call this method: false→false must suspend on expiry.
      let retain=false;try{retain=deps.retainDomainWhileBackground?.()===true;}catch{}
      if(!retain&&!domainSuspended){domainSuspended=true;app.suspend();}
    }
    changed();
  }
  try{foregroundActive=readForeground.call(foreground)===true;}catch{}
  if(foregroundActive){app.auth.resume();app.resume();}else{domainSuspended=true;app.suspend();}
  boundary=signature();
  const unsubscribers=[app.auth.subscribe(changed),app.members.subscribe(changed),app.recent.subscribe(changed),app.registration.subscribe(changed),app.patientEntry.subscribe(changed)];
  binding=createNativePrivacyBinding({native,foreground:{current:isForeground,subscribe:listener=>listenForeground.call(foreground,active=>{
    if(closed)return;setForeground(active);listener(active===true);
  })},suspendPrivate:()=>publish(null),resumePrivate:async(epoch,signal)=>{
    const version=boundaryVersion;
    if(!await waitReady(version,signal))return false;
    await Promise.resolve(); // Allow synchronous domain subscriptions to finish.
    if(closed||signal.aborted||version!==boundaryVersion||!isForeground()||!same(boundary,signature())||!settled())return false;
    publish(epoch,true);return !closed&&!signal.aborted&&version===boundaryVersion&&isForeground();
  }});
  const result=binding;
  return Object.freeze({app,binding:result,snapshot:()=>view,
    subscribe(listener:()=>void){if(closed)return()=>{};listeners.add(listener);return()=>{listeners.delete(listener);};},
    dispose(){if(closed)return;closed=true;view=Object.freeze({revision:view.revision+1,readyEpoch:null});for(const unsubscribe of unsubscribers)unsubscribe();result.close();for(const wake of [...waiters])wake();app.dispose();listeners.clear();},
  });
}
