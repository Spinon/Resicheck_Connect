export type NotificationPrivacy=1|2|3|4;
export type NotificationFilter=null|'all'|'important';
export type NotificationPreferencesCommand=Readonly<
  |{name:'get_notification_preferences_v1';params:Readonly<{p_installation:string}>}
  |{name:'set_notification_preferences_v1';params:Readonly<{p_installation:string;p_operation:string;p_expected_revision:number;p_privacy:NotificationPrivacy;p_filter:NotificationFilter}>}
>;
export type NotificationPreferencesRpc=(command:NotificationPreferencesCommand,signal:AbortSignal)=>Promise<Readonly<{data:unknown;error:null}|{data:null;error:Readonly<{code:string}>}>>;
export type NotificationPreferencesState=Readonly<{installationId:string;privacy:NotificationPrivacy;filter:NotificationFilter;revision:number}>;
export type NotificationPreferencesInput=Readonly<{operationId:string;expectedRevision:number;privacy:NotificationPrivacy;filter:NotificationFilter}>;
// A receipt is confirmation of one original operation, NOT current preferences.
export type NotificationPreferencesReceipt=Readonly<{operationId:string;acceptedRevision:number;requiresLoad:true}>;
export type NotificationPreferencesResult<T>=Readonly<{ok:true;value:T}|{ok:false;code:'INVALID_INPUT'|'UNAVAILABLE'|'UNCERTAIN'|'CONFLICT'}>;
const failure=(code:'INVALID_INPUT'|'UNAVAILABLE'|'UNCERTAIN'|'CONFLICT')=>Object.freeze({ok:false as const,code});
const unavailable=()=>new Error('Notification settings unavailable');
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const revision=(v:unknown):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<=2147483647;
const privacy=(v:unknown):v is NotificationPrivacy=>typeof v==='number'&&Number.isInteger(v)&&v>=1&&v<=4;
const filter=(v:unknown):v is NotificationFilter=>v===null||v==='all'||v==='important';
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
function exactKeys(v:Record<string,unknown>,keys:readonly string[]){const actual=Reflect.ownKeys(v);return actual.length===keys.length&&actual.every(k=>typeof k==='string'&&keys.includes(k));}

