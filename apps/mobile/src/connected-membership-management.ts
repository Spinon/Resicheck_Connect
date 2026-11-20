import{createMembershipSecretLinkFetch}from './membership-secret-link-http.ts';
import type{MembershipInviteOptions}from './membership-invite-binding.ts';
import{createConversationCache,type PrivateCacheStore}from './conversation-cache.ts';
import {createCompanyRegistryFetch}from './company-registry-http.ts';
import {createPersistentAuthProvider,type SecureSessionStore} from '../../../packages/session/src/persistent-auth-provider.ts';
import {createSupabaseAuthProvider} from '../../../packages/session/src/supabase-auth-provider.ts';
import {createTextSessionChannel} from '../../../packages/chat-client/src/text-session-channel.ts';
import {createAccessRecentControllers} from './access-recent-controllers.ts';
import {authDiagnosticConfig} from './auth-diagnostic-config.ts';
import {createMembershipManagementFetch} from './membership-management-http.ts';
import {createBasicTextFetch} from './basic-text-http.ts';

type Dependencies=Readonly<{images?:Readonly<{protocol:'private-v1';digest:(bytes:Uint8Array)=>Promise<string>}>;membershipLinks?:MembershipInviteOptions;cacheStore?:PrivateCacheStore;audioHistory?:'placeholder-only';publicConfig:unknown;fetch:typeof fetch;createId:()=>string;now:()=>number;textSend?:'basic-manual';companyRegistry?:'worker-check'|'on-demand-v1';companyRegistryCorrections?:'candidate-own-company';companyRegistryPreview?:'candidate-preview-v1';messageSeen?:'observed-v1';messageReceipts?:'observed-v1';messageRemoval?:'selection-v1';audioPlayback?:Readonly<{protocol?:'scoped-v1';createUi:NonNullable<Parameters<typeof createAccessRecentControllers>[0]['audioPlayback']>['createUi'];digest:(bytes:Uint8Array)=>Promise<string>}>;inboxFeatures?:Parameters<typeof createAccessRecentControllers>[0]['inboxFeatures'];sessionStore?:SecureSessionStore;localExpiryRecovery?:Parameters<typeof createAccessRecentControllers>[0]['localExpiryRecovery'];schedule:(callback:()=>void,ms:number)=>()=>void;timeoutMs:number}>;
const unavailable=()=>Error('Membership management configuration unavailable');

/** Admission pins Connect/public fields, not proof of key ownership or account
 * identity. Build review must separately verify the project-scoped key receipt. */
export function connectedMembershipManagementConfig(raw:unknown){try{return authDiagnosticConfig(raw);}catch{throw unavailable();}}

/** Explicit membership management assembly. It retains pending registration,
 * verified session/lease, Keystore and protected controllers. The dedicated
 * boundary defaults to consultation. Explicit basic-manual opt-in adds only
 * send_text; callers must separately select the composer UI. No release is enabled. */
