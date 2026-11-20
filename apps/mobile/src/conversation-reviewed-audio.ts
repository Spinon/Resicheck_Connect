import{createReviewedAudioUpload}from './reviewed-audio-upload.ts';import{audioTransferUploadPorts}from '../../../packages/chat-client/src/audio-transfer.ts';import type{TextConversation}from '../../../packages/chat-client/src/text-session-channel.ts';
type Options=Parameters<typeof createReviewedAudioUpload>[0];
/** Candidate composition, never mounted automatically. Explicit start remains required. */
export function createConversationReviewedAudio(options:Omit<Options,'upload'|'lookup'|'subscribeScope'>&Readonly<{conversation:TextConversation;subscribeScope:Options['subscribeScope']}>){
 const {conversation,scope}=options,port=conversation.audioTransfer;let retired=false;const current=()=>!retired&&scope.current()&&conversation.active();
 if(options.enabled===true&&(!port||!current()))throw Error('Audio unavailable');
 const unavailable=async()=>{throw Error('Audio unavailable');};const ports=port?audioTransferUploadPorts(port):{upload:unavailable,lookup:unavailable};
 return createReviewedAudioUpload({...options,scope:Object.freeze({...scope,current}),...ports,subscribeScope:changed=>{
  const close=conversation.onClose(()=>{retired=true;changed();});const stop=options.subscribeScope(changed);return()=>{close();stop();};
 }});
}
