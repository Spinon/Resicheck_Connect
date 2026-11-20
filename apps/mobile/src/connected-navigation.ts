export type ConnectedScreen='companies'|'company'|'search'|'conversations'|'teams'|'team'|'inbox'|'settings'|'about'|'company-registration';
type Auth={snapshot:()=>Readonly<{status:string}>;currentLease:()=>object|null;subscribe:(f:()=>void)=>()=>void};
const screens=new Set<ConnectedScreen>(['companies','company','search','conversations','teams','team','inbox','settings','about','company-registration']);
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
/** Presentation only. A selected company never grants a role or chat access. */
export function createConnectedNavigation(auth:Auth){
 let owner:object|null=null,disposed=false;let view:Readonly<{screen:ConnectedScreen;companyId:string|null;revision:number}>=Object.freeze({screen:'companies',companyId:null,revision:0});const listeners=new Set<()=>void>();
 function publish(screen:ConnectedScreen,companyId:string|null){if(disposed||view.screen===screen&&view.companyId===companyId)return;view=Object.freeze({screen,companyId,revision:view.revision+1});for(const f of [...listeners])try{f();}catch{}}
 function live(){return auth.snapshot().status==='authenticated'?auth.currentLease():null;}
 function sync(){const current=live();if(current!==owner){owner=current;publish('companies',null);}}
 function current(bound:object|null){sync();return !disposed&&bound!==null&&owner===bound&&live()===bound;}
 function go(screen:ConnectedScreen,bound:object|null=owner){if(!current(bound)||!screens.has(screen))return false;const contextual=screen==='company'||screen==='team'||screen==='inbox';publish(screen,contextual?view.companyId:null);return current(bound);}
 function company(screen:'company'|'team'|'inbox',id:string,bound:object|null=owner){if(!current(bound)||!uuid(id)||!['company','team','inbox'].includes(screen))return false;publish(screen,id);return current(bound);}
 function back(bound:object|null=owner){if(!current(bound)||view.screen==='companies')return false;
  const screen=(view.screen==='about'||view.screen==='company-registration')?'settings':(view.screen==='team'||view.screen==='inbox')&&view.companyId?'company':'companies';
  return go(screen,bound);
 }
 const unsubscribe=auth.subscribe(sync);sync();
 return Object.freeze({snapshot:()=>view,subscribe:(f:()=>void)=>{listeners.add(f);return()=>{listeners.delete(f);};},go:(screen:ConnectedScreen)=>go(screen),company:(screen:'company'|'team'|'inbox',id:string)=>company(screen,id),back:()=>back(),bind:()=>{sync();const bound=owner;return Object.freeze({current:()=>current(bound),go:(screen:ConnectedScreen)=>go(screen,bound),company:(screen:'company'|'team'|'inbox',id:string)=>company(screen,id,bound),back:()=>back(bound)});},dispose:()=>{if(disposed)return;disposed=true;unsubscribe();owner=null;listeners.clear();}});
}

/** Retire chat immediately, then refetch the selected company's client list.
 * Capture the navigation owner and exact route: a late reload must never reopen
 * a list after logout, a different tab/company or another session took over.
 * Membership/inbox ports still enforce their own backend authorization. */
export function leaveConnectedConversation(navigation:Pick<ReturnType<typeof createConnectedNavigation>,'snapshot'|'bind'>,back:()=>Promise<boolean>|void,restoreInbox?:(companyId:string,query:string,onlyUnread:boolean)=>Promise<boolean>,query='',onlyUnread=false):boolean{
 if(typeof query!=='string'||[...query].length>80||typeof onlyUnread!=='boolean')return false;
 const captured=navigation.bind();if(!captured.current())return false;
 const destination=navigation.snapshot(),company=destination.screen==='inbox'?destination.companyId:null;
 if(company&&restoreInbox){
  const here=()=>captured.current()&&navigation.snapshot()===destination;
  const fallback=()=>{if(here())captured.company('company',company);};
  if(!here())return false;
  try{void Promise.resolve(back()).then(async reloaded=>{
   if(!here())return;
   if(reloaded!==true){fallback();return;}
   // A failed or revoked list must have a usable parent, never an empty inbox.
   if(!await restoreInbox(company,query,onlyUnread))fallback();
  }).catch(fallback);return true;}catch{return false;}
 }
 // Older consumers without an inbox loader keep their safe list-selector path.
 if(destination.screen==='inbox'&&!captured.go('conversations'))return false;
 if(!captured.current())return false;
 try{void Promise.resolve(back()).catch(()=>{});return true;}catch{return false;}
}

type ConversationMembership=Readonly<{companyId:string;role:string;state:string;conversationId?:string|null}>;
/** A shortcut chooses presentation context only; the host/backend still authorize it. */
export function staffInboxShortcut(members:readonly ConversationMembership[],selectedCompanyId:string|null,complete:boolean):string|null{
 if(!complete||!Array.isArray(members))return null;
 const active=members.filter(m=>m.state==='active'&&(m.role==='staff'||m.role==='patient'&&uuid(m.conversationId)));
 const choices=selectedCompanyId===null?active:active.filter(m=>m.companyId===selectedCompanyId);
 return choices.length===1&&choices[0].role==='staff'&&uuid(choices[0].companyId)?choices[0].companyId:null;
}
export function openConnectedConversations(navigation:Pick<ReturnType<typeof createConnectedNavigation>,'snapshot'|'bind'>,members:Readonly<{snapshot:()=>Readonly<{members:readonly ConversationMembership[];memberCursor:unknown;inboxCompany?:string|null}>;loadInbox:(companyId:string)=>Promise<boolean>}>):boolean{
 const owner=navigation.bind();if(!owner.current())return false;
 const state=members.snapshot(),company=staffInboxShortcut(state.members,navigation.snapshot().companyId,state.memberCursor===null);
 if(!owner.current())return false;
 if(!company)return owner.go('conversations');
 if(!owner.company('inbox',company))return false;const destination=navigation.snapshot();
 const fallback=()=>{if(owner.current()&&navigation.snapshot()===destination)owner.company('company',company);};
 try{void Promise.resolve(members.loadInbox(company)).then(ok=>{if(!ok&&members.snapshot().inboxCompany!==company)fallback();}).catch(fallback);}catch{fallback();}
 return true;
}
