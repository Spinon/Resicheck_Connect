export type StaffInviteCommand=Readonly<
  |{name:'issue_staff_link_invite_v1';params:Readonly<{p_request:string;p_company:string;p_token:string;p_expires:string}>}
  |{name:'accept_staff_link_invite_v1';params:Readonly<{p_invite:string;p_token:string}>}
  |{name:'revoke_staff_link_invite_v1';params:Readonly<{p_invite:string}>}
>;
export type StaffInviteRpc=(command:StaffInviteCommand,signal:AbortSignal)=>Promise<Readonly<{data:unknown;error:null}|{data:null;error:Readonly<{code:string}>}>>;
export type StaffInviteIssueInput=Readonly<{requestId:string;companyId:string;token:string;expiresAt:string}>;
export type StaffInviteReceipt=Readonly<{inviteId:string;companyId:string;expiresAt:string;state:'ready'|'consumed'|'revoked'|'expired'}>;
export type StaffInviteAcceptance=Readonly<{inviteId:string;companyId:string;staffState:'active'}>;
export type StaffInviteResult<T>=Readonly<{ok:true;value:T}|{ok:false;code:'INVALID_INPUT'|'UNAVAILABLE'|'UNCERTAIN'}>;
const failure=(code:'INVALID_INPUT'|'UNAVAILABLE'|'UNCERTAIN')=>Object.freeze({ok:false as const,code});
const unavailable=()=>new Error('Invitation unavailable');
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const token256=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const exactKeys=(value:Record<string,unknown>,keys:readonly string[])=>{const actual=Reflect.ownKeys(value);return actual.length===keys.length&&actual.every(key=>typeof key==='string'&&keys.includes(key));};
function canonicalExpiry(value:unknown):string{
  // PostgreSQL JSON may omit fractional zeros and render UTC as +00:00.
  // Restrict to UTC millisecond precision instead of silently losing micros.
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|\+00:00)$/.test(value))throw unavailable();
  const stamp=Date.parse(value);if(!Number.isFinite(stamp))throw unavailable();
  const canonical=new Date(stamp).toISOString();
  const normalized=value.replace(/\+00:00$/,'Z').replace(/(?:\.(\d{1,3}))?Z$/,(_,fraction:string|undefined)=>'.'+(fraction??'').padEnd(3,'0')+'Z');
  if(canonical!==normalized)throw unavailable();return canonical;
}
function receipt(raw:unknown,inviteId:string,companyId:string,expectedExpiry?:string):StaffInviteReceipt{
  if(!record(raw)||!exactKeys(raw,['invitation_id','company_id','expires_at','protocol','state']))throw unavailable();
  const {invitation_id,company_id,expires_at,protocol,state}=raw;
  const expiresAt=canonicalExpiry(expires_at);
  if(invitation_id!==inviteId||company_id!==companyId||protocol!=='staff-link-v1'
    ||!['ready','consumed','revoked','expired'].includes(state as string)||typeof state!=='string'
    ||expectedExpiry!==undefined&&expiresAt!==expectedExpiry)throw unavailable();
  return Object.freeze({inviteId,companyId,expiresAt,state:state as StaffInviteReceipt['state']});
}

