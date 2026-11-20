import React,{useEffect,useMemo} from 'react';
import {AppState} from 'react-native';
import {Asset} from 'expo-asset';
import {RecordingPresets,useAudioRecorder} from 'expo-audio';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {ConnectDemo,type DemoAudioExtension,type DemoImageExtension} from '../App';
import {createDemoSession} from './demo-session.ts';
import {createDemoImageSession} from './demo-image-session.ts';
import {createExpoLocalImage} from './expo-local-image.ts';
import {DemoImageComposer,DemoImageMessages} from './DemoImageViews.tsx';
import {createLocalAudioController,LOCAL_AUDIO_LIMITS} from './local-audio.ts';
import {createExpoLocalAudioPort} from './expo-local-audio.ts';
import {createExpoPrivateDemoAudio} from './expo-private-demo-audio.ts';
import {createDemoAudioSession} from './demo-audio-session.ts';
import {DemoAudioComposer,DemoAudioMessages} from './DemoAudioViews.tsx';
import {createMediaPresentation,mediaAppState} from './media-presentation.ts';
import {MediaPrivacyProvider} from './MediaPrivacy.tsx';
import {MediaWindowHost} from './MediaWindow.tsx';

const fixtures={png:require('../assets/image-fixtures/guide-clean.png'),jpeg:require('../assets/image-fixtures/guide-clean-jpeg.jpg'),codes:require('../assets/image-fixtures/guide-code39-jpeg.jpg'),shadow:require('../assets/image-fixtures/guide-shadow.png'),low:require('../assets/image-fixtures/guide-low-quality.png')};

// One session capability feeds both media subsystems. Neither can deliver to a
// company or touch the text outbox. The App keeps composer drafts exclusive.
export function useChatMediaRuntime(){
 const recorder=useAudioRecorder({...RecordingPresets.HIGH_QUALITY,directory:'cache',sampleRate:44100,numberOfChannels:1,bitRate:64000,android:{outputFormat:'mpeg4',audioEncoder:'aac',maxFileSize:LOCAL_AUDIO_LIMITS.bytes}});
 const runtime=useMemo(()=>{
  const session=createDemoSession();
  const images=createDemoImageSession(session,current=>{
   const port=createExpoLocalImage(current);
   return{...port,pickFixture:async(key:keyof typeof fixtures)=>{
    const resource=Asset.fromModule(fixtures[key]),asset=new Asset({name:resource.name,type:resource.type,uri:resource.uri,hash:resource.hash});
    await asset.downloadAsync();
    if(!current()||!asset.localUri)throw Error('Local image unavailable');
    return port.importFile(asset.localUri,'Guia fictícia '+key);
   }};
  });
  const draft=createLocalAudioController(createExpoLocalAudioPort(recorder));
  const audio=createDemoAudioSession(session,draft,createExpoPrivateDemoAudio(recorder,draft.snapshot));
  const presentation=createMediaPresentation(session,mediaAppState(AppState.currentState));
  return{session,images,audio,presentation};
 },[recorder]);
 useEffect(()=>{
  const timer=setInterval(()=>runtime.audio.bind().tick(),150);
  const background=AppState.addEventListener('change',state=>{runtime.presentation.gate.setAppState(mediaAppState(state));if(state!=='active')runtime.audio.bind().background();});
  const blur=AppState.addEventListener('blur',()=>{runtime.presentation.gate.setFocused(false);runtime.audio.bind().background();});
  const focus=AppState.addEventListener('focus',()=>runtime.presentation.gate.setFocused(true));
  return()=>{clearInterval(timer);background.remove();blur.remove();focus.remove();runtime.presentation.dispose();runtime.audio.dispose();void runtime.images.dispose();};
 },[runtime]);
 const audioExtension:DemoAudioExtension=useMemo(()=>({composer:(id,close)=><DemoAudioComposer key={id} host={runtime.audio} close={close}/>,messages:id=><DemoAudioMessages key={id} host={runtime.audio}/>}),[runtime]);
 const imageExtension:DemoImageExtension=useMemo(()=>({composer:(id,close)=><DemoImageComposer key={id} host={runtime.images} close={close} fixtures/>,messages:id=><DemoImageMessages key={id} host={runtime.images}/>}),[runtime]);
 return {...runtime,audioExtension,imageExtension};
}
export function ChatMediaDemo(){
 const runtime=useChatMediaRuntime();
 return <SafeAreaProvider><MediaPrivacyProvider value={runtime.presentation}><MediaWindowHost><ConnectDemo session={runtime.session} audioExtension={runtime.audioExtension} imageExtension={runtime.imageExtension}/></MediaWindowHost></MediaPrivacyProvider></SafeAreaProvider>;
}
