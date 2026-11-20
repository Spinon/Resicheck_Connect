import {decodeCompanyRegistryProjection} from '../../../packages/chat-client/src/company-registry-rpc.ts';
import type {AccessRecentControllers} from './access-recent-controllers.ts';
import {profileAllowsMembership} from './registration-membership-gate.ts';
import {createCompanyRegistryController} from './company-registry-controller.ts';
type App=Pick<AccessRecentControllers,'auth'|'registration'|'members'|'gate'>;
type Controller=ReturnType<typeof createCompanyRegistryController>;
type Lease=NonNullable<ReturnType<App['auth']['currentLease']>>;
type Selected=Readonly<{lease:Lease;scope:string;requestId:string;controller:Controller}>;
type Row=Readonly<{requestId:string;name:string}>;
type Options=Readonly<{app:App;enabled?:boolean;createId:()=>string;now:()=>number;schedule:(fn:()=>void,ms:number)=>()=>void;timeoutMs:number}>;
/** Candidate owner binds only an indexed own request to the app's one verified
 * lease. No token, secure-store access, Auth flow, auto request/finalization,
 * optimistic membership or result asserted by the UI. */
export function createCompanyRegistryBinding({app,enabled=false,createId,now,schedule,timeoutMs}:Options){
 if(typeof enabled!=='boolean')throw Error('Company registry unavailable');
 let closed=false,foreground=true,syncing=false,scope:string|null=null,scopeLease:Lease|null=null,selected:Selected|null=null;
 let ownedReload:Selected|null=null;
 let view:Readonly<{enabled:boolean;requests:readonly Row[];controller:Controller|null}>=Object.freeze({enabled,requests:Object.freeze([]),controller:null});
 const listeners=new Set<()=>void>();
 const emit=()=>{for(const f of [...listeners])try{f();}catch{}};
 function read(){for(let n=0;n<3;n++){const a=app.auth.snapshot(),lease=a.status==='authenticated'?app.auth.currentLease():null,r=app.registration.snapshot();if(app.auth.snapshot()===a&&app.registration.snapshot()===r)return{lease,r};}return null;}
 function own(bound:Lease,key:string,requestId:string){
  if(closed||!enabled)return false;const state=read();if(!state||state.lease!==bound||scopeLease!==bound||state.r.scopeKey!==key)return false;
  if(ownedReload===selected&&ownedReload?.lease===bound&&ownedReload.requestId===requestId)return true;
  const index=state.r.companyRequestIds.indexOf(requestId),company=state.r.companies[index];
  return !state.r.busy&&state.r.accessReloadRequired!==true&&profileAllowsMembership(state.r.profile)&&!!company&&company.state!=='rejected'&&company.representation!=='disputed';
 }
 function sync(){
  if(closed||!enabled||syncing)return;syncing=true;
  try{
   const state=read();if(!state)return;const {lease,r}=state;
   if(r.scopeKey!==scope){scope=r.scopeKey;scopeLease=lease;}
   if(selected&&!own(selected.lease,selected.scope,selected.requestId)){const old=selected;selected=null;old.controller.close();}
   const rows:Row[]=lease&&lease===scopeLease&&!r.busy&&r.accessReloadRequired!==true&&profileAllowsMembership(r.profile)?r.companyRequestIds.flatMap((requestId,i)=>{const c=r.companies[i];return c&&c.state!=='rejected'&&c.representation!=='disputed'?[Object.freeze({requestId,name:c.name})]:[];}):[];
   const controller=selected?.controller??null;
   if(view.controller!==controller||JSON.stringify(view.requests)!==JSON.stringify(rows)){view=Object.freeze({enabled,requests:Object.freeze(rows),controller});emit();}
  }finally{syncing=false;}
 }
 async function waitMembers(bound:Lease,key:string,requestId:string,signal:AbortSignal){
  return new Promise<boolean>(resolve=>{
   let done=false,stop=()=>{},cancel=()=>{};
   const finish=(ok:boolean)=>{if(done)return;done=true;stop();cancel();signal.removeEventListener('abort',abort);resolve(ok);};
   const abort=()=>finish(false);
   const check=()=>{if(signal.aborted||!foreground||!own(bound,key,requestId)||!app.gate.matches(bound))return finish(false);const m=app.members.snapshot();if(!m.busy)finish(m.stage==='ready');};
   stop=app.members.subscribe(check);signal.addEventListener('abort',abort,{once:true});try{const c=schedule(()=>finish(false),timeoutMs);if(done)c();else cancel=c;}catch{finish(false);}check();
  });
 }
 function select(requestId:string){
  sync();if(closed||!enabled||!foreground)return false;const state=read(),bound=state?.lease;
  if(!state||!bound||!view.requests.some(r=>r.requestId===requestId)||typeof bound.companyRegistry!=='function')return false;
  if(selected?.lease===bound&&selected.requestId===requestId)return true;
  selected?.controller.close();selected=null;
  const key=state.r.scopeKey;
  const controller=createCompanyRegistryController({enabled:true,autoProgress:true,lease:{userId:bound.userId,sessionKey:bound.sessionKey,companyRegistry:bound.companyRegistry},requestId,current:()=>selected?.controller===controller&&own(bound,key,requestId),createId,now,schedule,timeoutMs,reloadAccess:async signal=>{
   const captured=selected;if(!captured||captured.controller!==controller||!foreground||signal.aborted||!own(bound,key,requestId))return false;
   ownedReload=captured;
   try{
    // A receipt requires a fresh authoritative registration/gate and membership
    // read, including historical receipts. This API grants no role itself.
    const projection=await bound.companyRegistry!({name:'my_company_registry_check',params:{p_request:requestId}},signal);
    if(!foreground||signal.aborted||!own(bound,key,requestId)||projection.error!==null)return false;
    const approved=decodeCompanyRegistryProjection(projection.data,requestId);if(approved.state!=='approved')return false;
    const companyId=approved.companyId;
    await app.registration.bind().onRefresh(signal);
    if(!foreground||signal.aborted||!own(bound,key,requestId)||!app.gate.matches(bound))return false;
    if(!await waitMembers(bound,key,requestId,signal)||!foreground||signal.aborted||!own(bound,key,requestId))return false;
    const ok=await app.members.reload();
    return ok===true&&!signal.aborted&&foreground&&own(bound,key,requestId)&&app.gate.matches(bound)&&app.members.snapshot().members.some(m=>m.companyId===companyId&&m.role==='manager'&&m.state==='active');
   }catch{return false;}finally{if(ownedReload===captured)ownedReload=null;sync();}
  }});
  selected=Object.freeze({lease:bound,scope:key,requestId,controller});sync();
  // Selection reads the owned projection once; never queue or finalize a lookup.
  void controller.refresh();return true;
 }
 const stopAuth=enabled?app.auth.subscribe(sync):()=>{},stopRegistration=enabled?app.registration.subscribe(sync):()=>{};sync();
 return Object.freeze({snapshot:()=>view,subscribe:(f:()=>void)=>{listeners.add(f);return()=>{listeners.delete(f);};},select,
  suspend(){if(closed)return;foreground=false;selected?.controller.suspend();},
  resume(){if(closed)return;foreground=true;sync();selected?.controller.resume();},
  close(){if(closed)return;closed=true;foreground=false;stopAuth();stopRegistration();const old=selected;selected=null;ownedReload=null;old?.controller.close();view=Object.freeze({enabled,requests:Object.freeze([]),controller:null});emit();listeners.clear();}
 });
}
