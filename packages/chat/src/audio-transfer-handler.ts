import{createHash}from 'node:crypto';import type{createAudioBackendSession}from './audio-backend-session.ts';
type Scope=Readonly<{companyId:string;conversationId:string}>;type Backend=Awaited<ReturnType<typeof createAudioBackendSession>>;
const uuid=(v:string|null):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v),prefix='/functions/v1/connect-audio-transfer-v1/';
/** Unmounted server handler. open must perform real JWT/session/conversation verification.
 * This gate is not authorization, and never provisions a listener or credentials. */
export function createAudioTransferHandler(input:Readonly<{enabled?:boolean;publishableKey:string;open:(credential:string,scope:Scope)=>Promise<Backend>}>){
 const d=Object.freeze({...input});let busy=false;
 const error=(status:number)=>Response.json({status:status===503?'disabled':'unavailable'},{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
 return async(req:Request):Promise<Response>=>{
  if(d.enabled!==true)return error(503);const url=new URL(req.url),kind=url.pathname.slice(prefix.length);
  if(!url.pathname.startsWith(prefix)||url.search||!['upload','lookup','read'].includes(kind))return error(404);if(req.method!=='POST')return error(405);
  if(req.headers.has('origin')||req.headers.get('apikey')!==d.publishableKey)return error(401);
  const auth=req.headers.get('authorization')??'',credential=auth.startsWith('Bearer ')?auth.slice(7):'';if(credential.length>8192||!/^[-A-Za-z0-9_]+\.[-A-Za-z0-9_]+\.[-A-Za-z0-9_]+$/.test(credential))return error(401);
  const companyId=req.headers.get('x-connect-company'),conversationId=req.headers.get('x-connect-conversation'),intent=req.headers.get('x-connect-intent'),attachment=req.headers.get('x-connect-attachment'),digest=req.headers.get('x-connect-content-sha256');
  if(!uuid(companyId)||!uuid(conversationId)||kind==='read'&&!uuid(attachment)||kind!=='read'&&(!intent||!/^[-A-Za-z0-9_]{1,80}$/.test(intent)))return error(400);
  if(kind==='upload'&&(!digest||!/^[a-f0-9]{64}$/.test(digest)||!/^application\/octet-stream(?:\s*;|$)/i.test(req.headers.get('content-type')??'')))return error(400);
  const length=req.headers.get('content-length');if(length!==null&&(!/^\d+$/.test(length)||Number(length)>1048576))return error(413);if(kind!=='upload'&&(req.body!==null||Number(length??0)!==0))return error(400);
  if(req.signal.aborted)return error(400);if(busy)return error(409);busy=true;let backend:Backend|null=null,buffer:Uint8Array|null=null,held:Uint8Array|null=null,read:Uint8Array|null=null,reader:ReadableStreamDefaultReader<Uint8Array>|null=null;
  let cancelled=false;const abort=()=>{cancelled=true;try{backend?.close();}catch{}try{void reader?.cancel().catch(()=>{});}catch{}};req.signal.addEventListener('abort',abort,{once:true});const timer=setTimeout(abort,30000);
  try{
   try{backend=await d.open(credential,{companyId,conversationId});}catch{return error(401);}if(cancelled)return error(400);
   if(kind==='read'){read=await backend.read(credential,{companyId,conversationId,attachmentId:attachment!});if(cancelled)throw Error();return new Response(Uint8Array.from(read).buffer,{headers:{'x-connect-company':companyId,'x-connect-conversation':conversationId,'x-connect-attachment':attachment!,'content-type':'audio/mp4','content-length':String(read.length),'cache-control':'no-store','x-content-type-options':'nosniff'}});}
   const command={companyId,conversationId,clientUploadId:intent!};if(kind==='lookup'){const receipt=await backend.lookup(credential,command);if(cancelled)throw Error();return Response.json(receipt,{headers:{'cache-control':'no-store'}});}
   if(!req.body)return error(400);buffer=new Uint8Array(1048576);let size=0;reader=req.body.getReader();
   for(;;){const part=await reader.read();if(cancelled)throw Error();if(part.done)break;if(part.value.length>buffer.length-size)return error(413);buffer.set(part.value,size);size+=part.value.length;}
   if(!size||length!==null&&Number(length)!==size)return error(400);held=buffer.slice(0,size);if(createHash('sha256').update(held).digest('hex')!==digest)return error(400);
   const receipt=await backend.upload(credential,command,held,digest!);if(cancelled)throw Error();return Response.json(receipt,{headers:{'cache-control':'no-store'}});
  }catch{return error(503);}finally{try{await reader?.cancel();}catch{}try{reader?.releaseLock();}catch{}try{backend?.close();}catch{}clearTimeout(timer);buffer?.fill(0);held?.fill(0);read?.fill(0);req.signal.removeEventListener('abort',abort);busy=false;}
 };
}
