import {LOCAL_AUDIO_LIMITS} from './local-audio.ts';
export async function copyValidatedLocalAudio(bytes:number,port:{copy:()=>Promise<void>;destination:()=>{exists:boolean;bytes:number}}){
  if(!Number.isSafeInteger(bytes)||bytes<1||bytes>LOCAL_AUDIO_LIMITS.bytes)throw Error('Local audio unavailable');
  await port.copy();const destination=port.destination();if(!destination.exists||destination.bytes!==bytes)throw Error('Local audio unavailable');
}
