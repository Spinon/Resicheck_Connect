import type {AudioTransferIntent,AudioTransferRead,AudioTransferReceipt} from './audio-transfer.ts';
const origin='https://ibdlvlwdzmsrbqadrudb.supabase.co',bucket='connect-private-attachments',MAX=1048576;
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
const exact=(v:unknown,keys:string[]):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const fail=()=>Error('Audio unavailable');
type Phase=NonNullable<AudioTransferReceipt['inspection_phase']>;
type IntentRecord={digest:string;size:number;putStarted:boolean};
export type ReceivedAudioCache=Readonly<{
 ticket:()=>number;get:(userId:string,command:AudioTransferRead)=>Promise<Uint8Array|null>;
 put:(userId:string,command:AudioTransferRead,bytes:Uint8Array,ticket:number)=>void;
}>;
type Options=Readonly<{receivedCache?:ReceivedAudioCache;enabled?:boolean;origin:string;publishableKey:string;userId:string;current:()=>boolean;token:()=>string|null;denied:()=>void;fetch:typeof fetch;digest:(bytes:Uint8Array)=>Promise<string>;now:()=>number;schedule:(fn:()=>void,ms:number)=>()=>void;timeoutMs:number}>;
/** Scoped Storage/RPC candidate, OFF by default. One original intent, never retry a PUT after it started. */
export function createScopedAudioTransfer(input:Options){
 const d=Object.freeze({...input});
 if(d.origin!==origin||!uuid(d.userId)||!/^sb_publishable_[A-Za-z0-9_-]{1,200}$/.test(d.publishableKey)||!Number.isSafeInteger(d.timeoutMs)||d.timeoutMs<1||d.timeoutMs>60000)throw fail();
 let backgroundActive=false;let releasePhysical=()=>{};let physicalDone=Promise.resolve();
 let closed=false,physical=false,stop:(()=>void)|null=null;const records=new Map<string,IntentRecord>();
 const live=()=>{try{return !closed&&d.enabled===true&&d.current()===true;}catch{return false;}};
 function scope(c:{companyId:string;conversationId:string}){if(!live()||!uuid(c.companyId)||!uuid(c.conversationId))throw fail();}
 function intent(c:AudioTransferIntent){scope(c);if(!exact(c,['companyId','conversationId','clientUploadId'])||!/^[A-Za-z0-9_-]{1,80}$/.test(c.clientUploadId))throw fail();}
 const key=(c:AudioTransferIntent)=>c.companyId+'/'+c.conversationId+'/'+c.clientUploadId;
 function receipt(row:unknown,c:AudioTransferIntent,phase?:Phase):AudioTransferReceipt{
  if(row===null)return Object.freeze({company_id:c.companyId,conversation_id:c.conversationId,client_upload_id:c.clientUploadId,sender_id:d.userId,state:'not_observed',attachment_id:null});
  const fields=['id','companyId','conversationId','userId','clientUploadId','sha256','byteLength','state',...(phase?['inspectionPhase']:[])];
  if(!exact(row,fields)||row.companyId!==c.companyId||row.conversationId!==c.conversationId||row.userId!==d.userId||row.clientUploadId!==c.clientUploadId||!uuid(row.id)||typeof row.sha256!=='string'||!/^[a-f0-9]{64}$/.test(row.sha256)||!Number.isSafeInteger(row.byteLength)||(row.byteLength as number)<1||(row.byteLength as number)>MAX||!['quarantined','ready','rejected'].includes(String(row.state)))throw fail();
  const prior=records.get(key(c));if(prior&&(row.sha256!==prior.digest||row.byteLength!==prior.size))throw fail();
  if(phase&&(row.inspectionPhase!==phase||row.state==='ready'&&phase!=='ready'||row.state==='rejected'&&phase!=='rejected'||row.state==='quarantined'&&['ready','rejected'].includes(phase)))throw fail();
  return Object.freeze({company_id:c.companyId,conversation_id:c.conversationId,client_upload_id:c.clientUploadId,sender_id:d.userId,state:row.state,attachment_id:row.id,...(phase?{inspection_phase:phase}:{})})as AudioTransferReceipt;
 }
 async function run<T>(signal:AbortSignal,work:(signal:AbortSignal)=>Promise<T>,background=false):Promise<T>{
  // A voluntary download yields to an explicit user action. Keep physical admission
  // until the old transport actually settles; a timed-out fetch never frees it early.
  if(!background&&physical&&backgroundActive){
   const done=physicalDone;stop?.();let cancel=()=>{};
   try{await Promise.race([done,new Promise<never>((_,no)=>{const failWait=()=>no(fail());signal.addEventListener('abort',failWait,{once:true});const timer=d.schedule(failWait,d.timeoutMs);cancel=()=>{timer();signal.removeEventListener('abort',failWait);};if(signal.aborted)failWait();})]);}finally{cancel();}
  }
  if(!live()||signal.aborted||physical)throw fail();physical=true;backgroundActive=background;physicalDone=new Promise<void>(yes=>{releasePhysical=yes;});
  const ac=new AbortController();let reject!:(e:Error)=>void;const interrupted=new Promise<never>((_,no)=>reject=no);void interrupted.catch(()=>{});
  const abort=()=>{ac.abort();reject(fail());};stop=abort;signal.addEventListener('abort',abort,{once:true});let cancel=()=>{},launched=false;
  try{cancel=d.schedule(abort,d.timeoutMs);if(!live()||ac.signal.aborted)throw fail();launched=true;
   const task=Promise.resolve().then(()=>{if(!live()||ac.signal.aborted)throw fail();return work(ac.signal);}).finally(()=>{physical=false;backgroundActive=false;releasePhysical();});
   const result=await Promise.race([interrupted,task]);if(!live()||ac.signal.aborted){if(result instanceof Uint8Array)result.fill(0);throw fail();}return result;
  }catch{throw fail();}finally{cancel();signal.removeEventListener('abort',abort);ac.abort();if(stop===abort)stop=null;if(!launched){physical=false;backgroundActive=false;releasePhysical();}}
 }
 async function http(path:string,signal:AbortSignal,options:Readonly<{body?:unknown;bytes?:Uint8Array;read?:boolean;readContext?:Readonly<{companyId:string;conversationId:string;attachmentId:string}>;max?:number}>={}){
  if(!live()||signal.aborted)throw fail();const token=d.token();if(!token||!/^[-A-Za-z0-9_.]{1,8192}$/.test(token)||token.startsWith('sb_'))throw fail();
  const binary=options.bytes!==undefined,read=options.read===true,url=origin+path,max=options.max??16384;
  let response:Response|null=null,reader:ReadableStreamDefaultReader<Uint8Array>|null=null,buffer:Uint8Array|null=null;const outgoing=options.bytes?Uint8Array.from(options.bytes):null;
  try{
   response=await d.fetch(url,{method:'POST',headers:{apikey:d.publishableKey,Authorization:'Bearer '+token,Accept:read?'audio/mp4':'application/json',...(read?{'Content-Type':'application/json','x-connect-company':options.readContext!.companyId,'x-connect-conversation':options.readContext!.conversationId,'x-connect-attachment':options.readContext!.attachmentId}:binary?{'Content-Type':'audio/mp4','x-upsert':'false'}:{'Content-Type':'application/json','Accept-Profile':'public','Content-Profile':'public'})},body:read?undefined:outgoing?outgoing.buffer:JSON.stringify(options.body),signal,redirect:'error',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});
   if(!live()||signal.aborted)throw fail();if(response.status===401||response.status===403){d.denied();throw fail();}
   if(read&&(!options.readContext||response.headers.get('x-connect-company')!==options.readContext.companyId||response.headers.get('x-connect-conversation')!==options.readContext.conversationId||response.headers.get('x-connect-attachment')!==options.readContext.attachmentId))throw fail();
   if(response.redirected||response.url&&response.url!==url||!([200,...(binary?[201]:[])].includes(response.status))||!response.body||!(read?/^audio\/mp4(?:\s*;|$)/i:/^application\/json(?:\s*;|$)/i).test(response.headers.get('content-type')??''))throw fail();
   const length=response.headers.get('content-length');if(length!==null&&(!/^\d+$/.test(length)||Number(length)>max))throw fail();
   buffer=new Uint8Array(max);reader=response.body.getReader();let size=0;
   for(;;){const part=await reader.read();if(!live()||signal.aborted)throw fail();if(part.done)break;if(!(part.value instanceof Uint8Array)||part.value.length>max-size)throw fail();buffer.set(part.value,size);size+=part.value.length;}
   if(read)return buffer.slice(0,size);
   return JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(buffer.subarray(0,size)))as unknown;
  }finally{outgoing?.fill(0);buffer?.fill(0);try{await reader?.cancel();reader?.releaseLock();if(!reader)await response?.body?.cancel();}catch{}}
 }
 const rpc=(name:string,body:unknown,signal:AbortSignal)=>http('/rest/v1/rpc/'+name,signal,{body});
 async function status(c:AudioTransferIntent,signal:AbortSignal){
  const row=await rpc('status_connect_audio_scoped_v1',{p_company:c.companyId,p_conversation:c.conversationId,p_client:c.clientUploadId},signal);
  if(row===null)return receipt(null,c);
  const phase=typeof row==='object'&&row?(row as Record<string,unknown>).inspectionPhase:null;
  if(!['awaiting_upload','queued','inspecting','inspection_failed','expired','ready','rejected'].includes(String(phase)))throw fail();
  return receipt(row,c,phase as Phase);
 }
 async function lookup(c:AudioTransferIntent,signal:AbortSignal){
  let value=await status(c,signal);
  if(value.inspection_phase==='awaiting_upload'&&records.get(key(c))?.putStarted){
   // Recover a lost upload ACK by checking the exact reserved object, never PUT again.
   await rpc('confirm_connect_audio_scoped_v1',{p_company:c.companyId,p_conversation:c.conversationId,p_attachment:value.attachment_id},signal);value=await status(c,signal);
  }
  return value;
 }
 return Object.freeze({active:live,
  async upload(command:AudioTransferIntent,bytes:Uint8Array,signal:AbortSignal){const c=Object.freeze({...command});intent(c);if(!(bytes instanceof Uint8Array)||bytes.length<16||bytes.length>MAX)throw fail();const held=Uint8Array.from(bytes);
   try{return await run(signal,async s=>{
    const digest=await d.digest(held);if(!live()||s.aborted||!/^[a-f0-9]{64}$/.test(digest))throw fail();const prior=records.get(key(c));if(prior&&(prior.digest!==digest||prior.size!==held.length))throw fail();if(!prior&&records.size>=100)throw fail();
    const record=prior??{digest,size:held.length,putStarted:false};records.set(key(c),record);if(record.putStarted)return lookup(c,s);
    const raw=await rpc('reserve_connect_audio_scoped_v1',{p_company:c.companyId,p_conversation:c.conversationId,p_client:c.clientUploadId,p_digest:digest,p_bytes:held.length},s);
    if(!exact(raw,['created','row','upload'])||typeof raw.created!=='boolean')throw fail();const value=receipt(raw.row,c);
    if(value.state!=='quarantined')return value;if(raw.upload===null)return status(c,s);
    if(!exact(raw.upload,['bucket','objectKey','validUntil'])||raw.upload.bucket!==bucket||typeof raw.upload.objectKey!=='string'||!raw.upload.objectKey.startsWith('q/')||!uuid(raw.upload.objectKey.slice(2))||typeof raw.upload.validUntil!=='string'||!Number.isFinite(Date.parse(raw.upload.validUntil))||Date.parse(raw.upload.validUntil)<=d.now())throw fail();
    if(!live()||s.aborted)throw fail();record.putStarted=true;
    const ack=await http('/storage/v1/object/'+bucket+'/'+raw.upload.objectKey,s,{bytes:held,max:4096});
    if(!ack||typeof ack!=='object'||!uuid((ack as Record<string,unknown>).Id)||(ack as Record<string,unknown>).Key!==bucket+'/'+raw.upload.objectKey)throw fail();
    await rpc('confirm_connect_audio_scoped_v1',{p_company:c.companyId,p_conversation:c.conversationId,p_attachment:value.attachment_id},s);return status(c,s);
   });}finally{held.fill(0);}
  },
  lookup(command:AudioTransferIntent,signal:AbortSignal){const c=Object.freeze({...command});intent(c);return run(signal,s=>lookup(c,s));},
  async read(command:AudioTransferRead,signal:AbortSignal,background=false){const c=Object.freeze({...command});scope(c);if(!exact(c,['companyId','conversationId','attachmentId','byteLength','sha256'])||!uuid(c.attachmentId)||!Number.isSafeInteger(c.byteLength)||c.byteLength<1||c.byteLength>MAX||!/^[a-f0-9]{64}$/.test(c.sha256))throw fail();
   return run(signal,async s=>{let bytes:Uint8Array|null=null;try{
    const args={p_company:c.companyId,p_conversation:c.conversationId,p_attachment:c.attachmentId};
    const descriptor=await rpc('resolve_connect_audio_storage_v1',args,s);
    if(!exact(descriptor,['attachmentId','companyId','conversationId','objectKey','sha256','byteLength'])||descriptor.attachmentId!==c.attachmentId||descriptor.companyId!==c.companyId||descriptor.conversationId!==c.conversationId||descriptor.sha256!==c.sha256||descriptor.byteLength!==c.byteLength||typeof descriptor.objectKey!=='string'||!descriptor.objectKey.startsWith('q/')||!uuid(descriptor.objectKey.slice(2)))throw fail();
    const cacheTicket=d.receivedCache?.ticket();
    try{bytes=await d.receivedCache?.get(d.userId,c)??null;}catch{/* Cache failure falls back to authorized transfer. */}
    if(bytes&&(bytes.length!==c.byteLength||await d.digest(bytes)!==c.sha256)){bytes.fill(0);bytes=null;}
    if(!live()||s.aborted)throw fail();
    const cacheHit=bytes!==null;
    const raw=bytes??await http('/functions/v1/connect-audio-transfer-v1/read' ,s,{read:true,readContext:c,max:c.byteLength});if(!(raw instanceof Uint8Array))throw fail();bytes=raw;
    if(bytes.length!==c.byteLength||await d.digest(bytes)!==c.sha256||!live()||s.aborted)throw fail();
    const after=await rpc('resolve_connect_audio_storage_v1',args,s);if(!exact(after,Object.keys(descriptor))||Object.keys(descriptor).some(k=>after[k]!==descriptor[k]))throw fail();
    if(!cacheHit&&cacheTicket!==undefined&&live()&&!s.aborted){try{d.receivedCache?.put(d.userId,c,bytes,cacheTicket);}catch{}}
    const result=bytes;bytes=null;return result;
   }finally{bytes?.fill(0);}},background);
  },
  close(){if(closed)return;closed=true;records.clear();stop?.();},
 });
}
