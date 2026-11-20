import fs from'node:fs/promises';import net from'node:net';import{randomBytes,createHash}from'node:crypto';
import{createFfmpegImageInspector,admitImageContainer}from'../../../../packages/chat/src/image-ffmpeg-inspector.ts';
import image from'../linux-image.lock.json'with{type:'json'};
const socketPath='/run/connect-image-codec/inspect.sock',fail=()=>Error('Private image decoder unavailable');
export function codecRequest(permit,bytes,now,sessionId,companyId){
 const fields=['purpose','attachmentId','leaseId','companyId','inspectorId','sessionId','sha256','byteLength','decoderImage','issuedAt','expiresAt'];
 const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v),from=Date.parse(permit?.issuedAt),until=Date.parse(permit?.expiresAt);
 if(!permit||Object.keys(permit).sort().join(',')!==fields.sort().join(',')||permit.purpose!=='image-inspection-lease-v1'||!['attachmentId','leaseId','companyId','inspectorId','sessionId'].every(k=>uuid(permit[k]))||permit.decoderImage!==image.imageId||!Number.isSafeInteger(permit.byteLength)||permit.byteLength<16||permit.byteLength>4194304||!/^[a-f0-9]{64}$/.test(permit.sha256)||!Number.isSafeInteger(now)||!Number.isSafeInteger(from)||!Number.isSafeInteger(until)||until<=from||until-from>30000||now<from||now>=until)throw fail();
 if(permit.sessionId!==sessionId||permit.companyId!==companyId||permit.inspectorId!=='ee330000-0000-4000-8000-000000000202'||!(bytes instanceof Uint8Array)||bytes.length!==permit.byteLength||createHash('sha256').update(bytes).digest('hex')!==permit.sha256)throw fail();
 const header=admitImageContainer(bytes);if(!header)return null;
 return{version:1,nonce:randomBytes(32).toString('hex'),permit,header};
}
async function exchange(request,bytes,signal){
 const parent=await fs.lstat('/run/connect-image-codec'),st=await fs.lstat(socketPath);
 if(!parent.isDirectory()||parent.isSymbolicLink()||parent.uid!==0||parent.mode&0o022||!st.isSocket()||st.uid!==0||(st.mode&0o777)!==0o660)throw fail();
 const header=Buffer.from(JSON.stringify(request)),prefix=Buffer.alloc(4);if(header.length>8192)throw fail();prefix.writeUInt32BE(header.length);
 return new Promise((resolve,reject)=>{
  const socket=net.createConnection({path:socketPath});let n=0,chunks=[],settled=false,payload=null;
  const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal.removeEventListener('abort',abort);socket.destroy();payload?.fill(0);payload=null;header.fill(0);prefix.fill(0);for(const c of chunks)c.fill(0);chunks=[];error?reject(fail()):resolve(value);};
  const abort=()=>finish(true),timer=setTimeout(abort,Math.min(16000,Math.max(1,Date.parse(request.permit.expiresAt)-Date.now())));
  signal.addEventListener('abort',abort,{once:true});socket.on('error',abort);
  socket.once('connect',()=>{if(signal.aborted)return abort();payload=Buffer.concat([prefix,header,bytes]);socket.end(payload,()=>{payload?.fill(0);payload=null;});});
  socket.on('data',chunk=>{if((n+=chunk.length)>40000)return abort();chunks.push(Buffer.from(chunk));});
  socket.once('end',()=>{try{const v=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(v.version!==1||v.nonce!==request.nonce||v.ok!==true||!v.proof)throw fail();finish(false,v.proof);}catch{abort();}});
 });
}
export function createNormalCodecPort({sessionId,companyId,companyIds,now=Date.now}){
 let active=null;
 const inspect=createFfmpegImageInspector({enabled:true,run:async(bytes)=>exchange(active.request,bytes,active.signal)});
 return async(bytes,{permit,signal})=>{if(active||signal.aborted||companyIds!==undefined&&!companyIds.includes(permit.companyId))throw fail();const request=codecRequest(permit,bytes,now(),sessionId(),companyIds===undefined?companyId:permit.companyId);if(!request)return{accepted:false};
 active={request,signal};try{return await inspect(bytes);}finally{active=null;}};
}
