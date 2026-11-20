type Handle={size:number|null;offset:number|null;readBytes:(n:number)=>Uint8Array;close:()=>void};
/** Bounded owned private file, never a URL/provider input. */
export async function readReviewedImage(d:{expectedBytes:number;maxBytes:number;current:()=>boolean;signal:AbortSignal;open:()=>Handle;yield:()=>Promise<void>}){
 let h:Handle|null=null,out:Uint8Array|null=null;const live=()=>!d.signal.aborted&&d.current();
 try{if(!live()||!Number.isSafeInteger(d.expectedBytes)||d.expectedBytes<1||!Number.isSafeInteger(d.maxBytes)||d.maxBytes<1||d.maxBytes>12582912||d.expectedBytes>d.maxBytes)throw Error();
  h=d.open();if(h.size!==d.expectedBytes||h.offset!==0)throw Error();out=new Uint8Array(d.expectedBytes);let offset=0;
  while(offset<out.length){if(!live()||h.size!==out.length||h.offset!==offset)throw Error();const max=Math.min(65536,out.length-offset),b=h.readBytes(max);if(!(b instanceof Uint8Array)||b.length<1||b.length>max)throw Error();out.set(b,offset);offset+=b.length;await d.yield();}
  if(!live()||h.size!==out.length||h.offset!==out.length||h.readBytes(1).length!==0)throw Error();h.close();h=null;return out;
 }catch{out?.fill(0);throw Error('Image unavailable');}finally{try{h?.close();}catch{}}
}
