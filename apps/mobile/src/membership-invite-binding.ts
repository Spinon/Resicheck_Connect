import{createMembershipLinkManagement,type IssuedMembershipLink,type MembershipLinkCursor}from '../../../packages/chat-client/src/membership-link-management.ts';
import{createMembershipSecretLinkClient,createMembershipSecretLinkCodec,type MembershipLinkKind,type MembershipLinkContext,type MembershipLinkRpc}from '../../../packages/chat-client/src/membership-secret-link.ts';
import type{createConnectedMembershipManagement}from './connected-membership-management.ts';
type App=ReturnType<typeof createConnectedMembershipManagement>;
export type MembershipInviteOptions=Readonly<{protocol:'secret-v1';origin:string;randomFill?:(bytes:Uint8Array)=>void|Promise<void>;share:(url:string)=>Promise<void>}>;
type Stage='idle'|'entry'|'waiting-login'|'waiting-profile'|'loading'|'issuer'|'review'|'busy'|'ready'|'accepted'|'revoked'|'uncertain'|'unavailable'|'paused'|'management';
export type MembershipInviteView=Readonly<{revision:number;stage:Stage;mode:'issuer'|'receiver'|'management'|null;companyId:string|null;companyName:string|null;accountName:string;kind:MembershipLinkKind|null;expiresAt:string|null;items:readonly IssuedMembershipLink[];nextCursor:MembershipLinkCursor|null;notice:'share-failed'|'shared'|'operation-failed'|'unconfirmed'|null}>;
const empty={items:Object.freeze([]) as readonly IssuedMembershipLink[],nextCursor:null,mode:null,companyId:null,companyName:null,accountName:'',kind:null,expiresAt:null,notice:null} as const;
/** Presentation binding over one verified lease. No raw credentials or secret in snapshots.
 * Public company metadata is informational; only accept RPC validates/consumes the link. */
