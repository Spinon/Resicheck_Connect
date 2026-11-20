import type {ConversationMediaScopePort} from './conversation-media-scope.ts';
import {LOCAL_IMAGE_PROFILE,imageResizePlan,type LocalImageSource,type LocalImagePreview} from './local-image.ts';

export const DEMO_IMAGE_LIMITS=Object.freeze({messages:8,savedBytes:24*1024*1024});
export type DemoImageFixture='png'|'jpeg'|'codes'|'shadow'|'low';
export type DemoImagePort={pick:()=>Promise<LocalImageSource|null>;pickFixture?:(key:DemoImageFixture)=>Promise<LocalImageSource|null>;prepare:(source:LocalImageSource,mode:'original'|'optimized')=>Promise<LocalImagePreview>;release:(uri:string)=>void|Promise<void>;dispose:()=>void|Promise<void>};
export type DemoImageReview=Readonly<{requestedMode:'original'|'optimized';actualMode:'original'|'optimized'|null;status:'ready'|'unavailable';visualPreviewAvailable:boolean}>;
export type DemoImageMessage=Readonly<{id:string;preview:LocalImagePreview;review:DemoImageReview;delivery:'local-only';label:'Somente neste aparelho · Não enviada'}>;
export type DemoImageView=Readonly<{contextId:number;phase:'closed'|'clearing'|'idle'|'picking'|'preparing'|'ready'|'saving'|'blocked'|'unavailable';source:LocalImageSource|null;preview:LocalImagePreview|null;review:DemoImageReview|null;messages:readonly DemoImageMessage[];notice:null|'unavailable'|'limit'|'setup'}>;
type Capability=NonNullable<ReturnType<ConversationMediaScopePort['captureConversationContext']>>;
type Context={cap:Capability;port:DemoImagePort|null;view:DemoImageView;intent:number;work:Promise<boolean>|null;cleanupFailed:boolean;recovering:boolean};
const empty=(phase:DemoImageView['phase']):DemoImageView=>Object.freeze({contextId:0,phase,source:null,preview:null,review:null,messages:Object.freeze([]),notice:null});
const hidden=empty('closed');
function sourceValid(s:LocalImageSource){return s&&typeof s.uri==='string'&&s.uri.startsWith('file://')&&s.uri.length<=4096&&typeof s.name==='string'&&s.name.length>0&&s.name.length<=120&&!/[\u0000-\u001f\u007f]/.test(s.name)&&Number.isSafeInteger(s.bytes)&&s.bytes>0&&s.bytes<=LOCAL_IMAGE_PROFILE.maxBytes&&['image/png','image/jpeg','application/pdf'].includes(s.mime);}
function previewValid(p:LocalImagePreview,s:LocalImageSource,mode:'original'|'optimized'){
 if(!sourceValid(p)||p.mime!==s.mime||p.name!==s.name)return false;
 if(p.mode==='original')return p.uri===s.uri&&p.bytes===s.bytes&&p.profile===null&&(mode==='original'||p.retainedOriginal==='not-smaller')&&((p.width===null&&p.height===null)||dimensionsValid(p));
 return mode==='optimized'&&s.mime!=='application/pdf'&&p.mode==='optimized'&&p.uri!==s.uri&&p.profile===LOCAL_IMAGE_PROFILE.id&&p.bytes<s.bytes&&dimensionsValid(p)&&Math.max(p.width!,p.height!)<=LOCAL_IMAGE_PROFILE.longEdge;
}
function dimensionsValid(p:LocalImagePreview){try{imageResizePlan(p.width!,p.height!);return true;}catch{return false;}}
const reviewReady=(p:LocalImagePreview,requestedMode:'original'|'optimized'):DemoImageReview=>Object.freeze({requestedMode,actualMode:p.mode,status:'ready',visualPreviewAvailable:p.mime!=='application/pdf'&&p.width!==null&&p.height!==null});
const reviewUnavailable=(requestedMode:'original'|'optimized'):DemoImageReview=>Object.freeze({requestedMode,actualMode:null,status:'unavailable',visualPreviewAvailable:false});
const derivedUri=(value:LocalImagePreview|null,source:string|undefined)=>value?.uri&&value.uri!==source?value.uri:null;

