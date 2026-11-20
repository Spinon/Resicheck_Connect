import{IMAGE_ORIGIN,IMAGE_PATH,IMAGE_MAX,imageFailure,imageIntent,imageMessage,imageCommit,imageExact,imageUuid,decodeImageDescriptor,decodeImageUpload,type ImageIntent,type ImageCommit,type ImageMessage,type ImageDescriptor}from'./image-contract.ts';
import{decodeOwnReceipt}from'./own-send-receipt.ts';
export type ImageHttpObservation=Readonly<{kind:'upload'|'status'|'send'|'lookup'|'read';stage:'request'|'headers'|'body'|'decode'|'complete';accepted:boolean;status:number|null;json:boolean;noStore:boolean;declaredBytes:number|null;decodedBytes:number;encoding:'identity'|'gzip'|'br'|'deflate'|'other'}>;
/** Candidate authenticated bytes protocol. Never uses Storage URLs or cookies.
 * Timeout is uncertain; caller must reconcile the exact intent before retry. */
export function createImageTransfer(input:Readonly<{enabled?:boolean;origin:string;publishableKey:string;userId:string;current:()=>boolean;token:()=>string|null;fetch:typeof fetch;digest:(bytes:Uint8Array)=>Promise<string>;schedule:(fn:()=>void,ms:number)=>()=>void;timeoutMs:number;observe?:(event:ImageHttpObservation)=>void}>){
 const d=Object.freeze({...input});if(d.origin!==IMAGE_ORIGIN||!/^sb_publishable_[A-Za-z0-9_-]{1,200}$/.test(d.publishableKey)||!imageUuid(d.userId)||!Number.isSafeInteger(d.timeoutMs)||d.timeoutMs<1||d.timeoutMs>60000)throw imageFailure();
 let closed=false,physical=false,interrupt:(()=>void)|null=null;
 const current=()=>{try{return !closed&&d.enabled===true&&d.current()===true;}catch{return false;}};
 async function request<T>(kind:'upload'|'status'|'send'|'lookup'|'read',command:ImageIntent|ImageCommit|ImageMessage,signal:AbortSignal,content:Uint8Array|null,decode:(bytes:Uint8Array,response:Response)=>Promise<T>):Promise<T>{
  if(!current()||physical||signal.aborted)throw imageFailure();const token=d.token();if(typeof token!=='string'||token.length>8192||!/^[-A-Za-z0-9_]+\.[-A-Za-z0-9_]+\.[-A-Za-z0-9_]+$/.test(token))throw imageFailure();
  physical=true;const ac=new AbortController();let reject!:(e:Error)=>void;const stopped=new Promise<never>((_,no)=>reject=no);void stopped.catch(()=>{});
  const abort=()=>{ac.abort();reject(imageFailure());};interrupt=abort;signal.addEventListener('abort',abort,{once:true});let cancel=()=>{},launched=false;
  const held=content?Uint8Array.from(content):null;
  const work=async()=>{
   let reader:ReadableStreamDefaultReader<Uint8Array>|null=null,buffer:Uint8Array|null=null,value:Uint8Array|null=null,response:Response|null=null;
   let stage:ImageHttpObservation['stage']='request',decodedBytes=0;
   const observe=(accepted:boolean)=>{const h=response?.headers,raw=h?.get('content-length'),encoding=h?.get('content-encoding')?.toLowerCase()??(response?.type==='cors'?'other':'identity');try{d.observe?.(Object.freeze({kind,stage,accepted,status:response?.status??null,json:/^application\/json(?:\s*;|$)/i.test(h?.get('content-type')??''),noStore:!!h?.get('cache-control')?.split(',').some(v=>v.trim().toLowerCase()==='no-store'),declaredBytes:raw&&/^[0-9]+$/.test(raw)&&Number.isSafeInteger(Number(raw))?Number(raw):null,decodedBytes,encoding:['identity','gzip','br','deflate'].includes(encoding)?encoding as ImageHttpObservation['encoding']:'other'}));}catch{}};
   const live=()=>{if(!current()||ac.signal.aborted)throw imageFailure();};
   try{
    live();const url=d.origin+IMAGE_PATH+kind,headers:Record<string,string>={apikey:d.publishableKey,authorization:'Bearer '+token,'content-type':held?'application/octet-stream':'application/json',accept:kind==='read'?'image/png,image/jpeg':'application/json'};
    if(held){if(held.length!==(command as ImageIntent).byteLength||await d.digest(held)!==(command as ImageIntent).sha256)throw imageFailure();headers['x-connect-image-intent']=JSON.stringify(command);}live();
    response=await d.fetch(url,{method:'POST',headers,body:held?held.buffer:JSON.stringify(command),signal:ac.signal,redirect:'error',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});live();stage='headers';
    if(response.status!==200||response.redirected||response.url&&response.url!==url||!response.body||!response.headers.get('cache-control')?.split(',').some(v=>v.trim().toLowerCase()==='no-store'))throw imageFailure();
    const type=response.headers.get('content-type')??'',length=response.headers.get('content-length'),max=kind==='read'?IMAGE_MAX:8192;
    if(kind==='read'?!['image/png','image/jpeg'].includes(type):!/^application\/json(?:\s*;|$)/i.test(type))throw imageFailure();
    if(length!==null&&(!/^[0-9]+$/.test(length)||Number(length)>max))throw imageFailure();
    stage='body';buffer=new Uint8Array(max);reader=response.body.getReader();let size=0;
    for(;;){const part=await reader.read();live();if(part.done)break;if(!(part.value instanceof Uint8Array)||part.value.length>max-size)throw imageFailure();buffer.set(part.value,size);size+=part.value.length;decodedBytes=size;}
    // Fetch exposes decoded bytes; Content-Length describes the encoded representation.
    const encoding=response.headers.get('content-encoding')?.trim().toLowerCase();
    // A CORS-filtered response may hide Content-Encoding. Its Content-Length
    // can describe encoded wire bytes, never assume it counts decoded bytes.
    const identityLength=encoding==='identity'||!encoding&&response.type!=='cors';
    if(!size||identityLength&&length!==null&&Number(length)!==size)throw imageFailure();value=buffer.slice(0,size);stage='decode';
    const result=await decode(value,response);live();stage='complete';observe(true);return result;
   }catch{observe(false);value?.fill(0);throw imageFailure();}finally{buffer?.fill(0);held?.fill(0);try{await reader?.cancel();reader?.releaseLock();if(!reader)await response?.body?.cancel();}catch{}physical=false;}
  };
  try{cancel=d.schedule(abort,d.timeoutMs);if(!current()||ac.signal.aborted)throw imageFailure();launched=true;return await Promise.race([work(),stopped]);}
  finally{cancel();signal.removeEventListener('abort',abort);ac.abort();if(interrupt===abort)interrupt=null;if(!launched){held?.fill(0);physical=false;}}
 }
 const json=<T=unknown>(kind:'upload'|'status'|'send'|'lookup',command:ImageIntent|ImageCommit,signal:AbortSignal,bytes:Uint8Array|null,decode:(raw:unknown)=>T=(raw=>raw as T))=>request(kind,command,signal,bytes,async data=>{try{return decode(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data)));}finally{data.fill(0);}});
 return Object.freeze({
  async upload(command:ImageIntent,bytes:Uint8Array,signal:AbortSignal){const c=imageIntent(command);if(!(bytes instanceof Uint8Array)||bytes.length!==c.byteLength)throw imageFailure();const r=await json('upload',c,signal,bytes,raw=>decodeImageUpload(raw,c,d.userId));if(!current()||signal.aborted)throw imageFailure();return r;},
  async status(command:ImageIntent,signal:AbortSignal){const c=imageIntent(command);const r=await json('status',c,signal,null,raw=>decodeImageUpload(raw,c,d.userId));if(!current()||signal.aborted)throw imageFailure();return r;},
  async commit(kind:'send'|'lookup',command:ImageCommit,signal:AbortSignal){if(!['send','lookup'].includes(kind))throw imageFailure();const c=imageCommit(command),raw=await json(kind,c,signal,null);if(!imageExact(raw,['sender_id','company_id','conversation_id','client_message_id','kind','attachment_id','state',...((raw as Record<string,unknown>)?.state==='accepted'?['receipt']:[])])||raw.kind!=='image'||raw.attachment_id!==c.attachmentId)throw imageFailure();const receipt=decodeOwnReceipt(raw,{...c,userId:d.userId,sessionKey:'captured-owner'},c.clientMessageId);if(!current()||signal.aborted||kind==='send'&&receipt.state!=='accepted')throw imageFailure();return receipt;},
  async read(command:ImageMessage,signal:AbortSignal):Promise<Readonly<{descriptor:ImageDescriptor;bytes:Uint8Array}>>{const c=imageMessage(command);return request('read',c,signal,null,async(bytes,response)=>{const header=response.headers.get('x-connect-image-descriptor');if(!header||header.length>2048)throw imageFailure();const descriptor=decodeImageDescriptor(JSON.parse(header),c);if(response.headers.get('content-type')!==descriptor.mime||bytes.length!==descriptor.byteLength||await d.digest(bytes)!==descriptor.sha256)throw imageFailure();return Object.freeze({descriptor,bytes});});},
  active:current,close(){if(closed)return;closed=true;interrupt?.();}
 });
}
export type ImageTransfer=ReturnType<typeof createImageTransfer>;
