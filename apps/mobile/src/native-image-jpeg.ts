type Result=Readonly<{mime:'image/jpeg';bytes:number;width:number;height:number;flattenedTransparency:boolean}>;
/** No fallback to PNG. The native method accepts only bounded files in one private image-draft folder. */
export function nativePngJpeg(module:unknown){
 const native=module as{pngToJpegWhite?:unknown}|null,method=native?.pngToJpegWhite;
 return async(input:Readonly<{sourceUri:string;targetUri:string;bytes:number;width:number;height:number;quality:number}>):Promise<Result>=>{
  if(typeof method!=='function'||!input.sourceUri.startsWith('file://')||!input.targetUri.startsWith('file://')||input.sourceUri===input.targetUri||![input.bytes,input.width,input.height].every(Number.isSafeInteger)||input.bytes<1||input.bytes>12582912||input.width<1||input.height<1||input.width>3508||input.height>3508||input.width*input.height>16000000||input.quality!==.9)throw Error('Image unavailable');
  const r=await Reflect.apply(method as Function,native,[input.sourceUri,input.targetUri,input.bytes,input.width,input.height,90])as Partial<Result>;
  if(!r||r.mime!=='image/jpeg'||!Number.isSafeInteger(r.bytes)||r.bytes!<1||r.bytes!>12582912||r.width!==input.width||r.height!==input.height||typeof r.flattenedTransparency!=='boolean')throw Error('Image unavailable');
  return Object.freeze(r as Result);
 };
}
