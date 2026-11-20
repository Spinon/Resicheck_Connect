import{createHash}from'node:crypto';
import{imageIntent,imageScope,imageCommit,imageMessage,imageFailure,imageExact,imageUuid,decodeImageUpload,type ImageIntent,type ImageScope}from'../../chat-client/src/image-contract.ts';
import type{VerifiedImageSqlSession,ImageSqlCommand}from'./image-sql-executor.ts';import type{createPrivateImageStorage}from'./image-private-storage.ts';
import{createImagePrivateRead}from'./image-private-read.ts';import type{ImageTransferBackend}from'./image-transfer-handler.ts';
type Storage=ReturnType<typeof createPrivateImageStorage>;
const hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const intentParams=(c:ImageIntent)=>({p_company:c.companyId,p_conversation:c.conversationId,p_client:c.clientUploadId,p_digest:c.sha256,p_bytes:c.byteLength,p_mode:c.mode,p_type:c.mime,p_profile:c.profile});
/** Concrete session/catalog/storage composition. Never certifies inspection.
 * verify must bind real Auth-server claims; SQL checks live session per call.
 * storage must be the separate create-only image adapter, never an admin key. */
export async function openImageBackend(input:Readonly<{enabled?:boolean;credential:string;scope:ImageScope;signal:AbortSignal;verify:(credential:string)=>Promise<VerifiedImageSqlSession>;readPublished:(descriptor:import('./image-private-read.ts').PrivateImageDescriptor,signal:AbortSignal)=>Promise<Uint8Array>;storage:(current:()=>boolean)=>Storage}>):Promise<ImageTransferBackend>{
 const d=Object.freeze({...input,scope:Object.freeze({...input.scope})});
 const scope=d.scope;imageScope(scope);if(d.enabled!==true||d.signal.aborted)throw imageFailure();
 let session:VerifiedImageSqlSession|null=null,storage:Storage|null=null,closed=false;
 const current=()=>{try{return !closed&&!d.signal.aborted&&session?.current()===true;}catch{return false;}};
 const live=()=>{if(!current())throw imageFailure();};
 const context=(c:ImageScope)=>{live();if(c.companyId!==scope.companyId||c.conversationId!==scope.conversationId)throw imageFailure();};
 const close=()=>{if(closed)return;closed=true;session?.close();storage?.close();d.signal.removeEventListener('abort',close);};
 const call=async(name:ImageSqlCommand['name'],params:Record<string,unknown>,signal:AbortSignal)=>{live();if(signal.aborted)throw imageFailure();const r=await session!.call({name,params},signal);live();if(signal.aborted)throw imageFailure();return r;};
 try{
  session=await d.verify(d.credential);live();if(!imageUuid(session.userId))throw imageFailure();await call('image_catalog_authorize',{p_company:scope.companyId,p_conversation:scope.conversationId},d.signal);live();storage=d.storage(current);d.signal.addEventListener('abort',close,{once:true});
  const resolveUpload=async(c:ImageIntent,attachmentId:string,signal:AbortSignal)=>{
   const target=await call('image_catalog_resolve_upload',{p_company:scope.companyId,p_conversation:scope.conversationId,p_attachment:attachmentId},signal);
   if(!imageExact(target,['companyId','conversationId','attachmentId','objectKey','sha256','byteLength','mime'])||target.companyId!==scope.companyId||target.conversationId!==scope.conversationId||target.attachmentId!==attachmentId||target.sha256!==c.sha256||target.byteLength!==c.byteLength||target.mime!==c.mime)throw imageFailure();
   return target as Parameters<Storage['putPrivate']>[0];
  };
  const confirmUploaded=async(c:ImageIntent,descriptor:Parameters<Storage['putPrivate']>[0],signal:AbortSignal)=>{let observed:Uint8Array|null=null;
   try{observed=await storage!.readPrivate(descriptor,signal);live();return decodeImageUpload(await call('image_catalog_record_uploaded',{p_company:scope.companyId,p_conversation:scope.conversationId,p_attachment:descriptor.attachmentId,p_content:observed},signal),c,session!.userId);}finally{observed?.fill(0);}
  };
  const status=async(c:ImageIntent,signal:AbortSignal)=>{context(c);const captured=imageIntent(c),receipt=decodeImageUpload(await call('image_catalog_status',intentParams(captured),signal),captured,session!.userId);
   // Lost acknowledgement: resolve the server-owned path and verify actual bytes.
   // No POST/upsert; record_uploaded is idempotent and never certifies inspection.
   return receipt.state==='quarantined'?confirmUploaded(captured,await resolveUpload(captured,receipt.attachmentId,signal),signal):receipt;
  };
  const read=createImagePrivateRead({resolve:async(credential,command,signal)=>{if(credential!==d.credential)throw imageFailure();context(command);imageMessage(command);return await call('image_catalog_resolve_read',{p_company:scope.companyId,p_conversation:scope.conversationId,p_message:command.messageId},signal) as Awaited<ReturnType<Parameters<typeof createImagePrivateRead>[0]['resolve']>>;},readPrivate:(v,signal)=>d.readPublished(v,signal)});
  return Object.freeze({userId:session.userId,close,read,status,
   async upload(c:ImageIntent,bytes:Uint8Array,signal:AbortSignal){context(c);const captured=imageIntent(c);if(!(bytes instanceof Uint8Array)||bytes.length!==captured.byteLength||hash(bytes)!==captured.sha256)throw imageFailure();
    const raw=await call('image_reserve',intentParams(captured),signal);if(!imageExact(raw,['id','state'])||!imageUuid(raw.id)||!['reserved','uploaded','ready','rejected'].includes(String(raw.state)))throw imageFailure();
    if(raw.state==='ready'||raw.state==='rejected'||raw.state==='uploaded')return status(captured,signal);
    const descriptor=await resolveUpload(captured,raw.id,signal);await storage!.putPrivate(descriptor,bytes,signal);live();
    return confirmUploaded(captured,descriptor,signal);
   },
   async commit(kind:'send'|'lookup',c,signal){context(c);imageCommit(c);if(kind!=='send'&&kind!=='lookup')throw imageFailure();return call(kind==='send'?'image_message_send':'image_message_lookup',{p_company:scope.companyId,p_conversation:scope.conversationId,p_client:c.clientMessageId,p_attachment:c.attachmentId},signal);}
  });
 }catch{close();throw imageFailure();}
}
