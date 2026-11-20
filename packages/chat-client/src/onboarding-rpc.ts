import{companyPreviewBody}from'./company-preview.ts';
export type OnboardingCommand = Readonly<
  | {name:'preview_company_registry_data_v1';params:Readonly<{p_cnpj:string}>}
  | {name:'register_profile';params:Readonly<{p_request:string;p_name:string;p_cpf:string}>}
  | {name:'request_company';params:Readonly<{p_request:string;p_name:string;p_cnpj:string;p_address:string;p_phone:string}>}
  | {name:'my_company_registration';params:Readonly<{p_request:string}>}
  | {name:'my_company_registration_page';params:Readonly<{p_after:string|null}>}
  | {name:'withdraw_profile'|'withdraw_company';params:Readonly<{p_request:string;p_operation:string}>}
  | {name:'resubmit_profile';params:Readonly<{p_previous:string;p_request:string;p_name:string;p_cpf:string}>}
  | {name:'resubmit_company';params:Readonly<{p_previous:string;p_request:string;p_name:string;p_cnpj:string;p_address:string;p_phone:string}>}
  | {name:'my_profile_registration'|'my_profile_registration_request'|'my_company_registration_index';params?:never}
>;
export type OnboardingReply = Readonly<{data:unknown;error:null}|{data:null;error:Readonly<{code:string}>}>;
export type SubjectBoundOnboardingRpc=(command:OnboardingCommand,signal:AbortSignal)=>Promise<OnboardingReply>;
// Explicit projection: no caller-selected URL, subject, role or verification flag.
export function onboardingPayload(command:OnboardingCommand):Readonly<{name:OnboardingCommand['name'];body:string}> {
  const uuid=(s:unknown)=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
  const text=(s:unknown,max:number)=>typeof s==='string'&&[...s].length<=max&&!/[\u0000-\u001f\u007f]/.test(s);
  const fail=()=>{throw Error('Onboarding unavailable');};
  // Read caller-owned accessors once. Validate and serialize the same primitives;
  // a mutable getter must not replace an allowlisted endpoint or checked value.
  const name=command.name;
  switch(name){
    case 'preview_company_registry_data_v1':{
      const p=command.params;if(!p||Reflect.ownKeys(p).length!==1||!Object.hasOwn(p,'p_cnpj'))return fail();return Object.freeze({name,body:companyPreviewBody(p.p_cnpj)});
    }
    case 'my_profile_registration':case 'my_profile_registration_request':case 'my_company_registration_index':return Object.freeze({name,body:'{}'});
    case 'my_company_registration_page':{
      const p=command.params;if(!p)return fail();const {p_after}=p;
      if(p_after!==null&&!uuid(p_after))return fail();return Object.freeze({name,body:JSON.stringify({p_after})});
    }
    case 'withdraw_profile':case 'withdraw_company':{
      const p=command.params;if(!p)return fail();const {p_request,p_operation}=p;
      if(!uuid(p_request)||!uuid(p_operation))return fail();return Object.freeze({name,body:JSON.stringify({p_request,p_operation})});
    }
    case 'my_company_registration':{
      const p=command.params;if(!p)return fail();const {p_request}=p;
      if(!uuid(p_request))return fail();return Object.freeze({name,body:JSON.stringify({p_request})});
    }
    case 'register_profile':case 'resubmit_profile':{
      const p=command.params;if(!p)return fail();const {p_request,p_name,p_cpf}=p;
      const p_previous=name==='resubmit_profile'?(p as Extract<OnboardingCommand,{name:'resubmit_profile'}>['params']).p_previous:undefined;
      if(!uuid(p_request)||!text(p_name,120)||typeof p_cpf!=='string'||!/^\d{11}$/.test(p_cpf)||name==='resubmit_profile'&&!uuid(p_previous))return fail();
      return Object.freeze({name,body:JSON.stringify({p_request,p_name,p_cpf,...(name==='resubmit_profile'?{p_previous}:{})})});
    }
    case 'request_company':case 'resubmit_company':{
      const p=command.params;if(!p)return fail();const {p_request,p_name,p_address,p_phone,p_cnpj}=p;
      const p_previous=name==='resubmit_company'?(p as Extract<OnboardingCommand,{name:'resubmit_company'}>['params']).p_previous:undefined;
      if(!uuid(p_request)||!text(p_name,160)||!text(p_address,500)||!text(p_phone,80)||typeof p_cnpj!=='string'||!/^[A-Z0-9]{12}\d{2}$/.test(p_cnpj)||name==='resubmit_company'&&!uuid(p_previous))return fail();
      return Object.freeze({name,body:JSON.stringify({p_request,p_name,p_address,p_phone,p_cnpj,...(name==='resubmit_company'?{p_previous}:{})})});
    }
    default:return fail();
  }
}
