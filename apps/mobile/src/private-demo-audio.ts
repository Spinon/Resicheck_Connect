import {LOCAL_AUDIO_LIMITS} from './local-audio.ts';
export type DemoAudioScope=Readonly<{token:object;current:()=>boolean}>;
export type PrivateAudioInfo=Readonly<{durationMs:number;bytes:number}>;
export type PrivateAudioFiles={save:(id:string)=>Promise<PrivateAudioInfo>;remove:(id:string)=>Promise<void>;purge:()=>Promise<void>;play:(id:string,current:()=>boolean,finished:(failed?:boolean)=>void)=>Promise<void>;pause:()=>Promise<void>};
type Clip=PrivateAudioInfo&Readonly<{id:string}>;
export type PrivateAudioView=Readonly<{phase:'closed'|'clearing'|'idle'|'saving'|'loading'|'playing'|'stopping'|'removing'|'blocked';clips:readonly Clip[];playingId:string|null;notice:null|'unavailable'|'limit'}>;
// Session-only private cache. No send, network, durable journal or URI exposure.
export function createPrivateDemoAudio(files:PrivateAudioFiles){
  const hidden:PrivateAudioView=Object.freeze({phase:'closed',clips:Object.freeze([]),playingId:null,notice:null});
  let scope:DemoAudioScope|null=null,generation=0,playback=0,sequence=0,initialized=false,view:PrivateAudioView=hidden,queue=Promise.resolve();
  const listeners=new Set<()=>void>(),publish=(patch:Partial<PrivateAudioView>)=>{view=Object.freeze({...view,...patch});for(const f of listeners)try{f();}catch{}};
  const current=(s:DemoAudioScope,g:number)=>s===scope&&g===generation&&s.current();
  const enqueue=<T>(work:()=>Promise<T>)=>{const pending=queue.then(work);queue=pending.then(()=>{},()=>{});return pending;};
  function select(next:DemoAudioScope|null){if(initialized&&((!next&&!scope)||(next&&scope?.token===next.token&&next.current())))return;initialized=true;scope=next;const g=++generation;playback++;publish({phase:next?'clearing':'closed',clips:Object.freeze([]),playingId:null,notice:null});void enqueue(async()=>{try{await files.pause();await files.purge();if(g===generation)publish({phase:scope?.current()?'idle':'closed'});}catch{if(g===generation)publish({phase:scope?'blocked':'closed',notice:scope?'unavailable':null});}});}
  function bind(){const s=scope,g=generation,valid=()=>s!==null&&current(s,g);
    return Object.freeze({
      save:()=>{if(!s||!valid()||view.phase!=='idle')return Promise.resolve(false);if(view.clips.length>=8){publish({notice:'limit'});return Promise.resolve(false);}const id='clip-'+(++sequence);publish({phase:'saving',notice:null});return enqueue(async()=>{if(!current(s,g))return false;try{const info=await files.save(id);if(!current(s,g)){await files.remove(id);return false;}
        if(!Number.isFinite(info.durationMs)||info.durationMs<LOCAL_AUDIO_LIMITS.minimumMs||info.durationMs>LOCAL_AUDIO_LIMITS.durationMs+500||!Number.isSafeInteger(info.bytes)||info.bytes<1||info.bytes>LOCAL_AUDIO_LIMITS.bytes)throw Error('Local audio unavailable');
        publish({phase:'idle',clips:Object.freeze([...view.clips,Object.freeze({id,durationMs:info.durationMs,bytes:info.bytes})])});return true;
      }catch{try{await files.remove(id);if(current(s,g))publish({phase:'idle',notice:'unavailable'});}catch{if(current(s,g))publish({phase:'blocked',notice:'unavailable'});}return false;}});},
      play:(id:string)=>{if(!s||!valid()||view.phase!=='idle'||!view.clips.some(c=>c.id===id))return Promise.resolve(false);const ticket=++playback,active=()=>current(s,g)&&ticket===playback;publish({phase:'loading',playingId:id,notice:null});return enqueue(async()=>{let completed=false,success=true;try{if(!active())return false;await files.play(id,active,failed=>{completed=true;success=!failed;if(active())publish({phase:failed?'blocked':'idle',playingId:null,notice:failed?'unavailable':null});});if(!active())return false;if(!completed)publish({phase:'playing'});return success;}catch{let stopped=true;try{await files.pause();}catch{stopped=false;}if(active())publish({phase:stopped?'idle':'blocked',playingId:null,notice:'unavailable'});return false;}});},
      // Only a playback intent can be paused. In particular, a pause requested
      // during cleanup must never overwrite its outcome or release its gate.
      // Other phases are no-ops; callers observe phase rather than treating a
      // resolved no-op as proof that another in-flight operation has finished.
      pause:()=>{if(!s||!valid()||!['playing','loading'].includes(view.phase))return Promise.resolve();const ticket=++playback;publish({phase:'stopping'});return enqueue(async()=>{
        if(!current(s,g)||ticket!==playback||view.phase!=='stopping')return;
        try{await files.pause();if(current(s,g)&&ticket===playback&&view.phase==='stopping')publish({phase:'idle',playingId:null});}
        catch{if(current(s,g)&&ticket===playback&&view.phase==='stopping')publish({phase:'blocked',notice:'unavailable'});}
      });},
      remove:(id:string)=>{if(!s||!valid()||!['idle','playing','loading'].includes(view.phase)||!view.clips.some(c=>c.id===id))return Promise.resolve(false);
        // Invalidate completion callbacks before stopping the player. Deletion
        // is serialized with save/purge and never takes a path from the UI.
        const ticket=++playback,active=()=>current(s,g)&&ticket===playback&&view.phase==='removing';
        publish({phase:'removing',notice:null});
        return enqueue(async()=>{if(!active())return false;try{await files.pause();if(!active())return false;await files.remove(id);if(!active())return false;
          publish({phase:'idle',playingId:null,clips:Object.freeze(view.clips.filter(c=>c.id!==id))});return true;
        }catch{if(active())publish({phase:'blocked',playingId:null,notice:'unavailable'});return false;}});
      },
      clear:()=>{if(!s||!valid())return;scope=null;select(s);},
    });
  }
  return Object.freeze({select,bind,snapshot:()=>scope?.current()?view:hidden,subscribe:(f:()=>void)=>{listeners.add(f);return()=>{listeners.delete(f);};},settled:()=>queue});
}
