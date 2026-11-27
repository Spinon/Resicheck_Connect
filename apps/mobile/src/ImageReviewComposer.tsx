import{ImageTransferProgress,ImageUploadRetry}from'./ImageTransferProgress.tsx';
import React,{useState,useSyncExternalStore}from'react';
import{ActivityIndicator,Keyboard,StyleSheet,Text,View}from'react-native';
import{imageSendPresentation}from'./image-send-presentation.ts';
import type{ImageCancelResult}from'./scoped-reviewed-image.ts';
import{AudioButton}from'./AudioControls.tsx';
import{LocalImagePreviewView}from'./LocalImagePreviewView.tsx';
import{MediaPrivacySurface}from'./MediaPrivacy.tsx';
import type{createImageReview}from'./image-review.ts';
type Sender={snapshot:()=>Readonly<{phase:string;messageId:string|null;canCancel?:boolean;confirmationStarted?:boolean}>;subscribe:(f:()=>void)=>()=>void;start:()=>Promise<unknown>;recover:()=>Promise<unknown>;cancel?:()=>ImageCancelResult};
const off=Object.freeze({phase:'off',messageId:null}),none=()=>()=>{};
/** Inline local image bubble. It never publishes, retries or claims cancellation
 * from presentation alone. The captured sender owns the stable attempt. */
export function ImageReviewComposer({review,sender,disabled=false,pick,renderText}:{review:ReturnType<typeof createImageReview>;sender?:Sender;disabled?:boolean;pick?:()=>Promise<boolean>;renderText:(attachment:React.ReactNode)=>React.ReactNode}){
 const [cancelNotice,setCancelNotice]=useState(false);
 const v=useSyncExternalStore(review.subscribe,review.snapshot,review.snapshot),delivery=useSyncExternalStore(sender?.subscribe??none,sender?.snapshot??(()=>off),sender?.snapshot??(()=>off)),presentation=imageSendPresentation(delivery.phase,delivery.confirmationStarted===true);
 if(v.phase==='closed')return null;
 const attach=<AudioButton icon="image" label="Anexar imagem" iconOnly disabled={disabled||v.phase!=='idle'} onPress={()=>{if(disabled)return;Keyboard.dismiss();return pick?pick():review.select();}}/>;
 if(v.phase==='idle')return <>{renderText(attach)}{v.notice==='unavailable'&&<Text accessibilityRole="alert" style={s.error}>Não foi possível preparar a imagem.</Text>}</>;
 const preparing=['selecting','preparing'].includes(v.phase)||v.phase==='reading'&&!presentation.terminal,busy=preparing||presentation.sending,sendAllowed=!!sender&&delivery.phase==='review'&&v.canRead&&v.preview?.mime!=='application/pdf'&&(v.preview?.bytes??Infinity)<=4194304;
 const canPrepare=!busy&&(['off','review'].includes(delivery.phase)||presentation.canRestartReview)&&v.phase!=='reading';
 const retryUpload=!!sender&&!busy&&!delivery.confirmationStarted&&
  ['inspection-paused','upload-unknown','inspection-unknown'].includes(delivery.phase);
 const status=preparing?'Preparando…':delivery.phase==='uploading'?'Enviando…':delivery.phase==='waiting'?'Verificando…':delivery.phase==='checking'?'Conferindo…':delivery.phase==='sending'?'Confirmando…':delivery.phase==='inspection-paused'?'Envio pausado':delivery.phase==='uncertain'?'Confirmação pendente':delivery.phase==='upload-unknown'?'Transferência não confirmada':delivery.phase==='inspection-unknown'||delivery.phase==='delayed'?'Verificação pendente':delivery.phase==='cancelled'?'Cancelado':delivery.phase==='failed'||delivery.phase==='rejected'?'Não enviado':null;
 const cancel=()=>{setCancelNotice(false);if(preparing&&review.cancelPreparation()){return;}if(sender?.cancel&&delivery.canCancel){if(sender.cancel()==='confirmation-required')setCancelNotice(true);return;}if(!busy&&delivery.confirmationStarted!==true)review.discard();};
 const canCancel=preparing||delivery.canCancel===true||!busy&&delivery.confirmationStarted!==true;
 return <><MediaPrivacySurface><View style={s.row}><View testID="image-composer-active" style={s.bubble}>
  <View style={{minHeight:200}}>{v.preview&&<LocalImagePreviewView preview={v.preview} compact label="Ampliar imagem antes de enviar" thumbnailMaxHeight={200}/>}
  {busy&&<ImageTransferProgress label={status??'Preparando imagem'}/>}
  {retryUpload&&<ImageUploadRetry onPress={()=>sender?.recover()}/>}
  </View>{canCancel&&<View style={s.cancel}><AudioButton icon="stop" label={preparing?'Cancelar preparação da imagem':'Cancelar imagem'} iconOnly onPress={cancel}/></View>}
  {status&&<Text style={s.caption} accessibilityLiveRegion="polite">{status}</Text>}
  {cancelNotice&&<Text accessibilityRole="alert" style={s.error}>Confirmação em andamento. Use Conferir.</Text>}
  {v.notice==='original-confirmation-required'&&<Text style={s.caption}>A versão leve não ficou adequada.</Text>}
  {v.notice==='unavailable'&&<Text accessibilityRole="alert" style={s.error}>Não foi possível preparar.</Text>}
  {(v.preview?.bytes??0)>4194304&&<Text accessibilityRole="alert" style={s.error}>Limite de 4 MB.</Text>}
  {v.preview?.flattenedTransparency&&<Text style={s.caption}>Fundo branco aplicado.</Text>}
  {v.originalReason&&canPrepare&&v.preview?.mode!=='original'&&<AudioButton icon="file" label="Preservar detalhes do original" caption="Preservar detalhes" onPress={()=>review.prepare('original')}/>}
  {v.notice==='original-confirmation-required'&&canPrepare&&<><Text style={s.caption}>O original pode conter localização.</Text><AudioButton icon="file" label="Usar arquivo original" caption="Usar original" onPress={()=>review.prepare('original')}/></>}
  <View style={s.footer}>{v.preview&&<Text style={s.size}>{v.preview.mode==='original'?'Original · ':''}{Math.ceil(v.preview.bytes/1024)} KB</Text>}
   {!retryUpload&&(presentation.canCheck?<AudioButton icon="refresh" label="Conferir envio da imagem" caption="Conferir" disabled={delivery.phase==='checking'} onPress={()=>sender?.recover()}/>:presentation.canRestartReview?<AudioButton icon="refresh" label="Revisar imagem preservada" iconOnly onPress={()=>review.prepare('optimized')}/>:<AudioButton icon="send" label="Enviar imagem" primary iconOnly disabled={!sendAllowed||busy} onPress={()=>sender?.start()}/>)}
  </View>
 </View></View></MediaPrivacySurface>{renderText(attach)}</>;
}
const s=StyleSheet.create({row:{alignItems:'flex-end',paddingHorizontal:10,paddingTop:8},bubble:{maxWidth:310,width:'100%',padding:5,gap:5,borderRadius:16,backgroundColor:'#DDF0E2',borderBottomRightRadius:4},cancel:{position:'absolute',top:8,right:8},progress:{position:'absolute',top:70,alignSelf:'center',padding:12,borderRadius:30,backgroundColor:'rgba(255,255,255,.9)'},caption:{fontSize:12,color:'#52675A',paddingHorizontal:6},error:{fontSize:12,color:'#94392E',paddingHorizontal:6},size:{fontSize:11,color:'#52675A',flex:1},footer:{flexDirection:'row',alignItems:'center',gap:8,paddingLeft:6}});
