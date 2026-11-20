type Reader={size:number|null;offset:number|null;readBytes:(n:number)=>Uint8Array;close:()=>void};
type Writer={offset:number|null;writeBytes:(bytes:Uint8Array)=>void;close:()=>void};
// Bounded streaming import: no full-file buffer or uncapped provider copy.
export async function copyImageSource(input:{expectedBytes:number;maxBytes:number;current:()=>boolean;openSource:()=>Reader;openTarget:()=>Writer;yield:()=>Promise<void>}){
 let source:Reader|null=null,target:Writer|null=null;
 try{
  const n=input.expectedBytes;if(!input.current()||!Number.isSafeInteger(n)||n<1||!Number.isSafeInteger(input.maxBytes)||input.maxBytes<1||input.maxBytes>12*1024*1024||n>input.maxBytes)throw Error();
  source=input.openSource();if(source.size!==n||source.offset!==0)throw Error();target=input.openTarget();if(target.offset!==0)throw Error();let offset=0;
  while(offset<n){if(!input.current()||source.size!==n||source.offset!==offset||target.offset!==offset)throw Error();const wanted=Math.min(65536,n-offset),bytes=source.readBytes(wanted);if(!(bytes instanceof Uint8Array)||bytes.length<1||bytes.length>wanted)throw Error();target.writeBytes(bytes);offset+=bytes.length;await input.yield();}
  if(!input.current()||source.size!==n||source.offset!==n||target.offset!==n||source.readBytes(1).length!==0)throw Error();
  target.close();target=null;source.close();source=null;
 }catch{throw Error('Local image unavailable');}finally{try{source?.close();}catch{}try{target?.close();}catch{}}
}