// Synthetic, session-only private copies. No dispatch, journal, queue or transport.
// Port factory must return a NEW independently owned adapter for each capability.
export function createDemoImageSession(session:ConversationMediaScopePort,createPort:(current:()=>boolean)=>DemoImagePort){
 let ctx:Context|null=null,disposed=false,sequence=0,contextSequence=0,cleanupBarrier:Promise<void>=Promise.resolve();
 const listeners=new Set<()=>void>(),pending=new Set<Promise<unknown>>(),unresolved=new Set<Context>();
 const valid=(c:Context)=>!disposed&&ctx===c&&c.cap.current();
 const notify=()=>{for(const f of listeners)try{f();}catch{}};
 const update=(c:Context,patch:Partial<DemoImageView>)=>{if(valid(c)){c.view=Object.freeze({...c.view,...patch,contextId:c.view.contextId});notify();}};
 function watch<T>(p:Promise<T>){pending.add(p);void p.then(()=>pending.delete(p),()=>pending.delete(p));return p;}
 function launch(c:Context,body:()=>Promise<boolean>){const p=watch(body());c.work=p;void p.then(()=>{if(c.work===p)c.work=null;},()=>{if(c.work===p)c.work=null;});return p;}
 const activeIntent=(c:Context,ticket:number)=>valid(c)&&c.intent===ticket;
 async function release(c:Context,uris:readonly string[]){const results=await Promise.allSettled([...new Set(uris)].map(uri=>Promise.resolve().then(()=>c.port!.release(uri))));if(results.some(r=>r.status==='rejected')){c.cleanupFailed=true;unresolved.add(c);throw Error('Local image unavailable');}}
 function disposePort(c:Context){if(!c.port){unresolved.delete(c);return Promise.resolve();}unresolved.add(c);let p:Promise<void>;try{p=Promise.resolve(c.port.dispose());}catch{p=Promise.reject(Error('Local image unavailable'));}return watch(p.then(()=>{unresolved.delete(c);},()=>{throw Error('Local image unavailable');}));}
 function blocked(c:Context){c.intent++;update(c,{...empty('blocked'),notice:'unavailable'});void disposePort(c).catch(()=>{});}
 function createContext(cap:Capability,phase:DemoImageView['phase']){const c:Context={cap,port:null,view:Object.freeze({...empty(phase),contextId:++contextSequence}),intent:0,work:null,cleanupFailed:false,recovering:false};try{c.port=createPort(()=>valid(c));}catch{c.view=Object.freeze({...c.view,phase:'unavailable',notice:'setup'});}return c;}
 function sync(){if(disposed)return;const id=session.getSnapshot().activeConversationId,cap=id?session.captureConversationContext(id):null;if(cap&&ctx?.cap.token===cap.token&&ctx.cap.current())return;if(!cap&&!ctx)return;
  const previous=ctx;ctx=null;const work=previous?.work;const cleanup=previous?(async()=>{await Promise.all([cleanupBarrier,disposePort(previous)]);await work;await disposePort(previous);})():cleanupBarrier;cleanupBarrier=cleanup;
  if(cap){let c:Context;try{c=createContext(cap,'clearing');ctx=c;}catch{notify();return;}
   void watch(cleanup.then(()=>{if(valid(c))update(c,c.port?{phase:'idle'}:{phase:'unavailable',notice:'setup'});},()=>{if(valid(c))blocked(c);}));
  }else void cleanup.catch(()=>{});notify();
 }
 const unsubscribe=session.subscribe(sync);sync();
 function bind(){const c=ctx,current=()=>c!==null&&valid(c),available=()=>current()&&c!.port!==null&&(c!.view.phase==='idle'||c!.view.phase==='ready');
  const pick=(fixture?:DemoImageFixture)=>{if(!c||!available()||fixture!==undefined&&(!['png','jpeg','codes','shadow','low'].includes(fixture)||!c.port!.pickFixture))return Promise.resolve(false);const before=c.view,ticket=++c.intent;update(c,{phase:'picking',notice:null});return launch(c,async()=>{let next:LocalImageSource|null=null,result:LocalImagePreview|null=null;
    try{next=await (fixture===undefined?c.port!.pick():c.port!.pickFixture!(fixture));if(!activeIntent(c,ticket)){if(next)await release(c,[next.uri]);return false;}if(!next){update(c,{phase:before.phase});return false;}if(!sourceValid(next)||c.view.messages.some(m=>m.preview.uri===next!.uri))throw Error();
     const old=[before.source?.uri,before.preview?.uri].filter((u):u is string=>!!u&&u!==next!.uri);await release(c,old);if(!activeIntent(c,ticket)){await release(c,[next.uri]);return false;}
     update(c,{phase:'preparing',source:Object.freeze({...next}),preview:null,review:null});
     if(!activeIntent(c,ticket)){await release(c,[next.uri]);return false;}
     try{result=await c.port!.prepare(next,'original');}catch{if(activeIntent(c,ticket))update(c,{phase:'idle',preview:null,review:reviewUnavailable('original'),notice:'unavailable'});return false;}
     if(!activeIntent(c,ticket)){await release(c,[next.uri,...(result.uri!==next.uri?[result.uri]:[])]);return false;}if(!previewValid(result,next,'original'))throw Error();
     update(c,{phase:'ready',preview:Object.freeze({...result}),review:reviewReady(result,'original')});return true;
    }catch{const derived=derivedUri(result,next?.uri);if(derived)try{await release(c,[derived]);}catch{}if(next)try{await release(c,[next.uri]);}catch{}if(activeIntent(c,ticket))blocked(c);return false;}});};
  return Object.freeze({pick:()=>pick(),pickFixture:(key:DemoImageFixture)=>pick(key),
   prepare:(mode:'original'|'optimized')=>{if(!c||!available()||!c.view.source||!['original','optimized'].includes(mode)||mode==='optimized'&&c.view.source.mime==='application/pdf')return Promise.resolve(false);const source=c.view.source,old=c.view.preview,ticket=++c.intent;update(c,{phase:'preparing',notice:null});return launch(c,async()=>{let result:LocalImagePreview|null=null;
    try{if(!activeIntent(c,ticket))return false;try{result=await c.port!.prepare(source,mode);}catch{if(mode!=='original')throw Error();if(old&&old.uri!==source.uri)await release(c,[old.uri]);if(activeIntent(c,ticket))update(c,{phase:'idle',preview:null,review:reviewUnavailable(mode),notice:'unavailable'});return false;}
     if(!activeIntent(c,ticket)){if(result.uri!==source.uri)await release(c,[result.uri]);return false;}if(!previewValid(result,source,mode)||c.view.messages.some(m=>m.preview.uri===result!.uri))throw Error();
     if(old&&old.uri!==source.uri&&old.uri!==result.uri)await release(c,[old.uri]);if(!activeIntent(c,ticket)){if(result.uri!==source.uri)await release(c,[result.uri]);return false;}
     update(c,{phase:'ready',preview:Object.freeze({...result}),review:reviewReady(result,mode)});return true;
    }catch{const derived=derivedUri(result,source.uri);if(derived)try{await release(c,[derived]);}catch{}if(activeIntent(c,ticket))blocked(c);return false;}});},
   save:()=>{if(!c||!current()||c.view.phase!=='ready'||!c.view.preview||!c.view.source||c.view.review?.status!=='ready')return Promise.resolve(false);const p=c.view.preview,s=c.view.source,review=c.view.review;
    if(c.view.messages.length>=DEMO_IMAGE_LIMITS.messages||c.view.messages.reduce((n,m)=>n+m.preview.bytes,0)+p.bytes>DEMO_IMAGE_LIMITS.savedBytes){update(c,{notice:'limit'});return Promise.resolve(false);}const ticket=++c.intent;update(c,{phase:'saving',notice:null});
    return launch(c,async()=>{try{if(p.uri!==s.uri)await release(c,[s.uri]);if(!activeIntent(c,ticket))return false;const message=Object.freeze({id:'local-image-'+(++sequence),preview:p,review,delivery:'local-only' as const,label:'Somente neste aparelho · Não enviada' as const});update(c,{phase:'idle',source:null,preview:null,review:null,messages:Object.freeze([...c.view.messages,message])});return true;}catch{if(activeIntent(c,ticket))blocked(c);return false;}});},
   discard:()=>{if(!c||!current()||c.recovering||['blocked','closed','unavailable'].includes(c.view.phase)||c.view.phase==='clearing'&&!c.work)return Promise.resolve(false);const work=c.work,ticket=++c.intent,uris=[c.view.source?.uri,c.view.preview?.uri].filter((u):u is string=>!!u);update(c,{phase:'clearing',source:null,preview:null,review:null,notice:null});return launch(c,async()=>{try{await work;await release(c,uris);if(c.cleanupFailed)throw Error();if(!activeIntent(c,ticket))return false;update(c,{phase:'idle'});return true;}catch{if(activeIntent(c,ticket))blocked(c);return false;}});},
   retrySetup:()=>{if(!c||!current()||c.view.phase!=='unavailable'||c.port!==null||c.recovering)return Promise.resolve(false);const barrier=cleanupBarrier,ticket=++c.intent;c.recovering=true;update(c,{phase:'clearing',notice:null});return launch(c,async()=>{try{await barrier;if(!activeIntent(c,ticket))return false;const next=createContext(c.cap,'idle');ctx=next;notify();return next.port!==null;}catch{c.recovering=false;if(activeIntent(c,ticket))blocked(c);return false;}});},
   retryCleanup:()=>{if(!c||!current()||c.view.phase!=='blocked')return Promise.resolve(false);const targets=[...new Set([...unresolved,c])];for(const t of targets)t.intent++;const ticket=c.intent;c.recovering=true;update(c,{...empty('clearing')});return watch((async()=>{try{await Promise.all(targets.map(t=>t.work));await Promise.all(targets.map(t=>disposePort(t)));if(!activeIntent(c,ticket))return false;const next=createContext(c.cap,'idle');cleanupBarrier=Promise.resolve();ctx=next;notify();return next.port!==null;}catch{c.recovering=false;if(activeIntent(c,ticket))blocked(c);return false;}})());},
   remove:(id:string)=>{if(!c||!available())return Promise.resolve(false);const m=c.view.messages.find(m=>m.id===id);if(!m)return Promise.resolve(false);const phase=c.view.phase,ticket=++c.intent;update(c,{phase:'clearing'});return launch(c,async()=>{try{await release(c,[m.preview.uri]);if(!valid(c))return false;update(c,{...(activeIntent(c,ticket)?{phase}:{}),messages:Object.freeze(c.view.messages.filter(x=>x!==m))});return true;}catch{if(valid(c))blocked(c);return false;}});},
  });
 }
 return Object.freeze({bind,snapshot:()=>ctx&&valid(ctx)?ctx.view:hidden,subscribe:(f:()=>void)=>{listeners.add(f);return()=>{listeners.delete(f);};},settled:async()=>{while(pending.size)await Promise.allSettled([...pending]);},dispose:()=>{if(disposed)return;disposed=true;unsubscribe();const previous=ctx;ctx=null;if(previous)void disposePort(previous).catch(()=>{});notify();}});
}
