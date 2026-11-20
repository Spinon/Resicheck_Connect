/** Candidate image protocol. OFF unless composed by an explicitly enabled owner. */
export const IMAGE_ORIGIN='https://ibdlvlwdzmsrbqadrudb.supabase.co';
export const IMAGE_PATH='/functions/v1/connect-image-transfer-v1/';
export const IMAGE_MAX=4194304;
export type ImageScope=Readonly<{companyId:string;conversationId:string}>;
export type ImageIntent=ImageScope&Readonly<{clientUploadId:string;sha256:string;byteLength:number;mime:'image/png'|'image/jpeg';mode:'original'|'optimized';profile:string|null}>;
export type ImageMessage=ImageScope&Readonly<{messageId:string}>;
export type ImageDescriptor=ImageMessage&Readonly<{attachmentId:string;sha256:string;byteLength:number;mime:'image/png'|'image/jpeg';width:number;height:number;mode:'original'|'optimized'}>;
export type ImageUploadReceipt=ImageScope&Readonly<{senderId:string;clientUploadId:string;sha256:string;byteLength:number;attachmentId:string;state:'quarantined'|'ready'|'rejected'}>;
export type ImageCommit=ImageScope&Readonly<{attachmentId:string;clientMessageId:string}>;
export const imageFailure=()=>Error('Image unavailable');
export const imageUuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
export const imageId=(v:unknown):v is string=>typeof v==='string'&&/^[-A-Za-z0-9_]{1,80}$/.test(v);
export const imageExact=(v:unknown,keys:string[]):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
export function imageScope(v:ImageScope){if(!v||!imageUuid(v.companyId)||!imageUuid(v.conversationId))throw imageFailure();}
export function imageIntent(v:ImageIntent){imageScope(v);if(!imageExact(v,['companyId','conversationId','clientUploadId','sha256','byteLength','mime','mode','profile'])||!imageId(v.clientUploadId)||typeof v.sha256!=='string'||!/^[a-f0-9]{64}$/.test(v.sha256)||!Number.isSafeInteger(v.byteLength)||v.byteLength<1||v.byteLength>IMAGE_MAX||!['image/png','image/jpeg'].includes(v.mime)||!(v.mode==='original'&&v.profile===null||v.mode==='optimized'&&v.profile==='candidate-document-3508-q90-v2'))throw imageFailure();return Object.freeze({...v});}
export function imageMessage(v:ImageMessage){imageScope(v);if(!imageExact(v,['companyId','conversationId','messageId'])||!imageUuid(v.messageId))throw imageFailure();return Object.freeze({...v});}
export function imageCommit(v:ImageCommit){imageScope(v);if(!imageExact(v,['companyId','conversationId','attachmentId','clientMessageId'])||!imageUuid(v.attachmentId)||!imageId(v.clientMessageId))throw imageFailure();return Object.freeze({...v});}
export function decodeImageDescriptor(raw:unknown,command:ImageMessage):ImageDescriptor{
 imageMessage(command);if(!imageExact(raw,['companyId','conversationId','messageId','attachmentId','sha256','byteLength','mime','width','height','mode'])||raw.companyId!==command.companyId||raw.conversationId!==command.conversationId||raw.messageId!==command.messageId||!imageUuid(raw.attachmentId)||typeof raw.sha256!=='string'||!/^[a-f0-9]{64}$/.test(raw.sha256)||!Number.isSafeInteger(raw.byteLength)||(raw.byteLength as number)<1||(raw.byteLength as number)>IMAGE_MAX||!['image/png','image/jpeg'].includes(String(raw.mime))||!['original','optimized'].includes(String(raw.mode))||![raw.width,raw.height].every(n=>Number.isSafeInteger(n)&&(n as number)>=1&&(n as number)<=16384)||(raw.width as number)*(raw.height as number)>16000000)throw imageFailure();return Object.freeze({...raw}) as ImageDescriptor;
}
export function decodeImageUpload(raw:unknown,intent:ImageIntent,userId:string):ImageUploadReceipt{
 imageIntent(intent);if(!imageUuid(userId)||!imageExact(raw,['companyId','conversationId','senderId','clientUploadId','sha256','byteLength','attachmentId','state'])||raw.companyId!==intent.companyId||raw.conversationId!==intent.conversationId||raw.senderId!==userId||raw.clientUploadId!==intent.clientUploadId||raw.sha256!==intent.sha256||raw.byteLength!==intent.byteLength||!imageUuid(raw.attachmentId)||!['quarantined','ready','rejected'].includes(String(raw.state)))throw imageFailure();return Object.freeze({...raw}) as ImageUploadReceipt;
}
