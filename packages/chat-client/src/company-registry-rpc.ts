import type {OnboardingReply} from './onboarding-rpc.ts';
import {parseHistoryTimestamp} from './history-timestamp.ts';
export type CompanyRegistryCommand=Readonly<
 |{name:'request_company_registry_check';params:Readonly<{p_request:string;p_operation:string}>}
 |{name:'my_company_registry_check';params:Readonly<{p_request:string}>}
 |{name:'finalize_registry_company';params:Readonly<{p_request:string;p_proof:string;p_operation:string}>}
>;
export type CompanyRegistryRpc=(command:CompanyRegistryCommand,signal:AbortSignal)=>Promise<OnboardingReply>;
export type CompanyRegistryState='pending'|'checking'|'mismatch'|'not-found'|'unavailable'|'ready'|'approved'|'cnpj-in-use';
export type CompanyRegistryProjection=Readonly<{requestId:string;state:Exclude<CompanyRegistryState,'ready'|'approved'>}>|Readonly<{requestId:string;state:'ready';proofId:string;expiresAt:string}>|Readonly<{requestId:string;state:'approved';companyId:string}>;
export type CompanyRegistryFinalization=Readonly<{kind:'receipt';requestId:string;operationId:string;companyId:string;registrationState:'approved';representationState:'unconfirmed';historical:boolean;accessReloadRequired:true}>|Readonly<{kind:'conflict';requestId:string;registrationState:'pending';result:'cnpj-in-use'}>;
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const fail=():never=>{throw Error('Company registration check unavailable');};
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
function object(raw:unknown,fields:readonly string[]):Record<string,unknown>{
 if(!record(raw))return fail();const keys=Reflect.ownKeys(raw);
 if(keys.length!==fields.length||keys.some(k=>typeof k!=='string'||!fields.includes(k)))return fail();return raw;
}
/** Applicant-only, IDs-only surface. Never accepts CNPJ/name/provider result,
 * subject, policy, source URL, role, reviewer or a caller assertion of validity. */
export function companyRegistryPayload(command:CompanyRegistryCommand):Readonly<{name:CompanyRegistryCommand['name'];body:string}>{
 const c=object(command,['name','params']),{name,params}=c;
 if(name==='my_company_registry_check'){
  const v=object(params,['p_request']),{p_request}=v;if(!uuid(p_request))return fail();
  return Object.freeze({name,body:JSON.stringify({p_request})});
 }
 if(name==='request_company_registry_check'){
  const v=object(params,['p_request','p_operation']),{p_request,p_operation}=v;if(!uuid(p_request)||!uuid(p_operation))return fail();
  return Object.freeze({name,body:JSON.stringify({p_request,p_operation})});
 }
 if(name==='finalize_registry_company'){
  const v=object(params,['p_request','p_proof','p_operation']),{p_request,p_proof,p_operation}=v;
  if(!uuid(p_request)||!uuid(p_proof)||!uuid(p_operation))return fail();return Object.freeze({name,body:JSON.stringify({p_request,p_proof,p_operation})});
 }
 return fail();
}
export function decodeCompanyRegistryProjection(raw:unknown,requestId:string):CompanyRegistryProjection{
 if(!uuid(requestId)||!record(raw))return fail();const state=raw.state;
 const v=object(raw,state==='ready'?['request_id','state','proof_id','expires_at']:state==='approved'?['request_id','state','company_id']:['request_id','state']);
 const {request_id}=v;if(request_id!==requestId)return fail();
 if(state==='ready'){
  const {proof_id,expires_at}=v;if(!uuid(proof_id)||typeof expires_at!=='string'||parseHistoryTimestamp(expires_at)===null)return fail();
  return Object.freeze({requestId,state,proofId:proof_id,expiresAt:expires_at});
 }
 if(state==='approved'){const {company_id}=v;if(!uuid(company_id))return fail();return Object.freeze({requestId,state,companyId:company_id});}
 if(state!=='pending'&&state!=='checking'&&state!=='mismatch'&&state!=='not-found'&&state!=='unavailable'&&state!=='cnpj-in-use')return fail();
 return Object.freeze({requestId,state});
}
/** Both new ACK and replay are historical business receipts, not current access.
 * Callers must reload their authoritative registration/authorization/membership
 * gates; companyId is never enough to select or authorize a company context. */
export function decodeCompanyRegistryFinalization(raw:unknown,requestId:string,operationId:string):CompanyRegistryFinalization{
 if(!uuid(requestId)||!uuid(operationId)||!record(raw))return fail();
 if(raw.result==='cnpj-in-use'){
  const v=object(raw,['request_id','registration_state','result']);
  if(v.request_id!==requestId||v.registration_state!=='pending'||v.result!=='cnpj-in-use')return fail();
  return Object.freeze({kind:'conflict',requestId,registrationState:'pending',result:'cnpj-in-use'});
 }
 const v=object(raw,['operation_id','request_id','company_id','registration_state','representation_state','historical']);
 const {operation_id,request_id,company_id,registration_state,representation_state,historical}=v;
 if(operation_id!==operationId||request_id!==requestId||!uuid(company_id)||registration_state!=='approved'||representation_state!=='unconfirmed'||typeof historical!=='boolean')return fail();
 return Object.freeze({kind:'receipt',requestId,operationId,companyId:company_id,registrationState:'approved',representationState:'unconfirmed',historical,accessReloadRequired:true});
}
