import test from'node:test';import assert from'node:assert/strict';import{createScopedReviewedImage}from'../src/scoped-reviewed-image.ts';import{imageSendPresentation}from'../src/image-send-presentation.ts';import type{createImageReview}from'../src/image-review.ts';
const id=(n:number)=>'ee350000-0000-4000-8000-'+String(n).padStart(12,'0');
const deferred=<T,>()=>{let resolve!:(v:T)=>void;const promise=new Promise<T>(r=>resolve=r);return{promise,resolve};};
async function flush(){for(let n=0;n<35;n++)await Promise.resolve();}
/** State-machine fixtures only: no decoder, Auth, server or actual media claim. */
function fixture(options:{read?:()=>Promise<Uint8Array>;upload?:(c:any)=>Promise<any>;status?:(c:any)=>Promise<any>;commit?:(kind:string,c:any)=>Promise<any>;bytes?:number;mime?:string}={}){
 let seq=0,sent=0;const jobs:{fn:()=>void;ms:number;active:boolean}[]=[],preview={uri:'owned:synthetic',name:'synthetic.png',bytes:options.bytes??8,mime:options.mime??'image/png',mode:'original',profile:null,width:16,height:16},calls:{kind:string;command:any}[]=[],review={snapshot:()=>({preview,canRead:true}),read:options.read??(async()=>new Uint8Array(8)),subscribe:()=>()=>{}}as unknown as ReturnType<typeof createImageReview>;
 const receipt=(c:any,state='quarantined')=>({companyId:c.companyId,conversationId:c.conversationId,senderId:id(1),clientUploadId:c.clientUploadId,sha256:c.sha256,byteLength:c.byteLength,attachmentId:id(4),state});const schedule=(fn:()=>void,ms:number)=>{const j={fn,ms,active:true};jobs.push(j);return()=>{j.active=false;};};
 const sender=createScopedReviewedImage({enabled:true,context:{userId:id(1),sessionKey:'synthetic-only',companyId:id(2),conversationId:id(3)},current:()=>true,review,transport:{active:()=>true,upload:async c=>{calls.push({kind:'upload',command:c});return options.upload?options.upload(c):receipt(c);},status:async c=>{calls.push({kind:'status',command:c});return options.status?options.status(c):receipt(c);},commit:async(kind,c)=>{calls.push({kind,command:c});return options.commit?options.commit(kind,c):{state:'accepted',receipt:{id:id(9)}};}},digest:async()=> 'a'.repeat(64),createId:()=>`synthetic-${++seq}`,schedule,timeoutMs:500,onSent:()=>{sent++;}});
 return{sender,calls,jobs,preview,review,receipt,sent:()=>sent,async tick(ms:number){const j=jobs.find(j=>j.active&&j.ms===ms);assert(j,'Expected scheduled phase');j.active=false;j.fn();await flush();},async poll(){const j=jobs.find(j=>j.active&&[1000,2000,3000,5000,8000,10000].includes(j.ms));assert(j);j.active=false;j.fn();await flush();}};
}
test('poll budget pauses inspection; manual exact status never resends bytes or restarts automatic wait',async()=>{const f=fixture();await f.sender.start();for(let n=0;n<6;n++)await f.poll();assert.equal(f.sender.snapshot().phase,'inspection-paused');await f.sender.recover();assert.equal(f.sender.snapshot().phase,'inspection-paused');assert.equal(f.calls.filter(c=>c.kind==='upload').length,1);assert.equal(f.calls.filter(c=>c.kind==='status').length,7);assert(f.calls.filter(c=>c.kind==='status').every(c=>c.command===f.calls[0].command));assert(!f.jobs.some(j=>j.active));f.sender.close();});
test('cancel during upload is confirmed before send and ignores late ready receipt, preserving draft',async()=>{const upload=deferred<any>();const f=fixture({upload:()=>upload.promise});const start=f.sender.start();await flush();assert.equal(f.sender.snapshot().phase,'uploading');const draft=f.review.snapshot().preview;assert.equal(f.sender.cancel(),'cancelled-before-send');await start;upload.resolve(f.receipt(f.calls[0].command,'ready'));await flush();await f.sender.recover();assert.equal(f.sender.snapshot().phase,'cancelled');assert.equal(f.review.snapshot().preview,draft);assert.equal(f.calls.filter(c=>c.kind==='send').length,0);assert.equal(f.sent(),0);assert(!f.jobs.some(j=>j.active));f.sender.close();});
test('cancel in the ready-to-send microtask gap prevents dispatch atomically',async()=>{let f:ReturnType<typeof fixture>;f=fixture({upload:async c=>f.receipt(c,'ready')});const stop=f.sender.subscribe(()=>{const s=f.sender.snapshot();if(s.phase==='sending'&&!s.confirmationStarted)f.sender.cancel();});await f.sender.start();assert.equal(f.sender.snapshot().phase,'cancelled');assert.equal(f.calls.filter(c=>c.kind==='send').length,0);assert.equal(f.sent(),0);stop();f.sender.close();});
test('overall inspection deadline releases checking; cancelled late status cannot publish',async()=>{const pending=deferred<any>(),f=fixture({status:()=>pending.promise});await f.sender.start();await f.tick(1000);assert.equal(f.sender.snapshot().phase,'checking');await f.tick(60000);assert.equal(f.sender.snapshot().phase,'inspection-paused');assert.equal(f.sender.cancel(),'cancelled-before-send');pending.resolve(f.receipt(f.calls[0].command,'ready'));await flush();assert.equal(f.sender.snapshot().phase,'cancelled');assert.equal(f.calls.filter(c=>c.kind==='send').length,0);f.sender.close();});
test('after send starts cancellation is never promised; timeout reconciles same commit ID by lookup only',async()=>{const sent=deferred<any>();let f:ReturnType<typeof fixture>;f=fixture({upload:async c=>f.receipt(c,'ready'),commit:(kind)=>kind==='send'?sent.promise:Promise.resolve({state:'accepted',receipt:{id:id(9)}})});const start=f.sender.start();await flush();assert.equal(f.sender.snapshot().confirmationStarted,true);assert.equal(f.sender.snapshot().canCancel,false);assert.equal(f.sender.cancel(),'confirmation-required');await f.tick(500);await start;assert.equal(f.sender.snapshot().phase,'uncertain');sent.resolve({state:'accepted',receipt:{id:id(9)}});await flush();assert.equal(f.sent(),0);await f.sender.recover();assert.equal(f.sender.snapshot().phase,'sent');assert.equal(f.sent(),1);const sends=f.calls.filter(c=>c.kind==='send'),lookups=f.calls.filter(c=>c.kind==='lookup');assert.equal(sends.length,1);assert.equal(lookups.length,1);assert.equal(sends[0].command,lookups[0].command);f.sender.close();});
test('ignored local read abort reaches a terminal UI state and clears late bytes, without upload',async()=>{const read=deferred<Uint8Array>(),f=fixture({read:()=>read.promise});const start=f.sender.start();await flush();await f.tick(500);await start;assert.equal(f.sender.snapshot().phase,'failed');assert.equal(imageSendPresentation('failed').terminal,true);assert.equal(f.sender.cancel(),'cancelled-before-send');const bytes=new Uint8Array(8).fill(7);read.resolve(bytes);await flush();assert(bytes.every(x=>x===0));assert.equal(f.calls.length,0);assert.equal(f.sender.snapshot().phase,'cancelled');f.sender.close();});
test('presentation is honest and original media bounds remain enforced',async()=>{assert.equal(imageSendPresentation('uncertain',true).checkLabel,'Conferir confirmação');assert.equal(imageSendPresentation('inspection-paused').checkLabel,'Conferir e concluir envio');assert.equal(imageSendPresentation('inspection-paused').sending,false);assert.equal(imageSendPresentation('cancelled').canRestartReview,true);assert.equal(imageSendPresentation('uncertain',true).canRestartReview,false);for(const options of[{bytes:4194305},{mime:'application/pdf'}]){const f=fixture(options);await f.sender.start();assert.equal(f.calls.length,0);f.sender.close();}});

