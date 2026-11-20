export type StaffInviteReviewCommand=Readonly<
  |{name:'preview_staff_link_invite_v1';params:Readonly<{p_invite:string;p_token:string}>}
  |{name:'accept_staff_link_invite_v2';params:Readonly<{p_invite:string;p_token:string;p_expected_company:string}>}
>;
export type StaffInviteReviewRpc=(command:StaffInviteReviewCommand,signal:AbortSignal)=>Promise<Readonly<{data:unknown;error:null}|{data:null;error:Readonly<{code:string}>}>>;
export type StaffInvitePreview=Readonly<{inviteId:string;companyId:string;companyName:string;expiresAt:string;recipientPolicy:'first-active-bearer-local-proposal'}>;
export type StaffInviteReviewedAcceptance=Readonly<{inviteId:string;companyId:string;staffState:'active'}>;
export type StaffInviteReviewResult<T>=Readonly<{ok:true;value:T}|{ok:false;code:'INVALID_INPUT'|'UNAVAILABLE'|'UNCERTAIN'}>;
const failure=(code:'INVALID_INPUT'|'UNAVAILABLE'|'UNCERTAIN')=>Object.freeze({ok:false as const,code});
const unavailable=()=>new Error('Invitation unavailable');
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const token256=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
function exactKeys(v:Record<string,unknown>,keys:readonly string[]){const actual=Reflect.ownKeys(v);return actual.length===keys.length&&actual.every(k=>typeof k==='string'&&keys.includes(k));}
function companyName(v:unknown):v is string{
  if(typeof v!=='string'||!v.trim()||[...v].length>160||/[\u0000-\u001f\u007f]/.test(v))return false;
  for(let i=0;i<v.length;i++){const c=v.charCodeAt(i);if(c>=0xd800&&c<=0xdbff){const next=v.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))return false;}else if(c>=0xdc00&&c<=0xdfff)return false;}
  return true;
}
function expiry(v:unknown):string{
  if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(v))throw unavailable();
  const stamp=Date.parse(v);if(!Number.isFinite(stamp))throw unavailable();const canonical=new Date(stamp).toISOString();
  // PostgreSQL may emit microseconds. Floor to milliseconds for display/expiry
  // checks, never rounding upward and extending an invitation's validity.
  const normalized=v.replace(/\+00:00$/,'Z').replace(/(?:\.(\d{1,6}))?Z$/,(_,fraction:string|undefined)=>'.'+(fraction??'').padEnd(3,'0').slice(0,3)+'Z');
  if(canonical!==normalized)throw unavailable();return canonical;
}

// Candidate client only. Preview is informational, never an access grant. The
// bound RPC must enforce auth and expected company atomically before mutation.
// No automatic retry, token store, logger, sharing or legacy v1 accept fallback.
export function createStaffInviteReviewRpcAdapter(options:Readonly<{userId:string;sessionKey:string;rpc:StaffInviteReviewRpc;current:()=>boolean}>){
  let rpc:StaffInviteReviewRpc,current:()=>boolean;
  try{
    const {userId,sessionKey,rpc:port,current:isCurrent}=options;
    if(!uuid(userId)||typeof sessionKey!=='string'||!sessionKey.trim()||sessionKey.length>200||/[\u0000-\u001f\u007f]/.test(sessionKey)
      ||typeof port!=='function'||typeof isCurrent!=='function')throw unavailable();
    rpc=port;current=isCurrent;
  }catch{throw unavailable();}
  let closed=false;const jobs=new Set<()=>void>();
  const active=()=>{try{if(closed)return false;const valid=current();return !closed&&valid===true;}catch{return false;}};
  async function dispatch<T>(command:StaffInviteReviewCommand,write:boolean,decode:(raw:unknown)=>T,signal?:AbortSignal):Promise<StaffInviteReviewResult<T>>{
    if(!active()||signal?.aborted||jobs.size>=4)return failure('UNAVAILABLE');
    const ac=new AbortController();let dispatched=false,interrupted=false,resolve!:(value:StaffInviteReviewResult<T>)=>void;
    const failed=()=>failure(write&&dispatched?'UNCERTAIN':'UNAVAILABLE');
    const interruption=new Promise<StaffInviteReviewResult<T>>(r=>{resolve=r;});
    const stop=()=>{if(interrupted)return;interrupted=true;ac.abort();resolve(failed());};
    jobs.add(stop);signal?.addEventListener('abort',stop,{once:true});
    const work=Promise.resolve().then(async():Promise<StaffInviteReviewResult<T>>=>{
      if(!active()||interrupted||signal?.aborted)return failure('UNAVAILABLE');dispatched=true;
      try{
        const reply=await rpc(command,ac.signal);if(!active()||interrupted||!record(reply))return failed();
        const {data,error}=reply;if(error!==null)return failed();const value=decode(data);
        if(!active()||interrupted)return failed();return Object.freeze({ok:true,value});
      }catch{return failed();}
    }).finally(()=>{jobs.delete(stop);try{signal?.removeEventListener('abort',stop);}catch{/* Safe public failures only. */}});
    // Retain the bounded admission slot until even an aborted port settles.
    return Promise.race([work,interruption]);
  }
  return Object.freeze({
    async preview(inviteId:string,token:string,signal?:AbortSignal):Promise<StaffInviteReviewResult<StaffInvitePreview>>{
      if(!uuid(inviteId)||!token256(token))return failure('INVALID_INPUT');
      return dispatch(Object.freeze({name:'preview_staff_link_invite_v1',params:Object.freeze({p_invite:inviteId,p_token:token})}),false,raw=>{
        if(!record(raw)||!exactKeys(raw,['invitation_id','company_id','company_name','expires_at','recipient_policy','protocol']))throw unavailable();
        const {invitation_id,company_id,company_name,expires_at,recipient_policy,protocol}=raw;
        if(invitation_id!==inviteId||!uuid(company_id)||!companyName(company_name)||recipient_policy!=='first-active-bearer-local-proposal'||protocol!=='staff-link-v2')throw unavailable();
        return Object.freeze({inviteId,companyId:company_id,companyName:company_name,expiresAt:expiry(expires_at),recipientPolicy:recipient_policy});
      },signal);
    },
    async accept(inviteId:string,token:string,expectedCompanyId:string,signal?:AbortSignal):Promise<StaffInviteReviewResult<StaffInviteReviewedAcceptance>>{
      if(!uuid(inviteId)||!token256(token)||!uuid(expectedCompanyId))return failure('INVALID_INPUT');
      return dispatch(Object.freeze({name:'accept_staff_link_invite_v2',params:Object.freeze({p_invite:inviteId,p_token:token,p_expected_company:expectedCompanyId})}),true,raw=>{
        if(!record(raw)||!exactKeys(raw,['invitation_id','company_id','staff_state','protocol']))throw unavailable();
        const {invitation_id,company_id,staff_state,protocol}=raw;
        if(invitation_id!==inviteId||company_id!==expectedCompanyId||staff_state!=='active'||protocol!=='staff-link-v2')throw unavailable();
        return Object.freeze({inviteId,companyId:expectedCompanyId,staffState:'active' as const});
      },signal);
    },
    close(){if(closed)return;closed=true;for(const stop of [...jobs])stop();},
  });
}
