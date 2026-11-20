import type{ImageDescriptor}from'../../../packages/chat-client/src/image-contract.ts';
import type{ImageResource}from'./conversation-image-read.ts';
/** Only accepts bytes already authenticated, bounded and hash-checked by the
 * transfer. No external URL is used and every Blob URL is explicitly revoked. */
export async function createWebReceivedImage(bytes:Uint8Array,d:ImageDescriptor):Promise<ImageResource>{
 if(bytes.length!==d.byteLength)throw Error('Image unavailable');
 const uri=URL.createObjectURL(new Blob([Uint8Array.from(bytes).buffer],{type:d.mime}));let released=false;
 return Object.freeze({preview:Object.freeze({uri,name:'Imagem',mime:d.mime,bytes:d.byteLength,width:d.width,height:d.height,mode:d.mode,profile:d.mode==='optimized'?'candidate-document-3508-q90-v2':null}),release(){if(released)return;URL.revokeObjectURL(uri);released=true;}});
}
