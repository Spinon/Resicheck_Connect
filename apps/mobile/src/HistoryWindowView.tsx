import React,{useLayoutEffect,useRef,useSyncExternalStore} from 'react';
import {FlatList,Pressable,StyleSheet,Text,View} from 'react-native';
import type {createHistoryWindowHost} from './history-window-host.ts';
import type {HistoryMessage} from '../../../packages/chat-client/src/text-history.ts';
type Host=ReturnType<typeof createHistoryWindowHost>;
function Button({label,onPress,disabled=false}:{label:string;onPress:()=>void;disabled?:boolean}){return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={[s.button,disabled&&s.disabled]}><Text style={s.buttonText}>{label}</Text></Pressable>;}
export function HistoryWindowView({host,title='Conversa',onBack,onLogout}:{host:Host;title?:string;onBack?:()=>void;onLogout?:()=>void}){
  const v=useSyncExternalStore(host.subscribe,host.snapshot,host.snapshot);
  const list=useRef<FlatList<HistoryMessage>>(null),currentHost=useRef(host),generation=useRef(0);currentHost.current=host;
  type LatestScroll={host:Host;rows:readonly HistoryMessage[];lastId:string;generation:number;attempts:number;frame:number|null};
  const latestScroll=useRef<LatestScroll|null>(null),viewability=useRef({itemVisiblePercentThreshold:70}).current;
  function clearScroll(ticket:LatestScroll){if(latestScroll.current===ticket)latestScroll.current=null;if(ticket.frame!==null){cancelAnimationFrame(ticket.frame);ticket.frame=null;}}
  function current(ticket:LatestScroll){
    if(latestScroll.current!==ticket||currentHost.current!==ticket.host||generation.current!==ticket.generation)return false;
    const state=ticket.host.snapshot();return state.status==='ready'&&state.mode===null&&!state.olderWindow&&state.messages===ticket.rows;
  }
  function scheduleScroll(ticket:LatestScroll){
    if(!current(ticket)||ticket.frame!==null||ticket.attempts>=16)return;
    ticket.frame=requestAnimationFrame(()=>{
      ticket.frame=null;if(!current(ticket))return;ticket.attempts++;
      // Variable-height cells may replace estimated metrics after the first
      // scroll. Correct only this completed latest page, until its last item is
      // visible or the bounded frame budget ends. Older reads never arm this.
      try{list.current?.scrollToEnd({animated:false});}catch{}
      if(current(ticket)&&ticket.attempts<16)scheduleScroll(ticket);
    });
  }
  const onVisible=useRef(({viewableItems}:{viewableItems:Array<{item:HistoryMessage;isViewable:boolean}>})=>{
    const ticket=latestScroll.current;if(ticket&&viewableItems.some(item=>item.isViewable&&item.item.id===ticket.lastId))clearScroll(ticket);
  }).current;
  useLayoutEffect(()=>{
    generation.current++;const previous=latestScroll.current;if(previous)clearScroll(previous);
    if(v.status!=='ready'||v.mode!==null||v.olderWindow||!v.messages.length)return;
    const ticket:LatestScroll={host,rows:v.messages,lastId:v.messages.at(-1)!.id,generation:generation.current,attempts:0,frame:null};latestScroll.current=ticket;scheduleScroll(ticket);
    return()=>{clearScroll(ticket);};
  },[host,v.status,v.mode,v.olderWindow,v.messages]);
  return <View style={s.page}>
    <View style={s.header}><Text accessibilityRole="header" style={s.title}>{title}</Text>{onBack&&<Button label="Voltar" onPress={onBack}/>}<Text accessibilityLiveRegion="polite" style={s.body}>{v.messages.length+' mensagens nesta janela'}</Text></View>
    <FlatList ref={list} testID="history-window-list" style={s.list} contentContainerStyle={s.content} data={v.messages} keyExtractor={row=>row.id}
      viewabilityConfig={viewability} onViewableItemsChanged={onVisible} onContentSizeChange={()=>{const ticket=latestScroll.current;if(ticket)scheduleScroll(ticket);}}
      onLayout={()=>{const ticket=latestScroll.current;if(ticket)scheduleScroll(ticket);}} onScrollBeginDrag={()=>{const ticket=latestScroll.current;if(ticket)clearScroll(ticket);}}
      ListHeaderComponent={<View style={s.section}>{v.olderWindow&&<Text style={s.body}>Você está vendo mensagens anteriores. Volte às recentes para conferir o atendimento atual.</Text>}{v.busy&&<Text accessibilityLiveRegion="polite" style={s.body}>Carregando mensagens.</Text>}{v.hasOlder===true&&<Button label="Carregar mensagens anteriores" disabled={v.busy} onPress={()=>{void host.loadOlder();}}/>}</View>}
      renderItem={({item})=><View testID={'history-message-'+item.sequence} style={s.message}><Text style={s.author}>{item.senderRole==='staff'?'Equipe':'Paciente'}</Text><Text selectable style={s.body}>{item.text}</Text>{item.important&&<Text style={s.caption}>Mensagem importante</Text>}</View>}
      ListEmptyComponent={!v.busy?<Text accessibilityLiveRegion="polite" style={s.body}>{v.status==='ready'?'Ainda não há mensagens nesta conversa.':'Não foi possível acessar as mensagens. Tente novamente.'}</Text>:null}
      ListFooterComponent={<View style={s.section}>{v.status==='failed'&&<Text accessibilityLiveRegion="polite" style={s.body}>Não foi possível atualizar as mensagens. Tente novamente.</Text>}<Button label={v.olderWindow?'Voltar às mensagens recentes':'Atualizar mensagens recentes'} disabled={v.busy||v.status==='closed'||v.status==='unavailable'} onPress={()=>{void host.refreshLatest();}}/>{onLogout&&<Button label="Sair" onPress={onLogout}/>}</View>}/>
  </View>;
}
const s=StyleSheet.create({page:{flex:1,backgroundColor:'#F5F9F6'},header:{padding:16,gap:12},title:{fontSize:23,lineHeight:32,fontWeight:'700',color:'#185C45'},list:{flex:1},content:{padding:16,paddingBottom:40,gap:14},section:{gap:14,paddingVertical:12},message:{padding:16,borderRadius:14,backgroundColor:'#FFFFFF',gap:10,marginBottom:14},body:{fontSize:18,lineHeight:28,color:'#18372C'},author:{fontSize:16,lineHeight:24,fontWeight:'700',color:'#185C45'},caption:{fontSize:15,lineHeight:23,color:'#435E51'},button:{minHeight:52,padding:14,borderRadius:12,backgroundColor:'#DDEEE3',justifyContent:'center'},buttonText:{fontSize:17,lineHeight:26,fontWeight:'600',color:'#185C45',flexShrink:1},disabled:{opacity:0.6}});