test('manual checks share the automatic budget and recover the same paused attachment', async () => {
 let result = 'quarantined';
 let f: ReturnType<typeof fixture>;
 f = fixture({status: async c => {
  if (result === 'offline') throw Error('Status unavailable');
  return f.receipt(c, result);
 }});
 await f.sender.start();
 result = 'offline';
 await f.sender.recover();
 assert.equal(f.sender.snapshot().phase, 'inspection-unknown');
 result = 'quarantined';
 await f.poll();
 assert.equal(f.sender.snapshot().phase, 'waiting');
 for (let i=0; i<4; i++) await f.sender.recover();
 assert.equal(f.sender.snapshot().phase, 'inspection-paused');
 assert.equal(imageSendPresentation('inspection-paused').sending, false);
 assert.equal(imageSendPresentation('inspection-paused').canRestartReview, false);
 assert(!f.jobs.some(j => j.active));
 result = 'ready';
 await Promise.all([f.sender.recover(), f.sender.recover()]);
 assert.equal(f.sender.snapshot().phase, 'sent');
 assert.equal(f.calls.filter(c => c.kind === 'upload').length, 1);
 assert.equal(f.calls.filter(c => c.kind === 'send').length, 1);
 assert(f.calls.filter(c => c.kind === 'status').every(c => c.command === f.calls[0].command));
 f.sender.close();
});

test('a different attachment cannot complete a retry, and a rejection ends this intent', async () => {
 let wrong = true;
 let f: ReturnType<typeof fixture>;
 f = fixture({status: async c => wrong ? {...f.receipt(c,'ready'), attachmentId:id(7)} : f.receipt(c,'rejected')});
 await f.sender.start();
 await f.sender.recover();
 assert.equal(f.sender.snapshot().phase, 'inspection-unknown');
 wrong = false;
 await f.sender.recover();
 assert.equal(f.sender.snapshot().phase, 'rejected');
 assert.equal(f.sender.snapshot().canCancel, false);
 assert.equal(f.sender.cancel(), 'already-finished');
 assert.equal(imageSendPresentation('rejected').canCheck, false);
 assert(!f.jobs.some(j => j.active));
 await f.sender.start();
 await f.sender.recover();
 assert.deepEqual(f.calls.map(c => c.kind), ['upload','status','status']);
 f.sender.close();
});
