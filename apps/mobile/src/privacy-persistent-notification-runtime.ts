import {createNativePrivacyBinding,type NativePrivacyPort} from './native-privacy-binding.ts';
import {createSyntheticStreamNotificationRuntime as createSyntheticPersistentNotificationRuntime} from '../previews/synthetic-stream-notification-runtime.ts';

type Foreground=Parameters<typeof createNativePrivacyBinding>[0]['foreground'];

// Separate opt-in fixture composition. No durable installation identity, real
// HTTP, push enrollment or change to the existing preferences host is implied.
export function createPrivacyPersistentNotificationRuntime(deps:Readonly<{json:(value:unknown,status?:number)=>Response;createId:()=>string;native:NativePrivacyPort;foreground:Foreground;createApp?:typeof createSyntheticPersistentNotificationRuntime}>){
 const {json,createId,native,foreground,createApp=createSyntheticPersistentNotificationRuntime}=deps;
 const app=createApp(json,createId),listeners=new Set<()=>void>(),waiters=new Set<()=>void>();
 let closed=false,active=false,version=0,reloadGeneration=0,reloadedGeneration=0;
 let binding:ReturnType<typeof createNativePrivacyBinding>|null=null;
 let view:Readonly<{revision:number;readyEpoch:number|null}>=Object.freeze({revision:0,readyEpoch:null});
 const publish=(readyEpoch:number|null)=>{if(closed||view.readyEpoch===readyEpoch)return;view=Object.freeze({revision:view.revision+1,readyEpoch});for(const f of [...listeners])try{f();}catch{}};
 const isForeground=()=>{try{return !closed&&active&&foreground.current()===true;}catch{return false;}};
 function signature():readonly unknown[]{
  const auth=app.auth.snapshot(),lease=auth.status==='authenticated'?app.auth.currentLease():null;
  if(app.auth.snapshot()!==auth)throw Error('Preferences unavailable');
  return[auth.status,auth.userId,lease,auth.companyLoading,app.preferences.snapshot().scopeKey];
 }
 const same=(a:readonly unknown[],b:readonly unknown[])=>a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
 let boundary:readonly unknown[]=[];
 function settled(){const a=app.auth.snapshot(),p=app.preferences.snapshot();return !['authenticating','refreshing'].includes(a.status)&&!a.companyLoading&&!p.busy&&!['loading','saving'].includes(p.stage);}
 function changed(){
  if(closed)return;
  try{const next=signature();if(!same(boundary,next)){boundary=next;version++;publish(null);if(isForeground()&&binding)void binding.refresh();}}
  catch{version++;publish(null);if(binding)void binding.refresh();}
  for(const wake of [...waiters])wake();
 }
 function waitReady(captured:number,signal:AbortSignal):Promise<boolean>{return new Promise(resolve=>{
  let done=false;
  const finish=(ok:boolean)=>{if(done)return;done=true;waiters.delete(check);signal.removeEventListener('abort',abort);resolve(ok);};
  const abort=()=>finish(false);
  const check=()=>{if(closed||signal.aborted||version!==captured||!isForeground()){finish(false);return;}try{if(settled())finish(true);}catch{finish(false);}};
  waiters.add(check);signal.addEventListener('abort',abort,{once:true});check();
 });}
 function event(value:boolean){
  publish(null);const rising=value===true&&!active;active=value===true;
  if(!active)app.preferences.cancel();
  else{if(rising)reloadGeneration++;app.auth.resume();}
  changed();
 }
 try{active=foreground.current()===true;}catch{}
 if(active)app.auth.resume();else app.preferences.cancel();
 boundary=signature();
 const stop=[app.auth.subscribe(changed),app.preferences.subscribe(changed)];
 binding=createNativePrivacyBinding({native,foreground:{current:isForeground,subscribe:listener=>foreground.subscribe(value=>{if(closed)return;event(value);listener(value===true);})},
  suspendPrivate:()=>publish(null),resumePrivate:async(epoch,signal)=>{
   const captured=version,wanted=reloadGeneration;
   if(!await waitReady(captured,signal))return false;
   if(wanted>reloadedGeneration){
    // A committed-but-unconfirmed write keeps its original retry intent. A
    // background return never retries a write or turns a read into its ACK.
    if(app.preferences.snapshot().stage==='ready')await app.preferences.reload();
    if(closed||signal.aborted||captured!==version||!isForeground()||!same(boundary,signature()))return false;
    reloadedGeneration=wanted;
   }
   await Promise.resolve();
   if(closed||signal.aborted||captured!==version||!isForeground()||!settled()||!same(boundary,signature()))return false;
   publish(epoch);return !closed&&!signal.aborted&&captured===version&&isForeground();
  },
 });
 const gate=binding;
 return Object.freeze({app,binding:gate,snapshot:()=>view,subscribe:(f:()=>void)=>{if(closed)return()=>{};listeners.add(f);return()=>{listeners.delete(f);};},
  dispose(){if(closed)return;closed=true;view=Object.freeze({revision:view.revision+1,readyEpoch:null});for(const f of stop)f();gate.close();for(const wake of [...waiters])wake();void app.dispose().catch(()=>{});listeners.clear();},
 });
}
