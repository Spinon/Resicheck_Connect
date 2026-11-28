import{createNativeImageDigest}from'../src/native-image-digest.ts';
import test from'node:test';import assert from'node:assert/strict';import{createNormalConversationImages}from'../src/normal-conversation-images.ts';import{createImageOperationLane}from'../src/image-operation-lane.ts';import{createImageReview}from'../src/image-review.ts';import{LOCAL_IMAGE_PROFILE}from'../src/local-image.ts';
const id=(n:number)=>'27200000-0000-4000-8000-'+String(n).padStart(12,'0'),schedule=(f:()=>void,ms:number)=>{const t=setTimeout(f,ms);return()=>clearTimeout(t);};
const defer=<T>()=>{let resolve!:(v:T)=>void;return{promise:new Promise<T>(r=>resolve=r),resolve};};
const flush=async()=>{for(let n=0;n<20;n++)await Promise.resolve();};
function fixture(cacheEnabled=false, additionalImages:string[]=[], readDelay:()=>Promise<void>=()=>Promise.resolve(), timeoutMs=1000, hasDecodedThumbnail?:(uri:string)=>Promise<boolean>){let ticket=1,materializations=0;let permission=true,denyOnRead=false,stored:any=null;let foreground=true,status='ready',removed=false,reads=0,releases=0;const listeners=new Set<()=>void>(),historyListeners=new Set<()=>void>();const row={id:id(3),kind:'image',removedScope:null};const host={snapshot:()=>({status:'active'}),history:{snapshot:()=>({status,messages:[row.id,...additionalImages].map(id=>({...row,id,removedScope:removed?'all':null}))}),subscribe:(f:()=>void)=>{historyListeners.add(f);return()=>historyListeners.delete(f);}}};const cap={token:{},current:()=>foreground};
 const descriptor={companyId:id(1),conversationId:id(2),messageId:id(3),attachmentId:id(4),sha256:'a'.repeat(64),byteLength:3,mime:'image/png',width:16,height:16,mode:'original'};
 const source={...(cacheEnabled?{resolve:async()=>{if(!permission)throw Error('Image unavailable');return {...descriptor};}}:{}),active:()=>foreground,busy:()=>false,read:async(command:{messageId:string})=>{if(!permission)throw Error('Image unavailable');reads++;await readDelay();return{bytes:new Uint8Array([1,2,3]),descriptor:{...descriptor,messageId:command.messageId}};},upload:async()=>{throw Error();},status:async()=>{throw Error();},commit:async()=>{throw Error();}};
 const scope={context:{companyId:id(1),conversationId:id(2),userId:id(5),sessionKey:'synthetic'},current:()=>foreground,conversation:{imageTransfer:source}};
 const recent={snapshot:()=>({route:'chat',host}),captureMediaScope:()=>cap,captureImageScope:()=>scope,subscribe:(f:()=>void)=>{listeners.add(f);return()=>listeners.delete(f);}};
 const owner=createNormalConversationImages({hasDecodedThumbnail,...(cacheEnabled?{cache:{hasImage:async()=>!!stored,ticket:()=>ticket,flush:async()=>{},image:async()=>{if(denyOnRead)permission=false;return stored?{descriptor:stored.descriptor,bytes:stored.bytes.slice()}:null;},putImage:(_s:any,d:any,b:Uint8Array)=>{stored={descriptor:{...d},bytes:b.slice()};}}as any}:{}),recent:recent as any,foreground:()=>foreground,createPort:()=>({pick:async()=>null,prepare:async()=>{throw Error();},owns:()=>false,read:async()=>new Uint8Array(),release(){},dispose(){}}),createResource:async()=>({preview:{uri:'blob:synthetic-'+(++materializations),name:'Imagem',mime:'image/png',bytes:3,width:16,height:16,mode:'original',profile:null},release(){releases++;}}),digest:async()=> 'a'.repeat(64),createId:()=>id(6),schedule,now:Date.now,timeoutMs});const factory=owner.readerFor(host as any)!;
 return{owner,factory,invalidate(){ticket++;},replaceAttachment(){Object.assign(descriptor,{attachmentId:id(9)});},get materializations(){return materializations;},denyDuringCacheRead(){denyOnRead=true;},deny(){permission=false;},get reads(){return reads;},get releases(){return releases;},refresh(value:string){status=value;for(const f of [...historyListeners])f();},remove(){removed=true;for(const f of [...historyListeners])f();},revoke(){foreground=false;for(const f of [...listeners])f();}};
}
test('same message recovers a new reader after transient history load; removal/old context never resurrect the URI',async()=>{const f=fixture();let notifications=0;const stop=f.factory.subscribe!(()=>notifications++);try{
 assert(f.factory.available!(id(3)));const first=f.factory(id(3));await first.load();assert.equal(first.snapshot().phase,'ready');
 // Zoom close is presentation only; still the same ready resource.
 assert.equal(first.snapshot().phase,'ready');assert.equal(f.releases,0);
 f.refresh('loading');assert.equal(first.snapshot().phase,'closed');assert.equal(f.releases,1);assert.equal(f.factory.available!(id(3)),false);
 f.refresh('ready');assert(f.factory.available!(id(3)));const reopened=f.factory(id(3));assert.notEqual(first,reopened);await reopened.load();assert.equal(reopened.snapshot().phase,'ready');assert.equal(f.reads,2);
 f.refresh('ready');assert.equal(reopened.snapshot().phase,'ready');assert.equal(f.reads,2);f.remove();assert.equal(reopened.snapshot().phase,'closed');assert.equal(f.factory.available!(id(3)),false);assert.throws(()=>f.factory(id(3)));assert(notifications>=3);f.revoke();await first.load();assert.equal(f.reads,2);
 }finally{stop();f.owner.dispose();}});
