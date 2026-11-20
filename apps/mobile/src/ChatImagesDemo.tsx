import React,{useEffect,useMemo} from 'react';
import {Asset} from 'expo-asset';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {ConnectDemo,type DemoImageExtension} from '../App';
import {createDemoSession} from './demo-session.ts';
import {createDemoImageSession} from './demo-image-session.ts';
import {createExpoLocalImage} from './expo-local-image.ts';
import {DemoImageComposer,DemoImageMessages} from './DemoImageViews.tsx';
const fixtures={png:require('../assets/image-fixtures/guide-clean.png'),jpeg:require('../assets/image-fixtures/guide-clean-jpeg.jpg'),codes:require('../assets/image-fixtures/guide-code39-jpeg.jpg'),shadow:require('../assets/image-fixtures/guide-shadow.png'),low:require('../assets/image-fixtures/guide-low-quality.png')};
export function ChatImagesDemo({initialSetupFailures=0}:{initialSetupFailures?:number}){
 if(!Number.isSafeInteger(initialSetupFailures)||initialSetupFailures<0||initialSetupFailures>3)throw Error('Invalid synthetic fixture configuration');
 const runtime=useMemo(()=>{let failures=initialSetupFailures;const session=createDemoSession(),host=createDemoImageSession(session,current=>{if(failures>0){failures--;throw Error('Synthetic setup unavailable');}const port=createExpoLocalImage(current);return{...port,pickFixture:async(key:keyof typeof fixtures)=>{const resource=Asset.fromModule(fixtures[key]),asset=new Asset({name:resource.name,type:resource.type,uri:resource.uri,hash:resource.hash});await asset.downloadAsync();if(!current()||!asset.localUri)throw Error('Local image unavailable');return port.importFile(asset.localUri,'Guia fictícia '+key);}};});return{session,host};},[initialSetupFailures]);
 useEffect(()=>()=>{void runtime.host.dispose();},[runtime]);
 const extension:DemoImageExtension=useMemo(()=>({composer:(id,close)=><DemoImageComposer key={id} host={runtime.host} close={close} fixtures/>,messages:id=><DemoImageMessages key={id} host={runtime.host}/>}),[runtime]);
 return <SafeAreaProvider><ConnectDemo session={runtime.session} imageExtension={extension}/></SafeAreaProvider>;
}
