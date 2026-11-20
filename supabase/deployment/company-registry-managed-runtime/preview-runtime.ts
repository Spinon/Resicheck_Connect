import{createAudioJwtVerifier as createUserVerifier}from'../../../packages/chat/src/audio-jwt-verifier.ts';
import{canonicalRegistryCnpj}from'../../../packages/access/src/company-registry.ts';
import{decodeCompanyPreview,type CompanyPreview}from'../../../packages/chat-client/src/company-preview.ts';
type Source=Readonly<{lookup:(cnpj:string,id:string,options?:{signal?:AbortSignal})=>Promise<CompanyPreview|Readonly<{state:'unavailable'}>>;dispose?:()=>void}>;
export type CompanyPreviewProofScope=Readonly<{userId:string;sessionId:string;cnpj:string;startsAt:number;expiresAt:number}>;
type Options=Readonly<{proofScope?:CompanyPreviewProofScope;enabled?:boolean;gatewayJwtRequired?:boolean;publishableKey?:string;fetch?:typeof fetch;now?:()=>number;schedule?:(f:()=>void,ms:number)=>()=>void;createId?:()=>string;source?:Source;allowedOrigins?:readonly string[];timeoutMs?:number;minimumIntervalMs?:number}>;
const BASE='https://ibdlvlwdzmsrbqadrudb.supabase.co',fault=(status:number)=>Object.assign(Error('Preview unavailable'),{status});
async function json(response:Response,signal:AbortSignal,max:number){
 if(!response.body||!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')??''))throw fault(503);
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;const abort=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
 try{for(;;){const p=await reader.read();if(signal.aborted)throw fault(503);if(p.done)break;if(!(p.value instanceof Uint8Array)||(size+=p.value.length)>max)throw fault(400);chunks.push(p.value);}const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}finally{bytes.fill(0);}}
 finally{signal.removeEventListener('abort',abort);for(const c of chunks)c.fill(0);try{await reader.cancel();reader.releaseLock();}catch{}}
}
/** Separate OFF candidate: public-source suggestions only, no service key, SQL writes, proof or membership. */
export function createCompanyPreviewRuntime(input:Options={}){
 const off=Object.freeze({fetch:async(_request:Request)=>new Response('{"status":"disabled"}',{status:503,headers:{'content-type':'application/json','cache-control':'no-store'}}),dispose(){}});
 if(input.enabled!==true||input.gatewayJwtRequired!==true)return off;
 const{publishableKey,fetch:send,now,schedule,createId,source}=input,timeout=input.timeoutMs??12000,interval=input.minimumIntervalMs??2000;
 if(typeof publishableKey!=='string'||!/^sb_publishable_[A-Za-z0-9_-]{1,200}$/.test(publishableKey)||[send,now,schedule,createId,source?.lookup].some(f=>typeof f!=='function')||!Number.isSafeInteger(timeout)||timeout<1||timeout>20000||!Number.isSafeInteger(interval)||interval<1000||interval>60000)throw fault(503);
 let proofScope:CompanyPreviewProofScope|null=null;
 if(input.proofScope!==undefined){const p=input.proofScope,uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
  if(!p||typeof p!=='object'||Reflect.ownKeys(p).sort().join(',')!=='cnpj,expiresAt,sessionId,startsAt,userId'||!uuid(p.userId)||!uuid(p.sessionId)||canonicalRegistryCnpj(p.cnpj)!==p.cnpj||!Number.isSafeInteger(p.startsAt)||!Number.isSafeInteger(p.expiresAt)||p.startsAt<0||p.expiresAt<=p.startsAt||p.expiresAt-p.startsAt>600000)throw fault(503);
  proofScope=Object.freeze({...p});
 }
 const origins=new Set(input.allowedOrigins??['https://connect.resicheck.com.br']);
 if(origins.size>8||[...origins].some(o=>{try{const u=new URL(o);return u.origin!==o||u.protocol!=='https:';}catch{return true;}}))throw fault(503);
 const active=new Set<AbortController>(),budgets=new Map<string,number>();let closed=false;
 const respond=(r:Request,status:number,value:unknown)=>{const o=r.headers.get('origin');return new Response(status===204?null:JSON.stringify(value),{status,headers:{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff','vary':'Origin',...(o&&origins.has(o)?{'access-control-allow-origin':o,'access-control-allow-methods':'POST','access-control-allow-headers':'authorization,apikey,content-type'}:{})}});};
 return Object.freeze({async fetch(request:Request){
  const url=new URL(request.url),origin=request.headers.get('origin');
  if(closed)return respond(request,503,{status:'disabled'});
  if(!['/connect-company-registry-preview','/functions/v1/connect-company-registry-preview'].includes(url.pathname)||url.search||url.hash)return respond(request,404,{status:'unavailable'});
  if(origin&&!origins.has(origin))return respond(request,403,{status:'unavailable'});
  if(request.method==='OPTIONS')return respond(request,204,null);
  if(request.method!=='POST')return respond(request,405,{status:'unavailable'});
  if(active.size>=2)return respond(request,429,{status:'unavailable'});
  const ac=new AbortController();active.add(ac);let cancel=()=>{},token:string|null=null;
  const abort=()=>ac.abort();request.signal.addEventListener('abort',abort,{once:true});if(request.signal.aborted)ac.abort();
  try{
   const start=now!();if(proofScope&&(start<proofScope.startsAt||start>=proofScope.expiresAt))throw fault(403);
   cancel=schedule!(()=>ac.abort(),proofScope?Math.min(timeout,proofScope.expiresAt-start):timeout);
   const authorization=request.headers.get('authorization');if(!authorization?.startsWith('Bearer ')||request.headers.get('apikey')!==publishableKey)throw fault(401);token=authorization.slice(7);
   const raw=await json(new Response(request.body,{headers:{'content-type':request.headers.get('content-type')??''}}),ac.signal,256);
   if(!raw||typeof raw!=='object'||Array.isArray(raw)||Reflect.ownKeys(raw).join(',')!=='p_cnpj'||canonicalRegistryCnpj(raw.p_cnpj)!==raw.p_cnpj)throw fault(400);
   const cnpj=raw.p_cnpj as string;if(proofScope&&cnpj!==proofScope.cnpj)throw fault(403);const scoped:typeof fetch=(url,init)=>{if(closed||ac.signal.aborted)throw fault(503);return send!(url,{...init,signal:AbortSignal.any([ac.signal,...(init?.signal?[init.signal]:[])])});};
   let claims;try{claims=await createUserVerifier({enabled:true,publishableKey,fetch:scoped,now:now!,timeoutMs:Math.min(timeout,5000)})(token);}catch{throw fault(401);}
   async function rpc(name:'my_profile_registration'|'my_connect_memberships',params:Record<string,null>){
    const target=BASE+'/rest/v1/rpc/'+name,r=await scoped(target,{method:'POST',headers:{apikey:publishableKey!,Authorization:'Bearer '+token,'content-type':'application/json',Accept:'application/json','Accept-Profile':'public','Content-Profile':'public'},body:JSON.stringify(params),redirect:'error',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});
    if(r.status!==200||r.redirected||r.url&&r.url!==target){await r.body?.cancel().catch(()=>{});throw fault(r.status>=400&&r.status<500?403:503);}return json(r,ac.signal,name==='my_profile_registration'?2048:16384);
   }
   async function authorize(){
    const at=now!();if(closed||ac.signal.aborted||claims!.exp*1000<=at||proofScope&&(claims!.sub!==proofScope.userId||claims!.session_id!==proofScope.sessionId||at<proofScope.startsAt||at>=proofScope.expiresAt))throw fault(403);
    // Existing profile RPC checks current Auth session, membership RPC checks active account.
    const profile=await rpc('my_profile_registration',{});if(profile.profile_id!==claims!.sub||profile.registration_state!=='approved'||!['unconfirmed','confirmed'].includes(profile.identity_state))throw fault(403);
    const membership=await rpc('my_connect_memberships',{p_after_company:null,p_after_role:null});if(!membership||!Array.isArray(membership.items))throw fault(403);
   }
   await authorize();const at=now!();if(!Number.isSafeInteger(at))throw fault(503);
   for(const[k,until]of budgets)if(until<=at)budgets.delete(k);
   if((budgets.get(claims.sub)??0)>at||budgets.size>=128)throw fault(429);budgets.set(claims.sub,at+interval);
   const value=await source!.lookup(cnpj,createId!(),{signal:ac.signal});
   await authorize();if(value.state==='unavailable')throw fault(503);
   const projected=decodeCompanyPreview(value,cnpj);if(closed||ac.signal.aborted)throw fault(503);return respond(request,200,projected);
  }catch(e){const status=typeof e==='object'&&e!==null&&'status'in e&&[400,401,403,429].includes(e.status as number)?e.status as number:503;return respond(request,status,{status:'unavailable'});}
  finally{cancel();ac.abort();active.delete(ac);request.signal.removeEventListener('abort',abort);token=null;}
 },dispose(){closed=true;for(const a of active)a.abort();source?.dispose?.();budgets.clear();}});
}
