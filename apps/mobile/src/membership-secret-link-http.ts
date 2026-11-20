import{membershipLinkCommand}from '../../../packages/chat-client/src/membership-secret-link.ts';
import{AUTH_DIAGNOSTIC_ORIGIN as origin}from './auth-diagnostic-http.ts';
const prefix=origin+'/rest/v1/rpc/',names=new Set(['issue_membership_secret_link_v1','accept_membership_secret_link_v1','revoke_membership_secret_link_v1','list_membership_secret_links_v1']);
const fail=()=>Error('Invitation connection unavailable');
export function createMembershipSecretLinkFetch(nativeFetch:typeof fetch,key:string,existing:typeof fetch,enabled=false):typeof fetch{
 if(typeof nativeFetch!=='function'||typeof existing!=='function'||typeof enabled!=='boolean'||!/^sb_publishable_[A-Za-z0-9_-]{1,200}$/.test(key))throw fail();
 return(async(input,init)=>{
  if(typeof input!=='string')throw fail();
  const rpc=input.startsWith(prefix)?input.slice(prefix.length):null,company=input.startsWith(origin+'/rest/v1/companies?');
  if(!company&&(!rpc||!names.has(rpc))){try{return await existing(input,init);}catch{throw fail();}}
  if(!enabled)throw fail();
  try{
   if(!init||!(init.signal instanceof AbortSignal)||init.signal.aborted||init.redirect!=='error'||init.credentials!=='omit'||init.cache!=='no-store'||init.referrerPolicy!=='no-referrer')throw fail();
   const headers=new Headers(init.headers),allowed=new Set(['apikey','authorization','accept','accept-profile','content-profile','content-type']);
   headers.forEach((_,k)=>{if(!allowed.has(k))throw fail();});
   if(headers.get('apikey')!==key||headers.get('accept')!=='application/json'||headers.get('accept-profile')!=='public'||!/^Bearer [A-Za-z0-9_.-]{1,8192}$/.test(headers.get('authorization')??'')||headers.get('authorization')?.startsWith('Bearer sb_'))throw fail();
   if(company){
    if(init.method!=='GET'||init.body!==undefined)throw fail();
    const u=new URL(input),id=u.searchParams.get('id')?.slice(3);
    if(!id||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id))throw fail();
    const query=new URLSearchParams({select:'id,name,address,phone',id:'eq.'+id,limit:'1'});
    if(input!==origin+'/rest/v1/companies?'+query.toString())throw fail();
   }else{
    if(init.method!=='POST'||typeof init.body!=='string'||init.body.length>1500||headers.get('content-type')!=='application/json'||headers.get('content-profile')!=='public')throw fail();
    const command=membershipLinkCommand({name:rpc,params:JSON.parse(init.body)});
    if(JSON.stringify(command.params)!==init.body)throw fail();
   }
   return await nativeFetch(input,init);
  }catch{throw fail();}
 }) as typeof fetch;
}
