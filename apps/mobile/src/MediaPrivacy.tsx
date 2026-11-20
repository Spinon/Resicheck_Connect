import React,{createContext,useContext,useSyncExternalStore} from 'react';
import {Pressable,StyleSheet,Text,View} from 'react-native';
import type {createMediaPresentation} from './media-presentation.ts';
import type {MediaVisibilityView} from './media-visibility.ts';
type Presentation=ReturnType<typeof createMediaPresentation>;
const Context=createContext<Presentation|null>(null);
export const MediaPrivacyProvider=Context.Provider;
const noop=()=>()=>{};
const visible:MediaVisibilityView=Object.freeze({appState:'active',focused:true,mediaVisible:true,pickerPending:false,modalVisible:true,covered:false,previewOpen:false,needsExplicitReveal:false,lastPickerOutcome:null});
export function useMediaPrivacy(){
 const presentation=useContext(Context),gate=presentation?.gate;
 const view=useSyncExternalStore(gate?.subscribe??noop,gate?.snapshot??(()=>visible),gate?.snapshot??(()=>visible));
 const actions=gate?.bind();
 return {view,presentation,actions,allowed:()=>!actions||actions.canUse()};
}
// Keep children mounted behind the cover: unmounting a composer discards its
// private draft and would incorrectly cancel a returning system picker.
export function MediaPrivacySurface({children,enabled=true}:{children:React.ReactNode;enabled?:boolean}){
 const {view,presentation,actions}=useMediaPrivacy();if(!presentation||!enabled)return <>{children}</>;
 const hidden=!view.mediaVisible;
 return <View>
  {hidden&&<View testID="media-privacy-cover" style={s.cover}><Text accessibilityLiveRegion="polite">Mídias locais ocultas</Text><Text>Toque para conferir somente neste aparelho.</Text><Pressable accessibilityRole="button" accessibilityLabel="Revelar mídias locais" accessibilityState={{disabled:view.pickerPending}} disabled={view.pickerPending} onPress={()=>{actions?.reveal();}} style={s.button}><Text style={s.label}>Revelar mídias locais</Text></Pressable></View>}
  <View testID="media-privacy-content" style={hidden?s.hidden:undefined} pointerEvents={hidden?'none':'auto'} accessibilityElementsHidden={hidden} importantForAccessibility={hidden?'no-hide-descendants':'auto'}>{children}</View>
 </View>;
}
const s=StyleSheet.create({cover:{padding:12,gap:10},hidden:{display:'none'},button:{padding:14,minHeight:48,backgroundColor:'#17644B',borderRadius:10},label:{color:'white',fontSize:16}});
