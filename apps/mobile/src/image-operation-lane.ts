const unavailable=()=>Error('Image unavailable');
/** One bounded lane per captured conversation. Passive thumbnails cannot collide
 * with a send/status; cancelled queued work never reaches the transport. Physical
 * IO admission remains locked even if a timeout beats fetch/body cleanup. */
export function createImageOperationLane(d:{current:()=>boolean;busy:()=>boolean;schedule:(f:()=>void,ms:number)=>()=>void;timeoutMs:number}){
 if(!Number.isSafeInteger(d.timeoutMs)||d.timeoutMs<1||d.timeoutMs>60000)throw unavailable();
 type Job={write:boolean;ac:AbortController;dispatch:()=>void;reject:()=>void;cancelTimer:()=>void;detach:()=>void;settled:boolean};
 let closed=false,active:Job|null=null,waiting=false,cancelWake=()=>{};const jobs:Job[]=[],all=new Set<Job>();
 const live=()=>{try{return !closed&&d.current();}catch{return false;}};
 function pump(){
  if(!live()){close();return;}if(active||!jobs.length)return;
  if(d.busy()){if(!waiting){waiting=true;cancelWake=d.schedule(()=>{waiting=false;pump();},25);}return;}
  const index=Math.max(0,jobs.findIndex(j=>j.write)),job=jobs.splice(index,1)[0];
  if(job.settled||job.ac.signal.aborted){pump();return;}active=job;job.dispatch();
 }
 function close(){if(closed)return;closed=true;cancelWake();waiting=false;for(const j of[...all])j.reject();jobs.length=0;}
 return Object.freeze({
  run<T>(signal:AbortSignal,action:(signal:AbortSignal)=>Promise<T>,write=false):Promise<T>{
   if(!live()||signal.aborted||all.size>=32)return Promise.reject(unavailable());
   return new Promise<T>((yes,no)=>{
    const ac=new AbortController();let job:Job;
    const finish=(ok:boolean,v?:T)=>{if(job.settled)return;job.settled=true;job.cancelTimer();job.detach();all.delete(job);const index=jobs.indexOf(job);if(index>=0)jobs.splice(index,1);ok?yes(v!):no(unavailable());};
    const reject=()=>{ac.abort();finish(false);if(active===job)active=null;pump();};
    const armDeadline=()=>{job.cancelTimer();job.cancelTimer=d.schedule(reject,d.timeoutMs);};
    job={write,ac,settled:false,cancelTimer:()=>{},detach:()=>signal.removeEventListener('abort',reject),reject,
     dispatch(){if(!live()||ac.signal.aborted){if(active===job)active=null;reject();return;}
      // A passive read gets its own transfer budget after waiting for the lane.
      if(!write){try{armDeadline();}catch{reject();return;}}
      void Promise.resolve().then(()=>{if(!live()||ac.signal.aborted)throw unavailable();return action(ac.signal);}).then(v=>{if(!live()||ac.signal.aborted)finish(false);else finish(true,v);},()=>finish(false)).finally(()=>{if(active===job)active=null;pump();});}
    };all.add(job);signal.addEventListener('abort',reject,{once:true});
    try{
     if(write)armDeadline();
     jobs.push(job);
     if(signal.aborted)reject();else pump();
     if(!write&&!job.settled&&active!==job)armDeadline();
    }catch{reject();}
   });
  },close
 });
}
