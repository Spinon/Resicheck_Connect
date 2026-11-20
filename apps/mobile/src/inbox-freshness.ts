type Result='changed'|'unchanged'|'unavailable'|'stale';
/** Scoped read-only watcher. Pausing retains physical IO ownership until settlement. */
export function createInboxFreshness(options:Readonly<{probe:(signal:AbortSignal)=>Promise<Result>;changed:(kind:'changed'|'unavailable')=>void;schedule:(fn:()=>void,ms:number)=>()=>void;intervalMs?:number;active?:boolean}>){
 const interval=options.intervalMs??20000;if(!Number.isSafeInteger(interval)||interval<1000||interval>60000)throw Error('Invalid freshness interval');
 let stopped=false,active=options.active??true,resumePending=false,cancel:(()=>void)|null=null,request:AbortController|null=null;
 function clearTimer(){cancel?.();cancel=null;}
 function stop(){if(stopped)return;stopped=true;clearTimer();request?.abort();}
 function arm(){if(stopped||!active)return;let returned=false;cancel=options.schedule(()=>{if(!returned){stop();return;}cancel=null;void check();},interval);returned=true;if(stopped)clearTimer();}
 async function check(){
  if(stopped||!active||request)return;
  const own=new AbortController();request=own;
  try{
   const result=await options.probe(own.signal);
   if(stopped||!active||own.signal.aborted)return;
   if(result==='changed'||result==='unavailable'){stop();options.changed(result);return;}
   if(result==='stale'){stop();return;}
  }catch{if(!stopped&&active&&!own.signal.aborted){stop();options.changed('unavailable');}}
  finally{
   if(request===own)request=null;
   if(!stopped&&active){if(resumePending){resumePending=false;void check();}else arm();}
  }
 }
 function setActive(next:boolean){
  if(stopped||next===active)return;active=next;clearTimer();
  if(!active){resumePending=false;request?.abort();return;}
  if(request){resumePending=true;return;}void check();
 }
 arm();return Object.freeze({dispose:stop,setActive});
}

/** One bounded read refresh after a quiet inbox; never sends or marks read. */
export function createIdleInboxUpdate(deps:Readonly<{current:()=>boolean;refresh:()=>Promise<boolean>;schedule:(fn:()=>void,ms:number)=>()=>void;failed:()=>void}>){
 let disposed=false,used=false;let returned=false;
 const cancel=deps.schedule(()=>{
  if(!returned||disposed||used)return;used=true;
  try{if(!deps.current())return;void Promise.resolve(deps.refresh()).then(ok=>{if(!disposed&&!ok)deps.failed();},()=>{if(!disposed)deps.failed();});}catch{if(!disposed)deps.failed();}
 },1500);returned=true;
 return Object.freeze({dispose(){disposed=true;cancel();}});
}
