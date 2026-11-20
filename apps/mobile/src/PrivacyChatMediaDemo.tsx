import React,{useEffect,useMemo,useSyncExternalStore} from 'react';
import {AppState,NativeModules,StyleSheet,View} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {ConnectDemo} from '../App';
import {useChatMediaRuntime} from './ChatMediaDemo.tsx';
import {MediaPrivacyProvider} from './MediaPrivacy.tsx';
import {MediaWindowHost} from './MediaWindow.tsx';
import {createPrivacyDemoRuntime} from './privacy-demo-runtime.ts';
import type {NativePrivacyPort} from './native-privacy-binding.ts';

function foregroundPort(){
  let active=AppState.currentState==='active',focused=true;
  const observers=new Set<(active:boolean)=>void>();
  const emit=()=>{for(const listener of [...observers])listener(active&&focused);};
  const subscriptions=[
    AppState.addEventListener('change',state=>{active=state==='active';emit();}),
    AppState.addEventListener('blur',()=>{focused=false;emit();}),
    AppState.addEventListener('focus',()=>{focused=true;emit();}),
  ];
  return {current:()=>active&&focused,subscribe:(listener:(value:boolean)=>void)=>{observers.add(listener);return()=>{observers.delete(listener);};},
    dispose:()=>{for(const subscription of subscriptions)subscription.remove();observers.clear();}};
}

// Phone/demo assembly, still offline and synthetic. The media owners and scene
// remain mounted across privacy epochs so system picker completions retain
// their original capability; the native window cover guards the whole scene.
export function PrivacyChatMediaDemo(){
  const media=useChatMediaRuntime();
  const runtime=useMemo(()=>{
    const foreground=foregroundPort();
    const privacy=createPrivacyDemoRuntime({session:media.session,native:NativeModules.ConnectPrivacyCurtain as NativePrivacyPort,foreground});
    return {...privacy,dispose:()=>{privacy.dispose();foreground.dispose();}};
  },[media.session]);
  useEffect(()=>()=>runtime.dispose(),[runtime]);
  const state=useSyncExternalStore(runtime.subscribe,runtime.snapshot,runtime.snapshot);
  const ready=state.readyEpoch!==null;
  return <SafeAreaProvider><MediaPrivacyProvider value={media.presentation}>
    <View style={styles.root}>
      <View collapsable={false} style={[styles.root,!ready&&styles.hidden]}
        pointerEvents={ready?'auto':'none'} accessibilityElementsHidden={!ready}
        importantForAccessibility={ready?'auto':'no-hide-descendants'}>
        <MediaWindowHost><ConnectDemo session={media.session} audioExtension={media.audioExtension} imageExtension={media.imageExtension}
          privacyBoundary={{epoch:state.prepareEpoch,onPrepared:runtime.confirmPrepared}}/>
        </MediaWindowHost>
        {ready&&<View key={state.readyEpoch} collapsable={false} pointerEvents="none" accessible={false}
          nativeID={'connect-private-ready-'+state.readyEpoch} style={StyleSheet.absoluteFill}/>}
      </View>
    </View>
  </MediaPrivacyProvider></SafeAreaProvider>;
}
const styles=StyleSheet.create({root:{flex:1,backgroundColor:'#F6F8F3'},hidden:{opacity:0}});
