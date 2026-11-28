import{imageMessage,imageFailure,type ImageDescriptor,type ImageMessage}from'../../../packages/chat-client/src/image-contract.ts';
import type{ImageTransfer,ImageByteProgress}from'../../../packages/chat-client/src/image-transfer.ts';
import type{LocalImagePreview}from'./local-image.ts';
export type ImageResource=Readonly<{preview:LocalImagePreview;release:()=>void}>;
export function sameImageDescriptor(a:ImageDescriptor,b:ImageDescriptor){return Object.keys(a).every(key=>a[key as keyof ImageDescriptor]===b[key as keyof ImageDescriptor]);}
/** Owned display URI; authenticated transport may use the encrypted disk cache. current+subscribe must
 * include session, foreground, conversation and the latest removal projection. */
export function createConversationImageRead(input:Readonly<{command:ImageMessage;scope:{current:()=>boolean;subscribe:(f:()=>void)=>()=>void};transport:Pick<ImageTransfer,'read'|'active'>;restoreThumbnail?:(signal:AbortSignal)=>Promise<Readonly<{preview:LocalImagePreview;descriptor:ImageDescriptor}>|null>;rememberThumbnail?:(descriptor:ImageDescriptor,preview:LocalImagePreview)=>void;createResource:(bytes:Uint8Array,descriptor:ImageDescriptor)=>Promise<ImageResource>}>){
 const d=Object.freeze({...input,scope:Object.freeze({...input.scope})});
 const command=imageMessage(d.command);let closed=false,pending=false,resource:ImageResource|null=null,cleanupFailed=false,detachFailed=false;
 let view=Object.freeze({phase:'idle' as 'idle'|'loading'|'ready'|'failed'|'closed',preview:null as LocalImagePreview|null,progress:null as ImageByteProgress|null});const listeners=new Set<()=>void>();const ac=new AbortController();let unsubscribe=()=>{};
 const live=()=>{try{return !closed&&d.scope.current()===true&&d.transport.active();}catch{return false;}};
 const emit=()=>{for(const f of [...listeners])try{f();}catch{}};
 const release=()=>{if(!resource)return;try{resource.release();resource=null;cleanupFailed=false;}catch{cleanupFailed=true;}};
 const detach=()=>{try{unsubscribe();unsubscribe=()=>{};detachFailed=false;}catch{detachFailed=true;}};
 function close(){if(closed)return;closed=true;view=Object.freeze({phase:'closed',preview:null,progress:null});ac.abort();detach();release();emit();}
 const refresh=()=>{if(!live())close();};unsubscribe=d.scope.subscribe(refresh);if(closed)detach();refresh();
 let expected:ImageDescriptor|null=null;
 let restored=false,restoreAttempted=false,opening:Promise<string|null>|null=null;
 async function materialize(showProgress:boolean){
  let bytes:Uint8Array|null=null,created:ImageResource|null=null;
  try{
   const r=await d.transport.read(command,ac.signal,progress=>{if(showProgress&&live()){view=Object.freeze({...view,progress});emit();}});
   bytes=r.bytes;if(!live()||expected&&!sameImageDescriptor(expected,r.descriptor))throw imageFailure();
   created=await d.createResource(bytes,r.descriptor);const p=created.preview;
   if(!live()||!p||p.mime!==r.descriptor.mime||p.bytes!==r.descriptor.byteLength||p.width!==r.descriptor.width||p.height!==r.descriptor.height||p.mode!==r.descriptor.mode||typeof p.uri!=='string'||!p.uri.startsWith('blob:')&&!p.uri.startsWith('file://'))throw imageFailure();
   if(showProgress)d.rememberThumbnail?.(r.descriptor,p);
   resource=created;created=null;return p;
  }finally{bytes?.fill(0);if(created){try{created.release();}catch{resource=created;cleanupFailed=true;close();}}}
 }
 function failed(){if(live()){view=Object.freeze({phase:'failed',preview:null,progress:null});emit();}}
 async function load(){
  if(!live()||pending||opening||view.phase==='ready'||cleanupFailed)return;
  pending=true;view=Object.freeze({phase:'loading',preview:null,progress:null});emit();
  try{
   let preview:LocalImagePreview|null=null;
   if(!restoreAttempted&&d.restoreThumbnail){restoreAttempted=true;const warm=await d.restoreThumbnail(ac.signal);if(warm){preview=warm.preview;expected=warm.descriptor;}}
   if(!live())return;
   restored=preview!==null;
   preview??=await materialize(true);
   if(live()){view=Object.freeze({phase:'ready',preview,progress:null});emit();}
  }catch{failed();}finally{pending=false;}
 }
 // A thumbnail in Android's bitmap cache doesn't own a file for the zoomed viewer.
 // Materialize that file only on demand, through the usual verified reader.
 function viewerUri():Promise<string|null>{
  if(!live()||view.phase!=='ready')return Promise.resolve(null);
  if(resource)return Promise.resolve(resource.preview.uri);
  if(!opening)opening=materialize(false).then(p=>{
   if(live()&&view.phase==='ready')return p.uri;
   release();return null;
  }).catch(()=>{failed();return null;}).finally(()=>{opening=null;});
  return opening;
 }
 return Object.freeze({snapshot:()=>{refresh();return view;},subscribe:(f:()=>void)=>{listeners.add(f);return()=>{listeners.delete(f);};},load,viewerUri,
  displayFailed(){
   if(!live()||pending||view.phase!=='ready')return;
   if(restored&&!opening){
    restored=false;
    if(resource){view=Object.freeze({phase:'ready',preview:resource.preview,progress:null});emit();return;}
    view=Object.freeze({phase:'idle',preview:null,progress:null});emit();void load();return;
   }
   release();if(cleanupFailed){close();return;}failed();
  },close,cleanupPending:()=>cleanupFailed||detachFailed,retryCleanup:()=>{if(closed){detach();release();}return !cleanupFailed&&!detachFailed;}
 });
}
export type ConversationImageRead=ReturnType<typeof createConversationImageRead>;
