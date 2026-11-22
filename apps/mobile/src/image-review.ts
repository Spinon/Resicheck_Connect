import {LOCAL_IMAGE_PROFILE,localImageHeaderType,optimizedImageName,type LocalImageSource,type LocalImagePreview} from './local-image.ts';
export type ImageReviewPort={pick:()=>Promise<LocalImageSource|null>;prepare:(s:LocalImageSource,m:'original'|'optimized')=>Promise<LocalImagePreview>;owns:(uri:string)=>boolean;read:(uri:string,max:number,signal:AbortSignal)=>Promise<Uint8Array>;release:(uri:string)=>void;dispose:()=>void};
export type ImageReviewView=Readonly<{phase:'idle'|'selecting'|'preparing'|'ready'|'reading'|'closed';source:LocalImageSource|null;preview:LocalImagePreview|null;requestedMode:'original'|'optimized'|null;notice:null|'unavailable'|'original-confirmation-required';canRead:boolean}>;
const empty=(phase:ImageReviewView['phase']):ImageReviewView=>Object.freeze({phase,source:null,preview:null,requestedMode:null,notice:null,canRead:false});
const hidden=empty('closed');
/** One reviewed draft owned by one authorized conversation. This is not a send
 * queue and cannot create messages. Explicit original choice is required when
 * optimization retains the original, because original metadata may remain. */
export function createImageReview(scope:{current:()=>boolean;subscribe:(f:()=>void)=>()=>void},port:ImageReviewPort){
 let cleanupFailed=false,closed=false,busy=false,revision=0,view=empty('idle');let preparationBefore:ImageReviewView|null=null;const listeners=new Set<()=>void>();let unsubscribe=()=>{};
 const notify=()=>{for(const fn of listeners)try{fn();}catch{}},live=()=>{try{return !closed&&scope.current()===true;}catch{return false;}};
 const cleanup=()=>{try{port.dispose();cleanupFailed=false;return true;}catch{cleanupFailed=true;return false;}};
 const close=()=>{if(closed)return;closed=true;revision++;view=hidden;try{unsubscribe();}catch{}cleanup();notify();};
 const current=()=>{if(!live()){close();return false;}return true;},put=(v:ImageReviewView)=>{view=Object.freeze(v);notify();};
 const validSource=(s:LocalImageSource)=>!!s&&typeof s.uri==='string'&&port.owns(s.uri)&&typeof s.name==='string'&&s.name.length>0&&s.name.length<=120&&!/[\u0000-\u001f\u007f]/.test(s.name)&&Number.isSafeInteger(s.bytes)&&s.bytes>0&&s.bytes<=LOCAL_IMAGE_PROFILE.maxBytes&&['image/png','image/jpeg','application/pdf'].includes(s.mime);
 function accepted(p:LocalImagePreview,s:LocalImageSource,requested:'original'|'optimized'){
  if(!validSource(p))throw Error();
  const dimensions=p.width===null&&p.height===null||Number.isSafeInteger(p.width)&&Number.isSafeInteger(p.height)&&p.width!>0&&p.height!>0&&p.width!*p.height!<=LOCAL_IMAGE_PROFILE.maxPixels;if(!dimensions)throw Error();
  if(p.mode==='original'){if(p.uri!==s.uri||p.bytes!==s.bytes||p.name!==s.name||p.mime!==s.mime||p.profile!==null||requested!=='original'&&p.retainedOriginal!=='not-smaller')throw Error();}
  else if(requested!=='optimized'||s.mime==='application/pdf'||p.mode!=='optimized'||p.mime!=='image/jpeg'||p.name!==optimizedImageName(s)||typeof p.flattenedTransparency!=='boolean'||p.uri===s.uri||p.bytes>=s.bytes||p.profile!==LOCAL_IMAGE_PROFILE.id||!Number.isSafeInteger(p.width)||!Number.isSafeInteger(p.height)||p.width!<1||p.height!<1||p.width!*p.height!>LOCAL_IMAGE_PROFILE.maxPixels||Math.max(p.width!,p.height!)>LOCAL_IMAGE_PROFILE.longEdge)throw Error();
  const confirm=requested==='optimized'&&p.mode==='original';
  return Object.freeze({phase:'ready' as const,source:Object.freeze({...s}),preview:Object.freeze({...p}),requestedMode:requested,notice:confirm?'original-confirmation-required' as const:null,canRead:!confirm});
 }
 async function run(select:boolean,mode:'original'|'optimized'){
  if(!current()||busy||!select&&!view.source||!['original','optimized'].includes(mode))return false;busy=true;const ticket=++revision,before=view;preparationBefore=before;let next:LocalImageSource|null=null,p:LocalImagePreview|null=null;
  put({...view,phase:select?'selecting':'preparing',notice:null,canRead:false});
  try{
   if(!current()||ticket!==revision)return false;
   next=select?await port.pick():before.source;
   if(!current()||ticket!==revision){if(select&&next)port.release(next.uri);return false;}
   if(!next){put(before);return false;}if(!validSource(next))throw Error();if(mode==='optimized'&&next.mime==='application/pdf')throw Error();
   p=await port.prepare(next,mode);
   if(!current()||ticket!==revision){if(p.uri!==next.uri)port.release(p.uri);if(select)port.release(next.uri);return false;}
   const result=accepted(p,next,mode);
   for(const uri of new Set([before.source?.uri,before.preview?.uri]))if(uri&&uri!==next.uri&&uri!==p.uri)port.release(uri);
   put(result);return true;
  }catch{
   if(p&&p.uri!==next?.uri&&p.uri!==before.preview?.uri)port.release(p.uri);if(select&&next&&next.uri!==before.source?.uri)port.release(next.uri);
   if(current()&&ticket===revision)put({...before,notice:'unavailable'});return false;
  }finally{busy=false;preparationBefore=null;}
 }
 unsubscribe=scope.subscribe(()=>{if(!live())close();});if(closed)unsubscribe();else if(!live())close();
 return Object.freeze({snapshot:()=>current()?view:hidden,subscribe:(f:()=>void)=>{listeners.add(f);return()=>{listeners.delete(f);};},
  select:()=>run(true,'original'),prepare:(m:'original'|'optimized')=>run(false,m),
  async read(signal:AbortSignal){if(!current()||busy||view.phase!=='ready'||!view.canRead||!view.preview||signal.aborted)throw Error('Image unavailable');busy=true;const p=view.preview,ticket=revision;put({...view,phase:'reading',canRead:false});let bytes:Uint8Array|null=null;
   try{if(!current()||ticket!==revision||signal.aborted)throw Error();bytes=await port.read(p.uri,p.bytes,signal);if(!current()||ticket!==revision||signal.aborted||!(bytes instanceof Uint8Array)||bytes.length!==p.bytes||localImageHeaderType(bytes)!==p.mime)throw Error();return bytes;}
   catch{bytes?.fill(0);throw Error('Image unavailable');}
   finally{busy=false;if(current()&&ticket===revision)put({...view,phase:'ready',canRead:true});}},
  cancelPreparation(){if(!current()||!preparationBefore||!['selecting','preparing'].includes(view.phase))return false;const before=preparationBefore;preparationBefore=null;revision++;put(before);return true;},
  cleanupPending:()=>cleanupFailed,retryCleanup:()=>closed&&cleanupFailed?cleanup():!cleanupFailed,
  discard(){if(!current()||busy)return false;revision++;for(const uri of new Set([view.source?.uri,view.preview?.uri]))if(uri)port.release(uri);put(empty('idle'));return true;},dispose:close
 });
}
