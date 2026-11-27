import{createImageTransfer,type ImageTransfer}from'./image-transfer.ts';
import type{MembershipLinkRpc}from './membership-secret-link.ts';
import{canonicalRemovalCommand,type MessageRemovalRpc}from './message-removal.ts';
import type{AudioResolveRpc}from './audio-message-resolver.ts';
import type{AudioMessageRpc}from './audio-message-rpc.ts';
import{decodeMessageProjection}from './message-content.ts';
import type{AudioTransfer,AudioTransferScope}from './audio-transfer.ts';
import type{MessageReceiptsRpc}from './message-receipts.ts';
import type{OwnReceiptRpc}from './own-send-receipt.ts';
import type {SeenMessagesRpc} from './seen-messages.ts';
import {createConversationHeadProbe,type ConversationHeadProbe} from './conversation-head-read.ts';
import type {CompanyRegistryRpc} from './company-registry-rpc.ts';
import type {SignupReviewRpc} from './signup-review-rpc.ts';
import {createSessionRpcTransport} from './session-rpc.ts';
import type {SubjectBoundRpc} from './supabase-send.ts';
import type {HistoryRequest,HistoryMessage} from './text-history.ts';
import {analyzeMessage} from '../../text/src/message-text.ts';
import {createRecentHistoryRead,type RecentHistoryRead} from './recent-history-read.ts';
import {parseHistoryTimestamp} from './history-timestamp.ts';
import type {MembershipRpc} from './membership-directory.ts';
import type {StaffEmployerRpc} from './staff-employer.ts';
import type {SubjectBoundOnboardingRpc} from './onboarding-rpc.ts';
type Input=Readonly<{userId:string;sessionKey:string;accessToken:string;expiresAt:number}>;
type Options=Parameters<typeof createSessionRpcTransport>[0]&Readonly<{audioHistory?:'placeholder-only';imageHistory?:'placeholder-only';enableImageTransfer?:boolean;imageDigest?:(bytes:Uint8Array)=>Promise<string>}>;
export type ConversationAudioTransfer=Pick<AudioTransfer,'upload'|'lookup'|'read'>;
export type ConversationImageTransfer=Pick<ImageTransfer,'upload'|'status'|'commit'|'read'|'active'|'busy'|'resolve'>;
export type TextConversation=Readonly<{imageTransfer?:ConversationImageTransfer;audioProtocol?:'scoped-v1';audioResolve?:AudioResolveRpc;audioMessage?:AudioMessageRpc;audioTransfer?:ConversationAudioTransfer;messageReceipts?:MessageReceiptsRpc;messageRemoval?:MessageRemovalRpc;receiptLookup?:OwnReceiptRpc;seenMessages?:SeenMessagesRpc;rpc:SubjectBoundRpc;history:(request:HistoryRequest,signal?:AbortSignal)=>Promise<unknown>;readRecent?:RecentHistoryRead;probeLatestHead?:ConversationHeadProbe;revalidateAccess?:(signal?:AbortSignal)=>Promise<boolean>;active:()=>boolean;onClose:(callback:()=>void)=>()=>void;close:()=>void}>;
export type TextSession=Readonly<{userId:string;sessionKey:string;openConversation:(companyId:string,conversationId:string)=>TextConversation|null;close:()=>void}>;
// Additive concrete lease: reuse this channel's one verified transport, rather
// than composing two independent Auth binds. Legacy TextSession mocks stay valid.
export type MembershipTextSession=TextSession&Readonly<{membership:MembershipRpc;staffEmployer:StaffEmployerRpc}>;
export type OnboardingMembershipTextSession=MembershipTextSession&Readonly<{verifiedAuthSession?:import('./verified-auth-session.ts').VerifiedAuthSession;onboarding:SubjectBoundOnboardingRpc;signupReview?:SignupReviewRpc;companyRegistry?:CompanyRegistryRpc;membershipLinks?:MembershipLinkRpc;membershipLinkCompany?:(id:string,signal:AbortSignal)=>Promise<unknown>}>;
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const unavailable=()=>Error('Text channel unavailable');
const denied=()=>Object.freeze({data:null,error:Object.freeze({code:'42501'})});
const historyDenied=()=>Object.freeze({ok:false,code:'UNAVAILABLE'});
const MAX_BODY=2*1024*1024,MAX_PAGE=25;
const messageFields='id,company_id,conversation_id,sender_id,sender_role,sequence,accepted_at,kind,body,important';

