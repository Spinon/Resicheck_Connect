import {membershipPayload} from '../../../packages/chat-client/src/membership-directory.ts';
import {AUTH_DIAGNOSTIC_ORIGIN as origin} from './auth-diagnostic-http.ts';
import {createPendingRegistrationFetch} from './pending-registration-http.ts';

const pendingRoutes=new Set(['/auth/v1/signup','/auth/v1/token?grant_type=password','/auth/v1/token?grant_type=refresh_token','/auth/v1/user','/auth/v1/logout?scope=local',
 ...['register_profile','request_company','my_profile_registration','my_profile_registration_request','my_company_registration_page','my_company_registration'].map(name=>'/rest/v1/rpc/'+name)]);
const readRpcs=new Set(['connect_unread_counts','connect_staff_inbox_search','connect_staff_inbox_recent','my_connect_memberships','my_connect_staff_employer','connect_staff_inbox']);
const messageFields='id,company_id,conversation_id,sender_id,sender_role,sequence,accepted_at,kind,body,important';
const unavailable=()=>Error('Membership read connection unavailable');
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const keys=(value:object)=>Object.keys(value).sort().join(',');
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const eqUuid=(value:string|null)=>value!==null&&value.startsWith('eq.')&&uuid(value.slice(3));
const integer=(value:string|null,min:number,max=Number.MAX_SAFE_INTEGER)=>value!==null&&/^(?:0|[1-9][0-9]*)$/.test(value)&&Number.isSafeInteger(Number(value))&&Number(value)>=min&&Number(value)<=max;
const sequence=(value:string|null,operator:'gt.'|'lt.',min:number)=>value!==null&&value.startsWith(operator)&&integer(value.slice(operator.length),min);
const bearer=(value:string|null)=>value!==null&&/^Bearer [A-Za-z0-9_.-]{1,8192}$/.test(value)&&!value.startsWith('Bearer sb_');

function readUrl(url:string):boolean{
 const parsed=new URL(url),q=parsed.searchParams;
 if(parsed.origin!==origin||parsed.hash||parsed.username||parsed.password)return false;
 let canonical:URLSearchParams;
 if(parsed.pathname==='/rest/v1/conversations'){
  if(q.get('select')!=='id,company_id,patient_id'||!eqUuid(q.get('company_id'))||!eqUuid(q.get('id'))||q.get('limit')!=='1')return false;
  canonical=new URLSearchParams({select:'id,company_id,patient_id',company_id:q.get('company_id')!,id:q.get('id')!,limit:'1'});
 }else if(parsed.pathname==='/rest/v1/messages'){
  const projection=q.get('select');
  if(projection!==messageFields&&projection!=='id,sequence'||!eqUuid(q.get('company_id'))||!eqUuid(q.get('conversation_id')))return false;
  const common={select:projection!,company_id:q.get('company_id')!,conversation_id:q.get('conversation_id')!};
  if(projection==='id,sequence'){
   if(q.get('order')!=='sequence.desc'||q.get('limit')!=='1')return false;
   canonical=new URLSearchParams({...common,order:'sequence.desc',limit:'1'});
  }else if(q.get('order')==='sequence.desc'&&q.get('limit')==='26'){
   canonical=new URLSearchParams({...common,order:'sequence.desc',limit:'26'});
   if(q.has('sequence')){if(!sequence(q.get('sequence'),'lt.',1))return false;canonical.set('sequence',q.get('sequence')!);}
  }else if(q.get('order')==='sequence.asc'&&integer(q.get('limit'),1,25)&&sequence(q.get('sequence'),'gt.',0)){
   canonical=new URLSearchParams({...common,sequence:q.get('sequence')!,order:'sequence.asc',limit:q.get('limit')!});
  }else return false;
 }else return false;
 // Exact wire shapes produced by the existing channel/readRecent capability.
 // No duplicate keys, extra operators, aliases, arbitrary projections or paths.
 return url===origin+parsed.pathname+'?'+canonical.toString();
}

/** Client admission for membership/history READS plus the unchanged pending
 * registration surface. It does not make the server read-only or alter grants.
 * Explicit native fetch only; unknown routes never reach I/O, including link,
 * staff mutations, text send and flag setters. Server authorization stays vital. */
export function createMembershipReadFetch(nativeFetch:typeof fetch,publishableKey:string):typeof fetch{
 if(typeof nativeFetch!=='function'||!/^sb_publishable_[A-Za-z0-9_-]{1,200}$/.test(publishableKey))throw unavailable();
 const pending=createPendingRegistrationFetch(nativeFetch,publishableKey);
 return (async(input,init)=>{
  let url:string,request:RequestInit;
  try{
   if(typeof input!=='string'||!input.startsWith(origin)||!init)throw unavailable();
   url=input;const route=url.slice(origin.length);
   if(pendingRoutes.has(route)){try{return await pending(input,init);}catch{throw unavailable();}}
   const {method,body,headers:rawHeaders,signal,redirect,credentials}=init;
   if(!(signal instanceof AbortSignal)||signal.aborted||redirect!=='error'||credentials!=='omit')throw unavailable();
   const headers=new Headers(rawHeaders),allowed=new Set(['apikey','accept','authorization','accept-profile',...(method==='POST'?['content-type','content-profile']:[])]);
   headers.forEach((_,name)=>{if(!allowed.has(name))throw unavailable();});
   if(headers.get('apikey')!==publishableKey||headers.get('accept')!=='application/json'||!bearer(headers.get('authorization'))||headers.get('accept-profile')!=='public')throw unavailable();
   let projectedBody:string|undefined;
   if(method==='GET'){
    if(body!==undefined||!readUrl(url))throw unavailable();
   }else if(method==='POST'){
    const name=route.startsWith('/rest/v1/rpc/')?route.slice('/rest/v1/rpc/'.length):'';
    if(!readRpcs.has(name)||headers.get('content-type')!=='application/json'||headers.get('content-profile')!=='public'||typeof body!=='string'||body.length>12000||new TextEncoder().encode(body).length>12000)throw unavailable();
    const parsed:unknown=JSON.parse(body);if(!record(parsed))throw unavailable();
    const canonical=name==='my_connect_staff_employer'?{}:membershipPayload({name,params:parsed as Record<string,string|null>}).params;
    if(keys(parsed)!==keys(canonical))throw unavailable();projectedBody=JSON.stringify(canonical);
   }else throw unavailable();
   headers.set('Cache-Control','no-store');if(signal.aborted)throw unavailable();
   request={method,headers,body:projectedBody,signal,redirect:'error',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'};
  }catch{throw unavailable();}
  try{return await nativeFetch(url,request);}catch{throw unavailable();}
 }) as typeof fetch;
}
