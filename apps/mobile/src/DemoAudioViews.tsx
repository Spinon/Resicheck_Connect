import {MediaWindow} from "./MediaWindow.tsx";
import {MediaPrivacySurface,useMediaPrivacy} from "./MediaPrivacy.tsx";
import React,{useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {Pressable,StyleSheet,Text,View} from 'react-native';
import type {createDemoAudioSession} from './demo-audio-session.ts';
type Host=ReturnType<typeof createDemoAudioSession>;

function AudioAction({label,action,disabled=false,hint}:{label:string;action:()=>void;disabled?:boolean;hint?:string}){
 const privacy=useMediaPrivacy();
 return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={hint} accessibilityState={{disabled}} disabled={disabled} onPress={()=>{if(privacy.allowed())action();}} style={[s.button,disabled&&s.disabled]}><Text style={s.buttonText}>{label}</Text></Pressable>;
}
const duration=(ms:number)=>{const seconds=Math.max(0,Math.floor(ms/1000));return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;};
const draftStatus={idle:'Pronto para gravar',clearing:'Descartando rascunho de áudio',permission:'Aguardando permissão do microfone',preparing:'Preparando gravação',recording:'Gravando áudio neste aparelho',stopping:'Preparando revisão do áudio',ready:'Áudio local pronto para ouvir',loading:'Carregando áudio para revisão',playing:'Ouvindo áudio local',error:'Áudio local indisponível',blocked:'Limpeza do rascunho pendente'} as const;

// Parent modal provides scrolling. No fixed heights or text scaling cap here.
export function DemoAudioComposer({host,close,preserveDraftOnUnmount=false}:{host:Host;close:()=>void;preserveDraftOnUnmount?:boolean}){
 const contextId=useSyncExternalStore(host.subscribeContext,host.contextId,host.contextId),draft=useSyncExternalStore(host.draft.subscribe,host.draft.snapshot,host.draft.snapshot),saved=useSyncExternalStore(host.saved.subscribe,host.saved.snapshot,host.saved.snapshot),actions=host.bind(),mounted=useRef<object|null>(null);
 // Capture this scope's controls; never acquire a fresh capability during cleanup.
 useEffect(()=>{
  const lifetime=Object.freeze({});mounted.current=lifetime;
  // Opening the recorder must make its controls usable even if a saved clip
  // was playing behind the modal. Wait for confirmed pause before recording.
  const phase=host.saved.snapshot().phase;
  if(phase==='playing'||phase==='loading')void actions.pause();
  return()=>{if(mounted.current===lifetime)mounted.current=null;if(!preserveDraftOnUnmount)void actions.discard();};
 },[host,contextId,preserveDraftOnUnmount]);
 const saving=saved.phase==='saving',canRecord=contextId!==null&&draft.phase==='idle'&&saved.phase==='idle';
 return <MediaPrivacySurface><View style={s.panel}>
  <Text style={s.body}>{draft.phase==='idle'?'O microfone grava de verdade. Use conteúdo fictício; o áudio fica só neste aparelho, sem envio.':'Somente neste aparelho · Não enviado à empresa'}</Text>
  <Text accessibilityLiveRegion="polite" style={s.status}>{contextId===null?'Abra uma conversa para gravar':saving?'Guardando cópia neste aparelho':draftStatus[draft.phase]}</Text>
  <Text style={s.body} accessibilityLabel={'Duração do áudio: '+duration(draft.durationMs)}>{duration(draft.durationMs)} · limite de 1 minuto</Text>
  {draft.phase==='playing'&&<Text style={s.body}>Reprodução: {duration(draft.positionMs)}</Text>}
  {draft.notice&&<Text accessibilityRole="alert" style={s.warning}>{draft.notice==='permission-ready'?'Microfone habilitado. Toque novamente em Gravar.':draft.notice==='permission-blocked'?'O microfone está bloqueado para este app. Ative-o nas configurações do aparelho e depois tente gravar novamente. Seu texto foi mantido.':draft.notice==='permission'?'Microfone não autorizado. Seu texto foi mantido.':draft.notice==='too-short'?'Áudio muito curto ou inválido. Grave novamente.':draft.notice==='limit'?'Limite local atingido. Grave um áudio de até 1 minuto.':'Não foi possível usar o áudio local. Descarte o rascunho e tente novamente.'}</Text>}
  {saved.notice&&<Text accessibilityRole="alert" style={s.warning}>{saved.notice==='limit'?'Limite de oito áudios locais nesta conversa. Descarte cópias guardadas antes de continuar.':'Não foi possível guardar ou limpar a cópia local. Nenhum áudio foi enviado.'}</Text>}
  {draft.phase==='idle'&&<AudioAction label={draft.notice==="permission-blocked"?"Tentar gravar áudio":"Gravar áudio neste aparelho"} disabled={!canRecord} action={()=>{void actions.start();}}/>}
  {draft.phase==='recording'&&<AudioAction label="Parar gravação e revisar" action={()=>{void actions.stop();}}/>}
  {draft.phase==='ready'&&<AudioAction label="Ouvir áudio antes de guardar" disabled={saving} action={()=>{void actions.preview();}}/>}
  {['ready','playing'].includes(draft.phase)&&host.draft.supportsReplay()&&<AudioAction label="Ouvir áudio do início" disabled={saving||contextId===null} action={()=>{void actions.replay();}}/>}
  {draft.phase==='playing'&&<AudioAction label="Pausar revisão do áudio" disabled={saving} action={()=>{void actions.pauseDraft();}}/>}
  {draft.phase==='ready'&&<AudioAction label="Guardar só neste aparelho, sem enviar" hint="Guarda uma cópia temporária local. Não envia áudio à empresa." disabled={draft.phase!=='ready'||saved.phase!=='idle'||contextId===null} action={()=>{const lifetime=mounted.current;void actions.save().then(ok=>{if(ok&&lifetime!==null&&mounted.current===lifetime&&host.contextId()===contextId)close();});}}/>}
  <AudioAction label="Descartar rascunho de áudio" disabled={contextId===null||draft.phase==='clearing'} action={()=>{void actions.discard();}}/>
  {['idle','ready','error','blocked'].includes(draft.phase)&&<Text style={s.body}>Seu texto e suas imagens não são alterados. Trocar de conversa, empresa ou conta descarta as cópias temporárias de áudio.</Text>}
 </View></MediaPrivacySurface>;
}

export function DemoAudioMessages({host}:{host:Host}){
 const privacy=useMediaPrivacy();
 const [confirmation,setConfirmation]=useState<{number:number;remove:()=>void}|null>(null);
 useEffect(()=>{if(!privacy.view.mediaVisible)setConfirmation(null);},[privacy.view.mediaVisible]);
 const contextId=useSyncExternalStore(host.subscribeContext,host.contextId,host.contextId),view=useSyncExternalStore(host.saved.subscribe,host.saved.snapshot,host.saved.snapshot),draft=useSyncExternalStore(host.draft.subscribe,host.draft.snapshot,host.draft.snapshot),actions=host.bind();
 useEffect(()=>()=>{void actions.pause();},[host,contextId]);
 if(view.clips.length===0&&!view.notice&&view.phase!=='blocked')return null;
 const canClear=contextId!==null&&!['saving','loading','stopping','removing','clearing','closed'].includes(view.phase);
 const canRemove=contextId!==null&&draft.phase==='idle'&&['idle','playing','loading'].includes(view.phase);
 return <MediaPrivacySurface><View style={s.panel}>
  <Text accessibilityRole="header" style={s.title}>Áudios locais · Não enviados</Text>
  {view.phase==='removing'&&<Text accessibilityLiveRegion="polite" style={s.status}>Removendo cópia local do áudio</Text>}
  {view.clips.map((clip,index)=>{const number=index+1,playing=view.playingId===clip.id&&view.phase==='playing',loading=view.playingId===clip.id&&view.phase==='loading';return <View key={clip.id} style={s.card}>
   <Text style={s.title}>Áudio local {number}</Text><Text style={s.body}>{duration(clip.durationMs)} · Somente neste aparelho</Text><Text style={s.body}>Não enviado à empresa</Text>
   {loading&&<Text accessibilityLiveRegion="polite" style={s.status}>Carregando áudio local</Text>}
   {playing?<><Text accessibilityLiveRegion="polite" style={s.status}>Reproduzindo áudio local</Text><AudioAction label={'Pausar áudio local '+number} action={()=>{void actions.pause();}}/></>:<AudioAction label={'Ouvir áudio local '+number} disabled={view.phase!=='idle'||draft.phase!=='idle'||contextId===null} action={()=>{void actions.play(clip.id);}}/>}
   <AudioAction label={'Remover áudio local '+number} hint="Pede confirmação para remover somente esta cópia temporária. Mantém os outros áudios, imagens e texto." disabled={!canRemove} action={()=>setConfirmation({number,remove:()=>{if(privacy.allowed())void actions.remove(clip.id);}})}/>
  </View>;})}
  {view.notice&&<Text accessibilityRole="alert" style={s.warning}>{view.notice==='limit'?'Limite de oito áudios temporários nesta conversa.':'Não foi possível usar os áudios locais. Tente descartar as cópias temporárias.'}</Text>}
  {(view.clips.length>0||view.phase==='blocked')&&<><Text style={s.body}>Descartar remove todos os áudios locais desta conversa. Seu texto e suas imagens são mantidos.</Text><AudioAction label="Descartar áudios locais desta conversa" disabled={!canClear} action={actions.clear}/></>}
 <MediaWindow priority={30} visible={confirmation!==null&&privacy.view.mediaVisible} onClose={()=>setConfirmation(null)}><View style={s.confirmOverlay}><View style={s.card} accessibilityViewIsModal><Text accessibilityRole="header" style={s.title}>Remover áudio local {confirmation?.number}?</Text><Text style={s.body}>Remove somente esta cópia temporária do aplicativo. Os outros áudios, imagens e o texto serão mantidos. Nenhum arquivo remoto ou original do aparelho será excluído.</Text><AudioAction label="Cancelar" action={()=>setConfirmation(null)}/><AudioAction label="Remover cópia" action={()=>{confirmation?.remove();setConfirmation(null);}}/></View></View></MediaWindow>
 </View></MediaPrivacySurface>;
}
const s=StyleSheet.create({confirmOverlay:{flex:1,justifyContent:"center",padding:18,backgroundColor:"#142C2470"},panel:{gap:12,padding:10},title:{fontSize:18,lineHeight:26,fontWeight:'700',color:'#185C45',flexShrink:1},status:{fontSize:17,lineHeight:25,color:'#185C45',flexShrink:1},body:{fontSize:16,lineHeight:24,color:'#18372C',flexShrink:1},warning:{fontSize:16,lineHeight:24,color:'#803D19',flexShrink:1},card:{gap:10,padding:14,borderRadius:15,backgroundColor:'#E5F1E8'},button:{padding:14,minHeight:52,backgroundColor:'#185C45',borderRadius:14,justifyContent:'center'},disabled:{opacity:0.45},buttonText:{fontSize:16,lineHeight:24,color:'#FFFFFF',textAlign:'center',flexShrink:1}});
