import{LOCAL_IMAGE_PROFILE,localImageHeaderType}from'./local-image.ts';
import{imageHeaderBounds}from'./image-header-bounds.ts';
type Handle={size:number|null;offset:number|null;readBytes:(n:number)=>Uint8Array;close:()=>void};
/** Bounded private/provider file admission before any native pixel decoder.
 * Header admission is not a server inspection or a promise that decode succeeds. */
export function readLocalImageHeader(d:{expectedBytes:number;current:()=>boolean;open:()=>Handle}){
 let h:Handle|null=null;const live=()=>{try{return d.current()===true;}catch{return false;}};
 try{const bytes=d.expectedBytes;if(!live()||!Number.isSafeInteger(bytes)||bytes<1||bytes>LOCAL_IMAGE_PROFILE.maxBytes)throw Error();h=d.open();if(!live()||h.size!==bytes||h.offset!==0)throw Error();
  const limit=Math.min(bytes,1048576),prefix=new Uint8Array(limit);let n=0;
  while(n<limit){if(!live()||h.size!==bytes||h.offset!==n)throw Error();const b=h.readBytes(limit-n);if(!(b instanceof Uint8Array)||b.length<1||b.length>limit-n)throw Error();prefix.set(b,n);n+=b.length;}
  if(!live()||h.size!==bytes||h.offset!==limit)throw Error();const mime=localImageHeaderType(prefix);if(!mime)throw Error();const dimensions=mime==='application/pdf'?null:imageHeaderBounds(prefix,mime);return Object.freeze({mime,dimensions});
 }catch{throw Error('Local image unavailable');}finally{try{h?.close();}catch{}}
}
