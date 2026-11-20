import {createRecentLocalAudio}from'./recent-local-audio.ts';
import {createScopedReviewedAudio}from'./scoped-reviewed-audio.ts';
import type{createMembershipRecentBridge}from'./membership-recent-bridge.ts';
import type{createRecentConversationHost}from'./recent-conversation-host.ts';
import type{LocalAudioView}from'./local-audio.ts';
type Host=ReturnType<typeof createRecentConversationHost>;
type Recent=ReturnType<typeof createMembershipRecentBridge>;
type Media=ReturnType<typeof createRecentLocalAudio>;
type Options=Pick<Parameters<typeof createRecentLocalAudio>[0],'createPort'|'createFiles'|'foreground'>&Readonly<{recent:Recent;sendEnabled?:boolean;createSource:(snapshot:()=>LocalAudioView,current:()=>boolean)=>Readonly<{durationMs:number;read:(max:number,signal:AbortSignal)=>Promise<Uint8Array>}>;createId:()=>string;schedule:(fn:()=>void,ms:number)=>()=>void;now:()=>number;timeoutMs:number}>;
/** One root-owned recorder, separate from remountable private presentation. No saved audio copies. */
export function createScopedRecordingHost(d:Options){
 const media=createRecentLocalAudio({...d,recent:d.recent});let closed=false,version=0;
 type Review={controller:ReturnType<typeof createScopedReviewedAudio>;host:Host;cap:object;current:()=>boolean;stop:()=>void};
 let review:Review|null=null;const listeners=new Set<()=>void>();
 const emit=()=>{version++;for(const f of [...listeners])try{f();}catch{}};
 const foreground=()=>{try{return !closed&&d.foreground()===true;}catch{return false;}};
 function retireReview(){const old=review;review=null;if(old){old.stop();old.controller.close();}}
 const sync=()=>{if(review&&!review.current())retireReview();emit();};
 const stops=[d.recent.subscribe(sync),media.draft.subscribe(sync),media.host.subscribeContext(sync)];
 function bind(expected:Host){
  const cap=d.recent.captureMediaScope(),actions=media.host.bind();
  const current=()=>{try{return foreground()&&d.recent.snapshot().route==='chat'&&d.recent.snapshot().host===expected&&expected.snapshot().status==='active'&&cap!==null&&cap.current()&&d.recent.captureMediaScope()?.token===cap.token;}catch{return false;}};
  const hidden=Object.freeze({available:false,draft:null,sendAvailable:false,hasReview:false});let memo:Readonly<{available:boolean;draft:LocalAudioView|null;sendAvailable:boolean;hasReview:boolean}>=hidden,last=-1;
  function snapshot(){if(!current())return hidden;if(last===version)return memo;last=version;memo=Object.freeze({available:true,draft:media.draft.snapshot(),sendAvailable:d.sendEnabled===true&&!!d.recent.captureAudioSendScope(expected),hasReview:review?.host===expected&&review.cap===cap?.token&&review.current()});return memo;}
  async function sent(owner:Review){
   if(review!==owner||!owner.current())return;retireReview();
   // Captured host only; refreshing never clears the independent text draft.
   if(current())void expected.refreshLatest().catch(()=>{});
   if(current())await actions.discard();emit();
  }
  async function send(){
   if(!current()||d.sendEnabled!==true||review||media.draft.snapshot().phase!=='ready')return;
   const scope=d.recent.captureAudioSendScope(expected);if(!scope?.current())return;const original=media.draft.snapshot();
   const live=()=>current()&&scope.current()&&media.draft.snapshot()===original;
   let owner:Review;const controller=createScopedReviewedAudio({enabled:true,conversation:scope.conversation,context:scope.context,current:live,draft:media.draft,source:()=>d.createSource(media.draft.snapshot,live),createId:d.createId,schedule:d.schedule,timeoutMs:d.timeoutMs,onSent:()=>{void sent(owner);}});
   owner={controller,host:expected,cap:cap!.token,current:live,stop:()=>{}};review=owner;owner.stop=controller.subscribe(sync);emit();await controller.start();
  }
  const recoverable=()=>current()&&review!==null&&['failed','blocked','rejected'].includes(review.controller.snapshot().phase);
  async function preview(){
   if(!current())return;if(review){if(!recoverable())return;retireReview();}
   await actions.preview();emit();
  }
  async function recordAgain(){
   if(!recoverable())return;retireReview();await actions.discard();
   if(current()&&review===null)await actions.start();emit();
  }
  const allowed=()=>current()&&review===null;
  return Object.freeze({snapshot,subscribe:(f:()=>void)=>{listeners.add(f);return()=>{listeners.delete(f);};},
   record:()=>allowed()?actions.start():Promise.resolve(),stop:()=>allowed()?actions.stop():Promise.resolve(),preview,recordAgain,pause:()=>allowed()?actions.pauseDraft():Promise.resolve(),
   discard:async()=>{if(!current())return;if(review&&!['review','needs-upload','blocked','rejected','failed','closed'].includes(review.controller.snapshot().phase))return;retireReview();await actions.discard();emit();},
   send,review:()=>current()&&review?.host===expected&&review.cap===cap?.token&&review.current()?review.controller:null,
  });
 }
 return Object.freeze({bind,permissionGuard:media.permissionGuard,
  foregroundChanged(){if(!foreground()){retireReview();media.background();}media.permissionGuard.foregroundChanged();sync();},
  tick(){if(foreground())media.tick();},settled:()=>media.settled(),
  dispose(){if(closed)return;closed=true;retireReview();for(const stop of stops)stop();media.dispose();emit();listeners.clear();},
 });
}

/** Manual navigation cannot silently abandon a scoped local recording/review.
 * Forced privacy/session retirement is owned by the runtime and bypasses this UI guard. */
export function recordingBlocksNavigation(view:Readonly<{available:boolean;hasReview:boolean;draft:Pick<LocalAudioView,'phase'>|null}>|null|undefined):boolean{
 return view?.available===true&&(view.hasReview||view.draft!==null&&view.draft.phase!=='idle');
}
