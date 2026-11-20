import{createScopedImageReviewHost,imageReviewBlocksNavigation}from'./scoped-image-review-host.ts';
import{createScopedReviewedImage}from'./scoped-reviewed-image.ts';
import{createConversationImageRead,type ImageResource}from'./conversation-image-read.ts';
import type{ImageDescriptor}from'../../../packages/chat-client/src/image-contract.ts';
import type{createMembershipRecentBridge}from'./membership-recent-bridge.ts';
import type{createRecentConversationHost}from'./recent-conversation-host.ts';
import type{ImageReviewPort,createImageReview}from'./image-review.ts';
type Recent=ReturnType<typeof createMembershipRecentBridge>;type Host=ReturnType<typeof createRecentConversationHost>;
/** Root-owned normal presentation composition. No token lookup, Auth login,
 * server grant, inspection proof or publication decision lives in this owner. */
export function createNormalConversationImages(d:Readonly<{recent:Recent;foreground:()=>boolean;createPort:(current:()=>boolean)=>ImageReviewPort;createResource:(bytes:Uint8Array,descriptor:ImageDescriptor)=>Promise<ImageResource>;digest:(bytes:Uint8Array)=>Promise<string>;createId:()=>string;schedule:(f:()=>void,ms:number)=>()=>void;now:()=>number;timeoutMs:number}>){
 const reviews=createScopedImageReviewHost(d);let closed=false,cleanupFailed=false;const entries=new Set<Entry>();
 type Entry={host:Host;scope:NonNullable<ReturnType<Recent['captureImageScope']>>;senders:Set<ReturnType<typeof createScopedReviewedImage>>;readers:Set<ReturnType<typeof createConversationImageRead>>;retired:boolean;sender:(review:ReturnType<typeof createImageReview>)=>ReturnType<typeof createScopedReviewedImage>;reader:(id:string)=>ReturnType<typeof createConversationImageRead>};
 const foreground=()=>{try{return !closed&&d.foreground()===true;}catch{return false;}};
 const live=(e:Entry)=>!e.retired&&foreground()&&e.scope.current();
 function retire(e:Entry){if(e.retired)return;e.retired=true;entries.delete(e);for(const s of e.senders)s.close();for(const r of e.readers)r.close();e.senders.clear();e.readers.clear();}
 const sync=()=>{for(const e of [...entries])if(!live(e))retire(e);};
 const stop=d.recent.subscribe(sync);
 function bind(host:Host){if(!foreground())return null;sync();const scope=d.recent.captureImageScope(host);if(!scope?.current())return null;
  for(const e of entries)if(e.host===host&&e.scope===scope)return e;
  const e:Entry={host,scope,senders:new Set(),readers:new Set(),retired:false,sender:null!,reader:null!};entries.add(e);
  e.sender=review=>{for(const prior of [...e.senders])if(['closed','sent'].includes(prior.snapshot().phase))e.senders.delete(prior);if(!live(e)||e.senders.size>=4)throw Error('Image unavailable');const controller=createScopedReviewedImage({enabled:true,context:scope.context,current:()=>live(e),review,transport:scope.conversation.imageTransfer!,digest:d.digest,createId:d.createId,schedule:d.schedule,timeoutMs:d.timeoutMs,onSent:()=>{if(!live(e))return;review.discard();if(live(e))void host.refreshLatest().catch(()=>{});}});e.senders.add(controller);return controller;};
  e.reader=id=>{for(const prior of [...e.readers])if(prior.snapshot().phase==='closed')e.readers.delete(prior);const visible=()=>live(e)&&host.history.snapshot().status==='ready'&&host.history.snapshot().messages.some(m=>m.id===id&&m.kind==='image'&&!m.removedScope);if(!visible()||e.readers.size>=100)throw Error('Image unavailable');
   let controller:ReturnType<typeof createConversationImageRead>;controller=createConversationImageRead({command:{companyId:scope.context.companyId,conversationId:scope.context.conversationId,messageId:id},scope:{current:visible,subscribe:fn=>{const stops=[d.recent.subscribe(fn),host.history.subscribe(fn)];return()=>{for(const stop of stops)stop();};}},transport:scope.conversation.imageTransfer!,createResource:d.createResource});
   const original=controller;controller=Object.freeze({...original,close(){e.readers.delete(controller);original.close();}});e.readers.add(controller);return controller;};
  return e;
 }
 return Object.freeze({reviews,senderFor:(host:Host)=>bind(host)?.sender,readerFor:(host:Host)=>bind(host)?.reader,
  blocksNavigation(host:Host){const review=reviews.bind(host).snapshot().review;if(imageReviewBlocksNavigation(review))return true;for(const e of entries)if(e.host===host&&live(e)&&[...e.senders].some(s=>!['closed','sent','failed','rejected'].includes(s.snapshot().phase)))return true;return false;},
  foregroundChanged(){reviews.foregroundChanged();sync();},
  dispose(){if(closed)return;closed=true;stop();for(const e of [...entries])retire(e);try{reviews.dispose();}catch{cleanupFailed=true;}},cleanupPending:()=>cleanupFailed||reviews.cleanupPending(),retryFinalCleanup:()=>{try{const ok=reviews.retryFinalCleanup();if(ok)cleanupFailed=false;return ok;}catch{return false;}}
 });
}
export type NormalConversationImages=ReturnType<typeof createNormalConversationImages>;
