import{createPatientCompanyLinkCodec}from './patient-company-link.ts';
export type MembershipLinkKind='staff'|'patient';
export const DEFAULT_MEMBERSHIP_LINK_TTL_SECONDS=604800;
export type MembershipLinkIntent=Readonly<{kind:MembershipLinkKind;companyId:string;inviteId:string;token:string}>;
export type MembershipLinkReceipt=Readonly<{inviteId:string;companyId:string;kind:MembershipLinkKind;expiresAt:string;state:'ready'|'consumed'|'revoked'|'expired'}>;
type Receipt=MembershipLinkReceipt;
export type MembershipLinkCommand=Readonly<{name:'issue_membership_secret_link_v1'|'accept_membership_secret_link_v1'|'revoke_membership_secret_link_v1'|'list_membership_secret_links_v1';params:Readonly<Record<string,string|number|null>>}>;
export type MembershipLinkRpc=(command:MembershipLinkCommand,signal:AbortSignal)=>Promise<Readonly<{data:unknown;error:null}|{data:null;error:Readonly<{code:string}>}>>;
export type MembershipLinkContext=Readonly<{userId:string;sessionKey:string;companyId:string}>;
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const kind=(v:unknown):v is MembershipLinkKind=>v==='staff'||v==='patient';
const fail=()=>new Error('Invitation unavailable');
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
function exact(v:Record<string,unknown>,keys:readonly string[]){const actual=Reflect.ownKeys(v);return actual.length===keys.length&&actual.every(k=>typeof k==='string'&&keys.includes(k));}
const prefix='/v1/membership-invites/';
/** Separate from the existing public company locator and legacy staff codec.
 * Parsing confers no authority. Origin is trusted deployment configuration. */
export function createMembershipSecretLinkCodec(options:Readonly<{origin:string}>){
 const origin=options.origin;createPatientCompanyLinkCodec({origin});
 function encode(v:MembershipLinkIntent){
  if(!kind(v.kind)||!uuid(v.companyId)||!uuid(v.inviteId)||typeof v.token!=='string'||!/^[0-9a-f]{64}$/.test(v.token))throw fail();
  return origin+prefix+v.kind+'/'+v.companyId+'/'+v.inviteId+'#token='+v.token;
 }
 function parse(input:unknown):MembershipLinkIntent{
  try{
   if(typeof input!=='string'||input.length>1200||!/^[\x21-\x7e]+$/.test(input)||input.includes('?'))throw fail();
   const u=new URL(input),parts=u.pathname.slice(prefix.length).split('/');
   if(u.origin!==origin||u.href!==input||!u.pathname.startsWith(prefix)||parts.length!==3||!u.hash.startsWith('#token='))throw fail();
   const v={kind:parts[0] as MembershipLinkKind,companyId:parts[1],inviteId:parts[2],token:u.hash.slice(7)};
   if(encode(v)!==input)throw fail();return Object.freeze(v);
  }catch{throw fail();}
 }
 return Object.freeze({encode,parse});
}
function canonicalExpiry(value:unknown):string{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(value))throw fail();
 const date=new Date(value);if(!Number.isFinite(date.getTime()))throw fail();
 const normalized=value.replace(/\+00:00$/,'Z').replace(/(?:\.(\d{1,6}))?Z$/,(_,f:string|undefined)=>'.'+(f??'').padEnd(3,'0').slice(0,3)+'Z');
 if(date.toISOString()!==normalized)throw fail();return date.toISOString();
}
function decode(raw:unknown,expected:Readonly<{inviteId:string;companyId:string;kind:MembershipLinkKind}>):Receipt{
 if(!record(raw)||!exact(raw,['inviteId','companyId','kind','expiresAt','state']))throw fail();
 const {inviteId,companyId,kind:role,expiresAt,state}=raw;
 if(inviteId!==expected.inviteId||companyId!==expected.companyId||role!==expected.kind||typeof expiresAt!=='string'
 ||!['ready','consumed','revoked','expired'].includes(String(state)))throw fail();
 return Object.freeze({inviteId,companyId,kind:role as MembershipLinkKind,expiresAt:canonicalExpiry(expiresAt),state:state as Receipt['state']});
}
export function validateMembershipLinkTimestamp(value:unknown):string{canonicalExpiry(value);return value as string;}
/** Candidate only; rpc MUST be bound to a verified current Auth session.
 * No credentials, implicit login, role grant, persistence, logging or auto-retry.
 * randomFill is a trusted platform CSPRNG; never substitute Math.random.
 * A native CSPRNG adapter is still required before normal Android integration. */
