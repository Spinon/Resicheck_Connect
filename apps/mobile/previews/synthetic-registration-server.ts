// A deliberately fictional server for isolated QA. Never use as authorization.
type ResponseFactory=(value:unknown,status?:number)=>Response;
export function createSyntheticRegistrationServer(json:ResponseFactory){
  const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002',company='00000000-0000-4000-8000-000000000003';
  const profileRequests=new Map<string,string>();
const profiles=new Map<string,unknown>(),companies=new Map<string,Map<string,unknown>>(),tokens=new Map<string,string>();
  let writes=0,dropAck=false,denyReads=false,tokenId=0;
  const profileCorrections=new Map<string,{previous:string;name:string}>(),companyCorrections=new Map<string,{previous:string;name:string;address:string;phone:string}>(),withdrawals=new Map<string,{request:string;kind:string}>(),pastCompanyRequests=new Set<string>();
  const denied=()=>json({code:'P0001'},400);
  function acknowledge(value:unknown){if(dropAck){dropAck=false;throw Error('Synthetic lost acknowledgement');}return json(value);}
  const fakeFetch:typeof fetch=async(input,init)=>{
    const url=new URL(String(input)),data=init?.body?JSON.parse(String(init.body)):{};
    const bearer=new Headers(init?.headers).get('Authorization')?.slice(7),userId=bearer?tokens.get(bearer):null;
    if(url.pathname==='/auth/v1/signup')return json({id:a});
    if(url.pathname==='/auth/v1/token'){const user=data.email?.startsWith('second')?b:a,token=`synthetic.${++tokenId}.jwt`;tokens.set(token,user);return json({access_token:token,refresh_token:'opaque-synthetic',expires_in:3600,token_type:'bearer',user:{id:user,role:'authenticated'}});}
    if(url.pathname==='/auth/v1/logout'){if(bearer)tokens.delete(bearer);return json(null,204);}
    if(!userId)return json({code:'42501'},403);
    if(url.pathname==='/auth/v1/user')return json({id:userId,role:'authenticated'});
    const name=url.pathname.split('/').at(-1);
    if(denyReads&&name?.startsWith('my_'))throw Error('Synthetic unavailable');
    if(name==='my_profile_registration')return json(profiles.get(userId)??{registration_state:'not_started'});
    if(name==='my_profile_registration_request')return json({request_id:profileRequests.get(userId)??null,registration_state:(profiles.get(userId) as {registration_state:string}|undefined)?.registration_state??'not_started'});
  if(name==='my_company_registration_page'){const ids=[...(companies.get(userId)?.keys()??[])].sort().filter(id=>data.p_after==null||id>data.p_after),selected=ids.slice(0,10);return json({request_ids:selected,has_more:ids.length>10,next_cursor:ids.length>10?selected.at(-1):null});}
  if(name==='my_company_registration_index')return json({request_ids:[...(companies.get(userId)?.keys()??[])],has_more:false});
    if(name==='my_company_registration')return json(companies.get(userId)?.get(data.p_request)??null);
    if(name==='withdraw_profile'){
      const profile=profiles.get(userId) as Record<string,unknown>|undefined,key=userId+':'+data.p_operation,prior=withdrawals.get(key);
      if(prior)return prior.kind==='profile'&&prior.request===data.p_request?acknowledge(profile):denied();
      if(!profile||profileRequests.get(userId)!==data.p_request||profile.registration_state!=='pending')return denied();
      profiles.set(userId,{...profile,registration_state:'rejected'});for(const [id,raw] of companies.get(userId)??[]){const c=raw as Record<string,unknown>;if(c.registration_state==='pending')companies.get(userId)!.set(id,{...c,registration_state:'rejected'});}
      withdrawals.set(key,{request:data.p_request,kind:'profile'});writes++;return acknowledge(profiles.get(userId));
    }
    if(name==='resubmit_profile'){
      const profile=profiles.get(userId) as Record<string,unknown>|undefined,key=userId+':'+data.p_request,prior=profileCorrections.get(key);
      if(prior)return prior.previous===data.p_previous&&prior.name===data.p_name&&profileRequests.get(userId)===data.p_request&&profile?.registration_state==='pending'?acknowledge(profile):denied();
      if(!profile||profile.registration_state!=='rejected'||profileRequests.get(userId)!==data.p_previous||data.p_previous===data.p_request)return denied();
      const dto={...profile,display_name:data.p_name,registration_state:'pending'};profiles.set(userId,dto);profileRequests.set(userId,data.p_request);profileCorrections.set(key,{previous:data.p_previous,name:data.p_name});writes++;return acknowledge(dto);
    }
    if(name==='withdraw_company'){
      const own=companies.get(userId),company=own?.get(data.p_request) as Record<string,unknown>|undefined,key=userId+':'+data.p_operation,prior=withdrawals.get(key);
      if(prior)return prior.kind==='company'&&prior.request===data.p_request?acknowledge(company):denied();
      if(!company||company.registration_state!=='pending'||company.representation_state!=='unconfirmed')return denied();
      const dto={...company,registration_state:'rejected'};own!.set(data.p_request,dto);withdrawals.set(key,{request:data.p_request,kind:'company'});writes++;return acknowledge(dto);
    }
    if(name==='resubmit_company'){
      const own=companies.get(userId),profile=profiles.get(userId) as Record<string,unknown>|undefined,key=userId+':'+data.p_request,prior=companyCorrections.get(key);
      if(prior){const current=own?.get(data.p_request) as Record<string,unknown>|undefined;return prior.previous===data.p_previous&&prior.name===data.p_name&&prior.address===data.p_address&&prior.phone===data.p_phone&&current?.registration_state==='pending'?acknowledge(current):denied();}
      const old=own?.get(data.p_previous) as Record<string,unknown>|undefined;
      if(!old||!profile||profile.registration_state==='rejected'||old.registration_state!=='rejected'||old.representation_state!=='unconfirmed'||own!.has(data.p_request)||pastCompanyRequests.has(userId+':'+data.p_request))return denied();
      const dto={...old,request_id:data.p_request,name:data.p_name,address:data.p_address,phone:data.p_phone,registration_state:'pending'};own!.delete(data.p_previous);own!.set(data.p_request,dto);pastCompanyRequests.add(userId+':'+data.p_previous);companyCorrections.set(key,{previous:data.p_previous,name:data.p_name,address:data.p_address,phone:data.p_phone});writes++;return acknowledge(dto);
    }
    if(name==='register_profile'){writes++;profileRequests.set(userId,data.p_request);const dto={profile_id:userId,display_name:data.p_name,registration_state:'pending',identity_state:'unconfirmed'};profiles.set(userId,dto);return json(dto);}
    if(name==='request_company'){writes++;let own=companies.get(userId);if(!own){own=new Map();companies.set(userId,own);}const dto={company_id:company,request_id:data.p_request,name:data.p_name,address:data.p_address,phone:data.p_phone,registration_state:'pending',representation_state:'unconfirmed'};own.set(data.p_request,dto);if(dropAck){dropAck=false;throw Error('Synthetic lost acknowledgement');}return json(dto);}
    return json({code:'42501'},403);
  };
  function seedCompanyHistory(){
    profileCorrections.clear();companyCorrections.clear();withdrawals.clear();pastCompanyRequests.clear();
    const request=(n:number)=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
    profileRequests.set(a,request(1));profiles.set(a,{profile_id:a,display_name:'Pessoa fictícia A',registration_state:'pending',identity_state:'unconfirmed'});
    companies.set(a,new Map(Array.from({length:12},(_,i)=>{const id=request(100+i);return[id,{company_id:'20000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),request_id:id,name:'Empresa fictícia '+String(i+1).padStart(2,'0'),address:'Endereço fictício',phone:'Telefone fictício',registration_state:'rejected',representation_state:'unconfirmed'}];})));
    profiles.delete(b);profileRequests.delete(b);companies.delete(b);
  }
  function seedRejectedProfile(){seedCompanyHistory();companies.delete(a);profiles.set(a,{...(profiles.get(a) as Record<string,unknown>),registration_state:'rejected'});}
  function rejectCurrentProfile(){const p=profiles.get(a) as Record<string,unknown>|undefined;if(p?.registration_state==='pending'){profiles.set(a,{...p,registration_state:'rejected'});for(const [id,raw] of companies.get(a)??[]){const c=raw as Record<string,unknown>;if(c.registration_state==='pending')companies.get(a)!.set(id,{...c,registration_state:'rejected'});}}}
  return Object.freeze({fetch:fakeFetch,counts:()=>({writes}),dropNextAck:()=>{dropAck=true;},denyReads:(deny:boolean)=>{denyReads=deny;},seedCompanyHistory,seedRejectedProfile,rejectCurrentProfile});
}
