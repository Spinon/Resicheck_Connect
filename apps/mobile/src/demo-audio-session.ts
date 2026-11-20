import {createPrivateDemoAudio,type PrivateAudioFiles} from './private-demo-audio.ts';
import type {ConversationMediaScopePort} from './conversation-media-scope.ts';import type {createLocalAudioController} from './local-audio.ts';
export function createDemoAudioSession(session:ConversationMediaScopePort,draft:ReturnType<typeof createLocalAudioController>,files:PrivateAudioFiles){
  const saved=createPrivateDemoAudio(files);let scope:ReturnType<typeof session.captureConversationContext>=null,lease:ReturnType<typeof draft.open>|null=null,saving=false,saveInFlight:Promise<boolean>|null=null,disposed=false,initialized=false;
  function sync(){if(disposed)return;const id=session.getSnapshot().activeConversationId,next=id?session.captureConversationContext(id):null;if(initialized&&next?.token===scope?.token&&!!next===!!scope)return;initialized=true;
    scope=next;saving=false;saveInFlight=null;const previous=lease;lease=null;void previous?.close();saved.select(next);if(next)lease=draft.open();
  }
  const unsubscribe=session.subscribe(sync);sync();
  function bind(){const captured=scope,currentLease=lease,valid=()=>!disposed&&captured!==null&&scope===captured&&captured.current()&&currentLease===lease;
    return Object.freeze({
      start:async()=>{if(!valid()||draft.snapshot().phase!=='idle'||saved.snapshot().phase!=='idle')return;await saved.bind().pause();if(valid()&&saved.snapshot().phase==='idle')await currentLease!.start();},
      stop:()=>valid()?currentLease!.stop():Promise.resolve(),
      replay:()=>valid()?currentLease!.replay():Promise.resolve(),
      preview:()=>valid()?currentLease!.play():Promise.resolve(),
      pauseDraft:()=>valid()?currentLease!.pause():Promise.resolve(),
      discard:()=>{if(!valid())return Promise.resolve();return saveInFlight?saveInFlight.then(()=>valid()?currentLease!.cancel():undefined):currentLease!.cancel();},
      save:async()=>{if(!valid()||saving||draft.snapshot().phase!=='ready')return false;saving=true;const pending=(async()=>{const done=await saved.bind().save();if(done&&valid())await currentLease!.cancel();return done&&valid();})();saveInFlight=pending;try{return await pending;}finally{if(valid()){saving=false;if(saveInFlight===pending)saveInFlight=null;}}},
      play:(id:string)=>valid()&&draft.snapshot().phase==='idle'?saved.bind().play(id):Promise.resolve(false),
      pause:()=>valid()?saved.bind().pause():Promise.resolve(),
      remove:(id:string)=>valid()&&draft.snapshot().phase==='idle'?saved.bind().remove(id):Promise.resolve(false),
      clear:()=>{if(valid())saved.bind().clear();},
      tick:()=>{if(valid())currentLease!.tick();},
      background:()=>{if(!valid())return;if(draft.snapshot().phase!=='permission')void currentLease!.cancel();void saved.bind().pause();},
    });
  }
  return Object.freeze({bind,draft,saved,contextId:()=>scope?.token??null,subscribeContext:session.subscribe,dispose:()=>{if(disposed)return;disposed=true;unsubscribe();scope=null;void lease?.close();lease=null;saved.select(null);}});
}
