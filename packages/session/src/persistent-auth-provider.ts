import type {AuthSession} from './auth-controller.ts';
import type {createSupabaseAuthProvider} from './supabase-auth-provider.ts';

export type SecureSessionRecord=Readonly<{schemaVersion:1;projectRef:'ibdlvlwdzmsrbqadrudb';userId:string;refreshToken:string}>;
export type SecureSessionClaim=Readonly<{epoch:number;record:SecureSessionRecord|null}>;
/** Native implementation must serialize atomic committed CAS operations.
 * claim increments epoch; clear deletes ciphertext/key and increments epoch.
 * This port never receives password, email, access JWT or clinical context. */
export type SecureSessionStore=Readonly<{claim:()=>Promise<SecureSessionClaim>;save:(epoch:number,record:SecureSessionRecord)=>Promise<boolean>;clear:(epoch:number)=>Promise<boolean>}>;
type Base=ReturnType<typeof createSupabaseAuthProvider>;
const unavailable=()=>Object.freeze({code:'auth_unavailable'});
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,keys:readonly string[])=>Reflect.ownKeys(v).length===keys.length&&Reflect.ownKeys(v).every(k=>typeof k==='string'&&keys.includes(k));
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const epoch=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
const wellFormed=(v:string)=>{for(let i=0;i<v.length;i++){const unit=v.charCodeAt(i);if(unit>=0xd800&&unit<=0xdbff){const low=v.charCodeAt(++i);if(!(low>=0xdc00&&low<=0xdfff))return false;}else if(unit>=0xdc00&&unit<=0xdfff)return false;}return true;};
const opaque=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=8192&&!/[\u0000-\u0020\u007f-\u009f\s]/u.test(v)&&!v.startsWith('sb_')&&!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(v)&&wellFormed(v)&&new TextEncoder().encode(v).byteLength<=8192;
export function secureSessionRecord(raw:unknown):SecureSessionRecord{
 try{if(!object(raw)||!exact(raw,['schemaVersion','projectRef','userId','refreshToken']))throw unavailable();const {schemaVersion,projectRef,userId,refreshToken}=raw;
  if(schemaVersion!==1||projectRef!=='ibdlvlwdzmsrbqadrudb'||!uuid(userId)||!opaque(refreshToken))throw unavailable();
  return Object.freeze({schemaVersion,projectRef,userId,refreshToken});
 }catch{throw unavailable();}
}
function claimValue(raw:unknown):SecureSessionClaim{
 if(!object(raw)||!exact(raw,['epoch','record']))throw unavailable();const {epoch:value,record}=raw;
 if(!epoch(value))throw unavailable();return Object.freeze({epoch:value,record:record===null?null:secureSessionRecord(record)});
}

/** Owns one committed native generation. Explicit recovery never reclaims a
 * newer owner. A rotated refresh awaiting storage remains private RAM and is
 * committed before another refresh; no password or access JWT reaches storage. */
