/** Local candidate only: no fetch, SDK, storage, UI or default connection.
 * Ports must implement server authentication/authorization and idempotency.
 * Local time, matching strings and this controller are never server proof. */
export type AccountDeleteSession=Readonly<{subjectId:string;sessionKey:string}>;
export type AccountDeleteContext=Readonly<{subjectId:string;sessionKey:string;intentId:string}>;
export type AccountDeleteProof=AccountDeleteContext&Readonly<{purpose:'account-login-deletion';proofId:string;issuedAt:number;expiresAt:number}>;
export type AccountDeleteCategory='membership-history'|'conversations'|'messages'|'registration-records'|'security-audit'|'storage-objects'|'backups';
export type AccountDeleteBlocker='policy-unresolved'|'management-review'|'foreign-key-dependencies'|'storage-review'|'unavailable';
export type AccountDeletePlan=AccountDeleteContext&Readonly<{status:'ready';planId:string;revision:string;policyVersion:string;expiresAt:number;retainedCategories:readonly AccountDeleteCategory[]}>;
export type AccountDeletePreflight=AccountDeletePlan|Readonly<{status:'blocked';reasons:readonly AccountDeleteBlocker[]}>;
export type AccountDeleteReceipt=Readonly<{subjectId:string;intentId:string;loginRemoved:true;policyVersion:string}>;
type Stage='idle'|'captured'|'reauthenticating'|'preflighting'|'awaiting-confirmation'|'committing'|'login-removed'|'blocked'|'failed'|'cancelled'|'uncertain';
type View=Readonly<{stage:Stage;subjectId:string|null;plan:Readonly<{planId:string;revision:string;policyVersion:string;retainedCategories:readonly AccountDeleteCategory[]}>|null;blockers:readonly AccountDeleteBlocker[]}>;
export const ACCOUNT_DELETE_DECLARATION='EXCLUIR MINHA CONTA';
export type AccountDeleteConfirmation=Readonly<{phrase:string;planId:string;revision:string;policyVersion:string;acknowledgeRetainedRecords:true}>;
export type AccountDeletePorts=Readonly<{
 session:Readonly<{current:()=>AccountDeleteSession|null;subscribe:(listener:()=>void)=>()=>void}>;
 reauthenticate:(context:AccountDeleteContext,password:string,signal:AbortSignal)=>Promise<AccountDeleteProof>;
 preflight:(context:AccountDeleteContext,proof:AccountDeleteProof,signal:AbortSignal)=>Promise<AccountDeletePreflight>;
 commit:(context:AccountDeleteContext,proof:AccountDeleteProof,plan:AccountDeletePlan,signal:AbortSignal)=>Promise<AccountDeleteReceipt>;
 createId:()=>string;now:()=>number;schedule:(fn:()=>void,ms:number)=>()=>void;timeoutMs:number;freshnessMs:number;
}>;
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const tag=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,120}$/.test(v);
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const categories=new Set<AccountDeleteCategory>(['membership-history','conversations','messages','registration-records','security-audit','storage-objects','backups']);
const blockers=new Set<AccountDeleteBlocker>(['policy-unresolved','management-review','foreign-key-dependencies','storage-review','unavailable']);
const unavailable=()=>Error('Account deletion intent unavailable');

/** One attempt per instance. An uncertain final dispatch cannot be retried by
 * starting another intent on this controller. A future backend must persist
 * operation status across process restarts; this class does not do so. */
