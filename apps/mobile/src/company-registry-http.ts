import{onboardingPayload,type OnboardingCommand}from'../../../packages/chat-client/src/onboarding-rpc.ts';
import {companyRegistryPayload,type CompanyRegistryCommand} from '../../../packages/chat-client/src/company-registry-rpc.ts';
import {AUTH_DIAGNOSTIC_ORIGIN as origin} from './auth-diagnostic-http.ts';
const names=new Set(['request_company_registry_check','my_company_registry_check','finalize_registry_company']);
const unavailable=()=>Error('Company registry connection unavailable');
/** Candidate boundary adds exactly three IDs-only public RPCs. Existing Auth,
 * onboarding, membership and chat admission stays in the injected old boundary.
 * Explicit on-demand mode maps only request to the authenticated Edge route. */
export function createCompanyRegistryFetch(nativeFetch:typeof fetch,publishableKey:string,existing:typeof fetch,options:Readonly<{requestMode?:'on-demand-v1';companyCorrections?:boolean;previewEnabled?:boolean}>={}):typeof fetch{
 const previewName='preview_company_registry_data_v1';if(options.previewEnabled!==undefined&&typeof options.previewEnabled!=='boolean')throw unavailable();
 const corrections=options.companyCorrections;if(corrections!==undefined&&typeof corrections!=='boolean')throw unavailable();
 const correctionNames=new Set(corrections===true?['withdraw_company','resubmit_company']:[]);
 const onDemand=options.requestMode==='on-demand-v1';if(options.requestMode!==undefined&&!onDemand)throw unavailable();
 if(typeof nativeFetch!=='function'||typeof existing!=='function'||!/^sb_publishable_[A-Za-z0-9_-]{1,200}$/.test(publishableKey))throw unavailable();
 return(async(input,init)=>{
  if(typeof input!=='string')throw unavailable();
  const name=input.slice((origin+'/rest/v1/rpc/').length);
  const preview=input===origin+'/rest/v1/rpc/'+previewName;if(preview&&options.previewEnabled!==true)throw unavailable();
  if(!input.startsWith(origin+'/rest/v1/rpc/')||(!names.has(name)&&!correctionNames.has(name)&&!preview)){try{return await existing(input,init);}catch{throw unavailable();}}
  let request:RequestInit;const target=preview?origin+'/functions/v1/connect-company-registry-preview':onDemand&&name==='request_company_registry_check'?origin+'/functions/v1/connect-company-registry-check':input;
  try{
   if(!init)throw unavailable();const {method,body,headers:rawHeaders,signal,redirect,credentials}=init;
   if(method!=='POST'||typeof body!=='string'||body.length>(correctionNames.has(name)?12000:1024)||!(signal instanceof AbortSignal)||signal.aborted||redirect!=='error'||credentials!=='omit')throw unavailable();
   const headers=new Headers(rawHeaders),allowed=new Set(['apikey','accept','authorization','accept-profile','content-type','content-profile']);
   headers.forEach((_,key)=>{if(!allowed.has(key))throw unavailable();});const bearer=headers.get('authorization');
   if(headers.get('apikey')!==publishableKey||headers.get('accept')!=='application/json'||!bearer||!/^Bearer [A-Za-z0-9_.-]{1,8192}$/.test(bearer)||bearer.startsWith('Bearer sb_')||(!preview&&!correctionNames.has(name)&&(headers.get('accept-profile')!=='public'||headers.get('content-profile')!=='public'))||headers.get('content-type')!=='application/json')throw unavailable();
   if((preview||correctionNames.has(name))&&['accept-profile','content-profile'].some(key=>headers.has(key)&&headers.get(key)!=='public'))throw unavailable();
   const payload=preview||correctionNames.has(name)?onboardingPayload({name,params:JSON.parse(body)}as OnboardingCommand):companyRegistryPayload({name,params:JSON.parse(body)} as CompanyRegistryCommand);
   if(payload.name!==name||payload.body!==body)throw unavailable();
   if(target!==input){headers.delete('Accept-Profile');headers.delete('Content-Profile');}else{headers.set('Accept-Profile','public');headers.set('Content-Profile','public');headers.set('Cache-Control','no-store');}if(signal.aborted)throw unavailable();
   request={method:'POST',body:payload.body,headers,signal,redirect:'error',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'};
  }catch{throw unavailable();}
  try{const response=await nativeFetch(target,request);if(target===input)return response;
   if(request.signal?.aborted||response.redirected||response.url&&response.url!==target){try{await response.body?.cancel();}catch{}throw unavailable();}
   // Only after checking the physical endpoint, expose the unchanged stream/status
   // without its Edge URL to the existing session-bound RPC response reader.\n   // Preserve the native reader: the global RN Response constructor does not\n   // reliably accept Expo/custom response streams as a WHATWG body.
   return Object.freeze({status:response.status,statusText:response.statusText,ok:response.ok,redirected:false,url:'',headers:response.headers,body:response.body}) as Response;
  }catch{throw unavailable();}
 })as typeof fetch;
}
