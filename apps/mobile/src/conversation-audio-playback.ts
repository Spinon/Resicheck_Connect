import type{ReceivedAudioSample}from './received-audio-player.ts';
import type{TextConversation}from '../../../packages/chat-client/src/text-session-channel.ts';import type{AudioTransferRead}from '../../../packages/chat-client/src/audio-transfer.ts';
type Player=Readonly<{loadAndPlay:(bytes:Uint8Array,current:()=>boolean,finished:(failed?:boolean)=>void)=>Promise<void>;clear:()=>Promise<void>;sample?:()=>ReceivedAudioSample}>;
/** Candidate bytes-only composition. Player must own any private file and honor current() at every async boundary. */
export function createConversationAudioPlayback(input:Readonly<{enabled?:boolean;conversation:TextConversation;companyId:string;conversationId:string;messageId:string;current:()=>boolean;resolve:(messageId:string,signal:AbortSignal)=>Promise<AudioTransferRead&Readonly<{messageId:string}>>;player:Player}>){
 const d=Object.freeze({...input,player:Object.freeze({...input.player})});let closed=false,clearing=0,pending=false,version=0,ac:AbortController|null=null;let phase=d.enabled===true?'ready':'off';let lastDuration=0;const emptySample=Object.freeze({durationMs:0,positionMs:0});
 const listeners=new Set<()=>void>();const setPhase=(next:string)=>{if(phase===next)return;phase=next;for(const f of [...listeners])try{f();}catch{}};
 const live=()=>{try{return !closed&&d.enabled===true&&d.current()&&d.conversation.active();}catch{return false;}};
 let stop=()=>{};
 async function clear(){clearing++;try{await d.player.clear();}catch{if(!closed)setPhase('blocked');}finally{clearing--;}}
 function close(){if(closed)return;closed=true;lastDuration=0;version++;setPhase('closed');ac?.abort();const detach=stop;stop=()=>{};try{detach();}catch{}finally{if(d.enabled===true)void clear();}}
 if(d.enabled===true){const unsubscribe=d.conversation.onClose(close);if(closed){try{unsubscribe();}catch{}}else stop=unsubscribe;}
 async function play(){if(!live()){if(d.enabled===true)close();return;}if(pending||clearing||phase==='playing'||!d.conversation.audioTransfer)return;pending=true;const ticket=++version,controller=new AbortController();ac=controller;let bytes:Uint8Array|null=null,finished=false;const valid=()=>live()&&ticket===version;
  try{setPhase('loading');const descriptor=await d.resolve(d.messageId,controller.signal);if(!valid()||descriptor.messageId!==d.messageId||descriptor.companyId!==d.companyId||descriptor.conversationId!==d.conversationId)throw Error('Audio unavailable');const {messageId,...command}=descriptor;bytes=await d.conversation.audioTransfer.read(command,controller.signal);if(!valid())throw Error('Audio unavailable');await d.player.loadAndPlay(bytes,valid,(failed=false)=>{finished=true;if(valid()){setPhase(failed?'failed':'stopping');void clear().then(()=>{if(valid()&&phase!=='blocked'&&!failed)setPhase('ready');});}});if(!valid())throw Error('Audio unavailable');if(!finished)setPhase('playing');
  }catch{if(live())setPhase('failed');else close();await clear();}finally{bytes?.fill(0);pending=false;controller.abort();if(ac===controller)ac=null;if(!live())await clear();}
 }
 function sample():ReceivedAudioSample{
  if(!live()){if(d.enabled===true)close();return emptySample;}
  if(phase==='playing'&&d.player.sample){try{const value=d.player.sample();if(Number.isFinite(value.durationMs)&&value.durationMs>0&&value.durationMs<=60500&&Number.isFinite(value.positionMs)&&value.positionMs>=0){lastDuration=value.durationMs;return Object.freeze({durationMs:lastDuration,positionMs:Math.min(value.positionMs,lastDuration)});}}catch{}}
  return phase==='ready'&&lastDuration>0?Object.freeze({durationMs:lastDuration,positionMs:0}):emptySample;
 }
 return Object.freeze({sample,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};},snapshot:()=>{if(d.enabled===true&&!live())close();return Object.freeze({phase});},play,
  pause:async()=>{if(!live()){if(d.enabled===true)close();return;}version++;ac?.abort();setPhase('stopping');await clear();if(live()&&phase!=='blocked')setPhase('ready');},close});
}
