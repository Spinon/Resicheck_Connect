/** Internal deterministic native UI fixture. No native fetch, credentials or upstream I/O. */
export const companyRegistryVisualQaConfig=Object.freeze({schemaVersion:1,projectRef:'ibdlvlwdzmsrbqadrudb',projectUrl:'https://ibdlvlwdzmsrbqadrudb.supabase.co',publishableKey:'sb_publishable_isolated_visual_fixture'});
type Row={requestId:string;name:string;address:string;phone:string;status:'pending'|'rejected'|'approved';registry:'pending'|'mismatch'|'ready'|'approved'};
export function createCompanyRegistryVisualQaFixture(emit:(event:Readonly<{name:string;count:number}>)=>void){
 const counts=new Map<string,number>(),rows=new Map<string,Row>(),ids:string[]=[];let latest:string|null=null,checks=0;
 const id=(n:number)=>'e2240000-0000-4000-8000-'+String(n).padStart(12,'0'),user=id(1),company=id(2),proof=id(3);
 const assert=(ok:unknown):void=>{if(!ok)throw Error('Isolated registry fixture rejected request');};
 const dto=(r:Row)=>({request_id:r.requestId,company_id:company,name:r.name,address:r.address,phone:r.phone,registration_state:r.status,representation_state:'unconfirmed'});
 const snapshot=()=>Object.freeze({counts:Object.fromEntries(counts),requests:ids.length,latestStatus:latest?rows.get(latest)?.status:null});
 const fetcher:typeof fetch=async(input,init)=>{
  assert(typeof input==='string'&&init?.method==='POST'||typeof input==='string'&&new URL(input).pathname==='/auth/v1/user');
  const url=new URL(String(input));assert(url.origin===companyRegistryVisualQaConfig.projectUrl&&!url.hash);const name=url.pathname.split('/').at(-1)!;
  assert(/^[a-z_]+$/.test(name)||name==='connect-company-registry-check');
  const body=init?.body?JSON.parse(String(init.body)):{};const count=(counts.get(name)??0)+1;counts.set(name,count);emit(Object.freeze({name,count}));
  const response=(data:unknown,status=200):Response=>{const text=status===204?'':JSON.stringify(data),bytes=new TextEncoder().encode(text);return {status,ok:status>=200&&status<300,redirected:false,url:'',headers:new Headers({'Content-Type':'application/json','Content-Length':String(bytes.length)}),body:{getReader(){let sent=false;return {async read(){if(sent)return {done:true,value:undefined};sent=true;return {done:false,value:bytes};},async cancel(){sent=true;},releaseLock(){}};},async cancel(){}},async json(){return data;},async text(){return text;},clone(){return response(data,status);}} as unknown as Response;};let data:unknown;
  if(url.pathname==='/auth/v1/token'){assert(body.email==='cnpj-native@example.invalid'&&body.password==='synthetic-only-password');data={access_token:'fixture.registry.visual',refresh_token:'fixture-refresh-only',expires_in:3600,token_type:'bearer',user:{id:user,role:'authenticated'}};}
  else if(url.pathname==='/auth/v1/user')data={id:user,role:'authenticated'};
  else if(url.pathname==='/auth/v1/logout')return response(null,204);
  else if(name==='my_profile_registration')data={profile_id:user,display_name:'Pessoa sintetica',registration_state:'approved',identity_state:'unconfirmed'};
  else if(name==='my_profile_registration_request')data={request_id:id(8),registration_state:'approved'};
  else if(name==='my_company_registration_page')data={request_ids:[...ids].sort(),has_more:false,next_cursor:null};
  else if(name==='my_company_registration'){assert(rows.has(body.p_request));data=dto(rows.get(body.p_request)!);}
  else if(name==='my_connect_staff_employer')data={state:'none'};
  else if(name==='my_connect_memberships'){const row=latest?rows.get(latest):null;data={items:row?.status==='approved'?[{company_id:company,name:row.name,address:row.address,phone:row.phone,role:'manager',state:'active',conversation_id:null}]:[],has_more:false,next_cursor:null};}
  else if(name==='request_company'||name==='resubmit_company'){
   assert(body.p_cnpj==='12ABC34501DE35'&&/^[a-f0-9-]{36}$/.test(body.p_request));
   if(name==='resubmit_company')assert(body.p_previous===latest&&rows.get(latest!)?.status==='rejected'&&body.p_request!==latest&&count===1);else assert(ids.length===0&&count===1);
   latest=body.p_request;ids.push(latest!);const row:Row={requestId:latest!,name:body.p_name,address:body.p_address,phone:body.p_phone,status:'pending',registry:'pending'};rows.set(latest!,row);data=dto(row);
  }else if(name==='withdraw_company'){assert(body.p_request===latest&&rows.get(latest!)?.status==='pending'&&count===1);const row=rows.get(latest!)!;row.status='rejected';data=dto(row);}
  else if(url.pathname==='/functions/v1/connect-company-registry-check'){
   assert(body.p_request===latest&&Object.keys(body).sort().join(',')==='p_operation,p_request'&&rows.get(latest!)?.status==='pending');checks++;assert(checks<=3);rows.get(latest!)!.registry=checks===1?'mismatch':'ready';data={request_id:latest,state:'checking'};
  }else if(name==='my_company_registry_check'){
   const row=rows.get(body.p_request);assert(row);data=row!.registry==='ready'?{request_id:row!.requestId,state:'ready',proof_id:proof,expires_at:new Date(Date.now()+(checks===2?-1000:60000)).toISOString()}:row!.registry==='approved'?{request_id:row!.requestId,state:'approved',company_id:company}:{request_id:row!.requestId,state:row!.registry};
  }else if(name==='finalize_registry_company'){
   assert(body.p_request===latest&&body.p_proof===proof&&checks===3&&rows.get(latest!)?.registry==='ready'&&count===1);const row=rows.get(latest!)!;row.registry='approved';row.status='approved';throw Error('Synthetic acknowledgement lost');
  }else{emit(Object.freeze({name:'unexpected',count:1}));throw Error('Isolated registry route unavailable');}
  return response(data);
 };
 return Object.freeze({fetcher,snapshot});
}
