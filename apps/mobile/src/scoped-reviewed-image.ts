import{LOCAL_IMAGE_PROFILE}from'./local-image.ts';
import type{createImageReview}from'./image-review.ts';
import{imageFailure,imageUuid,imageId,decodeImageUpload,type ImageIntent,type ImageCommit}from'../../../packages/chat-client/src/image-contract.ts';
import type{ImageTransfer}from'../../../packages/chat-client/src/image-transfer.ts';
export type ImageSendPhase='off'|'review'|'reading'|'uploading'|'upload-unknown'|'inspection-unknown'|'waiting'|'inspection-paused'|'checking'|'rejected'|'failed'|'sending'|'uncertain'|'cancelled'|'sent'|'closed';
export type ImageCancelResult='cancelled-before-send'|'confirmation-required'|'already-finished';
type Context=Readonly<{userId:string;sessionKey:string;companyId:string;conversationId:string}>;
/** One captured draft, owner and intent. No automatic upload resend or send retry.
 * Cancelling is definitive only BEFORE the send dispatch boundary. Upload/status
 * can finish later, but cannot publish a message without that explicit dispatch. */
export function createScopedReviewedImage(input:Readonly<{enabled?:boolean;context:Context;current:()=>boolean;review:ReturnType<typeof createImageReview>;transport:Pick<ImageTransfer,'upload'|'status'|'commit'|'active'>;digest:(b:Uint8Array)=>Promise<string>;createId:()=>string;schedule:(f:()=>void,ms:number)=>()=>void;timeoutMs:number;inspectionTimeoutMs?:number;onSent?:()=>void}>){
 const d=Object.freeze({...input,context:Object.freeze({...input.context})}),context=d.context,preview=d.review.snapshot().preview,inspectionTimeout=d.inspectionTimeoutMs??60000;
 if(![context.userId,context.companyId,context.conversationId].every(imageUuid)||!context.sessionKey||!Number.isSafeInteger(d.timeoutMs)||d.timeoutMs<1||d.timeoutMs>60000||!Number.isSafeInteger(inspectionTimeout)||inspectionTimeout<1||inspectionTimeout>120000)throw imageFailure();
 let closed=false,started=false,physical=false,cancelled=false,commitDispatched=false,inspectionStarted=false,inspectionExpired=false,uploadAcknowledged=false;
 let view:Readonly<{phase:ImageSendPhase;messageId:string|null;canCancel:boolean;confirmationStarted:boolean}>=Object.freeze({phase:(d.enabled===true?'review':'off')as ImageSendPhase,messageId:null as string|null,canCancel:false,confirmationStarted:false});
 let attachmentId:string|null=null;
 let intent:ImageIntent|null=null,commit:ImageCommit|null=null,stopDraft=()=>{},cancelPoll=()=>{},cancelDeadline=()=>{},polls=0,interrupt:(()=>void)|null=null;
 const listeners=new Set<()=>void>();const live=()=>{try{return !closed&&d.enabled===true&&!!preview&&d.current()===true&&d.transport.active()&&d.review.snapshot().preview===preview;}catch{return false;}},running=()=>live()&&!cancelled;
 const emit=()=>{for(const f of[...listeners])try{f();}catch{}};
 function close(){if(closed)return;closed=true;cancelPoll();cancelDeadline();stopDraft();interrupt?.();view=Object.freeze({phase:'closed',messageId:null,canCancel:false,confirmationStarted:commitDispatched});emit();}
 function publish(phase:ImageSendPhase,id:string|null=null){if(!live()){close();return;}if(cancelled&&phase!=='cancelled')return;view=Object.freeze({phase,messageId:id,canCancel:started&&!commitDispatched&&!cancelled&&!['sent','closed','off','rejected'].includes(phase),confirmationStarted:commitDispatched});emit();}
 async function bounded<T>(action:(signal:AbortSignal)=>Promise<T>){if(!running()||physical)throw imageFailure();physical=true;const ac=new AbortController();let reject!:(e:Error)=>void;const stopped=new Promise<never>((_,no)=>reject=no);void stopped.catch(()=>{});const abort=()=>{ac.abort();reject(imageFailure());};interrupt=abort;let cancel=()=>{},launched=false;
  try{cancel=d.schedule(abort,d.timeoutMs);if(!running()||ac.signal.aborted)throw imageFailure();launched=true;const work=Promise.resolve().then(()=>{if(!running()||ac.signal.aborted)throw imageFailure();return action(ac.signal);}).then(v=>{if(!running()||ac.signal.aborted){if(v instanceof Uint8Array)v.fill(0);throw imageFailure();}return v;}).finally(()=>{physical=false;});return await Promise.race([work,stopped]);}
  finally{cancel();ac.abort();if(interrupt===abort)interrupt=null;if(!launched)physical=false;}
 }
 async function sendReady(attachmentId:string){if(!running()||!intent||commit)return;cancelDeadline();cancelPoll();const key=d.createId();if(!imageId(key))throw imageFailure();commit=Object.freeze({companyId:context.companyId,conversationId:context.conversationId,attachmentId,clientMessageId:key});publish('sending');
  try{const r=await bounded(s=>{if(!running()||s.aborted)throw imageFailure();commitDispatched=true;publish('sending');return d.transport.commit('send',commit!,s);});if(r.state!=='accepted')throw imageFailure();publish('sent',r.receipt.id);if(running())try{d.onSent?.();}catch{}}catch{if(running())publish(commitDispatched?'uncertain':'failed');}
 }
 const checkDelays = [1000, 2000, 3000, 5000, 8000, 10000];
 function pauseInspection() {
  inspectionExpired = true;
  cancelPoll();
  cancelDeadline();
  publish('inspection-paused');
 }
 function deadline() {
  if (inspectionStarted) return;
  inspectionStarted = true;
  cancelDeadline = d.schedule(() => {
   if (!running() || commit) return;
   interrupt?.();
   pauseInspection();
  }, inspectionTimeout);
 }
 function poll() {
  cancelPoll();
  if (!running()) return;
  if (inspectionExpired || polls >= checkDelays.length) { pauseInspection(); return; }
  cancelPoll = d.schedule(() => { void recover(); }, checkDelays[polls]);
 }
 async function accept(r: Awaited<ReturnType<ImageTransfer['upload']>>) {
  if (!running()) return;
  if (!intent) throw imageFailure();
  const receipt = decodeImageUpload(r, intent, context.userId);
  if (attachmentId !== null && attachmentId !== receipt.attachmentId) throw imageFailure();
  attachmentId = receipt.attachmentId;
  uploadAcknowledged = true;
  if (receipt.state === 'ready') { await sendReady(attachmentId); return; }
  if (receipt.state === 'rejected') { cancelDeadline(); cancelPoll(); publish('rejected'); return; }
  if (inspectionExpired || polls >= checkDelays.length) { pauseInspection(); return; }
  deadline();
  publish('waiting');
  poll();
 }
 async function recover() {
  if (!running() || physical || !started ||
      !['waiting','inspection-paused','upload-unknown','inspection-unknown','uncertain'].includes(view.phase)) return;
  cancelPoll();
  publish('checking');
  try {
   if (commit) {
    const r = await bounded(s => d.transport.commit('lookup', commit!, s));
    if (r.state === 'accepted') {
     publish('sent', r.receipt.id);
     if (running()) try { d.onSent?.(); } catch {}
    } else publish('uncertain');
   } else if (intent) {
    if (!inspectionExpired) polls++;
    await accept(await bounded(s => d.transport.status(intent!, s)));
   }
  } catch {
   if (!running()) return;
   if (commit) { publish('uncertain'); return; }
   if (inspectionExpired || polls >= checkDelays.length) { pauseInspection(); return; }
   publish(uploadAcknowledged ? 'inspection-unknown' : 'upload-unknown');
   poll();
  }
 }
 function cancel():ImageCancelResult{if(!live()||['sent','closed','rejected'].includes(view.phase))return'already-finished';if(commitDispatched)return'confirmation-required';cancelled=true;cancelPoll();cancelDeadline();interrupt?.();publish('cancelled');return'cancelled-before-send';}
 if(d.enabled===true){if(!live())throw imageFailure();const stop=d.review.subscribe(()=>{if(!live())close();});if(closed)stop();else stopDraft=stop;}
 return Object.freeze({snapshot:()=>{if(d.enabled===true&&!live())close();return view;},subscribe:(f:()=>void)=>{listeners.add(f);return()=>{listeners.delete(f);};},
  async start(){if(!running()||started||view.phase!=='review'||!preview||!d.review.snapshot().canRead||preview.mime==='application/pdf'||preview.bytes>4194304||preview.mode==='optimized'&&preview.profile!==LOCAL_IMAGE_PROFILE.id)return;started=true;let bytes:Uint8Array|null=null;publish('reading');
   try{const key=d.createId();if(!imageId(key))throw imageFailure();bytes=await bounded(s=>d.review.read(s));if(!running())throw imageFailure();const sha256=await bounded(()=>d.digest(bytes!));intent=Object.freeze({companyId:context.companyId,conversationId:context.conversationId,clientUploadId:key,sha256,byteLength:bytes.length,mime:preview.mime,mode:preview.mode,profile:preview.profile});publish('uploading');
    try{const r=await bounded(s=>d.transport.upload(intent!,bytes!,s));await accept(r);}catch{if(running()){deadline();publish('upload-unknown');poll();}}
   }catch{if(running())publish('failed');}finally{bytes?.fill(0);}
  },recover,cancel,close});
}
export type ReviewedImageSender=ReturnType<typeof createScopedReviewedImage>;