export function createMembershipSecretLinkClient(input:Readonly<{
 context:MembershipLinkContext;currentContext:()=>MembershipLinkContext|null;origin:string;rpc:MembershipLinkRpc;
 createId:()=>string;now:()=>number;defaultTtlSeconds?:number;randomFill?:(bytes:Uint8Array)=>void|Promise<void>;
}>){
 const {context,currentContext,rpc,createId,now}=input,owner=Object.freeze({...context}),codec=createMembershipSecretLinkCodec({origin:input.origin});
 const defaultTtl=input.defaultTtlSeconds??DEFAULT_MEMBERSHIP_LINK_TTL_SECONDS;
 if(!uuid(owner.userId)||!uuid(owner.companyId)||typeof owner.sessionKey!=='string'||!owner.sessionKey||!Number.isSafeInteger(defaultTtl)||defaultTtl<60||defaultTtl>604800)throw fail();
 const randomFill=input.randomFill??((bytes:Uint8Array)=>{if(!globalThis.crypto?.getRandomValues)throw fail();const secure=new Uint8Array(32);try{globalThis.crypto.getRandomValues(secure);bytes.set(secure);}finally{secure.fill(0);}});
 let closed=false,busy=false,phase='idle',ac:AbortController|null=null,receipt:Receipt|null=null;
 let pending:Readonly<{intent:MembershipLinkIntent;command:MembershipLinkCommand}>|null=null;
 function retire(){closed=true;phase='paused';pending=null;receipt=null;ac?.abort();}
 function live(){try{const current=currentContext();if(!closed&&current===context&&current.userId===owner.userId&&current.companyId===owner.companyId&&current.sessionKey===owner.sessionKey)return true;}catch{}retire();return false;}
 async function dispatch(command:MembershipLinkCommand){
  if(!live()||busy)return null;busy=true;const job=new AbortController();ac=job;
  try{const reply=await rpc(command,job.signal);if(!live()||job.signal.aborted||!reply||reply.error!==null)return null;return reply.data;}
  catch{return null;}
  finally{busy=false;if(ac===job)ac=null;job.abort();}
 }
 async function issueAgain(){
  if(!live()||busy||!pending)return false;const captured=pending;phase='issuing';
  const raw=await dispatch(captured.command);if(!live()||pending!==captured)return false;
  try{receipt=decode(raw,captured.intent);phase=receipt.state;if(phase!=='ready')pending=null;return phase==='ready';}
  catch{phase='uncertain';return false;}
 }
 return Object.freeze({
  snapshot:()=>{if(live()&&receipt&&phase==='ready'&&now()>=Date.parse(receipt.expiresAt)){phase='expired';pending=null;}return Object.freeze({phase,busy,inviteId:receipt?.inviteId??pending?.intent.inviteId??null,kind:receipt?.kind??pending?.intent.kind??null,expiresAt:receipt?.expiresAt??null});},
  async issue(role:MembershipLinkKind,ttlSeconds=defaultTtl){
   if(!live()||busy||phase!=='idle'||!kind(role)||!Number.isSafeInteger(ttlSeconds)||ttlSeconds<60||ttlSeconds>604800)return false;
   phase='preparing';const bytes=new Uint8Array(32);
   try{
    await randomFill(bytes);if(!live())return false;const inviteId=createId();if(!uuid(inviteId))throw fail();
    const token=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join(''),intent=Object.freeze({kind:role,companyId:owner.companyId,inviteId,token});
    const command=Object.freeze({name:'issue_membership_secret_link_v1' as const,params:Object.freeze({p_request:inviteId,p_company:owner.companyId,p_kind:role,p_token:token,p_ttl_seconds:ttlSeconds})});
    if(!live())return false;pending=Object.freeze({intent,command});
   }catch{if(live())phase='idle';return false;}finally{bytes.fill(0);}
   return issueAgain();
  },
  retryIssue:()=>phase==='uncertain'?issueAgain():Promise.resolve(false),
  async share(share:(url:string)=>Promise<void>){
   if(!live()||busy||phase!=='ready'||!pending||!receipt||now()>=Date.parse(receipt.expiresAt))return false;
   const captured=pending;busy=true;
   try{await share(codec.encode(captured.intent));return live()&&pending===captured;}
   catch{return false;}finally{busy=false;}
  },
  async revoke(){
   if(!live()||busy||!pending||!['ready','uncertain','expired'].includes(phase))return false;
   const captured=pending;phase='revoking';
   const raw=await dispatch(Object.freeze({name:'revoke_membership_secret_link_v1',params:Object.freeze({p_invite:captured.intent.inviteId,p_company:owner.companyId,p_kind:captured.intent.kind})}));
   if(!live()||pending!==captured)return false;
   try{receipt=decode(raw,captured.intent);if(receipt.state!=='revoked')throw fail();phase='revoked';pending=null;return true;}
   catch{phase='uncertain';return false;}
  },
  async accept(url:unknown){
   if(!live()||busy||pending)return null;let intent:MembershipLinkIntent;
   try{intent=codec.parse(url);if(intent.companyId!==owner.companyId)throw fail();}catch{return null;}
   phase='accepting';
   const raw=await dispatch(Object.freeze({name:'accept_membership_secret_link_v1',params:Object.freeze({p_invite:intent.inviteId,p_token:intent.token,p_expected_company:owner.companyId,p_kind:intent.kind})}));
   if(!live())return null;
   if(!record(raw)||!exact(raw,['inviteId','companyId','kind','state','conversationId'])||raw.inviteId!==intent.inviteId||raw.companyId!==owner.companyId||raw.kind!==intent.kind||raw.state!=='active'
    ||(intent.kind==='staff'?raw.conversationId!==null:!uuid(raw.conversationId))){phase='uncertain';return null;}
   phase='accepted';return Object.freeze({inviteId:intent.inviteId,companyId:owner.companyId,kind:intent.kind,conversationId:raw.conversationId as string|null});
  },
  close:retire,
 });
}

