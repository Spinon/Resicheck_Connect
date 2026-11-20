import{LOCAL_IMAGE_PROFILE}from'./local-image.ts';
import type{createImageReview}from'./image-review.ts';
import{imageFailure,imageUuid,imageId,decodeImageUpload,type ImageIntent,type ImageCommit}from'../../../packages/chat-client/src/image-contract.ts';
import type{ImageTransfer}from'../../../packages/chat-client/src/image-transfer.ts';
type Phase='off'|'review'|'reading'|'uploading'|'upload-unknown'|'waiting'|'checking'|'rejected'|'failed'|'sending'|'uncertain'|'sent'|'closed';
type Context=Readonly<{userId:string;sessionKey:string;companyId:string;conversationId:string}>;
/** One captured draft and owner. No automatic upload resend or commit retry.
 * The scope must include session/company/conversation and live access/removal. */
export function createScopedReviewedImage(input:Readonly<{enabled?:boolean;context:Context;current:()=>boolean;review:ReturnType<typeof createImageReview>;transport:Pick<ImageTransfer,'upload'|'status'|'commit'|'active'>;digest:(b:Uint8Array)=>Promise<string>;createId:()=>string;schedule:(f:()=>void,ms:number)=>()=>void;timeoutMs:number;onSent?:()=>void}>){
 const d=Object.freeze({...input,context:Object.freeze({...input.context})});
 const context=d.context,preview=d.review.snapshot().preview;
 if(![context.userId,context.companyId,context.conversationId].every(imageUuid)||!context.sessionKey||!Number.isSafeInteger(d.timeoutMs)||d.timeoutMs<1||d.timeoutMs>60000)throw imageFailure();
 let view=Object.freeze({phase:(d.enabled===true?'review':'off') as Phase,messageId:null as string|null}),closed=false,started=false,physical=false;
 let intent:ImageIntent|null=null,commit:ImageCommit|null=null,stopDraft=()=>{},cancelPoll=()=>{},polls=0,interrupt:(()=>void)|null=null;
 const listeners=new Set<()=>void>();
 const live=()=>{try{return !closed&&d.enabled===true&&!!preview&&d.current()===true&&d.transport.active()&&d.review.snapshot().preview===preview;}catch{return false;}};
 const emit=()=>{for(const f of [...listeners])try{f();}catch{}};
 function close(){if(closed)return;closed=true;cancelPoll();stopDraft();interrupt?.();view=Object.freeze({phase:'closed',messageId:null});emit();}
 function publish(phase:Phase,id:string|null=null){if(!live()){close();return;}view=Object.freeze({phase,messageId:id});emit();}
 async function bounded<T>(action:(signal:AbortSignal)=>Promise<T>){if(!live()||physical)throw imageFailure();physical=true;const ac=new AbortController();let reject!:(e:Error)=>void;const stopped=new Promise<never>((_,no)=>reject=no);void stopped.catch(()=>{});const abort=()=>{ac.abort();reject(imageFailure());};interrupt=abort;let cancel=()=>{},launched=false;
  try{cancel=d.schedule(abort,d.timeoutMs);if(!live()||ac.signal.aborted)throw imageFailure();launched=true;const work=Promise.resolve().then(()=>{if(!live()||ac.signal.aborted)throw imageFailure();return action(ac.signal);}).then(v=>{if(!live()||ac.signal.aborted){if(v instanceof Uint8Array)v.fill(0);throw imageFailure();}return v;}).finally(()=>{physical=false;});return await Promise.race([work,stopped]);}
  finally{cancel();ac.abort();if(interrupt===abort)interrupt=null;if(!launched)physical=false;}
 }
 async function sendReady(attachmentId:string){if(!live()||!intent||commit)return;const key=d.createId();if(!imageId(key))throw imageFailure();commit=Object.freeze({companyId:context.companyId,conversationId:context.conversationId,attachmentId,clientMessageId:key});publish('sending');
  try{const r=await bounded(s=>d.transport.commit('send',commit!,s));if(r.state!=='accepted')throw imageFailure();publish('sent',r.receipt.id);if(live())try{d.onSent?.();}catch{}}catch{if(live())publish('uncertain');}
 }
 function poll(){cancelPoll();if(!live()||view.phase!=='waiting'||polls>=6)return;const delays=[1000,2000,3000,5000,8000,10000];cancelPoll=d.schedule(()=>{cancelPoll=()=>{};void recover(false);},delays[polls++]);}
 async function accept(r:Awaited<ReturnType<ImageTransfer['upload']>>){if(!live())return;if(!intent)throw imageFailure();decodeImageUpload(r,intent,context.userId);if(r.state==='ready'){await sendReady(r.attachmentId);return;}if(r.state==='rejected'){publish('rejected');return;}publish('waiting');poll();}
 async function recover(manual=true){if(!live()||physical||!started||!['waiting','upload-unknown','uncertain'].includes(view.phase))return;cancelPoll();if(manual)polls=0;publish('checking');
  try{if(commit){const r=await bounded(s=>d.transport.commit('lookup',commit!,s));if(r.state==='accepted'){publish('sent',r.receipt.id);if(live())try{d.onSent?.();}catch{}}else publish('uncertain');}else if(intent)await accept(await bounded(s=>d.transport.status(intent!,s)));}
  catch{if(live())publish(commit?'uncertain':'upload-unknown');}
 }
 if(d.enabled===true){if(!live())throw imageFailure();const stop=d.review.subscribe(()=>{if(!live())close();});if(closed)stop();else stopDraft=stop;}
 return Object.freeze({snapshot:()=>{if(d.enabled===true&&!live())close();return view;},subscribe:(f:()=>void)=>{listeners.add(f);return()=>{listeners.delete(f);};},
  async start(){if(!live()||started||view.phase!=='review'||!preview||!d.review.snapshot().canRead||preview.mime==='application/pdf'||preview.bytes>4194304||preview.mode==='optimized'&&preview.profile!==LOCAL_IMAGE_PROFILE.id)return;started=true;let bytes:Uint8Array|null=null;publish('reading');
   try{const key=d.createId();if(!imageId(key))throw imageFailure();bytes=await bounded(s=>d.review.read(s));if(!live())throw imageFailure();const sha256=await bounded(()=>d.digest(bytes!));intent=Object.freeze({companyId:context.companyId,conversationId:context.conversationId,clientUploadId:key,sha256,byteLength:bytes.length,mime:preview.mime,mode:preview.mode,profile:preview.profile});publish('uploading');
    try{const r=await bounded(s=>d.transport.upload(intent!,bytes!,s));await accept(r);}catch{if(live())publish('upload-unknown');}
   }catch{if(live())publish('failed');}finally{bytes?.fill(0);}
  },recover:()=>recover(true),close});
}
export type ReviewedImageSender=ReturnType<typeof createScopedReviewedImage>;
