import {createOnboardingAdapter,type OnboardingLease,type RegistrationRecovery} from './onboarding-adapter.ts';
import {validateProfile} from './registration-forms.ts';
import {decodeProfileReview,decodeCompanyReview,decodeCompanyReviewReceipt,type ProfileReview,type CompanyReview,type CompanyReviewReceipt,type SignupReviewRpc,type SignupReviewCommand} from '../../../packages/chat-client/src/signup-review-rpc.ts';
export type ReviewLease=OnboardingLease&Readonly<{signupReview:SignupReviewRpc}>;
type Intent=Readonly<{requestId:string;operationId:string}>;
export type ProfileReviewIntent=Intent&Readonly<{evidenceId:string}>;
export type CompanyReviewIntent=Intent&Readonly<{registryEvidenceId:string;representationEvidenceId:string}>;
type Failure=Readonly<{ok:false;code:'INVALID_INPUT'|'UNAVAILABLE'}>;
type ReadResult<T>=Readonly<{ok:true;value:T}>|Failure;
export type FinalizationResult=Readonly<
 |{ok:true;write:'acknowledged';requestId:string;operationId:string;companyReceipt?:CompanyReviewReceipt;recovery:RegistrationRecovery|null;accessReloadRequired:true}
 |{ok:false;code:'UNCERTAIN';requestId:string;operationId:string;recovery:RegistrationRecovery|null;accessReloadRequired:true}
>|Failure;
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const unavailable=():Failure=>Object.freeze({ok:false,code:'UNAVAILABLE'}),invalid=():Failure=>Object.freeze({ok:false,code:'INVALID_INPUT'});
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
function profileReceipt(raw:unknown,requestId:string){
 if(!record(raw))return false;const keys=Reflect.ownKeys(raw);if(keys.length!==4||keys.some(k=>typeof k!=='string'||!['request_id','state','identity_state','account_state'].includes(k)))return false;
 const {request_id,state,identity_state,account_state}=raw;
 return request_id===requestId&&state==='approved'&&identity_state==='confirmed'&&account_state==='active';
}
/** Candidate controller only. No storage/logger/credential provider/UI entry.
 * Write ACK and observed registration are separate: neither grants business
 * access. The host must reload its normal authorization and membership gates.
 * A lost response triggers READ reconciliation only, never a repeated write. */
