import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {createImageTransfer} from '../../../packages/chat-client/src/image-transfer.ts';
import {createImageTransferFetch} from '../src/image-transfer-http.ts';

const id=(n:number)=>'27300000-0000-4000-8000-'+String(n).padStart(12,'0');
const command={companyId:id(1),conversationId:id(2),messageId:id(3)};
const bytes=Uint8Array.of(1,2,3);
const digest=(b:Uint8Array)=>Promise.resolve(createHash('sha256').update(b).digest('hex'));
const descriptor={...command,attachmentId:id(4),mime:'image/png',mode:'original',byteLength:3,width:1,height:1,sha256:await digest(bytes)};
function client(statuses:number[],cancelOnWait=false){
 const ac=new AbortController(),delays:number[]=[];let calls=0;
 const key='sb_publishable_synthetic_fixture';
 const value=createImageTransfer({enabled:true,origin:'https://ibdlvlwdzmsrbqadrudb.supabase.co',publishableKey:key,
  userId:id(5),current:()=>true,token:()=>'synthetic.session.signature',digest,timeoutMs:15000,
  fetch:createImageTransferFetch(async(_url,init)=>{
   assert.deepEqual(JSON.parse(String(init?.body)),command);
   const status=statuses[calls++];assert.ok(status);
   return new Response(status===200?bytes:null,{status,headers:{'cache-control':'no-store','content-type':'image/png','x-connect-image-descriptor':JSON.stringify(descriptor)}});
  },key),schedule:(f,ms)=>{
   if(ms===15000)return ()=>{};
   delays.push(ms);if(cancelOnWait)queueMicrotask(()=>ac.abort());
   const timer=setTimeout(f,1);return ()=>clearTimeout(timer);
  }});
 return {read:()=>value.read(command,ac.signal),calls:()=>calls,delays};
}
test('a busy image read resumes with the same command and validates the returned bytes',async()=>{
 const r=client([409,409,200]);assert.deepEqual((await r.read()).bytes,bytes);assert.equal(r.calls(),3);assert.deepEqual(r.delays,[500,1500]);
});
test('persistent conflict is surfaced; forbidden, missing and unrelated failures stay terminal',async()=>{
 for(const status of [401,403,404,503,409]){
  const r=client([status,status,status]);await assert.rejects(r.read());assert.equal(r.calls(),status===409?3:1);
 }
});
test('leaving the conversation while waiting prevents another fetch',async()=>{
 const r=client([409],true);await assert.rejects(r.read());assert.equal(r.calls(),1);
});
