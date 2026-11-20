import type {InboxCursor} from '../../../packages/chat-client/src/recent-inbox.ts';
import {createMembershipDirectory,type MembershipRpc,type OwnMembership,type CompanyPublic,type MemberCursor,type ManagedStaff,type StaffConversation} from '../../../packages/chat-client/src/membership-directory.ts';
import type {AuthView} from '../../../packages/session/src/auth-controller.ts';
import {staffRequestPolicy} from './staff-request-policy.ts';
import {createStaffEmployerReader,type StaffEmployerRpc,type StaffEmployerHint} from '../../../packages/chat-client/src/staff-employer.ts';
export type MembershipLease=Readonly<{userId:string;sessionKey:string;close:()=>void;membership:MembershipRpc;staffEmployer?:StaffEmployerRpc}>;
type AuthPort={snapshot:()=>AuthView;currentLease:()=>MembershipLease|null;subscribe:(fn:()=>void)=>()=>void;signOut:()=>Promise<unknown>};
type Gate={matches:(lease:MembershipLease)=>boolean;subscribe:(fn:()=>void)=>()=>void};
export type MemberContext=Readonly<{companyId:string;companyName:string;conversationId:string;kind:'patient'|'staff';clientName?:string}>;
type Notice='read-unavailable'|'read-uncertain'|'unavailable'|'uncertain'|'updated'|'invalid-query'|'capacity'|'staff-request-blocked'|null;
type View=Readonly<{scopeKey:number;stage:'signed-out'|'registration'|'ready'|'unavailable'|'paused';busy:boolean;query:string;searchState:'idle'|'loading'|'completed'|'failed';results:readonly CompanyPublic[];searchCursor:string|null;members:readonly OwnMembership[];memberCursor:MemberCursor|null;staffEmployer:StaffEmployerHint|undefined;managedCompany:string|null;staff:readonly ManagedStaff[];staffCursor:string|null;inboxUnreadEnabled:boolean;inboxOnlyUnread?:boolean;inboxQuery:string;inboxSearchEnabled:boolean;inboxSearchState:'idle'|'loading'|'completed'|'failed'|'invalid';inboxCompany:string|null;inbox:readonly StaffConversation[];inboxCursor:string|InboxCursor|null;context:MemberContext|null;notice:Notice}>;
type Api=ReturnType<typeof createMembershipDirectory>;
export type StaffRevokeConfirmation=Readonly<{cancel:()=>void;confirm:()=>Promise<boolean>}>;
export type SearchCancellation=Readonly<{cancel:()=>boolean}>;
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const unknownEmployer=Object.freeze({state:'unknown' as const});
const empty=Object.freeze([]),base={busy:false,query:'',searchState:'idle',results:empty,searchCursor:null,members:empty,memberCursor:null,staffEmployer:undefined,managedCompany:null,staff:empty,staffCursor:null,inboxCompany:null,inboxUnreadEnabled:false,inboxOnlyUnread:false,inboxQuery:'',inboxSearchEnabled:false,inboxSearchState:'idle',inbox:empty,inboxCursor:null,context:null,notice:null} as const;
// Memory-only foreground host. No auth creation/activation, raw credentials,
// invitation journal, HTTP or automatic retries. Backend remains authoritative.
export function createMembershipHost(deps:{auth:AuthPort;gate:Gate;schedule:(cb:()=>void,ms:number)=>()=>void;timeoutMs:number;maxRows?:number;recentInbox?:boolean;inboxSearch?:boolean;inboxUnread?:boolean}){
 if(deps.recentInbox!==undefined&&typeof deps.recentInbox!=='boolean')throw Error('Membership host unavailable');
 if(deps.inboxSearch!==undefined&&typeof deps.inboxSearch!=='boolean'||deps.inboxSearch===true&&deps.recentInbox!==true)throw Error('Membership host unavailable');
 if(deps.inboxUnread!==undefined&&typeof deps.inboxUnread!=='boolean'||deps.inboxUnread===true&&deps.recentInbox!==true)throw Error('Membership host unavailable');
 const maxRows=deps.maxRows??1000;if(!Number.isSafeInteger(maxRows)||maxRows<10||maxRows>1000)throw Error('Membership host unavailable');
 let disposed=false,paused=false,version=0,lease:MembershipLease|null=null,api:Api|null=null,job:AbortController|null=null,jobKind:'search'|'inbox-search'|'read'|'write'|null=null;
 let badgeRotation:Readonly<{epoch:number;company:string;query:string;ids:string;next:number}>|null=null;
 let employerReader:ReturnType<typeof createStaffEmployerReader>|null=null;
 type HintOwner={controller:AbortController;value:StaffEmployerHint;accepted:boolean};
 let employerHint:HintOwner|null=null,employerRpcPending=false;
 function cancelEmployerHint(){const previous=employerHint;employerHint=null;previous?.controller.abort();}
 let view:View=Object.freeze({...base,scopeKey:0,stage:'signed-out'});const observers=new Set<()=>void>();
 const removedPreviews=new Set<string>();
 const previewKey=(co:string,cv:string,id:string)=>co+'/'+cv+'/'+id;
 function protectInbox(rows:readonly StaffConversation[]){if(!removedPreviews.size)return rows;let changed=false;const safe=rows.map(row=>{const m=row.latestMessage;if(!m||!removedPreviews.has(previewKey(row.companyId,row.conversationId,m.id))||m.preview==='Mensagem removida'&&!m.truncated)return row;changed=true;return Object.freeze({...row,latestMessage:Object.freeze({...m,preview:'Mensagem removida',truncated:false})});});return changed?Object.freeze(safe):rows;}
 function publish(patch:Partial<View>){if(disposed)return;const inbox=protectInbox(patch.inbox??view.inbox);view=Object.freeze({...view,...patch,inbox});for(const f of [...observers])try{f();}catch{}}
 function enabled(){try{const a=deps.auth.snapshot(),l=a.status==='authenticated'?deps.auth.currentLease():null;return deps.auth.snapshot()===a&&l&&deps.gate.matches(l)?l:null;}catch{return null;}}
 function invalidate(){removedPreviews.clear();badgeRotation=null;version++;const old=job,oldApi=api,oldReader=employerReader,oldHint=employerHint;job=null;jobKind=null;employerHint=null;employerReader=null;api=null;lease=null;old?.abort();oldHint?.controller.abort();oldApi?.close();oldReader?.close();}
 const current=(epoch:number,captured:Api,bound:MembershipLease)=>!disposed&&!paused&&epoch===version&&api===captured&&lease===bound&&enabled()===bound;
 function reset(stage:View['stage']){const closing=version+1;invalidate();if(version===closing)publish({...base,scopeKey:view.scopeKey+1,stage});}
 function begin(kind:'search'|'inbox-search'|'read'|'write'){
  const previous=job,generation=version,captured=api,bound=lease;if(previous&&!((kind==='search'&&jobKind==='search')||(kind==='inbox-search'&&jobKind==='inbox-search')))return null;
  // Install the replacement before invoking old abort callbacks. A callback
  // may create an even newer operation; this caller must never overwrite it.
  const task=new AbortController();job=task;jobKind=kind;previous?.abort();
  if(disposed||paused||version!==generation||api!==captured||lease!==bound||job!==task||task.signal.aborted)return null;
  publish({busy:true,notice:null,...(employerReader&&view.staffEmployer===undefined?{staffEmployer:unknownEmployer}:{}),...(kind==='search'?{searchState:'loading' as const}:{})});return task;
 }
 function finish(task:AbortController){if(job===task){job=null;jobKind=null;publish({busy:false});}}
 const hasRole=(co:string,role:'patient'|'staff'|'manager')=>view.members.some(m=>m.companyId===co&&m.role===role&&m.state==='active');
 function join<T>(before:readonly T[],rows:readonly T[],key:(row:T)=>string){const seen=new Set(before.map(key));if(before.length+rows.length>maxRows||rows.some(r=>seen.has(key(r))))return null;return Object.freeze([...before,...rows]);}
 async function memberPage(captured:Api,bound:MembershipLease,epoch:number,task:AbortController,more:boolean){
  const cursor=more?view.memberCursor:null;if(more&&!cursor)return false;
  const reader=employerReader;
  let owner:HintOwner|null=null,accepted=false;
  const ownsPage=()=>current(epoch,captured,bound)&&job===task&&!task.signal.aborted;
  const abortEmployer=()=>owner?.controller.abort();
  try{
   // Each membership read owns its optional hint independently of later
   // search/write jobs. Superseding a page never adopts its stale hint.
   if(!ownsPage())return false;cancelEmployerHint();if(!ownsPage())return false;
   if(reader){
    const token:HintOwner={controller:new AbortController(),value:unknownEmployer,accepted:false};owner=token;employerHint=token;
    task.signal.addEventListener('abort',abortEmployer,{once:true});if(task.signal.aborted)abortEmployer();
    const apply=(value:StaffEmployerHint)=>{
     if(!current(epoch,captured,bound)||employerHint!==token||reader!==employerReader||token.controller.signal.aborted)return;
     token.value=value;
     // A hint never finishes the current job or alters roles/context/query.
     if(token.accepted&&view.staffEmployer!==value)publish({staffEmployer:value});
    };
    void reader.read(token.controller.signal).then(r=>apply(r.ok?r.value:unknownEmployer),()=>apply(unknownEmployer));
    if(view.staffEmployer!==unknownEmployer)publish({staffEmployer:unknownEmployer});
   }
   if(!ownsPage())return false;
   const result=await captured.myMemberships(cursor,task.signal);if(!ownsPage())return false;
   if(!result.ok){publish({...base,staffEmployer:reader?unknownEmployer:undefined,scopeKey:view.scopeKey+1,stage:'unavailable',busy:true,notice:'unavailable'});return false;}
   const rows=join(more?view.members:empty,result.value.items,m=>m.companyId+':'+m.role);if(!rows){publish({notice:'capacity'});return false;}
   accepted=true;if(owner)owner.accepted=true;
   // Only the primary authorized directory controls readiness. Unknown stays
   // conservative for staff requests until this exact hint completes.
   publish({stage:'ready',members:rows,memberCursor:result.value.nextCursor,staffEmployer:owner?.value});return true;
  }finally{task.signal.removeEventListener('abort',abortEmployer);if(!accepted&&owner&&employerHint===owner)cancelEmployerHint();}
 }
 async function reload(more=false){const captured=api,bound=lease,epoch=version;if(!captured||!bound||!current(epoch,captured,bound))return false;const task=begin('read');if(!task)return false;
  try{if(!current(epoch,captured,bound)||job!==task||task.signal.aborted)return false;if(!more)publish({...base,staffEmployer:employerReader?unknownEmployer:undefined,scopeKey:view.scopeKey+1,busy:true,stage:'ready'});return await memberPage(captured,bound,epoch,task,more);}finally{finish(task);}
 }
 // Restore presentation intent only after a fresh directory read. Every opened
 // conversation still passes the normal Auth/conversation/history authorization.
 async function restoreConversation(expected:MemberContext,allowed:()=>boolean,signal:AbortSignal):Promise<'restored'|'unavailable'|'denied'|'cancelled'>{
  const captured=api,bound=lease,epoch=version;
  const intent=()=>{try{return !signal.aborted&&allowed()===true;}catch{return false;}};
  if(!intent())return 'cancelled';if(!captured||!bound||!current(epoch,captured,bound)||view.context!==null)return 'cancelled';
  if(!uuid(expected.companyId)||!uuid(expected.conversationId)||!['patient','staff'].includes(expected.kind))return 'denied';
  const task=begin('read');if(!task)return 'unavailable';const abort=()=>task.abort();signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
  const scope=view.scopeKey+1;
  const live=()=>intent()&&current(epoch,captured,bound)&&job===task&&!task.signal.aborted&&view.context===null&&view.scopeKey===scope;
  const failed=()=>{if(live())publish({stage:'unavailable',notice:'unavailable'});return 'unavailable' as const;};
  try{
   if(!intent()||!current(epoch,captured,bound)||job!==task)return 'cancelled';
   publish({...base,staffEmployer:employerReader?unknownEmployer:undefined,scopeKey:scope,stage:'ready',busy:true});
   const rows:OwnMembership[]=[];let cursor:MemberCursor|null=null,member:OwnMembership|undefined;
   do{
    if(!live())return 'cancelled';const result=await captured.myMemberships(cursor,task.signal);if(!live())return 'cancelled';if(!result.ok)return failed();
    if(rows.length+result.value.items.length>maxRows)return 'denied';rows.push(...result.value.items);cursor=result.value.nextCursor;
    member=result.value.items.find(m=>m.companyId===expected.companyId&&m.role===expected.kind);
   }while(!member&&cursor!==null);
   if(!member||member.state!=='active'||expected.kind==='patient'&&member.conversationId!==expected.conversationId)return 'denied';
   let context:MemberContext=Object.freeze({companyId:member.companyId,companyName:member.name,conversationId:expected.conversationId,kind:expected.kind});
   if(expected.kind==='staff'){
    let after:string|null=null,seen=0,row:StaffConversation|undefined;
    do{if(!live())return 'cancelled';const result=await captured.inbox(member.companyId,after,task.signal);if(!live())return 'cancelled';if(!result.ok)return failed();seen+=result.value.items.length;if(seen>maxRows)return 'denied';row=result.value.items.find(item=>item.conversationId===expected.conversationId);after=result.value.nextCursor;}while(!row&&after!==null);
    if(!row)return 'denied';context=Object.freeze({...context,clientName:row.displayName});
   }
   if(!live())return 'cancelled';job=null;jobKind=null;
   publish({...base,scopeKey:scope,stage:'ready',members:Object.freeze(rows),memberCursor:cursor,staffEmployer:employerReader?unknownEmployer:undefined,context,busy:false});
   return 'restored';
  }catch{return live()?failed():'cancelled';}finally{signal.removeEventListener('abort',abort);finish(task);}
 }
 function sync(){if(disposed)return;if(paused){if(view.stage!=='paused')reset('paused');return;}const bound=enabled();if(bound===lease&&api)return;if(!bound){const stage=deps.auth.snapshot().status==='authenticated'?'registration':'signed-out';if(lease||api||view.stage!==stage)reset(stage);return;}
  const activation=version+1;reset('ready');if(disposed||paused||version!==activation||enabled()!==bound)return;lease=bound;const epoch=version;api=createMembershipDirectory({rpc:bound.membership,current:()=>!disposed&&!paused&&epoch===version&&lease===bound&&enabled()===bound,schedule:deps.schedule,timeoutMs:deps.timeoutMs});const employerRpc=bound.staffEmployer;if(employerRpc)employerReader=createStaffEmployerReader({rpc:async signal=>{
   // One unresolved raw hint per host, even across timeout/foreground/lease
   // changes. This is admission only, never cached data from another lease.
   if(employerRpcPending||signal.aborted)return{data:null,error:{code:'UNAVAILABLE'}};
   employerRpcPending=true;try{return await employerRpc(signal);}finally{employerRpcPending=false;}
  },current:()=>!disposed&&!paused&&epoch===version&&lease===bound&&enabled()===bound,schedule:deps.schedule,timeoutMs:deps.timeoutMs});void reload();
 }
 async function search(query:string,more=false){const captured=api,bound=lease,epoch=version;if(!captured||!bound||!current(epoch,captured,bound)||view.stage!=='ready')return false;const cursor=more?view.searchCursor:null;if(more&&!cursor)return false;const task=begin('search');if(!task)return false;
  const owns=()=>current(epoch,captured,bound)&&job===task&&!task.signal.aborted&&!disposed&&!paused&&version===epoch&&api===captured&&lease===bound;
  const settle=(patch:Partial<View>)=>{
   if(!owns())return false;job=null;jobKind=null;
   // Keep the same validated surface while its public-company read is in
   // flight. Handoff only when the local read result is settled, atomically
   // clearing that surface and busy before notifying reentrant observers.
   publish({context:null,managedCompany:null,staff:empty,staffCursor:null,inboxCompany:null,inboxUnreadEnabled:false,inboxOnlyUnread:false,inboxQuery:'',inboxSearchEnabled:false,inboxSearchState:'idle',inbox:empty,inboxCursor:null,busy:false,...patch});return true;
  };
  // begin/publish can synchronously cancel or replace this operation. Recheck
  // after callbacks/getters before publishing a query or dispatching its read.
  if(!owns()){finish(task);return false;}if(!more)publish({query,results:empty,searchCursor:null});
  try{if(!owns())return false;const result=await captured.searchCompanies(more?view.query:query,cursor,task.signal);if(!owns())return false;if(!result.ok){settle({searchState:'failed',results:empty,searchCursor:null,notice:result.code==='INVALID_INPUT'?'invalid-query':'unavailable'});return false;}const rows=join(more?view.results:empty,result.value.items,c=>c.companyId);if(!rows){settle({searchState:'failed',notice:'capacity'});return false;}return settle({searchState:'completed',results:rows,searchCursor:result.value.nextCursor});}finally{finish(task);}
 }
 async function team(co:string,more=false){const captured=api,bound=lease,epoch=version;if(!captured||!bound||!current(epoch,captured,bound)||view.stage!=='ready'||!hasRole(co,'manager'))return false;const cursor=more?view.staffCursor:null;if(more&&(view.managedCompany!==co||!cursor))return false;const task=begin('read');if(!task)return false;if(!more)publish({managedCompany:co,staff:empty,staffCursor:null,inboxCompany:null,inboxUnreadEnabled:false,inboxOnlyUnread:false,inboxQuery:'',inboxSearchEnabled:false,inboxSearchState:'idle',inbox:empty,inboxCursor:null,context:null});
  try{const result=await captured.managedStaff(co,cursor,task.signal);if(!current(epoch,captured,bound)||task.signal.aborted)return false;if(!result.ok){publish({staff:empty,staffCursor:null,managedCompany:null,notice:'unavailable'});return false;}const rows=join(more?view.staff:empty,result.value.items,s=>s.userId);if(!rows){publish({notice:'capacity'});return false;}publish({searchState:'idle',staff:rows,staffCursor:result.value.nextCursor});return true;}finally{finish(task);}
 }
 async function inbox(co:string,more=false,query='',restoreOnlyUnread?:boolean){
  const captured=api,bound=lease,epoch=version;
  if(!captured||!bound||!current(epoch,captured,bound)||view.stage!=='ready'||!hasRole(co,'staff')||typeof query!=='string'||restoreOnlyUnread!==undefined&&typeof restoreOnlyUnread!=='boolean')return false;
  const cursor=more?view.inboxCursor:null,q=more?view.inboxQuery:query.trim();
  const onlyUnread=deps.inboxUnread===true&&(restoreOnlyUnread??(view.inboxCompany===co&&view.inboxQuery===q&&view.inboxOnlyUnread===true));
  if(more&&(view.inboxCompany!==co||!cursor)||q!==''&&deps.inboxSearch!==true)return false;
  const task=begin(deps.inboxSearch===true?'inbox-search':'read');if(!task)return false;
  const owns=()=>current(epoch,captured,bound)&&job===task&&!task.signal.aborted;
  if(!owns())return false;
  if(!more)badgeRotation=null;
  if(!more)publish({inboxCompany:co,inbox:empty,inboxCursor:null,inboxUnreadEnabled:deps.inboxUnread===true,inboxOnlyUnread:onlyUnread,inboxQuery:q,inboxSearchEnabled:deps.inboxSearch===true,inboxSearchState:'loading',managedCompany:null,staff:empty,staffCursor:null,context:null});
  try{
   const result=q!==''?await captured.searchInbox(co,q,cursor as InboxCursor|null,task.signal):deps.recentInbox===true?await captured.recentInbox(co,cursor as InboxCursor|null,task.signal):await captured.inbox(co,cursor as string|null,task.signal);
   if(!owns()||view.inboxCompany!==co)return false;
   if(!result.ok){publish({inbox:empty,inboxCursor:null,inboxSearchState:result.code==='INVALID_INPUT'?'invalid':'failed',notice:null});return false;}
   let incoming:readonly StaffConversation[]=result.value.items;
   if(deps.inboxUnread===true&&incoming.length){const counts=await captured.unreadCounts(co,incoming.map(row=>row.conversationId),task.signal);if(!owns()||view.inboxCompany!==co)return false;if(counts.ok)incoming=incoming.map((row,i)=>Object.freeze({...row,unreadCount:counts.value[i].unreadCount}));else publish({notice:'read-unavailable'});}
   const pageRows=more&&deps.recentInbox===true?incoming.filter(row=>!view.inbox.some(existing=>existing.conversationId===row.conversationId)):incoming;
   const rows=join(more?view.inbox:empty,pageRows,c=>c.conversationId);if(!rows){publish({notice:'capacity'});return false;}
   publish({inbox:rows,inboxCursor:result.value.nextCursor,inboxSearchState:'completed',searchState:'idle'});return true;
  }finally{finish(task);}
 }
 // Local presentation only. Exact rendered snapshot prevents stale handlers from
 // changing another company, query, ownership epoch or replacement session.
 function setInboxUnreadFilter(expected:View,next:boolean):boolean{
  const captured=api,bound=lease,epoch=version;
  if(typeof next!=='boolean'||view!==expected||!captured||!bound||!current(epoch,captured,bound)||view.stage!=='ready'||view.busy||job||!view.inboxUnreadEnabled||!view.inboxCompany||!hasRole(view.inboxCompany,'staff'))return false;
  const scope=view.scopeKey,company=view.inboxCompany,query=view.inboxQuery;publish({inboxOnlyUnread:next});
  return current(epoch,captured,bound)&&view.scopeKey===scope&&view.inboxCompany===company&&view.inboxQuery===query&&view.inboxOnlyUnread===next;
 }
 // First-page order freshness plus rotating loaded-page personal badges: authoritative personal badges may change; previews/order/cursor and read state never do.
 function bindInboxActivityProbe(){
  const captured=api,bound=lease,epoch=version,scope=view.scopeKey,company=view.inboxCompany,query=view.inboxQuery,rows=view.inbox;
  const valid=()=>!!captured&&!!bound&&!!company&&current(epoch,captured,bound)&&view.scopeKey===scope&&view.stage==='ready'&&!view.busy&&!view.context&&!job&&view.inboxCompany===company&&view.inboxQuery===query&&view.inbox===rows&&view.inboxSearchState==='completed'&&hasRole(company,'staff');
  if(deps.recentInbox!==true||!valid())return null;
  const fingerprint=(items:readonly StaffConversation[])=>JSON.stringify(items.slice(0,10).map(r=>[r.conversationId,r.displayName,r.latestMessage]));
  const baseline=fingerprint(rows),hadMore=rows.length>10||view.inboxCursor!==null;let running=false,failed=false;
  const unavailable=()=>{failed=true;if(valid())publish({scopeKey:scope+1,inbox:empty,inboxCursor:null,inboxQuery:'',inboxSearchState:'failed',notice:'unavailable'});return 'unavailable' as const;};
  return Object.freeze({probe:async(signal:AbortSignal)=>{
   if(failed||running||signal.aborted||!valid())return 'stale' as const;running=true;
   try{
    const result=query!==''?await captured!.searchInbox(company!,query,null,signal):await captured!.recentInbox(company!,null,signal);
    if(signal.aborted||!valid())return 'stale' as const;
    if(!result.ok)return unavailable();
    if(fingerprint(result.value.items)!==baseline||result.value.hasMore!==hadMore)return 'changed' as const;
    if(deps.inboxUnread===true&&rows.length){
     const ids=rows.map(row=>row.conversationId).join(','),rotation=badgeRotation;
     const start=rotation?.epoch===epoch&&rotation.company===company&&rotation.query===query&&rotation.ids===ids&&rotation.next<rows.length?rotation.next:0;
     const batch=rows.slice(start,start+10),counts=await captured!.unreadCounts(company!,batch.map(row=>row.conversationId),signal);
     if(signal.aborted||!valid())return 'stale' as const;
     if(!counts.ok)return unavailable();
     badgeRotation=Object.freeze({epoch,company:company!,query,ids,next:start+batch.length>=rows.length?0:start+batch.length});
     let changed=false;const updated=rows.map((row,i)=>{const index=i-start;if(index<0||index>=batch.length||row.unreadCount===counts.value[index].unreadCount)return row;changed=true;return Object.freeze({...row,unreadCount:counts.value[index].unreadCount});});
     if(changed)publish({inbox:Object.freeze(updated)});
    }
    return 'unchanged' as const;
   }catch{return signal.aborted||!valid()?'stale' as const:unavailable();}finally{running=false;}
  }});
 }
 function bindInboxReadIntent(target:StaffConversation){
  const captured=api,bound=lease,epoch=version,company=view.inboxCompany,scope=view.scopeKey,last=target.latestMessage;
  const valid=()=>!!captured&&!!bound&&!!company&&current(epoch,captured,bound)&&view.scopeKey===scope&&view.inboxCompany===company&&view.stage==='ready'&&hasRole(company,'staff')&&view.inbox.some(row=>row===target);
  if(deps.inboxUnread!==true||!last||!target.unreadCount||!valid())return null;let consumed=false;
  return Object.freeze({confirm:async()=>{
   if(consumed||job||!valid())return false;consumed=true;const task=begin('write');if(!task)return false;
   const owns=()=>valid()&&job===task&&!task.signal.aborted;
   try{if(!owns())return false;const result=await captured!.markInboxRead(company!,target.conversationId,last.id,last.sequence,task.signal);if(!owns())return false;
    if(!result.ok){publish({notice:result.code==='UNCERTAIN'?'read-uncertain':'read-unavailable'});return false;}
    const counts=await captured!.unreadCounts(company!,[target.conversationId],task.signal);if(!owns())return false;
    if(!counts.ok){publish({notice:'read-unavailable'});return false;}
    publish({inbox:Object.freeze(view.inbox.map(row=>row===target?Object.freeze({...row,unreadCount:counts.value[0].unreadCount}):row))});return true;
   }finally{finish(task);}
  }});
 }
 function bindInboxSearchCancellation(rendered:View){
  const task=job,captured=api,bound=lease,epoch=version,company=view.inboxCompany,query=view.inboxQuery,scope=view.scopeKey;
  const valid=()=>!!task&&!!captured&&!!bound&&current(epoch,captured,bound)&&job===task&&jobKind==='inbox-search'&&!task.signal.aborted&&view.scopeKey===scope&&view.inboxCompany===company&&view.inboxQuery===query&&view.busy;
  if(rendered!==view||query===''||!valid())return null;let consumed=false;
  return Object.freeze({cancel:()=>{if(consumed||!valid())return false;consumed=true;job=null;jobKind=null;publish({busy:false,inbox:empty,inboxCursor:null,inboxSearchState:'idle'});task!.abort();return true;}});
 }
 async function mutate(action:(a:Api,signal:AbortSignal)=>Promise<{ok:boolean;code?:string}>){const captured=api,bound=lease,epoch=version;if(!captured||!bound||!current(epoch,captured,bound)||view.stage!=='ready')return false;const task=begin('write');if(!task)return false;
  try{const result=await action(captured,task.signal);if(!current(epoch,captured,bound)||task.signal.aborted)return false;publish({searchState:'idle',members:empty,memberCursor:null,managedCompany:null,staff:empty,staffCursor:null,inboxCompany:null,inboxUnreadEnabled:false,inboxOnlyUnread:false,inboxQuery:'',inboxSearchEnabled:false,inboxSearchState:'idle',inbox:empty,inboxCursor:null,context:null});const recovered=await memberPage(captured,bound,epoch,task,false);if(current(epoch,captured,bound)&&!task.signal.aborted)publish({notice:!result.ok&&result.code==='UNCERTAIN'?'uncertain':result.ok&&recovered?'updated':'unavailable'});return result.ok&&recovered;}finally{finish(task);}
 }
 // Normal Back is presentation-only: retire the exact conversation and all
 // private directory rows, retaining only the current lease's company list.
 // It grants no access; selection/history/inbox still use authorized ports.
 function leaveConversation(expected:MemberContext):boolean{
  const captured=api,bound=lease,epoch=version,old=view;
  if(!expected||!captured||!bound||old.context!==expected||old.stage!=='ready'||old.busy||job||!current(epoch,captured,bound)||view!==old)return false;
  badgeRotation=null;
  publish({...base,scopeKey:old.scopeKey+1,stage:'ready',members:old.members,memberCursor:old.memberCursor,staffEmployer:old.staffEmployer});
  return current(epoch,captured,bound)&&view.scopeKey===old.scopeKey+1&&view.context===null;
 }
 // A denied conversation retires the whole cached private projection. The
 // expected object is an owner token, not an ID lookup into a newer selection.
 // Detach and publish empty state BEFORE abort callbacks can reenter this host.
 function retireConversation(expected:MemberContext):boolean{
  const captured=api,bound=lease,epoch=version,scopeKey=view.scopeKey;
  if(!expected||!captured||!bound||view.context!==expected)return false;
  const authorized=enabled();
  if(authorized!==bound||disposed||paused||version!==epoch||api!==captured||lease!==bound||view.scopeKey!==scopeKey||view.context!==expected)return false;
  const oldJob=job,oldHint=employerHint,oldReader=employerReader;
  version++;const retired=version;job=null;jobKind=null;employerHint=null;employerReader=null;api=null;lease=null;
  publish({...base,scopeKey:scopeKey+1,stage:'ready',notice:'unavailable'});
  oldJob?.abort();oldHint?.controller.abort();captured.close();oldReader?.close();
  // A callback may already have established another owner. Never reset it.
  if(!disposed&&!paused&&version===retired&&api===null&&lease===null)sync();
  return true;
 }
 // An opaque intent for this exact search read. Never expose a global cancel
 // action that an old render could apply to another account/job or a write.
 function bindSearchCancellation(rendered:View):SearchCancellation|null{
  const task=job,captured=api,bound=lease,epoch=version,scopeKey=view.scopeKey,context=view.context,managed=view.managedCompany,inboxCompany=view.inboxCompany;
  if(view!==rendered||!task||!captured||!bound||jobKind!=='search'||view.searchState!=='loading'||!view.busy||view.stage!=='ready')return null;
  let company:string|null;
  try{const a=deps.auth.snapshot();if(a.status!=='authenticated'||a.companyLoading)return null;company=a.companyId;}catch{return null;}
  const valid=()=>{
   let authorized:MembershipLease|null,a:AuthView,l:MembershipLease|null;
   try{authorized=enabled();a=deps.auth.snapshot();l=deps.auth.currentLease();if(deps.auth.snapshot()!==a)return false;}catch{return false;}
   // All owner/job/context checks follow the potentially reentrant getters.
   return authorized===bound&&l===bound&&a.status==='authenticated'&&a.userId===bound.userId&&!a.companyLoading&&a.companyId===company
    &&!disposed&&!paused&&version===epoch&&api===captured&&lease===bound&&job===task&&jobKind==='search'&&!task.signal.aborted
    &&view.stage==='ready'&&view.busy&&view.searchState==='loading'&&view.scopeKey===scopeKey&&view.context===context&&view.managedCompany===managed&&view.inboxCompany===inboxCompany;
  };
  if(!valid()||view!==rendered)return null;
  let consumed=false;
  return Object.freeze({cancel:()=>{
   if(consumed)return false;consumed=true;if(!valid())return false;
   job=null;jobKind=null;
   // Clear the old projection first. Observers/abort listeners may start a new
   // search; abort only the captured signal and never publish after callbacks.
   publish({busy:false,query:'',searchState:'idle',results:empty,searchCursor:null,context:null,managedCompany:null,staff:empty,staffCursor:null,inboxCompany:null,inboxUnreadEnabled:false,inboxOnlyUnread:false,inboxQuery:'',inboxSearchEnabled:false,inboxSearchState:'idle',inbox:empty,inboxCursor:null,notice:null});
   task.abort();return true;
  }});
 }
 // Capture before opening a dialog. Its delayed button must call this intent's
 // confirm, never bind again against whichever global context is then current.
 function bindRevokeConfirmation(userId:string):StaffRevokeConfirmation|null{
  const captured=api,bound=lease,epoch=version,scopeKey=view.scopeKey,company=view.managedCompany,context=view.context,inboxCompany=view.inboxCompany;
  const target=view.staff.find(row=>row.userId===userId&&row.companyId===company&&row.state==='active');
  if(!uuid(userId)||!captured||!bound||!company||!target||job||view.busy||view.stage!=='ready'||!current(epoch,captured,bound)||!hasRole(company,'manager'))return null;
  let consumed=false;
  const valid=()=>current(epoch,captured,bound)&&view.stage==='ready'&&view.scopeKey===scopeKey&&view.managedCompany===company
    &&view.context===context&&view.inboxCompany===inboxCompany&&hasRole(company,'manager')
    &&view.staff.some(row=>row===target&&row.userId===userId&&row.companyId===company&&row.state==='active');
  return Object.freeze({cancel:()=>{consumed=true;},confirm:async()=>{
    if(consumed)return false;consumed=true;
    if(job||view.busy||!valid())return false;
    try{return await mutate((activeApi,signal)=>activeApi===captured&&valid()?captured.revokeStaff(company,userId,signal):Promise.resolve({ok:false}));}catch{return false;}
  }});
 }
 function updateConversationUnread(company:string,conversation:string,value:number|null){
  if(view.stage!=='ready'||view.busy||view.context?.companyId!==company||view.context?.conversationId!==conversation||value!==null&&(!Number.isSafeInteger(value)||value<0))return false;
  let changed=false;const rows=view.inbox.map(row=>{if(row.companyId!==company||row.conversationId!==conversation||row.unreadCount===(value??undefined))return row;changed=true;const {unreadCount,...rest}=row;return Object.freeze(value===null?rest:{...rest,unreadCount:value});});
  if(changed)publish({inbox:Object.freeze(rows)});return true;
 }
 const unsubAuth=deps.auth.subscribe(sync),unsubGate=deps.gate.subscribe(sync);sync();
 return Object.freeze({
  maskMessagePreviews:(co:string,cv:string,ids:readonly string[])=>{
   if(!api||!lease||!current(version,api,lease)||view.stage!=='ready'||!uuid(co)||!uuid(cv)||!Array.isArray(ids)||ids.length>5000||ids.some(id=>!uuid(id)))return false;
   for(const id of ids)removedPreviews.add(previewKey(co,cv,id));
   if(removedPreviews.size>20000){reset('unavailable');return false;}
   const safe=protectInbox(view.inbox);if(safe!==view.inbox)publish({inbox:safe});return true;
  },
snapshot:()=>view,subscribe:(f:()=>void)=>{observers.add(f);return()=>{observers.delete(f);};},updateConversationUnread,setInboxUnreadFilter,bindInboxActivityProbe,bindInboxReadIntent,bindSearchCancellation,bindInboxSearchCancellation,bindRevokeConfirmation,leaveConversation,retireConversation,restoreConversation,reload:()=>reload(),moreMemberships:()=>reload(true),search:(q:string)=>search(q),moreSearch:()=>search(view.query,true),loadTeam:(co:string)=>team(co),moreTeam:()=>view.managedCompany?team(view.managedCompany,true):Promise.resolve(false),loadInbox:(co:string,query='',onlyUnread?:boolean)=>inbox(co,false,query,onlyUnread),searchInbox:(query:string)=>view.inboxCompany?inbox(view.inboxCompany,false,query):Promise.resolve(false),moreInbox:()=>view.inboxCompany?inbox(view.inboxCompany,true):Promise.resolve(false),
  linkPatient:(co:string)=>view.results.some(c=>c.companyId===co)?mutate((a,s)=>a.linkPatient(co,s)):Promise.resolve(false),
  // UUID entry is presentation only; the existing bound mutation/backend
  // still authorizes the immediate patient link independently of search.
  linkPatientFromEntry:(co:string)=>uuid(co)?mutate((a,s)=>a.linkPatient(co,s)):Promise.resolve(false),
  requestStaff:(co:string)=>{if(!view.results.some(c=>c.companyId===co))return Promise.resolve(false);if(!staffRequestPolicy(view.members,view.memberCursor!==null,co,view.staffEmployer).allowed){publish({notice:'staff-request-blocked'});return Promise.resolve(false);}return mutate((a,s)=>a.requestStaff(co,s));},
  acceptStaffInvite:(id:string,token:string)=>mutate((a,s)=>a.acceptStaffInvite(id,token,s)),
  approveStaff:(user:string)=>view.managedCompany&&view.staff.some(s=>s.userId===user&&s.state==='pending')?mutate((a,s)=>a.approveStaff(view.managedCompany!,user,s)):Promise.resolve(false),
  revokeStaff:(user:string)=>view.managedCompany&&view.staff.some(s=>s.userId===user&&s.state==='active')?mutate((a,s)=>a.revokeStaff(view.managedCompany!,user,s)):Promise.resolve(false),
  selectPatient:(co:string)=>{if(!api||!lease||!current(version,api,lease)||job)return false;const m=view.members.find(m=>m.companyId===co&&m.role==='patient'&&m.state==='active'&&m.conversationId);if(!m)return false;publish({searchState:'idle',context:Object.freeze({companyId:co,companyName:m.name,conversationId:m.conversationId!,kind:'patient'}),managedCompany:null,staff:empty,staffCursor:null,inboxCompany:null,inboxUnreadEnabled:false,inboxOnlyUnread:false,inboxQuery:'',inboxSearchEnabled:false,inboxSearchState:'idle',inbox:empty,inboxCursor:null});return true;},
  selectConversation:(id:string)=>{if(!api||!lease||!current(version,api,lease)||job||!view.inboxCompany||!hasRole(view.inboxCompany,'staff'))return false;const row=view.inbox.find(c=>c.conversationId===id),m=view.members.find(m=>m.companyId===view.inboxCompany);if(!row||!m)return false;publish({searchState:'idle',context:Object.freeze({companyId:row.companyId,companyName:m.name,conversationId:row.conversationId,kind:'staff',clientName:row.displayName})});return true;},
  suspend:()=>{if(disposed)return;paused=true;reset('paused');},resume:()=>{if(disposed)return;paused=false;sync();},signOut:()=>deps.auth.signOut(),
  dispose:()=>{if(disposed)return;disposed=true;invalidate();unsubAuth();unsubGate();view=Object.freeze({...base,scopeKey:view.scopeKey+1,stage:'signed-out'});for(const f of [...observers])try{f();}catch{}observers.clear();},
 });
}
