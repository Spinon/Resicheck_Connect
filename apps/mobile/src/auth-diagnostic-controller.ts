import type {AuthProbeReceipt} from '../../../packages/session/src/auth-only-probe.ts';
type Probe={run:(input:{email:string;password:string},signal:AbortSignal)=>Promise<AuthProbeReceipt>;dispose:()=>void};
type State=Readonly<{phase:'ready'|'running'|'paused'|'finished';result:AuthProbeReceipt|null}>;
export function createAuthDiagnosticController(probe:Probe){
  let state:State=Object.freeze({phase:'ready',result:null}),generation=0,job:AbortController|null=null,disposed=false,finished=false,retained:AuthProbeReceipt|null=null;
  const listeners=new Set<()=>void>();
  const publish=(next:State)=>{state=Object.freeze(next);for(const listener of [...listeners])try{listener();}catch{}};
  const cancel=()=>{generation++;const old=job;job=null;old?.abort();};
  const reset=()=>{if(disposed)return;cancel();finished=false;retained=null;publish({phase:'ready',result:null});};
  function complete(result:AuthProbeReceipt|null){finished=true;retained=result;publish({phase:'finished',result});}
  function safe(result:AuthProbeReceipt):AuthProbeReceipt{if(result.scope!=='auth-only'||!['verified','unavailable','cancelled','busy'].includes(result.outcome))throw Error('Diagnostic unavailable');return Object.freeze({scope:'auth-only',outcome:result.outcome,localSessionClosed:result.localSessionClosed===true,remoteRevocationConfirmed:result.remoteRevocationConfirmed===true,businessAccessTested:false,persistentStorageUsed:false});}
  return Object.freeze({
    snapshot:()=>state,
    subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};},
    async run(email:string,password:string){
      if(disposed||finished||state.phase==='running'||state.phase==='paused')return;
      const version=++generation,current=new AbortController();job=current;
      publish({phase:'running',result:null});
      if(version!==generation||disposed||current.signal.aborted)return;
      try{const result=await probe.run({email,password},current.signal);if(version===generation&&!disposed)complete(safe(result));}
      catch{if(version===generation&&!disposed)complete(null);}
      finally{if(job===current)job=null;}
    },
    cancel:reset,
    reset,
    pause:()=>{if(disposed)return;if(state.phase==='running'){finished=true;retained=Object.freeze({scope:'auth-only',outcome:'cancelled',localSessionClosed:false,remoteRevocationConfirmed:false,businessAccessTested:false,persistentStorageUsed:false});}cancel();publish({phase:'paused',result:null});},
    resume:()=>{if(!disposed&&state.phase==='paused')publish({phase:finished?'finished':'ready',result:finished?retained:null});},
    dispose:()=>{if(disposed)return;disposed=true;cancel();finished=false;retained=null;probe.dispose();listeners.clear();state=Object.freeze({phase:'paused',result:null});},
  });
}
