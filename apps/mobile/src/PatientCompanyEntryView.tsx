import React,{useSyncExternalStore} from 'react';
import {Pressable,ScrollView,Text,View} from 'react-native';
import type {createPatientCompanyEntryHost} from './patient-company-entry-host.ts';
type Host=ReturnType<typeof createPatientCompanyEntryHost>;
export function PatientCompanyEntryView({host}:{host:Host}){
 const v=useSyncExternalStore(host.subscribe,host.snapshot,host.snapshot);
 if(v.stage==='idle')return null;
 const button=(label:string,action:()=>void,disabled=false)=><Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled}} disabled={disabled} onPress={action} style={{minHeight:48,padding:14,borderRadius:10,backgroundColor:disabled?'#EBF1ED':'#DDEEE3'}}><Text style={{fontSize:17,color:'#185C45'}}>{label}</Text></Pressable>;
 const waiting=<><Text style={{fontSize:17}}>Entre e conclua seu cadastro para consultar esta empresa.</Text>{button('Cancelar identificador',host.cancel)}</>;
 if(v.stage==='waiting-profile')return <View style={{padding:12,gap:10}}>{waiting}</View>;
 return <ScrollView contentContainerStyle={{padding:20,gap:16}} keyboardShouldPersistTaps="handled">
  <Text accessibilityRole="header" style={{fontSize:22,color:'#185C45'}}>Empresa pelo identificador</Text>
  {v.stage==='loading'&&<Text accessibilityLiveRegion="polite" style={{fontSize:17}}>Consultando empresa.</Text>}
  {v.company&&<View style={{padding:16,borderWidth:1,borderColor:'#C9DCD0',borderRadius:12,gap:10}}><Text style={{fontSize:21,fontWeight:'600'}}>{v.company.name}</Text><Text style={{fontSize:17}}>{v.company.address}</Text><Text style={{fontSize:17}}>{v.company.phone}</Text></View>}
  {v.stage==='preview'&&<><Text style={{fontSize:17}}>Consultar a empresa ainda não cria um vínculo.</Text>{button('Vincular como cliente',()=>{void host.link();})}</>}
  {v.stage==='linking'&&<Text accessibilityLiveRegion="polite" style={{fontSize:17}}>Confirmando seu vínculo de cliente. Sair desta entrada não desfaz um pedido já enviado.</Text>}
  {v.stage==='linked'&&<><Text accessibilityLiveRegion="polite" style={{fontSize:17}}>Vínculo de cliente ativo.</Text>{button('Abrir minha conversa',()=>{host.open();})}</>}
  {v.stage==='recovery'&&<><Text accessibilityLiveRegion="polite" style={{fontSize:17}}>Não foi possível confirmar seu vínculo. Recupere a situação antes de continuar. Esta ação não repete o pedido de vínculo.</Text>{button('Recuperar meu vínculo',()=>{void host.recover();},v.busy)}</>}
  {v.stage==='unavailable'&&<Text accessibilityLiveRegion="polite" style={{fontSize:17}}>Não foi possível consultar esta empresa. Volte aos seus vínculos e tente novamente.</Text>}
  {['linked','recovery'].includes(v.stage)&&<Text style={{fontSize:16}}>Fechar esta entrada não desfaz um pedido de vínculo já enviado.</Text>}
  {button(['linking','linked','recovery'].includes(v.stage)?'Fechar identificador':'Cancelar identificador',host.cancel,v.stage==='linking')}
 </ScrollView>;
}
