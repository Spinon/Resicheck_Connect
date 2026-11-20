import {createAudioMessageCommit} from '../../../packages/chat-client/src/audio-message-commit.ts';
import {audioMessageCommand} from '../../../packages/chat-client/src/audio-message-rpc.ts';
import type {AudioTransferIntent,AudioTransferReceipt} from '../../../packages/chat-client/src/audio-transfer.ts';
import type {TextConversation} from '../../../packages/chat-client/src/text-session-channel.ts';
import type {LocalAudioView} from './local-audio.ts';
type Phase='off'|'review'|'reading'|'uploading'|'waiting'|'checking'|'needs-upload'|'upload-unknown'|'blocked'|'rejected'|'failed'|'sending'|'uncertain'|'sent'|'closed';
type View=Readonly<{phase:Phase;messageId:string|null}>;
type Options=Readonly<{enabled?:boolean;conversation:TextConversation;context:Readonly<{userId:string;sessionKey:string;companyId:string;conversationId:string}>;current:()=>boolean;draft:Readonly<{snapshot:()=>LocalAudioView;subscribe:(fn:()=>void)=>()=>void}>;source:()=>Readonly<{durationMs:number;read:(max:number,signal:AbortSignal)=>Promise<Uint8Array>}>;createId:()=>string;schedule:(fn:()=>void,ms:number)=>()=>void;timeoutMs:number;onSent?:()=>void}>;
/** Explicit reviewed intent; inspection does not count as message acceptance. Default OFF. */
export function createScopedReviewedAudio(input:Options){
 const d=Object.freeze({...input,context:Object.freeze({...input.context})});
 const original=d.enabled===true?d.draft.snapshot():null;
 let view:View=Object.freeze({phase:d.enabled===true?'review':'off',messageId:null}),closed=false,started=false,io=false,revision=0,polls=0,resumes=0;
 let held:Uint8Array|null=null,intent:AudioTransferIntent|null=null,commit:ReturnType<typeof createAudioMessageCommit>|null=null,interrupt:(()=>void)|null=null;
 let cancelPoll=()=>{},stopDraft=()=>{},stopScope=()=>{};const listeners=new Set<()=>void>();
 const live=()=>{try{return !closed&&d.enabled===true&&d.current()&&d.conversation.active()&&d.draft.snapshot()===original&&original?.phase==='ready';}catch{return false;}};
 const emit=()=>{for(const f of [...listeners])try{f();}catch{}};
 const release=()=>{held?.fill(0);held=null;};
 function publish(phase:Phase,messageId:string|null=null){if(!live()){close();return;}view=Object.freeze({phase,messageId});emit();}
 function close(){if(closed)return;closed=true;revision++;cancelPoll();stopDraft();stopScope();interrupt?.();commit?.close();release();intent=null;view=Object.freeze({phase:'closed',messageId:null});emit();}
 if(d.enabled===true){if(!Number.isSafeInteger(d.timeoutMs)||d.timeoutMs<1||d.timeoutMs>60000)throw Error('Audio unavailable');if(!live()||d.conversation.audioProtocol!=='scoped-v1'||!d.conversation.audioTransfer||!d.conversation.audioMessage)throw Error('Audio unavailable');
  const changed=()=>{if(!live())close();};const a=d.draft.subscribe(changed);if(closed)a();else stopDraft=a;if(!closed){const b=d.conversation.onClose(close);if(closed)b();else stopScope=b;}
 }
 async function bounded<T>(action:(signal:AbortSignal)=>Promise<T>){
  if(!live()||io)throw Error('Audio unavailable');io=true;const ac=new AbortController();let reject!:(e:Error)=>void;
  const stopped=new Promise<never>((_,no)=>reject=no);void stopped.catch(()=>{});const abort=()=>{ac.abort();reject(Error('Audio unavailable'));};interrupt=abort;let cancel=()=>{},launched=false;
  try{cancel=d.schedule(abort,d.timeoutMs);if(!live()||ac.signal.aborted)throw Error('Audio unavailable');launched=true;
   const pending=Promise.resolve().then(()=>{if(!live()||ac.signal.aborted)throw Error('Audio unavailable');return action(ac.signal);}).then(value=>{if(!live()||ac.signal.aborted){if(value instanceof Uint8Array)value.fill(0);throw Error('Audio unavailable');}return value;}).finally(()=>{io=false;});
   return await Promise.race([pending,stopped]);
  }finally{cancel();ac.abort();if(interrupt===abort)interrupt=null;if(!launched)io=false;}
 }
 function poll(){cancelPoll();if(!live()||view.phase!=='waiting'||polls>=6)return;const delays=[1000,2000,3000,5000,8000,10000];cancelPoll=d.schedule(()=>{cancelPoll=()=>{};void recover(false);},delays[polls++]);}
 async function commitReady(attachmentId:string){
  release();cancelPoll();if(!live())return;
  if(!commit){const message=d.conversation.audioMessage!;const send=(kind:'send'|'lookup')=>async(c:Readonly<{companyId:string;conversationId:string;attachmentId:string;clientMessageId:string}>,s:AbortSignal)=>{const r=await message(audioMessageCommand(kind,c.companyId,c.conversationId,c.clientMessageId,c.attachmentId),s);if(r.error)throw Error('Audio unavailable');return r.data;};
   commit=createAudioMessageCommit({enabled:true,context:d.context,attachmentId,current:live,createId:d.createId,send:send('send'),lookup:send('lookup'),schedule:d.schedule,timeoutMs:d.timeoutMs});
  }
  publish('sending');await commit.start();if(!live())return;reflectCommit();
 }
 function reflectCommit(){const v=commit!.snapshot();if(v.phase==='sent'){publish('sent',v.messageId);try{if(live())d.onSent?.();}catch{}}else publish('uncertain');}
 async function accept(r:AudioTransferReceipt){
  if(!intent||r.company_id!==intent.companyId||r.conversation_id!==intent.conversationId||r.client_upload_id!==intent.clientUploadId||r.sender_id!==d.context.userId)throw Error('Audio unavailable');
  if(r.state==='ready'&&r.attachment_id){await commitReady(r.attachment_id);return;}
  if(r.state==='rejected'){release();publish('rejected');return;}
  if(r.state==='not_observed'||r.inspection_phase==='awaiting_upload'){publish(resumes>0?'blocked':'needs-upload');return;}
  if(r.inspection_phase==='expired'||r.inspection_phase==='inspection_failed'){publish('blocked');return;}
  if(r.state!=='quarantined')throw Error('Audio unavailable');publish('waiting');poll();
 }
 async function submit(){if(!live()||!intent||!held||io)return;publish('uploading');try{const result=await bounded(s=>d.conversation.audioTransfer!.upload(intent!,held!,s));if(live())await accept(result);}catch{if(live())publish('upload-unknown');}}
 async function start(){if(d.enabled!==true||!live()||started)return;started=true;const ticket=++revision;publish('reading');
  try{const source=d.source();if(!Number.isFinite(source.durationMs)||source.durationMs<500||source.durationMs>60500)throw Error('Audio unavailable');const clientUploadId=d.createId();if(!/^[A-Za-z0-9_-]{1,80}$/.test(clientUploadId))throw Error('Audio unavailable');intent=Object.freeze({companyId:d.context.companyId,conversationId:d.context.conversationId,clientUploadId});
   const bytes=await bounded(s=>source.read(1048576,s));if(!live()||ticket!==revision){bytes.fill(0);return;}if(!(bytes instanceof Uint8Array)||bytes.length<16||bytes.length>1048576){if(bytes instanceof Uint8Array)bytes.fill(0);throw Error('Audio unavailable');}held=Uint8Array.from(bytes);bytes.fill(0);await submit();
  }catch{if(live())publish('failed');}
 }
 async function recover(manual=true){
  if(d.enabled!==true||!live()||io||!started||['sent','closed','sending','checking','uploading','reading'].includes(view.phase))return;
  cancelPoll();if(manual)polls=0;
  if(commit){publish('checking');await commit.recover();if(live())reflectCommit();return;}
  if(!intent||!['waiting','upload-unknown','needs-upload','blocked'].includes(view.phase))return;publish('checking');
  try{const result=await bounded(s=>d.conversation.audioTransfer!.lookup(intent!,s));if(live())await accept(result);}catch{if(live())publish('upload-unknown');}
 }
 return Object.freeze({start,recover:()=>recover(true),resumeUpload:async()=>{if(live()&&!io&&view.phase==='needs-upload'&&resumes===0){resumes++;await submit();}},
  snapshot:()=>{if(d.enabled===true&&!live())close();return view;},subscribe:(f:()=>void)=>{listeners.add(f);return()=>{listeners.delete(f);};},close});
}
