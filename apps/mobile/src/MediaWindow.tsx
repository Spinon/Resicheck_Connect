import React,{createContext,useCallback,useContext,useEffect,useId,useLayoutEffect,useMemo,useState} from 'react';
import {BackHandler,Modal,StyleSheet,View} from 'react-native';
type Entry=Readonly<{id:string;priority:number;content:React.ReactNode}>;
type Registry={covered:boolean;put:(entry:Entry)=>void;remove:(id:string)=>void};
const Context=createContext<Registry|null>(null);

// Media overlays share the Activity window. A native Dialog steals its focus,
// which AppState cannot distinguish from an external notification drawer.
export function MediaWindowHost({children}:{children:React.ReactNode}){
 const [entries,setEntries]=useState<readonly Entry[]>([]);
 const put=useCallback((entry:Entry)=>setEntries(old=>{const found=old.find(x=>x.id===entry.id);return found?.content===entry.content?old:[...old.filter(x=>x.id!==entry.id),entry];}),[]);
 const remove=useCallback((id:string)=>setEntries(old=>old.some(x=>x.id===id)?old.filter(x=>x.id!==id):old),[]);
 const registry=useMemo(()=>({put,remove,covered:entries.length>0}),[put,remove,entries.length]);
 const ordered=[...entries].sort((a,b)=>a.priority-b.priority);
 return <Context.Provider value={registry}><View style={s.root}>
  <View style={s.root} accessibilityElementsHidden={ordered.length>0} importantForAccessibility={ordered.length?'no-hide-descendants':'auto'}>{children}</View>
  {ordered.map((entry,index)=><View key={entry.id} style={s.overlay} accessibilityViewIsModal accessibilityElementsHidden={index<ordered.length-1} importantForAccessibility={index<ordered.length-1?'no-hide-descendants':'auto'}>{entry.content}</View>)}
 </View></Context.Provider>;
}
export function useMediaWindowCovered(){return useContext(Context)?.covered??false;}
export function MediaWindow({visible,onClose,onShow,children,priority=10}:{visible:boolean;onClose:()=>void;onShow?:()=>void;children:React.ReactNode;priority?:number}){
 const host=useContext(Context),id=useId();
 useLayoutEffect(()=>{if(host&&visible)host.put({id,priority,content:children});else host?.remove(id);},[host,id,priority,visible,children]);
 useLayoutEffect(()=>()=>host?.remove(id),[host,id]);
 useEffect(()=>{if(!host||!visible)return;const frame=requestAnimationFrame(()=>onShow?.());const back=BackHandler.addEventListener('hardwareBackPress',()=>{onClose();return true;});return()=>{cancelAnimationFrame(frame);back.remove();};},[host,visible,onClose,onShow]);
 return host?null:<Modal visible={visible} transparent animationType="none" onShow={onShow} onRequestClose={onClose}>{children}</Modal>;
}
const s=StyleSheet.create({root:{flex:1},overlay:{position:'absolute',top:0,right:0,bottom:0,left:0,zIndex:100}});
