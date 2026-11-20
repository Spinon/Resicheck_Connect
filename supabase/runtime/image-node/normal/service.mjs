// Pure lifecycle for the normal non-root service. No ambient credentials or IO.
export const NORMAL_IMAGE_PURPOSE='connect-image-inspector-normal-v1';
const phases=new Set(['stopped','idle','tick','lease-uncertain','auth-dispatched','auth-uncertain','logout-unconfirmed']);
export function normalImageRecovery(previous,now){
 if(!previous)return{allowed:true,waitMs:0};
 if(previous.purpose!==NORMAL_IMAGE_PURPOSE||previous.version!==1||!phases.has(previous.phase)||!Number.isSafeInteger(previous.updatedAt)||previous.updatedAt>now)throw Error('Image recovery unavailable');
 if(['auth-dispatched','auth-uncertain','logout-unconfirmed'].includes(previous.phase))return{allowed:false,reason:'owned-auth-closure-review'};
 // A crashed/uncertain task is never finished with another session. Its server
 // lease expires after30s; the new session may then dequeue through normal SQL.
 return{allowed:true,priorClosureUnconfirmed:previous.priorClosureUnconfirmed===true||['idle','tick'].includes(previous.phase),waitMs:previous.phase==='stopped'?0:Math.max(0,previous.updatedAt+35000-now)};
}
export async function runNormalImageService(plan,ports){
 if(plan?.enabled!==true)return{state:'off',exitCode:78,credentialsRead:false};
 const recovery=normalImageRecovery(await ports.readJournal(),ports.now());
 if(!recovery.allowed)return{state:recovery.reason,exitCode:79};
 const record={version:1,purpose:NORMAL_IMAGE_PURPOSE,phase:'stopped',updatedAt:ports.now(),processed:0,rejected:0,priorClosureUnconfirmed:recovery.priorClosureUnconfirmed===true};
 const save=async phase=>{record.phase=phase;record.updatedAt=ports.now();await ports.writeJournal({...record});await ports.health({...record});};
 let auth,worker,closed=false,exitCode=0;
 try{
  if(recovery.waitMs)await ports.wait(recovery.waitMs,ports.signal);
  if(ports.signal.aborted)return{state:'stopped-before-auth',exitCode:0};
  await save('auth-dispatched');auth=ports.auth();const own=await auth.open();await ports.sessionOpened?.(own);
  worker=ports.worker(own.sessionId);await save('idle');
  while(!ports.signal.aborted){
   const token=await auth.readSession();await save('tick');
   const result=await worker.tick({token,signal:ports.signal});
   if(!['idle','ready','rejected','finish-unconfirmed','unavailable'].includes(result.state))throw Error('Image outcome unavailable');
   if(result.state==='ready')record.processed++;if(result.state==='rejected')record.rejected++;
   if(result.state==='unavailable'){await save('lease-uncertain');exitCode=75;break;}
   // finish-unconfirmed stays inside this worker/session; no new dequeue.
   await save(result.state==='finish-unconfirmed'?'tick':'idle');
   await ports.wait(2000,ports.signal);
  }
 }catch{
  exitCode=record.phase==='auth-dispatched'?79:75;
  await save(record.phase==='auth-dispatched'?'auth-uncertain':'lease-uncertain');
 }finally{
  worker?.close();
  if(auth){try{const result=await auth.close();await ports.sessionClosed?.(result);closed=result.logout==='local-acknowledged';
    if(!closed){exitCode=79;await save('logout-unconfirmed');}}
   catch{exitCode=79;await save('logout-unconfirmed');}}
  if(closed){await save(exitCode===75?'lease-uncertain':'stopped');}
 }
 return{state:exitCode===0?'stopped':exitCode===79?'owned-auth-review-required':'lease-cooldown-before-restart',exitCode,processed:record.processed,rejected:record.rejected,localLogoutAcknowledged:closed};
}

export function normalImageHealth(record,now){
 const fresh=record?.purpose===NORMAL_IMAGE_PURPOSE&&record.version===1&&Number.isSafeInteger(record.updatedAt)&&now>=record.updatedAt&&now-record.updatedAt<=45000;
 return{purpose:NORMAL_IMAGE_PURPOSE,updatedAt:record?.updatedAt??null,phase:fresh?record.phase:'stale',healthy:!!(fresh&&['idle','tick'].includes(record.phase)&&!record.priorClosureUnconfirmed),closureReviewRequired:record?.priorClosureUnconfirmed===true,processed:record?.processed??0,rejected:record?.rejected??0};
}
