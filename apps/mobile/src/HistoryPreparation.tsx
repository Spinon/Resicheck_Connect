import React,{useEffect,useRef} from 'react';
import {AccessibilityInfo,Animated,StyleSheet,View} from 'react-native';
/** Indeterminate: the server does not supply a total history count. */
export function HistoryPreparation(){const motion=useRef(new Animated.Value(0)).current;
 useEffect(()=>{let alive=true,loop:Animated.CompositeAnimation|null=null;const start=(reduced:boolean)=>{loop?.stop();if(!alive)return;if(reduced){motion.setValue(.5);return;}motion.setValue(0);loop=Animated.loop(Animated.timing(motion,{toValue:1,duration:1400,useNativeDriver:true}));loop.start();};void AccessibilityInfo.isReduceMotionEnabled().then(start).catch(()=>start(true));const sub=AccessibilityInfo.addEventListener('reduceMotionChanged',start);return()=>{alive=false;loop?.stop();sub.remove();};},[motion]);
 return <View accessibilityRole="progressbar" accessibilityLabel="Carregando histórico da conversa" accessibilityState={{busy:true}} style={s.track}><Animated.View accessible={false} style={[s.bar,{opacity:motion.interpolate({inputRange:[0,.5,1],outputRange:[.35,1,.35]}),transform:[{translateX:motion.interpolate({inputRange:[0,1],outputRange:[-45,45]})}]}]}/></View>;
}
const s=StyleSheet.create({track:{height:6,borderRadius:3,backgroundColor:'#DCEBE1',overflow:'hidden',marginVertical:8,alignItems:'center'},bar:{height:6,width:'35%',borderRadius:3,backgroundColor:'#26724E'}});