// Candidate composition only; not mounted in the product. The original RPC
// transport verifies Auth. New GETs use the same captured subject/token, never a
// shared mutable SDK client. Tests inject fetch; this module initiates no login.
export function createTextSessionChannel(options:Options){
 if(options.audioHistory!==undefined&&options.audioHistory!=='placeholder-only')throw unavailable();
 const allowImageHistory=options.imageHistory==='placeholder-only';if(options.imageHistory!==undefined&&!allowImageHistory||allowImageHistory&&options.enableMessageRemoval!==true)throw unavailable();
 if(options.enableImageTransfer!==undefined&&typeof options.enableImageTransfer!=='boolean'||options.enableImageTransfer===true&&(!allowImageHistory||options.projectUrl!=='https://ibdlvlwdzmsrbqadrudb.supabase.co'||typeof options.imageDigest!=='function')||options.imageDigest!==undefined&&options.enableImageTransfer!==true)throw unavailable();
 const allowAudioHistory=options.enableAudioMessages===true||options.audioHistory==='placeholder-only';
 const base=createSessionRpcTransport(options),{projectUrl,publishableKey,fetch:fetchRequest,now,schedule,timeoutMs,maxPending=8}=options;
 type Ctx={companyId:string;conversationId:string;closed:boolean;imageTransfer?:ImageTransfer;jobs:Set<()=>void>;rpcJobs:Set<AbortController>;listeners:Set<()=>void>;handle:TextConversation};
 type Run={userId:string;sessionKey:string;token:string|null;expiresAt:number;closed:boolean;ctx:Ctx|null;ctxGeneration:number;cancel:()=>void;audioTransfer?:AudioTransfer;audioResolve?:AudioResolveRpc;audioMessage?:AudioMessageRpc;messageReceipts?:MessageReceiptsRpc;messageRemoval?:MessageRemovalRpc;receiptLookup?:OwnReceiptRpc;seenMessages?:SeenMessagesRpc;rpc:SubjectBoundRpc};
 // Frontend cancellation settles get() promptly, but cannot prove that a
 // native fetch/reader honored abort. Keep raw GET admission across context
 // and Auth replacement until its actual operation settles. Never reset it.
 const rawGets=new Set<object>();
 let run:Run|null=null,generation=0;
 function closeContext(r:Run,c:Ctx|null){if(!c||c.closed)return;c.closed=true;if(r.ctx===c)r.ctx=null;c.imageTransfer?.close();const jobs=[...c.jobs],rpc=[...c.rpcJobs],listeners=[...c.listeners];c.jobs.clear();c.rpcJobs.clear();c.listeners.clear();for(const stop of jobs)stop();for(const ac of rpc)ac.abort();for(const f of listeners)try{f();}catch{}}
 function reset(){const activation=++generation,r=run;run=null;if(r){r.closed=true;r.token=null;try{r.cancel();}catch{}}base.signOut();if(r)closeContext(r,r.ctx);return activation;}
 function active(r:Run){if(run!==r||r.closed||r.token===null)return false;let time:number;try{time=now();}catch{reset();return false;}if(run!==r)return false;if(!Number.isSafeInteger(time)||time<0||time>=r.expiresAt){reset();return false;}return true;}
 const current=(r:Run,c:Ctx)=>active(r)&&r.ctx===c&&!c.closed;
 async function callScoped(r:Run,signal:AbortSignal,invoke:()=>PromiseLike<Awaited<ReturnType<MembershipRpc>>>):Promise<Awaited<ReturnType<MembershipRpc>>>{
  if(!active(r))return denied();if(signal.aborted)throw unavailable();
  try{
   const reply=await invoke();if(!active(r))return denied();
   // A locally cancelled read is not evidence of remote Auth refusal.
   if(signal.aborted)throw unavailable();
   if(reply.error?.code==='42501'){if(run===r)reset();return denied();}
   return reply;
  }catch{if(!active(r))return denied();throw unavailable();}
 }
 async function get(r:Run,c:Ctx,path:string,signal?:AbortSignal,maxBody=MAX_BODY){
  if(!current(r,c)||signal?.aborted||c.jobs.size>=maxPending||rawGets.size>=maxPending)throw unavailable();
  const ac=new AbortController();let reject!:(reason:Error)=>void,done=false,cancel=()=>{},stream={reader:null as ReadableStreamDefaultReader<Uint8Array>|null};
  const interrupted=new Promise<never>((_,no)=>{reject=no;});void interrupted.catch(()=>{});
  const stop=()=>{if(done)return;ac.abort();reject(unavailable());try{void stream.reader?.cancel().catch(()=>{});}catch{}};
  c.jobs.add(stop);signal?.addEventListener('abort',stop,{once:true});
  try{
   cancel=schedule(stop,timeoutMs);if(!current(r,c)||ac.signal.aborted||signal?.aborted)throw unavailable();
   const url=projectUrl+path,headers=Object.freeze({apikey:publishableKey,Authorization:'Bearer '+r.token,Accept:'application/json','Accept-Profile':'public'});
   const operation=async()=>{
    if(!current(r,c)||ac.signal.aborted||signal?.aborted||rawGets.size>=maxPending)throw unavailable();
    const rawOwner={};rawGets.add(rawOwner);
    try{
    const response=await fetchRequest(url,{method:'GET',headers,signal:ac.signal,redirect:'error',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});
    if(!current(r,c)||ac.signal.aborted){try{await response.body?.cancel();}catch{}throw unavailable();}
    if(response.redirected||response.url&&response.url!==url)throw unavailable();
    if(response.status===401||response.status===403){reset();throw unavailable();}
    if(response.status!==200&&response.status!==206)throw unavailable();
    if(!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')??''))throw unavailable();
    const length=response.headers.get('content-length');if(length!==null&&(!/^\d+$/.test(length)||Number(length)>maxBody))throw unavailable();
    if(!response.body||typeof response.body.getReader!=='function')throw unavailable();stream.reader=response.body.getReader();
    const chunks:Uint8Array[]=[];let size=0;
    while(true){const part=await stream.reader.read();if(!current(r,c)||ac.signal.aborted)throw unavailable();if(part.done)break;if(!(part.value instanceof Uint8Array)||(size+=part.value.length)>maxBody)throw unavailable();chunks.push(part.value);}
    const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
    const value:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(!current(r,c)||ac.signal.aborted)throw unavailable();return value;
    }finally{rawGets.delete(rawOwner);}
   };
   return await Promise.race([interrupted,operation()]);
  }catch{throw unavailable();}
  finally{done=true;c.jobs.delete(stop);try{cancel();}catch{}try{signal?.removeEventListener('abort',stop);}catch{}try{void stream.reader?.cancel().catch(()=>{});stream.reader?.releaseLock();}catch{}ac.abort();}
 }
 async function guard(r:Run,c:Ctx,signal?:AbortSignal){
  const query=new URLSearchParams({select:'id,company_id,patient_id',company_id:'eq.'+c.companyId,id:'eq.'+c.conversationId,limit:'1'});
  const value=await get(r,c,'/rest/v1/conversations?'+query.toString(),signal);
  if(!current(r,c))return null;
  if(!Array.isArray(value)||value.length!==1||!record(value[0])||value[0].id!==c.conversationId||value[0].company_id!==c.companyId||!uuid(value[0].patient_id)){closeContext(r,c);return null;}
  return value[0].patient_id;
 }
 function decode(value:unknown,c:Ctx,after:number,limit:number){
  if(!Array.isArray(value)||value.length>limit)throw unavailable();let last=after;const ids=new Set<string>(),rows:HistoryMessage[]=[];
  for(const raw of value){
   if(!record(raw))throw unavailable();const {id,company_id,conversation_id,sender_id,sender_role,kind,body,sequence,accepted_at,important}=raw;
   const seq=typeof sequence==='string'&&/^[1-9][0-9]{0,15}$/.test(sequence)?Number(sequence):sequence;
   if(!uuid(id)||ids.has(id)||company_id!==c.companyId||conversation_id!==c.conversationId||!uuid(sender_id)||(sender_role!=='patient'&&sender_role!=='staff')||typeof important!=='boolean'||!Number.isSafeInteger(seq)||Number(seq)<=last)throw unavailable();
   if(typeof accepted_at!=='string')throw unavailable();
   const time=parseHistoryTimestamp(accepted_at);if(time===null)throw unavailable();
   const content=decodeMessageProjection(kind,body,important,raw.removed_scope,allowAudioHistory,options.enableMessageRemoval===true,allowImageHistory);
   rows.push(Object.freeze({id,companyId:company_id,conversationId:conversation_id,senderId:sender_id,senderRole:sender_role,kind:content.kind,text:content.text,sequence:Number(seq),acceptedAt:time,important,...(content.removedScope?{removedScope:content.removedScope}:{})}));ids.add(id);last=Number(seq);
  }
  return Object.freeze({ok:true,value:Object.freeze(rows),nextAfter:rows.length===limit?last:null});
 }
 function open(r:Run,companyId:string,conversationId:string):TextConversation|null{
  if(!active(r))return null;if(r.ctx&&!r.ctx.closed&&r.ctx.companyId===companyId&&r.ctx.conversationId===conversationId)return r.ctx.handle;
  const activation=++r.ctxGeneration;closeContext(r,r.ctx);if(!active(r)||activation!==r.ctxGeneration||!uuid(companyId)||!uuid(conversationId))return null;
  const c:Ctx={companyId,conversationId,closed:false,jobs:new Set(),rpcJobs:new Set(),listeners:new Set(),handle:null!};r.ctx=c;
  const history=async(input:HistoryRequest,signal?:AbortSignal)=>{
   if(!current(r,c))return historyDenied();
   try{
    const {companyId:co,conversationId:cv,after,limit}=input;
    if(co!==companyId||cv!==conversationId||!Number.isSafeInteger(after)||after<0||!Number.isSafeInteger(limit)||limit<1||limit>MAX_PAGE)throw unavailable();
    const patient=await guard(r,c,signal);if(patient===null)return historyDenied();
    const query=new URLSearchParams({select:messageFields,company_id:'eq.'+companyId,conversation_id:'eq.'+conversationId,sequence:'gt.'+after,order:'sequence.asc',limit:String(limit)});
    const projection=new URLSearchParams({p_company:companyId,p_conversation:conversationId,p_after:String(after),p_limit:String(limit)});
    const value=await get(r,c,(options.enableMessageRemoval?'/rest/v1/rpc/'+(allowImageHistory?'read_connect_messages_v3?':'read_connect_messages_v2?')+projection.toString():'/rest/v1/messages?'+query.toString()),signal);
    const verified=await guard(r,c,signal);if(verified===null)return historyDenied();if(verified!==patient){closeContext(r,c);return historyDenied();}
    if(!current(r,c))return historyDenied();return decode(value,c,after,limit);
   }catch{if(!current(r,c))return historyDenied();throw unavailable();}
  };
  const rpc:SubjectBoundRpc=async(name,params,signal)=>{
   if(!current(r,c))return denied();const ac=new AbortController(),stop=()=>ac.abort();
   if(c.rpcJobs.size>=maxPending)throw unavailable();c.rpcJobs.add(ac);signal?.addEventListener('abort',stop,{once:true});
   try{
    if(name!=='send_text'||params.p_company!==companyId||params.p_conversation!==conversationId||signal?.aborted)throw unavailable();
    const patient=await guard(r,c,ac.signal);if(patient===null)return denied();
    const response=await r.rpc(name,params,ac.signal);
    if(record(response)&&record(response.error)&&response.error.code==='42501'){reset();return denied();}
    const verified=await guard(r,c,ac.signal);if(verified===null)return denied();if(verified!==patient){closeContext(r,c);return denied();}
    if(!current(r,c))return denied();return response;
   }catch{if(!current(r,c))return denied();throw unavailable();}
   finally{c.rpcJobs.delete(ac);try{signal?.removeEventListener('abort',stop);}catch{}ac.abort();}
  };
  const readRecent=createRecentHistoryRead({allowRemoval:options.enableMessageRemoval===true,allowAudio:allowAudioHistory,allowImage:allowImageHistory,companyId,conversationId,current:()=>current(r,c),guard:signal=>guard(r,c,signal),get:(path,signal)=>get(r,c,path,signal),close:()=>closeContext(r,c)});
  // Read-only freshness probe: reuse this context's existing RLS GET. A failure
  // retires only this handle; no message query or membership mutation is sent.
  const revalidateAccess=async(signal?:AbortSignal)=>{
   if(!current(r,c))return false;
   try{const patient=await guard(r,c,signal);if(patient!==null&&current(r,c)&&!signal?.aborted)return true;}catch{}
   if(current(r,c))closeContext(r,c);return false;
  };
  const probeLatestHead=createConversationHeadProbe({imageHistory:allowImageHistory,companyId,conversationId,current:()=>current(r,c),guard:signal=>guard(r,c,signal),get:(path,signal)=>get(r,c,path,signal,512),close:()=>closeContext(r,c)});
  const seenMessages:SeenMessagesRpc=async(command,signal)=>{
   if(!current(r,c)||command.params.p_company!==companyId||command.params.p_conversation!==conversationId||!r.seenMessages)return denied();
   const ac=new AbortController(),stop=()=>ac.abort();if(signal.aborted||c.rpcJobs.size>=maxPending)return denied();c.rpcJobs.add(ac);signal.addEventListener('abort',stop,{once:true});
   try{const result=await callScoped(r,ac.signal,()=>r.seenMessages!(command,ac.signal));return current(r,c)&&!ac.signal.aborted?result:denied();}
   finally{c.rpcJobs.delete(ac);signal.removeEventListener('abort',stop);ac.abort();}
  };
  const messageRemoval:MessageRemovalRpc=async(rawCommand,signal)=>{
   const command=canonicalRemovalCommand(rawCommand);
   if(!current(r,c)||!r.messageRemoval||signal.aborted||command.params.p_company!==companyId||command.params.p_conversation!==conversationId||c.rpcJobs.size>=maxPending)throw unavailable();
   const ac=new AbortController(),stop=()=>ac.abort();c.rpcJobs.add(ac);signal.addEventListener('abort',stop,{once:true});
   try{
    const patient=await guard(r,c,ac.signal);if(patient===null)throw unavailable();
    const result=await r.messageRemoval(command,ac.signal);
    const verified=await guard(r,c,ac.signal);if(verified===null||verified!==patient||!current(r,c)||ac.signal.aborted){if(verified!==patient)closeContext(r,c);throw unavailable();}
    return result;
   }finally{c.rpcJobs.delete(ac);signal.removeEventListener('abort',stop);ac.abort();}
  };
  const messageReceipts:MessageReceiptsRpc=async(command,signal)=>{
   if(!current(r,c)||!r.messageReceipts||signal.aborted||command.params.p_company!==companyId||command.params.p_conversation!==conversationId||c.rpcJobs.size>=maxPending)return denied();
   const ac=new AbortController(),stop=()=>ac.abort();c.rpcJobs.add(ac);signal.addEventListener('abort',stop,{once:true});
   try{const result=await callScoped(r,ac.signal,()=>r.messageReceipts!(command,ac.signal));if(result.error?.code==='P0001'){
    // A message can be removed after the visible window was decoded but before
    // its receipt commits. This is no evidence of lost conversation access.
    if(options.enableMessageRemoval===true&&command.name!=='lookup_connect_own_message_status_v1'){
     try{const patient=await guard(r,c,ac.signal);if(patient!==null&&current(r,c)&&!ac.signal.aborted)return Object.freeze({data:null,error:Object.freeze({code:'UNAVAILABLE'})});}catch{}
    }
    closeContext(r,c);return denied();
   }return current(r,c)&&!ac.signal.aborted?result:denied();}
   finally{c.rpcJobs.delete(ac);signal.removeEventListener('abort',stop);ac.abort();}
  };
  const receiptLookup:OwnReceiptRpc=async(command,signal)=>{
   if(!current(r,c)||command.params.p_company!==companyId||command.params.p_conversation!==conversationId||!r.receiptLookup||signal.aborted||c.rpcJobs.size>=maxPending)return denied();
   const ac=new AbortController(),stop=()=>ac.abort();c.rpcJobs.add(ac);signal.addEventListener('abort',stop,{once:true});
   try{const result=await callScoped(r,ac.signal,()=>r.receiptLookup!(command,ac.signal));return current(r,c)&&!ac.signal.aborted?result:denied();}
   finally{c.rpcJobs.delete(ac);signal.removeEventListener('abort',stop);ac.abort();}
  };
  const audioResolve:AudioResolveRpc=async(command,signal)=>{if(!current(r,c)||!r.audioResolve||signal.aborted||command.params.p_company!==companyId||command.params.p_conversation!==conversationId||c.rpcJobs.size>=maxPending)return denied();const ac=new AbortController(),stop=()=>ac.abort();c.rpcJobs.add(ac);signal.addEventListener('abort',stop,{once:true});try{const reply=await callScoped(r,ac.signal,()=>r.audioResolve!(command,ac.signal));return current(r,c)&&!ac.signal.aborted?reply:denied();}finally{c.rpcJobs.delete(ac);signal.removeEventListener('abort',stop);ac.abort();}};
  const audioMessage:AudioMessageRpc=async(command,signal)=>{
   if(!current(r,c)||!r.audioMessage||signal.aborted||command.params.p_company!==companyId||command.params.p_conversation!==conversationId||c.rpcJobs.size>=maxPending)return denied();const ac=new AbortController(),stop=()=>ac.abort();c.rpcJobs.add(ac);signal.addEventListener('abort',stop,{once:true});try{const reply=await callScoped(r,ac.signal,()=>r.audioMessage!(command,ac.signal));return current(r,c)&&!ac.signal.aborted?reply:denied();}finally{c.rpcJobs.delete(ac);signal.removeEventListener('abort',stop);ac.abort();}
  };
  async function scopedAudio<T>(command:AudioTransferScope,signal:AbortSignal,invoke:(signal:AbortSignal)=>Promise<T>):Promise<T>{
   if(!current(r,c)||!r.audioTransfer||signal.aborted||command.companyId!==companyId||command.conversationId!==conversationId||c.rpcJobs.size>=maxPending)throw unavailable();
   const ac=new AbortController(),stop=()=>ac.abort();c.rpcJobs.add(ac);signal.addEventListener('abort',stop,{once:true});
   try{const result=await invoke(ac.signal);if(!current(r,c)||ac.signal.aborted){if(result instanceof Uint8Array)result.fill(0);throw unavailable();}return result;}
   catch{if(run===r&&r.audioTransfer&&!r.audioTransfer.active())reset();throw unavailable();}
   finally{c.rpcJobs.delete(ac);signal.removeEventListener('abort',stop);ac.abort();}
  }
  const audioTransfer:ConversationAudioTransfer=Object.freeze({
   upload:(command,bytes,signal)=>{const captured=Object.freeze({...command});return scopedAudio(captured,signal,s=>r.audioTransfer!.upload(captured,bytes,s));},
   lookup:(command,signal)=>{const captured=Object.freeze({...command});return scopedAudio(captured,signal,s=>r.audioTransfer!.lookup(captured,s));},
   read:(command,signal,background)=>{const captured=Object.freeze({...command});return scopedAudio(captured,signal,s=>r.audioTransfer!.read(captured,s,background));},
  });
  let imageTransfer:ConversationImageTransfer|undefined;
  if(options.enableImageTransfer){
   const raw=createImageTransfer({enabled:true,origin:projectUrl,publishableKey,userId:r.userId,current:()=>current(r,c),token:()=>current(r,c)?r.token:null,fetch:fetchRequest,digest:options.imageDigest!,schedule,timeoutMs});c.imageTransfer=raw;
   const within=(command:{companyId:string;conversationId:string},signal:AbortSignal)=>{if(!current(r,c)||signal.aborted||command.companyId!==companyId||command.conversationId!==conversationId)throw unavailable();};
   imageTransfer=Object.freeze({busy:()=>raw.busy(),active:()=>current(r,c)&&raw.active(),upload:(command,bytes,signal)=>{within(command,signal);return raw.upload(command,bytes,signal);},status:(command,signal)=>{within(command,signal);return raw.status(command,signal);},commit:(kind,command,signal)=>{within(command,signal);return raw.commit(kind,command,signal);},resolve:(command,signal)=>{within(command,signal);return raw.resolve(command,signal);},read:(command,signal,progress)=>{within(command,signal);return raw.read(command,signal,progress);}});
  }
  c.handle=Object.freeze({...(imageTransfer?{imageTransfer}:{}),...(options.enableScopedAudioTransfer&&r.audioTransfer?{audioProtocol:'scoped-v1' as const}:{}),...(r.audioResolve?{audioResolve}:{}),...(r.audioMessage?{audioMessage}:{}),...(r.audioTransfer?{audioTransfer}:{}),...(r.messageRemoval?{messageRemoval}:{}),...(r.messageReceipts?{messageReceipts}:{}),...(r.receiptLookup?{receiptLookup}:{}),...(r.seenMessages?{seenMessages}:{}),rpc,history,readRecent,probeLatestHead,revalidateAccess,active:()=>current(r,c),onClose:callback=>{if(!current(r,c)){callback();return()=>{};}c.listeners.add(callback);return()=>{c.listeners.delete(callback);};},close:()=>closeContext(r,c)});return c.handle;
 }
 return Object.freeze({
  bindSession:async(input:Input):Promise<Readonly<{ok:true;value:OnboardingMembershipTextSession}|{ok:false}>>=>{
   const activation=reset();if(activation!==generation)return{ok:false};
   try{
    const {userId,sessionKey,accessToken,expiresAt}=input;
    const verified=await base.bindSession(Object.freeze({userId,sessionKey,accessToken,expiresAt}));
    if(!verified.ok)return{ok:false};if(activation!==generation){verified.value.close();return{ok:false};}
    const r:Run={userId,sessionKey,token:accessToken,expiresAt,closed:false,ctx:null,ctxGeneration:0,cancel:()=>{},rpc:verified.value.rpc,...(verified.value.audioResolve?{audioResolve:verified.value.audioResolve}:{}),...(verified.value.audioMessage?{audioMessage:verified.value.audioMessage}:{}),...(verified.value.audioTransfer?{audioTransfer:verified.value.audioTransfer}:{}),...(verified.value.messageRemoval?{messageRemoval:verified.value.messageRemoval}:{}),...(verified.value.messageReceipts?{messageReceipts:verified.value.messageReceipts}:{}),receiptLookup:verified.value.receiptLookup,...(verified.value.seenMessages?{seenMessages:verified.value.seenMessages}:{})};run=r;
    const cancel=schedule(()=>{if(run===r)reset();},Math.max(0,expiresAt-now()));if(!active(r)){cancel();return{ok:false};}r.cancel=cancel;
    const membership:MembershipRpc=(command,signal)=>callScoped(r,signal,()=>verified.value.membership(command,signal));
    const staffEmployer:StaffEmployerRpc=signal=>callScoped(r,signal,()=>verified.value.staffEmployer(signal));
    const onboarding:SubjectBoundOnboardingRpc=(command,signal)=>callScoped(r,signal,()=>verified.value.onboarding(command,signal));
    const review=verified.value.signupReview;
    const signupReview:SignupReviewRpc|undefined=review?(command,signal)=>callScoped(r,signal,()=>review(command,signal)):undefined;
    const registry=verified.value.companyRegistry;
    const companyRegistry:CompanyRegistryRpc|undefined=registry?(command,signal)=>callScoped(r,signal,()=>registry(command,signal)):undefined;
    return Object.freeze({ok:true,value:Object.freeze({userId,sessionKey,...(verified.value.verifiedAuthSession?{verifiedAuthSession:verified.value.verifiedAuthSession}:{}),membership,staffEmployer,onboarding,...(verified.value.membershipLinks?{membershipLinks:(command:Parameters<MembershipLinkRpc>[0],signal:AbortSignal)=>callScoped(r,signal,()=>verified.value.membershipLinks!(command,signal))}:{}),...(verified.value.membershipLinkCompany?{membershipLinkCompany:async(id:string,signal:AbortSignal)=>{if(!active(r)||signal.aborted)throw unavailable();const value=await verified.value.membershipLinkCompany!(id,signal);if(!active(r)||signal.aborted)throw unavailable();return value;}}:{}),...(companyRegistry?{companyRegistry}:{}),...(signupReview?{signupReview}:{}),openConversation:(co:string,cv:string)=>open(r,co,cv),close:()=>{if(run===r)reset();}})});
   }catch{if(activation===generation)reset();return{ok:false};}
  },
  signOut:()=>{reset();},
 });
}
