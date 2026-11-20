import React,{useSyncExternalStore,type ReactNode} from 'react';
import {Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import type {InstallationStartupController} from './installation-startup-controller.ts';
export function InstallationStartupView<R>({controller,children}:{controller:InstallationStartupController<R>;children:(runtime:R)=>ReactNode}){
  const state=useSyncExternalStore(controller.subscribe,controller.snapshot,controller.snapshot),runtime=state.stage==='ready'?controller.currentRuntime():null;
  if(state.stage==='ready'&&runtime!==null)return <>{children(runtime)}</>;
  const waiting=state.stage==='waiting',loading=state.stage==='loading';
  return <ScrollView style={s.page} contentContainerStyle={s.content}>
    <Text accessibilityRole="header" style={s.title}>ResiCheck Connect</Text>
    <View style={s.card}><Text accessibilityRole="header" style={s.heading}>{loading?'Preparando o aplicativo':waiting?'Aguardando operação':state.stage==='closed'?'Aplicativo encerrado':'Não foi possível preparar o aplicativo.'}</Text>
      <Text accessibilityLiveRegion="polite" style={s.body}>{loading?'Aguarde enquanto preparamos esta instalação.':waiting?'A operação ainda está em andamento. Aguarde para tentar novamente.':state.stage==='closed'?'Abra novamente o aplicativo para continuar.':'Tente novamente para continuar com segurança.'}</Text>
      {state.stage!=='closed'&&<Pressable accessibilityRole="button" accessibilityLabel="Tentar novamente" accessibilityState={{disabled:!state.canRetry}} disabled={!state.canRetry} onPress={()=>{void controller.retry();}} style={[s.button,!state.canRetry&&s.disabled]}><Text style={s.buttonText}>Tentar novamente</Text></Pressable>}
    </View>
    <Text style={s.body}>Esta tela não redefine nem apaga a identificação da instalação. Nenhuma conta é criada aqui.</Text>
  </ScrollView>;
}
const s=StyleSheet.create({page:{flex:1,backgroundColor:'#F5F9F6'},content:{flexGrow:1,padding:24,paddingBottom:48,gap:22,justifyContent:'center'},title:{fontSize:26,lineHeight:34,fontWeight:'700',color:'#185C45'},heading:{fontSize:21,lineHeight:29,fontWeight:'600',color:'#18372C'},body:{fontSize:18,lineHeight:28,color:'#18372C',flexShrink:1},card:{padding:20,borderRadius:16,borderWidth:1,borderColor:'#C8DBCF',gap:18},button:{minHeight:56,padding:16,borderRadius:12,backgroundColor:'#DDEEE3',justifyContent:'center'},buttonText:{fontSize:18,lineHeight:28,fontWeight:'600',color:'#185C45',flexShrink:1},disabled:{opacity:0.6}});
