type Controller=Readonly<{snapshot:()=>Readonly<{enabled:boolean;state:string;busy:boolean;uncertain:boolean}>;current:()=>boolean;subscribe:(fn:()=>void)=>()=>void;refresh:(signal?:AbortSignal)=>Promise<boolean>}>;
/** Applicant projection only: at most six reads; never queues/finalizes a check. */
export function createRegistryProgressWatch(deps:Readonly<{controller:Controller;schedule:(fn:()=>void,ms:number)=>()=>void}>){
 let closed=false,active=true,resumeProbe=false,remaining=6,cancel:(()=>void)|null=null,request:AbortController|null=null;let stop=()=>{};
 function clear(){cancel?.();cancel=null;}
 function dispose(){if(closed)return;closed=true;clear();request?.abort();stop();}
 function sync(){
  if(closed)return;const view=deps.controller.snapshot();if(!active||!view.enabled||!deps.controller.current()||!(view.state==='checking'||resumeProbe&&view.state==='unavailable')||view.busy||view.uncertain){clear();return;}
  if(request||cancel||remaining===0)return;
  let returned=false;cancel=deps.schedule(()=>{cancel=null;if(!returned){dispose();return;}void poll();},3000);returned=true;
 }
 async function poll(){
  const view=deps.controller.snapshot();if(closed||!active||!view.enabled||!deps.controller.current()||!(view.state==='checking'||resumeProbe&&view.state==='unavailable')||view.busy||view.uncertain||request||remaining===0)return;
  const own=new AbortController();request=own;remaining--;resumeProbe=false;
  try{const ok=await deps.controller.refresh(own.signal);if(!closed&&active&&!own.signal.aborted&&!ok)remaining=0;}catch{if(!closed&&active&&!own.signal.aborted)remaining=0;}
  finally{if(request===own)request=null;if(!closed)sync();}
 }
 // The owning binding publishes the freshly constructed controller after this
 // subscription is installed. Its initial state is always pending: do not
 // query current()/snapshot() before the owner can finish that publication.
 stop=deps.controller.subscribe(sync);return Object.freeze({dispose,resetAfterCheck(){if(closed)return;remaining=6;resumeProbe=false;clear();sync();},setActive(next:boolean){if(closed||active===next)return;if(!next)resumeProbe=resumeProbe||deps.controller.snapshot().state==='checking';active=next;if(!next){clear();request?.abort();}else sync();}});
}
