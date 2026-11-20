import {Worker} from 'node:worker_threads';
import type {Envelope} from './media-envelope.ts';
export type MediaPreflight = Envelope | Readonly<{status:'unavailable'}>;
let pending=0;
// Worker threads bound preliminary CPU/heap and concurrency; they are NOT an OS
// sandbox for a hostile decoder. No result from this preflight is accepted=true.
export async function preflightMedia(input:{bytes:Uint8Array;kind:'audio'|'image'|'document';sha256:string;byteLength:number},timeoutMs=2000):Promise<MediaPreflight>{
  if(pending>=2||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>5000)return{status:'unavailable'};
  const {bytes,kind,sha256,byteLength}=input;
  const limit=kind==='audio'?1_048_576:kind==='image'?4_194_304:kind==='document'?10_485_760:0;
  if(!(bytes instanceof Uint8Array)||bytes.length<1||bytes.length>limit||bytes.length!==byteLength||!/^[0-9a-f]{64}$/.test(sha256))return{status:'rejected'};
  pending++;let worker:Worker|null=null;
  try{
    const copy=Uint8Array.from(bytes);
    worker=new Worker(new URL('./media-preflight-worker.mjs',import.meta.url),{workerData:{buffer:copy.buffer,kind,sha256,byteLength},transferList:[copy.buffer],env:{},execArgv:[],resourceLimits:{maxOldGenerationSizeMb:32,maxYoungGenerationSizeMb:8,stackSizeMb:2}});
    const selected=worker;
    return await new Promise<MediaPreflight>(resolve=>{
      let done=false;const finish=(result:MediaPreflight)=>{if(done)return;done=true;clearTimeout(timer);resolve(result);};
      const timer=setTimeout(()=>finish({status:'unavailable'}),timeoutMs);
      selected.once('error',()=>finish({status:'unavailable'}));selected.once('exit',()=>finish({status:'unavailable'}));
      selected.once('message',value=>{
        if(value?.status==='quarantined'&&value.sha256===sha256&&value.byteLength===byteLength&&['audio/mp4','image/png','image/jpeg','application/pdf'].includes(value.candidateType)&&['decoder-required','document-parser-required'].includes(value.next))finish(Object.freeze({status:'quarantined',candidateType:value.candidateType,next:value.next}));
        else finish({status:'rejected'});
      });
    });
  }catch{return{status:'unavailable'};}
  finally{try{if(worker)await worker.terminate();}finally{pending--;}}
}
