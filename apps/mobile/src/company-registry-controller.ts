import{createRegistryProgressWatch}from './company-registry-progress.ts';
import {decodeCompanyRegistryProjection,decodeCompanyRegistryFinalization,type CompanyRegistryRpc,type CompanyRegistryCommand,type CompanyRegistryProjection,type CompanyRegistryState} from '../../../packages/chat-client/src/company-registry-rpc.ts';
import {parseHistoryTimestamp} from '../../../packages/chat-client/src/history-timestamp.ts';
export type CompanyRegistryLease=Readonly<{userId:string;sessionKey:string;companyRegistry:CompanyRegistryRpc}>;
export type CompanyRegistryNotice='none'|'disabled'|'unavailable'|'uncertain'|'access-unavailable'|'expired';
export type CompanyRegistryView=Readonly<{enabled:boolean;requestId:string;state:CompanyRegistryState;busy:boolean;uncertain:boolean;canConfirmPrevious:boolean;accessReloadRequired:boolean;notice:CompanyRegistryNotice}>;
type Options=Readonly<{enabled?:boolean;autoProgress?:boolean;lease:CompanyRegistryLease;requestId:string;current:()=>boolean;reloadAccess:(signal:AbortSignal)=>Promise<boolean>;createId:()=>string;now:()=>number;schedule:(fn:()=>void,ms:number)=>()=>void;timeoutMs:number}>;
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const unavailable=()=>Error('Company registration check unavailable');
/** Opt-in applicant controller. No Auth/login, provider, storage, logger, entry or
 * network defaults. current must fence this captured lease AND request; foreground
 * is controlled separately by suspend/resume. ACKs/projections never grant roles.
 * Automatic reconciliation is read-only; explicit retry retains an uncertain
 * operation's exact IDs instead of creating a second business intent. */
