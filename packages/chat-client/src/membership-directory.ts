import {unreadCountsParams,unreadCountsCommand,decodeUnreadCounts,markInboxReadParams,decodeMarkedRead} from './unread-counts.ts';
import {inboxSearchParams,inboxSearchCommand,decodeInboxSearch} from './inbox-search.ts';
import {recentInboxParams,recentInboxCommand,decodeRecentInbox,type InboxCursor,type InboxMessage} from './recent-inbox.ts';
// Candidate port/adapter only. No HTTP, credentials, login, UI or persistence.
import {companySearchKey} from './company-search-key.ts';
export type MemberRole='manager'|'patient'|'staff';export type MemberState='pending'|'active'|'revoked';
type Command=Readonly<{name:string;params:Readonly<Record<string,string|null>>}>;
export type MembershipRpc=(command:Command,signal:AbortSignal)=>Promise<Readonly<{data:unknown;error:null}|{data:null;error:Readonly<{code:string}>}>>;
type Result<T>=Readonly<{ok:true;value:T}|{ok:false;code:'UNAVAILABLE'|'INVALID_INPUT'|'UNCERTAIN'}>;
export type CompanyPublic=Readonly<{companyId:string;name:string;address:string;phone:string}>;
export type OwnMembership=CompanyPublic&Readonly<{role:MemberRole;state:MemberState;conversationId:string|null}>;
export type ManagedStaff=Readonly<{companyId:string;userId:string;displayName:string;state:MemberState}>;
export type StaffConversation=Readonly<{companyId:string;conversationId:string;patientId:string;displayName:string;latestMessage?:InboxMessage|null;unreadCount?:number}>;
export type MemberCursor=Readonly<{companyId:string;role:MemberRole}>;
type Page<T,C>=Readonly<{items:readonly T[];hasMore:boolean;nextCursor:C|null}>;
const uuid=(s:unknown):s is string=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s),record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v),role=(s:unknown):s is MemberRole=>s==='manager'||s==='patient'||s==='staff',state=(s:unknown):s is MemberState=>s==='pending'||s==='active'||s==='revoked';
function text(v:unknown,max:number,required=false):v is string{if(typeof v!=='string'||[...v].length>max||required&&!v.trim()||/[\u0000-\u001f\u007f]/.test(v))return false;for(let i=0;i<v.length;i++){const c=v.charCodeAt(i);if(c>=0xd800&&c<=0xdbff){const low=v.charCodeAt(++i);if(!(low>=0xdc00&&low<=0xdfff))return false;}else if(c>=0xdc00&&c<=0xdfff)return false;}return true;}
const invalid=()=>{throw Error('Membership unavailable');},failure=(code:'UNAVAILABLE'|'INVALID_INPUT'|'UNCERTAIN')=>Object.freeze({ok:false as const,code});
// Only these names/parameters can be sent. Never accept caller subject, role,
// verification flags, URL, schema, SQL, arbitrary column list or error details.
export function membershipPayload(command:Command):Command{
 if(!record(command)||!record(command.params))return invalid();const p=command.params;let params:Record<string,string|null>;
 switch(command.name){
  case 'search_connect_companies':if(!text(p.p_query,80,true)||[...p.p_query.trim()].length<2||[...companySearchKey(p.p_query.trim())].length<2||p.p_after!==null&&!uuid(p.p_after))return invalid();params={p_query:p.p_query,p_after:p.p_after};break;
  case 'my_connect_memberships':if(p.p_after_company===null&&p.p_after_role===null)params={p_after_company:null,p_after_role:null};else{if(!uuid(p.p_after_company)||!role(p.p_after_role))return invalid();params={p_after_company:p.p_after_company,p_after_role:p.p_after_role};}break;
  case 'connect_unread_counts':params=unreadCountsParams(p);break;
  case 'mark_connect_conversation_read':params=markInboxReadParams(p);break;
  case 'connect_staff_inbox_search':params=inboxSearchParams(p);break;
  case 'connect_staff_inbox_recent':params=recentInboxParams(p);break;
  case 'managed_connect_staff':case 'connect_staff_inbox':if(!uuid(p.p_company)||p.p_after!==null&&!uuid(p.p_after))return invalid();params={p_company:p.p_company,p_after:p.p_after};break;
  case 'link_patient':case 'request_staff':if(!uuid(p.p_company))return invalid();params={p_company:p.p_company};break;
  case 'approve_staff':case 'revoke_staff':if(!uuid(p.p_company)||!uuid(p.p_user))return invalid();params={p_company:p.p_company,p_user:p.p_user};break;
  case 'accept_staff_invite':if(!uuid(p.p_invite)||typeof p.p_token!=='string'||!/^[A-Za-z0-9_-]{32,256}$/.test(p.p_token))return invalid();params={p_invite:p.p_invite,p_token:p.p_token};break;
  default:return invalid();
 }return Object.freeze({name:command.name,params:Object.freeze(params)});
}
function company(v:Record<string,unknown>):CompanyPublic{if(!uuid(v.company_id)||!text(v.name,160,true)||!text(v.address,500)||!text(v.phone,80))return invalid();return Object.freeze({companyId:v.company_id,name:v.name,address:v.address,phone:v.phone});}
function page<T,C>(raw:unknown,decode:(v:Record<string,unknown>)=>T,key:(v:T)=>string,cursor:(v:T)=>C,wireCursor:(v:unknown)=>C,after:string|null):Page<T,C>{
 if(!record(raw)||!Array.isArray(raw.items)||raw.items.length>10||typeof raw.has_more!=='boolean')return invalid();let last=after??'';const items:T[]=[];
 for(const item of raw.items){if(!record(item))return invalid();const value=decode(item),next=key(value);if(next<=last)return invalid();last=next;items.push(value);}
 if(raw.has_more){if(items.length!==10||JSON.stringify(wireCursor(raw.next_cursor))!==JSON.stringify(cursor(items.at(-1)!)))return invalid();}else if(raw.next_cursor!==null)return invalid();
 return Object.freeze({items:Object.freeze(items),hasMore:raw.has_more,nextCursor:raw.has_more?cursor(items.at(-1)!):null});
}
const stringCursor=(v:unknown)=>uuid(v)?v:invalid();
function memberCursor(v:unknown):MemberCursor{if(!record(v)||!uuid(v.company_id)||!role(v.role))return invalid();return Object.freeze({companyId:v.company_id,role:v.role});}
export function createMembershipDirectory(deps:{rpc:MembershipRpc;current:()=>boolean;schedule:(fn:()=>void,ms:number)=>()=>void;timeoutMs:number;maxPending?:number}){
 if(!Number.isSafeInteger(deps.timeoutMs)||deps.timeoutMs<1||deps.timeoutMs>60000||!Number.isSafeInteger(deps.maxPending??4)||(deps.maxPending??4)<1||(deps.maxPending??4)>16)throw Error('Membership unavailable');
 let closed=false;const jobs=new Set<()=>void>();const active=()=>{try{return !closed&&deps.current()===true;}catch{return false;}};
 async function call<T>(input:Command,write:boolean,decode:(v:unknown)=>T,signal?:AbortSignal):Promise<Result<T>>{
  let command:Command;try{command=membershipPayload(input);}catch{return failure('INVALID_INPUT');}if(!active()||signal?.aborted||jobs.size>=(deps.maxPending??4))return failure('UNAVAILABLE');
  let dispatched=false,stopTimer=()=>{},interrupted=false,resolve!:(v:Result<T>)=>void;const ac=new AbortController(),interruption=new Promise<Result<T>>(r=>{resolve=r;});
  const stop=()=>{if(interrupted)return;interrupted=true;ac.abort();resolve(failure(write&&dispatched?'UNCERTAIN':'UNAVAILABLE'));};jobs.add(stop);signal?.addEventListener('abort',stop,{once:true});
  try{stopTimer=deps.schedule(stop,deps.timeoutMs);}catch{stop();}
  const work=Promise.resolve().then(async():Promise<Result<T>>=>{if(!active()||interrupted||signal?.aborted)return failure('UNAVAILABLE');dispatched=true;try{const reply=await deps.rpc(command,ac.signal);if(!active()||interrupted)return failure('UNAVAILABLE');if(!record(reply)||!('data'in reply)||!('error'in reply))return failure(write?'UNCERTAIN':'UNAVAILABLE');if(reply.error!==null){const definite=record(reply.error)&&['P0001','42501','RATE_LIMITED','40001','40P01'].includes(String(reply.error.code));return failure(write&&!definite?'UNCERTAIN':'UNAVAILABLE');}return Object.freeze({ok:true,value:decode(reply.data)});}catch{return failure(write?'UNCERTAIN':'UNAVAILABLE');}}).finally(()=>{jobs.delete(stop);try{stopTimer();}catch{}signal?.removeEventListener('abort',stop);});
  // If a port ignores AbortSignal, its admission slot remains occupied until it
  // actually settles. A timeout never opens unlimited uncooperative requests.
  return Promise.race([work,interruption]);
 }
 const read=<T>(command:Command,decode:(v:unknown)=>T,signal?:AbortSignal)=>call(command,false,decode,signal);
 const mutate=(command:Command,signal?:AbortSignal)=>call(command,true,v=>v===null?Object.freeze({acknowledged:true}):invalid(),signal);
 return Object.freeze({
  searchCompanies:(query:string,after:string|null=null,signal?:AbortSignal)=>read({name:'search_connect_companies',params:{p_query:query,p_after:after}},v=>page(v,company,c=>c.companyId,c=>c.companyId,stringCursor,after),signal),
  myMemberships:(after:MemberCursor|null=null,signal?:AbortSignal)=>{if(after!==null&&(!record(after)||!uuid(after.companyId)||!role(after.role)))return Promise.resolve(failure('INVALID_INPUT'));const companyAfter=after?.companyId??null,roleAfter=after?.role??null;return read({name:'my_connect_memberships',params:{p_after_company:companyAfter,p_after_role:roleAfter}},v=>page(v,(item):OwnMembership=>{const c=company(item);if(!role(item.role)||!state(item.state)||(item.conversation_id!==null&&!uuid(item.conversation_id))||item.conversation_id!==null&&(item.role!=='patient'||item.state!=='active'))return invalid();return Object.freeze({...c,role:item.role,state:item.state,conversationId:item.conversation_id});},m=>m.companyId+':'+m.role,m=>Object.freeze({companyId:m.companyId,role:m.role}),memberCursor,companyAfter?companyAfter+':'+roleAfter:null),signal);},
  managedStaff:(co:string,after:string|null=null,signal?:AbortSignal)=>read({name:'managed_connect_staff',params:{p_company:co,p_after:after}},v=>page(v,(r):ManagedStaff=>{if(r.company_id!==co||!uuid(r.user_id)||!text(r.display_name,120,true)||!state(r.state))return invalid();return Object.freeze({companyId:co,userId:r.user_id,displayName:r.display_name,state:r.state});},r=>r.userId,r=>r.userId,stringCursor,after),signal),
  inbox:(co:string,after:string|null=null,signal?:AbortSignal)=>read({name:'connect_staff_inbox',params:{p_company:co,p_after:after}},v=>page(v,(r):StaffConversation=>{if(r.company_id!==co||!uuid(r.conversation_id)||!uuid(r.patient_id)||!text(r.display_name,120,true))return invalid();return Object.freeze({companyId:co,conversationId:r.conversation_id,patientId:r.patient_id,displayName:r.display_name});},r=>r.conversationId,r=>r.conversationId,stringCursor,after),signal),
  unreadCounts:(co:string,ids:readonly string[],signal?:AbortSignal)=>{let command:Command;try{command=unreadCountsCommand(co,ids);}catch{return Promise.resolve(failure('INVALID_INPUT'));}return read(command,v=>decodeUnreadCounts(v,co,ids),signal);},
  markInboxRead:(co:string,cv:string,message:string,through:number,signal?:AbortSignal)=>call({name:'mark_connect_conversation_read',params:{p_company:co,p_conversation:cv,p_message:message,p_through:String(through)}},true,v=>decodeMarkedRead(v,co,cv,through),signal),
  searchInbox:(co:string,query:string,after:InboxCursor|null=null,signal?:AbortSignal)=>{let command:Command;try{command=inboxSearchCommand(co,query,after);}catch{return Promise.resolve(failure('INVALID_INPUT'));}return read(command,v=>decodeInboxSearch(v,co,query,after),signal);},
  recentInbox:(co:string,after:InboxCursor|null=null,signal?:AbortSignal)=>{let command:Command;try{command=recentInboxCommand(co,after);}catch{return Promise.resolve(failure('INVALID_INPUT'));}return read(command,v=>decodeRecentInbox(v,co,after),signal);},
  linkPatient:(co:string,signal?:AbortSignal)=>call({name:'link_patient',params:{p_company:co}},true,stringCursor,signal),
  requestStaff:(co:string,signal?:AbortSignal)=>mutate({name:'request_staff',params:{p_company:co}},signal),
  acceptStaffInvite:(invite:string,token:string,signal?:AbortSignal)=>mutate({name:'accept_staff_invite',params:{p_invite:invite,p_token:token}},signal),
  approveStaff:(co:string,user:string,signal?:AbortSignal)=>mutate({name:'approve_staff',params:{p_company:co,p_user:user}},signal),
  revokeStaff:(co:string,user:string,signal?:AbortSignal)=>mutate({name:'revoke_staff',params:{p_company:co,p_user:user}},signal),
  close:()=>{if(closed)return;closed=true;for(const stop of [...jobs])stop();},
 });
}
