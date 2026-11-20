// Native counters may reset to zero after an automatic stop. The encoded
// container, not elapsed JS time or a cached counter, decides clip duration.
export async function finalizeLocalRecording(port:{status:()=>{isRecording:boolean;canRecord:boolean};stop:()=>Promise<void>;encoded:()=>Promise<{durationMs:number;bytes:number}>}){
  const status=port.status();if(status.isRecording||status.canRecord)await port.stop();
  const encoded=await port.encoded();if(!Number.isFinite(encoded.durationMs)||encoded.durationMs<=0||!Number.isSafeInteger(encoded.bytes)||encoded.bytes<=0)throw Error('Local audio unavailable');return encoded;
}