export function createCompanyRegistryController(deps:Options){
 const {enabled=false,lease,requestId,current,reloadAccess,createId,now,schedule,timeoutMs}=deps;
 const {userId,sessionKey,companyRegistry:rpc}=lease;
 if(typeof enabled!=='boolean'||!uuid(userId)||typeof sessionKey!=='string'||!sessionKey||sessionKey.length>200||/[\u0000-\u001f\u007f]/.test(sessionKey)||!uuid(requestId)||[rpc,current,reloadAccess,createId,now,schedule].some(v=>typeof v!=='function')||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000)throw unavailable();
 if(deps.autoProgress!==undefined&&typeof deps.autoProgress!=='boolean')throw unavailable();
 let progress:ReturnType<typeof createRegistryProgressWatch>|null=null;
 let closed=false,retired=false,foreground=true,generation=0,proof:Readonly<{id:string;expiresAt:number}>|null=null,checkIntent:string|null=null,finalIntent:Readonly<{proofId:string;operationId:string;uncertain:boolean}>|null=null;
 let view:CompanyRegistryView=Object.freeze({enabled,requestId,state:enabled?'pending':'unavailable',busy:false,uncertain:false,canConfirmPrevious:false,accessReloadRequired:false,notice:enabled?'none':'disabled'});
 const listeners=new Set<()=>void>();
 type Task={epoch:number;kind:'read'|'check'|'finalize';signal:AbortSignal;interrupted:boolean;dispatched:boolean;acknowledged:boolean;stop:(notify?:boolean)=>void};let job:Task|null=null;
 function notify(){for(const fn of [...listeners])try{fn();}catch{}}
 function publish(patch:Partial<CompanyRegistryView>){if(closed||retired)return;view=Object.freeze({...view,...patch});notify();}
 function retire(emit=true){if(retired||closed)return;progress?.dispose();retired=true;generation++;proof=null;checkIntent=null;finalIntent=null;job?.stop(false);view=Object.freeze({...view,state:'unavailable',busy:false,uncertain:false,canConfirmPrevious:false,accessReloadRequired:false,notice:'unavailable'});if(emit)notify();}
 function active(emit=true){if(!enabled||closed||retired||!foreground)return false;let allowed=false;try{allowed=current()===true;}catch{}if(!allowed)retire(emit);return allowed&&!closed&&!retired&&foreground;}
 const owns=(task:Task)=>job===task&&task.epoch===generation&&!task.interrupted&&active();
 function clock():number|null{try{const n=now();return Number.isSafeInteger(n)&&n>=0?n:null;}catch{return null;}}
 function expire(emit=true){if(proof){const t=clock();if(t===null||t>=proof.expiresAt){proof=null;if(emit)publish({state:'unavailable',notice:'expired'});else view=Object.freeze({...view,state:'unavailable',notice:'expired'});}}}
 async function reload(task:Task,uncertain:boolean){if(!owns(task))return false;let result=false;try{result=await reloadAccess(task.signal)===true;}catch{}if(!owns(task))return false;publish({accessReloadRequired:!result,uncertain,notice:result?(uncertain?'uncertain':'none'):'access-unavailable'});return result;}
 async function apply(value:CompanyRegistryProjection,task:Task,uncertain=false){
  if(!owns(task))return false;proof=null;if(value.state==='approved')finalIntent=null;uncertain=uncertain||!!finalIntent?.uncertain;
  if(value.state==='ready'){
   const expiresAt=parseHistoryTimestamp(value.expiresAt),t=clock();if(expiresAt===null||t===null||expiresAt<=t){publish({state:'unavailable',uncertain,notice:'expired'});return false;}
   proof=Object.freeze({id:value.proofId,expiresAt});
  }
  publish({state:value.state,uncertain,canConfirmPrevious:!!finalIntent?.uncertain,accessReloadRequired:value.state==='approved'||view.accessReloadRequired,notice:uncertain?'uncertain':'none'});
  return value.state==='approved'?reload(task,uncertain):true;
 }
 async function invoke(command:CompanyRegistryCommand,task:Task):Promise<Readonly<{kind:'ok';data:unknown}|{kind:'denied'}|{kind:'unknown'}>>{
  const reply:unknown=await rpc(command,task.signal);if(!owns(task))return{kind:'unknown'};
  if(!record(reply)||Reflect.ownKeys(reply).length!==2||!Object.hasOwn(reply,'data')||!Object.hasOwn(reply,'error'))return{kind:'unknown'};
  const {data,error}=reply;if(error===null)return{kind:'ok',data};
  if(data===null&&record(error)){const {code}=error;if(typeof code==='string'&&['P0001','42501','40001','40P01','RATE_LIMITED'].includes(code))return{kind:'denied'};}
  return{kind:'unknown'};
 }
 async function read(task:Task,uncertain=false){
  if(!owns(task))return false;const reply=await invoke({name:'my_company_registry_check',params:{p_request:requestId}},task);if(!owns(task)||reply.kind!=='ok')return false;
  const value=decodeCompanyRegistryProjection(reply.data,requestId);return owns(task)?apply(value,task,uncertain):false;
 }
 function start(kind:Task['kind'],command:CompanyRegistryCommand,signal?:AbortSignal):Promise<boolean>{
  if(!active()||job||signal?.aborted)return Promise.resolve(false);
  const ac=new AbortController();let resolve!:(result:boolean)=>void,cancel=()=>{};
  const interruption=new Promise<boolean>(r=>{resolve=r;});
  const task:Task={epoch:generation,kind,signal:ac.signal,interrupted:false,dispatched:false,acknowledged:false,stop:(emit=true)=>{
   if(task.interrupted)return;task.interrupted=true;ac.abort();
   if(emit&&job===task&&task.epoch===generation&&!closed&&!retired){
    proof=null;if(!task.dispatched){if(kind==='finalize')finalIntent=null;else if(kind==='check')checkIntent=null;}if(kind==='finalize'&&task.dispatched&&!task.acknowledged&&finalIntent)finalIntent=Object.freeze({...finalIntent,uncertain:true});const uncertain=view.uncertain||kind!=='read'&&task.dispatched&&!task.acknowledged;
    if(view.state==='approved'&&view.accessReloadRequired)publish({busy:false,uncertain,notice:'access-unavailable'});
    else publish({state:'unavailable',busy:false,uncertain,canConfirmPrevious:!!finalIntent?.uncertain,notice:uncertain?'uncertain':'unavailable'});
   }resolve(false);
  }};
  job=task;const abort=()=>task.stop();signal?.addEventListener('abort',abort,{once:true});publish({busy:true,notice:'none'});
  try{cancel=schedule(()=>task.stop(),timeoutMs);}catch{task.stop();}
  const work=Promise.resolve().then(async()=>{
   if(!owns(task)||signal?.aborted)return false;
   try{
    if(kind==='read'){const ok=await read(task);if(!ok&&owns(task)&&view.state!=='approved'&&view.notice!=='expired'){proof=null;publish({state:'unavailable',notice:'unavailable'});}return ok;}
    task.dispatched=true;const reply=await invoke(command,task);if(!owns(task))return false;
    if(reply.kind==='denied'){proof=null;if(kind==='check')checkIntent=null;else finalIntent=null;publish({state:'unavailable',uncertain:false,canConfirmPrevious:false,notice:'unavailable'});return false;}
    if(reply.kind!=='ok')throw unavailable();
    if(kind==='check'){
     const value=decodeCompanyRegistryProjection(reply.data,requestId);if(!owns(task))return false;task.acknowledged=true;checkIntent=null;if(value.state==='checking')progress?.resetAfterCheck();return apply(value,task);
    }
    const intent=finalIntent;if(!intent)throw unavailable();
    const value=decodeCompanyRegistryFinalization(reply.data,requestId,intent.operationId);if(!owns(task))return false;task.acknowledged=true;proof=null;
    if(value.kind==='conflict'){finalIntent=null;publish({state:'cnpj-in-use',uncertain:false,canConfirmPrevious:false,notice:'none'});return true;}
    finalIntent=null;publish({state:'approved',accessReloadRequired:true,uncertain:false,canConfirmPrevious:false,notice:'none'});return reload(task,false);
   }catch{
    if(!owns(task))return false;proof=null;
    if(kind==='read'){publish({state:'unavailable',notice:'unavailable'});return false;}
    if(task.acknowledged){publish({state:'approved',accessReloadRequired:true,notice:'access-unavailable'});return false;}
    if(kind==='finalize'&&finalIntent)finalIntent=Object.freeze({...finalIntent,uncertain:true});publish({state:'unavailable',uncertain:true,canConfirmPrevious:!!finalIntent?.uncertain,notice:'uncertain'});
    // A lost/malformed ACK may have committed. Never repeat either write here.
    try{await read(task,true);}catch{}
    return false;
   }
  }).finally(()=>{try{cancel();}catch{}signal?.removeEventListener('abort',abort);if(job===task){job=null;if(!closed&&!retired&&task.epoch===generation)publish({busy:false});}});
  return Promise.race([work,interruption]);
 }
 function operation(){try{const id=createId();return uuid(id)?id:null;}catch{return null;}}
 const refresh=(signal?:AbortSignal)=>start('read',{name:'my_company_registry_check',params:{p_request:requestId}},signal);
 const controller=Object.freeze({
  snapshot:()=>{if(active(false))expire(false);return view;},
  subscribe:(fn:()=>void)=>{if(closed)return()=>{};listeners.add(fn);return()=>{listeners.delete(fn);};},
  refresh,
  current:()=>active(),
  requestCheck(signal?:AbortSignal){
   if(!active()||job||signal?.aborted)return Promise.resolve(false);
   if(view.uncertain)return refresh(signal);
   if(view.accessReloadRequired||!['pending','not-found','unavailable'].includes(view.state))return Promise.resolve(false);
   const op=checkIntent??operation();if(!op)return Promise.resolve(false);checkIntent=op;
   return start('check',{name:'request_company_registry_check',params:{p_request:requestId,p_operation:op}},signal);
  },
  finalize(signal?:AbortSignal){
   if(!active()||job||signal?.aborted)return Promise.resolve(false);expire();
   if(view.uncertain)return refresh(signal);
   const captured=proof;if(view.state!=='ready'||!captured||view.accessReloadRequired)return Promise.resolve(false);
   if(finalIntent&&finalIntent.proofId!==captured.id){proof=null;publish({state:'unavailable',uncertain:true,notice:'uncertain'});return Promise.resolve(false);}
   if(!finalIntent){const id=operation();if(!id)return Promise.resolve(false);finalIntent=Object.freeze({proofId:captured.id,operationId:id,uncertain:false});}
   return start('finalize',{name:'finalize_registry_company',params:{p_request:requestId,p_proof:finalIntent.proofId,p_operation:finalIntent.operationId}},signal);
  },
  confirmPrevious(signal?:AbortSignal){
   if(!active()||job||signal?.aborted||!finalIntent?.uncertain)return Promise.resolve(false);
   const captured=finalIntent;return start('finalize',{name:'finalize_registry_company',params:{p_request:requestId,p_proof:captured.proofId,p_operation:captured.operationId}},signal);
  },
  suspend(){if(closed||retired||!foreground)return;progress?.setActive(false);foreground=false;generation++;const uncertain=view.uncertain||!!job&&job.kind!=='read'&&job.dispatched&&!job.acknowledged;proof=null;if(job&&!job.dispatched){if(job.kind==='finalize')finalIntent=null;else if(job.kind==='check')checkIntent=null;}if(job?.kind==='finalize'&&job.dispatched&&!job.acknowledged&&finalIntent)finalIntent=Object.freeze({...finalIntent,uncertain:true});job?.stop(false);publish({state:'unavailable',busy:false,uncertain,canConfirmPrevious:!!finalIntent?.uncertain,notice:uncertain?'uncertain':'unavailable'});},
  resume(){if(closed||retired)return;foreground=true;if(active())progress?.setActive(true);},
  close(){if(closed)return;progress?.dispose();closed=true;foreground=false;generation++;proof=null;checkIntent=null;finalIntent=null;job?.stop(false);view=Object.freeze({...view,state:'unavailable',busy:false,uncertain:false,canConfirmPrevious:false,accessReloadRequired:false,notice:'unavailable'});notify();listeners.clear();},
 });
 if(deps.autoProgress===true)progress=createRegistryProgressWatch({controller,schedule});
 return controller;
}
