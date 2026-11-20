export type MessageImportanceCommand=Readonly<
  |{name:'read_message_importance_v1';params:Readonly<{p_company:string;p_conversation:string;p_message:string}>}
  |{name:'set_message_importance_v1';params:Readonly<{p_company:string;p_conversation:string;p_message:string;p_operation:string;p_expected_revision:number;p_important:boolean}>}
>;
export type MessageImportanceRpc=(command:MessageImportanceCommand,signal:AbortSignal)=>Promise<Readonly<{data:unknown;error:null}|{data:null;error:Readonly<{code:string}>}>>;
export type MessageImportanceState=Readonly<{companyId:string;conversationId:string;messageId:string;important:boolean;revision:number}>;
// An idempotent operation receipt can describe an OLD revision after another
// employee writes. It must never replace the currently displayed read state.
export type MessageImportanceReceipt=Readonly<MessageImportanceState&{operationId:string;requiresRead:true}>;
export type MessageImportanceIntent=Readonly<{operationId:string;expectedRevision:number;important:boolean}>;
export type MessageImportanceResult<T>=Readonly<{ok:true;value:T}|{ok:false;code:'INVALID_INPUT'|'UNAVAILABLE'|'UNCERTAIN'|'CONFLICT'}>;
const failure=(code:'INVALID_INPUT'|'UNAVAILABLE'|'UNCERTAIN'|'CONFLICT')=>Object.freeze({ok:false as const,code});
const unavailable=()=>new Error('Message action unavailable');
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const revision=(v:unknown):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<=2147483647;
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
function exactKeys(v:Record<string,unknown>,keys:readonly string[]){const actual=Reflect.ownKeys(v);return actual.length===keys.length&&actual.every(k=>typeof k==='string'&&keys.includes(k));}

