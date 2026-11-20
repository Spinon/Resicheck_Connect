export type ImportanceScope=Readonly<{userId:string;sessionKey:string;companyId:string;conversationId:string;role:'staff'|'patient'|'manager'|'platform-admin'}>;
type State=Readonly<{important:boolean;revision:number}>;
type Intent=Readonly<{operationId:string;expectedRevision:number;important:boolean}>;
type Port={read:(signal?:AbortSignal)=>Promise<Readonly<{ok:true;value:State}|{ok:false;code:string}>>;set:(intent:Intent,signal?:AbortSignal)=>Promise<Readonly<{ok:true;value:State&{operationId:string;requiresRead:true}}|{ok:false;code:string}>>;close:()=>void};
type View=Readonly<{stage:'hidden'|'loading'|'ready'|'uncertain'|'reload-required'|'paused'|'unavailable';important:boolean|null;revision:number|null;busy:boolean;notice:'conflict'|'uncertain'|'unavailable'|null}>;
// Staff capability is context-specific UI gating only. Backend remains authority.
// Never turn an operation receipt into current state; every ACK requires a read.
export function createMessageImportanceHost(deps:{scope:ImportanceScope;current:()=>ImportanceScope|null;port:Port;createId:()=>string}){
 const {scope,current,port,createId}=deps;let disposed=false,epoch=0,job:AbortController|null=null,intent:Intent|null=null,floor=-1;
 let view:View=Object.freeze({stage:scope.role==='staff'?'loading':'hidden',important:null,revision:null,busy:false,notice:null});const listeners=new Set<()=>void>();
 function live(){try{return !disposed&&scope.role==='staff'&&current()===scope;}catch{return false;}}
 function publish(patch:Partial<View>,notify=true){view=Object.freeze({...view,...patch});if(notify)for(const f of [...listeners])try{f();}catch{}}
 function reset(stage:View['stage'],notify=true){epoch++;job?.abort();job=null;intent=null;floor=-1;publish({stage,important:null,revision:null,busy:false,notice:null},notify);}
 const matches=(e:number,task:AbortController)=>!disposed&&epoch===e&&job===task&&!task.signal.aborted;
 function begin(){if(job||!live()){if(!job&&!live())reset(scope.role==='staff'?'paused':'hidden');return null;}const task=new AbortController();job=task;publish({busy:true,stage:'loading',notice:null});return task;}
 function finish(task:AbortController){if(job===task){job=null;publish({busy:false});}}
 async function readState(task:AbortController,e:number,notice:View['notice']=null){try{const r=await port.read(task.signal);if(!matches(e,task))return false;if(!live()){reset('paused');return false;}
  if(!r.ok)throw Error();const {important,revision}=r.value;if(typeof important!=='boolean'||!Number.isInteger(revision)||revision<0||revision>2147483647||revision<floor)throw Error();floor=revision;
  publish({stage:intent?'uncertain':'ready',important,revision,notice:intent?'uncertain':notice});return true;
 }catch{if(matches(e,task)){if(!live())reset('paused');else publish({stage:intent?'uncertain':'reload-required',important:null,revision:null,notice:intent?'uncertain':'unavailable'});}return false;}}
 async function refresh(){const task=begin();if(!task)return false;const e=epoch;try{return await readState(task,e);}finally{finish(task);}}
 async function submit(){const selected=intent;if(!selected)return false;const task=begin();if(!task)return false;const e=epoch;try{let r:Awaited<ReturnType<Port['set']>>;try{r=await port.set(selected,task.signal);}catch{r={ok:false,code:'UNCERTAIN'};}
  if(!matches(e,task))return false;if(!live()){reset('paused');return false;}
  if(r.ok){if(r.value.operationId!==selected.operationId||r.value.requiresRead!==true||r.value.important!==selected.important||!Number.isInteger(r.value.revision)||r.value.revision<selected.expectedRevision||r.value.revision>2147483647){publish({stage:'uncertain',notice:'uncertain'});await readState(task,e);return false;}floor=Math.max(floor,r.value.revision);intent=null;return await readState(task,e);}
  if(r.code==='CONFLICT'){intent=null;await readState(task,e,'conflict');return false;}
  if(r.code==='UNCERTAIN'){publish({stage:'uncertain',notice:'uncertain'});await readState(task,e);return false;}
  intent=null;publish({stage:'unavailable',important:null,revision:null,notice:'unavailable'});return false;
 }finally{finish(task);}}
 return Object.freeze({snapshot:()=>{if(!disposed&&scope.role==='staff'&&!live()&&view.stage!=='paused')reset('paused',false);return view;},subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};},refresh,
  set:async(important:boolean)=>{if(job||intent||view.stage!=='ready'||view.important===null||view.revision===null||typeof important!=='boolean'||!live())return false;if(view.important===important)return true;let operationId:string;try{operationId=createId();if(typeof operationId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(operationId))throw Error();}catch{publish({notice:'unavailable'});return false;}intent=Object.freeze({operationId,expectedRevision:view.revision,important});return submit();},
  retry:()=>intent&&view.stage==='uncertain'?submit():Promise.resolve(false),
  suspend:()=>{reset('paused');try{port.close();}catch{};},dispose:()=>{if(disposed)return;reset('paused');disposed=true;try{port.close();}catch{}listeners.clear();},
 });
}