export function createConnectedMembershipManagement(deps:Dependencies){
 let config:ReturnType<typeof connectedMembershipManagementConfig>;
 const imagesEnabled=deps.images!==undefined;
 const membershipLinksEnabled=deps.membershipLinks!==undefined;
 const messageRemovalEnabled=deps.messageRemoval==='selection-v1';let textSendEnabled=false,messageSeenEnabled=false;const messageReceiptsEnabled=deps.messageReceipts==='observed-v1';const audioPlaybackEnabled=deps.audioPlayback!==undefined;const scopedAudioEnabled=deps.audioPlayback?.protocol==='scoped-v1';const companyRegistryEnabled=deps.companyRegistry==='worker-check'||deps.companyRegistry==='on-demand-v1';
 let nativeFetch:typeof fetch,createId:()=>string,now:()=>number,schedule:Dependencies['schedule'],timeoutMs:number,sessionStore:SecureSessionStore|undefined,localExpiryRecovery:Dependencies['localExpiryRecovery'];
 try{
  const {publicConfig,fetch,createId:id,now:clock,schedule:timer,timeoutMs:timeout,sessionStore:storage,localExpiryRecovery:recovery}=deps;
  config=connectedMembershipManagementConfig(publicConfig);
  if(deps.membershipLinks&&(deps.membershipLinks.protocol!=='secret-v1'||deps.membershipLinks.origin!=='https://connect.resicheck.com.br'||typeof deps.membershipLinks.share!=='function'))throw unavailable();
  if(deps.messageRemoval!==undefined&&deps.messageRemoval!=='selection-v1'||messageRemovalEnabled&&deps.textSend!=='basic-manual')throw unavailable();
  if(imagesEnabled&&(deps.images?.protocol!=='private-v1'||typeof deps.images.digest!=='function'||!messageRemovalEnabled||deps.textSend!=='basic-manual'))throw unavailable();
  if(deps.audioHistory!==undefined&&deps.audioHistory!=='placeholder-only')throw unavailable();
  if(deps.companyRegistry!==undefined&&deps.companyRegistry!=='worker-check'&&deps.companyRegistry!=='on-demand-v1')throw unavailable();
  if(deps.companyRegistryPreview!==undefined&&(deps.companyRegistryPreview!=='candidate-preview-v1'||deps.companyRegistry!=='on-demand-v1'))throw unavailable();
  if(deps.companyRegistryCorrections!==undefined&&(deps.companyRegistryCorrections!=='candidate-own-company'||!companyRegistryEnabled))throw unavailable();
  if(deps.textSend!==undefined&&deps.textSend!=='basic-manual')throw unavailable();
  textSendEnabled=deps.textSend==='basic-manual';
  if(deps.messageSeen!==undefined&&deps.messageSeen!=='observed-v1')throw unavailable();messageSeenEnabled=deps.messageSeen==='observed-v1';if(messageSeenEnabled&&!textSendEnabled)throw unavailable();
  if(deps.messageReceipts!==undefined&&deps.messageReceipts!=='observed-v1'||messageReceiptsEnabled&&!messageSeenEnabled)throw unavailable();
  if(deps.audioPlayback?.protocol!==undefined&&deps.audioPlayback.protocol!=='scoped-v1')throw unavailable();
  if(audioPlaybackEnabled&&(!textSendEnabled||typeof deps.audioPlayback?.createUi!=='function'||typeof deps.audioPlayback.digest!=='function'))throw unavailable();
  if([fetch,id,clock,timer].some(fn=>typeof fn!=='function')||!Number.isSafeInteger(timeout)||timeout<1||timeout>60000)throw unavailable();
  if(recovery!==undefined&&typeof recovery!=='function')throw unavailable();
  localExpiryRecovery=recovery;nativeFetch=fetch;createId=id;now=clock;schedule=timer;timeoutMs=timeout;sessionStore=storage;
 }catch{throw unavailable();}
 const existing=textSendEnabled?createBasicTextFetch(nativeFetch,config.publishableKey,{imageHistory:imagesEnabled,imageTransfer:imagesEnabled,messageRemoval:messageRemovalEnabled,messageReceipts:messageReceiptsEnabled,seenMessages:messageSeenEnabled,audioMessages:audioPlaybackEnabled,audioTransfer:audioPlaybackEnabled&&!scopedAudioEnabled,scopedAudioTransfer:scopedAudioEnabled}):createMembershipManagementFetch(nativeFetch,config.publishableKey);
 const cache=deps.cacheStore?createConversationCache(deps.cacheStore,now):undefined;
 const receivedAudioCache=cache?{ticket:cache.ticket,get:(userId:string,c:import('../../../packages/chat-client/src/audio-transfer.ts').AudioTransferRead)=>cache.audio({userId,...c},c),put:(userId:string,c:import('../../../packages/chat-client/src/audio-transfer.ts').AudioTransferRead,b:Uint8Array,t:number)=>cache.putAudio({userId,...c},c,b,t)}:undefined;
 const companyFetch=companyRegistryEnabled?createCompanyRegistryFetch(nativeFetch,config.publishableKey,existing,{...(deps.companyRegistry==='on-demand-v1'?{requestMode:'on-demand-v1' as const,previewEnabled:deps.companyRegistryPreview==='candidate-preview-v1'}:{}),...(deps.companyRegistryCorrections==='candidate-own-company'?{companyCorrections:true}:{})}):existing;
 const membershipFetch=membershipLinksEnabled?createMembershipSecretLinkFetch(nativeFetch,config.publishableKey,companyFetch,true):companyFetch;
 const options={...(deps.images?{imageHistory:'placeholder-only' as const,enableImageTransfer:true,imageDigest:deps.images.digest}:{}),receivedAudioCache,...(deps.companyRegistry==='on-demand-v1'?{companyRegistryCheckTimeoutMs:Math.max(timeoutMs,30000)}:{}),...(deps.audioHistory?{audioHistory:deps.audioHistory}:{}),projectUrl:config.projectUrl,publishableKey:config.publishableKey,fetch:membershipFetch,enableMembershipLinks:membershipLinksEnabled,enableCompanyRegistry:companyRegistryEnabled,enableCompanyPreview:deps.companyRegistryPreview==='candidate-preview-v1',enableMessageRemoval:messageRemovalEnabled,enableMessageReceipts:messageReceiptsEnabled,enableSeenMessages:messageSeenEnabled,enableAudioMessages:audioPlaybackEnabled,enableAudioTransfer:audioPlaybackEnabled&&!scopedAudioEnabled,enableScopedAudioTransfer:scopedAudioEnabled,...(deps.audioPlayback?{audioDigest:deps.audioPlayback.digest}:{}),now,schedule,timeoutMs};
 const base=createSupabaseAuthProvider(options);
 let provider:ReturnType<typeof createPersistentAuthProvider>|typeof base;
 try{provider=sessionStore===undefined?base:createPersistentAuthProvider({base,store:sessionStore,now});}catch{base.dispose();throw unavailable();}
 const transport=createTextSessionChannel(options);
 try{
  const app=createAccessRecentControllers({cache,...(imagesEnabled?{imageHistory:'placeholder-only' as const}:{}),...(deps.audioHistory?{audioHistory:deps.audioHistory}:{}),messageRemoval:messageRemovalEnabled,messageReceipts:messageReceiptsEnabled,provider,transport,createId,now,schedule,timeoutMs,...(deps.audioPlayback?{audioPlayback:{createUi:deps.audioPlayback.createUi}}:{}),inboxFeatures:deps.inboxFeatures,conversationAccess:{intervalMs:10000,timeoutMs:5000,detectNewMessages:true},preserveSessionOnDispose:sessionStore!==undefined,...(localExpiryRecovery?{localExpiryRecovery}:{})});let closing:ReturnType<typeof app.dispose>|null=null;
  return Object.freeze({...app,imagesEnabled,membershipLinksEnabled,messageRemovalEnabled,textSendEnabled,messageSeenEnabled,messageReceiptsEnabled,audioPlaybackEnabled,companyRegistryEnabled,companyRegistryPreviewEnabled:deps.companyRegistryPreview==='candidate-preview-v1',companyRegistryCorrectionsEnabled:deps.companyRegistryCorrections==='candidate-own-company',restoreSession:()=>app.auth.restore(),dispose(){if(!closing)closing=app.dispose().finally(()=>{try{transport.signOut();}finally{provider.dispose();}});return closing;}});
 }catch{try{transport.signOut();}finally{provider.dispose();}throw unavailable();}
}
