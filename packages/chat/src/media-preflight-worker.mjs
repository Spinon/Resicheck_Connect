// Fixed worker entry. No user path/module/URL, parser plugin, network or file I/O.
import {parentPort,workerData} from 'node:worker_threads';import {createHash} from 'node:crypto';
import {inspectMediaEnvelope} from './media-envelope.ts';
try{
  const bytes=new Uint8Array(workerData.buffer),sha256=createHash('sha256').update(bytes).digest('hex');
  const envelope=inspectMediaEnvelope(bytes,workerData.kind);
  parentPort.postMessage(sha256===workerData.sha256&&bytes.length===workerData.byteLength&&envelope.status==='quarantined'
    ?{...envelope,sha256,byteLength:bytes.length}:{status:'rejected'});
}catch{parentPort.postMessage({status:'rejected'});}
