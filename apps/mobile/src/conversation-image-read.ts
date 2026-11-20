import{imageMessage,imageFailure,type ImageDescriptor,type ImageMessage}from'../../../packages/chat-client/src/image-contract.ts';
import type{ImageTransfer}from'../../../packages/chat-client/src/image-transfer.ts';
import type{LocalImagePreview}from'./local-image.ts';
export type ImageResource=Readonly<{preview:LocalImagePreview;release:()=>void}>;
/** Ephemeral image only; no persistent image cache. current+subscribe must
 * include session, foreground, conversation and the latest removal projection. */
export function createConversationImageRead(input:Readonly<{command:ImageMessage;scope:{current:()=>boolean;subscribe:(f:()=>void)=>()=>void};transport:Pick<ImageTransfer,'read'|'active'>;createResource:(bytes:Uint8Array,descriptor:ImageDescriptor)=>Promise<ImageResource>}>){
 const d=Object.freeze({...input,scope:Object.freeze({...input.scope})});
 const command=imageMessage(d.command);let closed=false,pending=false,resource:ImageResource|null=null,cleanupFailed=false,detachFailed=false;
 let view=Object.freeze({phase:'idle' as 'idle'|'loading'|'ready'|'failed'|'closed',preview:null as LocalImagePreview|null});const listeners=new Set<()=>void>();const ac=new AbortController();let unsubscribe=()=>{};
 const live=()=>{try{return !closed&&d.scope.current()===true&&d.transport.active();}catch{return false;}};
 const emit=()=>{for(const f of [...listeners])try{f();}catch{}};
 const release=()=>{if(!resource)return;try{resource.release();resource=null;cleanupFailed=false;}catch{cleanupFailed=true;}};
 const detach=()=>{try{unsubscribe();unsubscribe=()=>{};detachFailed=false;}catch{detachFailed=true;}};
 function close(){if(closed)return;closed=true;view=Object.freeze({phase:'closed',preview:null});ac.abort();detach();release();emit();}
 const refresh=()=>{if(!live())close();};unsubscribe=d.scope.subscribe(refresh);if(closed)detach();refresh();
 return Object.freeze({snapshot:()=>{refresh();return view;},subscribe:(f:()=>void)=>{listeners.add(f);return()=>{listeners.delete(f);};},
  async load(){if(!live()||pending||view.phase==='ready'||cleanupFailed)return;pending=true;view=Object.freeze({phase:'loading',preview:null});emit();let bytes:Uint8Array|null=null,newResource:ImageResource|null=null;
   try{const r=await d.transport.read(command,ac.signal);bytes=r.bytes;if(!live())throw imageFailure();newResource=await d.createResource(bytes,r.descriptor);const p=newResource.preview;
    if(!live()||!p||p.mime!==r.descriptor.mime||p.bytes!==r.descriptor.byteLength||p.width!==r.descriptor.width||p.height!==r.descriptor.height||p.mode!==r.descriptor.mode||typeof p.uri!=='string'||!p.uri.startsWith('blob:')&&!p.uri.startsWith('file://'))throw imageFailure();
    resource=newResource;newResource=null;view=Object.freeze({phase:'ready',preview:p});emit();
   }catch{if(live()){view=Object.freeze({phase:'failed',preview:null});emit();}}
   finally{bytes?.fill(0);if(newResource){try{newResource.release();}catch{resource=newResource;cleanupFailed=true;close();}}pending=false;}
  },close,cleanupPending:()=>cleanupFailed||detachFailed,retryCleanup:()=>{if(closed){detach();release();}return !cleanupFailed&&!detachFailed;}
 });
}
export type ConversationImageRead=ReturnType<typeof createConversationImageRead>;
