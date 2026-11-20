import type { SubjectBoundOnboardingRpc, OnboardingCommand } from '../../../packages/chat-client/src/onboarding-rpc.ts';
import { validateProfile,validateCompany,projectProfileStatus,projectCompanyStatus,type ProfileForm,type CompanyForm,type ProfileStatus,type CompanyStatus } from './registration-forms.ts';
export type OnboardingLease=Readonly<{userId:string;sessionKey:string;onboarding:SubjectBoundOnboardingRpc;close:()=>void}>;
export type CompanyRecoveryPage=Readonly<{companies:readonly CompanyStatus[];requestIds:readonly string[];nextCursor:string|null}>;
export type RegistrationRecovery=Readonly<{profile:ProfileStatus;profileRequestId:string|null;companies:readonly CompanyStatus[];companyRequestIds:readonly string[];nextCompanyCursor:string|null}>;
const uuid=(s:unknown):s is string=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const failure=()=>Error('Registration unavailable');
// No storage, logger or credential input. IDs are generated before writes and
// retained only for in-process retries; restart recovers IDs from the server.
export function createOnboardingAdapter(lease:OnboardingLease,createRequestId:()=>string){
  if(!uuid(lease.userId)||!lease.sessionKey||typeof lease.onboarding!=='function')throw failure();
  let profileRequest:string|null=null,companyRequest:string|null=null;
  let companyConfirmed=false,companyRejected=false,companyInput:CompanyForm|null=null;
  let withdrawal:string|null=null,correction:Readonly<{previous:string;request:string;confirmed:boolean}>|null=null;
  const companyWithdrawals=new Map<string,string>(),companyCorrections=new Map<string,Readonly<{request:string;confirmed:boolean}>>();
  function requestId(){const id=createRequestId();if(!uuid(id))throw failure();return id;}
  async function call(command:OnboardingCommand,signal:AbortSignal){
    if(signal.aborted)throw failure();
    try{const reply=await lease.onboarding(command,signal);if(signal.aborted||!record(reply)||reply.error!==null)throw failure();return reply.data;}catch{throw failure();}
  }
  async function readGroup<T>(parent:AbortSignal,read:(signal:AbortSignal)=>Promise<T>):Promise<T>{
    const ac=new AbortController(),abort=()=>ac.abort();parent.addEventListener('abort',abort,{once:true});if(parent.aborted)abort();
    try{if(ac.signal.aborted)throw failure();const value=await read(ac.signal);if(ac.signal.aborted)throw failure();return value;}
    finally{parent.removeEventListener('abort',abort);ac.abort();}
  }
  async function companyPage(after:string|null,parentSignal:AbortSignal):Promise<CompanyRecoveryPage>{
   return readGroup(parentSignal,async signal=>{
    if(after!==null&&!uuid(after))throw failure();
    const page=await call({name:'my_company_registration_page',params:{p_after:after}},signal);
    if(!record(page)||typeof page.has_more!=='boolean'||!Array.isArray(page.request_ids)||page.request_ids.length>10||!page.request_ids.every(uuid)
      ||page.request_ids.some((id,i,ids)=>id<=(i===0?(after??''):ids[i-1]))
      ||(page.has_more?(page.request_ids.length!==10||page.next_cursor!==page.request_ids[9]):page.next_cursor!==null))throw failure();
    // A page has at most ten owned requests. Read four statuses per wave:
    // with the two initial reads still pending this uses at most six slots,
    // below the concrete transport's default limit of eight. Preserve order.
    const companies:CompanyStatus[]=[];
    for(let start=0;start<page.request_ids.length;start+=4){
      const batch=await Promise.all(page.request_ids.slice(start,start+4).map(async(id:string)=>{const status=projectCompanyStatus(await call({name:'my_company_registration',params:{p_request:id}},signal),id);if(!status)throw failure();return status;}));companies.push(...batch);
    }
    if(signal.aborted)throw failure();
    return Object.freeze({companies:Object.freeze(companies),requestIds:Object.freeze([...page.request_ids]),nextCursor:page.next_cursor as string|null});
   });
  }
  async function submitCompany(input:CompanyForm,signal:AbortSignal){
    const checked=validateCompany(input);if(!checked.ok||signal.aborted)throw failure();
    const value=checked.value;
    if(companyRequest&&companyInput&&JSON.stringify(value)!==JSON.stringify(companyInput))throw failure();
    const previouslyUncertain=companyRequest!==null&&!companyConfirmed;
    companyRequest??=requestId();companyInput=Object.freeze({...value});companyRejected=false;
    const reply=await lease.onboarding({name:'request_company',params:{p_request:companyRequest,p_name:value.name,p_cnpj:value.cnpj,p_address:value.address,p_phone:value.phone}},signal);
    if(signal.aborted||!record(reply))throw failure();
    if(reply.error!==null){
      // Only a definitive denial of the first dispatch can release this intent.
      // A later denial cannot disprove an earlier lost acknowledgement.
      if(!previouslyUncertain&&record(reply.error)&&['P0001','42501','40001','40P01','RATE_LIMITED'].includes(String(reply.error.code))){companyRequest=null;companyInput=null;companyRejected=true;}
      throw failure();
    }
    const status=projectCompanyStatus(reply.data,companyRequest);if(!status)throw failure();companyConfirmed=true;return status;
  }
  return Object.freeze({
    loadCompanyPage:companyPage,
    hasUnconfirmedCompanyRequest:()=>companyRequest!==null&&!companyConfirmed,
    companyRequestRejected:()=>companyRejected,
    beginCompanyRequest(){
      if(companyRequest!==null&&!companyConfirmed)return false;
      companyRequest=null;companyInput=null;companyConfirmed=false;companyRejected=false;return true;
    },
    async load(parentSignal:AbortSignal):Promise<RegistrationRecovery>{
     return readGroup(parentSignal,async signal=>{
      // These subject-bound reads have no data dependency. Validate the whole
      // recovery together before committing request IDs or exposing a profile.
      const [profileRaw,own,page]=await Promise.all([call({name:'my_profile_registration'},signal),call({name:'my_profile_registration_request'},signal),companyPage(null,signal)]);
      const profile=projectProfileStatus(profileRaw,lease.userId);if(!profile)throw failure();
      if(!record(own)||own.registration_state!==(profile.kind==='not_started'?'not_started':profile.state)||(profile.kind==='not_started'?own.request_id!==null:!uuid(own.request_id)))throw failure();
      if(profile.kind==='not_started'&&page.requestIds.length)throw failure();
      if(signal.aborted)throw failure();
      // Reconcile the exact in-memory intention even when it is beyond page one.
      // A failed/absent read is not proof that a write did not commit.
      let recoveredPage=page;
      if(companyRequest){
        if(page.requestIds.includes(companyRequest))companyConfirmed=true;
        else try{
          const status=projectCompanyStatus(await call({name:'my_company_registration',params:{p_request:companyRequest}},signal),companyRequest);
          if(status){companyConfirmed=true;recoveredPage=Object.freeze({...page,companies:Object.freeze([...page.companies,status]),requestIds:Object.freeze([...page.requestIds,companyRequest])});}
        }catch{if(signal.aborted)throw failure();}
      }
      if(companyConfirmed)companyInput=null;
      // An acknowledged correction or observation of its new request confirms
      // application even if that request was subsequently rejected. Only an
      // uncertain intention still pointing at the unchanged predecessor retries.
      if(profileRequest!==own.request_id||correction?.confirmed||correction?.request===own.request_id){withdrawal=null;correction=null;}
      profileRequest=own.request_id as string|null;
      for(const [previous,intent] of companyCorrections)if(intent.confirmed||page.requestIds.includes(intent.request))companyCorrections.delete(previous);
      return Object.freeze({profile,profileRequestId:profileRequest,companies:recoveredPage.companies,companyRequestIds:recoveredPage.requestIds,nextCompanyCursor:page.nextCursor});
     });
    },
    async withdrawProfile(signal:AbortSignal){
      if(!profileRequest)throw failure();withdrawal??=requestId();
      const status=projectProfileStatus(await call({name:'withdraw_profile',params:{p_request:profileRequest,p_operation:withdrawal}},signal),lease.userId);if(!status)throw failure();correction=null;return status;
    },
    async resubmitProfile(input:ProfileForm,signal:AbortSignal){
      const checked=validateProfile(input);if(!checked.ok||!profileRequest)throw failure();
      correction??=Object.freeze({previous:profileRequest,request:requestId(),confirmed:false});
      const status=projectProfileStatus(await call({name:'resubmit_profile',params:{p_previous:correction.previous,p_request:correction.request,p_name:checked.value.name,p_cpf:checked.value.cpf}},signal),lease.userId);if(!status||status.kind==='not_started')throw failure();correction=Object.freeze({...correction,confirmed:true});profileRequest=correction.request;withdrawal=null;return status;
    },
    async registerProfile(input:ProfileForm,signal:AbortSignal){
      const checked=validateProfile(input);if(!checked.ok)throw failure();
      profileRequest??=requestId();
      const raw=await call({name:'register_profile',params:{p_request:profileRequest,p_name:checked.value.name,p_cpf:checked.value.cpf}},signal);
      const status=projectProfileStatus(raw,lease.userId);if(!status||status.kind==='not_started')throw failure();return status;
    },
    async requestCompany(input:CompanyForm,signal:AbortSignal){
      return submitCompany(input,signal);
    },
    async retryCompany(signal:AbortSignal){
      if(!companyRequest||companyConfirmed||!companyInput)throw failure();
      return submitCompany(companyInput,signal);
    },
    async withdrawCompany(request:string,signal:AbortSignal){
      if(!uuid(request))throw failure();let operation=companyWithdrawals.get(request);if(!operation){operation=requestId();companyWithdrawals.set(request,operation);}
      const status=projectCompanyStatus(await call({name:'withdraw_company',params:{p_request:request,p_operation:operation}},signal),request);if(!status)throw failure();companyCorrections.delete(request);return status;
    },
    async resubmitCompany(previous:string,input:CompanyForm,signal:AbortSignal){
      const checked=validateCompany(input);if(!uuid(previous)||!checked.ok)throw failure();
      let intent=companyCorrections.get(previous);if(!intent){intent=Object.freeze({request:requestId(),confirmed:false});companyCorrections.set(previous,intent);}
      const raw=await call({name:'resubmit_company',params:{p_previous:previous,p_request:intent.request,p_name:checked.value.name,p_cnpj:checked.value.cnpj,p_address:checked.value.address,p_phone:checked.value.phone}},signal);
      const status=projectCompanyStatus(raw,intent.request);if(!status)throw failure();companyCorrections.set(previous,Object.freeze({...intent,confirmed:true}));return Object.freeze({requestId:intent.request,status});
    },
  });
}
