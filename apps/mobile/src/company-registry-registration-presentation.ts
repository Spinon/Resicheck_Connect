import type{RegistrationScreenProps}from'./RegistrationScreens.tsx';import{pendingRegistrationPresentation}from'./pending-registration-presentation.ts';
/** Opt-in own-company correction only. Keep captured host fences, never rebind.
 * No profile correction/withdrawal or reviewer/activation capability is exposed. */
export function companyRegistryRegistrationPresentation(source:RegistrationScreenProps):RegistrationScreenProps{
 const base=pendingRegistrationPresentation(source),company=source.selectedCompany,id=source.selectedCompanyRequestId;
 const owns=!!id&&source.companyRequestIds?.includes(id)===true&&source.companies?.[source.companyRequestIds.indexOf(id)]===company&&source.profile?.kind==='profile'&&source.profile.state!=='rejected'&&source.profile.identity!=='disputed'&&company?.representation==='unconfirmed';
 const correction=owns&&source.stage==='company-correction'&&company?.state==='rejected'&&typeof source.onResubmitCompany==='function',withdrawal=owns&&source.stage==='withdraw-company'&&company?.state==='pending'&&typeof source.onWithdrawCompany==='function';
 return Object.freeze({...base,stage:correction?'company-correction':withdrawal?'withdraw-company':base.stage,selectedCompanyRequestId:id,selectedCompany:company,
  onChooseCompanyCorrection:source.stage==='status'?source.onChooseCompanyCorrection:undefined,onChooseCompanyWithdrawal:source.stage==='status'?source.onChooseCompanyWithdrawal:undefined,
  onStage:next=>{if(next==='status')source.onStage(next);else base.onStage(next);},
  ...(correction?{onResubmitCompany:source.onResubmitCompany}:{}),...(withdrawal?{onWithdrawCompany:source.onWithdrawCompany}:{})});
}
