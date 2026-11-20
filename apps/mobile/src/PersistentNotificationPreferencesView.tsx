import React,{useRef,useSyncExternalStore} from 'react';
import {Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import type {createPersistentNotificationPreferencesHost} from './persistent-notification-preferences-host.ts';
import {presentPersistentNotificationPreferences,notificationPrivacyLabels,notificationFilterLabel,notificationPrivacyFromTrack} from './persistent-notification-preferences-presenter.ts';
type Host=ReturnType<typeof createPersistentNotificationPreferencesHost>;
function Button({label,onPress}:{label:string;onPress:()=>void}){return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={s.button}><Text style={s.buttonText}>{label}</Text></Pressable>;}
function Choice({label,selected,disabled,onPress}:{label:string;selected:boolean;disabled:boolean;onPress:()=>void}){return <Pressable accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{checked:selected,disabled}} disabled={disabled} onPress={onPress} style={[s.choice,selected&&s.selected,disabled&&s.disabled]}><Text style={s.body}>{selected?'Selecionado: ':''}{label}</Text></Pressable>;}
export function PersistentNotificationPreferencesView({host,onBack}:{host:Host;onBack:()=>void}){
  const snapshot=useSyncExternalStore(host.subscribe,host.snapshot,host.snapshot),p=presentPersistentNotificationPreferences({host,snapshot,onBack}),trackWidth=useRef(0);
  return <View style={s.page}>
    <View style={s.navigation}><Button label="Voltar" onPress={()=>{p.actions.back();}}/></View>
    <ScrollView style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Text accessibilityRole="header" style={s.title}>Preferências de notificação</Text>
      <Text accessibilityLiveRegion="polite" style={s.body}>{p.message}</Text>
      <Text style={s.body}>Esta tela não solicita permissão do sistema e não envia notificações.</Text>
      {p.loaded&&<View style={s.card}><Text accessibilityRole="header" style={s.subtitle}>Configuração carregada</Text><Text style={s.body}>{notificationFilterLabel(p.loaded.filter)}</Text><Text style={s.body}>{'Nível '+p.loaded.privacy+': '+notificationPrivacyLabels[p.loaded.privacy-1]}</Text></View>}
      {p.staged&&<View style={s.section}>
        <Text accessibilityRole="header" style={s.subtitle}>{p.canEdit?'Editar preferências':'Alteração em confirmação'}</Text>
        {!p.canEdit?<View style={s.card}><Text style={s.body}>{notificationFilterLabel(p.staged.filter)}</Text><Text style={s.body}>{'Nível '+p.staged.privacy+': '+notificationPrivacyLabels[p.staged.privacy-1]}</Text></View>:<>
          <Text accessibilityRole="header" style={s.subtitle}>Quais notificações receber</Text>
          {([null,'all','important'] as const).map(value=><Choice key={value??'unset'} label={notificationFilterLabel(value)} selected={p.staged!.filter===value} disabled={!p.canEdit} onPress={()=>{p.actions.setFilter(value);}}/>)}
          <Text accessibilityRole="header" style={s.subtitle}>Privacidade</Text>
          <View accessible accessibilityRole="adjustable" accessibilityLabel="Privacidade da notificação" accessibilityValue={{min:1,max:4,now:p.staged.privacy,text:'Nível '+p.staged.privacy+' de 4: '+notificationPrivacyLabels[p.staged.privacy-1]}}
            accessibilityActions={[{name:'increment',label:'Mostrar próximo nível'},{name:'decrement',label:'Mostrar nível anterior'}]}
            onAccessibilityAction={event=>{const action=event.nativeEvent.actionName;if(action==='increment'||action==='decrement')p.actions.setPrivacy(Math.max(1,Math.min(4,p.staged!.privacy+(action==='increment'?1:-1))));}}
            onLayout={event=>{trackWidth.current=event.nativeEvent.layout.width;}} onStartShouldSetResponder={()=>p.canEdit}
            onResponderRelease={event=>{const value=notificationPrivacyFromTrack(event.nativeEvent.locationX,trackWidth.current);if(value!==null)p.actions.setPrivacy(value);}} style={s.slider}>
            <View pointerEvents="none" style={s.track}/>{([1,2,3,4] as const).map(value=><View key={value} pointerEvents="none" style={[s.dot,p.staged!.privacy===value&&s.activeDot]}/>)}
          </View>
          {([1,2,3,4] as const).map(value=><Choice key={value} label={'Nível '+value+': '+notificationPrivacyLabels[value-1]} selected={p.staged!.privacy===value} disabled={!p.canEdit} onPress={()=>{p.actions.setPrivacy(value);}}/>)}
          <Text style={s.notice}>Empresa, atendente e mensagem podem revelar informações sensíveis na tela bloqueada. A escolha não altera as regras do sistema.</Text>
        </>}
      </View>}
      <View style={s.section}>
        {p.canSave&&<Button label="Salvar alterações" onPress={()=>{void p.actions.save();}}/>}
        {p.canDiscard&&<Button label="Descartar alterações" onPress={()=>{p.actions.discard();}}/>}
        {p.canRetry&&<Button label="Tentar novamente a mesma alteração" onPress={()=>{void p.actions.retry();}}/>}
        {p.canReload&&<Button label="Recarregar preferências" onPress={()=>{void p.actions.reload();}}/>}
        {p.canCancelWait&&<><Button label="Parar de aguardar" onPress={()=>{p.actions.cancelWait();}}/><Text style={s.body}>Parar de aguardar não desfaz uma alteração que já tenha sido salva.</Text></>}
      </View>
      <Text style={s.body}>“Não configurado” não autoriza notificações. Sem confirmação da leitura, as opções de segurança exibidas não representam uma configuração salva.</Text>
    </ScrollView>
  </View>;
}
const s=StyleSheet.create({page:{flex:1,backgroundColor:'#F5F9F6'},navigation:{paddingHorizontal:16,paddingVertical:8},scroll:{flex:1},content:{padding:20,paddingBottom:44,gap:18},section:{gap:12},title:{fontSize:24,lineHeight:32,fontWeight:'700',color:'#185C45'},subtitle:{fontSize:20,lineHeight:28,fontWeight:'600',color:'#18372C'},body:{fontSize:17,lineHeight:26,color:'#18372C',flexShrink:1},notice:{fontSize:17,lineHeight:26,color:'#704B17'},card:{padding:16,borderRadius:14,borderWidth:1,borderColor:'#C8DBCF',gap:10},button:{minHeight:52,padding:14,borderRadius:12,backgroundColor:'#DDEEE3',justifyContent:'center'},buttonText:{fontSize:17,lineHeight:26,fontWeight:'600',color:'#185C45',flexShrink:1},choice:{minHeight:52,padding:14,borderWidth:1,borderColor:'#C8DBCF',borderRadius:12,justifyContent:'center'},selected:{borderWidth:2,borderColor:'#185C45',backgroundColor:'#E4F0E8'},disabled:{opacity:0.7},slider:{minHeight:56,position:'relative',flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:10},track:{position:'absolute',height:4,left:10,right:10,backgroundColor:'#A4BEB0'},dot:{width:20,height:20,borderRadius:10,backgroundColor:'#F5F9F6',borderWidth:2,borderColor:'#49765F'},activeDot:{width:28,height:28,borderRadius:14,backgroundColor:'#185C45',borderColor:'#185C45'}});
