import React,{useEffect,useSyncExternalStore} from 'react';import {Pressable,StyleSheet,Text,View} from 'react-native';import type {createMessageImportanceHost} from './message-importance-host.ts';
type Host=ReturnType<typeof createMessageImportanceHost>;
export function MessageImportanceControl({host}:{host:Host}){const v=useSyncExternalStore(host.subscribe,host.snapshot,host.snapshot);useEffect(()=>{void host.refresh();},[host]);if(v.stage==='hidden'||v.stage==='paused')return null;
 const button=(label:string,action:()=>void)=><Pressable key={label} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled:v.busy}} disabled={v.busy} onPress={action} style={[s.button,v.busy&&{opacity:.5}]}><Text style={s.label}>{label}</Text></Pressable>;
 return <View style={s.group}>{v.important!==null&&<Text accessibilityLiveRegion="polite" style={s.text}>{v.important?'Mensagem importante':'Mensagem sem destaque'}</Text>}{v.busy&&<Text accessibilityLiveRegion="polite" style={s.text}>Atualizando marcação…</Text>}
 {v.notice==='conflict'&&<Text accessibilityLiveRegion="polite" style={s.text}>Outra alteração foi registrada. Confira o estado atualizado antes de marcar novamente.</Text>}
 {v.notice==='uncertain'&&<Text accessibilityLiveRegion="polite" style={s.text}>A confirmação não chegou. A alteração pode ter sido salva. Confirmar usa a mesma tentativa.</Text>}
 {v.notice==='unavailable'&&<Text accessibilityLiveRegion="polite" style={s.text}>Não foi possível conferir a marcação. Atualize antes de tentar outra alteração.</Text>}
 {v.stage==='ready'&&button(v.important?'Remover marcação de importante':'Marcar mensagem como importante',()=>{void host.set(!v.important);})}
 {v.stage==='uncertain'&&button('Confirmar mesma alteração',()=>{void host.retry();})}
 {!v.busy&&button('Atualizar marcação',()=>{void host.refresh();})}</View>;
}
const s=StyleSheet.create({group:{gap:12,marginTop:12},text:{fontSize:16,lineHeight:24,color:'#18372C'},button:{minHeight:52,padding:14,borderRadius:12,backgroundColor:'#DDEEE3',justifyContent:'center'},label:{fontSize:16,fontWeight:'600',color:'#185C45'}});
