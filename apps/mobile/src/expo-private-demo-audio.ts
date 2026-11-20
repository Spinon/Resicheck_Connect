import {Directory,File,Paths} from 'expo-file-system';import {createAudioPlayer,setAudioModeAsync,type AudioPlayer,type AudioRecorder} from 'expo-audio';import {AppState} from 'react-native';
import {requireOwnedAudioUri} from './audio-owned-files.ts';import {LOCAL_AUDIO_LIMITS,type LocalAudioView} from './local-audio.ts';import type {PrivateAudioFiles} from './private-demo-audio.ts';
// Only disposable, session-scoped copies. No user-selected path or remote URL.
import {isOwnedChatAudioFile} from './private-audio-filenames.ts';
import {createAudioFileOwnership} from './audio-file-ownership.ts';
import {copyValidatedLocalAudio} from './audio-copy.ts';
let nativeFileSequence=0;
export function createExpoPrivateDemoAudio(recorder:AudioRecorder,draft:()=>LocalAudioView):PrivateAudioFiles{
  const root=new Directory(Paths.cache,'connect-chat-audio-v1'),owned=createAudioFileOwnership(),mapping=new Map<string,File>();let player:AudioPlayer|null=null,removeListener:(()=>void)|null=null;
  const file=(id:string)=>{if(!isOwnedChatAudioFile(id+'.m4a')||!mapping.has(id))throw Error('Local audio unavailable');return mapping.get(id)!;};
  async function pause(){removeListener?.();removeListener=null;if(player){const old=player;let failed=false;try{old.pause();}catch{failed=true;}old.remove();player=null;if(failed)throw Error('Local audio unavailable');}}
  return{save:async id=>{const info=draft();if(info.phase!=='ready'||info.durationMs<LOCAL_AUDIO_LIMITS.minimumMs||info.bytes<1||info.bytes>LOCAL_AUDIO_LIMITS.bytes)throw Error('Local audio unavailable');
      const source=new File(requireOwnedAudioUri(Paths.cache.uri,recorder.uri??''));if(!source.exists||source.size!==info.bytes||!isOwnedChatAudioFile(id+'.m4a')||mapping.has(id))throw Error('Local audio unavailable');root.create({idempotent:true,intermediates:true});const destination=new File(root,'clip-'+(++nativeFileSequence)+'.m4a');if(destination.exists)throw Error('Local audio unavailable');owned.claim(destination.uri);mapping.set(id,destination);await copyValidatedLocalAudio(info.bytes,{copy:()=>source.copy(destination),destination:()=>({exists:destination.exists,bytes:destination.size})});return{durationMs:info.durationMs,bytes:destination.size};},
    remove:async id=>{if(!isOwnedChatAudioFile(id+'.m4a'))throw Error('Local audio unavailable');const target=mapping.get(id);if(!target)return;if(target.exists)target.delete();owned.release(target.uri);mapping.delete(id);},
    purge:async()=>{if(root.exists)for(const entry of root.list())if(entry instanceof File&&isOwnedChatAudioFile(entry.name)&&owned.canRemove(entry.uri)){entry.delete();owned.release(entry.uri);}for(const [id,target] of mapping)if(!target.exists){owned.release(target.uri);mapping.delete(id);}},pause,
    play:async(id,current,finished)=>{if(!current()||AppState.currentState!=='active')throw Error('Local audio unavailable');await pause();const target=file(id);if(!current()||!target.exists)throw Error('Local audio unavailable');await setAudioModeAsync({allowsRecording:false,playsInSilentMode:true,shouldRouteThroughEarpiece:false,shouldPlayInBackground:false,allowsBackgroundRecording:false,interruptionMode:'doNotMix'});if(!current()||AppState.currentState!=='active')return;
      const next=createAudioPlayer({uri:target.uri},{updateInterval:250,keepAudioSessionActive:false});player=next;
      await new Promise<void>((resolve,reject)=>{let loaded=false;const timeout=setTimeout(()=>reject(Error('Local audio unavailable')),6000);const listener=next.addListener('playbackStatusUpdate',s=>{if(player!==next)return;if(s.error){if(loaded&&current()){void pause().then(()=>finished(true),()=>finished(true));}else if(!loaded)reject(Error('Local audio unavailable'));return;}if(s.isLoaded&&!loaded){loaded=true;clearTimeout(timeout);resolve();}if(s.didJustFinish)finished();});removeListener=()=>{clearTimeout(timeout);listener.remove();};if(next.isLoaded){loaded=true;clearTimeout(timeout);resolve();}});
      if(current()&&AppState.currentState==='active')next.play();
    }};
}
