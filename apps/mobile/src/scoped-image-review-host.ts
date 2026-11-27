import {createImageReview,type ImageReviewPort} from './image-review.ts';
import {createExternalImageSelection} from './external-image-selection.ts';
import type {RecentMediaScopeSource} from './recent-media-scope.ts';
import type {ConversationMediaCapability} from './conversation-media-scope.ts';
import type {createRecentConversationHost} from './recent-conversation-host.ts';
type Host=ReturnType<typeof createRecentConversationHost>;
type Review=ReturnType<typeof createImageReview>;
type Entry={host:Host;cap:ConversationMediaCapability;review:Review|null;port:ImageReviewPort|null;stop:()=>void};
type Options={recent:RecentMediaScopeSource;foreground:()=>boolean;createPort:(current:()=>boolean)=>ImageReviewPort;schedule:(f:()=>void,ms:number)=>()=>void;now?:()=>number};
/** Local image draft owner. No upload, message, Auth or permissions are derived.
 * The caller must include pickerGuard.retainDomain() in its existing lifecycle
 * hold, keep its native curtain, and notify foregroundChanged on real lifecycle. */
export function createScopedImageReviewHost(d:Options){
 let closed=false,syncing=false,version=0,entry:Entry|null=null,cleanupOwner:Entry|null=null,setupFailed=false;
 const listeners=new Set<()=>void>();
 const foreground=()=>{try{return !closed&&d.foreground()===true;}catch{return false;}};
 const emit=()=>{version++;for(const f of [...listeners])try{f();}catch{}};
 const pickerGuard=createExternalImageSelection(d.recent,foreground,d.schedule,d.now);
 function domain(e:Entry){try{return !closed&&d.recent.snapshot().route==='chat'&&d.recent.snapshot().host===e.host&&e.host.snapshot().status==='active'&&e.cap.current()&&d.recent.captureMediaScope()?.token===e.cap.token;}catch{return false;}}
 function current(e:Entry){return entry===e&&domain(e)&&(foreground()||pickerGuard.retainDomain());}
 function retire(e:Entry){
  if(entry!==e)return;entry=null;e.stop();
  if(e.review){e.review.dispose();if(e.review.cleanupPending())cleanupOwner=e;}
  else try{e.port?.dispose();}catch{cleanupOwner=e;}
  emit();
 }
 function sync(){
  if(closed||syncing)return;syncing=true;
  try{
   if(entry&&!current(entry))retire(entry);
   if(!entry&&!cleanupOwner&&!setupFailed&&foreground()){
    const snap=d.recent.snapshot(),cap=d.recent.captureMediaScope();
    if(snap.route==='chat'&&snap.host&&snap.host.snapshot().status==='active'&&cap?.current()){
     const e:Entry={host:snap.host,cap,review:null,port:null,stop:()=>{}};entry=e;
     try{
      e.port=d.createPort(()=>current(e));
      if(!current(e))throw Error();
      e.review=createImageReview({current:()=>current(e),subscribe:f=>d.recent.subscribe(f)},e.port,{defaultMode:'optimized'});
      e.stop=e.review.subscribe(emit);
      if(!current(e)||e.review.snapshot().phase==='closed')throw Error();
     }catch{if(entry===e)retire(e);setupFailed=true;}
    }
   }
  }finally{syncing=false;emit();}
 }
 const stops=[d.recent.subscribe(sync),pickerGuard.subscribe(sync)];sync();
 type BoundView=Readonly<{available:boolean;blocked:boolean;review:Review|null}>;
 const hidden:BoundView=Object.freeze({available:false,blocked:false,review:null});
 function bind(expected:Host){
  const cap=d.recent.captureMediaScope();let cached=hidden,last=-1;
  const own=()=>{if(entry&&!current(entry))retire(entry);return entry&&entry.host===expected&&cap?.token===entry.cap.token&&current(entry)&&foreground()?entry:null;};
  function snapshot(){const e=own();if(!e&&!domainExpected())return hidden;if(last===version)return cached;last=version;cached=Object.freeze({available:!!e,blocked:cleanupOwner!==null||setupFailed,review:e?.review??null});return cached;}
  function domainExpected(){try{return !closed&&foreground()&&d.recent.snapshot().host===expected&&cap!==null&&cap.current()&&d.recent.captureMediaScope()?.token===cap.token;}catch{return false;}}
  return Object.freeze({snapshot,subscribe:(f:()=>void)=>{listeners.add(f);return()=>{listeners.delete(f);};},
   async pick(){const e=own();if(!e?.review||!foreground())return false;return pickerGuard.run(()=>e.review!.select(),()=>retire(e),e.cap);},
   discard(){const e=own();return e?.review?.discard()??false;},
   retryCleanup(){if(!domainExpected())return false;if(cleanupOwner){const e=cleanupOwner;let ok=false;try{ok=e.review?e.review.retryCleanup():(e.port?.dispose(),true);}catch{}if(!ok)return false;cleanupOwner=null;}setupFailed=false;sync();return own()!==null;},
  });
 }
 return Object.freeze({bind,pickerGuard,foregroundChanged(){pickerGuard.foregroundChanged();sync();},
  dispose(){if(closed)return;const old=entry;if(old)retire(old);closed=true;for(const stop of stops)stop();pickerGuard.dispose();emit();listeners.clear();},
  cleanupPending:()=>cleanupOwner!==null,
  retryFinalCleanup(){if(!closed||!cleanupOwner)return !cleanupOwner;const e=cleanupOwner;let ok=false;try{ok=e.review?e.review.retryCleanup():(e.port?.dispose(),true);}catch{}if(ok)cleanupOwner=null;return ok;},
 });
}
export function imageReviewBlocksNavigation(review:Review|null|undefined){const v=review?.snapshot();return !!v&&v.phase!=='closed'&&(v.source!==null||['selecting','preparing','reading'].includes(v.phase));}
