import React,{useMemo,useSyncExternalStore}from'react';
import{View,Text,Keyboard,StyleSheet}from'react-native';
import type{createScopedRecordingHost}from'./scoped-recording-host.ts';
import type{createRecentConversationHost}from'./recent-conversation-host.ts';
import{ScopedAudioReview}from'./ScopedAudioReview.tsx';
import{AudioButton,AudioProgress,AudioBusy,audioTime,type ComposerSlots}from'./AudioControls.tsx';
import{LOCAL_AUDIO_LIMITS}from'./local-audio.ts';
export function ScopedAudioComposer({recording,conversation,permissionContext='native',controls,attachmentAction}:{permissionContext?:'web'|'native';recording:ReturnType<typeof createScopedRecordingHost>;conversation:ReturnType<typeof createRecentConversationHost>;controls?:ComposerSlots;attachmentAction?:React.ReactNode}){
 const bound=useMemo(()=>recording.bind(conversation),[recording,conversation]);
 const view=useSyncExternalStore(bound.subscribe,bound.snapshot,bound.snapshot),draft=view.draft;
 const textComposer=(microphone?:React.ReactNode)=><View style={controls?.expanded?s.expanded:undefined}>{controls?.before}<View style={[s.textRow,controls?.expanded&&s.expanded]}>{controls?.input}{attachmentAction}{microphone}{controls?.send}</View>{controls?.after}</View>;
 if(!view.available||!draft)return controls?textComposer():null;
 const review=bound.review();
 if(review)return <ScopedAudioReview controller={review} preserveOwnerOnUnmount durationMs={draft.durationMs} onPreview={bound.preview} onRecordAgain={bound.recordAgain} onDiscard={()=>{void bound.discard();}}/>;
 const notice=draft.notice==='permission-blocked'?(permissionContext==='web'?'O microfone está bloqueado. Confira a permissão do navegador.':'Permita o microfone nas configurações do aparelho para gravar.'):draft.notice==='permission'?'Permita o microfone para gravar áudio.':draft.notice==='permission-ready'?'Microfone liberado. Toque no microfone para começar.':draft.notice==='too-short'?'A gravação ficou muito curta. Tente novamente.':draft.notice==='limit'?'Você chegou ao limite de um minuto.':draft.notice==='unavailable'?'Não foi possível usar o áudio. Descarte a gravação e tente novamente.':null;
 const record=()=>{Keyboard.dismiss();return bound.record();};
 if(draft.phase==='idle')return <View style={controls?.expanded?s.expanded:undefined}>{textComposer(<AudioButton label="Gravar áudio" icon="mic" iconOnly disabled={controls?.disabled} onPress={record}/>)}{notice&&<Text accessibilityLiveRegion="polite" style={s.notice}>{notice}</Text>}</View>;
 const busy=['clearing','permission','preparing','stopping','loading'].includes(draft.phase),playing=draft.phase==='playing',recordingNow=draft.phase==='recording';
 const send=async()=>{if(recordingNow){await bound.stop();const ready=bound.snapshot();if(!ready.available||ready.draft?.phase!=='ready'||!ready.sendAvailable)return;}await bound.send();};
 const status=draft.phase==='permission'?'Aguardando permissão do microfone…':draft.phase==='preparing'?'Preparando microfone…':draft.phase==='stopping'?'Preparando gravação…':draft.phase==='loading'?'Carregando áudio…':'Descartando gravação…';
 return <View testID="audio-composer-active" style={s.panel} accessibilityState={{busy}}>
  {busy?<AudioBusy label={status}/>:<View style={s.heading}>{recordingNow&&<View accessible={false} style={s.dot}/>}<Text style={s.title}>{recordingNow?'Gravando áudio':playing?'Ouvindo gravação':draft.phase==='ready'?'Revisar áudio':'Gravação indisponível'}</Text>{!recordingNow&&draft.durationMs>0&&<Text style={s.duration}>{audioTime(draft.durationMs)}</Text>}</View>}
  {['recording','ready','playing'].includes(draft.phase)&&<View style={s.playRow}>{!recordingNow&&<AudioButton label={playing?'Pausar gravação':'Ouvir gravação'} icon={playing?'pause':'play'} iconOnly onPress={playing?bound.pause:bound.preview}/>}<AudioProgress recording={recordingNow} positionMs={recordingNow?draft.durationMs:draft.positionMs} durationMs={recordingNow?LOCAL_AUDIO_LIMITS.durationMs:draft.durationMs}/></View>}
  {notice&&<Text accessibilityLiveRegion="polite" style={s.notice}>{notice}</Text>}
  {draft.phase==='ready'&&!view.sendAvailable&&<Text style={s.notice}>O envio está indisponível. Você pode ouvir ou descartar a gravação.</Text>}
  <View style={s.actions}>
   {!['clearing','stopping'].includes(draft.phase)&&<AudioButton label={recordingNow?'Cancelar gravação':'Descartar gravação'} caption={recordingNow?'Cancelar':'Descartar'} icon="trash" destructive onPress={bound.discard}/>}
   {recordingNow&&<AudioButton label="Parar gravação" caption="Revisar" icon="stop" onPress={bound.stop}/>}
   {['recording','ready','playing'].includes(draft.phase)&&view.sendAvailable&&<AudioButton label="Enviar áudio" caption="Enviar" icon="send" primary disabled={playing} onPress={send}/>}
  </View>
 </View>;
}
const s=StyleSheet.create({expanded:{flex:1,minHeight:0},textRow:{flexDirection:'row',alignItems:'flex-end',gap:8},panel:{gap:10,paddingVertical:4},heading:{flexDirection:'row',alignItems:'center',gap:8},dot:{width:9,height:9,borderRadius:5,backgroundColor:'#B14338'},title:{fontSize:15,lineHeight:23,fontWeight:'600',color:'#18372C',flex:1},duration:{fontSize:14,lineHeight:22,color:'#52675A',fontVariant:['tabular-nums']},notice:{fontSize:14,lineHeight:22,color:'#52675A',paddingTop:4},playRow:{flexDirection:'row',alignItems:'center',gap:12},actions:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',justifyContent:'space-between',gap:6}});