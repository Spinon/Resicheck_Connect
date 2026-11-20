// New routing boundary only. No Auth/network/Storage/codec or old proof replay.
import assert from'node:assert/strict';import{createImageServiceWorker}from'../../../runtime/image-node/service-worker.mjs';
import{codecRequest}from'../../../runtime/image-node/normal/codec-ipc.mjs';import{createHash}from'node:crypto';
const id=n=>'90560000-0000-4000-8000-'+String(n).padStart(12,'0'),coA=id(1),coB=id(2),sid=id(3),actor='ee330000-0000-4000-8000-000000000202';
const now=Date.parse('2026-11-20T16:00:00Z'),ref='ibdlvlwdzmsrbqadrudb';
const image='sha256:27d6b28f9111c36fcf39cab1d8cc818daa2a5474f93fce305e1466010cdf695e';
const jwt=c=>Buffer.from('{"alg":"HS256"}').toString('base64url')+'.'+Buffer.from(JSON.stringify(c)).toString('base64url')+'.synthetic';
const token=jwt({sub:actor,session_id:sid,role:'authenticated',aud:'authenticated',iss:'https://'+ref+'.supabase.co/auth/v1',exp:Math.floor(now/1000)+3600});
const bytes=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFElEQVR4nGNoIBEwjGoY1TB8NQAAJYSAEGy7FvQAAAAASUVORK5CYII=','base64')),digest=createHash('sha256').update(bytes).digest('hex');
let mediaReads=0;
const base={enabled:true,companyIds:[coA,coB],inspectorId:actor,expectedSessionId:sid,decoderImage:image,region:'us-east-1',publishableKey:'sb_publishable_synthetic',publicAnonKey:jwt({role:'anon',ref,exp:Math.floor(now/1000)+3600}),now:()=>now,inspect:()=>{throw Error('codec must not run');}};
async function trial(company){
 mediaReads=0;const w=createImageServiceWorker({...base,fetch:async(url,o)=>{
 const json=v=>new Response(JSON.stringify(v),{headers:{'content-type':'application/json'}});
 if(url.endsWith('/auth/v1/user'))return json({id:actor,role:'authenticated'});
 if(url.endsWith('/claim_connect_image_inspection_v1')){assert.deepEqual(JSON.parse(o.body),{p_attachment:null});return json({attachmentId:id(4),leaseId:id(5),companyId:company,conversationId:id(6),objectKey:'q/'+id(7),sha256:digest,byteLength:77,decoderImage:image,validUntil:new Date(now+30000).toISOString()});}
 mediaReads++;throw Error('synthetic transport stop before bytes');
 }});try{return{result:await w.tick({token}),mediaReads};}finally{w.close();}
}
for(const company of[coA,coB]){const v=await trial(company);assert.equal(v.result.stage,'read');assert.equal(v.mediaReads,1);}
const denied=await trial(id(99));assert.equal(denied.result.stage,'claim');assert.equal(denied.mediaReads,0);
for(const companyIds of[[],[coA,coA],['invalid']])assert.throws(()=>createImageServiceWorker({...base,companyIds}));
for(const companyId of[coA,coB]){
 const permit={purpose:'image-inspection-lease-v1',attachmentId:id(4),leaseId:id(5),companyId,inspectorId:actor,sessionId:sid,sha256:digest,byteLength:77,decoderImage:image,issuedAt:new Date(now).toISOString(),expiresAt:new Date(now+30000).toISOString()};
 assert.equal(codecRequest(permit,bytes,now,sid,companyId).permit.companyId,companyId);
 assert.throws(()=>codecRequest(permit,bytes,now,sid,id(99)));
}
console.log(JSON.stringify({state:'passed-new-configured-company-routing-boundary',realNetwork:0,realAuth:0,realStorage:0,codecRuns:0,checks:['server-selected A/B accepted only inside local root-owned allowlist','foreign company refused before media read','empty/duplicate/invalid config denied','IPC company/session remains exact'],notEndToEndProof:true}));
