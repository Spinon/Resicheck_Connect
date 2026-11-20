// Reads an already reviewed private source. Never accepts a URL or uploads.
type Handle={size:number|null;offset:number|null;readBytes:(n:number)=>Uint8Array;close:()=>void};
export async function readReviewedAudio(input:{expectedBytes:number;maxBytes:number;current:()=>boolean;signal:AbortSignal;open:()=>Handle;yield:()=>Promise<void>}){
  let handle:Handle|null=null,result:Uint8Array|null=null;
  const active=()=>!input.signal.aborted&&input.current();
  try{
    if(!active()||!Number.isSafeInteger(input.expectedBytes)||input.expectedBytes<1||!Number.isSafeInteger(input.maxBytes)||input.maxBytes<1||input.maxBytes>1_048_576||input.expectedBytes>input.maxBytes)throw Error();
    handle=input.open();if(handle.size!==input.expectedBytes||handle.offset!==0)throw Error();
    result=new Uint8Array(input.expectedBytes);let offset=0;
    while(offset<result.length){
      if(!active()||handle.size!==result.length||handle.offset!==offset)throw Error();
      const requested=Math.min(65536,result.length-offset),part=handle.readBytes(requested);
      if(!(part instanceof Uint8Array)||part.length<1||part.length>requested)throw Error();result.set(part,offset);offset+=part.length;
      await input.yield();
    }
    if(!active()||handle.size!==result.length||handle.offset!==result.length||handle.readBytes(1).length!==0)throw Error();
    handle.close();handle=null;return result;
  }catch{result?.fill(0);throw Error('Local audio unavailable');}
  finally{try{handle?.close();}catch{}}
}
