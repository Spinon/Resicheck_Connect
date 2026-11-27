import type{ConversationCache}from'./conversation-cache.ts';
import{createImageOperationLane}from'./image-operation-lane.ts';
import type{ImageMessageFactory}from'./PrivateImageMessage.tsx';
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
export function createNormalConversationImages(d:Readonly<{cache?:ConversationCache;recent:Recent;foreground:()=>boolean;createPort:(current:()=>boolean)=>ImageReviewPort;createResource:(bytes:Uint8Array,descriptor:ImageDescriptor)=>Promise<ImageResource>;digest:(bytes:Uint8Array)=>Promise<string>;createId:()=>string;schedule:(f:()=>void,ms:number)=>()=>void;now:()=>number;timeoutMs:number}>){
 const stats={downloads:0,cacheHits:0,readMs:0,cacheMs:0,cacheReadMs:0,cacheVerifyMs:0,cacheWriteMs:0,authorizeMs:0,decodeMs:0,prepareMs:0,hashMs:0,uploadMs:0,statusMs:0,confirmMs:0};const reviews=createScopedImageReviewHost({...d,createPort:current=>{const port=d.createPort(current);return{...port,prepare:async(source,mode)=>{const start=d.now();try{return await port.prepare(source,mode);}finally{stats.prepareMs+=d.now()-start;}}};}});let closed=false,cleanupFailed=false;const entries=new Set<Entry>();
 type Entry={host:Host;scope:NonNullable<ReturnType<Recent['captureImageScope']>>;senders:Set<ReturnType<typeof createScopedReviewedImage>>;readers:Set<ReturnType<typeof createConversationImageRead>>;retired:boolean;sender:(review:ReturnType<typeof createImageReview>)=>ReturnType<typeof createScopedReviewedImage>;reader:ImageMessageFactory;lane:ReturnType<typeof createImageOperationLane>};
 const foreground=()=>{try{return !closed&&d.foreground()===true;}catch{return false;}};
 const live=(e:Entry)=>!e.retired&&foreground()&&e.scope.current();
 function retire(e:Entry){if(e.retired)return;e.retired=true;entries.delete(e);e.lane.close();for(const s of e.senders)s.close();for(const r of e.readers)r.close();e.senders.clear();e.readers.clear();}
 const sync=()=>{for(const e of [...entries])if(!live(e))retire(e);};
 const stop=d.recent.subscribe(sync);
 function bind(host:Host){if(!foreground())return null;sync();const scope=d.recent.captureImageScope(host);if(!scope?.current())return null;
  for(const e of entries)if(e.host===host&&e.scope===scope)return e;
  const source=scope.conversation.imageTransfer!,lane=createImageOperationLane({current:()=>live(e),busy:()=>source.busy?.()??false,schedule:d.schedule,timeoutMs:d.timeoutMs});
  const e:Entry={host,scope,senders:new Set(),readers:new Set(),retired:false,sender:null!,reader:null!,lane};entries.add(e);
  const sameDescriptor=(a:ImageDescriptor,b:ImageDescriptor)=>Object.keys(a).every(key=>a[key as keyof ImageDescriptor]===b[key as keyof ImageDescriptor]);
  const measured=async<T>(field:'uploadMs'|'statusMs'|'confirmMs',action:()=>Promise<T>)=>{const start=d.now();try{return await action();}finally{stats[field]+=d.now()-start;}};
  const read=(...args:Parameters<typeof source.read>)=>lane.run(args[1],async signal=>{
   try{args[2]?.(Object.freeze({loaded:0,total:null,phase:'verification'}));}catch{}
   const command=args[0],cacheScope={userId:scope.context.userId,companyId:command.companyId,conversationId:command.conversationId};
   const cache=d.cache,resolver=source.resolve,ticket=cache?.ticket();let result:Awaited<ReturnType<typeof source.read>>|null=null;
   let candidate=false,started=d.now();try{candidate=!!cache&&!!resolver&&await cache.hasImage(cacheScope,command.messageId);}catch{}stats.cacheMs+=d.now()-started;
   if(!live(e)||signal.aborted)throw Error('Image unavailable');let before:ImageDescriptor|null=null;
   if(candidate&&cache&&resolver){
    // Exact Edge opening guard (including operational OFF), then message/removal
    // descriptor. Never fall back to a network read after an authorization denial.
    started=d.now();before=await resolver(command,signal);stats.authorizeMs+=d.now()-started;started=d.now();
    try{const readAt=d.now();result=await cache.image(cacheScope,command.messageId);stats.cacheReadMs+=d.now()-readAt;const verifyAt=d.now();if(result&&(!sameDescriptor(before,result.descriptor)||await d.digest(result.bytes)!==before.sha256)){result.bytes.fill(0);result=null;}stats.cacheVerifyMs+=d.now()-verifyAt;}
    catch{result?.bytes.fill(0);result=null;}stats.cacheMs+=d.now()-started;
   }
   if(!live(e)||signal.aborted){result?.bytes.fill(0);throw Error('Image unavailable');}const hit=!!result;
   if(!result){started=d.now();result=await source.read(command,signal,args[2]);stats.readMs+=d.now()-started;stats.downloads++;}
   try{
    if(!live(e)||signal.aborted)throw Error('Image unavailable');
    // A cache miss already traverses the full Edge read/authorization path.
    if(hit&&before&&resolver){started=d.now();const after=await resolver(command,signal);stats.authorizeMs+=d.now()-started;if(!sameDescriptor(before,after)||!sameDescriptor(before,result.descriptor))throw Error('Image unavailable');}
    if(hit)stats.cacheHits++;
    if(!hit&&cache&&ticket!==undefined){try{const writeStart=d.now();cache.putImage(cacheScope,result.descriptor,result.bytes,ticket);void cache.flush().then(()=>{stats.cacheWriteMs+=d.now()-writeStart;}).catch(()=>{});}catch{}}
    return result;
   }catch{result.bytes.fill(0);throw Error('Image unavailable');}

  });
  const transfer={active:()=>live(e)&&source.active(),
   upload:(...args:Parameters<typeof source.upload>)=>lane.run(args[2],signal=>measured('uploadMs',()=>source.upload(args[0],args[1],signal)),true),
   status:(...args:Parameters<typeof source.status>)=>lane.run(args[1],signal=>measured('statusMs',()=>source.status(args[0],signal)),true),
   commit:(...args:Parameters<typeof source.commit>)=>lane.run(args[2],signal=>measured('confirmMs',()=>source.commit(args[0],args[1],signal)),true),read};

  e.sender=review=>{for(const prior of [...e.senders])if(['closed','sent'].includes(prior.snapshot().phase))e.senders.delete(prior);if(!live(e)||e.senders.size>=4)throw Error('Image unavailable');const controller=createScopedReviewedImage({enabled:true,context:scope.context,current:()=>live(e),review,transport:transfer,digest:async bytes=>{const start=d.now();try{return await d.digest(bytes);}finally{stats.hashMs+=d.now()-start;}},createId:d.createId,schedule:d.schedule,timeoutMs:d.timeoutMs,onSent:()=>{if(!live(e))return;review.discard();if(live(e))void host.refreshLatest().catch(()=>{});}});e.senders.add(controller);return controller;};
  const visible=(id:string)=>live(e)&&host.history.snapshot().status==='ready'&&host.history.snapshot().messages.some(m=>m.id===id&&m.kind==='image'&&!m.removedScope);
  e.reader=Object.assign((id:string)=>{for(const prior of [...e.readers])if(prior.snapshot().phase==='closed')e.readers.delete(prior);const readable=()=>visible(id);if(!readable()||e.readers.size>=100)throw Error('Image unavailable');
   let controller:ReturnType<typeof createConversationImageRead>;controller=createConversationImageRead({command:{companyId:scope.context.companyId,conversationId:scope.context.conversationId,messageId:id},scope:{current:readable,subscribe:fn=>{const stops=[d.recent.subscribe(fn),host.history.subscribe(fn)];return()=>{for(const stop of stops)stop();};}},transport:transfer,createResource:async(bytes,descriptor)=>{const started=d.now();try{return await d.createResource(bytes,descriptor);}finally{stats.decodeMs+=d.now()-started;}}});
   const original=controller;controller=Object.freeze({...original,close(){e.readers.delete(controller);original.close();}});e.readers.add(controller);return controller;},{available:visible,subscribe:(fn:()=>void)=>{const stops=[d.recent.subscribe(fn),host.history.subscribe(fn)];return()=>{for(const stop of stops)stop();};}});
  return e;
 }
 return Object.freeze({metrics:()=>Object.freeze({...stats}),reviews,senderFor:(host:Host)=>bind(host)?.sender,readerFor:(host:Host)=>bind(host)?.reader,
  blocksNavigation(host:Host){const review=reviews.bind(host).snapshot().review;if(imageReviewBlocksNavigation(review))return true;for(const e of entries)if(e.host===host&&live(e)&&[...e.senders].some(s=>!['closed','sent','failed','rejected','cancelled'].includes(s.snapshot().phase)))return true;return false;},
  foregroundChanged(){reviews.foregroundChanged();sync();},
  dispose(){if(closed)return;closed=true;stop();for(const e of [...entries])retire(e);try{reviews.dispose();}catch{cleanupFailed=true;}},cleanupPending:()=>cleanupFailed||reviews.cleanupPending(),retryFinalCleanup:()=>{try{const ok=reviews.retryFinalCleanup();if(ok)cleanupFailed=false;return ok;}catch{return false;}}
 });
}
export type NormalConversationImages=ReturnType<typeof createNormalConversationImages>;
