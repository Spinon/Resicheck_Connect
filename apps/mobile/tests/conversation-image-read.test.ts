import test from 'node:test';
import type {TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {crc32,deflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createConversationImageRead} from '../src/conversation-image-read.ts';
import {createWebReceivedImage} from '../src/web-received-image.ts';
const id=(n:number)=>'00520000-0000-4000-8000-'+String(n).padStart(12,'0');
const u32=(n:number)=>{const b=Buffer.alloc(4);b.writeUInt32BE(n>>>0);return b;};
const chunk=(t:string,b:Buffer)=>{const d=Buffer.concat([Buffer.from(t),b]);return Buffer.concat([u32(b.length),d,u32(crc32(d))]);};
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',Buffer.from([0,0,0,16,0,0,0,16,8,2,0,0,0])),
 chunk('IDAT',deflateSync(Buffer.concat(Array.from({length:16},()=>Buffer.from([0,...Array(48).fill(128)]))))),chunk('IEND',Buffer.alloc(0))]);
const command={companyId:id(1),conversationId:id(2),messageId:id(3)};
const descriptor={...command,attachmentId:id(4),sha256:createHash('sha256').update(png).digest('hex'),byteLength:png.length,mime:'image/png' as const,width:16,height:16,mode:'original' as const};
async function setup(t:TestContext,releaseInitiallyFails=false){
 let current=true,detachFails=true,releaseFails=releaseInitiallyFails,createdUri='',realRelease=()=>{},releases=0,reads=0;
 const fns=new Set<()=>void>();
 const reader=createConversationImageRead({command,
  scope:{current:()=>current,subscribe:f=>{fns.add(f);return()=>{if(detachFails)throw Error('private listener path');fns.delete(f);};}},
  transport:{active:()=>true,read:async()=>{reads++;return{descriptor,bytes:Uint8Array.from(png)};}},
  createResource:async(bytes,d)=>{const r=await createWebReceivedImage(bytes,d);createdUri=r.preview.uri;realRelease=r.release;
   return{preview:r.preview,release(){releases++;if(releaseFails)throw Error('private media cleanup path');r.release();}};}
 });
 t.after(()=>{realRelease();fns.clear();});
 await reader.load();assert.equal(reader.snapshot().phase,'ready');
 return{reader,fns,get uri(){return createdUri;},get releases(){return releases;},get reads(){return reads;},
  invalidate(){current=false;for(const fn of [...fns])fn();},
  recover(){detachFails=false;releaseFails=false;}
 };
}
test('received image closes preview and revokes a real Blob URL even if observer detach throws',async t=>{
 const f=await setup(t),before=await (await fetch(f.uri)).arrayBuffer();assert.deepEqual(Buffer.from(before),png);
 let threw=false;try{f.invalidate();}catch{threw=true;}
 let blobReadable=true;try{await fetch(f.uri);}catch{blobReadable=false;}
 assert.deepEqual({threw,phase:f.reader.snapshot().phase,preview:f.reader.snapshot().preview,blobReadable},
  {threw:false,phase:'closed',preview:null,blobReadable:false});
 assert.equal(f.releases,1);assert.equal(f.reader.cleanupPending(),true);
 f.recover();assert.equal(f.reader.retryCleanup(),true);assert.equal(f.fns.size,0);
 await f.reader.load();assert.equal(f.reads,1);
});
test('received image cleanup retains both failed detach and media release for exact retry',async t=>{
 const f=await setup(t,true);assert.doesNotThrow(()=>f.invalidate());
 assert.equal(f.reader.snapshot().phase,'closed');assert.equal(f.reader.snapshot().preview,null);
 assert.equal(f.reader.cleanupPending(),true);assert.equal(f.reader.retryCleanup(),false);
 f.recover();assert.equal(f.reader.retryCleanup(),true);assert.equal(f.reader.cleanupPending(),false);
 await assert.rejects(fetch(f.uri));assert.equal(f.fns.size,0);
});
test('received image synchronous invalidation during subscribe cannot expose a resource or throw on detach',()=>{
 let detachFails=true,resources=0,reader:ReturnType<typeof createConversationImageRead>|undefined;
 assert.doesNotThrow(()=>{reader=createConversationImageRead({command,scope:{current:()=>false,subscribe:f=>{f();return()=>{if(detachFails)throw Error('private subscription error');};}},
  transport:{active:()=>true,read:async()=>({descriptor,bytes:Uint8Array.from(png)})},createResource:async()=>{resources++;throw Error('unreachable');}});});
 assert.equal(reader!.snapshot().phase,'closed');assert.equal(reader!.cleanupPending(),true);
 detachFails=false;assert.equal(reader!.retryCleanup(),true);assert.equal(resources,0);
});
