import {createNotificationPreferencesAdapter,type NotificationPreferencesRpc,type NotificationPrivacy,type NotificationFilter,type NotificationPreferencesInput} from '../../../packages/chat-client/src/notification-preferences.ts';
import type {AuthView} from '../../../packages/session/src/auth-controller.ts';
type Lease=Readonly<{userId:string;sessionKey:string;notificationPreferences:NotificationPreferencesRpc}>;
type Auth=Readonly<{snapshot:()=>AuthView;currentLease:()=>Lease|null;subscribe:(listener:()=>void)=>()=>void}>;
type Stage='inactive'|'loading'|'ready'|'saving'|'uncertain'|'reload-required'|'unavailable';
export type PersistentNotificationPreferencesView=Readonly<{scopeKey:number;stage:Stage;ready:boolean;busy:boolean;privacy:NotificationPrivacy;filter:NotificationFilter;revision:number|null;stagedPrivacy:NotificationPrivacy;stagedFilter:NotificationFilter;dirty:boolean}>;
const safe={ready:false,privacy:1 as const,filter:null,revision:null,stagedPrivacy:1 as const,stagedFilter:null,dirty:false};
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);

// Candidate RPC host, not OS preferences/push enrollment or a durable store.
// Installation identity is supplied by a separate, still-unimplemented owner.
// No write is inferred from a load, ACK, account/company change or retry timer.
// Safe 1/null while not ready is presentation fallback, not a persisted record
// or notification consent. A future UI must check ready before claiming sync.
export function createPersistentNotificationPreferencesHost(deps:Readonly<{auth:Auth;installationId:string;createOperationId:()=>string;schedule?:(fn:()=>void,ms:number)=>()=>void;timeoutMs?:number}>){
  const {auth,installationId,createOperationId,schedule=(fn,ms)=>{const timer=setTimeout(fn,ms);return()=>clearTimeout(timer);},timeoutMs=5000}=deps;
  if(!uuid(installationId)||typeof createOperationId!=='function'||typeof schedule!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000)throw Error('Notification settings unavailable');
  type Api=ReturnType<typeof createNotificationPreferencesAdapter>;
  let closed=false,generation=0,revisionFloor=0,lease:Lease|null=null,api:Api|null=null,intent:NotificationPreferencesInput|null=null;
  let job:Readonly<{controller:AbortController;finish:()=>void}>|null=null;
  let view:PersistentNotificationPreferencesView=Object.freeze({...safe,scopeKey:0,stage:'inactive',busy:false});const listeners=new Set<()=>void>();
  function publish(patch:Partial<PersistentNotificationPreferencesView>){if(closed)return;view=Object.freeze({...view,...patch});for(const f of [...listeners])try{f();}catch{}}
  function current(){try{const a=auth.snapshot(),next=a.status==='authenticated'?auth.currentLease():null;return auth.snapshot()===a?next:null;}catch{return null;}}
  const live=(version:number,bound:Lease,captured:Api)=>!closed&&generation===version&&lease===bound&&api===captured&&current()===bound;
  function invalidate(){generation++;revisionFloor=0;const old=job;job=null;old?.controller.abort();old?.finish();api?.close();api=null;lease=null;intent=null;}
  function begin(){
    if(job)return null;const controller=new AbortController();let cancelTimer=()=>{},reject!:(error:Error)=>void,done=false;
    const interruption=new Promise<never>((_,r)=>{reject=r;});void interruption.catch(()=>{});
    const abort=()=>{if(!done)reject(Error('Notification settings unavailable'));};controller.signal.addEventListener('abort',abort,{once:true});
    const task={controller,finish:()=>{if(done)return;done=true;try{cancelTimer();}catch{}controller.signal.removeEventListener('abort',abort);},wait:<T>(work:()=>Promise<T>)=>Promise.race([interruption,Promise.resolve().then(()=>{if(controller.signal.aborted)throw Error();return work();})])};
    job=task;try{cancelTimer=schedule(()=>controller.abort(),timeoutMs);}catch{controller.abort();}return task;
  }
  function finish(task:NonNullable<ReturnType<typeof begin>>){task.finish();if(job===task){job=null;publish({busy:false});}}
  function failureStage(){publish({...safe,stage:intent?'uncertain':'reload-required',busy:false,...(intent?{stagedPrivacy:intent.privacy,stagedFilter:intent.filter,dirty:true}:{})});}
  async function load(){
    const bound=lease,captured=api,version=generation;if(!bound||!captured||!live(version,bound,captured))return false;const task=begin();if(!task)return false;
    publish({...safe,stage:'loading',busy:true});
    try{
      const result=await task.wait(()=>captured.load(task.controller.signal));if(!live(version,bound,captured))return false;if(task.controller.signal.aborted){failureStage();return false;}
      if(!result.ok||result.value.revision<revisionFloor){failureStage();return false;}
      revisionFloor=Math.max(revisionFloor,result.value.revision);
      if(intent){failureStage();return false;} // A read cannot prove an unknown operation committed or make this host ready.
      const value=result.value;publish({stage:'ready',ready:true,busy:false,privacy:value.privacy,filter:value.filter,revision:value.revision,stagedPrivacy:value.privacy,stagedFilter:value.filter,dirty:false});return true;
    }catch{if(live(version,bound,captured))failureStage();return false;}finally{finish(task);}
  }
  function sync(){
    if(closed)return;const next=current();if(next===lease&&(next!==null||view.stage==='inactive'))return;
    invalidate();const activation=generation;publish({...safe,scopeKey:view.scopeKey+1,stage:next?'loading':'inactive',busy:!!next});if(!next||closed||generation!==activation||current()!==next)return;
    lease=next;const bound=next,version=generation;
    try{api=createNotificationPreferencesAdapter({userId:bound.userId,sessionKey:bound.sessionKey,installationId,rpc:bound.notificationPreferences,current:()=>!closed&&generation===version&&lease===bound&&current()===bound});void load();}
    catch{api=null;publish({...safe,stage:'unavailable',busy:false});}
  }
  async function submit(retry:boolean){
    sync();const bound=lease,captured=api,version=generation;if(!bound||!captured||!live(version,bound,captured)||job)return false;
    if(retry){if(view.stage!=='uncertain'||!intent)return false;}
    else{
      if(view.stage!=='ready'||!view.ready||!view.dirty||view.revision===null||intent)return false;
      let operationId:string;try{operationId=createOperationId();}catch{return false;}if(!uuid(operationId))return false;
      intent=Object.freeze({operationId,expectedRevision:view.revision,privacy:view.stagedPrivacy,filter:view.stagedFilter});
    }
    const selected=intent!;const task=begin();if(!task)return false;publish({...safe,stage:'saving',busy:true,stagedPrivacy:selected.privacy,stagedFilter:selected.filter,dirty:true});
    try{
      const result=await task.wait(()=>captured.set(selected,task.controller.signal));if(!live(version,bound,captured))return false;if(task.controller.signal.aborted){failureStage();return false;}
      if(!result.ok){if(result.code==='CONFLICT')intent=null;failureStage();return false;}
      if(result.value.operationId!==selected.operationId||result.value.requiresLoad!==true){failureStage();return false;}
      revisionFloor=Math.max(revisionFloor,result.value.acceptedRevision);
      intent=null; // Confirmed original operation; never apply its old ACK as current state.
      finish(task);return live(version,bound,captured)?await load():false;
    }catch{if(live(version,bound,captured))failureStage();return false;}finally{finish(task);}
  }
  const unsubscribe=auth.subscribe(sync);sync();
  function stage(patch:Partial<Pick<PersistentNotificationPreferencesView,'stagedPrivacy'|'stagedFilter'>>){sync();if(closed||view.stage!=='ready'||!view.ready||job||intent||!lease||!api||!live(generation,lease,api))return false;const privacy=patch.stagedPrivacy??view.stagedPrivacy,filter=Object.hasOwn(patch,'stagedFilter')?patch.stagedFilter!:view.stagedFilter;publish({...patch,dirty:privacy!==view.privacy||filter!==view.filter});return true;}
  return Object.freeze({snapshot:()=>view,subscribe:(f:()=>void)=>{if(closed)return()=>{};listeners.add(f);return()=>{listeners.delete(f);};},
    setPrivacy:(value:unknown)=>typeof value==='number'&&Number.isInteger(value)&&value>=1&&value<=4?stage({stagedPrivacy:value as NotificationPrivacy}):false,
    setFilter:(value:unknown)=>value===null||value==='all'||value==='important'?stage({stagedFilter:value}):false,
    save:()=>submit(false),retry:()=>submit(true),reload:()=>{sync();return load();},
    cancel(){if(closed)return false;if(job){const saving=view.stage==='saving';job.controller.abort();if(saving)failureStage();else publish({...safe,stage:'reload-required',busy:false});return true;}if(view.stage!=='ready'||intent)return false;publish({stagedPrivacy:view.privacy,stagedFilter:view.filter,dirty:false});return true;},
    dispose(){if(closed)return;unsubscribe();invalidate();closed=true;view=Object.freeze({...safe,scopeKey:view.scopeKey+1,stage:'inactive',busy:false});listeners.clear();},
  });
}
