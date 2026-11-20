import React,{useRef,useSyncExternalStore} from 'react';
import {Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import type {createNotificationPreferencesHost} from './notification-preferences-host.ts';
type Host=ReturnType<typeof createNotificationPreferencesHost>;
const levels=['Apenas o nome do app','App e empresa','App, empresa e atendente','App, empresa, atendente e mensagem'];
function Choice({label,selected,onPress}:{label:string;selected:boolean;onPress:()=>void}){return <Pressable accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{checked:selected}} onPress={onPress} style={[s.choice,selected&&s.selected]}><Text style={s.body}>{selected?'● ':''}{label}</Text></Pressable>;}
export function NotificationPreferencesView({host,onBack}:{host:Host;onBack:()=>void}){
 const v=useSyncExternalStore(host.subscribe,host.snapshot,host.snapshot),width=useRef(0),preview=host.preview();
 if(!v.ready)return <View style={s.page}><Text style={s.body}>Entre para configurar este teste.</Text></View>;
 return <ScrollView style={s.page} contentContainerStyle={s.content}>
 <Text style={s.title}>Notificações</Text><Text style={s.body}>Configuração local de teste nesta sessão e aparelho. Nenhuma notificação será enviada.</Text>
 <Text style={s.subtitle}>Quais notificações receber</Text>{v.filter===null&&<Text style={s.body}>Filtro ainda não configurado.</Text>}
 <Choice label="Todas as notificações" selected={v.filter==='all'} onPress={()=>{host.setFilter('all');}}/><Choice label="Somente importantes" selected={v.filter==='important'} onPress={()=>{host.setFilter('important');}}/>
 <Text style={s.subtitle}>Privacidade da prévia</Text><Text accessibilityLiveRegion="polite" style={s.body}>{'Nível '+v.privacy+' de 4: '+levels[v.privacy-1]}</Text>
 <View accessible accessibilityRole="adjustable" accessibilityLabel="Nível de privacidade" accessibilityValue={{min:1,max:4,now:v.privacy,text:levels[v.privacy-1]}} accessibilityActions={[{name:'increment',label:'Mostrar próximo nível'},{name:'decrement',label:'Mostrar nível anterior'}]} onAccessibilityAction={e=>{if(e.nativeEvent.actionName==='increment')host.setPrivacy(Math.min(4,v.privacy+1));if(e.nativeEvent.actionName==='decrement')host.setPrivacy(Math.max(1,v.privacy-1));}} onLayout={e=>{width.current=e.nativeEvent.layout.width;}} onStartShouldSetResponder={()=>true} onResponderRelease={e=>{const x=e.nativeEvent.locationX;if(width.current>0&&Number.isFinite(x))host.setPrivacy(1+Math.round(Math.max(0,Math.min(1,x/width.current))*3));}} style={s.slider}>
 <View pointerEvents="none" style={s.track}/>{[1,2,3,4].map(level=><View key={level} pointerEvents="none" style={[s.dot,level===v.privacy&&s.activeDot]}/>)}</View>
 {[1,2,3,4].map(level=><Choice key={level} label={'Nível '+level+': '+levels[level-1]} selected={v.privacy===level} onPress={()=>{host.setPrivacy(level);}}/>)}
 {v.privacy>1&&<Text style={s.notice}>Empresa, atendente e mensagem podem revelar informações sensíveis na tela bloqueada. Esta escolha não altera as regras do sistema.</Text>}
 <Text style={s.subtitle}>Prévia sintética de mensagem importante</Text><View style={s.preview}>{preview?<><Text style={s.body}>{preview.app}</Text>{preview.company&&<Text style={s.body}>{preview.company}</Text>}{preview.attendant&&<Text style={s.body}>{preview.attendant}</Text>}{preview.message&&<Text style={s.body}>{preview.message}</Text>}</>:<Text style={s.body}>Escolha um filtro para ver a prévia.</Text>}</View>
 <Text style={s.body}>Permissão do sistema: não solicitada por este laboratório. Escolher um filtro não concede permissão ao Android. O chat continua disponível sem notificações.</Text>
 <Text style={s.body}>Neste teste, sair ou trocar a sessão descarta as preferências. Persistência, sincronização e notificações reais ainda não estão integradas.</Text>
 <Pressable accessibilityRole="button" accessibilityLabel="Voltar à jornada" onPress={onBack} style={s.choice}><Text style={s.body}>Voltar à jornada</Text></Pressable>
 </ScrollView>;
}
const s=StyleSheet.create({page:{flex:1,backgroundColor:'#F5F9F6'},content:{padding:20,gap:18,paddingBottom:40},title:{fontSize:24,fontWeight:'700',color:'#185C45'},subtitle:{fontSize:20,fontWeight:'600',color:'#18372C'},body:{fontSize:17,lineHeight:26,color:'#18372C'},notice:{fontSize:17,lineHeight:26,color:'#70411B'},choice:{minHeight:52,padding:14,borderWidth:1,borderColor:'#8AA997',borderRadius:12,justifyContent:'center'},selected:{backgroundColor:'#DDEEE3',borderColor:'#185C45',borderWidth:2},preview:{padding:16,borderRadius:12,backgroundColor:'white',gap:8},slider:{height:64,flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingHorizontal:8},track:{position:'absolute',left:8,right:8,height:4,backgroundColor:'#8AA997'},dot:{width:20,height:20,borderRadius:10,backgroundColor:'#F5F9F6',borderWidth:2,borderColor:'#53735F'},activeDot:{width:28,height:28,borderRadius:14,backgroundColor:'#185C45'}});
