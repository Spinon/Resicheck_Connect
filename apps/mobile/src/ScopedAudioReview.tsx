import React,{useEffect,useSyncExternalStore}from'react';
import{View,Text,StyleSheet}from'react-native';
import type{createScopedReviewedAudio}from'./scoped-reviewed-audio.ts';
import{AudioButton,AudioBusy,audioTime}from'./AudioControls.tsx';
import{ConnectIcon}from'./ConnectIcon.tsx';
type Controller=ReturnType<typeof createScopedReviewedAudio>;
/** The caller owns the recording; uncertain work can only be checked, never replaced. */
export function ScopedAudioReview({controller,onDiscard,onPreview,onRecordAgain,preserveOwnerOnUnmount=false,durationMs=0}:{controller:Controller;onDiscard:()=>void;onPreview?:()=>Promise<unknown>;onRecordAgain?:()=>Promise<unknown>;preserveOwnerOnUnmount?:boolean;durationMs?:number}){
 const view=useSyncExternalStore(controller.subscribe,controller.snapshot,controller.snapshot);
 useEffect(()=>()=>{if(!preserveOwnerOnUnmount)controller.close();},[controller,preserveOwnerOnUnmount]);
 if(view.phase==='off'||view.phase==='closed')return null;
 const busy=['reading','uploading','checking','sending','waiting'].includes(view.phase),recoverable=['blocked','rejected','failed'].includes(view.phase);
 const text=view.phase==='review'?'Áudio pronto para enviar':['reading','uploading','sending'].includes(view.phase)?'Enviando áudio…':view.phase==='waiting'?'Preparando seu áudio…':view.phase==='sent'?'Áudio enviado':view.phase==='checking'?'Verificando o envio…':['upload-unknown','uncertain'].includes(view.phase)?'Ainda não confirmamos o envio.':view.phase==='needs-upload'?'Seu áudio está pronto para continuar o envio.':view.phase==='blocked'?'Não foi possível preparar o áudio. Sua gravação foi mantida.':view.phase==='rejected'?'Este áudio não pôde ser enviado. Sua gravação foi mantida.':'Não foi possível abrir a gravação. Tente ouvir ou gravar novamente.';
 const action=view.phase==='review'?{label:'Enviar áudio',caption:'Enviar',icon:'send' as const,run:controller.start}:view.phase==='needs-upload'?{label:'Retomar envio',caption:'Continuar envio',icon:'send' as const,run:controller.resumeUpload}:['waiting','upload-unknown','uncertain'].includes(view.phase)?{label:'Verificar envio',caption:'Verificar envio',icon:'refresh' as const,run:controller.recover}:null;
 return <View testID="audio-send-review" style={s.panel} accessibilityState={{busy}}><View style={s.heading}><ConnectIcon name={view.phase==='sent'?'check':'mic'} color="#185C45"/><Text style={s.title}>Seu áudio{durationMs>0?' · '+audioTime(durationMs):''}</Text></View>
  {busy?<AudioBusy label={text}/>:<Text accessibilityLiveRegion="polite" style={s.notice}>{text}</Text>}
  {['upload-unknown','uncertain'].includes(view.phase)&&<Text style={s.notice}>Verifique antes de tentar de novo para evitar enviar duas vezes.</Text>}
  <View style={s.actions}>
   {recoverable&&onPreview&&<AudioButton label="Ouvir gravação" caption="Ouvir" icon="play" onPress={onPreview}/>}
   {recoverable&&onRecordAgain&&<AudioButton label="Gravar novamente" icon="mic" onPress={onRecordAgain}/>}
   {['review','needs-upload','blocked','rejected','failed'].includes(view.phase)&&<AudioButton label="Descartar gravação" caption="Descartar" icon="trash" destructive onPress={()=>{controller.close();onDiscard();}}/>}
   {action&&<AudioButton label={action.label} caption={action.caption} icon={action.icon} primary onPress={action.run}/>}
  </View>
 </View>;
}
const s=StyleSheet.create({panel:{gap:8,paddingVertical:6},heading:{flexDirection:'row',alignItems:'center',gap:9},title:{fontSize:15,lineHeight:23,fontWeight:'600',color:'#18372C'},notice:{fontSize:14,lineHeight:22,color:'#52675A'},actions:{flexDirection:'row',flexWrap:'wrap',gap:8,justifyContent:'flex-end'}});