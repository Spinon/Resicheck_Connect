import type{ConversationCache}from './conversation-cache.ts';
import {createAuthController,type AuthView} from '../../../packages/session/src/auth-controller.ts';
import type {createTextSessionChannel,OnboardingMembershipTextSession} from '../../../packages/chat-client/src/text-session-channel.ts';
import {createRegistrationHost} from './registration-host.ts';
import {createRegistrationMembershipGate} from './registration-membership-gate.ts';
import {createMembershipHost} from './membership-host.ts';
import {createMembershipRecentBridge} from './membership-recent-bridge.ts';
import {createPatientCompanyEntryHost} from './patient-company-entry-host.ts';
import {createMembershipDirectory} from '../../../packages/chat-client/src/membership-directory.ts';
import type {OnboardingLease} from './onboarding-adapter.ts';

type AuthDependencies=Parameters<typeof createAuthController<OnboardingMembershipTextSession>>[0];
type Provider=AuthDependencies['provider']&{signUp:Parameters<typeof createRegistrationHost>[0]['signUp']};
export type InboxFeatures=Readonly<{recent:boolean;search:boolean;unread:boolean}>;
/** Local assembly configuration only; this is never authorization or a deployment receipt. */
export function admitInboxFeatures(raw:unknown):InboxFeatures{
 if(raw===undefined)return Object.freeze({recent:false,search:false,unread:false});
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).sort().join(',')!=='recent,search,unread')throw Error('Controllers unavailable');
 const v=raw as Record<string,unknown>,recent=v.recent,search=v.search,unread=v.unread;
 if(typeof recent!=='boolean'||typeof search!=='boolean'||typeof unread!=='boolean'||!recent&&(search||unread))throw Error('Controllers unavailable');
 return Object.freeze({recent,search,unread});
}
export type AccessRecentControllerDependencies=Readonly<{cache?:ConversationCache;audioHistory?:'placeholder-only';imageHistory?:'placeholder-only';provider:Provider;transport:Pick<ReturnType<typeof createTextSessionChannel>,'bindSession'|'signOut'>;createId:()=>string;now:()=>number;schedule:(fn:()=>void,ms:number)=>()=>void;timeoutMs:number;messageReceipts?:boolean;messageRemoval?:boolean;audioPlayback?:Parameters<typeof createMembershipRecentBridge>[0]['audioPlayback'];inboxFeatures?:InboxFeatures;preserveSessionOnDispose?:boolean;onboardingReview?:boolean;localExpiryRecovery?:AuthDependencies['localExpiryRecovery'];conversationAccess?:Readonly<{intervalMs:number;timeoutMs:number;detectNewMessages?:boolean}>}>;
type Subscribe={subscribe:(listener:()=>void)=>()=>void};
/** The privacy owner needs observation/lifecycle only, never credentials or
 * additional lease capabilities. Legacy and new assemblies implement this port. */
export type AccessRecentControllerPort=Readonly<{
 auth:Subscribe&{snapshot:()=>Pick<AuthView,'status'|'userId'|'companyId'|'companyLoading'>;currentLease:()=>Readonly<{sessionKey:string}>|null;resume:()=>boolean};
 registration:Subscribe&{snapshot:()=>Readonly<{busy:boolean}>};
 members:Subscribe&{snapshot:()=>Readonly<{stage:string;scopeKey:number;managedCompany:string|null;inboxCompany:string|null;busy:boolean;context:Readonly<{companyId:string;conversationId:string;kind:string}>|null}>};
 recent:Subscribe&{snapshot:()=>Readonly<{route:string;host:unknown}>};
 patientEntry:Subscribe&{snapshot:()=>Readonly<{stage:string;company:Readonly<{companyId:string}>|null;busy:boolean}>};
 resume:()=>void;suspend:()=>void;dispose:()=>void|Promise<unknown>;
}>;
const unavailable=()=>Error('Controllers unavailable');
/** Owns controllers, subscriptions and the current session. Inject a dedicated
 * transport per app. Provider/transport configuration stays caller-owned; no
 * default fetch, credentials, approval fixture or provider disposal is added. */