export function createMembershipInviteBinding(d:Readonly<{app:App;options:MembershipInviteOptions;createId:()=>string;now:()=>number}>){
 const {app,createId,now}=d,{origin,randomFill,share}=d.options;
 if(d.options.protocol!=='secret-v1'||typeof share!=='function')throw Error('Invitations unavailable');
 const codec=createMembershipSecretLinkCodec({origin}),listeners=new Set<()=>void>();
 let view:MembershipInviteView=Object.freeze({revision:0,stage:'idle',...empty}),closed=false,paused=false,url:string|null=null;
 let client:ReturnType<typeof createMembershipSecretLinkClient>|null=null,lease:ReturnType<App['auth']['currentLease']>=null,context:MembershipLinkContext|null=null,waitingLease:ReturnType<App['auth']['currentLease']>=null;
 let management:ReturnType<typeof createMembershipLinkManagement>|null=null,managementWasManager=false;
 let generation=0,read:AbortController|null=null,authCompany:string|null=null,memberScope:number|null=null;
 const emit=(stage:Stage,patch:Partial<Omit<MembershipInviteView,'revision'|'stage'>>={})=>{view=Object.freeze({...view,...patch,revision:view.revision+1,stage});for(const fn of [...listeners])try{fn();}catch{}};
 function drop(){generation++;read?.abort();read=null;client?.close();management?.close();management=null;managementWasManager=false;client=null;lease=null;context=null;url=null;waitingLease=null;}
 function clear(stage:Stage='idle'){drop();emit(stage,empty);}
 function ready(){const l=app.auth.currentLease();return !closed&&!paused&&l!==null&&app.auth.snapshot().status==='authenticated'&&app.gate.matches(l)&&app.members.snapshot().stage==='ready'&&!app.members.snapshot().busy?l:null;}
 function owns(){
  try{
   const l=ready();if(!l||l!==lease||!context||l.userId!==context.userId||l.sessionKey!==context.sessionKey||app.auth.snapshot().companyId!==authCompany||app.members.snapshot().scopeKey!==memberScope)return false;
   if(view.mode==='management')return app.members.snapshot().members.some(m=>m.companyId===context!.companyId&&m.state==='active'&&(m.role==='manager'||!managementWasManager&&view.kind==='patient'&&m.role==='staff'));
   if(view.mode==='issuer')return app.members.snapshot().members.some(m=>m.companyId===context!.companyId&&m.state==='active'&&m.role===(view.kind==='staff'?'manager':'staff'));
   return true;
  }catch{return false;}
 }
 function bind(companyId:string){
  const l=ready();if(!l||!l.membershipLinks)return false;lease=l;authCompany=app.auth.snapshot().companyId;memberScope=app.members.snapshot().scopeKey;
  context=Object.freeze({userId:l.userId,sessionKey:l.sessionKey,companyId});const captured=context;
  const rpc:MembershipLinkRpc=async(command,signal)=>{const reply=await l.membershipLinks!(command,signal);if(reply.error?.code==='42501'&&lease===l)clear('paused');return reply;};
  const currentContext=()=>owns()?captured:null;
  client=createMembershipSecretLinkClient({context:captured,currentContext,origin,rpc,createId,now,...(randomFill?{randomFill}:{})});
  management=createMembershipLinkManagement({context:captured,currentContext,rpc});return true;
 }
 async function loadManaged(after:MembershipLinkCursor|null=null){
  if(!management||!owns()||view.mode!=='management'||!view.kind||view.stage==='busy')return false;
  const m=management,epoch=generation,kind=view.kind;emit('busy',{notice:null});
  const result=await m.list(kind,after);
  if(epoch!==generation||management!==m)return false;if(!owns()){clear('paused');return false;}
  emit('management',result?{items:result.items,nextCursor:result.nextCursor,notice:null}:{notice:'operation-failed'});return result!==null;
 }
 const accountName=()=>{const p=app.registration.snapshot().profile;return p?.kind==='profile'?p.name:'Sua conta';};
 async function loadCompany(){
  if(!url||!view.companyId||client||!bind(view.companyId))return;
  const epoch=generation,l=lease!,id=view.companyId,ac=new AbortController();read=ac;emit('loading');
  try{
   if(!l.membershipLinkCompany)throw Error();
   const result=await l.membershipLinkCompany(id,ac.signal);
   if(epoch!==generation||ac.signal.aborted||!owns())return;
   if(!Array.isArray(result)||result.length!==1)throw Error();const row=result[0];
   if(!row||typeof row!=='object'||Reflect.ownKeys(row).length!==4||!['id','name','address','phone'].every(k=>Object.hasOwn(row,k))||row.id!==id||typeof row.name!=='string'||!row.name.trim()||[...row.name].length>160||/[\u0000-\u001f\u007f]/.test(row.name))throw Error();
   emit('review',{companyName:row.name,accountName:accountName()});
  }catch{if(epoch===generation){drop();emit('unavailable',{...empty,notice:'operation-failed'});}}
  finally{if(read===ac)read=null;ac.abort();}
 }
 function sync(){
  if(closed)return;
  if(client&&!owns()){clear('paused');return;}
  if(!url||client||paused)return;
  const current=app.auth.currentLease();
  if(waitingLease&&current!==waitingLease){clear('paused');return;}
  if(current)waitingLease=current;
  if(!current){if(view.stage!=='waiting-login')emit('waiting-login');return;}
  if(!ready()){if(view.stage!=='waiting-profile')emit('waiting-profile');return;}
  void loadCompany();
 }
 const stops=[app.auth.subscribe(sync),app.gate.subscribe(sync),app.members.subscribe(sync)];
 async function operation(fn:(c:NonNullable<typeof client>)=>Promise<boolean>,success:Stage){
  if(!client||!owns()||view.stage==='busy')return false;const c=client,epoch=generation;emit('busy',{notice:null});
  let ok=false;try{ok=await fn(c);}catch{}if(epoch!==generation||client!==c)return false;if(!owns()){clear('paused');return false;}
  const s=c.snapshot();emit(ok?success:s.phase==='uncertain'?'uncertain':'unavailable',{expiresAt:s.expiresAt,notice:ok?null:s.phase==='uncertain'?'unconfirmed':'operation-failed'});return ok;
 }
 return Object.freeze({
  snapshot:()=>view,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};},
  openEntry:()=>{if(!ready())return false;clear();emit('entry');return true;},
  openUrl:(input:unknown)=>{
   if(closed)return false;if(url!==null&&input===url&&view.mode==='receiver'){sync();return true;}let intent;try{intent=codec.parse(input);}catch{clear('unavailable');return false;}
   clear();url=String(input);emit('loading',{mode:'receiver',companyId:intent.companyId,kind:intent.kind,accountName:accountName()});sync();return true;
  },
  openIssuer:(companyId:string,kind:MembershipLinkKind)=>{
   if(!ready()||!['staff','patient'].includes(kind))return false;
   const m=app.members.snapshot().members.find(m=>m.companyId===companyId&&m.state==='active'&&m.role===(kind==='staff'?'manager':'staff'));if(!m)return false;
   clear();emit('issuer',{mode:'issuer',companyId,companyName:m.name,kind,accountName:accountName()});
   if(!bind(companyId)){clear('unavailable');return false;}return true;
  },
  openManagement:(companyId:string,kind:MembershipLinkKind)=>{
   if(!ready()||!['staff','patient'].includes(kind))return false;
   const members=app.members.snapshot().members.filter(m=>m.companyId===companyId&&m.state==='active'),manager=members.some(m=>m.role==='manager');
   if(!manager&&!(kind==='patient'&&members.some(m=>m.role==='staff')))return false;
   clear();managementWasManager=manager;emit('management',{mode:'management',companyId,kind,companyName:members[0]?.name??null,accountName:accountName()});
   if(!bind(companyId)){clear('unavailable');return false;}void loadManaged();return true;
  },
  refreshManagement:()=>loadManaged(),
  olderManagement:()=>view.nextCursor?loadManaged(view.nextCursor):Promise.resolve(false),
  async revokeManaged(inviteId:string){
   if(!management||!owns()||view.mode!=='management'||view.stage!=='management'||view.notice==='unconfirmed')return false;
   const item=view.items.find(x=>x.inviteId===inviteId&&x.canRevoke);if(!item)return false;
   const m=management,epoch=generation;emit('busy',{notice:null});
   const result=await m.revokeKnown(item.inviteId,item.kind);
   if(epoch!==generation||management!==m)return false;if(!owns()){clear('paused');return false;}
   emit('management',result?{items:Object.freeze(view.items.map(x=>x.inviteId===item.inviteId?Object.freeze({...x,state:'revoked' as const,canRevoke:false}):x)),notice:null}:{notice:'unconfirmed'});return result!==null;
  },
  issue:(ttlSeconds=604800)=>view.mode==='issuer'&&view.kind&&view.stage==='issuer'?operation(c=>c.issue(view.kind!,ttlSeconds),'ready'):Promise.resolve(false),
  retryIssue:()=>view.mode==='issuer'&&view.stage==='uncertain'?operation(c=>c.retryIssue(),'ready'):Promise.resolve(false),
  revoke:()=>view.mode==='issuer'&&['ready','uncertain'].includes(view.stage)?operation(c=>c.revoke(),'revoked'):Promise.resolve(false),
  async share(){
   if(!client||!owns()||view.stage!=='ready')return false;const c=client,epoch=generation;
   const ok=await c.share(share);if(epoch!==generation||!owns())return false;emit('ready',{notice:ok?'shared':'share-failed'});return ok;
  },
  accept:()=>view.mode==='receiver'&&url&&['review','uncertain'].includes(view.stage)?operation(async c=>{const reply=await c.accept(url);if(reply){url=null;return true;}return false;},'accepted'):Promise.resolve(false),
  async complete(){if(!owns())return false;clear();return app.members.reload();},
  clear:()=>clear(),suspend(){if(closed)return;paused=true;clear('paused');},resume(){if(closed)return;paused=false;if(url)sync();else if(view.stage==='paused')clear();},
  close(){if(closed)return;closed=true;drop();view=Object.freeze({revision:view.revision+1,stage:'paused',...empty});for(const stop of stops)try{stop();}catch{}listeners.clear();},
 });
}
export type MembershipInviteBinding=ReturnType<typeof createMembershipInviteBinding>;
