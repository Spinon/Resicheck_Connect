import{canonicalRegistryCnpj,registryNameKey,type RegistryLookup,type RegistrySnapshot}from'../../../packages/access/src/company-registry.ts';
export const MINHA_RECEITA_SOURCE='minhareceita-cnpj-v1';
const origin='https://minhareceita.org',day=86400000;
export type RegistrySourceResult=Readonly<{lookup:RegistryLookup;datasetDate:string|null;datasetMonth:string|null}>;
type Options=Readonly<{fetch:typeof fetch;now:()=>number;schedule:(fn:()=>void,ms:number)=>()=>void;enabled?:boolean;timeoutMs?:number;maxBytes?:number;maxDatasetAgeDays?:number;freshnessPolicy?:'elapsed-days'|'calendar-month-v1'}>;
const fail=():RegistrySourceResult=>Object.freeze({lookup:Object.freeze({kind:'unavailable'}),datasetDate:null,datasetMonth:null});
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const time=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=8640000000000000;
/** The live metadata endpoint reports a MONTH, not an extraction day.
 * First day UTC is a conservative lower bound, never a claimed exact date. */
export function decodeDatasetMonth(value:unknown,now:number,maxAgeDays:number,policy:'elapsed-days'|'calendar-month-v1'='elapsed-days'){
 if(!Number.isSafeInteger(maxAgeDays)||maxAgeDays<1||maxAgeDays>366||!record(value)||Reflect.ownKeys(value).length!==1||!Object.hasOwn(value,'message')||typeof value.message!=='string'||!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(value.message))throw Error('Source unavailable');
 const month=value.message,date=month+'-01',at=Date.parse(date+'T00:00:00.000Z');
 if(!time(now)||!time(at)||at>now||!['elapsed-days','calendar-month-v1'].includes(policy))throw Error('Source unavailable');
 if(policy==='elapsed-days'){if(now-at>=maxAgeDays*day)throw Error('Source unavailable');}
 else{const t=new Date(now),previous=Date.UTC(t.getUTCFullYear(),t.getUTCMonth()-1,1);if(maxAgeDays!==62||at<previous)throw Error('Source unavailable');}
 return Object.freeze({month,date,at});
}
function sourceName(value:unknown):string{
 if(registryNameKey(value)===null||typeof value!=='string')throw Error('Source unavailable');
 return value.normalize('NFC').replace(/\p{Zs}+/gu,' ').trim();
}
/** Whitelist projection only: do not access or persist QSA, contacts or raw body. */
export function decodeMinhaReceitaCompany(raw:unknown,requested:string,reference:string,observedAt:number):RegistrySnapshot{
 if(!record(raw)||!uuid(reference)||!time(observedAt))throw Error('Source unavailable');
 const {cnpj,razao_social,nome_fantasia,situacao_cadastral}=raw;
 if(canonicalRegistryCnpj(cnpj)!==requested||typeof situacao_cadastral!=='number'||![1,2,3,4,8].includes(situacao_cadastral))throw Error('Source unavailable');
 const legalName=sourceName(razao_social),tradeName=nome_fantasia===undefined||nome_fantasia===null||typeof nome_fantasia==='string'&&/^\p{Zs}*$/u.test(nome_fantasia)?null:sourceName(nome_fantasia);
 return Object.freeze({cnpj:requested,legalName,tradeName,registrationStatus:situacao_cadastral as 1|2|3|4|8,observedAt,sourceId:MINHA_RECEITA_SOURCE,sourceRequestId:reference});
}
/** Server only, explicit fetch injection, no I/O on import. Disabled by default.
 * At most two actual outstanding operations. A non-cooperative fetch keeps its
 * slot after presentation timeout; no retry/fallback or unlimited parallel I/O. */