export function createPersistentAuthProvider(options:Readonly<{base:Base;store:SecureSessionStore;now:()=>number}>){
 const {base,store,now}=options;
 if(!base||!store||[base.signIn,base.refresh,base.revoke,base.signUp,base.dispose,store.claim,store.save,store.clear,now].some(fn=>typeof fn!=='function'))throw unavailable();
 const claimMethod=store.claim,saveMethod=store.save,clearMethod=store.clear;
 const claimPort=()=>claimMethod.call(store),savePort=(e:number,r:SecureSessionRecord)=>saveMethod.call(store,e,r),clearPort=(e:number)=>clearMethod.call(store,e);
 const baseFailures=new WeakSet<object>(),safeBaseCodes=new Set(['invalid_credentials','email_not_confirmed','otp_expired','over_request_rate_limit','over_email_send_rate_limit','weak_password','session_expired','session_not_found','refresh_token_not_found','refresh_token_already_used']);
 const terminalBaseCodes=new Set(['invalid_credentials','email_not_confirmed','otp_expired','weak_password','session_expired','session_not_found']);
 async function fromBase<T>(invoke:()=>PromiseLike<T>):Promise<T>{
  try{return await invoke();}catch(error){
   let code='auth_unavailable';try{const candidate=object(error)?error.code:null;if(typeof candidate==='string'&&safeBaseCodes.has(candidate))code=candidate;}catch{}
   // Only admitted errors from the trusted base invocation receive this brand.
   // Refresh denial details stay private; the controller receives existing copy.
   if(code==='refresh_token_not_found'||code==='refresh_token_already_used')code='session_expired';
   const projected=Object.freeze({code});baseFailures.add(projected);throw projected;
  }
 }
 type Task={controller:AbortController;stop:()=>void;interrupted:Promise<never>};
 type PendingCommit=Readonly<{epoch:number;record:SecureSessionRecord;fresh:AuthSession}>;
 let disposed=false,restoreAllowed=true,recoveryAllowed=false,current:Task|null=null,ownedEpoch:number|null=null,record:SecureSessionRecord|null=null,lastClaim:Promise<SecureSessionClaim>|null=null,forgetting:Promise<boolean>|null=null;
 let pendingCommit:PendingCommit|null=null,restoreFlight:Promise<AuthSession|null>|null=null;
 const jobs=new Set<Task>(),recoveryListeners=new Set<()=>void>();
 function notifyRecovery(){for(const listener of [...recoveryListeners])try{listener();}catch{}}
 function discardRecovery(){recoveryAllowed=false;record=null;pendingCommit=null;}
 function live(task:Task){if(disposed||current!==task||task.controller.signal.aborted)throw unavailable();}
 function cancel(){const task=current;current=null;task?.stop();}
 async function run<T>(signal:AbortSignal,work:(task:Task)=>Promise<T>):Promise<T>{
  if(disposed||signal.aborted||jobs.size>=4)throw unavailable();cancel();forgetting=null;
  const controller=new AbortController();let reject!:(reason:unknown)=>void;
  const interrupted=new Promise<never>((_,r)=>{reject=r;});void interrupted.catch(()=>{});
  const task:Task={controller,interrupted,stop:()=>{controller.abort();reject(unavailable());}};current=task;jobs.add(task);signal.addEventListener('abort',task.stop,{once:true});
  const operation=Promise.resolve().then(()=>{live(task);return work(task);}).catch(error=>{throw object(error)&&baseFailures.has(error)?error:unavailable();}).finally(()=>{jobs.delete(task);signal.removeEventListener('abort',task.stop);if(current===task)current=null;notifyRecovery();});
  return Promise.race([operation,interrupted]);
 }
 async function claim(task:Task){live(task);const pending=Promise.resolve(claimPort()).then(claimValue);lastClaim=pending;void pending.catch(()=>{});const value=await pending;live(task);ownedEpoch=value.epoch;return value;}
 function session(raw:unknown,expectedUser?:string):AuthSession{
  if(!object(raw))throw unavailable();const {userId,accessToken,refreshToken,expiresAt}=raw,time=now();
  if(!uuid(userId)||expectedUser!==undefined&&userId!==expectedUser||typeof accessToken!=='string'||!/^[A-Za-z0-9_.-]{1,8192}$/.test(accessToken)||accessToken.startsWith('sb_')||!opaque(refreshToken)||!Number.isSafeInteger(time)||time<0||!Number.isSafeInteger(expiresAt)||typeof expiresAt!=='number'||expiresAt<=time||expiresAt-time>86400000)throw unavailable();
  return Object.freeze({userId,accessToken,refreshToken,expiresAt});
 }
 function unexpired(fresh:AuthSession){const time=now();if(!Number.isSafeInteger(time)||time<0)throw unavailable();return time<fresh.expiresAt;}
 function canRestore(){return !disposed&&current===null&&jobs.size===0&&recoveryAllowed&&ownedEpoch!==null&&record!==null;}
 async function commit(task:Task,value:PendingCommit){
  live(task);
  if(pendingCommit!==value||ownedEpoch!==value.epoch||!record||record.userId!==value.record.userId){discardRecovery();throw unavailable();}
  // A thrown storage error retains this exact rotation for explicit CAS-only
  // retry. Native process-blocked storage keeps throwing; never imply success.
  const saved=await savePort(value.epoch,value.record);live(task);
  if(saved!==true){discardRecovery();throw unavailable();}
  record=value.record;pendingCommit=null;recoveryAllowed=true;return value.fresh;
 }
 async function persist(task:Task,fresh:AuthSession,e:number){
  live(task);const projected=secureSessionRecord({schemaVersion:1,projectRef:'ibdlvlwdzmsrbqadrudb',userId:fresh.userId,refreshToken:fresh.refreshToken});
  if(ownedEpoch!==e||record!==null&&record.userId!==fresh.userId){discardRecovery();throw unavailable();}
  // signIn starts with an empty committed owner; only a verified fresh response
  // can establish its candidate. No signIn request is ever replayed for retry.
  if(record===null)record=projected;
  const pending=Object.freeze({epoch:e,record:projected,fresh});pendingCommit=pending;recoveryAllowed=true;
  return commit(task,pending);
 }
 async function recover(task:Task):Promise<AuthSession>{
  live(task);const e=ownedEpoch;
  if(!recoveryAllowed||e===null||record===null)throw unavailable();
  if(pendingCommit){
   const fresh=await commit(task,pendingCommit);live(task);
   if(unexpired(fresh))return fresh;
   // Persist the rotated refresh first even if its access JWT expired while
   // storage was unavailable. Then refresh that committed token, never its parent.
  }
  const captured=record;if(!captured||ownedEpoch!==e)throw unavailable();
  let fresh:AuthSession;
  try{fresh=session(await fromBase(()=>base.refresh(captured.refreshToken,task.controller.signal)),captured.userId);}
  catch(error){
   live(task);
   if(!object(error)||!baseFailures.has(error)||terminalBaseCodes.has(String(error.code)))discardRecovery();
   throw error;
  }
  live(task);const committed=await persist(task,fresh,e);live(task);
  if(!unexpired(committed))throw unavailable();
  return committed;
 }
 return Object.freeze({
  signUp:base.signUp,
  canRestore,
  subscribeRecovery:(listener:()=>void)=>{if(disposed)return()=>{};recoveryListeners.add(listener);return()=>{recoveryListeners.delete(listener);};},
  signIn:(input:Parameters<Base['signIn']>[0],signal:AbortSignal)=>{
   restoreAllowed=false;discardRecovery();restoreFlight=null;
   return run(signal,async task=>{
    const first=await claim(task);live(task);
    if(await clearPort(first.epoch)!==true)throw unavailable();live(task);ownedEpoch=null;
    const next=await claim(task);if(next.record!==null)throw unavailable();live(task);
    const fresh=session(await fromBase(()=>base.signIn(input,task.controller.signal)));live(task);return persist(task,fresh,next.epoch);
   });
  },
  refresh:(token:string,signal:AbortSignal)=>{
   const captured=record,e=ownedEpoch;
   return run(signal,async task=>{if(!captured||e===null||token!==captured.refreshToken||record!==captured||ownedEpoch!==e)throw unavailable();return recover(task);});
  },
  restore:(signal:AbortSignal):Promise<AuthSession|null>=>{
   if(disposed||signal.aborted)return Promise.reject(unavailable());
   // Joining callers never cancel/restart the owner request or add refreshes.
   if(restoreFlight)return restoreFlight;
   if(!restoreAllowed&&!canRestore())return Promise.resolve(null);
   const initial=restoreAllowed;restoreAllowed=false;
   const work=run(signal,async task=>{
    if(initial){
     discardRecovery();const saved=await claim(task);if(saved.record===null)return null;
     // Retain the captured subject/generation BEFORE network. Failure cannot
     // turn this owner into a global claimant or a clean empty installation.
     record=saved.record;recoveryAllowed=true;
    }
    return recover(task);
   });
   const shared=work.finally(()=>{if(restoreFlight===shared)restoreFlight=null;});restoreFlight=shared;return shared;
  },
  // Called synchronously BEFORE Auth reset publishes to reentrant observers.
  // Use only captured ownership; never claim globally from revoke(oldSession).
  forget:(_signal:AbortSignal):Promise<boolean>=>{
   restoreAllowed=false;if(disposed)return Promise.resolve(false);if(forgetting&&current===null&&ownedEpoch===null&&lastClaim===null)return forgetting;
   const e=ownedEpoch,pending=lastClaim;discardRecovery();restoreFlight=null;cancel();ownedEpoch=null;lastClaim=null;
   let operation:Promise<boolean>;
   try{operation=e!==null?Promise.resolve(clearPort(e)):pending?pending.then(value=>clearPort(value.epoch)):Promise.resolve(claimPort()).then(claimValue).then(value=>clearPort(value.epoch));}
   catch{operation=Promise.reject(unavailable());}
   forgetting=operation.then(value=>value===true,()=>{throw unavailable();});void forgetting.catch(()=>{});return forgetting;
  },
  revoke:(captured:AuthSession,signal:AbortSignal)=>base.revoke(captured,signal),
  dispose(){if(disposed)return;disposed=true;current=null;discardRecovery();restoreFlight=null;ownedEpoch=null;lastClaim=null;for(const job of [...jobs])job.stop();recoveryListeners.clear();base.dispose();},
 });
}
