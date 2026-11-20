import {isInstallationUuidV4,type NativeInstallationIdentityResult} from './native-installation-identity.ts';
export type InstallationStartupIdentity=Readonly<{read:()=>Promise<NativeInstallationIdentityResult>;close:()=>void}>;
export type InstallationStartupViewState=Readonly<{stage:'loading'|'waiting'|'ready'|'unavailable'|'closed';pending:boolean;canRetry:boolean}>;
export type InstallationStartupController<R>=Readonly<{snapshot:()=>InstallationStartupViewState;subscribe:(listener:()=>void)=>()=>void;retry:()=>Promise<boolean>;currentRuntime:()=>R|null;close:()=>void}>;

// The identity factory must bind the approved project to the strict native shim.
// Timeout limits presentation waiting ONLY: it neither cancels native I/O nor
// creates/replaces an installation writer. Late success requires explicit retry.
export function createInstallationStartupController<R>(options:Readonly<{projectRef:string;createIdentity:(projectRef:string)=>InstallationStartupIdentity;createRuntime:(installationId:string)=>R;disposeRuntime:(runtime:R)=>void|Promise<void>;schedule?:(fn:()=>void,ms:number)=>()=>void;timeoutMs?:number}>):InstallationStartupController<R>{
  let projectRef='',createIdentity:typeof options.createIdentity,createRuntime:typeof options.createRuntime,disposeRuntime:typeof options.disposeRuntime,schedule:NonNullable<typeof options.schedule>,timeoutMs=8000,configValid=false;
  try{
    ({projectRef,createIdentity,createRuntime,disposeRuntime,schedule=(fn:()=>void,ms:number)=>{const timer=setTimeout(fn,ms);return()=>clearTimeout(timer);},timeoutMs=8000}=options);
    configValid=typeof projectRef==='string'&&/^[a-z]{20}$/.test(projectRef)&&typeof createIdentity==='function'&&typeof createRuntime==='function'&&typeof disposeRuntime==='function'&&typeof schedule==='function'&&Number.isInteger(timeoutMs)&&timeoutMs>=1&&timeoutMs<=60000;
  }catch{/* Render generic failure instead of throwing while mounting startup. */}
  let closed=false,generation=0,identity:InstallationStartupIdentity|null=null;
  type RuntimeOwner={value:R;disposed:boolean};let runtime:RuntimeOwner|null=null;
  type Attempt={generation:number;timedOut:boolean;resolved:boolean;promise:Promise<boolean>;resolve:(ready:boolean)=>void;cancel:()=>void};
  let active:Attempt|null=null;
  let view:InstallationStartupViewState=Object.freeze({stage:'loading',pending:true,canRetry:false});const listeners=new Set<()=>void>();
  function publish(stage:InstallationStartupViewState['stage'],pending:boolean){if(closed)return;view=Object.freeze({stage,pending,canRetry:stage==='unavailable'&&!pending});for(const f of [...listeners])try{f();}catch{}}
  function settle(attempt:Attempt,result:boolean){if(attempt.resolved)return;attempt.resolved=true;attempt.resolve(result);}
  function stopTimer(attempt:Attempt){try{attempt.cancel();}catch{}attempt.cancel=()=>{};}
  function dispose(owner:RuntimeOwner){if(owner.disposed)return;owner.disposed=true;try{void Promise.resolve(disposeRuntime!(owner.value)).catch(()=>{});}catch{/* No private diagnostics. */}}
  function getIdentity(){
    if(identity)return identity;if(!configValid)throw Error();
    const made=createIdentity!(projectRef),{read,close}=made;
    if(typeof read!=='function'||typeof close!=='function')throw Error();
    if(closed){try{close.call(made);}catch{}throw Error();}
    identity=Object.freeze({read:()=>read.call(made),close:()=>close.call(made)});return identity;
  }
  function start():Promise<boolean>{
    if(closed)return Promise.resolve(false);
    if(active)return active.timedOut?Promise.resolve(false):active.promise;
    if(runtime&&view.stage==='ready')return Promise.resolve(true);
    let resolve!:(ready:boolean)=>void;const promise=new Promise<boolean>(r=>{resolve=r;});
    const attempt:Attempt={generation,timedOut:false,resolved:false,promise,resolve,cancel:()=>{}};active=attempt;publish('loading',true);
    if(closed||active!==attempt||attempt.generation!==generation){settle(attempt,false);return promise;}
    const timeout=()=>{if(closed||active!==attempt||attempt.generation!==generation)return;attempt.timedOut=true;publish('waiting',true);settle(attempt,false);};
    try{attempt.cancel=schedule!(timeout,timeoutMs);}catch{timeout();}
    void Promise.resolve().then(async()=>{
      let owner:RuntimeOwner|null=null;
      try{
        if(closed||active!==attempt||attempt.generation!==generation)return;
        const result=await getIdentity().read();
        if(closed||active!==attempt||attempt.generation!==generation)return;
        stopTimer(attempt);
        // Never create a runtime on late completion, even when the shim cached
        // a valid public ID. A subsequent explicit retry can read that same cache.
        if(attempt.timedOut){active=null;publish('unavailable',false);settle(attempt,false);return;}
        if(!result||typeof result!=='object'||Array.isArray(result))throw Error();
        const keys=Reflect.ownKeys(result);if(keys.length!==2||!keys.every(key=>key==='status'||key==='installationId'))throw Error();
        const {status,installationId}=result as {status:unknown;installationId:unknown};
        if(status!=='ready'||!isInstallationUuidV4(installationId))throw Error();
        const value=createRuntime!(installationId);if(value===null||value===undefined)throw Error();owner={value,disposed:false};
        if(closed||active!==attempt||attempt.generation!==generation){dispose(owner);return;}
        runtime=owner;active=null;publish('ready',false);
        settle(attempt,!closed&&runtime===owner&&!owner.disposed);
      }catch{
        if(owner&&runtime!==owner)dispose(owner);
        if(!closed&&active===attempt&&attempt.generation===generation){stopTimer(attempt);active=null;publish('unavailable',false);settle(attempt,false);}
      }finally{
        if(closed||attempt.generation!==generation){stopTimer(attempt);settle(attempt,false);}
      }
    });
    return promise;
  }
  const controller:InstallationStartupController<R>=Object.freeze({snapshot:()=>view,subscribe:(f:()=>void)=>{if(closed)return()=>{};listeners.add(f);return()=>{listeners.delete(f);};},retry:start,
    currentRuntime:()=>closed?null:runtime?.value??null,
    close(){if(closed)return;closed=true;generation++;const pending=active;active=null;if(pending){stopTimer(pending);settle(pending,false);}try{identity?.close();}catch{}const owner=runtime;runtime=null;if(owner)dispose(owner);view=Object.freeze({stage:'closed',pending:false,canRetry:false});const old=[...listeners];listeners.clear();for(const f of old)try{f();}catch{}},
  });
  void start();return controller;
}
