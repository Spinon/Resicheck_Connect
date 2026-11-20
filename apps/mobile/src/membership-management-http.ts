import {membershipPayload} from '../../../packages/chat-client/src/membership-directory.ts';
import {AUTH_DIAGNOSTIC_ORIGIN as origin} from './auth-diagnostic-http.ts';
import {createMembershipReadFetch} from './membership-read-http.ts';

const managedRoutes=new Map(['mark_connect_conversation_read','search_connect_companies','managed_connect_staff','link_patient','request_staff','approve_staff','revoke_staff'].map(name=>['/rest/v1/rpc/'+name,name]));
const unavailable=()=>Error('Membership management connection unavailable');
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const bearer=(value:string|null)=>value!==null&&/^Bearer [A-Za-z0-9_.-]{1,8192}$/.test(value)&&!value.startsWith('Bearer sb_');
/** Fixed Connect boundary: six reviewed directory/management RPCs, plus the
 * existing pending registration and history read boundary. No server grant or
 * policy changes. Unknown and future capabilities never reach native I/O. */
export function createMembershipManagementFetch(nativeFetch:typeof fetch,publishableKey:string):typeof fetch{
 if(typeof nativeFetch!=='function'||!/^sb_publishable_[A-Za-z0-9_-]{1,200}$/.test(publishableKey))throw unavailable();
 const read=createMembershipReadFetch(nativeFetch,publishableKey);
 return (async(input,init)=>{
  if(typeof input!=='string')throw unavailable();
  const name=managedRoutes.get(input.slice(origin.length));
  if(!input.startsWith(origin)||name===undefined){try{return await read(input,init);}catch{throw unavailable();}}
  let request:RequestInit;
  try{
   if(!init)throw unavailable();
   const {method,body,headers:rawHeaders,signal,redirect,credentials}=init;
   if(method!=='POST'||!(signal instanceof AbortSignal)||signal.aborted||redirect!=='error'||credentials!=='omit'||typeof body!=='string'||body.length>12000||new TextEncoder().encode(body).byteLength>12000)throw unavailable();
   const headers=new Headers(rawHeaders),allowed=new Set(['apikey','accept','authorization','accept-profile','content-type','content-profile']);
   headers.forEach((_,key)=>{if(!allowed.has(key))throw unavailable();});
   if(headers.get('apikey')!==publishableKey||headers.get('accept')!=='application/json'||!bearer(headers.get('authorization'))||headers.get('accept-profile')!=='public'||headers.get('content-type')!=='application/json'||headers.get('content-profile')!=='public')throw unavailable();
   const parsed:unknown=JSON.parse(body);if(!record(parsed))throw unavailable();
   const command=membershipPayload({name,params:parsed as Record<string,string|null>});
   // The session transport emits this exact canonical JSON. Reject extras,
   // duplicate properties, alternative key ordering and ambiguous encodings.
   const projectedBody=JSON.stringify(command.params);if(body!==projectedBody)throw unavailable();
   headers.set('Cache-Control','no-store');if(signal.aborted)throw unavailable();
   request={method:'POST',body:projectedBody,headers,signal,redirect:'error',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'};
  }catch{throw unavailable();}
  try{return await nativeFetch(input,request);}catch{throw unavailable();}
 }) as typeof fetch;
}