test('thumbnail/write lane prioritizes sends, rejects cancelled queued sends and waits for physical cleanup',async()=>{let physical=false;const lane=createImageOperationLane({current:()=>true,busy:()=>physical,schedule,timeoutMs:1000}),first=defer<string>(),order:string[]=[];const a=lane.run(new AbortController().signal,async()=>{order.push('read1');return await first.promise;});await flush();const b=lane.run(new AbortController().signal,async()=>{order.push('read2');return'2';});const cancel=new AbortController(),c=lane.run(cancel.signal,async()=>{order.push('MUST-NOT-SEND');return'x';},true);const rejected=assert.rejects(c);cancel.abort();const write=lane.run(new AbortController().signal,async()=>{order.push('send');return's';},true);physical=true;first.resolve('1');assert.equal(await a,'1');await flush();assert.deepEqual(order,['read1']);physical=false;await write;await b;await rejected;assert.deepEqual(order,['read1','send','read2']);lane.close();});
test('normal review defaults to optimized and only offers original after an observable risk; encoder failure preserves source',async()=>{for(const kind of ['safe','resolution','failure']as const){const source={uri:'file:///synthetic.png',name:'synthetic.png',mime:'image/png'as const,bytes:1000},calls:string[]=[],review=createImageReview({current:()=>true,subscribe:()=>()=>{}},{pick:async()=>source,owns:()=>true,release(){},dispose(){},read:async()=>new Uint8Array(2),prepare:async(s,m)=>{calls.push(m);if(m==='original')return{...s,width:100,height:100,mode:m,profile:null};if(kind==='failure')throw Error('synthetic encoder unavailable');return{...s,uri:'file:///compact.jpg',name:'synthetic.jpg',mime:'image/jpeg',bytes:500,width:100,height:100,mode:m,profile:LOCAL_IMAGE_PROFILE.id,flattenedTransparency:false,...(kind==='resolution'?{detailRisk:'resolution-loss'as const}:{})};}},{defaultMode:'optimized'});
 assert(await review.select());assert.equal(calls[0],'optimized');assert.equal(review.snapshot().originalReason,kind==='safe'?null:kind==='failure'?'conversion-failed':'resolution-loss');assert.equal(await review.prepare('original'),kind!=='safe');if(kind==='failure')assert.equal(review.snapshot().canRead,true);review.dispose();}});

test('disk hit avoids a second media transfer but never bypasses current descriptor authorization',async()=>{const f=fixture(true);try{const first=f.factory(id(3));await first.load();assert.equal(first.snapshot().phase,'ready');first.close();const second=f.factory(id(3));await second.load();assert.equal(second.snapshot().phase,'ready');assert.equal(f.reads,1);assert.equal(f.owner.metrics().cacheHits,1);second.close();f.deny();const denied=f.factory(id(3));await denied.load();assert.equal(denied.snapshot().phase,'failed');assert.equal(f.reads,1);}finally{f.owner.dispose();}});

