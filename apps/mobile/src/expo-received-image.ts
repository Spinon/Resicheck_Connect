import{Directory,File,Paths}from'expo-file-system';import{uuid}from'expo-modules-core';
import type{ImageDescriptor}from'../../../packages/chat-client/src/image-contract.ts';
import type{ImageResource}from'./conversation-image-read.ts';
import{sweepReceivedImages}from'./received-image-cache-sweep.ts';
const active=new Set<string>(),failedCreationCleanup=new Map<string,()=>void>();
/** New app-private cache directory only. Never a picker/provider/original URI.
 * No URL/token/account identifier in paths. Fail-closed on incomplete cleanup. */
export async function createExpoReceivedImage(bytes:Uint8Array,d:ImageDescriptor):Promise<ImageResource>{
 if(bytes.length!==d.byteLength)throw Error('Image unavailable');
 for(const[name,release]of failedCreationCleanup){release();failedCreationCleanup.delete(name);}
 const sweep=sweepReceivedImages(Paths.cache.list().filter((e):e is Directory=>e instanceof Directory).map(dir=>({name:dir.name,files:()=>dir.list().map(f=>({name:f.name,regular:f instanceof File,remove:()=>f.delete()})),removeEmpty:()=>{if(dir.list().length===0)dir.delete();}})),active);if(sweep.failed)throw Error('Image unavailable');
 const folder=new Directory(Paths.cache,'connect-received-image-'+uuid.v4()),file=new File(folder,'image'+(d.mime==='image/png'?'.png':'.jpg'));let released=false;active.add(folder.name);
 const release=()=>{if(released)return;if(file.exists)file.delete();if(folder.exists){if(folder.list().length)throw Error('Image unavailable');folder.delete();}released=true;active.delete(folder.name);failedCreationCleanup.delete(folder.name);};
 try{folder.create();file.create();file.write(bytes);if(!file.exists||file.size!==d.byteLength)throw Error();return Object.freeze({preview:Object.freeze({uri:file.uri,name:'Imagem',mime:d.mime,bytes:d.byteLength,width:d.width,height:d.height,mode:d.mode,profile:d.mode==='optimized'?'candidate-document-3508-q90-v2':null}),release});}catch{try{release();}catch{failedCreationCleanup.set(folder.name,release);}throw Error('Image unavailable');}
}
