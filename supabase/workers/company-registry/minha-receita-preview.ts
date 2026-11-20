import{canonicalRegistryCnpj}from'../../../packages/access/src/company-registry.ts';
import{decodeCompanyPreview,type CompanyPreview}from'../../../packages/chat-client/src/company-preview.ts';
import{decodeDatasetMonth,decodeMinhaReceitaCompany,MINHA_RECEITA_SOURCE}from'./minha-receita.ts';
type RegistrySourceResult=CompanyPreview|Readonly<{state:'unavailable'}>;
type Options=Readonly<{fetch:typeof fetch;now:()=>number;schedule:(fn:()=>void,ms:number)=>()=>void;enabled?:boolean;timeoutMs?:number;maxBytes?:number;maxDatasetAgeDays?:number;freshnessPolicy?:'elapsed-days'|'calendar-month-v1'}>;
const origin='https://minhareceita.org',fail=():RegistrySourceResult=>Object.freeze({state:'unavailable'}),uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v),time=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=8640000000000000;
function clean(v:unknown,max=160){if(v===undefined||v===null)return'';if(typeof v!=='string'||/[\u0000-\u001f\u007f-\u009f]/u.test(v))throw Error('Preview unavailable');const s=v.normalize('NFC').replace(/\p{Zs}+/gu,' ').trim();if([...s].length>max)throw Error('Preview unavailable');return s;}
/** Whitelist only; never read/return QSA, person identifiers, email or raw JSON. */
export function decodeMinhaReceitaPreview(raw:unknown,cnpj:string,reference:string,now:number,datasetMonth:string):CompanyPreview{
 const base=decodeMinhaReceitaCompany(raw,cnpj,reference,now),v=raw as Record<string,unknown>;let address:string|undefined,phone:string|undefined;
 try{const street=[clean(v.descricao_tipo_de_logradouro),clean(v.logradouro)].filter(Boolean).join(' '),city=[clean(v.municipio),clean(v.uf,2)].filter(Boolean).join(' - ');const a=[street,clean(v.numero,40),clean(v.complemento),clean(v.bairro),city,clean(v.cep,12)].filter(Boolean).join(', ');if(a&&[...a].length<=500)address=a;}catch{}
 try{const p=clean(v.ddd_telefone_1,80);if(p&&/^[+()0-9 .-]+$/.test(p))phone=p;}catch{}
 return decodeCompanyPreview({state:'found',cnpj,suggestions:{name:clean(base.legalName,160),...(address?{address}:{}),...(phone?{phone}:{})},registrationStatus:base.registrationStatus,datasetMonth,representationVerified:false},cnpj);
}
export function createMinhaReceitaPreviewSource(options:Options){
 const{fetch:send,now,schedule,enabled=false,timeoutMs=8000,maxBytes=262144,maxDatasetAgeDays=62,freshnessPolicy='calendar-month-v1'}=options;
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
    return raw===null?Object.freeze({state:'not-found' as const,cnpj}):decodeMinhaReceitaPreview(raw,cnpj,reference,now(),metadata.month);
   }catch{return fail();}
   finally{jobs.delete(stop);try{cancel();}catch{}input.signal?.removeEventListener('abort',stop);controller.abort();}
  });
  return Promise.race([work,interrupted]);
 }
 return Object.freeze({sourceId:MINHA_RECEITA_SOURCE,maxDatasetAgeDays,lookup,dispose(){if(closed)return;closed=true;cache=null;for(const stop of [...jobs])stop();}});
}
