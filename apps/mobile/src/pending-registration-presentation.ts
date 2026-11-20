import type {RegistrationScreenProps} from './RegistrationScreens.tsx';

// Presentation capabilities of this candidate cut, not server permissions.
export const PENDING_REGISTRATION_CAPABILITIES=Object.freeze({
 signup:true,login:true,initialProfile:true,initialCompany:true,recovery:true,
 correction:false,withdrawal:false,activation:false,businessAccess:false,
});
const stages=new Set<RegistrationScreenProps['stage']>(['login','signup','profile','company','status']);
const unavailable=()=>Promise.reject(Error('Registration unavailable'));

/** Whitelist the existing screen contract without editing the legacy host or
 * screens. Keep the captured host handlers: never re-bind when an old callback
 * runs, because the host's original generation/view fence must still apply. */
export function pendingRegistrationPresentation(source:RegistrationScreenProps):RegistrationScreenProps{
 const {scopeKey,stage:originalStage,profile,company,companies,loading,statusNotice,
  signupOutcome,authNotice,onRestartSignup,onStage,onSignIn,onSignUp,onProfile,onCompany,
  onRefresh,onSignOut,companySubmissionUncertain,companySubmissionRejected,onRetryCompany,hasMoreCompanies,onMoreCompanies,companyRequestIds}=source;
 const stage=stages.has(originalStage)?originalStage:'status';
 return Object.freeze({
  scopeKey,stage,profile,company,companies,loading,statusNotice,signupOutcome,authNotice:stage==='login'?authNotice:null,
  companySubmissionUncertain,companySubmissionRejected,onRetryCompany:originalStage==='status'?onRetryCompany:undefined,
  companyRequestIds,hasMoreCompanies:!!hasMoreCompanies&&typeof onMoreCompanies==='function',
  onRestartSignup:originalStage==='signup'?onRestartSignup:undefined,
  onStage:(next:RegistrationScreenProps['stage'])=>{if(stages.has(next))onStage(next);},
  onSignIn:(input,signal)=>originalStage==='login'?onSignIn(input,signal):unavailable(),
  onSignUp:(input,signal)=>originalStage==='signup'?onSignUp(input,signal):unavailable(),
  onProfile:(input,signal)=>originalStage==='profile'?onProfile(input,signal):unavailable(),
  onCompany:(input,signal)=>originalStage==='company'?onCompany(input,signal):unavailable(),
  onRefresh,onSignOut,
  onMoreCompanies:typeof onMoreCompanies==='function'?onMoreCompanies:undefined,
 });
}
