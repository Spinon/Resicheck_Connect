type Native=Readonly<{sha256Hex:(hex:string)=>Promise<string>}>;
/** Uses Android MessageDigest through the already-owned native package; no Node/web crypto or new dependency. */
export function createNativeAudioDigest(port:Native){
 if(!port||typeof port.sha256Hex!=='function')throw Error('Audio unavailable');let physical=false;
 return async(bytes:Uint8Array)=>{
  if(physical||!(bytes instanceof Uint8Array)||bytes.length<1||bytes.length>1048576)throw Error('Audio unavailable');physical=true;
  const held=Uint8Array.from(bytes),chunks:string[]=[];
  try{for(let start=0;start<held.length;start+=16384){let hex='';for(const b of held.subarray(start,start+16384))hex+=b.toString(16).padStart(2,'0');chunks.push(hex);if(start+16384<held.length)await new Promise<void>(r=>setTimeout(r,0));}
   const value=await port.sha256Hex(chunks.join(''));if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))throw Error('Audio unavailable');return value;
  }catch{throw Error('Audio unavailable');}finally{held.fill(0);chunks.fill('');physical=false;}
 };
}
