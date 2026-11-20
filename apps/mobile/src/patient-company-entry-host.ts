import {createPatientCompanyReader,type PatientCompanyRpc} from '../../../packages/chat-client/src/patient-company-entry.ts';
import type {CompanyPublic} from '../../../packages/chat-client/src/membership-directory.ts';
import type {AccessLease,AuthView} from '../../../packages/session/src/auth-controller.ts';
import type {createMembershipHost} from './membership-host.ts';
type Lease=AccessLease&Readonly<{patientCompany?:PatientCompanyRpc}>;
type Members=Pick<ReturnType<typeof createMembershipHost>,'snapshot'|'subscribe'|'reload'|'moreMemberships'|'linkPatientFromEntry'|'selectPatient'>;
export type PatientCompanyEntryView=Readonly<{revision:number;stage:'idle'|'waiting-profile'|'loading'|'preview'|'linking'|'linked'|'recovery'|'unavailable';company:CompanyPublic|null;busy:boolean}>;
type Capture={lease:Lease;generation:number;scope:number;context:unknown;companyId:string|null;managedCompany:string|null;inboxCompany:string|null;reader:ReturnType<typeof createPatientCompanyReader>};
type Start={lease:Lease;generation:number;scope:number;context:unknown;companyId:string|null;managedCompany:string|null;inboxCompany:string|null;id:string};
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
export function createPatientCompanyEntryHost(deps:{auth:{snapshot:()=>AuthView;currentLease:()=>Lease|null;subscribe:(fn:()=>void)=>()=>void};gate:{matches:(l:Lease)=>boolean;subscribe:(fn:()=>void)=>()=>void};members:Members;schedule:(fn:()=>void,ms:number)=>()=>void;timeoutMs:number}){
 let closed=false,paused=false,generation=0,intent:string|null=null,boundLease:Lease|null=null,boundCompanyId:string|null=null,capture:Capture|null=null,syncing=false,allowScopeAdvance=false,attempted=false,pendingStart:Start|null=null,starting:Start|null=null;
 let view:PatientCompanyEntryView=Object.freeze({revision:0,stage:'idle',company:null,busy:false});const listeners=new Set<()=>void>();
 function publish(stage:PatientCompanyEntryView['stage'],company:CompanyPublic|null=null,busy=false){if(closed)return;view=Object.freeze({revision:view.revision+1,stage,company,busy});for(const f of [...listeners])try{f();}catch{}}
 function clear(){generation++;intent=null;boundLease=null;boundCompanyId=null;attempted=false;pendingStart=null;starting=null;const c=capture;capture=null;c?.reader.close();publish('idle');}
 function owns(c:Capture){try{const a=deps.auth.snapshot(),m=deps.members.snapshot();return !closed&&!paused&&capture===c&&generation===c.generation&&a.status==='authenticated'&&!a.companyLoading&&a.companyId===c.companyId&&deps.auth.currentLease()===c.lease&&boundLease===c.lease&&deps.gate.matches(c.lease)&&m.stage==='ready'&&m.context===c.context&&m.managedCompany===c.managedCompany&&m.inboxCompany===c.inboxCompany&&m.scopeKey===c.scope&&deps.auth.snapshot()===a&&deps.members.snapshot()===m&&deps.auth.currentLease()===c.lease;}catch{return false;}}
 async function resolve(c:Capture,id:string){const reply=await c.reader.read(id);if(!owns(c)){if(capture===c)clear();return;}publish(reply.ok?'preview':'unavailable',reply.ok?reply.value:null);}
 function sync(){if(closed||syncing||!intent)return;syncing=true;try{
  for(let budget=0;budget<4;budget++){
   const a=deps.auth.snapshot(),lease=a.status==='authenticated'?deps.auth.currentLease():null,m=deps.members.snapshot();
   if(boundLease&&(lease!==boundLease||a.companyLoading||a.companyId!==boundCompanyId)){clear();return;}
   if(!boundLease&&lease){boundLease=lease;boundCompanyId=a.companyId;}
   const permitted=!!lease&&deps.gate.matches(lease);
   if(deps.auth.snapshot()!==a||deps.members.snapshot()!==m||(a.status==='authenticated'?deps.auth.currentLease():null)!==lease)continue;
   if(pendingStart&&(m.busy||pendingStart.scope!==m.scopeKey||pendingStart.context!==m.context||pendingStart.managedCompany!==m.managedCompany||pendingStart.inboxCompany!==m.inboxCompany||pendingStart.lease!==lease||pendingStart.companyId!==a.companyId))pendingStart=null;
   if(capture){if(allowScopeAdvance&&m.context===capture.context&&m.scopeKey===capture.scope+1)capture.scope=m.scopeKey;if(!owns(capture))clear();return;}
   if(paused||!lease||!permitted||m.stage!=='ready'||m.busy){if(view.stage!=='waiting-profile')publish('waiting-profile');return;}
   if(m.context!==null||m.managedCompany!==null||m.inboxCompany!==null||typeof lease.patientCompany!=='function'){publish('unavailable');return;}
   const sameStart=(s:Start)=>s.generation===generation&&s.id===intent&&s.lease===lease&&s.scope===m.scopeKey&&s.context===m.context&&s.companyId===a.companyId&&s.managedCompany===m.managedCompany&&s.inboxCompany===m.inboxCompany;
   if(!starting||!sameStart(starting)){
    if(!pendingStart){const queued:Start={lease,generation,scope:m.scopeKey,context:m.context,companyId:a.companyId,managedCompany:m.managedCompany,inboxCompany:m.inboxCompany,id:intent};pendingStart=queued;void Promise.resolve().then(()=>{if(closed||paused||pendingStart!==queued||generation!==queued.generation||intent!==queued.id)return;pendingStart=null;starting=queued;try{sync();}finally{starting=null;}});}return;
   }
   let c:Capture;const reader=createPatientCompanyReader({rpc:lease.patientCompany,current:()=>!!c&&owns(c),schedule:deps.schedule,timeoutMs:deps.timeoutMs});
   c={lease,generation,scope:m.scopeKey,context:m.context,companyId:a.companyId,managedCompany:m.managedCompany,inboxCompany:m.inboxCompany,reader};capture=c;if(!owns(c)){clear();return;}const id=intent;publish('loading',null,true);if(!owns(c)){if(capture===c)clear();return;}void resolve(c,id);return;
  }clear();
 }catch{clear();}finally{syncing=false;}}
 function found(c:Capture){if(!owns(c)||!intent)return false;return deps.members.snapshot().members.some(m=>m.companyId===intent&&m.role==='patient'&&m.state==='active'&&!!m.conversationId);}
 async function recover(c:Capture,reload:boolean){
  if(!owns(c))return false;
  if(reload){allowScopeAdvance=true;let read:Promise<boolean>;try{read=deps.members.reload();}finally{allowScopeAdvance=false;}if(!await read||!owns(c))return false;}
  for(let page=0;page<100;page++){
   if(!owns(c))return false;if(found(c))return true;const before=deps.members.snapshot();if(!before.memberCursor||before.busy||before.members.length>=1000)return false;
   if(!await deps.members.moreMemberships()||!owns(c))return false;const after=deps.members.snapshot();if(after.members.length<=before.members.length&&after.memberCursor===before.memberCursor)return false;
  }return false;
 }
 const stops=[deps.auth.subscribe(sync),deps.gate.subscribe(sync),deps.members.subscribe(sync)];
 return Object.freeze({snapshot:()=>view,subscribe:(fn:()=>void)=>{if(closed)return()=>{};listeners.add(fn);return()=>{listeners.delete(fn);};},
  begin(id:unknown){clear();if(closed||paused||!uuid(id)){if(!closed)publish('unavailable');return false;}intent=id;publish('waiting-profile');sync();return true;},
  async link(){const c=capture,company=view.company;if(!c||!company||view.stage!=='preview'||attempted||!owns(c))return false;attempted=true;publish('linking',company,true);if(!owns(c)){if(capture===c)clear();return false;}try{const linked=await deps.members.linkPatientFromEntry(company.companyId);if(!owns(c))return false;const recovered=linked&&await recover(c,false);if(!owns(c))return false;publish(recovered?'linked':'recovery',company);return recovered;}catch{if(owns(c))publish('recovery',company);return false;}},
  async recover(){const c=capture,company=view.company;if(!c||!company||view.stage!=='recovery'||view.busy||!owns(c))return false;publish('recovery',company,true);try{const ok=await recover(c,true);if(owns(c))publish(ok?'linked':'recovery',company);return ok;}catch{if(owns(c))publish('recovery',company);return false;}},
  open(){const c=capture,id=intent;if(!c||!id||view.stage!=='linked'||!owns(c)||!found(c)||!owns(c))return false;return deps.members.selectPatient(id);},
  cancel:clear,suspend(){paused=true;clear();},resume(){if(closed)return;paused=false;sync();},dispose(){if(closed)return;for(const stop of stops)stop();clear();closed=true;listeners.clear();},
 });
}
