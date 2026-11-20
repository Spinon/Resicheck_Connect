import {createNativePrivacyBinding,type NativePrivacyPort} from './native-privacy-binding.ts';
import {createSyntheticAccessChatJourney} from '../previews/synthetic-access-chat-journey.ts';
type Foreground=Parameters<typeof createNativePrivacyBinding>[0]['foreground'];
type App=ReturnType<typeof createSyntheticAccessChatJourney>;
export type PrivacyAccessJourneyView=Readonly<{revision:number;readyEpoch:number|null}>;

// Opt-in synthetic composition only. No real Auth, HTTP, storage or verification.
export function createPrivacyAccessJourneyRuntime(deps:Readonly<{json:(value:unknown,status?:number)=>Response;createId:()=>string;native:NativePrivacyPort;foreground:Foreground;createApp?:typeof createSyntheticAccessChatJourney}>){
  const {json,createId,native,foreground,createApp=createSyntheticAccessChatJourney}=deps;
  const app:App=createApp(json,createId),readForeground=foreground.current,listenForeground=foreground.subscribe;
  let closed=false,foregroundActive=false,boundaryVersion=0,binding:ReturnType<typeof createNativePrivacyBinding>|null=null;
  let view:PrivacyAccessJourneyView=Object.freeze({revision:0,readyEpoch:null});
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
    const m=app.members.snapshot(),t=app.text.snapshot();
    return[a.status,a.userId,lease?.sessionKey??null,a.companyLoading,a.companyId,m.stage,m.scopeKey,m.managedCompany,m.inboxCompany,
      m.context?.companyId??null,m.context?.conversationId??null,m.context?.kind??null,
      t.route,t.company?.id??null,t.company?.conversationId??null];
  }
  const same=(a:readonly unknown[],b:readonly unknown[])=>a.length===b.length&&a.every((value,index)=>Object.is(value,b[index]));
  let boundary:readonly unknown[]=[];
  function settled(){
    const a=app.auth.snapshot(),m=app.members.snapshot();
    return a.status!=='authenticating'&&a.status!=='refreshing'&&!a.companyLoading
      &&m.stage!=='paused'&&!m.busy&&!app.registration.snapshot().busy&&!app.text.snapshot().busy;
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
    if(next!==foregroundActive){
      foregroundActive=next;
      if(next){app.auth.resume();app.resume();}else app.suspend();
    }else if(next)app.auth.resume();
    changed();
  }
  try{foregroundActive=readForeground.call(foreground)===true;}catch{}
  if(foregroundActive){app.auth.resume();app.resume();}else app.suspend();
  boundary=signature();
  const unsubscribers=[app.auth.subscribe(changed),app.members.subscribe(changed),app.text.subscribe(changed),app.registration.subscribe(changed)];
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
