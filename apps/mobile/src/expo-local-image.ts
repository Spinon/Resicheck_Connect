import{readLocalImageHeader}from './read-local-image-header.ts';
import{readReviewedImage}from './read-reviewed-image.ts';
import {fileDisplayName} from '../../../packages/text/src/file-display-name.ts';
import {getDocumentAsync} from 'expo-document-picker';import {ImageManipulator,SaveFormat} from 'expo-image-manipulator';
import {Directory,File,FileMode,Paths} from 'expo-file-system';import {Image,NativeModules} from 'react-native';
import{nativePngJpeg}from'./native-image-jpeg.ts';import {uuid} from 'expo-modules-core';
import {LOCAL_IMAGE_PROFILE,localImageHeaderType,imageResizePlan,prepareLocalImage,optimizedImageName,type LocalImageSource,type LocalImagePreview} from './local-image.ts';
import {copyImageSource} from './copy-image-source.ts';
import {sweepImageCache} from './image-cache-sweep.ts';
let nativeRendering=false;const fail=()=>Error('Local image unavailable');
const activeFolders=new Set<string>();
// Private disposable copies only. Never removes a picker/provider/original URI.
export function createExpoLocalImage(current:()=>boolean,diagnostic?:(stage:string)=>void,imagesOnly=false){
 // Reclaim only recognizable orphan draft folders, never provider originals.
 sweepImageCache(Paths.cache.list().filter((e):e is Directory=>e instanceof Directory).map(dir=>({name:dir.name,files:()=>dir.list().map(f=>({name:f.name,regular:f instanceof File,remove:()=>f.delete()})),removeEmpty:()=>{if(dir.list().length===0)dir.delete();}})),activeFolders);
 const folder=new Directory(Paths.cache,'connect-image-'+uuid.v4()),owned=new Map<string,File>();let closed=false;
 activeFolders.add(folder.name);
 const valid=()=>!closed&&current();
 const stage=(value:string)=>{try{diagnostic?.(value);}catch{}};
 function track(file:File){if(!file.uri.startsWith(folder.uri.replace(/\/$/,'')+'/'))throw fail();owned.set(file.uri,file);return file;}
 function remove(uri:string){const file=owned.get(uri);if(!file)return;if(file.exists)file.delete();owned.delete(uri);}
 function inspect(file:File){return readLocalImageHeader({expectedBytes:file.size,current:valid,open:()=>file.open(FileMode.ReadOnly)});}
 function typeOf(file:File){return inspect(file).mime;}
 const copy=(source:File,target:File)=>copyImageSource({expectedBytes:source.size,maxBytes:LOCAL_IMAGE_PROFILE.maxBytes,current:valid,openSource:()=>source.open(FileMode.ReadOnly),openTarget:()=>{target.create();return target.open(FileMode.WriteOnly);},yield:()=>new Promise<void>(r=>setTimeout(r,0))});
 async function importFile(uri:string,name:string):Promise<LocalImageSource>{let file:File|null=null;
  try{if(!valid()||!['file://','content://'].some(prefix=>uri.startsWith(prefix)))throw fail();const source=new File(uri);if(!source.exists||source.size<1||source.size>LOCAL_IMAGE_PROFILE.maxBytes)throw fail();
   const mime=typeOf(source);
   if(!mime||imagesOnly&&mime==='application/pdf'||!valid())throw fail();folder.create({intermediates:true,idempotent:true});file=track(new File(folder,'source-'+uuid.v4()+(mime==='image/png'?'.png':mime==='image/jpeg'?'.jpg':'.pdf')));await copy(source,file);
   if(!valid()||!file.exists||file.size!==source.size||file.size>LOCAL_IMAGE_PROFILE.maxBytes||typeOf(file)!==mime)throw fail();
   return Object.freeze({uri:file.uri,name:fileDisplayName(name),mime,bytes:file.size});
  }catch{if(file)try{remove(file.uri);}catch{}throw fail();}
 }
 async function prepare(source:LocalImageSource,mode:'original'|'optimized'){
  const imported=owned.get(source.uri);if(!imported||!valid()||!imported.exists||imported.size!==source.bytes||typeOf(imported)!==source.mime)throw fail();
  const header=inspect(imported);if(header.mime!==source.mime)throw fail();
  const dimensions=()=>new Promise<{width:number;height:number}>((resolve,reject)=>{if(!valid()||!header.dimensions){reject(fail());return;}const expected=header.dimensions;stage('dimensions-requested');Image.getSize(source.uri,(width,height)=>{try{if(!valid()||!((width===expected.width&&height===expected.height)||(width===expected.height&&height===expected.width)))throw fail();imageResizePlan(width,height);stage('dimensions-ready');resolve({width,height});}catch{reject(fail());}},()=>reject(fail()));});
  const preview=await prepareLocalImage(source,mode,{current:valid,dimensions,removeDerived:async value=>{remove(value.uri);},render:async(plan,quality)=>{
   if(nativeRendering||!valid())throw fail();nativeRendering=true;let context:ReturnType<typeof ImageManipulator.manipulate>|null=null,rendered:Awaited<ReturnType<ReturnType<typeof ImageManipulator.manipulate>['renderAsync']>>|null=null,saved:string|null=null,target:File|null=null,flattenInput:File|null=null;let flattenedTransparency=false;
   try{stage('render-started');context=ImageManipulator.manipulate(source.uri);context.resize(plan);rendered=await context.renderAsync();stage('render-ready');if(!valid())throw fail();const result=await rendered.saveAsync({format:source.mime==='image/png'?SaveFormat.PNG:SaveFormat.JPEG,compress:source.mime==='image/png'?1:quality,base64:false});saved=result.uri;stage('saved');
    if(!saved.startsWith(Paths.cache.uri)||saved===source.uri||!valid())throw fail();stage('saved-uri-owned');const f=new File(saved);if(!f.exists||f.size<1||f.size>LOCAL_IMAGE_PROFILE.maxBytes)throw fail();stage('saved-bytes-valid');target=track(new File(folder,'optimized-'+uuid.v4()+'.jpg'));if(source.mime==='image/png'){flattenInput=track(new File(folder,'flatten-source-'+uuid.v4()+'.png'));await copy(f,flattenInput);const flattened=await nativePngJpeg(NativeModules.ConnectImagePreparation)({sourceUri:flattenInput.uri,targetUri:target.uri,bytes:flattenInput.size,width:result.width,height:result.height,quality});flattenedTransparency=flattened.flattenedTransparency;if(!target.exists||target.size!==flattened.bytes)throw fail();}else await copy(f,target);if(typeOf(target)!=='image/jpeg')throw fail();stage('copy-ready');
    if(!valid())throw fail();return Object.freeze({uri:target.uri,name:optimizedImageName(source),mime:'image/jpeg',bytes:target.size,width:result.width,height:result.height,mode:'optimized',profile:LOCAL_IMAGE_PROFILE.id,flattenedTransparency}) as LocalImagePreview;
   }catch{if(target)try{remove(target.uri);}catch{}throw fail();}finally{if(flattenInput)try{remove(flattenInput.uri);}catch{}if(saved&&saved!==source.uri&&saved.startsWith(Paths.cache.uri))try{new File(saved).delete();}catch{}try{rendered?.release();}catch{}try{context?.release();}catch{}nativeRendering=false;}
  }});
  if(mode==='original'&&source.mime!=='application/pdf'){
   try{const size=await dimensions();imageResizePlan(size.width,size.height);if(!valid())throw fail();return Object.freeze({...preview,...size});}
   catch{if(!valid())throw fail();return preview;}
  }
  return preview;
 }
 return Object.freeze({importFile,prepare,owns:(uri:string)=>valid()&&owned.has(uri),read:async(uri:string,max:number,signal:AbortSignal)=>{const f=owned.get(uri);if(!valid()||!f||!f.exists)throw fail();return readReviewedImage({expectedBytes:f.size,maxBytes:max,current:()=>valid()&&owned.get(uri)===f,signal,open:()=>f.open(FileMode.ReadOnly),yield:()=>new Promise<void>(r=>setTimeout(r,0))});},pick:async()=>{if(!valid())throw fail();const selection=await getDocumentAsync({type:imagesOnly?['image/png','image/jpeg']:['image/png','image/jpeg','application/pdf'],multiple:false,copyToCacheDirectory:false});if(selection.canceled)return null;if(!valid()||selection.assets.length!==1)throw fail();return importFile(selection.assets[0].uri,selection.assets[0].name);},release:(uri:string)=>remove(uri),dispose:()=>{closed=true;let failed=false;for(const uri of [...owned.keys()])try{remove(uri);}catch{failed=true;}try{if(folder.exists){if(folder.list().length===0)folder.delete();else failed=true;}}catch{failed=true;}if(failed||owned.size>0)throw fail();activeFolders.delete(folder.name);}});
}
