import {File,FileMode,Paths} from 'expo-file-system';import type {AudioRecorder} from 'expo-audio';
import type {LocalAudioView} from './local-audio.ts';import {requireOwnedAudioUri} from './audio-owned-files.ts';import {readReviewedAudio} from './read-reviewed-audio.ts';
// Caller binds current() to the ORIGINAL session/conversation AND draft lease.
// No path, byte content or diagnostics leave through a UI snapshot.
export function createExpoReviewedAudioSource(recorder:Pick<AudioRecorder,'uri'>,draft:()=>LocalAudioView,current:()=>boolean){
  const original=draft(),uri=requireOwnedAudioUri(Paths.cache.uri,recorder.uri??'');
  if(original.phase!=='ready'||!current()||draft()!==original)throw Error('Local audio unavailable');
  const valid=()=>{if(!current())return false;const next=draft();return recorder.uri===uri&&next===original&&next.phase==='ready'&&current()&&draft()===original;};
  return Object.freeze({durationMs:original.durationMs,read:(maxBytes:number,signal:AbortSignal)=>readReviewedAudio({expectedBytes:original.bytes,maxBytes,current:valid,signal,open:()=>new File(uri).open(FileMode.ReadOnly),yield:()=>new Promise<void>(r=>setTimeout(r,0))})});
}
