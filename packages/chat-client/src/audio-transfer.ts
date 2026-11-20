// Candidate protocol only. No endpoint installation or automatic retries.
export const AUDIO_TRANSFER_ORIGIN='https://ibdlvlwdzmsrbqadrudb.supabase.co';
const prefix='/functions/v1/connect-audio-transfer-v1',MAX=1048576;
export type AudioTransferScope=Readonly<{companyId:string;conversationId:string}>;
export type AudioTransferIntent=AudioTransferScope&Readonly<{clientUploadId:string}>;
export type AudioTransferRead=AudioTransferScope&Readonly<{attachmentId:string;byteLength:number;sha256:string}>;
export type AudioTransferReceipt=Readonly<{company_id:string;conversation_id:string;client_upload_id:string;sender_id:string;state:'not_observed'|'quarantined'|'ready'|'rejected';attachment_id:string|null;inspection_phase?:'awaiting_upload'|'queued'|'inspecting'|'inspection_failed'|'expired'|'ready'|'rejected'}>;
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
const fail=()=>Error('Audio transfer unavailable');
function exact(v:unknown,keys:string[]):v is Record<string,unknown>{return !!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');}
export function createAudioTransferCandidate(deps:Readonly<{origin:string;publishableKey:string;userId:string;current:()=>boolean;token:()=>string|null;denied:()=>void;fetch:typeof fetch;digest:(bytes:Uint8Array)=>Promise<string>;schedule:(fn:()=>void,ms:number)=>()=>void;timeoutMs:number}>){
 deps=Object.freeze({...deps});
 if(!/^sb_publishable_[A-Za-z0-9_-]{1,200}$/.test(deps.publishableKey)||typeof deps.current!=='function'||typeof deps.token!=='function'||typeof deps.denied!=='function'||typeof deps.fetch!=='function'||typeof deps.schedule!=='function'||deps.origin!==AUDIO_TRANSFER_ORIGIN||!uuid(deps.userId)||typeof deps.digest!=='function'||!Number.isSafeInteger(deps.timeoutMs)||deps.timeoutMs<1||deps.timeoutMs>60000)throw fail();
 let closed=false,physical=false,stop:(()=>void)|null=null;
 const live=()=>{try{return !closed&&deps.current()===true;}catch{return false;}};
 function scope(command:AudioTransferScope){if(!live()||!uuid(command.companyId)||!uuid(command.conversationId))throw fail();}
 function intent(command:AudioTransferIntent){scope(command);if(!exact(command,['companyId','conversationId','clientUploadId'])||typeof command.clientUploadId!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(command.clientUploadId))throw fail();}
 function receipt(value:unknown,command:AudioTransferIntent,lookup:boolean):AudioTransferReceipt{
  if(!exact(value,['company_id','conversation_id','client_upload_id','sender_id','state','attachment_id'])||value.company_id!==command.companyId||value.conversation_id!==command.conversationId||value.client_upload_id!==command.clientUploadId||value.sender_id!==deps.userId||!['not_observed','quarantined','ready','rejected'].includes(String(value.state)))throw fail();
  if(value.state==='not_observed'){if(!lookup||value.attachment_id!==null)throw fail();}else if(!uuid(value.attachment_id))throw fail();
  return Object.freeze({...value}) as AudioTransferReceipt;
 }
 async function request<T>(kind:'upload'|'lookup'|'read',command:AudioTransferIntent|AudioTransferRead,signal:AbortSignal,bytes:Uint8Array|null,decode:(value:Uint8Array,response:Response)=>Promise<T>):Promise<T>{
  scope(command);if(physical||signal.aborted)throw fail();const token=deps.token();if(!token||!/^[-A-Za-z0-9_.]{1,8192}$/.test(token)||token.startsWith('sb_'))throw fail();
  physical=true;const ac=new AbortController();let reject!:(e:Error)=>void;const interrupted=new Promise<never>((_,no)=>reject=no);void interrupted.catch(()=>{});
  const abort=()=>{ac.abort();reject(fail());};stop=abort;signal.addEventListener('abort',abort,{once:true});let cancel=()=>{};
  const body=bytes?Uint8Array.from(bytes):null;
  const work=async()=>{
   let reader:ReadableStreamDefaultReader<Uint8Array>|null=null,buffer:Uint8Array|null=null,response:Response|null=null,resultBytes:Uint8Array|null=null;
   try{
    if(!live()||ac.signal.aborted)throw fail();
    const headers:Record<string,string>={apikey:deps.publishableKey,Authorization:'Bearer '+token,'Content-Type':kind==='upload'?'application/octet-stream':'application/json',Accept:kind==='read'?'audio/mp4':'application/json','x-connect-company':command.companyId,'x-connect-conversation':command.conversationId};
    if(body){const digest=await deps.digest(body);if(!/^[a-f0-9]{64}$/.test(digest)||!live()||ac.signal.aborted)throw fail();headers['x-connect-content-sha256']=digest;}
    if('clientUploadId'in command)headers['x-connect-intent']=command.clientUploadId;else headers['x-connect-attachment']=command.attachmentId;
    const url=deps.origin+prefix+'/'+kind;
    response=await deps.fetch(url,{method:'POST',headers,body:body?body.buffer:undefined,signal:ac.signal,redirect:'error',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});
    if(!live()||ac.signal.aborted)throw fail();
    if(response.status===401||response.status===403){deps.denied();throw fail();}
    if(response.status!==200||response.redirected||response.url&&response.url!==url||!response.body)throw fail();
    const type=response.headers.get('content-type')??'',max=kind==='read'?(command as AudioTransferRead).byteLength:4096,length=response.headers.get('content-length');
    if(kind==='read'?!/^audio\/mp4(?:\s*;|$)/i.test(type):!/^application\/json(?:\s*;|$)/i.test(type))throw fail();
    if(length!==null&&(!/^\d+$/.test(length)||Number(length)>max))throw fail();
    buffer=new Uint8Array(max);let total=0;reader=response.body.getReader();
    for(;;){const part=await reader.read();if(!live()||ac.signal.aborted)throw fail();if(part.done)break;if(!(part.value instanceof Uint8Array)||part.value.length>max-total)throw fail();buffer.set(part.value,total);total+=part.value.length;}
    const value=buffer.slice(0,total);resultBytes=value;let decoded:T;
    try{decoded=await decode(value,response);if(!live()||ac.signal.aborted)throw fail();return decoded;}catch{value.fill(0);throw fail();}
   }finally{buffer?.fill(0);try{await reader?.cancel();reader?.releaseLock();if(!reader)await response?.body?.cancel();}catch{}if(ac.signal.aborted||!live())resultBytes?.fill(0);body?.fill(0);physical=false;}
  };
  let workPromise:Promise<T>|null=null;
  try{cancel=deps.schedule(abort,deps.timeoutMs);if(!live()||ac.signal.aborted)throw fail();workPromise=work();return await Promise.race([interrupted,workPromise]);}
  finally{cancel();signal.removeEventListener('abort',abort);ac.abort();if(stop===abort)stop=null;if(!workPromise){physical=false;body?.fill(0);}}
 }
 async function json(kind:'upload'|'lookup',command:AudioTransferIntent,signal:AbortSignal,bytes:Uint8Array|null){return request(kind,command,signal,bytes,async data=>{try{return receipt(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data)),command,kind==='lookup');}finally{data.fill(0);}});}
 return Object.freeze({
  active:()=>live(),
  async upload(command:AudioTransferIntent,bytes:Uint8Array,signal:AbortSignal){const captured=Object.freeze({...command});intent(captured);if(!(bytes instanceof Uint8Array)||bytes.length<1||bytes.length>MAX)throw fail();return json('upload',captured,signal,bytes);},
  async lookup(command:AudioTransferIntent,signal:AbortSignal){const captured=Object.freeze({...command});intent(captured);return json('lookup',captured,signal,null);},
  async read(command:AudioTransferRead,signal:AbortSignal,_background=false){const captured=Object.freeze({...command});scope(captured);if(!exact(captured,['companyId','conversationId','attachmentId','byteLength','sha256'])||!uuid(captured.attachmentId)||!Number.isSafeInteger(captured.byteLength)||captured.byteLength<1||captured.byteLength>MAX||!/^[a-f0-9]{64}$/.test(captured.sha256))throw fail();
   return request('read',captured,signal,null,async(data,response)=>{if(data.length!==captured.byteLength||response.headers.get('x-connect-company')!==captured.companyId||response.headers.get('x-connect-conversation')!==captured.conversationId||response.headers.get('x-connect-attachment')!==captured.attachmentId||await deps.digest(data)!==captured.sha256)throw fail();return data;});
  },
  close(){if(closed)return;closed=true;stop?.();},
 });
}
export type AudioTransfer=ReturnType<typeof createAudioTransferCandidate>;

// Compatibility ports for the existing reviewed-byte coordinator. Ready is attachment-only.
export function audioTransferUploadPorts(transport:Pick<AudioTransfer,'upload'|'lookup'>){
 const mapped=(r:AudioTransferReceipt)=>r.state==='not_observed'?{ok:false as const,code:'NOT_OBSERVED' as const}:{ok:true as const,value:{id:r.attachment_id!,state:r.state}};
 return Object.freeze({upload:async(command:AudioTransferIntent,bytes:Uint8Array,signal:AbortSignal)=>mapped(await transport.upload(command,bytes,signal)),lookup:async(command:AudioTransferIntent,signal:AbortSignal)=>mapped(await transport.lookup(command,signal))});
}
