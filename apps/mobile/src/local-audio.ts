import type{LocalAudioPermission}from './audio-permission.ts';
// Local drafts only. No upload, message creation, URI export or authorization.
export const LOCAL_AUDIO_LIMITS=Object.freeze({durationMs:60_000,bytes:1_048_576,minimumMs:500});
export type AudioSample=Readonly<{durationMs:number;bytes:number;positionMs:number;playing:boolean;recording:boolean}>;
export type LocalAudioPort={permission:()=>Promise<LocalAudioPermission>;start:(stillCurrent:()=>boolean)=>Promise<void>;stop:()=>Promise<AudioSample>;play:(finished:()=>void,stillCurrent:()=>boolean)=>Promise<void>;pause:()=>Promise<void>;rewind?:(stillCurrent:()=>boolean)=>Promise<void>;sample:()=>AudioSample;reset:()=>Promise<void>};
export type LocalAudioView=Readonly<{phase:'clearing'|'idle'|'permission'|'preparing'|'recording'|'stopping'|'ready'|'loading'|'playing'|'error'|'blocked';durationMs:number;bytes:number;positionMs:number;notice:null|'permission'|'permission-blocked'|'permission-ready'|'unavailable'|'too-short'|'limit'}>;
const blank={durationMs:0,bytes:0,positionMs:0,notice:null} as const;
export function createLocalAudioController(port:LocalAudioPort){
  let context=0,fence=0,closed=true,view:LocalAudioView=Object.freeze({...blank,phase:'idle'}),queue=Promise.resolve();
  const observers=new Set<()=>void>(),publish=(patch:Partial<LocalAudioView>)=>{view=Object.freeze({...view,...patch});for(const f of observers)try{f();}catch{}};
  function enqueue(work:()=>Promise<void>){const done=queue.then(work);queue=done.catch(()=>{});return done;}
  const current=(c:number,f:number)=>!closed&&c===context&&f===fence;
  function clear(c:number,f:number){publish({...blank,phase:'clearing'});return enqueue(async()=>{try{await port.reset();if(current(c,f))publish({...blank,phase:'idle'});}catch{if(current(c,f))publish({...blank,phase:'blocked',notice:'unavailable'});}});}
  function open(){
    const c=++context;closed=false;const ready=clear(c,++fence);
    const valid=()=>!closed&&c===context;
    async function failed(f:number){try{await port.reset();if(current(c,f))publish({...blank,phase:'error',notice:'unavailable'});}catch{if(current(c,f))publish({...blank,phase:'blocked',notice:'unavailable'});}}
    function cancel(){if(!valid())return Promise.resolve();return clear(c,++fence);}
    function stop(){if(!valid()||view.phase!=='recording')return Promise.resolve();const f=fence;publish({phase:'stopping'});return enqueue(async()=>{try{const clip=await port.stop();if(!current(c,f))return;
      if(!Number.isFinite(clip.durationMs)||!Number.isSafeInteger(clip.bytes)||clip.bytes<1||clip.durationMs<LOCAL_AUDIO_LIMITS.minimumMs){await port.reset();if(current(c,f))publish({...blank,phase:'idle',notice:'too-short'});return;}
      if(clip.bytes>LOCAL_AUDIO_LIMITS.bytes||clip.durationMs>LOCAL_AUDIO_LIMITS.durationMs+500){await port.reset();if(current(c,f))publish({...blank,phase:'idle',notice:'limit'});return;}
      publish({phase:'ready',durationMs:clip.durationMs,bytes:clip.bytes,positionMs:0,notice:null});
    }catch{await failed(f);}});}
    function play(restart=false){
      if(!valid()||(!restart&&view.phase!=='ready')||(restart&&(!port.rewind||!['ready','playing'].includes(view.phase))))return Promise.resolve();
      const f=fence;let finished=false;publish({phase:'loading',...(restart?{positionMs:0}:{})});
      return enqueue(async()=>{try{
        if(restart){await port.pause();if(!current(c,f))return;await port.rewind!(()=>current(c,f));if(!current(c,f))return;}
        await port.play(()=>{finished=true;if(current(c,f)&&view.phase==='playing')publish({phase:'ready',positionMs:0});},()=>current(c,f));
        if(current(c,f))publish({phase:finished?'ready':'playing',...(finished?{positionMs:0}:{})});
      }catch{await failed(f);}});
    }
    return Object.freeze({ready,
      start:()=>{if(!valid()||view.phase!=='idle')return Promise.resolve();const f=fence;publish({...blank,phase:'permission'});return enqueue(async()=>{try{const allowed=await port.permission();if(!current(c,f))return;if(allowed==='granted-now'){publish({...blank,phase:'idle',notice:'permission-ready'});return;}if(allowed==='blocked'){publish({...blank,phase:'idle',notice:'permission-blocked'});return;}if(!allowed){publish({...blank,phase:'idle',notice:'permission'});return;}publish({phase:'preparing'});await port.start(()=>current(c,f));if(current(c,f))publish({phase:'recording'});}catch{await failed(f);}});},
      stop,
      play:()=>play(),replay:()=>play(true),
      pause:()=>{if(!valid()||view.phase!=='playing')return Promise.resolve();const f=fence;return enqueue(async()=>{try{await port.pause();if(current(c,f))publish({phase:'ready'});}catch{await failed(f);}});},
      tick:()=>{if(!valid()||!['recording','playing'].includes(view.phase))return;try{const sample=port.sample();if(!Number.isFinite(sample.durationMs)||sample.durationMs<0||!Number.isFinite(sample.positionMs)||sample.positionMs<0)throw Error('Local audio unavailable');if(view.phase==='recording'){publish({durationMs:sample.durationMs});if(!sample.recording||sample.durationMs>=LOCAL_AUDIO_LIMITS.durationMs)void stop();}else publish({positionMs:sample.positionMs,...(!sample.playing?{phase:'ready' as const}:{})});}catch{const f=++fence;publish({...blank,phase:'clearing'});void enqueue(()=>failed(f));}},
      cancel,
      close:()=>{if(!valid())return Promise.resolve();const done=clear(c,++fence);closed=true;publish({...blank,phase:'idle'});return done;},
    });
  }
  return Object.freeze({supportsReplay:()=>typeof port.rewind==='function',open,snapshot:()=>view,subscribe:(f:()=>void)=>{observers.add(f);return()=>{observers.delete(f);};}});
}
