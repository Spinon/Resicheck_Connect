import React,{useEffect,useState,useSyncExternalStore}from'react';
import{ActivityIndicator,Pressable,StyleSheet,Text,View}from'react-native';
import{MediaPrivacySurface}from'./MediaPrivacy.tsx';
import{ConnectIcon}from'./ConnectIcon.tsx';
import{LocalImagePreviewView}from'./LocalImagePreviewView.tsx';
import type{ConversationImageRead}from'./conversation-image-read.ts';
export type ImageMessageFactory=(messageId:string)=>ConversationImageRead;
export function PrivateImageMessage({messageId,factory,onSelect}:{messageId:string;factory:ImageMessageFactory;onSelect?:()=>void}){
 const[owner,setOwner]=useState<Readonly<{id:string;factory:ImageMessageFactory;reader:ConversationImageRead}>|null>(null);
 useEffect(()=>{let reader:ConversationImageRead;try{reader=factory(messageId);}catch{return;}setOwner({id:messageId,factory,reader});return()=>reader.close();},[messageId,factory]);
 return owner?.id===messageId&&owner.factory===factory?<MediaPrivacySurface><ImageBody reader={owner.reader} onSelect={onSelect}/></MediaPrivacySurface>:<Text>Imagem indisponível</Text>;
}
function ImageBody({reader,onSelect}:{reader:ConversationImageRead;onSelect?:()=>void}){
 const v=useSyncExternalStore(reader.subscribe,reader.snapshot,reader.snapshot),selection=onSelect?{accessibilityActions:[{name:'select',label:'Selecionar mensagem de imagem'}],onAccessibilityAction:(e:{nativeEvent:{actionName:string}})=>{if(e.nativeEvent.actionName==='select')onSelect();}}:{};
 if(v.phase==='closed')return <Text {...selection}>Imagem indisponível</Text>;
 if(v.phase==='loading')return <View accessible accessibilityRole="progressbar" accessibilityLabel="Carregando imagem" accessibilityState={{busy:true}} {...selection}><ActivityIndicator color="#185C45" accessible={false}/></View>;
 if(v.phase==='ready'&&v.preview)return <LocalImagePreviewView preview={v.preview} published label="Ampliar imagem recebida" thumbnailMaxHeight={220} onSelect={onSelect}/>;
 const label=v.phase==='failed'?'Tentar imagem novamente':'Abrir imagem';
 return <View>{v.phase==='failed'&&<Text accessibilityRole="alert">Não foi possível carregar a imagem. Tente novamente.</Text>}<Pressable accessibilityRole="button" accessibilityLabel={label} onPress={()=>{try{void Promise.resolve(reader.load()).catch(()=>{});}catch{}}} delayLongPress={onSelect?350:undefined} onLongPress={onSelect} {...selection} style={s.open}><ConnectIcon name="image" color="#185C45" size={22}/><Text style={s.label}>{label}</Text></Pressable></View>;
}
const s=StyleSheet.create({open:{minHeight:48,padding:12,borderRadius:12,backgroundColor:'#E5F1E9',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8},label:{fontSize:16,lineHeight:22,color:'#185C45',fontWeight:'700'}});
