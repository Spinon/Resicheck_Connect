import{MediaWindow}from'./MediaWindow.tsx';
import React,{useEffect,useState,useSyncExternalStore}from'react';
import{imageSendPresentation}from'./image-send-presentation.ts';
import type{ImageCancelResult}from'./scoped-reviewed-image.ts';
import{ActivityIndicator,Keyboard,ScrollView,StyleSheet,Text,View,useWindowDimensions}from'react-native';
import{AudioButton}from'./AudioControls.tsx';
import{LocalImagePreviewView}from'./LocalImagePreviewView.tsx';
import{MediaPrivacySurface}from'./MediaPrivacy.tsx';
import type{createImageReview}from'./image-review.ts';
type Sender={snapshot:()=>Readonly<{phase:string;messageId:string|null;canCancel?:boolean;confirmationStarted?:boolean}>;subscribe:(f:()=>void)=>()=>void;start:()=>Promise<unknown>;recover:()=>Promise<unknown>;cancel?:()=>ImageCancelResult};
const off=Object.freeze({phase:'off',messageId:null}),none=()=>()=>{};
/** Candidate shared composer. The caller owns real scope/lifecycle and mounts
 * it only after image transport is available; does not grant file/network access. */
export function ImageReviewComposer({review,sender,disabled=false,pick,renderText}:{review:ReturnType<typeof createImageReview>;sender?:Sender;disabled?:boolean;pick?:()=>Promise<boolean>;renderText:(attachment:React.ReactNode)=>React.ReactNode}){
 const window=useWindowDimensions();const[minimized,setMinimized]=useState(false),[cancelNotice,setCancelNotice]=useState(false);
 const v=useSyncExternalStore(review.subscribe,review.snapshot,review.snapshot),delivery=useSyncExternalStore(sender?.subscribe??none,sender?.snapshot??(()=>off),sender?.snapshot??(()=>off));
 const presentation=imageSendPresentation(delivery.phase,delivery.confirmationStarted===true);
 useEffect(()=>{setMinimized(false);setCancelNotice(false);},[v.preview]);
 if(v.phase==='closed')return null;
 if(v.phase==='idle')return <>{renderText(<AudioButton icon="image" label="Anexar imagem" iconOnly disabled={disabled} onPress={()=>{if(disabled)return;Keyboard.dismiss();return pick?pick():review.select();}}/>)}{v.notice==='unavailable'&&<Text accessibilityRole="alert" style={s.caption}>Não foi possível preparar a imagem. Escolha outro arquivo e tente novamente.</Text>}</>;
 const preparing=['selecting','preparing'].includes(v.phase)||v.phase==='reading'&&!presentation.terminal,sending=presentation.sending,busy=preparing||sending,sendAllowed=!!sender&&delivery.phase==='review'&&v.canRead&&v.preview?.mime!=='application/pdf'&&(v.preview?.bytes??Infinity)<=4194304;
 const canPrepare=!busy&&(['off','review'].includes(delivery.phase)||presentation.canRestartReview)&&v.phase!=='reading';
 if(minimized)return <>{renderText(<AudioButton icon="image" label={delivery.phase==='cancelled'?'Revisar imagem preservada':'Reabrir envio de imagem'} onPress={()=>setMinimized(false)}/>)}{presentation.status&&<Text accessibilityLiveRegion="polite" style={s.caption}>{presentation.status}</Text>}</>;
 return <MediaWindow visible onClose={()=>setMinimized(true)}><View style={s.backdrop}><View style={s.sheet}><MediaPrivacySurface enabled><ScrollView style={{maxHeight:Math.max(120,window.height*.52)}} contentContainerStyle={s.panel} testID="image-composer-active" keyboardShouldPersistTaps="handled">
  {busy?<View accessible accessibilityRole="progressbar" accessibilityLabel={sending?presentation.status??'Conferindo imagem':'Preparando imagem'} accessibilityState={{busy:true}} style={s.loading}><ActivityIndicator color="#185C45" accessible={false}/></View>:<Text style={s.heading}>{delivery.phase==='sent'?'Imagem enviada':delivery.phase==='cancelled'?'Envio cancelado':'Revisar imagem'}</Text>}
  {presentation.status&&!busy&&<Text accessibilityRole="alert" style={s.caption}>{presentation.status}</Text>}
  {cancelNotice&&<Text accessibilityRole="alert" style={s.caption}>A confirmação já começou. Não é possível garantir o cancelamento; confira o resultado.</Text>}
  {v.source&&<Text style={s.name} numberOfLines={2}>{v.preview?.name??v.source.name}</Text>}
  {v.preview&&<><LocalImagePreviewView preview={v.preview} label="Ampliar imagem antes de enviar" thumbnailMaxHeight={180}/><Text style={s.caption}>{v.preview.mode==='original'?'Arquivo original':'Imagem compactada'} · {Math.ceil(v.preview.bytes/1024)} KB</Text></>}
  {v.notice==='original-confirmation-required'&&<Text accessibilityRole="alert" style={s.caption}>A compactação não diminuiu o arquivo. Escolha Arquivo original para continuar.</Text>}
  {v.notice==='unavailable'&&<Text accessibilityRole="alert" style={s.caption}>Não foi possível preparar a imagem. Tente novamente ou escolha outro arquivo.</Text>}
  {v.preview?.mode==='original'&&<Text style={s.caption}>O original mantém seus metadados, que podem incluir localização.</Text>}
  {v.preview?.mime==='application/pdf'?<Text style={s.caption}>O envio de PDF ainda não está disponível. Seu arquivo não foi alterado.</Text>:(v.preview?.bytes??0)>4194304?<Text accessibilityRole="alert" style={s.caption}>O envio aceita até 4 MB. Compacte a imagem ou escolha um arquivo menor.</Text>:null}
  {!sender&&<Text style={s.caption}>O envio de imagens está indisponível. Você pode revisar ou descartar esta seleção.</Text>}
  {v.source?.mime==='image/png'&&<Text style={s.caption}>Compactada converte PNG em JPEG. Para manter transparência e detalhes sem perdas, escolha Arquivo original.</Text>}
  {v.preview?.mode==='optimized'&&v.preview.flattenedTransparency&&<Text accessibilityRole="alert" style={s.caption}>A transparência foi substituída por fundo branco no JPEG. Você pode voltar a Arquivo original.</Text>}
  <View style={s.actions}><AudioButton icon="image" label="Compactar imagem" disabled={!canPrepare||!v.source||v.source.mime==='application/pdf'} onPress={()=>review.prepare('optimized')}/><AudioButton icon="file" label="Arquivo original" disabled={!canPrepare||!v.source} onPress={()=>review.prepare('original')}/></View>
  </ScrollView><View style={[s.actions,s.footer]}>
   {['selecting','preparing'].includes(v.phase)&&<AudioButton icon="stop" label="Cancelar preparação da imagem" onPress={()=>{if(review.cancelPreparation?.())setMinimized(true);}}/>}
   {sender?.cancel&&delivery.canCancel===true&&<AudioButton icon="stop" label="Cancelar envio da imagem" destructive onPress={()=>{const result=sender.cancel!();if(result==='cancelled-before-send'){setCancelNotice(false);setMinimized(true);}else if(result==='confirmation-required')setCancelNotice(true);}}/>}
   <AudioButton icon="back" label="Voltar à conversa" onPress={()=>setMinimized(true)}/>
   <AudioButton icon="trash" label="Descartar imagem" destructive disabled={busy||v.phase==='reading'||delivery.confirmationStarted===true&&!['sent'].includes(delivery.phase)||!['off','review','failed','rejected','blocked','cancelled','sent'].includes(delivery.phase)} onPress={()=>{review.discard();}}/>
   {presentation.canCheck&&<AudioButton icon="refresh" label={presentation.checkLabel} disabled={delivery.phase==='checking'} onPress={()=>sender?.recover()}/>}
   <AudioButton icon="send" label="Enviar imagem" primary disabled={!sendAllowed||busy} onPress={()=>sender?.start()}/>
  </View>
 </MediaPrivacySurface></View></View></MediaWindow>;
}
const s=StyleSheet.create({backdrop:{flex:1,justifyContent:'center',padding:16,backgroundColor:'rgba(10,30,20,.35)'},sheet:{width:'100%',maxWidth:560,alignSelf:'center',padding:16,borderRadius:18,backgroundColor:'white'},panel:{gap:10,paddingVertical:8},heading:{fontSize:16,fontWeight:'600',color:'#18372C'},name:{fontSize:14,color:'#18372C'},caption:{fontSize:13,lineHeight:20,color:'#52675A'},loading:{minHeight:48,alignItems:'center',justifyContent:'center'},footer:{paddingTop:12},actions:{flexDirection:'row',flexWrap:'wrap',gap:8,justifyContent:'space-between'}});
