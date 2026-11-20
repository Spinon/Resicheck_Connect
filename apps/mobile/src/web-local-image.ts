import {fileDisplayName} from '../../../packages/text/src/file-display-name.ts';
import {LOCAL_IMAGE_PROFILE,localImageHeaderType,prepareLocalImage,type LocalImageSource,type LocalImagePreview} from './local-image.ts';
import {imageHeaderBounds} from './image-header-bounds.ts';

const unavailable=()=>Error('Image unavailable'),MAX_OWNED=3*LOCAL_IMAGE_PROFILE.maxBytes;
type Owned={blob:Blob;name:string;mime:LocalImageSource['mime'];size:{width:number;height:number}|null};
/** Ephemeral local files only. No fetch, persistence, Auth or upload.
 * Every URL belongs to this adapter; release/dispose never touch the source File.
 * Browser decode is bounded, not a substitute for server inspection. */
export function createWebLocalImage(current:()=>boolean,imagesOnly=false){
 let closed=false,rendering=false,pendingCancel:(()=>void)|null=null;
 const owned=new Map<string,Owned>();
 const valid=()=>{try{return !closed&&current()===true;}catch{return false;}};
 const assertLive=()=>{if(!valid())throw unavailable();};
 const release=(uri:string)=>{if(owned.delete(uri))URL.revokeObjectURL(uri);};
 function track(value:Owned){assertLive();if([...owned.values()].reduce((n,v)=>n+v.blob.size,0)+value.blob.size>MAX_OWNED)throw unavailable();const uri=URL.createObjectURL(value.blob);owned.set(uri,value);return uri;}
 function get(source:LocalImageSource){assertLive();const r=owned.get(source.uri);if(!r||r.name!==source.name||r.mime!==source.mime||r.blob.size!==source.bytes)throw unavailable();return r;}
 async function importFile(file:File):Promise<LocalImageSource>{
  assertLive();if(!(file instanceof File)||!Number.isSafeInteger(file.size)||file.size<1||file.size>LOCAL_IMAGE_PROFILE.maxBytes)throw unavailable();
  const header=new Uint8Array(await file.slice(0,Math.min(file.size,1048576)).arrayBuffer());assertLive();
  const mime=localImageHeaderType(header);if(!mime||imagesOnly&&mime==='application/pdf')throw unavailable();
  const size=mime==='application/pdf'?null:imageHeaderBounds(header,mime);
  const blob=file.slice(0,file.size,mime),name=fileDisplayName(file.name);assertLive();const uri=track({blob,name,mime,size});
  return Object.freeze({uri,name,mime,bytes:blob.size});
 }
 async function prepare(source:LocalImageSource,mode:'original'|'optimized'):Promise<LocalImagePreview>{
  const row=get(source);if(rendering)throw unavailable();rendering=true;let bitmap:ImageBitmap|null=null;
  const dimensions=async()=>{if(!row.size)throw unavailable();assertLive();bitmap=await createImageBitmap(row.blob,{imageOrientation:'from-image'});assertLive();
   const {width:w,height:h}=bitmap,s=row.size;if(!((w===s.width&&h===s.height)||(w===s.height&&h===s.width)))throw unavailable();return{width:w,height:h};};
  try{
   const result=await prepareLocalImage(source,mode,{current:valid,dimensions,removeDerived:async p=>release(p.uri),render:async(plan,q)=>{
    assertLive();if(!bitmap)throw unavailable();const canvas=document.createElement('canvas');canvas.width=plan.width;canvas.height=plan.height;
    try{const ctx=canvas.getContext('2d');if(!ctx)throw unavailable();ctx.drawImage(bitmap,0,0,plan.width,plan.height);
     const blob=await new Promise<Blob>((yes,no)=>canvas.toBlob(b=>b?yes(b):no(unavailable()),source.mime,q));assertLive();
     if(blob.type!==source.mime||blob.size<1||blob.size>LOCAL_IMAGE_PROFILE.maxBytes)throw unavailable();const uri=track({blob,name:source.name,mime:source.mime,size:plan});
     return Object.freeze({...source,uri,bytes:blob.size,width:plan.width,height:plan.height,mode:'optimized',profile:LOCAL_IMAGE_PROFILE.id});
    }finally{canvas.width=1;canvas.height=1;}
   }});
   if(mode==='original'&&source.mime!=='application/pdf'){const s=await dimensions();return Object.freeze({...result,...s});}
   return result;
  }catch{throw unavailable();}finally{if(bitmap)(bitmap as ImageBitmap).close();rendering=false;}
 }
 const dispose=()=>{if(closed)return;closed=true;pendingCancel?.();pendingCancel=null;for(const uri of [...owned.keys()])release(uri);};
 return Object.freeze({importFile,prepare,owns:(uri:string)=>valid()&&owned.has(uri),release,dispose,
  async read(uri:string,max:number,signal:AbortSignal){assertLive();const r=owned.get(uri);if(!r||!Number.isSafeInteger(max)||max<1||max>LOCAL_IMAGE_PROFILE.maxBytes||r.blob.size>max||signal.aborted)throw unavailable();
   const bytes=new Uint8Array(await r.blob.arrayBuffer());if(!valid()||signal.aborted||bytes.length!==r.blob.size){bytes.fill(0);throw unavailable();}return bytes;},
  pick():Promise<LocalImageSource|null>{assertLive();if(pendingCancel)throw unavailable();
   return new Promise((resolve,reject)=>{const input=document.createElement('input');input.type='file';input.accept=imagesOnly?'image/png,image/jpeg':'image/png,image/jpeg,application/pdf';input.multiple=false;input.style.display='none';let finished=false;
    const finish=(value:LocalImageSource|null,error=false)=>{if(finished){if(value)release(value.uri);return;}finished=true;input.remove();input.removeEventListener('change',change);input.removeEventListener('cancel',cancel);pendingCancel=null;error?reject(unavailable()):resolve(value);};
    const cancel=()=>finish(null),change=()=>{const file=input.files?.length===1?input.files[0]:null;if(!file){finish(null);return;}void importFile(file).then(v=>finish(v),()=>finish(null,true));};
    pendingCancel=cancel;input.addEventListener('change',change);input.addEventListener('cancel',cancel);document.body.append(input);try{input.click();}catch{finish(null,true);}
   });
  }
 });
}