export function createAccessRecentControllers(deps:AccessRecentControllerDependencies){
 const inboxFeatures=admitInboxFeatures(deps.inboxFeatures);
 if(deps.imageHistory!==undefined&&(deps.imageHistory!=='placeholder-only'||deps.messageRemoval!==true))throw unavailable();
 if(deps.audioHistory!==undefined&&deps.audioHistory!=='placeholder-only')throw unavailable();
 const {provider,transport,createId,now,schedule,timeoutMs,preserveSessionOnDispose=false}=deps;
 if(!provider||!transport||[provider.signIn,provider.refresh,provider.revoke,provider.signUp,transport.bindSession,transport.signOut,createId,now,schedule].some(fn=>typeof fn!=='function')||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000)throw unavailable();
 if(provider.subscribeRecovery!==undefined&&typeof provider.subscribeRecovery!=='function'||provider.canRestore!==undefined&&typeof provider.canRestore!=='function')throw unavailable();
 if(typeof preserveSessionOnDispose!=='boolean'||provider.restore!==undefined&&typeof provider.restore!=='function'||provider.forget!==undefined&&typeof provider.forget!=='function')throw unavailable();
 if(deps.localExpiryRecovery!==undefined&&typeof deps.localExpiryRecovery!=='function')throw unavailable();
 if(deps.onboardingReview!==undefined&&typeof deps.onboardingReview!=='boolean')throw unavailable();
 let reviewMembershipRead:Readonly<{lease:OnboardingMembershipTextSession;api:ReturnType<typeof createMembershipDirectory>}>|null=null;
 let disposed=false,foreground=true,members:ReturnType<typeof createMembershipHost>|null=null,recent:ReturnType<typeof createMembershipRecentBridge>|null=null,entry:ReturnType<typeof createPatientCompanyEntryHost>|null=null;
 const auth=createAuthController<OnboardingMembershipTextSession>({provider:{
  signIn:(credentials,signal)=>{if(disposed)throw unavailable();return provider.signIn(credentials,signal);},
  refresh:(token,signal)=>{if(disposed)throw unavailable();return provider.refresh(token,signal);},
  ...(provider.restore?{restore:(signal:AbortSignal)=>{if(disposed)throw unavailable();return provider.restore!(signal);}}:{}),
  ...(provider.subscribeRecovery?{subscribeRecovery:(listener:()=>void)=>disposed?()=>{}:provider.subscribeRecovery!(listener)}:{}),
  ...(provider.canRestore?{canRestore:()=>!disposed&&provider.canRestore!()}:{}),
  ...(provider.forget?{forget:(signal:AbortSignal)=>provider.forget!(signal)}:{}),
  revoke:(session,signal)=>provider.revoke(session,signal),
 },transport:{bindSession:async input=>{if(disposed)return{ok:false as const};const result=await transport.bindSession(input);if(disposed){if(result.ok)result.value.close();return{ok:false as const};}return result;},signOut:()=>transport.signOut()},
 authorizeCompany:async(lease,company,signal):Promise<boolean>=>{
  const context=members?.snapshot().context;if(disposed||!foreground||!context||context.companyId!==company)return false;
  const conversation=lease.openConversation(company,context.conversationId);if(!conversation?.readRecent)return false;
  const current=():boolean=>!disposed&&foreground&&!signal.aborted&&members?.snapshot().context===context&&auth.currentLease()===lease;
  try{
   if(!current())return false;
   // The concrete probe queries this exact conversation under the same live
   // session/RLS. History still performs its own guard/messages/guard read.
   // Legacy leases lacking the capability retain the previous full read; a
   // present probe's denial, malformed result or failure never falls back.
   const probe=conversation.revalidateAccess;let allowed:boolean;
   if(probe===undefined){await conversation.readRecent({companyId:company,conversationId:context.conversationId,before:null,limit:25},signal);allowed=true;}
   else{if(typeof probe!=='function')return false;allowed=await probe(signal);}
   return allowed===true&&current()&&conversation.active()&&current();
  }catch{return false;}
 },clearPrivateView:()=>{recent?.clearPrivateView();entry?.cancel();if(auth.snapshot().status!=='authenticated')members?.suspend();return undefined;},createSessionKey:createId,now,schedule,timeoutMs,...(deps.localExpiryRecovery?{localExpiryRecovery:()=>disposed||!foreground?null:deps.localExpiryRecovery!()}: {})});
 const registration=createRegistrationHost({auth,...(deps.onboardingReview===true?{reviewAccess:{reloadMemberships:async function(lease:OnboardingLease,signal:AbortSignal):Promise<boolean>{
  const bound=lease as OnboardingMembershipTextSession;
  const current=():boolean=>!disposed&&foreground&&auth.snapshot().status==='authenticated'&&auth.currentLease()===bound;
  if(!current()||signal.aborted)return false;
  if(reviewMembershipRead?.lease!==bound){reviewMembershipRead?.api.close();const rpc=bound.membership;if(typeof rpc!=='function')return false;reviewMembershipRead=Object.freeze({lease:bound,api:createMembershipDirectory({rpc,current,schedule,timeoutMs,maxPending:1})});}
  const result=await reviewMembershipRead.api.myMemberships(null,signal);return result.ok&&current()&&!signal.aborted;
 }}}:{}),signUp:(input,signal)=>{if(disposed)throw unavailable();return provider.signUp(input,signal);},createRequestId:createId,schedule,timeoutMs});
 const gate=createRegistrationMembershipGate(auth,registration);
 members=createMembershipHost({auth,gate,schedule,timeoutMs,recentInbox:inboxFeatures.recent,inboxSearch:inboxFeatures.search,inboxUnread:inboxFeatures.unread});const directory=members;
 recent=createMembershipRecentBridge({cache:deps.cache,...(deps.imageHistory?{imageHistory:deps.imageHistory}:{}),...(deps.audioHistory?{audioHistory:deps.audioHistory}:{}),messageReceipts:deps.messageReceipts,messageRemoval:deps.messageRemoval,auth,members:directory,gate,createId,schedule,timeoutMs,...(deps.audioPlayback?{audioPlayback:deps.audioPlayback}:{}),...(deps.conversationAccess?{conversationAccess:{...deps.conversationAccess,now}}:{})});const chat=recent;
 // Existing optional capability remains fail-closed when absent from the lease.
 // Constructing this host adds no patient-company endpoint or invitation UI.
 entry=createPatientCompanyEntryHost({auth,gate,members:directory,schedule,timeoutMs});const patientEntry=entry;
 let cacheUser:string|null=null;const syncCache=()=>{const a=auth.snapshot();if(a.status==='authenticated'&&a.userId&&cacheUser!==a.userId){cacheUser=a.userId;void deps.cache?.bind(a.userId);}else if(a.status==='signed-out'&&cacheUser!==null){cacheUser=null;void deps.cache?.logout();}};syncCache();
 const stop=auth.subscribe(()=>{syncCache();if(reviewMembershipRead&&auth.currentLease()!==reviewMembershipRead.lease){reviewMembershipRead.api.close();reviewMembershipRead=null;}if(!disposed&&foreground&&['authenticated','signed-out'].includes(auth.snapshot().status))directory.resume();});
 type CloseResult=Readonly<{closed:true;remoteConfirmed:boolean;error:null|'unavailable'}>;let closing:Promise<CloseResult>|null=null;
 const app=Object.freeze({cache:deps.cache,inboxFeatures,auth,registration,gate,members:directory,recent:chat,patientEntry,
  resume(){if(disposed)return;foreground=true;auth.resume();registration.resumeReview();directory.resume();chat.resume();patientEntry.resume();},
  suspend(){if(disposed)return;foreground=false;registration.suspendReview();patientEntry.suspend();chat.suspend();directory.suspend();},
  dispose():Promise<CloseResult>{
   if(closing)return closing;let resolve!:(result:CloseResult)=>void;closing=new Promise<CloseResult>(r=>{resolve=r;});disposed=true;foreground=false;
   let failed=false;reviewMembershipRead?.api.close();reviewMembershipRead=null;for(const cleanup of [stop,()=>patientEntry.dispose(),()=>chat.dispose(),()=>directory.dispose(),()=>gate.dispose(),()=>registration.dispose()])try{cleanup();}catch{failed=true;}
   if(preserveSessionOnDispose){deps.cache?.retire();try{auth.closeMemory();}catch{failed=true;}resolve(Object.freeze({closed:true,remoteConfirmed:false,error:failed?'unavailable':null}));return closing;}
   // Page/runtime teardown retires plaintext. Only explicit logout deletes stored copies.
   deps.cache?.retire();
   // AuthController clears its lease synchronously and revokes only that captured
   // session. No global signOut/provider.dispose is called after the await.
   try{void Promise.resolve(auth.signOut()).then(result=>{resolve(Object.freeze({closed:true,remoteConfirmed:result.remoteConfirmed===true,error:failed?'unavailable':null}));},()=>{resolve(Object.freeze({closed:true,remoteConfirmed:false,error:'unavailable'}));});}
   catch{resolve(Object.freeze({closed:true,remoteConfirmed:false,error:'unavailable'}));}
   return closing;
  },
 });
 return app;
}
export type AccessRecentControllers=ReturnType<typeof createAccessRecentControllers>;
