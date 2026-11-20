import {createImageInspectionExecutor} from './inspection-executor.mjs';
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
const audioActor='ee330000-0000-4000-8000-000000000203';
/** Outbound-only normal worker. Host owns private Auth session/codec custody.
 * No login, filesystem secrets, service installation, Docker or SQL privileges.
 * OFF unless explicitly configured. Each tick uses only a server-issued lease. */
export function createImageServiceWorker(input={}) {
 if(input.enabled!==true)return null;
 const d=Object.freeze({...input});
 if(!(Array.isArray(d.companyIds)?d.companyIds.length>0&&d.companyIds.length<=256&&d.companyIds.every(uuid)&&new Set(d.companyIds).size===d.companyIds.length:uuid(d.companyId))||!uuid(d.inspectorId)||d.inspectorId===audioActor||!uuid(d.expectedSessionId))throw Error('Image worker unavailable');
 const executor=createImageInspectionExecutor({...d,allowedCompanyIds:d.companyIds});
 let busy=false,closed=false,pending=false,uncertain=false,loop=false,pendingUntil=0;
 return Object.freeze({
  async tick({token,signal=new AbortController().signal}={}) {
   if(closed||uncertain)return Object.freeze({state:'unavailable',stage:'worker-closed-or-uncertain'});
   if(busy)throw Error('Image worker busy');
   if(pending&&d.now()>=pendingUntil){uncertain=true;return Object.freeze({state:'unavailable',stage:'finish-unconfirmed-expired'});}
   busy=true;
   try {
    const result=pending?await executor.reconcile({signal}):await executor.inspectNext({token,companyId:d.companyId,signal});
    if(result.state==='finish-unconfirmed'&&!pending)pendingUntil=d.now()+30000;
    pending=result.state==='finish-unconfirmed';
    // Claim/read errors may have committed an unknown lease. Stop; never hide
    // an uncertain transition behind a blind new dequeue or automatic re-login.
    if(result.state==='unavailable')uncertain=true;
    return result;
   } finally {busy=false;}
  },
  async run({readSession,signal,onResult=()=>{},pollMs=2000}={}) {
   if(loop||closed||typeof readSession!=='function'||!signal||!Number.isSafeInteger(pollMs)||pollMs<1000||pollMs>30000)throw Error('Image worker unavailable');
   loop=true;
   try {
    while(!signal.aborted&&!closed&&!uncertain) {
     const token=pending?undefined:await readSession();
     const result=await this.tick({token,signal});
     await onResult(result); // Only the sanitized executor outcome, no token/bytes.
     if(signal.aborted||closed||uncertain)break;
     await new Promise(resolve=>{let timer;const done=()=>{clearTimeout(timer);signal.removeEventListener('abort',done);resolve();};signal.addEventListener('abort',done,{once:true});timer=setTimeout(done,pollMs);if(signal.aborted)done();});
    }
   } finally {loop=false;}
  },
  close(){if(closed)return;closed=true;executor.close();}
 });
}