export function createOnboardingReviewAdapter(deps:Readonly<{lease:ReviewLease;createId:()=>string;current:()=>boolean;schedule:(fn:()=>void,ms:number)=>()=>void;timeoutMs:number}>){
 const {lease,createId,current,schedule,timeoutMs}=deps;
 let rpc:SignupReviewRpc,onboarding:ReturnType<typeof createOnboardingAdapter>;
 try{
  const {userId,sessionKey,signupReview,onboarding:port}=lease;
  if(!uuid(userId)||typeof sessionKey!=='string'||!sessionKey||sessionKey.length>200||/[\u0000-\u001f\u007f]/.test(sessionKey)||typeof signupReview!=='function'||typeof port!=='function'||typeof createId!=='function'||typeof current!=='function'||typeof schedule!=='function'||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000)throw Error();
  rpc=signupReview;onboarding=createOnboardingAdapter(Object.freeze({userId,sessionKey,onboarding:port,close:()=>{}}),createId);
 }catch{throw Error('Registration review unavailable');}
 // Ports and subject primitives are captured once from this lease. A later
 // mutation cannot redirect to a replacement account or transport.
 let closed=false,retired=false,writing=false;const jobs=new Set<()=>void>();
 function active(){if(closed||retired)return false;try{if(current()!==true)retired=true;}catch{retired=true;}return !closed&&!retired;}
 async function read<T>(command:SignupReviewCommand,decode:(raw:unknown)=>T,signal?:AbortSignal):Promise<ReadResult<T>>{
  if(!active()||signal?.aborted||jobs.size>=4)return unavailable();
  const ac=new AbortController();let interrupted=false,cancel=()=>{},resolve!:(r:ReadResult<T>)=>void;
  const interruption=new Promise<ReadResult<T>>(r=>{resolve=r;}),stop=()=>{if(interrupted)return;interrupted=true;ac.abort();resolve(unavailable());};
  jobs.add(stop);signal?.addEventListener('abort',stop,{once:true});
  try{cancel=schedule(stop,timeoutMs);}catch{stop();}
  const work=Promise.resolve().then(async():Promise<ReadResult<T>>=>{
   if(!active()||interrupted||signal?.aborted)return unavailable();
   try{const reply=await rpc(command,ac.signal);if(!active()||interrupted||reply.error!==null)return unavailable();const value=decode(reply.data);return active()&&!interrupted?Object.freeze({ok:true,value}):unavailable();}catch{return unavailable();}
  }).finally(()=>{jobs.delete(stop);try{cancel();}catch{}signal?.removeEventListener('abort',stop);});
  return Promise.race([work,interruption]);
 }
 async function finalize(command:SignupReviewCommand,intent:Intent,company:boolean,signal?:AbortSignal):Promise<FinalizationResult>{
  if(!active()||signal?.aborted||writing||jobs.size>=4)return unavailable();
  const {requestId,operationId}=intent;let dispatched=false,interrupted=false,acknowledged=false,companyReceipt:CompanyReviewReceipt|undefined,cancel=()=>{},resolve!:(r:FinalizationResult)=>void;
  const ac=new AbortController(),uncertain=(recovery:RegistrationRecovery|null=null):FinalizationResult=>Object.freeze({ok:false,code:'UNCERTAIN',requestId,operationId,recovery,accessReloadRequired:true});
  const confirmed=(recovery:RegistrationRecovery|null=null):FinalizationResult=>Object.freeze({ok:true,write:'acknowledged',requestId,operationId,...(companyReceipt?{companyReceipt}:{}),recovery,accessReloadRequired:true});
  const interruption=new Promise<FinalizationResult>(r=>{resolve=r;}),stop=()=>{if(interrupted)return;interrupted=true;ac.abort();resolve(!active()?unavailable():acknowledged?confirmed():dispatched?uncertain():unavailable());};
  writing=true;jobs.add(stop);signal?.addEventListener('abort',stop,{once:true});
  try{cancel=schedule(stop,timeoutMs);}catch{stop();}
  const work=Promise.resolve().then(async():Promise<FinalizationResult>=>{
   if(!active()||interrupted||signal?.aborted)return unavailable();
   try{
    dispatched=true;const reply=await rpc(command,ac.signal);
    if(!active()||interrupted||ac.signal.aborted)return unavailable();
    if(reply.error!==null){
     // Definite refusals may still coexist with a prior operation. Do not
     // infer active/rejected state from an error or silently resend the write.
     if(['P0001','42501','40001','40P01','RATE_LIMITED'].includes(reply.error.code))return unavailable();
    }else if(company){companyReceipt=decodeCompanyReviewReceipt(reply.data,requestId,operationId);acknowledged=true;}
    else acknowledged=profileReceipt(reply.data,requestId);
   }catch{/* Unknown write outcome. Reconcile with owned reads below. */}
   if(!active()||interrupted||ac.signal.aborted)return unavailable();
   let recovery:RegistrationRecovery|null=null;
   try{recovery=await onboarding.load(ac.signal);}catch{/* A receipt never fabricates current access when reads fail. */}
   if(!active()||interrupted||ac.signal.aborted)return unavailable();
   if(!acknowledged)return uncertain(recovery);
   return confirmed(recovery);
  }).finally(()=>{writing=false;jobs.delete(stop);try{cancel();}catch{}signal?.removeEventListener('abort',stop);});
  return Promise.race([work,interruption]);
 }
 return Object.freeze({
  profileReview(requestId:string,signal?:AbortSignal):Promise<ReadResult<ProfileReview>>{
   if(!uuid(requestId))return Promise.resolve(invalid());
   return read(Object.freeze({name:'my_profile_review',params:Object.freeze({p_request:requestId})}),raw=>decodeProfileReview(raw,requestId),signal);
  },
  companyReview(requestId:string,signal?:AbortSignal):Promise<ReadResult<CompanyReview>>{
   if(!uuid(requestId))return Promise.resolve(invalid());
   return read(Object.freeze({name:'my_company_review',params:Object.freeze({p_request:requestId})}),raw=>decodeCompanyReview(raw,requestId),signal);
  },
  finalizeProfile(input:ProfileReviewIntent,cpf:string,signal?:AbortSignal):Promise<FinalizationResult>{
   let requestId:string,operationId:string,evidenceId:string;try{({requestId,operationId,evidenceId}=input);}catch{return Promise.resolve(invalid());}
   if(!uuid(requestId)||!uuid(operationId)||!uuid(evidenceId))return Promise.resolve(invalid());
   const checked=validateProfile({name:'Review',cpf});if(!checked.ok)return Promise.resolve(invalid());
   return finalize(Object.freeze({name:'finalize_profile_registration',params:Object.freeze({p_request:requestId,p_cpf:checked.value.cpf,p_evidence:evidenceId,p_operation:operationId})}),Object.freeze({requestId,operationId}),false,signal);
  },
  finalizeCompany(input:CompanyReviewIntent,signal?:AbortSignal):Promise<FinalizationResult>{
   let requestId:string,operationId:string,registryEvidenceId:string,representationEvidenceId:string;try{({requestId,operationId,registryEvidenceId,representationEvidenceId}=input);}catch{return Promise.resolve(invalid());}
   if(!uuid(requestId)||!uuid(operationId)||!uuid(registryEvidenceId)||!uuid(representationEvidenceId)||registryEvidenceId===representationEvidenceId)return Promise.resolve(invalid());
   return finalize(Object.freeze({name:'finalize_company_registration',params:Object.freeze({p_request:requestId,p_operation:operationId,p_registry_evidence:registryEvidenceId,p_representation_evidence:representationEvidenceId})}),Object.freeze({requestId,operationId}),true,signal);
  },
  close(){if(closed)return;closed=true;for(const stop of [...jobs])stop();}
 });
}
