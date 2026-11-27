import{createMessageRemovalSync}from './message-removal-sync.ts';
import{createMessageRemovalController}from './message-removal-controller.ts';
import type{RecentHistoryPage}from '../../../packages/chat-client/src/recent-history-read.ts';
import{createAudioAutoDownload}from './audio-auto-download.ts';
import type{ConversationCache}from './conversation-cache.ts';
import type{createConversationAudioUi}from './conversation-audio-ui.ts';
import{createOwnMessageStatusBinding}from './own-message-status-binding.ts';
import{createDeliveredWindowBinding}from './delivered-window-binding.ts';
import type{MessageReceiptsRpc}from '../../../packages/chat-client/src/message-receipts.ts';
import{createSessionDrafts}from './session-drafts.ts';
import{createUncertainSendRecovery}from './uncertain-send-recovery.ts';
import type {MembershipTextSession} from '../../../packages/chat-client/src/text-session-channel.ts';
import {createConversationHeadNotice} from './conversation-head-notice.ts';
import {isConversationHead,type ConversationHead} from '../../../packages/chat-client/src/conversation-head-read.ts';
import {createConversationAccessWatch} from './conversation-access-watch.ts';
import type {AuthView} from '../../../packages/session/src/auth-controller.ts';
import type {TextSession,TextConversation} from '../../../packages/chat-client/src/text-session-channel.ts';
import type {createMembershipHost,MemberContext} from './membership-host.ts';
import {createRecentConversationHost} from './recent-conversation-host.ts';
import type {ConversationMediaCapability} from './conversation-media-scope.ts';

type Members=Pick<ReturnType<typeof createMembershipHost>,'snapshot'|'subscribe'|'reload'|'retireConversation'|'updateConversationUnread'>&Partial<Pick<ReturnType<typeof createMembershipHost>,'restoreConversation'|'leaveConversation'|'maskMessagePreviews'>>;
type Auth={snapshot:()=>AuthView;currentLease:()=>TextSession|null;subscribe:(fn:()=>void)=>()=>void;selectCompany:(company:string)=>Promise<boolean>;signOut:()=>Promise<unknown>};
type Gate={matches:(lease:TextSession)=>boolean;subscribe:(fn:()=>void)=>()=>void};
import type{RecentConversationCheckpoint}from '../../../packages/chat-client/src/recent-conversation.ts';
type Host=ReturnType<typeof createRecentConversationHost>;
type Capture={lease:TextSession;context:MemberContext;scope:number;generation:number;conversation:TextConversation|null;checkpoint:RecentConversationCheckpoint|null};
export type MembershipRecentView=Readonly<{revision:number;route:'signed-out'|'memberships'|'opening'|'chat'|'unavailable';company:Readonly<{name:string}>|null;heading:Readonly<{title:string;subtitle:string}>|null;host:Host|null;hasNewMessages:boolean;recovering:boolean}>;

