import{ImageTransferProgress}from'./ImageTransferProgress.tsx';
import React,{useEffect,useState,useSyncExternalStore}from'react';
import{Pressable,StyleSheet,Text,View,useWindowDimensions}from'react-native';
import{MediaPrivacySurface}from'./MediaPrivacy.tsx';
import{ConnectIcon}from'./ConnectIcon.tsx';
import{LocalImagePreviewView}from'./LocalImagePreviewView.tsx';
import type{ConversationImageRead}from'./conversation-image-read.ts';
export type ImageMessageFactory=((messageId:string)=>ConversationImageRead)&Readonly<{known?:(id:string)=>boolean;available?:(id:string)=>boolean;subscribe?:(f:()=>void)=>()=>void}>;
const none=()=>()=>{};
export function PrivateImageMessage({messageId,factory,onSelect,visible=false}:{messageId:string;factory:ImageMessageFactory;onSelect?:()=>void;visible?:boolean}){
 const thumbnailWidth=Math.min(260,Math.max(100,useWindowDimensions().width-88));const available=useSyncExternalStore(factory.subscribe??none,()=>factory.available?.(messageId)??true,()=>false);
 const[requested,setRequested]=useState(false),[owner,setOwner]=useState<Readonly<{id:string;factory:ImageMessageFactory;reader:ConversationImageRead}>|null>(null);
 useEffect(()=>{if(!visible)setRequested(false);},[visible,messageId,factory]);
 useEffect(()=>{if(!available||!visible&&!requested){setOwner(null);return;}let reader:ConversationImageRead;try{reader=factory(messageId);}catch{setOwner(null);return;}setOwner({id:messageId,factory,reader});return()=>reader.close();},[messageId,factory,available,visible,requested]);
 if(!available)return <View style={[s.open,{width:thumbnailWidth}]} accessible accessibilityLabel="Imagem indisponível"><ConnectIcon name="image" color="#718078" size={32}/></View>;
 const warm=factory.known?.(messageId)===true;
 return owner?.id===messageId&&owner.factory===factory?<MediaPrivacySurface><ImageBody warm={warm} reader={owner.reader} onSelect={onSelect}/></MediaPrivacySurface>:<Pressable accessibilityRole="button" accessibilityLabel="Carregar miniatura da imagem" onPress={()=>setRequested(true)} style={warm?{width:thumbnailWidth,height:220}:[s.open,{width:thumbnailWidth}]}>{!warm&&<ConnectIcon name="image" color="#185C45" size={32}/>}</Pressable>;
}
function ImageBody({reader,onSelect,warm}:{warm:boolean;reader:ConversationImageRead;onSelect?:()=>void}){
 const thumbnailWidth=Math.min(260,Math.max(100,useWindowDimensions().width-88));const v=useSyncExternalStore(reader.subscribe,reader.snapshot,reader.snapshot);
 useEffect(()=>{if(v.phase==='idle')void reader.load().catch(()=>{});},[reader,v.phase]);
 const selection=onSelect?{accessibilityActions:[{name:'select',label:'Selecionar mensagem de imagem'}],onAccessibilityAction:(e:{nativeEvent:{actionName:string}})=>{if(e.nativeEvent.actionName==='select')onSelect();}}:{};
 if(v.phase==='closed')return <Text {...selection}>Imagem indisponível</Text>;
 if(warm&&(v.phase==='idle'||v.phase==='loading'&&(!v.progress||v.progress.phase==='verification')))return <View style={{width:thumbnailWidth,height:220}}/>;
 if(v.phase==='loading')return <View style={[s.open,{width:thumbnailWidth}]} {...selection}><ConnectIcon name="image" color="#185C45" size={32}/><ImageTransferProgress label={v.progress?.phase==='verification'?'Verificando imagem':'Baixando imagem'} progress={v.progress}/></View>;
 if(v.phase==='ready'&&v.preview)return <LocalImagePreviewView viewerUri={reader.viewerUri} onUnavailable={()=>reader.displayFailed()} preview={v.preview} published compact label="Abrir imagem" thumbnailMaxHeight={220} onSelect={onSelect}/>;
 const label=v.phase==='failed'?'Tentar carregar imagem':'Carregar imagem';
 return <View>{v.phase==='failed'&&<Text accessibilityRole="alert">Não foi possível carregar.</Text>}<Pressable accessibilityRole="button" accessibilityLabel={label} onPress={()=>{try{void Promise.resolve(reader.load()).catch(()=>{});}catch{}}} delayLongPress={onSelect?350:undefined} onLongPress={onSelect} {...selection} style={[s.open,{width:thumbnailWidth}]}><ConnectIcon name="image" color="#185C45" size={22}/><Text style={s.label}>{label}</Text></Pressable></View>;
}
const s=StyleSheet.create({open:{height:220,width:260,maxWidth:'100%',minHeight:48,padding:12,borderRadius:12,backgroundColor:'#E5F1E9',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8},label:{fontSize:16,lineHeight:22,color:'#185C45',fontWeight:'700'}});
