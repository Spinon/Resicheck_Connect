import{createHash}from'node:crypto';import{Buffer}from'node:buffer';
import{signS3Get}from'../../../supabase/runtime/audio-node/sigv4-get.mjs';
import{IMAGE_MAX,imageFailure,imageUuid}from'../../chat-client/src/image-contract.ts';
import type{PrivateImageDescriptor}from'./image-private-read.ts';
const ref='ibdlvlwdzmsrbqadrudb',origin='https://'+ref+'.storage.supabase.co';
function claims(token:string){if(typeof token!=='string'||token.length>8192||!/^[-A-Za-z0-9_]+\.[-A-Za-z0-9_]+\.[-A-Za-z0-9_]+$/.test(token))throw imageFailure();return JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString('utf8')) as Record<string,unknown>;}
/** Image-only current S3 GET, not CDN object GET or signed URL.
 * Public legacy anon key + caller JWT; no S3/admin key is provisioned. Auth and
 * current SQL authorization remain mandatory before and after this byte read. */
export function createImageS3Read(input:Readonly<{enabled?:boolean;publicAnonKey?:string;fetch:typeof fetch;now:()=>number}>){
 const d=Object.freeze({...input});if(d.enabled!==true)return{read:async()=>{throw imageFailure();}};
 const anon=claims(d.publicAnonKey??'');if(anon.role!=='anon'||anon.ref!==ref||!Number.isSafeInteger(anon.exp)||(anon.exp as number)*1000<=d.now())throw imageFailure();
 return Object.freeze({async read(v:PrivateImageDescriptor,token:string,signal:AbortSignal){
  let reader:ReadableStreamDefaultReader<Uint8Array>|null=null,response:Response|null=null,buffer:Uint8Array|null=null,result:Uint8Array|null=null;const ac=new AbortController(),abort=()=>ac.abort();signal.addEventListener('abort',abort,{once:true});const timer=setTimeout(abort,10000);
  try{const c=claims(token),start=d.now();if(signal.aborted||!imageUuid(c.sub)||!imageUuid(c.session_id)||c.role!=='authenticated'||!Number.isSafeInteger(c.exp)||(c.exp as number)*1000<=start||![v.companyId,v.conversationId,v.attachmentId,v.messageId].every(imageUuid)||typeof v.objectKey!=='string'||!v.objectKey.startsWith('q/')||!imageUuid(v.objectKey.slice(2))||!Number.isSafeInteger(v.byteLength)||v.byteLength<1||v.byteLength>IMAGE_MAX||!/^[a-f0-9]{64}$/.test(v.sha256)||!['image/png','image/jpeg'].includes(v.mime))throw imageFailure();
   const current=()=>!signal.aborted&&!ac.signal.aborted&&d.now()>=start&&d.now()<start+10000&&d.now()<(c.exp as number)*1000&&d.now()<(anon.exp as number)*1000,path='/storage/v1/s3/connect-private-images/'+v.objectKey,stamp=new Date(start).toISOString().replace(/[:-]|\.\d{3}/g,''),signed=signS3Get({host:ref+'.storage.supabase.co',path,region:'us-east-1',accessKey:ref,secret:d.publicAnonKey!,stamp,headers:{'x-amz-security-token':token}}),{host:_,...headers}=signed.headers;
   response=await d.fetch(origin+path,{method:'GET',headers:{...headers,Accept:v.mime},signal:ac.signal,redirect:'error',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});
   if(!current()||response.status!==200||response.redirected||response.url&&response.url!==origin+path||response.headers.get('content-type')!==v.mime||!response.body)throw imageFailure();
   const length=response.headers.get('content-length');if(length!==null&&(!/^[0-9]+$/.test(length)||Number(length)!==v.byteLength))throw imageFailure();buffer=new Uint8Array(v.byteLength);reader=response.body.getReader();let size=0;
   for(;;){const part=await reader.read();if(!current())throw imageFailure();if(part.done)break;if(!(part.value instanceof Uint8Array)||part.value.length>buffer.length-size)throw imageFailure();buffer.set(part.value,size);size+=part.value.length;}
   if(size!==buffer.length||createHash('sha256').update(buffer).digest('hex')!==v.sha256||!current())throw imageFailure();result=buffer.slice();return result;
  }catch{result?.fill(0);throw imageFailure();}
  finally{clearTimeout(timer);signal.removeEventListener('abort',abort);ac.abort();buffer?.fill(0);try{await reader?.cancel();reader?.releaseLock();if(!reader)await response?.body?.cancel();}catch{}}
 }});
}
