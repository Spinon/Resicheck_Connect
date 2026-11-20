import React from 'react';
import {Pressable,StyleSheet,Text,View} from 'react-native';
import {ConnectIcon} from './ConnectIcon.tsx';
import type {ConnectedTab,ConnectedTabId} from './connected-tabs.ts';
type Props={tabs:readonly ConnectedTab[];active:ConnectedTabId|null;onSelect:(id:ConnectedTabId)=>void;disabled?:boolean};
/** Parent owns safe-area and visibility during private-cover/chat/keyboard.
 * Selecting a tab requests presentation navigation, never permission. */
export function ConnectedBottomBar({tabs,active,onSelect,disabled=false}:Props){
 return <View accessibilityRole="tablist" style={s.bar}>{tabs.map(tab=>{
  const selected=tab.id===active,color=selected?'#185C45':'#52675A';
  return <Pressable key={tab.id} accessibilityRole="tab" accessibilityLabel={tab.label} accessibilityState={{selected,disabled}} disabled={disabled} onPress={()=>onSelect(tab.id)} style={({pressed})=>[s.tab,pressed&&s.pressed,disabled&&s.disabled]}>
   <View style={[s.iconPill,selected&&s.selected]}><ConnectIcon name={tab.icon} color={color} size={24}/></View>
   <Text style={[s.label,{color},selected&&s.selectedLabel]}>{tab.label}</Text>
  </Pressable>;
 })}</View>;
}
const s=StyleSheet.create({
 bar:{flexDirection:'row',alignItems:'stretch',flexShrink:0,paddingHorizontal:8,paddingTop:8,paddingBottom:8,borderTopWidth:1,borderTopColor:'#E1EAE3',backgroundColor:'#FFFFFF'},
 tab:{flex:1,minWidth:56,minHeight:60,alignItems:'center',justifyContent:'center',paddingHorizontal:2,paddingVertical:2,gap:3,borderRadius:12},
 iconPill:{width:48,height:30,borderRadius:10,overflow:'hidden',alignItems:'center',justifyContent:'center'},
 selected:{backgroundColor:'#DFEEE3'},
 label:{fontSize:12,lineHeight:18,fontWeight:'500',textAlign:'center'},
 selectedLabel:{fontWeight:'700'},
 pressed:{backgroundColor:'#EDF5EE'},
 disabled:{opacity:.5},
});
