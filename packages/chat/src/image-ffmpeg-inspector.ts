import{createHash}from'node:crypto';
export const IMAGE_INSPECTOR_LIMITS=Object.freeze({inputBytes:4194304,maxPixels:16000000,maxDimension:16384,wallMs:15000,memoryBytes:268435456,maxProbeBytes:16384,maxStderrBytes:4096,threads:1});
type Header=Readonly<{mime:'image/png'|'image/jpeg';codec:'png'|'mjpeg';width:number;height:number}>;
type Proof=Readonly<{sha256:string;probeJson:string;probeExitCode:number;decodeExitCode:number;timedOut:boolean;outputTruncated:boolean}>;
const fail=()=>Error('Image inspector unavailable');
const png=[137,80,78,71,13,10,26,10];
function crc(bytes:Uint8Array){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
/** Admission only; real bounded pixel decoding is still mandatory. No SVG/PDF/GIF/APNG. */
export function admitImageContainer(bytes:Uint8Array):Header|null{
 if(!(bytes instanceof Uint8Array)||bytes.length<16||bytes.length>IMAGE_INSPECTOR_LIMITS.inputBytes)return null;
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),size=(width:number,height:number)=>Number.isSafeInteger(width)&&Number.isSafeInteger(height)&&width>0&&height>0&&width<=IMAGE_INSPECTOR_LIMITS.maxDimension&&height<=IMAGE_INSPECTOR_LIMITS.maxDimension&&width*height<=IMAGE_INSPECTOR_LIMITS.maxPixels;
 if(png.every((b,i)=>bytes[i]===b)){
  let p=8,chunks=0,header:Header|null=null,idat=false,afterIdat=false;
  while(p+12<=bytes.length&&++chunks<=8192){const len=v.getUint32(p),type=String.fromCharCode(...bytes.subarray(p+4,p+8));if(!/^[A-Za-z]{4}$/.test(type)||len>bytes.length-p-12)return null;
   if(crc(bytes.subarray(p+4,p+8+len))!==v.getUint32(p+8+len))return null;
   if(chunks===1){if(type!=='IHDR'||len!==13)return null;const width=v.getUint32(p+8),height=v.getUint32(p+12),depth=bytes[p+16],color=bytes[p+17],depths:Record<number,number[]>={0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]};if(!size(width,height)||!depths[color]?.includes(depth)||bytes[p+18]!==0||bytes[p+19]!==0||![0,1].includes(bytes[p+20]))return null;header=Object.freeze({mime:'image/png',codec:'png',width,height});}
   else if(type==='IHDR'||type==='acTL'||type==='fcTL'||type==='fdAT'||!['PLTE','IDAT','IEND'].includes(type)&&(bytes[p+4]&32)===0)return null;
   if(type==='IDAT'){if(afterIdat)return null;idat=true;}else if(idat)afterIdat=true;
   p+=len+12;if(type==='IEND')return len===0&&idat&&p===bytes.length?header:null;
  }return null;
 }
 if(bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)return null;
 let p=2,segments=0,scan=false,header:Header|null=null;
 while(p<bytes.length&&segments<8192){
  if(scan&&bytes[p]!==255){p++;continue;}if(bytes[p++]!==255)return null;while(bytes[p]===255)p++;if(p>=bytes.length)return null;const marker=bytes[p++];
  if(marker===0){if(!scan)return null;continue;}if(marker>=0xd0&&marker<=0xd7){if(!scan)return null;continue;}
  if(marker===0xd9)return scan&&header&&p===bytes.length?header:null;if(marker===0xd8||marker===0x01||p+2>bytes.length)return null;
  segments++;const len=v.getUint16(p);if(len<2||len>bytes.length-p)return null;
  if(marker===0xc0||marker===0xc2){if(header||scan||len<8||bytes[p+2]!==8||![1,3,4].includes(bytes[p+7]))return null;const width=v.getUint16(p+5),height=v.getUint16(p+3);if(!size(width,height))return null;header=Object.freeze({mime:'image/jpeg',codec:'mjpeg',width,height});}
  else if(marker>=0xc0&&marker<=0xcf&&![0xc4,0xc8,0xcc].includes(marker))return null;
  if(marker===0xda){if(!header)return null;scan=true;}p+=len;
 }return null;
}
/** Trusted server runner only. A client's MIME, dimensions or "inspection" never authorize a file. */
export function createFfmpegImageInspector(input:Readonly<{enabled?:boolean;run:(bytes:Uint8Array,header:Header,limits:typeof IMAGE_INSPECTOR_LIMITS)=>Promise<Proof>}>){
 const enabled=input.enabled===true,run=input.run;let busy=false;
 return async(bytes:Uint8Array)=>{if(!enabled||busy||typeof run!=='function'||!(bytes instanceof Uint8Array)||bytes.length<16||bytes.length>IMAGE_INSPECTOR_LIMITS.inputBytes)throw fail();
  busy=true;const held=Uint8Array.from(bytes),sha256=createHash('sha256').update(held).digest('hex');
  try{const header=admitImageContainer(held);if(!header)return Object.freeze({accepted:false as const});const proof=await run(held,header,IMAGE_INSPECTOR_LIMITS);
   if(proof.sha256!==sha256||createHash('sha256').update(held).digest('hex')!==sha256||proof.probeExitCode!==0||proof.decodeExitCode!==0||proof.timedOut||proof.outputTruncated||typeof proof.probeJson!=='string'||Buffer.byteLength(proof.probeJson)>IMAGE_INSPECTOR_LIMITS.maxProbeBytes)throw fail();
   const p=JSON.parse(proof.probeJson),s=p.streams?.[0];if(!Array.isArray(p.streams)||p.streams.length!==1||s.codec_type!=='video'||s.codec_name!==header.codec||s.width!==header.width||s.height!==header.height||s.nb_read_frames!=='1'||p.format?.format_name!=='image2pipe'||p.format?.size!==String(held.length)||p.chapters!==undefined&&(!Array.isArray(p.chapters)||p.chapters.length))return Object.freeze({accepted:false as const});
   return Object.freeze({accepted:true as const,mime:header.mime,width:header.width,height:header.height,byteLength:held.length,sha256,inspectionVersion:'ffmpeg-9.0.2-image-single-v1'});
  }catch{throw fail();}finally{held.fill(0);busy=false;}
 };
}