test('display decode failure releases only its URI and allows explicit authorized cache recovery',async()=>{const f=fixture(true);try{const reader=f.factory(id(3));await reader.load();assert.equal(reader.snapshot().phase,'ready');reader.displayFailed();assert.equal(reader.snapshot().phase,'failed');assert.equal(f.releases,1);await reader.load();assert.equal(reader.snapshot().phase,'ready');assert.equal(f.reads,1);f.revoke();reader.displayFailed();await reader.load();assert.equal(reader.snapshot().phase,'closed');assert.equal(f.reads,1);}finally{f.owner.dispose();}});

test('native image digest serializes thumbnail/send contention with a bounded private queue',async()=>{const first=defer<string>(),calls:string[]=[],digest=createNativeImageDigest({sha256ImageHex:async value=>{calls.push(value);return calls.length===1?await first.promise:'b'.repeat(64);}});const source=new Uint8Array([1,2]),one=digest(source),two=digest(new Uint8Array([3,4])),three=digest(new Uint8Array([5])),four=digest(new Uint8Array([6]));const overflow=assert.rejects(digest(new Uint8Array([7])));source.fill(0);await flush();assert.deepEqual(calls,['0102']);first.resolve('a'.repeat(64));assert.equal(await one,'a'.repeat(64));assert.equal(await two,'b'.repeat(64));await three;await four;await overflow;assert.deepEqual(calls,['0102','0304','05','06']);});

test('OFF between cached-byte read and final authorization never exposes a resource or falls back to download',async()=>{const f=fixture(true);try{const first=f.factory(id(3));await first.load();first.close();f.denyDuringCacheRead();const second=f.factory(id(3));await second.load();assert.equal(second.snapshot().phase,'failed');assert.equal(f.reads,1);assert.equal(f.owner.metrics().cacheHits,0);assert.equal(second.snapshot().preview,null);}finally{f.owner.dispose();}});

test('larger native digest yield blocks preserve the exact bounded byte stream',async()=>{const input=Uint8Array.from({length:65539},(_,i)=>i%256);let expected='';for(const b of input)expected+=b.toString(16).padStart(2,'0');const digest=createNativeImageDigest({sha256ImageHex:async value=>{assert.equal(value,expected);return'a'.repeat(64);}});assert.equal(await digest(input),'a'.repeat(64));});

test('cache-like timeout releases the logical lane; late completion cannot unlock a newer operation',async()=>{const timers:{fn:()=>void;cancelled:boolean}[]=[],schedule=(fn:()=>void)=>{const t={fn,cancelled:false};timers.push(t);return()=>{t.cancelled=true;};},lane=createImageOperationLane({current:()=>true,busy:()=>false,schedule,timeoutMs:1000}),cache=defer<string>(),write=defer<string>(),order:string[]=[];const first=lane.run(new AbortController().signal,async()=>{order.push('cache');return cache.promise;}),rejected=assert.rejects(first);await flush();const second=lane.run(new AbortController().signal,async()=>{order.push('write');return write.promise;},true);timers[0].fn();await rejected;await flush();assert.deepEqual(order,['cache','write']);cache.resolve('late');await flush();const third=lane.run(new AbortController().signal,async()=>{order.push('next');return'3';},true);await flush();assert.deepEqual(order,['cache','write']);write.resolve('2');await second;await third;assert.deepEqual(order,['cache','write','next']);lane.close();});

test('a queued visible thumbnail gets its full read deadline after admission', async t => {
 t.mock.timers.enable({apis:['setTimeout']});
 const mediaLatencyMs=9000;
 const fixtureOwner=fixture(false,[id(8)],()=>new Promise(resolve=>setTimeout(resolve,mediaLatencyMs)),15000);
 try {
  const first=fixtureOwner.factory(id(3));
  const second=fixtureOwner.factory(id(8));
  const firstLoad=first.load(), secondLoad=second.load();
  await flush();
  assert.equal(fixtureOwner.reads,1);
  t.mock.timers.tick(mediaLatencyMs);
  await firstLoad;
  await flush();
  assert.equal(fixtureOwner.reads,2);
  assert.equal(first.snapshot().phase,'ready');
  t.mock.timers.tick(mediaLatencyMs);
  await secondLoad;
  assert.equal(second.snapshot().phase,'ready');
  assert.equal(fixtureOwner.reads,2);
 } finally {
  fixtureOwner.owner.dispose();
 }
});

