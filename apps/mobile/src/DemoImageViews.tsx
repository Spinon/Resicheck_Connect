import {MediaPrivacySurface,useMediaPrivacy} from "./MediaPrivacy.tsx";
import React,{useEffect,useSyncExternalStore} from 'react';
import {StyleSheet,Text,View} from 'react-native';
import type {createDemoImageSession} from './demo-image-session.ts';
import {ImageAction,LocalImagePreviewView} from './LocalImagePreviewView.tsx';
type Host=ReturnType<typeof createDemoImageSession>;
function CleanupRecovery({host}:{host:Host}){const actions=host.bind();return <View style={s.review}><Text>A recuperação descarta todas as imagens locais desta conversa. Os arquivos de origem no aparelho permanecem.</Text><ImageAction label="Limpar todas as cópias locais e tentar novamente" onPress={()=>{void actions.retryCleanup();}}/></View>;}

function SetupRecovery({host}:{host:Host}){const actions=host.bind();return <View style={s.review}><Text accessibilityRole="alert">Não foi possível iniciar imagens nesta conversa. Seu texto foi mantido.</Text><ImageAction label="Tentar iniciar imagens novamente" onPress={()=>{void actions.retrySetup();}}/></View>;}

export function DemoImageComposer({host,close,fixtures=false,pickExternal,preserveDraftOnUnmount=false}:{host:Host;close:()=>void;fixtures?:boolean;pickExternal?:()=>Promise<boolean>;preserveDraftOnUnmount?:boolean}){
 const view=useSyncExternalStore(host.subscribe,host.snapshot,host.snapshot),actions=host.bind();
 // A recovered adapter is a new context even inside the same conversation.
 useEffect(()=>()=>{if(!preserveDraftOnUnmount)void actions.discard();},[host,view.contextId,preserveDraftOnUnmount]);
 const privacy=useMediaPrivacy();
 const select=(operation:()=>Promise<boolean>)=>privacy.presentation?privacy.presentation.select(async()=>{
  const ok=await operation();return ok?'selected':host.snapshot().notice===null?'cancelled':'failed';
 }):operation();
 const available=['idle','ready'].includes(view.phase);
 return <MediaPrivacySurface><View style={s.panel}><Text>Imagem local de teste. Use somente arquivos fictícios. Nenhum anexo será enviado à empresa.</Text><Text accessibilityLiveRegion="polite">{view.phase==='picking'?'Escolhendo arquivo local':view.phase==='preparing'?'Preparando imagem local':view.phase==='saving'?'Guardando cópia local':view.phase==='clearing'?'Limpando cópias anteriores':view.phase==='blocked'?'Limpeza local pendente':view.phase==='unavailable'?'Imagens indisponíveis':view.source?'Seleção local pronta':'Escolha uma imagem fictícia'}</Text>
 <ImageAction label="Selecionar arquivo fictício do aparelho" disabled={!available} onPress={()=>{void (pickExternal?pickExternal():select(actions.pick));}}/>
 {fixtures&&<><ImageAction label="Selecionar guia JPEG de teste" disabled={!available} onPress={()=>{void select(()=>actions.pickFixture('jpeg'));}}/><ImageAction label="Selecionar guia com sombra de teste" disabled={!available} onPress={()=>{void select(()=>actions.pickFixture('shadow'));}}/><ImageAction label="Selecionar guia ruim de teste" disabled={!available} onPress={()=>{void select(()=>actions.pickFixture('low'));}}/></>}
 <ImageAction label="Compactar imagem para este chat local" disabled={!available||!view.source||view.source.mime==='application/pdf'} onPress={()=>{void actions.prepare('optimized');}}/>
 <ImageAction label="Manter documento original neste chat" disabled={!available||!view.source} onPress={()=>{void actions.prepare('original');}}/>
 {view.source&&<><Text accessibilityLabel={'Arquivo selecionado: '+view.source.name} numberOfLines={3}>{view.source.name}</Text><Text>Fonte local: {view.source.bytes} bytes</Text></>}
 {view.preview&&<View style={s.review}><Text>{view.preview.mode==='original'?'Original sem regravar':'Cópia otimizada'} · {view.preview.bytes} bytes{view.preview.width?` · ${view.preview.width} × ${view.preview.height}`:''}</Text>{view.preview.retainedOriginal==='not-smaller'&&<Text>A conversão não reduziu o tamanho. Mantivemos o original.</Text>}<LocalImagePreviewView key={view.preview.uri} preview={view.preview} label="Conferir imagem antes de guardar"/></View>}
 {view.notice&&view.notice!=='setup'&&<Text accessibilityRole="alert">{view.notice==='limit'?'Limite local atingido. Remova uma cópia antes de continuar.':view.review?.status==='unavailable'?'Não foi possível revisar este arquivo. Tente novamente ou selecione outro. Esta seleção ainda não pode ser guardada.':'Não foi possível preparar ou limpar a imagem. Nenhum anexo foi enviado.'}</Text>}
 {view.phase==='unavailable'&&<SetupRecovery host={host}/>}
 {view.phase==='blocked'&&<CleanupRecovery host={host}/>}
 <ImageAction label="Guardar imagem só neste aparelho" disabled={view.phase!=='ready'||!view.preview} onPress={()=>{void actions.save().then(ok=>{if(ok)close();});}}/>
 <ImageAction label="Descartar seleção local" disabled={['closed','unavailable','blocked'].includes(view.phase)} onPress={()=>{void actions.discard();}}/>
 <Text>O arquivo original mantém seus metadados, que podem incluir localização quando presente.</Text>
 <Text>Seu texto não é alterado. Trocar de conversa, empresa ou conta descarta estas cópias temporárias. Amplie a imagem para conferir; compactação não corrige foto desfocada.</Text>
 </View></MediaPrivacySurface>;
}
export function DemoImageMessages({host}:{host:Host}){
 const view=useSyncExternalStore(host.subscribe,host.snapshot,host.snapshot),actions=host.bind();
 return <MediaPrivacySurface enabled={view.messages.length>0||view.phase==="blocked"||view.phase==="unavailable"}><View style={s.panel}>{view.phase==='unavailable'&&<SetupRecovery host={host}/>}{view.phase==='blocked'&&<><Text accessibilityRole="alert">Não foi possível limpar as imagens locais. Nenhum anexo foi enviado.</Text><CleanupRecovery host={host}/></>}{view.messages.length>0&&<Text>Imagens locais, não enviadas: {view.messages.length}</Text>}{view.messages.map((message,index)=><View key={message.id} style={s.card}><Text style={s.title}>Imagem local {index+1}</Text><Text>Somente neste aparelho · Não enviada</Text><Text numberOfLines={3}>{message.preview.name}</Text><Text>{message.preview.bytes} bytes · {message.preview.mode==='original'?'original':'cópia otimizada'}</Text><LocalImagePreviewView preview={message.preview} label={'Ampliar imagem local '+(index+1)}/><ImageAction label={'Remover imagem local '+(index+1)} onPress={()=>{void actions.remove(message.id);}}/></View>)}</View></MediaPrivacySurface>;
}
const s=StyleSheet.create({panel:{gap:12,padding:10},review:{gap:10},card:{gap:10,padding:12,backgroundColor:'#E5F1E8',borderRadius:14},title:{fontSize:17,fontWeight:'700',color:'#185C45'}});