// Local adapter only. rpc must already be bound to this verified user/session;
// current must fail when that lease expires, refreshes or changes. No authority
// selectors are sent. These writes never retry automatically or persist tokens.
export function createStaffInviteRpcAdapter(options:Readonly<{userId:string;sessionKey:string;rpc:StaffInviteRpc;current:()=>boolean}>){
  let rpc:StaffInviteRpc,current:()=>boolean;
  try{
    const {userId,sessionKey,rpc:port,current:isCurrent}=options;
    if(!uuid(userId)||typeof sessionKey!=='string'||!sessionKey.trim()||sessionKey.length>200||/[\u0000-\u001f\u007f]/.test(sessionKey)
      ||typeof port!=='function'||typeof isCurrent!=='function')throw unavailable();
    rpc=port;current=isCurrent;
  }catch{throw unavailable();}
  let closed=false;const jobs=new Set<()=>void>();
  const active=()=>{try{if(closed)return false;const valid=current();return !closed&&valid===true;}catch{return false;}};
  async function dispatch<T>(command:StaffInviteCommand,decode:(data:unknown)=>T,signal?:AbortSignal):Promise<StaffInviteResult<T>>{
    if(!active()||signal?.aborted||jobs.size>=4)return failure('UNAVAILABLE');
    const ac=new AbortController();let dispatched=false,interrupted=false,resolve!:(value:StaffInviteResult<T>)=>void;
    const interruption=new Promise<StaffInviteResult<T>>(r=>{resolve=r;});
    const stop=()=>{if(interrupted)return;interrupted=true;ac.abort();resolve(failure(dispatched?'UNCERTAIN':'UNAVAILABLE'));};
    jobs.add(stop);signal?.addEventListener('abort',stop,{once:true});
    const work=Promise.resolve().then(async():Promise<StaffInviteResult<T>>=>{
      if(!active()||interrupted||signal?.aborted)return failure('UNAVAILABLE');
      dispatched=true;
      try{
        const reply=await rpc(command,ac.signal);
        if(!active()||interrupted)return failure('UNCERTAIN');
        if(!record(reply))return failure('UNCERTAIN');
        const {data,error}=reply;
        if(error!==null)return failure('UNCERTAIN');
        const value=decode(data);
        if(!active()||interrupted)return failure('UNCERTAIN');
        return Object.freeze({ok:true,value});
      }catch{return failure('UNCERTAIN');}
    }).finally(()=>{jobs.delete(stop);try{signal?.removeEventListener('abort',stop);}catch{/* Never expose caller diagnostics. */}});
    // Aborting does not free a slot while a non-cooperative port remains live.
    return Promise.race([work,interruption]);
  }
  return Object.freeze({
    async issue(input:StaffInviteIssueInput,signal?:AbortSignal):Promise<StaffInviteResult<StaffInviteReceipt>>{
      try{
        const {requestId,companyId,token,expiresAt}=input;
        if(!uuid(requestId)||!uuid(companyId)||!token256(token)||canonicalExpiry(expiresAt)!==expiresAt)return failure('INVALID_INPUT');
        const command=Object.freeze({name:'issue_staff_link_invite_v1' as const,params:Object.freeze({p_request:requestId,p_company:companyId,p_token:token,p_expires:expiresAt})});
        return dispatch(command,data=>receipt(data,requestId,companyId,expiresAt),signal);
      }catch{return failure('INVALID_INPUT');}
    },
    async accept(inviteId:string,token:string,signal?:AbortSignal):Promise<StaffInviteResult<StaffInviteAcceptance>>{
      if(!uuid(inviteId)||!token256(token))return failure('INVALID_INPUT');
      return dispatch(Object.freeze({name:'accept_staff_link_invite_v1',params:Object.freeze({p_invite:inviteId,p_token:token})}),raw=>{
        if(!record(raw)||!exactKeys(raw,['invitation_id','company_id','staff_state','protocol']))throw unavailable();
        const {invitation_id,company_id,staff_state,protocol}=raw;
        if(invitation_id!==inviteId||!uuid(company_id)||staff_state!=='active'||protocol!=='staff-link-v1')throw unavailable();
        return Object.freeze({inviteId,companyId:company_id,staffState:'active' as const});
      },signal);
    },
    async revoke(input:Readonly<{inviteId:string;companyId:string}>,signal?:AbortSignal):Promise<StaffInviteResult<StaffInviteReceipt>>{
      try{
        const {inviteId,companyId}=input;if(!uuid(inviteId)||!uuid(companyId))return failure('INVALID_INPUT');
        return dispatch(Object.freeze({name:'revoke_staff_link_invite_v1',params:Object.freeze({p_invite:inviteId})}),data=>{
          const value=receipt(data,inviteId,companyId);if(value.state!=='revoked')throw unavailable();return value;
        },signal);
      }catch{return failure('INVALID_INPUT');}
    },
    close(){if(closed)return;closed=true;for(const stop of [...jobs])stop();},
  });
}
