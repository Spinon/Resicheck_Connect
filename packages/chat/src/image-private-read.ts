import{createHash}from'node:crypto';
import{decodeImageDescriptor,imageExact,imageFailure,imageMessage,imageUuid,type ImageDescriptor,type ImageMessage}from'../../chat-client/src/image-contract.ts';
export type PrivateImageDescriptor=ImageDescriptor&Readonly<{objectKey:string}>;
type Ports=Readonly<{resolve:(credential:string,command:ImageMessage,signal:AbortSignal)=>Promise<PrivateImageDescriptor>;readPrivate:(descriptor:PrivateImageDescriptor,signal:AbortSignal)=>Promise<Uint8Array>}>;
/** No URL or object name is accepted from a client. resolve must check live
 * JWT/session, conversation authorization and removal masks on EVERY call. */
export function createImagePrivateRead(input:Ports){const p=Object.freeze({...input});return async(credential:string,command:ImageMessage,signal:AbortSignal)=>{
 let bytes:Uint8Array|null=null;
 try{
  const c=imageMessage(command);if(signal.aborted||typeof credential!=='string'||credential.length<1||credential.length>8192)throw imageFailure();
  const validate=(v:PrivateImageDescriptor)=>{if(!imageExact(v,['companyId','conversationId','messageId','attachmentId','sha256','byteLength','mime','width','height','mode','objectKey']))throw imageFailure();const {objectKey,...publicPart}=v;decodeImageDescriptor(publicPart,c);if(typeof objectKey!=='string'||!objectKey.startsWith('q/')||!imageUuid(objectKey.slice(2)))throw imageFailure();return Object.freeze({...v});};
  const d=validate(await p.resolve(credential,c,signal));if(signal.aborted)throw imageFailure();
  bytes=await p.readPrivate(d,signal);if(signal.aborted||!(bytes instanceof Uint8Array)||bytes.length!==d.byteLength||createHash('sha256').update(bytes).digest('hex')!==d.sha256)throw imageFailure();
  const fresh=validate(await p.resolve(credential,c,signal));if(signal.aborted||Object.keys(d).some(k=>d[k as keyof PrivateImageDescriptor]!==fresh[k as keyof PrivateImageDescriptor]))throw imageFailure();
  const {objectKey:_,...descriptor}=d;return Object.freeze({descriptor:Object.freeze(descriptor),bytes});
 }catch{bytes?.fill(0);throw imageFailure();}
 }; }