// One presentation owner, never a second Auth or authorization implementation.
// The supplied conversation ports must authorize every request independently.
export function createMembershipRecentBridge(deps:{cache?:ConversationCache;audioHistory?:'placeholder-only';imageHistory?:'placeholder-only';auth:Auth;members:Members;gate:Gate;createId:()=>string;schedule:(fn:()=>void,ms:number)=>()=>void;timeoutMs:number;audioPlayback?:Readonly<{createUi:typeof createConversationAudioUi}>;messageReceipts?:boolean;messageRemoval?:boolean;conversationAccess?:Readonly<{now:()=>number;intervalMs:number;timeoutMs:number;detectNewMessages?:boolean}>}){
 if(deps.imageHistory!==undefined&&(deps.imageHistory!=='placeholder-only'||deps.messageRemoval!==true))throw Error('Conversation unavailable');
 if(deps.audioHistory!==undefined&&deps.audioHistory!=='placeholder-only')throw Error('Conversation unavailable');
 if(deps.audioPlayback!==undefined&&typeof deps.audioPlayback.createUi!=='function')throw Error('Conversation unavailable');
 if(deps.messageReceipts!==undefined&&typeof deps.messageReceipts!=='boolean')throw Error('Conversation unavailable');
 if(deps.messageRemoval===true&&!deps.conversationAccess||deps.messageRemoval!==undefined&&typeof deps.messageRemoval!=='boolean')throw Error('Conversation unavailable');
 if(typeof deps.members.retireConversation!=='function')throw Error('Conversation retirement unavailable');
 if(deps.conversationAccess&&(deps.conversationAccess.detectNewMessages!==undefined&&typeof deps.conversationAccess.detectNewMessages!=='boolean'||!deps.conversationAccess||typeof deps.conversationAccess.now!=='function'||![deps.conversationAccess.intervalMs,deps.conversationAccess.timeoutMs].every(n=>Number.isSafeInteger(n)&&n>=1&&n<=60000)))throw Error('Conversation unavailable');
 let stopReconcile=()=>{};
 let autoAudio:ReturnType<typeof createAudioAutoDownload>|null=null;
 let removalSync:ReturnType<typeof createMessageRemovalSync>|null=null,removal:ReturnType<typeof createMessageRemovalController>|null=null;
 let audioUi:ReturnType<typeof createConversationAudioUi>|null=null;
 let authorStatuses:ReturnType<typeof createOwnMessageStatusBinding>|null=null;
 let delivery:ReturnType<typeof createDeliveredWindowBinding>|null=null;
 const savedDrafts=createSessionDrafts();
 // A single retired conversation's own draft/intent, hidden until fresh access.
 // Identity uses the actual lease object; never serialized or carried to another lease.
 let interrupted:Readonly<{lease:TextSession;companyId:string;conversationId:string;value:RecentConversationCheckpoint}>|null=null;
 let disposed=false,paused=false,generation=0,capture:Capture|null=null,host:Host|null=null,stopHost=()=>{},stopConversation=()=>{},syncing=false;
 let headNotice:ReturnType<typeof createConversationHeadNotice>|null=null;
 let receiptRecovery:ReturnType<typeof createUncertainSendRecovery>|null=null;
 let accessWatch:ReturnType<typeof createConversationAccessWatch>|null=null;
 let coveredAccess:Readonly<{capture:Capture;host:Host;watch:ReturnType<typeof createConversationAccessWatch>}>|null=null;
 type Blocked=Readonly<{lease:TextSession;context:MemberContext;reason:'unavailable'|'back'}>;
 let blockedSelection:Blocked|null=null;
 type Recovery={blocked:Blocked;attempts:number;cancel:(()=>void)|null;timeout:(()=>void)|null;request:AbortController|null};
 let recovery:Recovery|null=null;
 let backgroundResume:Blocked|null=null;
 let media:Readonly<{capture:Capture;host:Host;cap:ConversationMediaCapability}>|null=null;
 let view:MembershipRecentView=Object.freeze({revision:0,route:'signed-out',company:null,heading:null,host:null,hasNewMessages:false,recovering:false});const listeners=new Set<()=>void>();
 // A validated receipt changes presentation even when the host and route stay the same.
 function publish(route:MembershipRecentView['route'],next:Host|null=null,name:string|null=null,receiptChanged=false){
  const recovering=route==='unavailable'&&recovery!==null;
  const hasNewMessages=route==='chat'&&next!==null&&headNotice?.snapshot()===true;
  const context=(route==='opening'||route==='chat')?capture?.context:null;
  // Presentation comes from the exact selected directory context, never from
  // the newest unrelated membership render or a name inferred from messages.
  const heading=context?Object.freeze(context.kind==='staff'?{title:context.clientName?.trim()||'Cliente',subtitle:context.companyName}:{title:context.companyName,subtitle:'Conversa com a equipe'}):null;
  if(disposed||!receiptChanged&&view.route===route&&view.host===next&&view.company?.name===(name??undefined)&&view.heading?.title===heading?.title&&view.heading?.subtitle===heading?.subtitle&&view.hasNewMessages===hasNewMessages&&view.recovering===recovering)return;
  view=Object.freeze({revision:view.revision+1,route,host:next,company:name===null?null:Object.freeze({name}),heading,hasNewMessages,recovering});for(const f of [...listeners])try{f();}catch{}
 }

 function closeOwned(){coveredAccess=null;removal?.close();removal=null;removalSync?.close();removalSync=null;stopReconcile();stopReconcile=()=>{};autoAudio?.dispose();autoAudio=null;audioUi?.dispose();audioUi=null;authorStatuses?.dispose();authorStatuses=null;delivery?.dispose();delivery=null;receiptRecovery?.dispose();receiptRecovery=null;generation++;media=null;const notice=headNotice;headNotice=null;notice?.dispose();const watch=accessWatch;accessWatch=null;watch?.dispose();const old=host,conversation=capture?.conversation;capture=null;host=null;const h=stopHost,c=stopConversation;stopHost=()=>{};stopConversation=()=>{};h();c();old?.close();conversation?.close();}
 function owns(c:Capture,authorized=false){try{const a=deps.auth.snapshot(),m=deps.members.snapshot();return !disposed&&!paused&&capture===c&&generation===c.generation&&a.status==='authenticated'&&deps.auth.currentLease()===c.lease&&deps.gate.matches(c.lease)&&m.stage==='ready'&&m.scopeKey===c.scope&&m.context===c.context&&(!authorized||!a.companyLoading&&a.companyId===c.context.companyId)&&deps.auth.snapshot()===a&&deps.members.snapshot()===m&&deps.auth.currentLease()===c.lease;}catch{return false;}}
 function captureMediaScope():ConversationMediaCapability|null{
  const c=capture,h=host,conversation=c?.conversation;if(disposed||paused||!c||!h||!conversation||view.route!=='chat'||view.host!==h)return null;
  if(media?.capture===c&&media.host===h)return media.cap.current()?media.cap:null;
  let retired=false;
  const cap:ConversationMediaCapability=Object.freeze({token:Object.freeze({}),current:()=>{
   if(retired)return false;try{
    const valid=owns(c,true)&&capture===c&&host===h&&view.route==='chat'&&view.host===h&&c.conversation===conversation&&conversation.active()&&h.snapshot().status==='active'&&owns(c,true);
    if(!valid||disposed||paused||capture!==c||host!==h||view.route!=='chat'||view.host!==h||c.conversation!==conversation){retired=true;return false;}return true;
   }catch{retired=true;return false;}
  }});
  if(!cap.current())return null;media=Object.freeze({capture:c,host:h,cap});return cap;
 }
 function cancelRecovery(){const owned=recovery;recovery=null;if(!owned)return;owned.cancel?.();owned.timeout?.();owned.request?.abort();owned.cancel=null;owned.timeout=null;}
 function recoveryCurrent(owned:Recovery){try{const a=deps.auth.snapshot();return recovery===owned&&!disposed&&!paused&&blockedSelection===owned.blocked&&a.status==='authenticated'&&deps.auth.currentLease()===owned.blocked.lease&&deps.gate.matches(owned.blocked.lease)&&deps.members.snapshot().context===null&&deps.auth.snapshot()===a;}catch{return false;}}
 function scheduleRecovery(owned:Recovery){
  if(!recoveryCurrent(owned)){if(recovery===owned)cancelRecovery();return;}
  const delays=[2000,5000,10000,20000,30000];
  if(owned.attempts>=delays.length){cancelRecovery();publish('unavailable');return;}
  try{owned.cancel=deps.schedule(()=>{owned.cancel=null;void recover(owned);},delays[owned.attempts]);}catch{cancelRecovery();publish('unavailable');}
 }
 async function recover(owned:Recovery){
  if(!recoveryCurrent(owned)){if(recovery===owned)cancelRecovery();return;}owned.attempts++;const request=new AbortController();owned.request=request;
  let timedOut=false,outcome:'restored'|'unavailable'|'denied'|'cancelled'='unavailable';
  try{
   owned.timeout=deps.schedule(()=>{timedOut=true;request.abort();},deps.timeoutMs);
   outcome=await deps.members.restoreConversation!(owned.blocked.context,()=>recoveryCurrent(owned),request.signal);
  }catch{}finally{owned.timeout?.();owned.timeout=null;if(owned.request===request)owned.request=null;request.abort();}
  // A selected fresh context consumes the intent synchronously through sync().
  // Controller attempts do not overlap. The directory independently retains
  // its bounded raw admission when a transport ignores cancellation.
  if(recovery!==owned)return;
  if(timedOut&&recoveryCurrent(owned))outcome='unavailable';
  if(!recoveryCurrent(owned)||outcome!=='unavailable'){interrupted=null;cancelRecovery();if(view.route==='unavailable')publish('unavailable');return;}
  scheduleRecovery(owned);
 }
 function startRecovery(blocked:Blocked){
  if(!deps.conversationAccess||typeof deps.members.restoreConversation!=='function'||blockedSelection!==blocked)return;
  cancelRecovery();const owned:Recovery={blocked,attempts:0,cancel:null,timeout:null,request:null};recovery=owned;
  if(!recoveryCurrent(owned)){cancelRecovery();return;}scheduleRecovery(owned);
 }
 function unavailable(c:Capture,reconnect=false){
  if(capture!==c)return;
  if(reconnect&&c.checkpoint&&deps.auth.currentLease()===c.lease&&deps.gate.matches(c.lease)&&!paused)interrupted=Object.freeze({lease:c.lease,companyId:c.context.companyId,conversationId:c.context.conversationId,value:c.checkpoint});
  else interrupted=null;
  deps.cache?.drop({userId:c.lease.userId,companyId:c.context.companyId,conversationId:c.context.conversationId});savedDrafts.clear();
  cancelRecovery();const blocked=Object.freeze({lease:c.lease,context:c.context,reason:'unavailable' as const});blockedSelection=blocked;closeOwned();
  if(blockedSelection!==blocked)return;
  // This synchronously removes inbox/team/search/draft context; its own normal
  // directory read may settle later. Null context is not dismissal of a denial.
  deps.members.retireConversation(c.context);
  if(blockedSelection===blocked&&deps.auth.currentLease()===c.lease){if(reconnect)startRecovery(blocked);publish('unavailable');}
 }
 function update(c:Capture,h:Host,receiptChanged=false){if(!owns(c,true)||host!==h){if(capture===c)unavailable(c);return;}const s=h.snapshot(),history=h.history.snapshot();if(s.status==='unavailable'||s.status==='closed'){unavailable(c);return;}if(history.status==='failed')deps.cache?.drop({userId:c.lease.userId,companyId:c.context.companyId,conversationId:c.context.conversationId});if(receiptChanged||history.busy||history.messages.length>0||!history.busy&&['ready','failed','unavailable'].includes(history.status))publish('chat',h,c.context.companyName,receiptChanged);}
 async function open(c:Capture){
  try{
   if(!owns(c)){unavailable(c);return;}const allowed=await deps.auth.selectCompany(c.context.companyId);if(!owns(c)){unavailable(c);return;}if(!allowed||!owns(c,true)){unavailable(c);return;}
   const conversation=c.lease.openConversation(c.context.companyId,c.context.conversationId);
   if(!owns(c,true)){conversation?.close();unavailable(c);return;}
   if(!conversation||typeof conversation.readRecent!=='function'||deps.conversationAccess&&(deps.conversationAccess.detectNewMessages===true?typeof conversation.probeLatestHead!=='function':typeof conversation.revalidateAccess!=='function')||!conversation.active()){conversation?.close();unavailable(c);return;}
   c.conversation=conversation;
   // A transport probe can retire its handle before the watch sees the failure.
   // Only an already-open chat owns recovery intent; initial denials do not.
   stopConversation=conversation.onClose(()=>unavailable(c,host!==null&&view.route==='chat'&&view.host===host));if(!owns(c,true)||!conversation.active()){unavailable(c);return;}
   const current=()=>owns(c,true)&&c.conversation===conversation&&conversation.active();
   const resume=interrupted?.lease===c.lease&&interrupted.companyId===c.context.companyId&&interrupted.conversationId===c.context.conversationId?interrupted.value:undefined;
   const cacheScope={userId:c.lease.userId,companyId:c.context.companyId,conversationId:c.context.conversationId};
   const candidatePage=await deps.cache?.page(cacheScope);let cachedPage=candidatePage&&conversation.revalidateAccess&&await conversation.revalidateAccess()?candidatePage:null;if(!current()){unavailable(c);return;}let cacheTicket=deps.cache?.ticket();let lastCachedPage=cachedPage;
   let ownedHost:Host|null=null,removalNeedsAudioPurge=false;
   const sync=deps.messageRemoval===true?createMessageRemovalSync({context:cacheScope,rpc:conversation.messageRemoval??(()=>Promise.reject(Error('Conversation unavailable'))),current,purgeMedia:async items=>{if(!current())throw Error('Conversation unavailable');if(deps.cache){if(removalNeedsAudioPurge)await deps.cache.purgeAudio(cacheScope);removalNeedsAudioPurge=false;for(const item of items)deps.cache.purgeImage(cacheScope,item.messageId);await deps.cache.flush();cacheTicket=deps.cache.ticket();if(ownedHost&&lastCachedPage&&sync?.snapshot().started){lastCachedPage=sync.protect(lastCachedPage);deps.cache.putPage(cacheScope,lastCachedPage,cacheTicket,false);await deps.cache.flush();}}if(!current())throw Error('Conversation unavailable');},apply:items=>{if(current()){removalNeedsAudioPurge=items.some(item=>{const row=lastCachedPage?.items.find(row=>row.id===item.messageId);return !row||!row.removed_scope&&row.kind==='audio';});deps.members.maskMessagePreviews?.(cacheScope.companyId,cacheScope.conversationId,items.map(m=>m.messageId));if(ownedHost&&current())ownedHost.history.applyRemovals(items);}}}):null;
   if(sync){removalSync=sync;await sync.poll();if(!current()){unavailable(c);return;}if(cachedPage){cachedPage=sync.protect(cachedPage);lastCachedPage=cachedPage;if(deps.cache&&cacheTicket!==undefined){deps.cache.putPage(cacheScope,cachedPage,cacheTicket,false);await deps.cache.flush();}}}

   const next=createRecentConversationHost({allowImage:deps.imageHistory==='placeholder-only',allowRemoval:deps.messageRemoval===true,...(cachedPage?{cachedPage}:{}),...(resume?{resume}:{}),onCheckpoint:value=>{if(owns(c,true)&&current())c.checkpoint=value;},allowAudio:deps.audioPlayback!==undefined||deps.audioHistory==='placeholder-only',context:{userId:c.lease.userId,sessionKey:c.lease.sessionKey,companyId:c.context.companyId,conversationId:c.context.conversationId},...(conversation.receiptLookup?{receiptLookup:conversation.receiptLookup}:{}),rpc:conversation.rpc,readPort:sync?sync.wrapRead(conversation.readRecent!):(request,signal)=>conversation.readRecent!(request,signal),...(deps.cache?{progressiveHistory:{maxBytes:deps.cache.snapshot().segmented?16*1024*1024:480*1024,incremental:deps.cache.snapshot().segmented,onSnapshot:(page:unknown,removedIds?:readonly string[])=>{lastCachedPage=page as RecentHistoryPage;if(current()&&cacheTicket!==undefined)deps.cache?.putPage(cacheScope,page as RecentHistoryPage,cacheTicket,!!removedIds?.length);}}}:{}),...(typeof conversation.revalidateAccess==='function'?{validateReadCancellation:async(signal:AbortSignal)=>current()&&await conversation.revalidateAccess!(signal)&&current()}:{}),current,createId:deps.createId,schedule:deps.schedule,timeoutMs:deps.timeoutMs,maxMessages:deps.cache?10000:100});
   if(!current()){next.close();unavailable(c);return;}host=next;ownedHost=next;if(sync&&conversation.messageRemoval)removal=createMessageRemovalController({context:cacheScope,userId:c.lease.userId,current:()=>host===next&&current(),rows:()=>next.history.snapshot().messages.filter(m=>!m.removedScope),createOperationId:deps.createId,rpc:conversation.messageRemoval,apply:receipt=>sync.applyReceipt(receipt)});if(resume)interrupted=null;const restored=savedDrafts.take(c.lease,c.context.companyId,c.context.conversationId);if(!resume&&restored!==null&&current())next.setDraft(restored);stopHost=next.subscribe(()=>{savedDrafts.take(c.lease,c.context.companyId,c.context.conversationId);update(c,next);});
   if(deps.audioPlayback&&conversation.audioResolve&&conversation.audioTransfer){const live=()=>host===next&&current();audioUi=deps.audioPlayback.createUi({enabled:true,conversation,companyId:c.context.companyId,conversationId:c.context.conversationId,current:live,isAudioMessage:id=>live()&&next.history.snapshot().status==='ready'&&next.history.snapshot().messages.some(m=>m.id===id&&m.kind==='audio')});if(!live()){audioUi.dispose();audioUi=null;unavailable(c);return;}}
   if(deps.cache&&conversation.audioProtocol==='scoped-v1'&&conversation.audioResolve&&conversation.audioTransfer)autoAudio=createAudioAutoDownload({cache:deps.cache,scope:cacheScope,conversation,host:next,current:()=>host===next&&current(),schedule:deps.schedule});
   if(deps.messageReceipts===true&&conversation.messageReceipts)delivery=createDeliveredWindowBinding({enabled:true,history:next.history,userId:c.lease.userId,recipientRole:c.context.kind,companyId:c.context.companyId,conversationId:c.context.conversationId,current,rpc:conversation.messageReceipts});
   if(deps.messageReceipts===true&&conversation.messageReceipts)authorStatuses=createOwnMessageStatusBinding({changed:()=>{if(host===next&&current())update(c,next,true);},enabled:true,history:next.history,userId:c.lease.userId,companyId:c.context.companyId,conversationId:c.context.conversationId,current,rpc:conversation.messageReceipts});
   if(conversation.receiptLookup)receiptRecovery=createUncertainSendRecovery({host:next,current:()=>host===next&&current(),schedule:deps.schedule});
   if(deps.conversationAccess){
    const policy=deps.conversationAccess,live=()=>host===next&&current();let acceptedHead:ConversationHead|null=null;
    if(policy.detectNewMessages===true)headNotice=createConversationHeadNotice({history:next.history,current:live,changed:()=>{if(live())update(c,next);}});
    accessWatch=createConversationAccessWatch({current:live,revalidate:policy.detectNewMessages===true?async signal=>{acceptedHead=await conversation.probeLatestHead!(signal);return isConversationHead(acceptedHead)&&!signal.aborted&&live();}:signal=>conversation.revalidateAccess!(signal),
     onValidated:()=>{if(live()){if(policy.detectNewMessages===true)headNotice?.accept(acceptedHead);authorStatuses?.refresh();if(sync)void sync.poll().catch(()=>{if(live())unavailable(c);});}},close:()=>unavailable(c,true),now:policy.now,schedule:deps.schedule,intervalMs:policy.intervalMs,timeoutMs:policy.timeoutMs});
   }
   if(deps.cache){let stopped=false,cancel=()=>{};const arm=()=>{if(stopped||!current())return;cancel=deps.schedule(()=>{if(stopped||!current())return;const h=next.history.snapshot(),v=next.snapshot();if(!h.busy&&!v.sending&&!v.pending.length&&!v.draft&&!h.olderWindow)void (deps.cache?.snapshot().segmented?next.history.reconcileNext():next.history.pollLatest()).finally(arm);else arm();},deps.cache?.snapshot().segmented?10000:60000);};stopReconcile=()=>{stopped=true;cancel();};arm();}
   update(c,next);
  }catch{unavailable(c);}
 }
 function sync(){if(disposed||syncing)return;syncing=true;try{
  // Gate observers may synchronously update Auth/membership while being read.
  // Retry only a bounded number of stable snapshots, never leave a stale open.
  for(let budget=0;budget<4;budget++){
   const a=deps.auth.snapshot(),lease=a.status==='authenticated'?deps.auth.currentLease():null,m=deps.members.snapshot();
   const approved=!!lease&&deps.gate.matches(lease);
   if(deps.auth.snapshot()!==a||deps.members.snapshot()!==m||(a.status==='authenticated'?deps.auth.currentLease():null)!==lease)continue;
   if(interrupted&&(!lease||interrupted.lease!==lease||!approved||m.context!==null&&(m.context.companyId!==interrupted.companyId||m.context.conversationId!==interrupted.conversationId)))interrupted=null;
   if(backgroundResume&&(!lease||backgroundResume.lease!==lease||!approved))backgroundResume=null;
   if(recovery&&!recoveryCurrent(recovery))cancelRecovery();
   if(blockedSelection&&(blockedSelection.lease!==lease||blockedSelection.reason==='back'&&blockedSelection.context!==m.context||m.context!==null&&blockedSelection.context!==m.context))blockedSelection=null;
   if(lease&&approved&&!paused)savedDrafts.bind(lease);else savedDrafts.clear();
   const context=!paused&&lease&&approved&&m.stage==='ready'&&!blockedSelection?m.context:null;
   if(capture&&capture.lease===lease&&capture.context===context&&capture.scope===m.scopeKey&&owns(capture)){if(media&&!media.cap.current()){media=null;for(const f of [...listeners])try{f();}catch{}}return;}
   if(deps.auth.snapshot()!==a||deps.members.snapshot()!==m)continue;
   closeOwned();if(!lease){publish('signed-out');return;}if(!context){publish(!paused&&approved&&blockedSelection?.reason==='unavailable'?'unavailable':'memberships');return;}
   const next:Capture={lease,context,scope:m.scopeKey,generation,conversation:null,checkpoint:null};capture=next;
   if(!owns(next)){closeOwned();continue;}publish('opening',null,next.context.companyName);void open(next);return;
  }
  closeOwned();publish('unavailable');
 }catch{closeOwned();publish('unavailable');}finally{syncing=false;}}
 const audioSendScopes=new WeakMap<ConversationMediaCapability,Readonly<{conversation:TextConversation;context:Readonly<{userId:string;sessionKey:string;companyId:string;conversationId:string}>;current:()=>boolean}>>();
 function captureAudioSendScope(expected:Host){
  const c=capture,cap=captureMediaScope();if(!c||!cap||host!==expected||!owns(c,true)||c.conversation?.audioProtocol!=='scoped-v1'||!c.conversation.audioTransfer||!c.conversation.audioMessage)return null;
  const prior=audioSendScopes.get(cap);if(prior)return prior.current()?prior:null;
  const conversation=c.conversation,current=()=>host===expected&&capture===c&&owns(c,true)&&cap.current()&&c.conversation===conversation&&conversation.active();
  const scope=Object.freeze({conversation,context:Object.freeze({userId:c.lease.userId,sessionKey:c.lease.sessionKey,companyId:c.context.companyId,conversationId:c.context.conversationId}),current});audioSendScopes.set(cap,scope);return current()?scope:null;
 }

 const imageScopes=new WeakMap<ConversationMediaCapability,Readonly<{conversation:TextConversation;context:Readonly<{userId:string;sessionKey:string;companyId:string;conversationId:string}>;current:()=>boolean}>>();
 function captureImageScope(expected:Host){const c=capture,cap=captureMediaScope();if(!c||!cap||host!==expected||!owns(c,true)||!c.conversation?.imageTransfer?.active())return null;const old=imageScopes.get(cap);if(old)return old.current()?old:null;const conversation=c.conversation,current=()=>host===expected&&capture===c&&owns(c,true)&&cap.current()&&c.conversation===conversation&&conversation.active()&&conversation.imageTransfer!.active();const scope=Object.freeze({conversation,context:Object.freeze({userId:c.lease.userId,sessionKey:c.lease.sessionKey,companyId:c.context.companyId,conversationId:c.context.conversationId}),current});imageScopes.set(cap,scope);return current()?scope:null;}
 const seenScopes=new WeakMap<ConversationMediaCapability,Readonly<{owner:object;current:()=>object|null;companyId:string;conversationId:string;seenRpc:NonNullable<TextConversation['seenMessages']>;visualReceiptRpc?:MessageReceiptsRpc;visualRecipientIds?:(ids:readonly string[])=>readonly string[];countsRpc:MembershipTextSession['membership'];count:(value:number|null)=>void}>>();
 function captureSeenScope(){
  const c=capture,cap=captureMediaScope();if(!c||!cap||!c.conversation?.seenMessages||!('membership' in c.lease)||typeof c.lease.membership!=='function')return null;
  const known=seenScopes.get(cap);if(known)return known;
  const lease=c.lease as MembershipTextSession,originalHost=host;
  const visualRecipientIds=(ids:readonly string[])=>{if(!cap.current()||!originalHost||host!==originalHost)return [];const wanted=new Set(ids);return originalHost.history.snapshot().messages.filter(m=>!m.removedScope&&wanted.has(m.id)&&m.senderId!==c.lease.userId&&m.senderRole===(c.context.kind==='staff'?'patient':'staff')).map(m=>m.id);};
  const scope=Object.freeze({owner:cap.token,current:()=>cap.current()?cap.token:null,companyId:c.context.companyId,conversationId:c.context.conversationId,seenRpc:c.conversation.seenMessages,...(deps.messageReceipts===true&&c.conversation.messageReceipts?{visualReceiptRpc:c.conversation.messageReceipts,visualRecipientIds}:{}),countsRpc:lease.membership,count:(value:number|null)=>{if(cap.current())deps.members.updateConversationUnread(c.context.companyId,c.context.conversationId,value);}});seenScopes.set(cap,scope);return scope;
 }
 const stops=[deps.auth.subscribe(sync),deps.members.subscribe(sync),deps.gate.subscribe(sync)];sync();
 return Object.freeze({messageRemovalFor:(expected:Host)=>host===expected&&capture&&owns(capture,true)?removal??undefined:undefined,audioPlaybackFor:(expected:Host)=>host===expected&&capture&&owns(capture,true)&&expected.snapshot().status==='active'?audioUi?.factory:undefined,ownMessageStatusesFor:(expected:Host)=>host===expected&&capture&&owns(capture,true)&&expected.snapshot().status==='active'?authorStatuses?.snapshot()??Object.freeze([]):Object.freeze([]),ownMessageStatuses:()=>authorStatuses?.snapshot()??Object.freeze([]),snapshot:()=>view,
  pauseForegroundAccess(){const c=capture,h=host,w=accessWatch;if(!c||!h||!w||view.route!=='chat'||!owns(c,true)||!w.pause())return false;coveredAccess=Object.freeze({capture:c,host:h,watch:w});return true;},
  async resumeForegroundAccess(signal:AbortSignal){const held=coveredAccess;const current=()=>!signal.aborted&&coveredAccess===held&&held!==null&&capture===held.capture&&host===held.host&&accessWatch===held.watch&&owns(held.capture,true);if(!held||!current())return false;return await held.watch.resume(signal)&&current();},
  captureImageScope,captureMediaScope,captureSeenScope,captureAudioSendScope,subscribe:(fn:()=>void)=>{if(disposed)return()=>{};listeners.add(fn);return()=>{listeners.delete(fn);};},
  retainDraft(expected:Host){const c=capture;if(disposed||paused||!c||host!==expected||!owns(c,true))return false;const v=expected.snapshot();return v.status==='active'&&!v.sending&&!v.pending.length&&savedDrafts.save(c.lease,c.context.companyId,c.context.conversationId,v.draft);},
  clearPrivateView():undefined{if(disposed)return undefined;if(capture&&host===null&&capture.conversation===null&&owns(capture)){publish('opening',null,capture.context.companyName);return undefined;}cancelRecovery();backgroundResume=null;interrupted=null;savedDrafts.clear();closeOwned();publish(deps.auth.snapshot().status==='authenticated'?blockedSelection?.reason==='unavailable'?'unavailable':'memberships':'signed-out');return undefined;},
  back(){
   if(disposed)return Promise.resolve(false);
   const lease=deps.auth.currentLease(),context=deps.members.snapshot().context,c=capture;
   const normal=!!c&&view.route==='chat'&&host!==null&&host.snapshot().status==='active'&&owns(c,true)&&c.context===context&&!deps.members.snapshot().busy;
   cancelRecovery();backgroundResume=null;interrupted=null;blockedSelection=lease&&context?{lease,context,reason:'back'}:null;closeOwned();publish('memberships');
   if(!lease||deps.auth.currentLease()!==lease||deps.members.snapshot().context!==context)return Promise.resolve(false);
   if(normal&&context&&deps.members.leaveConversation){
    if(deps.members.leaveConversation(context))return Promise.resolve(true);
    // A synchronous observer may have selected another context/session.
    if(deps.auth.currentLease()!==lease||deps.members.snapshot().context!==context)return Promise.resolve(false);
   }
   // Denial, interrupted opening or unavailable ownership never reuses rows.
   return deps.members.reload();
  },
  signOut(){if(disposed)return Promise.resolve(undefined);cancelRecovery();backgroundResume=null;interrupted=null;blockedSelection=null;savedDrafts.clear();closeOwned();publish('signed-out');return deps.auth.signOut();},
  suspend(){
   if(disposed||paused)return;
   // Keep only this session's own draft/send intent in memory. Messages,
   // media handles and authorization are retired and fetched again on return.
   const c=capture,priorRecovery=recovery?.blocked??blockedSelection;cancelRecovery();backgroundResume=null;
   if(c&&host&&view.route==='chat'&&owns(c,true)&&c.checkpoint){
    interrupted=Object.freeze({lease:c.lease,companyId:c.context.companyId,conversationId:c.context.conversationId,value:c.checkpoint});
    backgroundResume=Object.freeze({lease:c.lease,context:c.context,reason:'unavailable' as const});
   }else if(interrupted&&priorRecovery?.reason==='unavailable'&&priorRecovery.lease===interrupted.lease&&deps.auth.currentLease()===interrupted.lease&&deps.gate.matches(interrupted.lease)){backgroundResume=priorRecovery;}
   else interrupted=null;
   paused=true;savedDrafts.clear();closeOwned();publish('memberships');
  },resume(){
   if(disposed)return;paused=false;
   const restore=backgroundResume;backgroundResume=null;
   if(restore&&deps.auth.currentLease()===restore.lease&&deps.gate.matches(restore.lease)&&deps.members.snapshot().context!==restore.context)blockedSelection=restore;
   sync();
   if(restore&&blockedSelection===restore){startRecovery(restore);if(recovery)publish('unavailable');else{blockedSelection=null;publish('memberships');}}
  },
  dispose(){if(disposed)return;cancelRecovery();backgroundResume=null;interrupted=null;disposed=true;savedDrafts.clear();for(const stop of stops)stop();closeOwned();view=Object.freeze({revision:view.revision+1,route:'signed-out',company:null,heading:null,host:null,hasNewMessages:false,recovering:false});for(const f of [...listeners])try{f();}catch{}listeners.clear();},
 });
}
