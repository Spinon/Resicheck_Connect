import{MediaWindow}from'./MediaWindow.tsx';
import React,{useSyncExternalStore}from'react';
import{ActivityIndicator,Keyboard,ScrollView,StyleSheet,Text,View,useWindowDimensions}from'react-native';
import{AudioButton}from'./AudioControls.tsx';
import{LocalImagePreviewView}from'./LocalImagePreviewView.tsx';
import{MediaPrivacySurface}from'./MediaPrivacy.tsx';
import type{createImageReview}from'./image-review.ts';
type Sender={snapshot:()=>Readonly<{phase:string;messageId:string|null}>;subscribe:(f:()=>void)=>()=>void;start:()=>Promise<unknown>;recover:()=>Promise<unknown>};
const off=Object.freeze({phase:'off',messageId:null}),none=()=>()=>{};
/** Candidate shared composer. The caller owns real scope/lifecycle and mounts
 * it only after image transport is available; does not grant file/network access. */
export function ImageReviewComposer({review,sender,disabled=false,pick,renderText}:{review:ReturnType<typeof createImageReview>;sender?:Sender;disabled?:boolean;pick?:()=>Promise<boolean>;renderText:(attachment:React.ReactNode)=>React.ReactNode}){
 const window=useWindowDimensions();
 const v=useSyncExternalStore(review.subscribe,review.snapshot,review.snapshot),delivery=useSyncExternalStore(sender?.subscribe??none,sender?.snapshot??(()=>off),sender?.snapshot??(()=>off));
 if(v.phase==='closed')return null;
 if(v.phase==='idle')return <>{renderText(<AudioButton icon="image" label="Anexar imagem" iconOnly disabled={disabled} onPress={()=>{if(disabled)return;Keyboard.dismiss();return pick?pick():review.select();}}/>)}{v.notice==='unavailable'&&<Text accessibilityRole="alert" style={s.caption}>Não foi possível preparar a imagem. Escolha outro arquivo e tente novamente.</Text>}</>;
 const preparing=['selecting','preparing','reading'].includes(v.phase),sending=['reading','uploading','waiting','sending','checking'].includes(delivery.phase),busy=preparing||sending,sendAllowed=!!sender&&delivery.phase==='review'&&v.canRead&&v.preview?.mime!=='application/pdf'&&(v.preview?.bytes??Infinity)<=4194304;
 const check=['uncertain','upload-unknown','waiting'].includes(delivery.phase);
 return <MediaWindow visible onClose={()=>{if(!busy&&['off','review','failed','rejected','blocked','sent'].includes(delivery.phase))review.discard();}}><View style={s.backdrop}><View style={s.sheet}><MediaPrivacySurface enabled><ScrollView style={{maxHeight:Math.max(180,window.height*.68)}} contentContainerStyle={s.panel} testID="image-composer-active" keyboardShouldPersistTaps="handled">
  {busy?<View accessible accessibilityRole="progressbar" accessibilityLabel={sending?'Enviando imagem':'Preparando imagem'} accessibilityState={{busy:true}} style={s.loading}><ActivityIndicator color="#185C45" accessible={false}/></View>:<Text style={s.heading}>{delivery.phase==='sent'?'Imagem enviada':'Revisar imagem'}</Text>}
  {v.source&&<Text style={s.name} numberOfLines={2}>{v.source.name}</Text>}
  {v.preview&&<><LocalImagePreviewView preview={v.preview} label="Ampliar imagem antes de enviar" thumbnailMaxHeight={180}/><Text style={s.caption}>{v.preview.mode==='original'?'Arquivo original':'Imagem compactada'} · {Math.ceil(v.preview.bytes/1024)} KB</Text></>}
  {v.notice==='original-confirmation-required'&&<Text accessibilityRole="alert" style={s.caption}>A compactação não diminuiu o arquivo. Escolha Arquivo original para continuar.</Text>}
  {v.notice==='unavailable'&&<Text accessibilityRole="alert" style={s.caption}>Não foi possível preparar a imagem. Tente novamente ou escolha outro arquivo.</Text>}
  {v.preview?.mode==='original'&&<Text style={s.caption}>O original mantém seus metadados, que podem incluir localização.</Text>}
  {v.preview?.mime==='application/pdf'?<Text style={s.caption}>O envio de PDF ainda não está disponível. Seu arquivo não foi alterado.</Text>:(v.preview?.bytes??0)>4194304?<Text accessibilityRole="alert" style={s.caption}>O envio aceita até 4 MB. Compacte a imagem ou escolha um arquivo menor.</Text>:null}
  {!sender&&<Text style={s.caption}>O envio de imagens está indisponível. Você pode revisar ou descartar esta seleção.</Text>}
  {['failed','rejected','blocked'].includes(delivery.phase)&&<Text accessibilityRole="alert" style={s.caption}>Não foi possível enviar esta imagem. A seleção foi preservada.</Text>}
  {['uncertain','upload-unknown'].includes(delivery.phase)&&<Text accessibilityRole="alert" style={s.caption}>Ainda não foi possível confirmar o envio. Confira antes de tentar novamente.</Text>}
  <View style={s.actions}><AudioButton icon="image" label="Compactar imagem" disabled={busy||delivery.phase!=='off'&&delivery.phase!=='review'||!v.source||v.source.mime==='application/pdf'} onPress={()=>review.prepare('optimized')}/><AudioButton icon="file" label="Arquivo original" disabled={busy||delivery.phase!=='off'&&delivery.phase!=='review'||!v.source} onPress={()=>review.prepare('original')}/></View>
  <View style={s.actions}><AudioButton icon="trash" label="Descartar imagem" destructive disabled={busy||!['off','review','failed','rejected','blocked','sent'].includes(delivery.phase)} onPress={()=>{review.discard();}}/>{check&&<AudioButton icon="refresh" label="Conferir envio da imagem" disabled={delivery.phase==='checking'} onPress={()=>sender?.recover()}/>}<AudioButton icon="send" label="Enviar imagem" primary disabled={!sendAllowed||busy} onPress={()=>sender?.start()}/></View>
 </ScrollView></MediaPrivacySurface></View></View></MediaWindow>;
}
const s=StyleSheet.create({backdrop:{flex:1,justifyContent:'center',padding:16,backgroundColor:'rgba(10,30,20,.35)'},sheet:{width:'100%',maxWidth:560,alignSelf:'center',padding:16,borderRadius:18,backgroundColor:'white'},panel:{gap:10,paddingVertical:8},heading:{fontSize:16,fontWeight:'600',color:'#18372C'},name:{fontSize:14,color:'#18372C'},caption:{fontSize:13,lineHeight:20,color:'#52675A'},loading:{minHeight:48,alignItems:'center',justifyContent:'center'},actions:{flexDirection:'row',flexWrap:'wrap',gap:8,justifyContent:'space-between'}});
