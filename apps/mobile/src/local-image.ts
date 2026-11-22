export const LOCAL_IMAGE_PROFILE=Object.freeze({id:'candidate-document-3508-q90-v2',longEdge:3508,jpegQuality:0.90,maxBytes:12*1024*1024,maxPixels:16_000_000});
export type LocalImageSource=Readonly<{uri:string;name:string;mime:'image/png'|'image/jpeg'|'application/pdf';bytes:number}>;
export type LocalImagePreview=LocalImageSource&Readonly<{width:number|null;height:number|null;mode:'original'|'optimized';profile:string|null;retainedOriginal?:'not-smaller';flattenedTransparency?:boolean}>;
const unavailable=()=>Error('Local image unavailable');
// Preliminary type candidate only, never a decoder/document safety verdict.
export function localImageHeaderType(header:Uint8Array){return header[0]===255&&header[1]===216&&header[2]===255?'image/jpeg':header.length>=8&&[137,80,78,71,13,10,26,10].every((v,i)=>header[i]===v)?'image/png':String.fromCharCode(...header.subarray(0,5))==='%PDF-'?'application/pdf':null;}
export function imageResizePlan(width:number,height:number){
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width*height>LOCAL_IMAGE_PROFILE.maxPixels)throw unavailable();
 const scale=Math.min(1,LOCAL_IMAGE_PROFILE.longEdge/Math.max(width,height));return Object.freeze({width:Math.max(1,Math.floor(width*scale)),height:Math.max(1,Math.floor(height*scale))});
}
// Source is a private imported copy, never a gallery path from a text field.
// Render is a trusted native port. This function neither uploads nor certifies
// document safety/legibility/metadata removal. A valid conversion that saves no bytes explicitly retains the original.
export async function prepareLocalImage(source:LocalImageSource,mode:'original'|'optimized',port:{current:()=>boolean;dimensions:()=>Promise<{width:number;height:number}>;render:(plan:{width:number;height:number},quality:number)=>Promise<LocalImagePreview>;removeDerived:(value:LocalImagePreview)=>Promise<void>}):Promise<LocalImagePreview>{
 let result:LocalImagePreview|null=null;
 try{
  if(!port.current()||!Number.isSafeInteger(source.bytes)||source.bytes<1||source.bytes>LOCAL_IMAGE_PROFILE.maxBytes||!['image/png','image/jpeg','application/pdf'].includes(source.mime))throw unavailable();
  if(mode==='original')return Object.freeze({...source,width:null,height:null,mode,profile:null});
  if(mode!=='optimized'||source.mime==='application/pdf')throw unavailable();
  const size=await port.dimensions();if(!port.current())throw unavailable();imageResizePlan(size.width,size.height);
  const plan=imageResizePlan(size.width,size.height);
  result=await port.render(plan,LOCAL_IMAGE_PROFILE.jpegQuality);
  if(!port.current()||result.uri===source.uri||result.mime!=='image/jpeg'||result.name!==optimizedImageName(source)||typeof result.flattenedTransparency!=='boolean'||result.width!==plan.width||result.height!==plan.height||!Number.isSafeInteger(result.bytes)||result.bytes<1||result.bytes>LOCAL_IMAGE_PROFILE.maxBytes||result.mode!=='optimized'||result.profile!==LOCAL_IMAGE_PROFILE.id)throw unavailable();
  if(result.bytes>=source.bytes){await port.removeDerived(result);result=null;if(!port.current())throw unavailable();return Object.freeze({...source,width:size.width,height:size.height,mode:'original',profile:null,retainedOriginal:'not-smaller'});}
  return Object.freeze({...result});
 }catch{if(result&&result.uri!==source.uri)try{await port.removeDerived(result);}catch{}throw unavailable();}
}

/** Conversion is explicit only in Compactada; original names/bytes remain untouched. */
export function optimizedImageName(source:Pick<LocalImageSource,'name'>){return source.name.replace(/\.[^/.]*$/,'').slice(0,116).replace(/[\uD800-\uDBFF]$/,'')+'.jpg';}