/** Canonical allowlist shared by the verified lease and HTTP boundary. */
export function membershipLinkCommand(raw:unknown):MembershipLinkCommand{
 try{
  if(!record(raw)||!exact(raw,['name','params'])||!record(raw.params))throw fail();
  const name=raw.name,p=raw.params;let params:Record<string,string|number|null>;
  if(name==='issue_membership_secret_link_v1'){
   if(!exact(p,['p_request','p_company','p_kind','p_token','p_ttl_seconds']))throw fail();
   const{p_request,p_company,p_kind,p_token,p_ttl_seconds}=p;
   if(!uuid(p_request)||!uuid(p_company)||!kind(p_kind)||typeof p_token!=='string'||!/^[0-9a-f]{64}$/.test(p_token)||p_ttl_seconds!==null&&(!Number.isSafeInteger(p_ttl_seconds)||Number(p_ttl_seconds)<60||Number(p_ttl_seconds)>604800))throw fail();
   params={p_request,p_company,p_kind,p_token,p_ttl_seconds:p_ttl_seconds as number|null};
  }else if(name==='accept_membership_secret_link_v1'){
   if(!exact(p,['p_invite','p_token','p_expected_company','p_kind']))throw fail();
   const{p_invite,p_token,p_expected_company,p_kind}=p;
   if(!uuid(p_invite)||!uuid(p_expected_company)||!kind(p_kind)||typeof p_token!=='string'||!/^[0-9a-f]{64}$/.test(p_token))throw fail();
   params={p_invite,p_token,p_expected_company,p_kind};
  }else if(name==='list_membership_secret_links_v1'){
   if(!exact(p,['p_company','p_kind','p_before_issued','p_before_id']))throw fail();
   const{p_company,p_kind,p_before_issued,p_before_id}=p;
   if(!uuid(p_company)||!kind(p_kind)||(p_before_issued===null)!==(p_before_id===null))throw fail();
   if(p_before_issued!==null){validateMembershipLinkTimestamp(p_before_issued);if(!uuid(p_before_id))throw fail();}
   params={p_company,p_kind,p_before_issued:p_before_issued as string|null,p_before_id:p_before_id as string|null};
  }else if(name==='revoke_membership_secret_link_v1'){
   if(!exact(p,['p_invite','p_company','p_kind']))throw fail();
   const{p_invite,p_company,p_kind}=p;if(!uuid(p_invite)||!uuid(p_company)||!kind(p_kind))throw fail();params={p_invite,p_company,p_kind};
  }else throw fail();
  return Object.freeze({name,params:Object.freeze(params)});
 }catch{throw fail();}
}
