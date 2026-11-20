import{membershipLinkCommand,validateMembershipLinkTimestamp,type MembershipLinkContext,type MembershipLinkKind,type MembershipLinkRpc,type MembershipLinkReceipt}from'./membership-secret-link.ts';
export type MembershipLinkCursor=Readonly<{issuedAt:string;inviteId:string}>;
export type IssuedMembershipLink=MembershipLinkReceipt&Readonly<{issuedAt:string;canRevoke:boolean}>;
export type IssuedMembershipLinkPage=Readonly<{companyId:string;kind:MembershipLinkKind;items:readonly IssuedMembershipLink[];hasMore:boolean;nextCursor:MembershipLinkCursor|null}>;
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const rec=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,keys:readonly string[])=>{const k=Reflect.ownKeys(v);return k.length===keys.length&&k.every(x=>typeof x==='string'&&keys.includes(x));};
const fail=()=>Error('Invitations unavailable');
const micros=(v:string)=>BigInt(Date.parse(v))*1000n+BigInt((v.match(/\.(\d{1,6})/)?.[1]??'').padEnd(6,'0').slice(3));
const before=(a:MembershipLinkCursor,b:MembershipLinkCursor)=>micros(a.issuedAt)<micros(b.issuedAt)||micros(a.issuedAt)===micros(b.issuedAt)&&a.inviteId<b.inviteId;
function cursor(v:unknown):MembershipLinkCursor{
 if(!rec(v)||!exact(v,['issuedAt','inviteId'])||!uuid(v.inviteId))throw fail();
 return Object.freeze({inviteId:v.inviteId,issuedAt:validateMembershipLinkTimestamp(v.issuedAt)});
}
function page(v:unknown,companyId:string,kind:MembershipLinkKind,after:MembershipLinkCursor|null):IssuedMembershipLinkPage{
 if(!rec(v)||!exact(v,['companyId','kind','items','hasMore','nextCursor'])||v.companyId!==companyId||v.kind!==kind||!Array.isArray(v.items)||v.items.length>25||typeof v.hasMore!=='boolean')throw fail();
 const ids=new Set<string>();let previous=after;
 const items=v.items.map(raw=>{
  if(!rec(raw)||!exact(raw,['inviteId','companyId','kind','issuedAt','expiresAt','state','canRevoke'])||!uuid(raw.inviteId)||ids.has(raw.inviteId)||raw.companyId!==companyId||raw.kind!==kind||!['ready','consumed','revoked','expired'].includes(String(raw.state))||typeof raw.canRevoke!=='boolean'||raw.canRevoke!==(raw.state!=='revoked'))throw fail();
  const point=cursor({inviteId:raw.inviteId,issuedAt:raw.issuedAt});
  if(previous&&!before(point,previous))throw fail();previous=point;ids.add(point.inviteId);
  return Object.freeze({...point,companyId,kind,expiresAt:validateMembershipLinkTimestamp(raw.expiresAt),state:raw.state as IssuedMembershipLink['state'],canRevoke:raw.canRevoke});
 });
 const next=v.hasMore?cursor(v.nextCursor):null,last=items.at(-1);
 if(v.hasMore&&(items.length!==25||!last||next!.inviteId!==last.inviteId||micros(next!.issuedAt)!==micros(last.issuedAt))||!v.hasMore&&v.nextCursor!==null)throw fail();
 return Object.freeze({companyId,kind,items:Object.freeze(items),hasMore:v.hasMore,nextCursor:next});
}
/** Metadata only. Reopening creates a fresh lease-bound reader, never reloads a bearer secret. */
export function createMembershipLinkManagement(input:Readonly<{context:MembershipLinkContext;currentContext:()=>MembershipLinkContext|null;rpc:MembershipLinkRpc}>){
 const {context,currentContext,rpc}=input,owner=Object.freeze({...context});let closed=false,busy=false,ac:AbortController|null=null;
 const active=()=>{try{if(!closed&&currentContext()===context&&context.userId===owner.userId&&context.companyId===owner.companyId&&context.sessionKey===owner.sessionKey)return true;}catch{}closed=true;ac?.abort();return false;};
 async function call(raw:unknown){
  if(!active()||busy)return null;let command;try{command=membershipLinkCommand(raw);}catch{return null;}
  busy=true;const job=new AbortController();ac=job;
  try{const reply=await rpc(command,job.signal);return active()&&!job.signal.aborted&&reply.error===null?reply.data:null;}
  catch{return null;}finally{busy=false;if(ac===job)ac=null;job.abort();}
 }
 return Object.freeze({
  async list(kind:MembershipLinkKind,after:MembershipLinkCursor|null=null):Promise<IssuedMembershipLinkPage|null>{
   let captured:MembershipLinkCursor|null;try{captured=after===null?null:cursor(after);}catch{return null;}
   const raw=await call({name:'list_membership_secret_links_v1',params:{p_company:owner.companyId,p_kind:kind,p_before_issued:captured?.issuedAt??null,p_before_id:captured?.inviteId??null}});
   try{return active()?page(raw,owner.companyId,kind,captured):null;}catch{return null;}
  },
  async revokeKnown(inviteId:string,kind:MembershipLinkKind):Promise<MembershipLinkReceipt|null>{
   const raw=await call({name:'revoke_membership_secret_link_v1',params:{p_invite:inviteId,p_company:owner.companyId,p_kind:kind}});
   try{
    if(!active()||!rec(raw)||!exact(raw,['inviteId','companyId','kind','expiresAt','state'])||raw.inviteId!==inviteId||raw.companyId!==owner.companyId||raw.kind!==kind||raw.state!=='revoked')return null;
    return Object.freeze({inviteId,companyId:owner.companyId,kind,expiresAt:validateMembershipLinkTimestamp(raw.expiresAt),state:'revoked'});
   }catch{return null;}
  },
  close(){closed=true;ac?.abort();},
 });
}
