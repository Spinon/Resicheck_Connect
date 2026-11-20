import type {CompanyPublic} from './membership-directory.ts';
// One subject/session-bound read. Backend authorization remains mandatory.
// No URI, invite, mutation, token, membership or chat permission is accepted.
export type PatientCompanyRpc=(companyId:string,signal:AbortSignal)=>PromiseLike<Readonly<{data:unknown;error:null}|{data:null;error:Readonly<{code:string}>}>>;
type Result=Readonly<{ok:true;value:CompanyPublic}|{ok:false;code:'INVALID_INPUT'|'UNAVAILABLE'}>;
const failure=(code:'INVALID_INPUT'|'UNAVAILABLE'):Result=>Object.freeze({ok:false,code});
const unavailable=failure('UNAVAILABLE');
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
function text(v:unknown,max:number,required=false):v is string{
 if(typeof v!=='string'||[...v].length>max||required&&!v.trim()||/[\u0000-\u001f\u007f]/.test(v))return false;
 for(let i=0;i<v.length;i++){const c=v.charCodeAt(i);if(c>=0xd800&&c<=0xdbff){const low=v.charCodeAt(++i);if(!(low>=0xdc00&&low<=0xdfff))return false;}else if(c>=0xdc00&&c<=0xdfff)return false;}return true;
}
function decode(raw:unknown,companyId:string):CompanyPublic{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error();
 const keys=Reflect.ownKeys(raw);if(keys.length!==4||!keys.every(k=>typeof k==='string'&&['company_id','name','address','phone'].includes(k)))throw Error();
 const {company_id,name,address,phone}=raw as Record<string,unknown>;
 if(company_id!==companyId||!text(name,160,true)||!text(address,500)||!text(phone,80))throw Error();
 return Object.freeze({companyId,name,address,phone});
}
export function createPatientCompanyReader(deps:{rpc:PatientCompanyRpc;current:()=>boolean;schedule:(fn:()=>void,ms:number)=>()=>void;timeoutMs:number}){
 const {rpc,current,schedule,timeoutMs}=deps;
 if(typeof rpc!=='function'||typeof current!=='function'||typeof schedule!=='function'||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000)throw Error('Company unavailable');
 let closed=false,retired=false,pending=false,stop=()=>{};
 const active=()=>{if(closed||retired)return false;try{if(current()!==true)retired=true;}catch{retired=true;}return !closed&&!retired;};
 async function read(companyId:string,signal?:AbortSignal):Promise<Result>{
  if(!uuid(companyId))return failure('INVALID_INPUT');if(!active()||pending||signal?.aborted)return unavailable;
  pending=true;const ac=new AbortController();let interrupted=false,cancel=()=>{},resolve!:(r:Result)=>void;
  const interruption=new Promise<Result>(r=>{resolve=r;}),abort=()=>{if(interrupted)return;interrupted=true;ac.abort();resolve(unavailable);};stop=abort;signal?.addEventListener('abort',abort,{once:true});
  try{cancel=schedule(abort,timeoutMs);}catch{abort();}
  const work=Promise.resolve().then(async():Promise<Result>=>{
   if(!active()||interrupted)return unavailable;
   try{const reply=await rpc(companyId,ac.signal);if(!active()||interrupted)return unavailable;const {data,error}=reply;if(error!==null)return unavailable;const value=decode(data,companyId);return active()&&!interrupted?Object.freeze({ok:true,value}):unavailable;}catch{return unavailable;}
  }).finally(()=>{pending=false;if(stop===abort)stop=()=>{};try{cancel();}catch{}signal?.removeEventListener('abort',abort);});
  // An aborted/timed-out port still owns admission until its work settles.
  return Promise.race([work,interruption]);
 }
 return Object.freeze({read,close(){if(closed)return;closed=true;stop();}});
}
