import type {AuthView} from '../../../packages/session/src/auth-controller.ts';
import {AUTH_ERROR_FALLBACK} from '../../../packages/session/src/public-auth-error.ts';
import {registrationAuthNotice} from './registration-auth-notice.ts';
import {createOnboardingAdapter,type OnboardingLease,type RegistrationRecovery} from './onboarding-adapter.ts';
import type {RegistrationScreenProps} from './RegistrationScreens.tsx';
import {validateCredentials,validateProfile} from './registration-forms.ts';
import {profileAllowsMembership} from './registration-membership-gate.ts';
import {createOnboardingReviewAdapter,type ReviewLease,type ProfileReviewIntent,type CompanyReviewIntent,type FinalizationResult} from './onboarding-review-adapter.ts';
type Credentials=Readonly<{email:string;password:string}>;
type AuthPort={snapshot:()=>AuthView;currentLease:()=>OnboardingLease|null;subscribe:(fn:()=>void)=>()=>void;signIn:(email:string,password:string)=>Promise<boolean>;signOut:()=>Promise<unknown>};
type View=Readonly<{scopeKey:string;stage:RegistrationScreenProps['stage'];signupOutcome:null|'submitted'|'uncertain';authNotice:string|null;profile:RegistrationRecovery['profile']|null;profileRequestId:string|null;companyRequestIds:readonly string[];selectedCompanyRequestId:string|null;nextCompanyCursor:string|null;companies:RegistrationRecovery['companies'];busy:boolean;notice:'loading'|'unavailable'|null;accessReloadRequired?:boolean}>;
type Dependencies={auth:AuthPort;signUp:(input:Credentials,signal:AbortSignal)=>Promise<unknown>;createRequestId:()=>string;schedule:(fn:()=>void,ms:number)=>()=>void;timeoutMs:number;reviewAccess?:Readonly<{reloadMemberships:(lease:OnboardingLease,signal:AbortSignal)=>Promise<boolean>}>};
const failure=()=>Error('Registration unavailable');
const empty=Object.freeze([]);
// Re-admit only exact canonical public messages, even from an injected port.
// Provider codes and private/raw diagnostics never enter the registration view.
const authNotice=(state:AuthView):string|null=>registrationAuthNotice(state.error);
let hostSequence=0;
// Memory-only host. Authentication controller owns actual session lifecycle;
// every onboarding result is fenced by both the exact lease and generation.
export function createRegistrationHost(deps:Dependencies){
  if(deps.reviewAccess!==undefined&&(!deps.reviewAccess||typeof deps.reviewAccess.reloadMemberships!=='function'))throw failure();
  if(!Number.isSafeInteger(deps.timeoutMs)||deps.timeoutMs<1||deps.timeoutMs>60000)throw failure();
  const instance=++hostSequence,scope=()=>`onboarding-${instance}-${version}`;
  let version=0,disposed=false,lease:OnboardingLease|null=null,adapter:ReturnType<typeof createOnboardingAdapter>|null=null,lastAuthState:AuthView|null=null;
  let reviewAdapter:ReturnType<typeof createOnboardingReviewAdapter>|null=null,reviewAttempted=false,reviewPaused=false;
  let probeFlight:Readonly<{lease:OnboardingLease;promise:Promise<boolean>}>|null=null;
  let view:View=Object.freeze({scopeKey:scope(),...(deps.reviewAccess?{accessReloadRequired:false}:{}),stage:'login',signupOutcome:null,authNotice:null,profile:null,profileRequestId:null,companyRequestIds:empty,selectedCompanyRequestId:null,nextCompanyCursor:null,companies:empty,busy:false,notice:null,...(deps.reviewAccess?{accessReloadRequired:false}:{})});
  const observers=new Set<()=>void>();
  function publish(patch:Partial<View>){view=Object.freeze({...view,...patch});for(const listener of [...observers])try{listener();}catch{}}
  type Job={controller:AbortController;stop:()=>void;finish:()=>void;wait:<T>(fn:()=>Promise<T>)=>Promise<T>};let job:Job|null=null,reviewJob:Job|null=null;
  function invalidate(){version++;reviewAdapter?.close();reviewAdapter=null;reviewAttempted=false;reviewJob=null;const old=job;job=null;old?.stop();old?.finish();lease=null;adapter=null;}
  function makeJob(signal?:AbortSignal){
    if(job)throw failure();const controller=new AbortController();let reject!:(reason:Error)=>void,done=false,cancel=()=>{};
    const interrupted=new Promise<never>((_,r)=>{reject=r;});void interrupted.catch(()=>{});
    const stop=()=>{if(!done){reject(failure());controller.abort();}};
    const current:Job={controller,stop,finish:()=>{if(done)return;done=true;try{cancel();}catch{}signal?.removeEventListener('abort',stop);if(job===current)job=null;},wait:fn=>Promise.race([interrupted,Promise.resolve().then(()=>{if(controller.signal.aborted)throw failure();return fn();})])};
    job=current;signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)stop();
    try{cancel=deps.schedule(stop,deps.timeoutMs);}catch{stop();}return current;
  }
  const current=(generation:number,bound:OnboardingLease)=>!disposed&&generation===version&&lease===bound&&deps.auth.snapshot().status==='authenticated'&&deps.auth.currentLease()===bound;
  function applyRecovery(recovery:RegistrationRecovery,releaseReview=false){publish({profile:recovery.profile,profileRequestId:recovery.profileRequestId,companyRequestIds:recovery.companyRequestIds,selectedCompanyRequestId:null,nextCompanyCursor:recovery.nextCompanyCursor,companies:recovery.companies,stage:recovery.profile.kind==='not_started'?'profile':'status',busy:false,notice:null,...(releaseReview?{accessReloadRequired:false}:{})});}
  async function recover(signal?:AbortSignal){
    if(signal?.aborted)return false;
    if(view.accessReloadRequired===true)return reconcileReview(signal);
    const bound=lease,api=adapter,generation=version;if(!bound||!api||disposed||job||!current(generation,bound))return false;
    const task=makeJob(signal),owns=()=>job===task&&current(generation,bound);
    let published=false,released=false;
    try{
      if(!owns()||task.controller.signal.aborted||signal?.aborted)return false;
      published=true;publish({profile:null,profileRequestId:null,companyRequestIds:empty,selectedCompanyRequestId:null,nextCompanyCursor:null,companies:empty,stage:'status',busy:true,notice:'loading'});
      const result=await task.wait(()=>{if(!owns()||task.controller.signal.aborted)throw failure();return api.load(task.controller.signal);});
      if(!owns()||task.controller.signal.aborted||signal?.aborted)throw failure();
      released=true;task.finish();
      if(!current(generation,bound)||job!==null)return false;
      if(task.controller.signal.aborted||signal?.aborted)throw failure();
      applyRecovery(result);return true;
    }catch{
      const owned=owns()||released&&job===null&&current(generation,bound);
      // Release before notifying: a listener may start another refresh/account.
      // Neither this catch nor its finally may finish or clear that new owner.
      task.finish();
      if(published&&owned&&job===null&&current(generation,bound))publish({profile:null,profileRequestId:null,companyRequestIds:empty,selectedCompanyRequestId:null,nextCompanyCursor:null,companies:empty,stage:'status',busy:false,notice:'unavailable'});
      return false;
    }finally{task.finish();}
  }
  function sync(){
    if(disposed)return;
    try{
      const state=deps.auth.snapshot(),next=state.status==='authenticated'?deps.auth.currentLease():null;
      if(deps.auth.snapshot()!==state)return; // expiry can synchronously notify again
      if(state===lastAuthState&&next===lease)return; // preserve memory receipt on a redundant notification
      lastAuthState=state;
      if(next&&next===lease)return;
      if(!next){invalidate();publish({scopeKey:scope(),...(deps.reviewAccess?{accessReloadRequired:false}:{}),stage:'login',signupOutcome:null,authNotice:state.status==='signed-out'||state.status==='blocked'?authNotice(state):null,profile:null,profileRequestId:null,companyRequestIds:empty,selectedCompanyRequestId:null,nextCompanyCursor:null,companies:empty,busy:state.status==='authenticating'||state.status==='refreshing',notice:state.status==='blocked'?'unavailable':null});return;}
      invalidate();lease=next;adapter=createOnboardingAdapter(next,deps.createRequestId);publish({scopeKey:scope(),...(deps.reviewAccess?{accessReloadRequired:false}:{}),signupOutcome:null,authNotice:null,profile:null,profileRequestId:null,companyRequestIds:empty,selectedCompanyRequestId:null,nextCompanyCursor:null,companies:empty,stage:'status',busy:true,notice:'loading'});void recover();
    }catch{invalidate();publish({scopeKey:scope(),signupOutcome:null,authNotice:AUTH_ERROR_FALLBACK,profile:null,profileRequestId:null,companyRequestIds:empty,selectedCompanyRequestId:null,nextCompanyCursor:null,companies:empty,stage:'login',busy:false,notice:'unavailable'});}
  }
  const unsubscribe=deps.auth.subscribe(sync);sync();
  async function mutate(kind:'profile'|'company'|'resubmit-profile'|'resubmit-company'|'withdraw-profile'|'withdraw-company'|'retry-company',input:Parameters<ReturnType<typeof createOnboardingAdapter>['registerProfile']>[0]|Parameters<ReturnType<typeof createOnboardingAdapter>['requestCompany']>[0]|null,signal:AbortSignal){
    const bound=lease,api=adapter,generation=version;if(!bound||!api||view.busy)throw failure();
    const selected=view.selectedCompanyRequestId;
    const task=makeJob(signal);publish({busy:true,notice:null});
    let mutationFailed=false,knownCompany:Awaited<ReturnType<typeof api.resubmitCompany>>|null=null;
    try{
      try{await task.wait(async()=>{
        if(kind==='profile')await api.registerProfile(input as Parameters<typeof api.registerProfile>[0],task.controller.signal);
        else if(kind==='company')await api.requestCompany(input as Parameters<typeof api.requestCompany>[0],task.controller.signal);
        else if(kind==='retry-company')await api.retryCompany(task.controller.signal);
        else if(kind==='resubmit-profile')await api.resubmitProfile(input as Parameters<typeof api.resubmitProfile>[0],task.controller.signal);
        else if(kind==='withdraw-profile')await api.withdrawProfile(task.controller.signal);
        else if(kind==='resubmit-company'&&selected)knownCompany=await api.resubmitCompany(selected,input as Parameters<typeof api.resubmitCompany>[1],task.controller.signal);
        else if(kind==='withdraw-company'&&selected)await api.withdrawCompany(selected,task.controller.signal);
        else throw failure();
      });}catch{mutationFailed=true;}
      if(!current(generation,bound)||task.controller.signal.aborted)throw failure();
      // Even a lost write acknowledgement is followed by read-only discovery.
      // Never automatically repeat a write or infer rollback from network error.
      const result=await task.wait(()=>api.load(task.controller.signal));if(!current(generation,bound)||task.controller.signal.aborted)throw failure();task.finish();
      const confirmed=knownCompany as Awaited<ReturnType<typeof api.resubmitCompany>>|null;
      applyRecovery(confirmed&&!result.companyRequestIds.includes(confirmed.requestId)?Object.freeze({...result,companies:Object.freeze([...result.companies,confirmed.status]),companyRequestIds:Object.freeze([...result.companyRequestIds,confirmed.requestId])}):result);
      if(mutationFailed)throw failure();
    }catch{if(current(generation,bound)&&view.busy)publish({profile:null,profileRequestId:null,companyRequestIds:empty,selectedCompanyRequestId:null,nextCompanyCursor:null,companies:empty,stage:'status',busy:false,notice:'unavailable'});throw failure();}
    finally{task.finish();}
  }

  const reviewUnavailable=():FinalizationResult=>Object.freeze({ok:false,code:'UNAVAILABLE'});
  const reviewInvalid=():FinalizationResult=>Object.freeze({ok:false,code:'INVALID_INPUT'});
  const reviewUuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
  function reviewFor(bound:OnboardingLease,generation:number){
    if(!deps.reviewAccess||reviewPaused||!current(generation,bound))return null;
    if(!reviewAttempted){reviewAttempted=true;try{reviewAdapter=createOnboardingReviewAdapter({lease:bound as ReviewLease,createId:deps.createRequestId,current:()=>current(generation,bound),schedule:deps.schedule,timeoutMs:deps.timeoutMs});}catch{reviewAdapter=null;}}
    return reviewAdapter;
  }
  function holdReview(task:Job){
    reviewJob=task;
    publish({accessReloadRequired:true,profile:null,profileRequestId:null,companyRequestIds:empty,selectedCompanyRequestId:null,nextCompanyCursor:null,companies:empty,stage:'status',busy:true,notice:'loading'});
  }
  function reviewFailed(task:Job,bound:OnboardingLease,generation:number){
    if(current(generation,bound)&&reviewJob===task)publish({accessReloadRequired:true,profile:null,profileRequestId:null,companyRequestIds:empty,selectedCompanyRequestId:null,nextCompanyCursor:null,companies:empty,stage:'status',busy:false,notice:'unavailable'});
  }
  async function observeAccess(recovery:RegistrationRecovery,bound:OnboardingLease,generation:number,task:Job){
    if(!current(generation,bound)||reviewPaused||task.controller.signal.aborted||reviewJob!==task)return false;
    if(profileAllowsMembership(recovery.profile)){
      // Retain one uncooperative access read per exact lease until it settles.
      if(probeFlight?.lease===bound)return false;
      const promise=Promise.resolve().then(()=>!task.controller.signal.aborted&&current(generation,bound)&&!reviewPaused?deps.reviewAccess!.reloadMemberships(bound,task.controller.signal):false).then(value=>value===true,()=>false);
      const captured=Object.freeze({lease:bound,promise});probeFlight=captured;
      void promise.finally(()=>{if(probeFlight===captured)probeFlight=null;});
      if(!await task.wait(()=>promise))return false;
    }
    if(!current(generation,bound)||reviewPaused||task.controller.signal.aborted||reviewJob!==task)return false;
    task.finish();
    // Release in the same publication as owned status. No later publication
    // may clear a newer barrier started reentrantly by an observer.
    applyRecovery(recovery,true);return true;
  }
  async function reconcileReview(signal?:AbortSignal){
    const bound=lease,api=adapter,generation=version;
    if(!deps.reviewAccess||reviewPaused||!bound||!api||job||view.busy||signal?.aborted||!current(generation,bound))return false;
    const task=makeJob(signal);holdReview(task);
    try{const recovery=await task.wait(()=>api.load(task.controller.signal));if(await observeAccess(recovery,bound,generation,task))return true;reviewFailed(task,bound,generation);return false;}
    catch{reviewFailed(task,bound,generation);return false;}
    finally{task.finish();if(reviewJob===task)reviewJob=null;}
  }
  async function finalizeReview(kind:'profile'|'company',input:ProfileReviewIntent|CompanyReviewIntent,cpf:string|undefined,signal?:AbortSignal):Promise<FinalizationResult>{
    const bound=lease,generation=version;
    if(!deps.reviewAccess||reviewPaused||!bound||job||view.busy||signal?.aborted||!current(generation,bound))return reviewUnavailable();
    let intent:ProfileReviewIntent|CompanyReviewIntent;
    try{
      const {requestId,operationId}=input;if(!reviewUuid(requestId)||!reviewUuid(operationId))return reviewInvalid();
      if(kind==='profile'){
        const {evidenceId}=input as ProfileReviewIntent;
        if(!reviewUuid(evidenceId)||requestId!==view.profileRequestId||!validateProfile({name:'Review',cpf:cpf??''}).ok)return reviewInvalid();
        intent=Object.freeze({requestId,operationId,evidenceId});
      }else{
        const {registryEvidenceId,representationEvidenceId}=input as CompanyReviewIntent;
        if(!reviewUuid(registryEvidenceId)||!reviewUuid(representationEvidenceId)||registryEvidenceId===representationEvidenceId||!view.companyRequestIds.includes(requestId))return reviewInvalid();
        intent=Object.freeze({requestId,operationId,registryEvidenceId,representationEvidenceId});
      }
    }catch{return reviewInvalid();}
    const api=reviewFor(bound,generation);if(!api)return reviewUnavailable();
    const task=makeJob(signal);holdReview(task);let result:FinalizationResult=reviewUnavailable();
    try{
      // The adapter owns ACK/UNCERTAIN. Its known ACK must survive a subsequent
      // read timeout, so do not wrap the write in another rejecting race.
      result=kind==='profile'?await api.finalizeProfile(intent as ProfileReviewIntent,cpf!,task.controller.signal):await api.finalizeCompany(intent as CompanyReviewIntent,task.controller.signal);
      if(!current(generation,bound))return reviewUnavailable();
      if('recovery'in result&&result.recovery&&!task.controller.signal.aborted&&!reviewPaused){
        try{if(await observeAccess(result.recovery,bound,generation,task))return result;}catch{/* Preserve the outcome while access remains closed. */}
      }
      reviewFailed(task,bound,generation);return current(generation,bound)?result:reviewUnavailable();
    }catch{reviewFailed(task,bound,generation);return current(generation,bound)?result:reviewUnavailable();}
    finally{task.finish();if(reviewJob===task)reviewJob=null;}
  }
  const review=deps.reviewAccess?Object.freeze({
    finalizeProfile:(input:ProfileReviewIntent,cpf:string,signal?:AbortSignal)=>finalizeReview('profile',input,cpf,signal),
    finalizeCompany:(input:CompanyReviewIntent,signal?:AbortSignal)=>finalizeReview('company',input,undefined,signal),
    reconcile:(signal?:AbortSignal)=>reconcileReview(signal),
  }):null;

  function bind():RegistrationScreenProps&Readonly<{authNotice:string|null}>{
    const rendered=view,generation=version;
    const allowed=()=>!disposed&&generation===version&&view===rendered;
    const guard=()=>{if(!allowed())throw failure();};
    const selectCompany=(request:string,stage:'company-correction'|'withdraw-company')=>{
      if(!allowed()||view.busy||!lease||view.profile?.kind!=='profile'||view.profile.state==='rejected'||view.profile.identity==='disputed')return;
      const company=view.companies[view.companyRequestIds.indexOf(request)];if(!company||company.state!==(stage==='company-correction'?'rejected':'pending')||company.representation==='confirmed'||company.representation==='disputed')return;
      publish({stage,selectedCompanyRequestId:request,notice:null});
    };
    return Object.freeze({scopeKey:view.scopeKey,stage:view.stage,signupOutcome:view.signupOutcome,authNotice:view.authNotice,profile:view.profile,company:view.companies[0]??null,companies:view.companies,companySubmissionUncertain:adapter?.hasUnconfirmedCompanyRequest()===true,companySubmissionRejected:adapter?.companyRequestRejected()===true,loading:view.busy,statusNotice:view.notice,hasMoreCompanies:!!view.nextCompanyCursor,companyRequestIds:view.companyRequestIds,selectedCompanyRequestId:view.selectedCompanyRequestId,selectedCompany:view.companies[view.companyRequestIds.indexOf(view.selectedCompanyRequestId??'')]??null,
      onChooseCompanyCorrection:request=>selectCompany(request,'company-correction'),onChooseCompanyWithdrawal:request=>selectCompany(request,'withdraw-company'),
      onMoreCompanies:async signal=>{
        guard();const bound=lease,api=adapter,cursor=view.nextCompanyCursor;if(!bound||!api||!cursor||view.busy)throw failure();
        const oldIds=view.companyRequestIds,oldCompanies=view.companies,task=makeJob(signal);publish({busy:true,notice:null});
        try{const page=await task.wait(()=>api.loadCompanyPage(cursor,task.controller.signal));if(!current(generation,bound)||task.controller.signal.aborted)throw failure();
          const ids=[...oldIds],companies=[...oldCompanies];for(let i=0;i<page.requestIds.length;i++){const id=page.requestIds[i]!,existing=ids.indexOf(id);if(existing<0){ids.push(id);companies.push(page.companies[i]!);}else companies[existing]=page.companies[i]!;}
          task.finish();publish({companies:Object.freeze(companies),companyRequestIds:Object.freeze(ids),nextCompanyCursor:page.nextCursor,busy:false,notice:null});
        }catch{if(current(generation,bound))publish({busy:false,notice:'unavailable'});throw failure();}finally{task.finish();}
      },
      onStage:stage=>{if(!allowed()||view.busy)return;if(!lease){if((stage==='login'||stage==='signup')&&stage!==view.stage)publish({stage,signupOutcome:null,authNotice:null,notice:null});return;}
        if(stage==='status')publish({stage,selectedCompanyRequestId:null});else if(stage==='profile'&&view.profile?.kind==='not_started')publish({stage});else if(stage==='company'&&view.profile?.kind==='profile'&&view.profile.state!=='rejected'&&view.profile.identity!=='disputed'&&adapter?.beginCompanyRequest())publish({stage});
        else if((stage==='profile-correction'||stage==='withdraw-profile')&&view.profile?.kind==='profile'&&view.profile.identity!=='disputed'&&view.profileRequestId&&view.profile.state===(stage==='profile-correction'?'rejected':'pending'))publish({stage,selectedCompanyRequestId:null,notice:null});},
      onSignIn:async input=>{guard();if(lease||view.busy||view.stage!=='login')throw failure();if(view.authNotice!==null){publish({authNotice:null});if(disposed||generation!==version||lease||view.busy||view.stage!=='login')throw failure();}const checked=validateCredentials(input);if(!checked.ok||!await deps.auth.signIn(checked.value.email,checked.value.password))throw failure();},
      onRestartSignup:()=>{if(!allowed()||lease||view.busy||view.stage!=='signup'||view.signupOutcome===null)return;invalidate();publish({scopeKey:scope(),stage:'signup',signupOutcome:null,busy:false,notice:null});},
      onSignUp:async(input,signal)=>{
        guard();if(lease||view.busy||view.stage!=='signup'||view.signupOutcome!==null||signal.aborted)throw failure();
        let authState:AuthView;try{authState=deps.auth.snapshot();}catch{throw failure();}
        const signupCurrent=()=>{try{const state=deps.auth.snapshot(),bound=deps.auth.currentLease(),again=deps.auth.snapshot();return !disposed&&generation===version&&lease===null&&bound===null&&state===authState&&again===state&&view.stage==='signup';}catch{return false;}};
        const checked=(()=>{try{return validateCredentials(input);}catch{throw failure();}})();guard();if(!checked.ok||!signupCurrent()||signal.aborted)throw failure();
        const task=makeJob(signal);let dispatched=false;publish({busy:true});
        try{
          const result=await task.wait(()=>{const submit=deps.signUp;if(!signupCurrent()||task.controller.signal.aborted)throw failure();dispatched=true;return submit(checked.value,task.controller.signal);});
          const receipt=result&&typeof result==='object'?(result as {status?:unknown}).status:null;
          if(!signupCurrent()||task.controller.signal.aborted||receipt!=='submitted')throw failure();
          task.finish();if(!signupCurrent())throw failure();publish({busy:false,signupOutcome:'submitted'});
        }catch{task.finish();if(signupCurrent())publish({busy:false,signupOutcome:dispatched?'uncertain':null});throw failure();}
        finally{task.finish();}
      },
      onProfile:async(input,signal)=>{guard();if(view.stage!=='profile')throw failure();await mutate('profile',input,signal);},
      onCompany:async(input,signal)=>{guard();if(view.stage!=='company')throw failure();await mutate('company',input,signal);},
      onRetryCompany:async signal=>{guard();if(view.stage!=='status'||!adapter?.hasUnconfirmedCompanyRequest())throw failure();await mutate('retry-company',null,signal);},
      onResubmitProfile:async(input,signal)=>{guard();if(view.stage!=='profile-correction')throw failure();await mutate('resubmit-profile',input,signal);},
      onResubmitCompany:async(input,signal)=>{guard();if(view.stage!=='company-correction')throw failure();await mutate('resubmit-company',input,signal);},
      onWithdrawProfile:async signal=>{guard();if(view.stage!=='withdraw-profile')throw failure();await mutate('withdraw-profile',null,signal);},
      onWithdrawCompany:async signal=>{guard();if(view.stage!=='withdraw-company')throw failure();await mutate('withdraw-company',null,signal);},
      onRefresh:async signal=>{guard();if(signal.aborted||!lease||view.busy||!await recover(signal))throw failure();},
      onSignOut:()=>{
        if(!allowed())return;const previous=lease;invalidate();const closing=version;
        // Clear before notifying, but capture/revoke old Auth BEFORE observers
        // can start another login. A reentrant new account must survive logout.
        view=Object.freeze({scopeKey:scope(),...(deps.reviewAccess?{accessReloadRequired:false}:{}),stage:'login',signupOutcome:null,authNotice:null,profile:null,profileRequestId:null,companyRequestIds:empty,selectedCompanyRequestId:null,nextCompanyCursor:null,companies:empty,busy:false,notice:null});
        try{previous?.close();}catch{}
        try{void deps.auth.signOut().catch(()=>{});}catch{}
        if(!disposed&&version===closing)publish({});
      },
    });
  }
  return Object.freeze({snapshot:()=>view,bind,review,
    suspendReview:()=>{if(!deps.reviewAccess||disposed)return;reviewPaused=true;const task=reviewJob;if(task){task.stop();if(lease)reviewFailed(task,lease,version);}},
    resumeReview:()=>{if(!disposed)reviewPaused=false;},
    subscribe:(fn:()=>void)=>{observers.add(fn);return()=>{observers.delete(fn);};},dispose:()=>{if(disposed)return;disposed=true;invalidate();unsubscribe();observers.clear();view=Object.freeze({scopeKey:scope(),...(deps.reviewAccess?{accessReloadRequired:false}:{}),stage:'login',signupOutcome:null,authNotice:null,profile:null,profileRequestId:null,companyRequestIds:empty,selectedCompanyRequestId:null,nextCompanyCursor:null,companies:empty,busy:false,notice:null});}});
}
