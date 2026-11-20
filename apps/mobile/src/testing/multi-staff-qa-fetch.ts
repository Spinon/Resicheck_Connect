// Internal two-employee QA. Every authorization remains enforced by the real backend.
const project='https://ibdlvlwdzmsrbqadrudb.supabase.co';
const actors=new Set(['69cf7bf8-ae10-488c-b3cc-f1eedf7078ce','aa8fdd8b-442e-422f-ae1b-dfceb9ac4ada']);
const company='678e7072-b9d9-489f-8f4a-827ebc3fc340',conversation='d834fa16-90ab-4065-a9a7-5da30ac71945';
const reads=new Set(['my_profile_registration','my_profile_registration_request','my_company_registration_page','my_company_registration','my_connect_staff_employer','my_connect_memberships','my_company_registry_check','connect_staff_inbox','connect_staff_inbox_recent','connect_staff_inbox_search','connect_unread_counts','lookup_connect_own_message_status_v1']);
const receipts=new Set(['mark_connect_messages_received_v1','mark_connect_messages_visualized_v1','mark_connect_messages_seen_v1']);
const unavailable=()=>Error('QA request unavailable');
export function createMultiStaffQaFetch(projectUrl:string,nativeFetch:typeof fetch):typeof fetch{
 if(projectUrl!==project||typeof nativeFetch!=='function')throw unavailable();let verifiedAuthorization:string|null=null;
 return async(input,init)=>{
  if(typeof input!=='string')throw unavailable();const url=new URL(input),method=init?.method??'GET';if(url.origin!==project)throw unavailable();
  const name=url.pathname.match(/^\/rest\/v1\/rpc\/([a-z_][a-z_0-9]*)$/)?.[1];
  if(name){
   if(method!=='POST')throw unavailable();
   if(receipts.has(name)){
    if(!verifiedAuthorization||new Headers(init?.headers).get('authorization')!==verifiedAuthorization||typeof init?.body!=='string')throw unavailable();
    const p=JSON.parse(init.body);if(p.p_company!==company||p.p_conversation!==conversation)throw unavailable();
   }else if(!reads.has(name))throw unavailable();
   return nativeFetch(input,init);
  }
  if(['/rest/v1/messages','/rest/v1/conversations'].includes(url.pathname)){if(method!=='GET')throw unavailable();return nativeFetch(input,init);}
  if(!['/auth/v1/token','/auth/v1/user','/auth/v1/logout'].includes(url.pathname)||url.pathname==='/auth/v1/user'&&method!=='GET'||url.pathname!=='/auth/v1/user'&&method!=='POST')throw unavailable();
  if(url.pathname==='/auth/v1/logout')verifiedAuthorization=null;
  const response=await nativeFetch(input,init);
  if(url.pathname==='/auth/v1/user'){
   verifiedAuthorization=null;const header=new Headers(init?.headers).get('authorization');if(response.ok&&header?.startsWith('Bearer ')&&actors.has((await response.clone().json()).id))verifiedAuthorization=header;
  }
  return response;
 };
}