// rpc must already be bound to this verified account/session. current must
// invalidate on account/session/company/conversation loss; the backend remains
// responsible for staff authorization, message binding and the atomic CAS.
export function createMessageImportanceAdapter(options:Readonly<{userId:string;sessionKey:string;companyId:string;conversationId:string;messageId:string;rpc:MessageImportanceRpc;current:()=>boolean}>){
  let companyId:string,conversationId:string,messageId:string,rpc:MessageImportanceRpc,current:()=>boolean;
  try{
    const {userId,sessionKey,companyId:co,conversationId:conversation,messageId:message,rpc:port,current:isCurrent}=options;
    if(!uuid(userId)||!uuid(co)||!uuid(conversation)||!uuid(message)||typeof sessionKey!=='string'||!sessionKey.trim()||sessionKey.length>200
      ||/[\u0000-\u001f\u007f]/.test(sessionKey)||typeof port!=='function'||typeof isCurrent!=='function')throw unavailable();
    companyId=co;conversationId=conversation;messageId=message;rpc=port;current=isCurrent;
  }catch{throw unavailable();}
  type Intent={expectedRevision:number;important:boolean;inFlight:number;uncertain:boolean;confirmed:boolean};
  let closed=false;const jobs=new Set<()=>void>(),intents=new Map<string,Intent>();
  const active=()=>{try{if(closed)return false;const valid=current();return !closed&&valid===true;}catch{return false;}};
  const resource=Object.freeze({p_company:companyId,p_conversation:conversationId,p_message:messageId});
  function decode(raw:unknown,operationId?:string):MessageImportanceState|MessageImportanceReceipt{
    const keys=['company_id','conversation_id','message_id','important','revision',...(operationId===undefined?[]:['operation_id'])];
    if(!record(raw)||!exactKeys(raw,keys))throw unavailable();
    const {company_id,conversation_id,message_id,important,revision:rev}=raw;
    const operation=operationId===undefined?undefined:raw.operation_id;
    if(company_id!==companyId||conversation_id!==conversationId||message_id!==messageId||typeof important!=='boolean'||!revision(rev)
      ||operationId!==undefined&&operation!==operationId)throw unavailable();
    const state={companyId,conversationId,messageId,important,revision:rev};
    return Object.freeze(operationId===undefined?state:{...state,operationId,requiresRead:true as const});
  }
  async function dispatch<T>(command:MessageImportanceCommand,write:boolean,decodeValue:(raw:unknown)=>T,signal?:AbortSignal):Promise<MessageImportanceResult<T>>{
    if(!active()||signal?.aborted||jobs.size>=4)return failure('UNAVAILABLE');
    const ac=new AbortController();let dispatched=false,interrupted=false,resolve!:(v:MessageImportanceResult<T>)=>void;
    const failed=()=>failure(write&&dispatched?'UNCERTAIN':'UNAVAILABLE');
    const interruption=new Promise<MessageImportanceResult<T>>(r=>{resolve=r;});
    const stop=()=>{if(interrupted)return;interrupted=true;ac.abort();resolve(failed());};
    jobs.add(stop);signal?.addEventListener('abort',stop,{once:true});
    const work=Promise.resolve().then(async():Promise<MessageImportanceResult<T>>=>{
      if(!active()||interrupted||signal?.aborted)return failure('UNAVAILABLE');dispatched=true;
      try{
        const reply=await rpc(command,ac.signal);if(!active()||interrupted||!record(reply)||!exactKeys(reply,['data','error']))return failed();
        const {data,error}=reply;
        if(error!==null){
          // Only a sanitized, bound RPC refusal after server authorization may
          // report a definite CAS conflict. Never parse text/private diagnostics.
          if(write&&data===null&&record(error)&&exactKeys(error,['code'])){
            const {code}=error;if(code==='40001'&&active()&&!interrupted)return failure('CONFLICT');
          }
          return failed();
        }
        const value=decodeValue(data);if(!active()||interrupted)return failed();return Object.freeze({ok:true,value});
      }catch{return failed();}
    }).finally(()=>{jobs.delete(stop);try{signal?.removeEventListener('abort',stop);}catch{/* No diagnostic propagation. */}});
    return Promise.race([work,interruption]);
  }
  return Object.freeze({
    read(signal?:AbortSignal):Promise<MessageImportanceResult<MessageImportanceState>>{
      return dispatch(Object.freeze({name:'read_message_importance_v1',params:resource}),false,raw=>decode(raw) as MessageImportanceState,signal);
    },
    async set(input:MessageImportanceIntent,signal?:AbortSignal):Promise<MessageImportanceResult<MessageImportanceReceipt>>{
      try{
        const {operationId,expectedRevision,important}=input;
        if(!uuid(operationId)||!revision(expectedRevision)||typeof important!=='boolean')return failure('INVALID_INPUT');
        if(!active()||signal?.aborted)return failure('UNAVAILABLE');
        let intent=intents.get(operationId);
        if(intent&&(intent.expectedRevision!==expectedRevision||intent.important!==important))return failure('INVALID_INPUT');
        // Retain only live/uncertain intentions, not all confirmed history. The
        // backend owns durable idempotency; an old uncertain ID is never evicted
        // and silently reused for a different/rebased payload.
        if(!intent){if(intents.size>=128)return failure('UNAVAILABLE');intent={expectedRevision,important,inFlight:0,uncertain:false,confirmed:false};intents.set(operationId,intent);}
        intent.inFlight++;
        const result=await dispatch(Object.freeze({name:'set_message_importance_v1',params:Object.freeze({...resource,p_operation:operationId,p_expected_revision:expectedRevision,p_important:important})}),true,raw=>{
          const value=decode(raw,operationId) as MessageImportanceReceipt;
          // A matching desired state confirms the original operation only; its
          // revision is intentionally not treated as the current server state.
          if(value.important!==important||(value.revision!==expectedRevision&&value.revision!==expectedRevision+1))throw unavailable();return value;
        },signal);
        intent.inFlight--;
        if(result.ok){intent.confirmed=true;intent.uncertain=false;}
        else if(result.code==='CONFLICT')intent.uncertain=false;
        else if(result.code==='UNCERTAIN'&&!intent.confirmed)intent.uncertain=true;
        if(intent.inFlight===0&&(!intent.uncertain||intent.confirmed))intents.delete(operationId);
        return result;
      }catch{return failure('INVALID_INPUT');}
    },
    close(){if(closed)return;closed=true;intents.clear();for(const stop of [...jobs])stop();},
  });
}