export function createMinhaReceitaSource(options:Options){
 const{fetch:send,now,schedule,enabled=false,timeoutMs=8000,maxBytes=262144,maxDatasetAgeDays=45,freshnessPolicy='elapsed-days'}=options;
 if([send,now,schedule].some(f=>typeof f!=='function')||typeof enabled!=='boolean'||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>15000||!Number.isSafeInteger(maxBytes)||maxBytes<1024||maxBytes>1048576||!Number.isSafeInteger(maxDatasetAgeDays)||maxDatasetAgeDays<1||maxDatasetAgeDays>366)throw Error('Source unavailable');
 if(!['elapsed-days','calendar-month-v1'].includes(freshnessPolicy)||freshnessPolicy==='calendar-month-v1'&&maxDatasetAgeDays!==62)throw Error('Source unavailable');
 let closed=false,cache:Readonly<{month:string;date:string;at:number;checkedAt:number}>|null=null;const jobs=new Set<()=>void>();
 async function lookup(value:unknown,reference:unknown,input:Readonly<{signal?:AbortSignal;maxDatasetAgeDays?:number}>={}):Promise<RegistrySourceResult>{
  const cnpj=canonicalRegistryCnpj(value),days=input.maxDatasetAgeDays??maxDatasetAgeDays;
  if(closed||!enabled||!cnpj||!uuid(reference)||input.signal?.aborted||jobs.size>=2||!Number.isSafeInteger(days)||days<1||days>maxDatasetAgeDays)return fail();
  const controller=new AbortController();let cancel=()=>{},reader:ReadableStreamDefaultReader<Uint8Array>|null=null,interrupt!:(v:RegistrySourceResult)=>void;
  const interrupted=new Promise<RegistrySourceResult>(r=>{interrupt=r;});
  const live=()=>!closed&&!controller.signal.aborted;
  const stop=()=>{controller.abort();interrupt(fail());try{void reader?.cancel().catch(()=>{});}catch{}};
  jobs.add(stop);input.signal?.addEventListener('abort',stop,{once:true});if(input.signal?.aborted)stop();
  async function get(url:string,company=false):Promise<unknown>{
   if(!live())throw Error('Source unavailable');
   const response=await send(url,{method:'GET',headers:{Accept:'application/json'},signal:controller.signal,redirect:'error',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});
   if(!live()||response.redirected||response.url&&response.url!==url){try{await response.body?.cancel();}catch{}throw Error('Source unavailable');}
   if(company&&response.status===404){try{await response.body?.cancel();}catch{}return null;}
   if(response.status!==200||!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')??'')){try{await response.body?.cancel();}catch{}throw Error('Source unavailable');}
   const length=response.headers.get('content-length'),limit=company?maxBytes:4096;
   if(length!==null&&(!/^\d+$/.test(length)||Number(length)>limit)){try{await response.body?.cancel();}catch{}throw Error('Source unavailable');}
   if(!response.body)throw Error('Source unavailable');reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
   try{for(;;){const part=await reader.read();if(!live())throw Error('Source unavailable');if(part.done)break;if(!(part.value instanceof Uint8Array)||(size+=part.value.length)>limit)throw Error('Source unavailable');chunks.push(part.value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    const parsed:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(!live())throw Error('Source unavailable');return parsed;
   }finally{try{void reader?.cancel().catch(()=>{});reader?.releaseLock();}catch{}reader=null;}
  }
  const work=Promise.resolve().then(async()=>{
   try{
    cancel=schedule(stop,timeoutMs);if(!live())return fail();
    const current=now();if(!time(current))return fail();let metadata=cache;
    if(!metadata||current<metadata.checkedAt||current-metadata.checkedAt>=60000){const decoded=decodeDatasetMonth(await get(origin+'/updated'),now(),days,freshnessPolicy);if(!live())return fail();const checkedAt=now();if(!time(checkedAt))return fail();metadata=Object.freeze({...decoded,checkedAt});cache=metadata;}
    // Recheck even a cached month under this job's stricter source policy.
    decodeDatasetMonth({message:metadata.month},now(),days,freshnessPolicy);
    const raw=await get(origin+'/'+cnpj,true);if(!live())return fail();
    decodeDatasetMonth({message:metadata.month},now(),days,freshnessPolicy);
    const lookup:RegistryLookup=raw===null?Object.freeze({kind:'not-found'}):Object.freeze({kind:'found',snapshot:decodeMinhaReceitaCompany(raw,cnpj,reference,now())});
    return Object.freeze({lookup,datasetDate:metadata.date,datasetMonth:metadata.month});
   }catch{return fail();}
   finally{jobs.delete(stop);try{cancel();}catch{}input.signal?.removeEventListener('abort',stop);controller.abort();}
  });
  return Promise.race([work,interrupted]);
 }
 return Object.freeze({sourceId:MINHA_RECEITA_SOURCE,maxDatasetAgeDays,lookup,dispose(){if(closed)return;closed=true;cache=null;for(const stop of [...jobs])stop();}});
}
