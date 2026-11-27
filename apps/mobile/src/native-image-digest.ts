type Native=Readonly<{sha256ImageHex:(value:string)=>Promise<string>}>;
/** Bounded image-only digest lane. Automatic thumbnails and an explicit send
 * share one native bridge, so ordinary contention must not become a send error.
 * Audio's method/limit are unchanged. Each queued job owns and clears its bytes. */
export function createNativeImageDigest(port:Native){
 if(!port||typeof port.sha256ImageHex!=='function')throw Error('Image unavailable');let pending=0,lane:Promise<unknown>=Promise.resolve();
 return(bytes:Uint8Array):Promise<string>=>{
  if(pending>=4||!(bytes instanceof Uint8Array)||bytes.length<1||bytes.length>4194304)return Promise.reject(Error('Image unavailable'));
  const held=Uint8Array.from(bytes);pending++;
  const job=lane.then(async()=>{const chunks:string[]=[];try{for(let i=0;i<held.length;i+=65536){let hex='';for(const b of held.subarray(i,i+65536))hex+=b.toString(16).padStart(2,'0');chunks.push(hex);if(i+65536<held.length)await new Promise<void>(r=>setTimeout(r,0));}const result=await port.sha256ImageHex(chunks.join(''));if(!/^[a-f0-9]{64}$/.test(result))throw Error('Image unavailable');return result;}finally{held.fill(0);chunks.fill('');pending--;}});
  lane=job.catch(()=>{});return job;
 };
}
