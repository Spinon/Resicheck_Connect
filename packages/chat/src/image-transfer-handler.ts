import{createHash}from'node:crypto';
import{IMAGE_PATH,IMAGE_MAX,imageExact,imageFailure,imageUuid,imageIntent,imageMessage,imageCommit,decodeImageUpload,type ImageScope,type ImageIntent,type ImageCommit,type ImageMessage}from'../../chat-client/src/image-contract.ts';
import{decodeOwnReceipt}from'../../chat-client/src/own-send-receipt.ts';
import type{createImagePrivateRead}from'./image-private-read.ts';
export type ImageTransferBackend=Readonly<{userId:string;upload:(intent:ImageIntent,bytes:Uint8Array,signal:AbortSignal)=>Promise<unknown>;status:(intent:ImageIntent,signal:AbortSignal)=>Promise<unknown>;commit:(kind:'send'|'lookup',command:ImageCommit,signal:AbortSignal)=>Promise<unknown>;read:ReturnType<typeof createImagePrivateRead>;close:()=>void}>;
/** Unmounted candidate. open is a trusted JWT+session+conversation verifier,
 * never an HTTP supplied adapter. No listeners, credentials or grants created. */
export function createImageTransferHandler(input:Readonly<{enabled?:boolean;publishableKey:string;origins?:readonly string[];open:(credential:string,scope:ImageScope,signal:AbortSignal)=>Promise<ImageTransferBackend>}>){
 const d=Object.freeze({...input}),origins=new Set(input.origins??[]);let busy=false;
 for(const o of origins){const u=new URL(o);if(u.origin!==o||!(u.protocol==='https:'||u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)))throw imageFailure();}
 return async(req:Request):Promise<Response>=>{
  const origin=req.headers.get('origin'),cors:Record<string,string>=origin&&origins.has(origin)?{'access-control-allow-origin':origin,'vary':'Origin, Authorization','access-control-expose-headers':'x-connect-image-descriptor'}:{};
  const headers={'cache-control':'no-store','cdn-cache-control':'no-store','surrogate-control':'no-store','vary':'Authorization','x-content-type-options':'nosniff',...cors};
  const error=(status:number)=>Response.json({status:status===503?'unavailable':'refused'},{status,headers});
  if(d.enabled!==true)return error(503);
  const url=new URL(req.url),kind=url.pathname.slice(IMAGE_PATH.length);
  if(!url.pathname.startsWith(IMAGE_PATH)||url.search||!['upload','status','send','lookup','read'].includes(kind))return error(404);
  if(origin!==null&&!origins.has(origin))return error(401);
  if(req.method==='OPTIONS'){const requested=(req.headers.get('access-control-request-headers')??'').toLowerCase().split(',').map(s=>s.trim()).filter(Boolean);if(!origin||req.headers.get('access-control-request-method')!=='POST'||requested.some(h=>!['apikey','authorization','content-type','x-connect-image-intent'].includes(h)))return error(400);return new Response(null,{status:204,headers:{...headers,'access-control-allow-methods':'POST','access-control-allow-headers':'apikey,authorization,content-type,x-connect-image-intent','access-control-max-age':'0'}});}
  if(req.method!=='POST')return error(405);
  const auth=req.headers.get('authorization')??'',credential=auth.startsWith('Bearer ')?auth.slice(7):'';
  if(req.headers.get('apikey')!==d.publishableKey||credential.length>8192||!/^[-A-Za-z0-9_]+\.[-A-Za-z0-9_]+\.[-A-Za-z0-9_]+$/.test(credential)||req.signal.aborted)return error(401);
  if(busy)return error(409);busy=true;
  const ac=new AbortController();let reject!:(e:Error)=>void;
  const stopped=new Promise<never>((_,no)=>reject=no);void stopped.catch(()=>{});
  let reader:ReadableStreamDefaultReader<Uint8Array>|null=null,backend:ImageTransferBackend|null=null;
  const abort=()=>{ac.abort();reject(imageFailure());try{void reader?.cancel().catch(()=>{});}catch{}};
  req.signal.addEventListener('abort',abort,{once:true});const timer=setTimeout(abort,30000);
  const work=async()=>{
   let bytes:Uint8Array|null=null,read:Uint8Array|null=null;
   const live=()=>{if(ac.signal.aborted)throw imageFailure();};
   async function body(max:number){if(!req.body)throw imageFailure();const declared=req.headers.get('content-length');if(declared!==null&&(!/^[0-9]+$/.test(declared)||Number(declared)>max))throw imageFailure();const buffer=new Uint8Array(max);reader=req.body.getReader();let size=0;try{for(;;){const part=await reader.read();live();if(part.done)break;if(!(part.value instanceof Uint8Array)||part.value.length>max-size)throw imageFailure();buffer.set(part.value,size);size+=part.value.length;}if(!size||declared!==null&&Number(declared)!==size)throw imageFailure();return buffer.slice(0,size);}finally{buffer.fill(0);}}
   try{
    let command:ImageIntent|ImageCommit|ImageMessage;
    if(kind==='upload'){const meta=req.headers.get('x-connect-image-intent');if(!meta||meta.length>1024||req.headers.get('content-type')!=='application/octet-stream')return error(400);command=imageIntent(JSON.parse(meta));}
    else{if(req.headers.has('x-connect-image-intent')||req.headers.get('content-type')!=='application/json')return error(400);bytes=await body(2048);const raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));bytes.fill(0);bytes=null;command=kind==='status'?imageIntent(raw):kind==='read'?imageMessage(raw):imageCommit(raw);}
    live();backend=await d.open(credential,{companyId:command.companyId,conversationId:command.conversationId},ac.signal);live();if(!imageUuid(backend.userId))throw imageFailure();
    if(kind==='read'){const result=await backend.read(credential,command as ImageMessage,ac.signal);read=result.bytes;live();return new Response(Uint8Array.from(read).buffer,{headers:{...headers,'content-type':result.descriptor.mime,'content-length':String(read.length),'content-disposition':'inline','x-connect-image-descriptor':JSON.stringify(result.descriptor)}});}
    if(kind==='upload'||kind==='status'){const intent=command as ImageIntent;if(kind==='upload'){bytes=await body(IMAGE_MAX);if(bytes.length!==intent.byteLength||createHash('sha256').update(bytes).digest('hex')!==intent.sha256)throw imageFailure();}live();const raw=kind==='upload'?await backend.upload(intent,bytes!,ac.signal):await backend.status(intent,ac.signal);live();return Response.json(decodeImageUpload(raw,intent,backend.userId),{headers});}
    const c=command as ImageCommit,raw=await backend.commit(kind as 'send'|'lookup',c,ac.signal);live();
    if(!imageExact(raw,['sender_id','company_id','conversation_id','client_message_id','kind','attachment_id','state',...((raw as Record<string,unknown>)?.state==='accepted'?['receipt']:[])])||(raw as Record<string,unknown>).kind!=='image'||(raw as Record<string,unknown>).attachment_id!==c.attachmentId)throw imageFailure();
    const decoded=decodeOwnReceipt(raw,{...c,userId:backend.userId,sessionKey:'verified-server-session'},c.clientMessageId);if(kind==='send'&&decoded.state!=='accepted')throw imageFailure();return Response.json(raw,{headers});
   }catch{return error(503);}finally{bytes?.fill(0);read?.fill(0);try{await reader?.cancel();reader?.releaseLock();}catch{}try{backend?.close();}catch{}clearTimeout(timer);req.signal.removeEventListener('abort',abort);busy=false;}
  };
  try{return await Promise.race([work(),stopped]);}catch{return error(503);}
 };
}
