// Subject-bound, parameterless read port. No credential, user/company selector,
// HTTP client, persistence or clinical permission is provided by this reader.
export type StaffEmployer=Readonly<{state:'none'}|{state:'active';companyId:string;name:string;companyAvailable:boolean}>;
export type StaffEmployerHint=StaffEmployer|Readonly<{state:'unknown'}>;
export type StaffEmployerRpc=(signal:AbortSignal)=>PromiseLike<Readonly<{data:unknown;error:null}|{data:null;error:Readonly<{code:string}>}>>;
const fail=Object.freeze({ok:false as const}),uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
function decode(v:unknown):StaffEmployer{if(!v||typeof v!=='object'||Array.isArray(v))throw Error();const r=v as Record<string,unknown>,keys=Object.keys(r);if(r.state==='none'&&keys.length===1&&Object.hasOwn(r,'state'))return Object.freeze({state:'none'});if(r.state!=='active'||keys.length!==4||!['state','company_id','name','company_available'].every(k=>Object.hasOwn(r,k))||!uuid(r.company_id)||typeof r.name!=='string'||!r.name.trim()||Array.from(r.name).length>160||/[\u0000-\u001f\u007f-\u009f]/u.test(r.name)||typeof r.company_available!=='boolean')throw Error();for(let i=0;i<r.name.length;i++){const c=r.name.charCodeAt(i);if(c>=0xd800&&c<=0xdbff){const d=r.name.charCodeAt(++i);if(!(d>=0xdc00&&d<=0xdfff))throw Error();}else if(c>=0xdc00&&c<=0xdfff)throw Error();}return Object.freeze({state:'active',companyId:r.company_id,name:r.name,companyAvailable:r.company_available});}
export function createStaffEmployerReader(deps:{rpc:StaffEmployerRpc;current:()=>boolean;schedule:(fn:()=>void,ms:number)=>()=>void;timeoutMs:number}){
 if(!Number.isSafeInteger(deps.timeoutMs)||deps.timeoutMs<1||deps.timeoutMs>60000)throw Error('Employer unavailable');let closed=false,pending=false,stop:()=>void=()=>{};
 const current=()=>{try{return !closed&&deps.current()===true;}catch{return false;}};
 async function read(signal?:AbortSignal):Promise<Readonly<{ok:true;value:StaffEmployer}|{ok:false}>>{if(!current()||pending||signal?.aborted)return fail;pending=true;const ac=new AbortController();let interrupted=false,cancel=()=>{},resolve!:(value:typeof fail)=>void;const interruption=new Promise<typeof fail>(r=>{resolve=r;}),abort=()=>{if(interrupted)return;interrupted=true;ac.abort();resolve(fail);};stop=abort;signal?.addEventListener('abort',abort,{once:true});try{cancel=deps.schedule(abort,deps.timeoutMs);}catch{abort();}
  const work=Promise.resolve().then(async()=>{if(!current()||interrupted)return fail;try{const reply=await deps.rpc(ac.signal);if(!current()||interrupted||reply.error!==null)return fail;return Object.freeze({ok:true as const,value:decode(reply.data)});}catch{return fail;}}).finally(()=>{pending=false;if(stop===abort)stop=()=>{};try{cancel();}catch{}signal?.removeEventListener('abort',abort);});
  // A timed-out, uncooperative port keeps its slot until it actually settles.
  return Promise.race([work,interruption]);
 }
 return Object.freeze({read,close:()=>{if(closed)return;closed=true;stop();}});
}
