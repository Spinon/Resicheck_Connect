import {imageResizePlan} from './local-image.ts';
/** Bounded dimensions before browser decode. Not a codec/safety verdict. */
export function imageHeaderBounds(b:Uint8Array,mime:'image/png'|'image/jpeg'){
 const fail=()=>{throw Error('Image unavailable');},size=(width:number,height:number)=>{imageResizePlan(width,height);return Object.freeze({width,height});};
 if(!(b instanceof Uint8Array)||b.length>1048576) return fail();
 const v=new DataView(b.buffer,b.byteOffset,b.byteLength);
 if(mime==='image/png'){
  if(b.length<33||![137,80,78,71,13,10,26,10].every((n,i)=>b[i]===n)||v.getUint32(8)!==13||String.fromCharCode(...b.subarray(12,16))!=='IHDR')return fail();
  const s=size(v.getUint32(16),v.getUint32(20));let p=8;
  for(let n=0;n<1024&&p+12<=b.length;n++){const len=v.getUint32(p),type=String.fromCharCode(...b.subarray(p+4,p+8));if(type==='acTL')return fail();if(type==='IDAT')return s;if(len>b.length-p-12)return fail();p+=len+12;}
  return fail();
 }
 if(mime!=='image/jpeg'||b.length<4||b[0]!==255||b[1]!==216)return fail();
 let p=2;
 for(let n=0;n<1024&&p+3<b.length;n++){
  if(b[p++]!==255)return fail();while(b[p]===255)p++;const marker=b[p++];
  if(marker===0xd9||marker===0xda||marker===0||p+2>b.length)return fail();
  const len=v.getUint16(p);if(len<2||len>b.length-p)return fail();
  if(marker===0xc0||marker===0xc2){if(len<8||b[p+2]!==8||![1,3,4].includes(b[p+7]))return fail();return size(v.getUint16(p+5),v.getUint16(p+3));}
  if(marker>=0xc0&&marker<=0xcf&&![0xc4,0xc8,0xcc].includes(marker))return fail();
  p+=len;
 }
 return fail();
}
