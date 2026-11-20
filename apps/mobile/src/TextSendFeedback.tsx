import React from 'react';
import {Pressable,StyleSheet,Text,View} from 'react-native';
import {textSendFeedback,textConnectionFeedback,type TextSendConnection} from './text-send-presentation.ts';
/** Display and explicit callbacks only. Does not monitor connectivity or send. */
export function TextSendFeedback({entry,connection='unknown',onRetry,onRefresh}:{entry:unknown;connection?:TextSendConnection;onRetry:()=>void;onRefresh:()=>void}){
 const feedback=textSendFeedback(entry,connection),link=textConnectionFeedback(connection);
 return <View style={styles.panel}>
  <Text style={styles.label}>{feedback.label}</Text>
  <Text accessibilityLiveRegion="polite" style={styles.body}>{feedback.detail}</Text>
  {link.notice&&<Text style={styles.body}>{link.notice}</Text>}
  {feedback.actionLabel&&<Pressable accessibilityRole="button" accessibilityLabel={feedback.actionLabel} accessibilityState={{disabled:feedback.actionDisabled}} disabled={feedback.actionDisabled} onPress={()=>{if(feedback.actionDisabled)return;if(feedback.action==='retry-same')onRetry();else if(feedback.action==='refresh')onRefresh();}} style={[styles.button,feedback.actionDisabled&&styles.disabled]}><Text style={styles.label}>{feedback.actionLabel}</Text></Pressable>}
 </View>;
}
const styles=StyleSheet.create({panel:{gap:8},label:{fontSize:16,fontWeight:'600',color:'#234B38'},body:{fontSize:17,lineHeight:26,color:'#18372C'},button:{minHeight:52,padding:14,justifyContent:'center',borderRadius:12,backgroundColor:'#DDEEE3'},disabled:{opacity:.5}});
