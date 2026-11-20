import React,{useMemo}from'react';
import{RecordingPresets,useAudioRecorder}from'expo-audio';
import{NativeModules}from'react-native';
import{createNativeAudioDigest}from'../src/native-audio-digest.ts';
import{createConnectedMembershipManagementRoot}from'./connected-membership-management.android.tsx';
import{createScopedRecordingHost}from'../src/scoped-recording-host.ts';
import{ScopedAudioComposer}from'../src/ScopedAudioComposer.tsx';
import{createExpoLocalAudioPort}from'../src/expo-local-audio.ts';
import{createExpoPrivateDemoAudio}from'../src/expo-private-demo-audio.ts';
import{createExpoReviewedAudioSource}from'../src/expo-reviewed-audio-source.ts';
import{createConversationAudioUi}from'../src/conversation-audio-ui.ts';
import{LOCAL_AUDIO_LIMITS}from'../src/local-audio.ts';
/** Candidate factory only. No registerRootComponent, config lookup, login or default activation.
 * local-recording is the default and adds no audio RPC. connected-pilot requires explicit post-approval selection and includes the existing protected message-removal flow. */
export function createConnectedScopedAudioRoot(config:unknown,fetcher:typeof fetch,mode:'local-recording'|'connected-pilot'='local-recording',receiptMode?:'candidate-observed-v1',registryMode?:'candidate-worker-check'|'candidate-on-demand-check',registryCorrections?:'candidate-own-company',messageRemovalMode:'candidate-selection-v1'|undefined=mode==='connected-pilot'?'candidate-selection-v1':undefined,membershipLinkMode?:'candidate-secret-v1',registryPreviewMode?:'candidate-preview-v1',imageMode?:'candidate-private-v1'){
 if(registryPreviewMode!==undefined&&(registryPreviewMode!=='candidate-preview-v1'||registryMode!=='candidate-on-demand-check'))throw Error('Registry preview unavailable');
 if(messageRemovalMode!==undefined&&messageRemovalMode!=='candidate-selection-v1')throw Error('Removal unavailable');
 if(!['local-recording','connected-pilot'].includes(mode))throw Error('Audio unavailable');
 return function ScopedAudioCandidate(){
  const recorder=useAudioRecorder({...RecordingPresets.HIGH_QUALITY,directory:'cache',sampleRate:44100,numberOfChannels:1,bitRate:64000,android:{outputFormat:'mpeg4',audioEncoder:'aac',maxFileSize:LOCAL_AUDIO_LIMITS.bytes}});
  const digest=useMemo(()=>mode==='connected-pilot'?createNativeAudioDigest(NativeModules.ConnectAudioDigest):null,[]);
  const Root=useMemo(()=>createConnectedMembershipManagementRoot(config,fetcher,'basic-manual',receiptMode,{
   createRecordingHost:deps=>createScopedRecordingHost({...deps,sendEnabled:mode==='connected-pilot',createPort:()=>createExpoLocalAudioPort(recorder),createFiles:snapshot=>createExpoPrivateDemoAudio(recorder,snapshot),createSource:(snapshot,current)=>createExpoReviewedAudioSource(recorder,snapshot,current)}),
   composer:(recording,host,controls,attachmentAction)=><ScopedAudioComposer recording={recording} conversation={host} controls={controls} attachmentAction={attachmentAction}/>,
   ...(mode==='connected-pilot'?{playback:{protocol:'scoped-v1' as const,createUi:createConversationAudioUi,digest:digest!}}:{}),
  },registryMode,registryCorrections,messageRemovalMode,membershipLinkMode,registryPreviewMode,imageMode),[recorder]);
  return <Root/>;
 };
}