export function createAccountDeleteIntent(deps:AccountDeletePorts){
 if(!deps||!deps.session||[deps.session.current,deps.session.subscribe,deps.reauthenticate,deps.preflight,deps.commit,deps.createId,deps.now,deps.schedule].some(fn=>typeof fn!=='function')
  ||!Number.isSafeInteger(deps.timeoutMs)||deps.timeoutMs<1||deps.timeoutMs>60000||!Number.isSafeInteger(deps.freshnessMs)||deps.freshnessMs<1||deps.freshnessMs>300000)throw unavailable();
 let disposed=false,started=false,dispatched=false,captured:AccountDeleteSession|null=null,context:AccountDeleteContext|null=null,proof:AccountDeleteProof|null=null,plan:AccountDeletePlan|null=null,controller:AbortController|null=null;
 let capturedAt=0,lastTime=0;
 const listeners=new Set<()=>void>();
 let view:View=Object.freeze({stage:'idle',subjectId:null,plan:null,blockers:Object.freeze([])});
 function publish(stage:Stage,reasons:readonly AccountDeleteBlocker[]=[],disclosure:View['plan']=null){
  view=Object.freeze({stage,subjectId:context?.subjectId??view.subjectId,plan:disclosure,blockers:Object.freeze([...reasons])});for(const fn of [...listeners])try{fn();}catch{}
 }
 function clear(){proof=null;plan=null;context=null;captured=null;const old=controller;controller=null;old?.abort();}
 function cancel(){if(disposed||['login-removed','uncertain','cancelled'].includes(view.stage))return;const terminal=dispatched?'uncertain':'cancelled';clear();publish(terminal);}
 function sameSession(){try{const current=deps.session.current();return !disposed&&captured!==null&&current===captured&&current.subjectId===context?.subjectId&&current.sessionKey===context?.sessionKey;}catch{return false;}}
 function time(){const n=deps.now();if(!Number.isSafeInteger(n)||n<lastTime)throw unavailable();lastTime=n;return n;}
 function live(signal:AbortSignal){if(!sameSession()||signal.aborted)throw unavailable();}
 function bound(v:AccountDeleteContext){return v.subjectId===context?.subjectId&&v.sessionKey===context?.sessionKey&&v.intentId===context?.intentId;}
 function fresh(){const n=time();return proof!==null&&n>=proof.issuedAt&&n-proof.issuedAt<=deps.freshnessMs&&n<proof.expiresAt&&(!plan||n<plan.expiresAt);}
 function fail(stage:'failed'|'blocked'|'uncertain',reasons:readonly AccountDeleteBlocker[]=[]){clear();publish(stage,reasons);return false;}
 async function bounded<T>(run:(signal:AbortSignal)=>Promise<T>){
  const task=controller;if(!task)throw unavailable();const signal=task.signal;let stop=()=>{},abort=()=>{};
  const interrupted=new Promise<never>((_,reject)=>{abort=()=>reject(unavailable());signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();});
  try{stop=deps.schedule(()=>task.abort(),deps.timeoutMs);live(signal);return await Promise.race([Promise.resolve().then(()=>{live(signal);return run(signal);}),interrupted]);}
  finally{stop();signal.removeEventListener('abort',abort);}
 }
 function begin(){
  if(disposed||started)return false;started=true;
  try{const session=deps.session.current(),intentId=deps.createId();if(!session||!uuid(session.subjectId)||typeof session.sessionKey!=='string'||session.sessionKey.length<1||session.sessionKey.length>8192||!uuid(intentId))return fail('failed');
   captured=session;context=Object.freeze({subjectId:session.subjectId,sessionKey:session.sessionKey,intentId});capturedAt=time();controller=new AbortController();if(!sameSession())return fail('failed');publish('captured');return true;
  }catch{return fail('failed');}
 }
 async function afterReauthentication(pending:Promise<AccountDeleteProof>,ctx:AccountDeleteContext,signal:AbortSignal){
  try{
   const raw=await bounded(()=>pending);live(signal);
   if(!record(raw)||!bound(raw)||raw.purpose!=='account-login-deletion'||!uuid(raw.proofId)||!Number.isSafeInteger(raw.issuedAt)||!Number.isSafeInteger(raw.expiresAt)||raw.issuedAt<capturedAt||raw.expiresAt<=raw.issuedAt)throw unavailable();
   proof=Object.freeze({subjectId:ctx.subjectId,sessionKey:ctx.sessionKey,intentId:ctx.intentId,purpose:'account-login-deletion',proofId:raw.proofId,issuedAt:raw.issuedAt,expiresAt:raw.expiresAt});if(!fresh())throw unavailable();
   publish('preflighting');live(signal);const result=await bounded(s=>deps.preflight(ctx,proof!,s));live(signal);
   if(record(result)&&result.status==='blocked'){
    if(!Array.isArray(result.reasons)||result.reasons.length<1||result.reasons.length>5||!result.reasons.every(r=>blockers.has(r)))throw unavailable();
    return fail('blocked',result.reasons);
   }
   if(!record(result)||result.status!=='ready'||!bound(result)||!uuid(result.planId)||!tag(result.revision)||!tag(result.policyVersion)||!Number.isSafeInteger(result.expiresAt)
    ||!Array.isArray(result.retainedCategories)||result.retainedCategories.length>categories.size||new Set(result.retainedCategories).size!==result.retainedCategories.length||!result.retainedCategories.every(c=>categories.has(c)))throw unavailable();
   plan=Object.freeze({status:'ready',...ctx,planId:result.planId,revision:result.revision,policyVersion:result.policyVersion,expiresAt:result.expiresAt,retainedCategories:Object.freeze([...result.retainedCategories])});if(!fresh())throw unavailable();
   publish('awaiting-confirmation',[],Object.freeze({planId:plan.planId,revision:plan.revision,policyVersion:plan.policyVersion,retainedCategories:plan.retainedCategories}));return true;
  }catch{if(context===ctx&&!disposed)return fail('failed');return false;}
 }
 function reauthenticate(first:string,second:string):Promise<boolean>{
  if(view.stage!=='captured'||!context||!controller||!sameSession())return Promise.resolve(false);
  if(typeof first!=='string'||typeof second!=='string'||first.length<1||first.length>1024||first!==second){first='';second='';return Promise.resolve(false);}
  const ctx=context,signal=controller.signal;publish('reauthenticating');
  let pending:Promise<AccountDeleteProof>;
  try{live(signal);pending=Promise.resolve(deps.reauthenticate(ctx,first,signal));}catch{first='';second='';return Promise.resolve(context===ctx&&!disposed?fail('failed'):false);}
  // No password in controller state, view, retries, preflight or commit. The
  // injected credential port and JS runtime can still retain their own copies.
  first='';second='';void pending.catch(()=>{});return afterReauthentication(pending,ctx,signal);
 }
 async function confirm(declaration:AccountDeleteConfirmation){
  if(view.stage!=='awaiting-confirmation'||!context||!proof||!plan||!controller)return false;
  const ctx=context,p=proof,ready=plan,signal=controller.signal;
  try{
   live(signal);if(!fresh())return fail('failed');
   if(!record(declaration)||declaration.phrase!==ACCOUNT_DELETE_DECLARATION||declaration.acknowledgeRetainedRecords!==true||declaration.planId!==ready.planId||declaration.revision!==ready.revision||declaration.policyVersion!==ready.policyVersion)return false;
   publish('committing');live(signal);if(!fresh())return fail('failed');
   const result=await bounded(s=>{live(s);if(!fresh())throw unavailable();dispatched=true;return deps.commit(ctx,p,ready,s);});live(signal);
   if(!record(result)||result.subjectId!==ctx.subjectId||result.intentId!==ctx.intentId||result.loginRemoved!==true||result.policyVersion!==ready.policyVersion)throw unavailable();
   clear();publish('login-removed');return true;
  }catch{if(context===ctx&&!disposed)return fail(dispatched?'uncertain':'failed');return false;}
 }
 const unsubscribe=deps.session.subscribe(()=>{if(captured&&!sameSession())cancel();});
 return Object.freeze({snapshot:()=>view,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};},begin,reauthenticate,confirm,cancel,
  dispose(){if(disposed)return;cancel();disposed=true;unsubscribe();listeners.clear();}});
}