test('a thumbnail waiting for the lane cannot read after permission is revoked', async () => {
 const gate=defer<void>();
 const f=fixture(false,[id(8)],()=>gate.promise);
 try {
  const first=f.factory(id(3)), second=f.factory(id(8));
  const firstLoad=first.load(), secondLoad=second.load();
  await flush();
  assert.equal(f.reads,1);
  f.deny();
  gate.resolve();
  await Promise.all([firstLoad,secondLoad]);
  assert.equal(second.snapshot().phase,'failed');
  assert.equal(second.snapshot().preview,null);
  assert.equal(f.reads,1);
 } finally {
  f.owner.dispose();
 }
});


test('a previously decoded thumbnail is reauthorized and uses the same source on reentry',async()=>{
 const f=fixture(true,[],undefined,1000,async()=>true);
 try{
  const first=f.factory(id(3));await first.load();const original=first.snapshot().preview!.uri;
  first.close();assert.equal(f.releases,1);f.invalidate();
  const next=f.factory(id(3));await next.load();
  assert.equal(next.snapshot().preview?.uri,original);assert.equal(f.materializations,1);
  const [a,b]=await Promise.all([next.viewerUri(),next.viewerUri()]);
  assert.ok(a);assert.equal(a,b);assert.equal(f.materializations,2);assert.equal(f.reads,1);
  f.remove();assert.equal(next.snapshot().phase,'closed');assert.equal(await next.viewerUri(),null);assert.equal(f.releases,2);
 }finally{f.owner.dispose();}
});

test('revoked authorization refuses a remembered bitmap without reading image bytes',async()=>{
 const f=fixture(true,[],undefined,1000,async()=>true);
 try{
  const first=f.factory(id(3));await first.load();first.close();f.deny();
  const next=f.factory(id(3));await next.load();
  assert.equal(next.snapshot().phase,'failed');assert.equal(next.snapshot().preview,null);
  assert.equal(f.materializations,1);assert.equal(f.reads,1);
 }finally{f.owner.dispose();}
});

test('bitmap eviction falls back to the encrypted source once, including a late native decode error',async()=>{
 for(const decoded of [false,true]){
  const f=fixture(true,[],undefined,1000,async()=>decoded);
  try{
   const first=f.factory(id(3));await first.load();first.close();
   const next=f.factory(id(3));await next.load();
   if(decoded){next.displayFailed();await new Promise<void>(resolve=>{const stop=next.subscribe(()=>{if(next.snapshot().phase==='ready'){stop();resolve();}});});}
   assert.equal(next.snapshot().phase,'ready');assert.equal(f.reads,1);assert.equal(f.materializations,2);
   next.displayFailed();assert.equal(next.snapshot().phase,'failed');
  }finally{f.owner.dispose();}
 }
});

test('cache invalidation during a bitmap lookup prevents presentation',async()=>{
 const probe=defer<boolean>(),f=fixture(true,[],undefined,1000,()=>probe.promise);
 try{
  const first=f.factory(id(3));await first.load();first.close();
  const next=f.factory(id(3)),loaded=next.load();await flush();f.invalidate();probe.resolve(true);await loaded;
  assert.equal(next.snapshot().phase,'failed');assert.equal(next.snapshot().preview,null);assert.equal(f.materializations,1);
 }finally{f.owner.dispose();}
});

test('an attachment replacement cannot open under the already displayed thumbnail',async()=>{
 const f=fixture(true,[],undefined,1000,async()=>true);
 try{
  const first=f.factory(id(3));await first.load();first.close();
  const next=f.factory(id(3));await next.load();assert.equal(next.snapshot().phase,'ready');
  f.replaceAttachment();assert.equal(await next.viewerUri(),null);
  assert.equal(next.snapshot().phase,'failed');assert.equal(f.materializations,1);
 }finally{f.owner.dispose();}
});
