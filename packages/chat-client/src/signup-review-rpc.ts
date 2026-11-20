import type {OnboardingReply} from './onboarding-rpc.ts';
export type SignupReviewCommand=Readonly<
 |{name:'my_profile_review'|'my_company_review'|'my_identity_renewal';params:Readonly<{p_request:string}>}
 |{name:'finalize_profile_registration';params:Readonly<{p_request:string;p_cpf:string;p_evidence:string;p_operation:string}>}
 |{name:'renew_profile_identity';params:Readonly<{p_request:string;p_cpf:string;p_evidence:string;p_operation:string}>}
 |{name:'finalize_company_registration';params:Readonly<{p_request:string;p_registry_evidence:string;p_representation_evidence:string;p_operation:string}>}
>;
export type SignupReviewRpc=(command:SignupReviewCommand,signal:AbortSignal)=>Promise<OnboardingReply>;
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const timestamp=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(v)&&Number.isFinite(Date.parse(v));
const fail=():never=>{throw Error('Registration review unavailable');};
// Candidate applicant surface only. No attestation, reviewer, subject, role or URL.
export function signupReviewPayload(command:SignupReviewCommand):Readonly<{name:SignupReviewCommand['name'];body:string}>{
 const name=command.name,params=command.params;if(!params)return fail();
 switch(name){
  case 'my_profile_review':case 'my_company_review':case 'my_identity_renewal':{const {p_request}=params;if(!uuid(p_request))return fail();return Object.freeze({name,body:JSON.stringify({p_request})});}
  case 'finalize_profile_registration':case 'renew_profile_identity':{
   const {p_request,p_cpf,p_evidence,p_operation}=params as Extract<SignupReviewCommand,{name:'finalize_profile_registration'}>['params'];
   if(!uuid(p_request)||!uuid(p_evidence)||!uuid(p_operation)||typeof p_cpf!=='string'||!/^\d{11}$/.test(p_cpf))return fail();
   return Object.freeze({name,body:JSON.stringify({p_request,p_cpf,p_evidence,p_operation})});
  }
  case 'finalize_company_registration':{
   const {p_request,p_registry_evidence,p_representation_evidence,p_operation}=params as Extract<SignupReviewCommand,{name:'finalize_company_registration'}>['params'];
   if(!uuid(p_request)||!uuid(p_registry_evidence)||!uuid(p_representation_evidence)||p_registry_evidence===p_representation_evidence||!uuid(p_operation))return fail();
   return Object.freeze({name,body:JSON.stringify({p_request,p_registry_evidence,p_representation_evidence,p_operation})});
  }
  default:return fail();
 }
}
export type ProfileReview=Readonly<{requestId:string;state:'waiting'|'complete'}|{requestId:string;state:'ready';evidenceId:string;expiresAt:string}>;
function object(raw:unknown,fields:readonly string[]):Record<string,unknown>{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return fail();
 const keys=Reflect.ownKeys(raw);if(keys.length!==fields.length||keys.some(k=>typeof k!=='string'||!fields.includes(k)))return fail();
 return raw as Record<string,unknown>;
}
export function decodeProfileReview(raw:unknown,requestId:string):ProfileReview{
 if(!uuid(requestId))return fail();
 if(!raw||typeof raw!=='object')return fail();
 const state=(raw as Record<string,unknown>).state;
 const value=object(raw,state==='ready'?['request_id','state','evidence_id','expires_at']:['request_id','state']);
 if(value.request_id!==requestId)return fail();
 if(state==='waiting'||state==='complete')return Object.freeze({requestId,state});
 if(state!=='ready'||!uuid(value.evidence_id)||!timestamp(value.expires_at))return fail();
 return Object.freeze({requestId,state,evidenceId:value.evidence_id,expiresAt:value.expires_at});
}
// An approval receipt is historical. It is never an access token or current
// company/account/membership state. Callers must reload their normal gates.
export type CompanyReviewReceipt=Readonly<{operationId:string;requestId:string;companyId:string;decision:'approved';decisionRecordedAt:string;historical:true;replayed:boolean}>;
export function decodeCompanyReviewReceipt(raw:unknown,requestId:string,operationId:string):CompanyReviewReceipt{
 const v=object(raw,['operation_id','request_id','company_id','decision','decision_recorded_at','historical','replayed']);
 if(!uuid(requestId)||!uuid(operationId)||v.request_id!==requestId||v.operation_id!==operationId||!uuid(v.company_id)||v.decision!=='approved'||v.historical!==true||typeof v.replayed!=='boolean'||!timestamp(v.decision_recorded_at))return fail();
 return Object.freeze({operationId,requestId,companyId:v.company_id,decision:'approved',decisionRecordedAt:v.decision_recorded_at,historical:true,replayed:v.replayed});
}

export type CompanyReview=Readonly<{requestId:string;state:'waiting'|'complete'}|{requestId:string;state:'ready';registryEvidenceId:string;representationEvidenceId:string;expiresAt:string}>;
export function decodeCompanyReview(raw:unknown,requestId:string):CompanyReview{
 if(!uuid(requestId)||!raw||typeof raw!=='object')return fail();
 const state=(raw as Record<string,unknown>).state,value=object(raw,state==='ready'?['request_id','state','registry_evidence_id','representation_evidence_id','expires_at']:['request_id','state']);
 if(value.request_id!==requestId)return fail();
 if(state==='waiting'||state==='complete')return Object.freeze({requestId,state});
 if(state!=='ready'||!uuid(value.registry_evidence_id)||!uuid(value.representation_evidence_id)||value.registry_evidence_id===value.representation_evidence_id||!timestamp(value.expires_at))return fail();
 return Object.freeze({requestId,state,registryEvidenceId:value.registry_evidence_id,representationEvidenceId:value.representation_evidence_id,expiresAt:value.expires_at});
}

export type IdentityRenewal=Readonly<{requestId:string;state:'current'|'waiting'}|{requestId:string;state:'ready';evidenceId:string;expiresAt:string}>;
export function decodeIdentityRenewal(raw:unknown,requestId:string):IdentityRenewal{
 if(!uuid(requestId)||!raw||typeof raw!=='object')return fail();
 const state=(raw as Record<string,unknown>).state,value=object(raw,state==='ready'?['request_id','state','evidence_id','expires_at']:['request_id','state']);
 if(value.request_id!==requestId)return fail();
 if(state==='current'||state==='waiting')return Object.freeze({requestId,state});
 if(state!=='ready'||!uuid(value.evidence_id)||!timestamp(value.expires_at))return fail();
 return Object.freeze({requestId,state,evidenceId:value.evidence_id,expiresAt:value.expires_at});
}
// This receipt records renewal; it does not activate an account or grant access.
export type IdentityRenewalReceipt=Readonly<{requestId:string;operationId:string;decision:'renewed';decisionRecordedAt:string;historical:true;replayed:boolean}>;
export function decodeIdentityRenewalReceipt(raw:unknown,requestId:string,operationId:string):IdentityRenewalReceipt{
 const value=object(raw,['request_id','operation_id','decision','decision_recorded_at','historical','replayed']);
 const {request_id,operation_id,decision,decision_recorded_at,historical,replayed}=value;
 if(!uuid(requestId)||!uuid(operationId)||request_id!==requestId||operation_id!==operationId||decision!=='renewed'||!timestamp(decision_recorded_at)||historical!==true||typeof replayed!=='boolean')return fail();
 return Object.freeze({requestId,operationId,decision:'renewed',decisionRecordedAt:decision_recorded_at,historical:true,replayed});
}
