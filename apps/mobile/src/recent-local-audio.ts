import type{LocalAudioPermission}from './audio-permission.ts';
import {createRecentMediaScope,type RecentMediaScopeSource} from './recent-media-scope.ts';
import {createLocalAudioController,type LocalAudioPort,type LocalAudioView} from './local-audio.ts';
import {createDemoAudioSession} from './demo-audio-session.ts';
import type {PrivateAudioFiles} from './private-demo-audio.ts';
import type {ConversationMediaCapability} from './conversation-media-scope.ts';
import {createExternalImageSelection as createExternalPermissionHold} from './external-image-selection.ts';

export type RecentLocalAudioDependencies=Readonly<{
 recent:RecentMediaScopeSource;createPort:()=>LocalAudioPort;
 createFiles:(snapshot:()=>LocalAudioView)=>PrivateAudioFiles;
 foreground:()=>boolean;schedule?:(callback:()=>void,ms:number)=>()=>void;now?:()=>number;
}>;
const unavailable=()=>Error('Local audio unavailable');

/** Local recording/playback only. Reuses the exact original-scope external hold
 * for microphone permission, never for recording or playback. Permission newly
 * granted still returns granted-now and requires a second explicit press.
 * No URI, upload capability, new Auth owner or native foreground claim. */
export function createRecentLocalAudio(deps:RecentLocalAudioDependencies){
 const scope=createRecentMediaScope(deps.recent),pending=new Set<Promise<unknown>>();
 let closed=false,starting=false,activity=0;
 const foreground=()=>{try{return !closed&&deps.foreground()===true;}catch{return false;}};
 function tracked<T>(operation:()=>Promise<T>):Promise<T>{
  activity++;const work=Promise.resolve().then(operation);pending.add(work);
  void work.then(()=>{pending.delete(work);activity++;},()=>{pending.delete(work);activity++;});return work;
 }
 type PermissionIntent={cap:ConversationMediaCapability;current:()=>boolean;cancel:()=>void};
 let permissionIntent:PermissionIntent|null=null;
 const schedule=deps.schedule??((fn:()=>void,ms:number)=>{const timer=setTimeout(fn,ms);return()=>clearTimeout(timer);});
 const permissionGuard=createExternalPermissionHold(deps.recent,foreground,schedule,deps.now);
 let base:ReturnType<typeof createDemoAudioSession>|null=null;
 try{
  const raw=deps.createPort();
  const port:LocalAudioPort={
   permission:()=>tracked(async()=>{
    const intent=permissionIntent;if(!intent?.current()||!foreground())return false;
    const outcome:{value:LocalAudioPermission}={value:false};
    const allowed=await permissionGuard.run(async()=>{
     if(!intent.current()||!foreground())return false;
     const result=await raw.permission();outcome.value=result===true||result==='granted-now'||result==='blocked'?result:false;
     return outcome.value===true||outcome.value==='granted-now';
    },intent.cancel,intent.cap);
    return intent.current()&&foreground()&&(allowed||outcome.value==='blocked')?outcome.value:false;
   }),
   start:current=>tracked(async()=>{
    const active=()=>foreground()&&current();if(!active())throw unavailable();
    await raw.start(active);if(!active())throw unavailable();
   }),
   play:(finished,current)=>tracked(async()=>{
    const active=()=>foreground()&&current();if(!active())throw unavailable();
    await raw.play(finished,active);if(!active())throw unavailable();
   }),
   ...(typeof raw.rewind==='function'?{rewind:(current:()=>boolean)=>tracked(async()=>{const active=()=>foreground()&&current();if(!active())throw unavailable();await raw.rewind!(active);if(!active())throw unavailable();})}:{}),
   stop:()=>tracked(()=>raw.stop()),pause:()=>tracked(()=>raw.pause()),reset:()=>tracked(()=>raw.reset()),
   sample:()=>{if(!foreground())throw unavailable();return raw.sample();},
  };
  const draft=createLocalAudioController(port),rawFiles=deps.createFiles(draft.snapshot);
  const files:PrivateAudioFiles={
   save:id=>tracked(()=>{if(!foreground())throw unavailable();return rawFiles.save(id);}),
   remove:id=>tracked(()=>rawFiles.remove(id)),purge:()=>tracked(()=>rawFiles.purge()),pause:()=>tracked(()=>rawFiles.pause()),
   play:(id,current,finished)=>tracked(async()=>{
    const active=()=>foreground()&&current();if(!active())throw unavailable();
    await rawFiles.play(id,active,finished);if(!active()){await rawFiles.pause();throw unavailable();}
   }),
  };
  base=createDemoAudioSession(scope,draft,files);const owner=base;
  function bind(){
   const actions=owner.bind(),cap=deps.recent.captureMediaScope(),context=owner.contextId();
   const current=()=>{try{return !closed&&context!==null&&owner.contextId()===context&&cap!==null&&cap.current()&&deps.recent.captureMediaScope()?.token===cap.token&&!closed&&owner.contextId()===context;}catch{return false;}};
   return Object.freeze({...actions,
    start:()=>{
     if(starting||!current()||!foreground())return Promise.resolve();starting=true;
     const intent:PermissionIntent={cap:cap!,current,cancel:()=>{void actions.discard().catch(()=>{});}};permissionIntent=intent;
     return tracked(async()=>{try{if(current()&&foreground())await actions.start();}finally{if(permissionIntent===intent)permissionIntent=null;starting=false;}});
    },
    replay:()=>current()&&foreground()?actions.replay():Promise.resolve(),
    preview:()=>current()&&foreground()?actions.preview():Promise.resolve(),
    play:(id:string)=>current()&&foreground()?actions.play(id):Promise.resolve(false),
    save:()=>current()&&foreground()?actions.save():Promise.resolve(false),
   });
  }
  function dispose(){if(closed)return;closed=true;permissionGuard.dispose();owner.dispose();scope.dispose();}
  const host=Object.freeze({...owner,bind,dispose});
  return Object.freeze({host,draft,permissionGuard,
   background(){if(!closed)owner.bind().background();},
   tick(){if(foreground())owner.bind().tick();},
   async settled(){
    // Drain tracked port work and the existing saved-file queue. An unresolved
    // native permission operation intentionally keeps this promise pending.
    for(;;){await owner.saved.settled();if(pending.size){await Promise.allSettled([...pending]);continue;}const before=activity;await new Promise<void>(r=>setTimeout(r,0));if(pending.size===0&&before===activity)return;}
   },
   dispose,
  });
 }catch{closed=true;permissionGuard.dispose();base?.dispose();scope.dispose();throw unavailable();}
}