// Pure candidate adapter; no network, storage, device registration or OS grant.
// An installation UUID is public routing metadata, not proof of device identity.
// The injected RPC must already be bound to the verified user/session, and
// current must invalidate on lease replacement/expiry. Neither subject is sent.
export function createNotificationPreferencesAdapter(options:Readonly<{userId:string;sessionKey:string;installationId:string;rpc:NotificationPreferencesRpc;current:()=>boolean}>){
  let installationId:string,rpc:NotificationPreferencesRpc,current:()=>boolean;
  try{
    const {userId,sessionKey,installationId:installation,rpc:port,current:isCurrent}=options;
    if(!uuid(userId)||!uuid(installation)||typeof sessionKey!=='string'||!sessionKey.trim()||sessionKey.length>200
      ||/[\u0000-\u001f\u007f]/.test(sessionKey)||typeof port!=='function'||typeof isCurrent!=='function')throw unavailable();
    installationId=installation;rpc=port;current=isCurrent;
  }catch{throw unavailable();}
  type Intent={expectedRevision:number;privacy:NotificationPrivacy;filter:NotificationFilter;inFlight:number;uncertain:boolean;confirmed:boolean};
  let closed=false;const jobs=new Set<()=>void>(),intents=new Map<string,Intent>();
  const active=()=>{try{if(closed)return false;const valid=current();return !closed&&valid===true;}catch{return false;}};
  function decode(raw:unknown,operationId?:string):NotificationPreferencesState{
    const keys=['installation_id','privacy','filter','revision',...(operationId===undefined?[]:['operation_id'])];
    if(!record(raw)||!exactKeys(raw,keys))throw unavailable();
    const {installation_id,privacy:privacyValue,filter:filterValue,revision:rev}=raw;
    const operation=operationId===undefined?undefined:raw.operation_id;
    if(installation_id!==installationId||!privacy(privacyValue)||!filter(filterValue)||!revision(rev)
      ||operationId!==undefined&&operation!==operationId)throw unavailable();
    return Object.freeze({installationId,privacy:privacyValue,filter:filterValue,revision:rev});
  }
  async function dispatch<T>(command:NotificationPreferencesCommand,write:boolean,decodeValue:(raw:unknown)=>T,signal?:AbortSignal):Promise<NotificationPreferencesResult<T>>{
    if(!active()||signal?.aborted||jobs.size>=4)return failure('UNAVAILABLE');
    const ac=new AbortController();let dispatched=false,interrupted=false,resolve!:(value:NotificationPreferencesResult<T>)=>void;
    const failed=()=>failure(write&&dispatched?'UNCERTAIN':'UNAVAILABLE');
    const interruption=new Promise<NotificationPreferencesResult<T>>(r=>{resolve=r;});
    const stop=()=>{if(interrupted)return;interrupted=true;ac.abort();resolve(failed());};
    jobs.add(stop);signal?.addEventListener('abort',stop,{once:true});
    const work=Promise.resolve().then(async():Promise<NotificationPreferencesResult<T>>=>{
      if(!active()||interrupted||signal?.aborted)return failure('UNAVAILABLE');dispatched=true;
      try{
        const reply=await rpc(command,ac.signal);if(!active()||interrupted||!record(reply)||!exactKeys(reply,['data','error']))return failed();
        const {data,error}=reply;
        if(error!==null){
          if(write&&data===null&&record(error)&&exactKeys(error,['code'])){const {code}=error;if(code==='40001'&&active()&&!interrupted)return failure('CONFLICT');}
          return failed();
        }
        const value=decodeValue(data);if(!active()||interrupted)return failed();return Object.freeze({ok:true,value});
      }catch{return failed();}
    }).finally(()=>{jobs.delete(stop);try{signal?.removeEventListener('abort',stop);}catch{/* No diagnostics escape. */}});
    // Aborted non-cooperative RPCs retain their bounded slot until they settle.
    return Promise.race([work,interruption]);
  }
  return Object.freeze({
    load(signal?:AbortSignal):Promise<NotificationPreferencesResult<NotificationPreferencesState>>{
      // Default 1/null/0 is accepted only from a valid reply, never synthesized
      // after failure. A null filter is not notification consent or an OS grant.
      return dispatch(Object.freeze({name:'get_notification_preferences_v1',params:Object.freeze({p_installation:installationId})}),false,raw=>decode(raw),signal);
    },
    async set(input:NotificationPreferencesInput,signal?:AbortSignal):Promise<NotificationPreferencesResult<NotificationPreferencesReceipt>>{
      try{
        const {operationId,expectedRevision,privacy:desiredPrivacy,filter:desiredFilter}=input;
        if(!uuid(operationId)||!revision(expectedRevision)||!privacy(desiredPrivacy)||!filter(desiredFilter))return failure('INVALID_INPUT');
        if(!active()||signal?.aborted)return failure('UNAVAILABLE');
        let intent=intents.get(operationId);
        if(intent&&(intent.expectedRevision!==expectedRevision||intent.privacy!==desiredPrivacy||intent.filter!==desiredFilter))return failure('INVALID_INPUT');
        // Confirmed history is not retained. Preserve only active/uncertain
        // snapshots, so retries cannot silently change/rebase an unknown write.
        if(!intent){if(intents.size>=128)return failure('UNAVAILABLE');intent={expectedRevision,privacy:desiredPrivacy,filter:desiredFilter,inFlight:0,uncertain:false,confirmed:false};intents.set(operationId,intent);}
        intent.inFlight++;
        const command=Object.freeze({name:'set_notification_preferences_v1' as const,params:Object.freeze({p_installation:installationId,p_operation:operationId,p_expected_revision:expectedRevision,p_privacy:desiredPrivacy,p_filter:desiredFilter})});
        const result=await dispatch(command,true,raw=>{
          const value=decode(raw,operationId);
          if(value.privacy!==desiredPrivacy||value.filter!==desiredFilter||(value.revision!==expectedRevision&&value.revision!==expectedRevision+1))throw unavailable();
          return Object.freeze({operationId,acceptedRevision:value.revision,requiresLoad:true as const});
        },signal);
        intent.inFlight--;
        if(result.ok){intent.confirmed=true;intent.uncertain=false;}else if(result.code==='CONFLICT')intent.uncertain=false;else if(result.code==='UNCERTAIN'&&!intent.confirmed)intent.uncertain=true;
        if(intent.inFlight===0&&(!intent.uncertain||intent.confirmed))intents.delete(operationId);
        return result;
      }catch{return failure('INVALID_INPUT');}
    },
    close(){if(closed)return;closed=true;intents.clear();for(const stop of [...jobs])stop();},
  });
}
