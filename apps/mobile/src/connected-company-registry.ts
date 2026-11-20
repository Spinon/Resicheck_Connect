import{decodeCompanyPreview,type CompanyPreview}from'../../../packages/chat-client/src/company-preview.ts';
import{canonicalRegistryCnpj}from'../../../packages/access/src/company-registry.ts';
import{createMembershipInviteBinding}from './membership-invite-binding.ts';
import {createConnectedMembershipManagement}from'./connected-membership-management.ts';
import {createCompanyRegistryBinding}from'./company-registry-binding.ts';
type Dependencies=Parameters<typeof createConnectedMembershipManagement>[0];
/** Additive CNPJ candidate: one provider/store, verified session, native admission
 * and chat composition. Keeps receipts, media and future opt-ins intact; default OFF. */
export function createConnectedCompanyRegistry(deps:Dependencies){
 if(deps.companyRegistry!==undefined&&deps.companyRegistry!=='worker-check'&&deps.companyRegistry!=='on-demand-v1')throw Error('Company registry unavailable');
 const app=createConnectedMembershipManagement(deps);
 try{
  const registry=createCompanyRegistryBinding({app,enabled:app.companyRegistryEnabled,createId:deps.createId,now:deps.now,schedule:deps.schedule,timeoutMs:deps.companyRegistry==='on-demand-v1'?Math.max(deps.timeoutMs,30000):deps.timeoutMs});
  const invites=deps.membershipLinks?createMembershipInviteBinding({app,options:deps.membershipLinks,createId:deps.createId,now:deps.now}):null;
  let previewForeground=true;
  const previewCompany=app.companyRegistryPreviewEnabled ? (async(cnpj:string,signal:AbortSignal):Promise<CompanyPreview>=>{
   const lease=app.auth.currentLease(),state=app.registration.snapshot(),scope=state.scopeKey,stage=state.stage;
   const current=()=>previewForeground&&!signal.aborted&&app.auth.currentLease()===lease&&app.registration.snapshot().scopeKey===scope&&app.registration.snapshot().stage===stage&&!app.registration.snapshot().busy&&app.registration.snapshot().accessReloadRequired!==true&&!!lease&&app.gate.matches(lease);
   if(!lease||!['company','company-correction'].includes(stage)||canonicalRegistryCnpj(cnpj)!==cnpj||!current())throw Error('Company preview unavailable');
   const reply=await lease.onboarding({name:'preview_company_registry_data_v1',params:{p_cnpj:cnpj}},signal);
   if(!current()||reply.error!==null)throw Error('Company preview unavailable');return decodeCompanyPreview(reply.data,cnpj);
  }) : undefined;
  return Object.freeze({...app,registry,invites,previewCompany,
   suspend(){previewForeground=false;invites?.suspend();registry.suspend();app.suspend();},resume(){previewForeground=true;app.resume();registry.resume();invites?.resume();},
   dispose(){previewForeground=false;invites?.close();registry.close();return app.dispose();},
  });
 }catch{void app.dispose().catch(()=>{});throw Error('Company registry unavailable');}
}
