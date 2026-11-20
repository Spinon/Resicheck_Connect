import{localAudioPermission}from './audio-permission.ts';
import {AudioModule,createAudioPlayer,setAudioModeAsync,type AudioPlayer,type AudioRecorder} from 'expo-audio';
import {Directory,File,Paths} from 'expo-file-system';
import {LOCAL_AUDIO_LIMITS,type LocalAudioPort,type AudioSample} from './local-audio.ts';
import {isOwnedAudioDraftName,requireOwnedAudioUri} from './audio-owned-files.ts';
import {AppState} from 'react-native';
import {finalizeLocalRecording} from './audio-finalization.ts';
import {createAudioFileOwnership} from './audio-file-ownership.ts';
// Android candidate. No URL input or export; all recordings are disposable drafts.
export function createExpoLocalAudioPort(recorder:AudioRecorder):LocalAudioPort{
  const owned=createAudioFileOwnership();
  let uri:string|null=null,durationMs=0,player:AudioPlayer|null=null,unsubscribe:(()=>void)|null=null;
  const checked=(value:string)=>requireOwnedAudioUri(Paths.cache.uri,value);
  function releasePlayer(){unsubscribe?.();unsubscribe=null;if(player){player.pause();player.remove();player=null;}}
  function sample():AudioSample{if(player?.currentStatus.error)throw Error('Local audio unavailable');const s=recorder.getStatus();if(s.isRecording&&Number.isFinite(s.durationMillis))durationMs=Math.max(durationMs,s.durationMillis);return{durationMs,bytes:uri&&new File(uri).exists?new File(uri).size:0,positionMs:player?Math.round(player.currentTime*1000):0,playing:player?.playing??false,recording:s.isRecording};}
  async function encodedMetadata(){uri=checked(recorder.uri??uri??'');const file=new File(uri);if(!file.exists||file.size<1)throw Error('Local audio unavailable');
    const probe=createAudioPlayer({uri},{updateInterval:100,keepAudioSessionActive:false});let remove:()=>void=()=>{};
    try{await new Promise<void>((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Local audio unavailable')),6000);const subscription=probe.addListener('playbackStatusUpdate',s=>{if(s.error)reject(Error('Local audio unavailable'));else if(s.isLoaded)resolve();});remove=()=>{clearTimeout(timeout);subscription.remove();};if(probe.isLoaded)resolve();});return{durationMs:Math.round(probe.duration*1000),bytes:file.size};}finally{remove();probe.remove();}
  }
  async function reset(){releasePlayer();const status=recorder.getStatus();if(status.isRecording||status.canRecord)await recorder.stop();uri=null;durationMs=0;
    // This subsystem owns only generated drafts, never original/gallery files or
    // future downloaded/sent attachments. No recursion or caller-supplied paths.
    const folder=new Directory(Paths.cache,'Audio');if(folder.exists)for(const file of folder.list())if(file instanceof File&&isOwnedAudioDraftName(file.name)&&owned.canRemove(file.uri)){checked(file.uri);file.delete();owned.release(file.uri);}
    await setAudioModeAsync({allowsRecording:false,playsInSilentMode:true,shouldRouteThroughEarpiece:false,shouldPlayInBackground:false,allowsBackgroundRecording:false});
  }
  return{permission:()=>localAudioPermission({current:()=>AudioModule.getRecordingPermissionsAsync(),request:()=>AudioModule.requestRecordingPermissionsAsync(),foreground:()=>AppState.currentState==='active'}),
    start:async valid=>{await setAudioModeAsync({allowsRecording:true,playsInSilentMode:true,shouldPlayInBackground:false,allowsBackgroundRecording:false,interruptionMode:'doNotMix'});if(!valid()||AppState.currentState!=='active')throw Error('Local audio unavailable');
      const prepared=owned.preparing();try{await recorder.prepareToRecordAsync();uri=checked(recorder.uri??recorder.getStatus().url??'');owned.claim(uri);}finally{prepared();}durationMs=0;if(!valid()||AppState.currentState!=='active')throw Error('Local audio unavailable');recorder.record({forDuration:LOCAL_AUDIO_LIMITS.durationMs/1000});},
    rewind:async valid=>{if(!valid()||AppState.currentState!=='active'||!uri)throw Error('Local audio unavailable');checked(uri);player?.pause();if(player)await player.seekTo(0);if(!valid()||AppState.currentState!=='active')throw Error('Local audio unavailable');},
    stop:async()=>{const encoded=await finalizeLocalRecording({status:()=>recorder.getStatus(),stop:()=>recorder.stop(),encoded:encodedMetadata});durationMs=encoded.durationMs;return sample();},
    play:async(finished,valid)=>{if(!uri||!new File(checked(uri)).exists)throw Error('Local audio unavailable');await setAudioModeAsync({allowsRecording:false,playsInSilentMode:true,shouldRouteThroughEarpiece:false,shouldPlayInBackground:false,allowsBackgroundRecording:false,interruptionMode:'doNotMix'});if(!valid())return;
      if(player){if(player.currentTime>=player.duration-0.05)await player.seekTo(0);if(valid())player.play();return;}
      const next=createAudioPlayer({uri},{updateInterval:100,keepAudioSessionActive:false});player=next;
      await new Promise<void>((resolve,reject)=>{let loaded=false;const timer=setTimeout(()=>reject(Error('Local audio unavailable')),6000);
        const listener=next.addListener('playbackStatusUpdate',s=>{if(s.error){clearTimeout(timer);reject(Error('Local audio unavailable'));return;}if(s.isLoaded&&!loaded){loaded=true;clearTimeout(timer);resolve();}if(s.didJustFinish)finished();});unsubscribe=()=>{clearTimeout(timer);listener.remove();};
        if(next.isLoaded){loaded=true;clearTimeout(timer);resolve();}
      });if(valid())next.play();},pause:async()=>{player?.pause();},sample,reset};
}
