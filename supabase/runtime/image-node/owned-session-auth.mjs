/** Positive ownership of a session from THIS password request only.
 * No prior session identifiers, cookies, browser storage, listings or admin API.
 * The production caller supplies its fixed root-only credential reader; this
 * module has no filesystem/storage import or ambient credential source. */
export const OWNED_IMAGE_SESSION_POLICY='fresh-password-session-v1';
const origin='https://ibdlvlwdzmsrbqadrudb.supabase.co',actor='ee330000-0000-4000-8000-000000000202',email='inspector@example.invalid';
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v),fail=()=>Error('Owned image session unavailable');
export function createOwnedImagePasswordSession(input={}){
 if(input.enabled!==true)return null;const d=Object.freeze({...input});
 if(d.sessionPolicy!==OWNED_IMAGE_SESSION_POLICY||'protectedSessionIds'in d||!uuid(d.attemptId)||typeof d.readCredential!=='function'||typeof d.fetch!=='function'||typeof d.now!=='function'||!/^sb_publishable_[A-Za-z0-9_-]+$/.test(d.publishableKey??''))throw fail();
 let token='',refresh='',sid=null,expiry=0,attempted=false,owned=false,closed=false,busy=false,uncertain=false,ownership=null;
 async function call(route,method='GET',payload,access){
  if(!['/auth/v1/token?grant_type=password','/auth/v1/token?grant_type=refresh_token','/auth/v1/user','/auth/v1/logout?scope=local'].includes(route))throw fail();
  const url=origin+route,r=await d.fetch(url,{method,headers:{apikey:d.publishableKey,Accept:'application/json',...(payload?{'Content-Type':'application/json'}:{}),...(access?{Authorization:'Bearer '+access}:{})},body:payload,signal:AbortSignal.timeout(10000),redirect:'error',cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
  if(r.redirected||r.url&&r.url!==url){await r.body?.cancel();throw fail();}return r;
 }
 async function json(r){
  if(r.status!==200||!/^application\/json(?:;|$)/i.test(r.headers.get('content-type')??'')||!r.body){await r.body?.cancel();throw fail();}
  const reader=r.body.getReader(),buffer=new Uint8Array(65536);let n=0;
  try{for(;;){const item=await reader.read();if(item.done)break;if(!(item.value instanceof Uint8Array)||item.value.length>buffer.length-n)throw fail();buffer.set(item.value,n);n+=item.value.length;}return JSON.parse(new TextDecoder('utf8',{fatal:true}).decode(buffer.subarray(0,n)));}finally{buffer.fill(0);try{await reader.cancel();reader.releaseLock();}catch{}}
 }
 async function accept(response,startedAt,existing){
  const v=await json(response),access=v.access_token,nextRefresh=v.refresh_token;v.access_token='';v.refresh_token='';
  if(v.token_type!=='bearer'||typeof access!=='string'||access.length>7900||typeof nextRefresh!=='string'||nextRefresh.length<8||nextRefresh.length>8192||access.split('.').length!==3)throw fail();
  const c=JSON.parse(Buffer.from(access.split('.')[1],'base64url')),now=d.now(),lo=Math.floor(startedAt/1000)-5,hi=Math.floor(now/1000)+5;
  if(!Number.isSafeInteger(startedAt)||!Number.isSafeInteger(now)||now<startedAt||now-startedAt>15000||c.sub!==actor||c.role!=='authenticated'||c.aud!=='authenticated'||c.iss!==origin+'/auth/v1'||!uuid(c.session_id)||!Number.isSafeInteger(c.iat)||c.iat<lo||c.iat>hi||!Number.isSafeInteger(c.exp)||c.exp*1000<=now||c.exp<=c.iat||!Number.isSafeInteger(v.expires_in)||Math.abs(c.exp-c.iat-v.expires_in)>5||!Array.isArray(c.amr))throw fail();
  const passwords=c.amr.filter(a=>a?.method==='password'&&Number.isSafeInteger(a.timestamp));
  if(passwords.length!==1)throw fail();const passwordAt=passwords[0].timestamp;
  if(existing){if(!owned||c.session_id!==sid||passwordAt!==ownership.passwordAuthenticatedAt||c.iat<ownership.lastIssuedAt)throw fail();}
  else if(owned||passwordAt<lo||passwordAt>hi)throw fail();
  const responseSession=response.headers.get('sb-auth-session-id');if(responseSession!==null&&responseSession!==c.session_id)throw fail();
  // Official password grant creates a new session. Fresh iat + password AMR,
  // fixed TLS endpoint and this one dispatch establish ownership positively.
  // A stale/foreign response is never adopted or logged out. Retain our new
  // response before GET /user so its failure can still close only this session.
  token=access;refresh=nextRefresh;sid=c.session_id;expiry=c.exp*1000;owned=true;
  ownership=Object.freeze({policy:OWNED_IMAGE_SESSION_POLICY,attemptId:d.attemptId,actorId:actor,sessionId:sid,passwordAuthenticatedAt:passwordAt,lastIssuedAt:c.iat,grantDispatchedAt:existing?ownership.grantDispatchedAt:startedAt});
  const user=await json(await call('/auth/v1/user','GET',undefined,token));
  if(user.id!==actor||user.role!=='authenticated'||user.email?.toLowerCase()!==email||!user.email_confirmed_at)throw fail();
 }
 return Object.freeze({
  async open(){
   if(attempted||closed||busy)throw fail();attempted=true;busy=true;let c,body='';
   try{c=await d.readCredential();if(c?.email!==email||typeof c.password!=='string'||c.password.length<64||c.password.length>72)throw fail();body=JSON.stringify({email,password:c.password});c.password='';const start=d.now(),response=await call('/auth/v1/token?grant_type=password','POST',body);body='';await accept(response,start,false);return Object.freeze({actorId:actor,sessionId:sid,ownership});}
   catch{uncertain=true;throw fail();}finally{body='';if(c)c.password='';busy=false;}
  },
  async readSession(){
   if(closed||uncertain||busy||!owned)throw fail();
   if(expiry-d.now()<60000){busy=true;let body='';try{body=JSON.stringify({refresh_token:refresh});const start=d.now(),r=await call('/auth/v1/token?grant_type=refresh_token','POST',body);body='';await accept(r,start,true);}catch{uncertain=true;throw fail();}finally{body='';busy=false;}}
   return token;
  },
  sessionId(){if(!owned||closed||uncertain)throw fail();return sid;},
  ownership(){if(!owned||closed||uncertain)throw fail();return ownership;},
  async close(){
   if(closed)return Object.freeze({state:'closed',logout:'not-repeated'});closed=true;let logout='not-attempted';
   try{if(owned&&token){const r=await call('/auth/v1/logout?scope=local','POST',undefined,token);logout=[200,204].includes(r.status)?'local-acknowledged':'unconfirmed';await r.body?.cancel();}}catch{logout='unconfirmed';}finally{token='';refresh='';expiry=0;}
   return Object.freeze({state:'closed',attemptId:d.attemptId,actorId:actor,sessionId:sid,logout,administrativeAuditRequired:true});
  }
 });
}
