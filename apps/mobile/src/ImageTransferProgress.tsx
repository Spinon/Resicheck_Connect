import {ConnectIcon} from './ConnectIcon.tsx';
import React from'react';import{ActivityIndicator,Pressable,StyleSheet,Text,View}from'react-native';import type{ImageByteProgress}from'../../../packages/chat-client/src/image-transfer.ts';
/** Central overlay never participates in thumbnail layout. Fetch upload has no
 * byte callback: remain indeterminate rather than manufacturing a percentage. */
export function ImageTransferProgress({label,progress}:{label:string;progress?:ImageByteProgress|null}){const valid=!!progress&&progress.phase!=='verification'&&Number.isSafeInteger(progress.loaded)&&Number.isSafeInteger(progress.total)&&progress.total!>0&&progress.loaded>=0&&progress.loaded<=progress.total!,percent=valid?Math.floor(progress!.loaded/progress!.total!*100):null;return <View pointerEvents="none" style={s.overlay}><View accessible accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={percent===null?undefined:{min:0,max:100,now:percent,text:percent+'%'}} accessibilityState={{busy:true}} style={s.circle}>{percent===null?<ActivityIndicator color="white" size="large"/>:<>{Array.from({length:36},(_,i)=>{const angle=i*Math.PI/18-Math.PI/2;return <View key={i} style={{position:'absolute',width:3,height:3,borderRadius:2,left:26+22*Math.cos(angle),top:26+22*Math.sin(angle),backgroundColor:i<percent*.36?'white':'#718078'}}/>;})}<Text style={s.percent}>{percent}%</Text></>}</View></View>;}
export function ImageUploadRetry({onPress}:{onPress:()=>void}) {
 return <View pointerEvents="box-none" style={s.overlay}>
  <Pressable accessibilityRole="button" accessibilityLabel="Tentar novamente" onPress={onPress} style={s.circle}>
   <ConnectIcon name="upload" size={28} color="white"/>
  </Pressable>
 </View>;
}
const s=StyleSheet.create({overlay:{position:'absolute',top:0,left:0,right:0,bottom:0,alignItems:'center',justifyContent:'center'},circle:{width:56,height:56,borderRadius:28,backgroundColor:'rgba(12,38,29,.78)',alignItems:'center',justifyContent:'center'},percent:{color:'white',fontSize:12,fontWeight:'600'}});
