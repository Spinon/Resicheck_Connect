import {AudioBusy} from './AudioControls.tsx';
import {subscribeWindowAttention} from './window-attention-events.ts';
import {filterUnreadInbox} from './inbox-unread-filter.ts';
import {createIdleInboxUpdate,createInboxFreshness} from './inbox-freshness.ts';
import type {StaffConversation} from '../../../packages/chat-client/src/membership-directory.ts';
import {ConnectIcon} from './ConnectIcon.tsx';
import React,{useCallback,useEffect,useLayoutEffect,useRef,useState,useSyncExternalStore} from 'react';import {AccessibilityInfo,AppState,FlatList,Keyboard,KeyboardAvoidingView,Platform,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';import type {createMembershipHost} from './membership-host.ts';
import {MediaWindow,MediaWindowHost} from './MediaWindow.tsx';
type Host=ReturnType<typeof createMembershipHost>;
import {staffRequestPolicy} from './staff-request-policy.ts';
const notices={'read-unavailable':'Não foi possível atualizar as não lidas. Atualize a lista.','read-uncertain':'Não foi possível confirmar a marcação. Atualize a lista.',unavailable:'Não foi possível atualizar. Tente novamente.',uncertain:'A confirmação não chegou. Atualize seus vínculos antes de tentar novamente.',updated:'Vínculos atualizados.', 'invalid-query':'Digite pelo menos dois caracteres para buscar.',capacity:'Esta lista está cheia. Refine sua busca.','staff-request-blocked':'A solicitação de funcionário não foi enviada. Confira seus vínculos atuais e a orientação da empresa.'};
function Button({label,text,onPress,disabled=false}:{label:string;text?:string;onPress:()=>void;disabled?:boolean}){return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={[s.button,disabled&&{opacity:.5}]}><Text style={s.buttonText}>{text??label}</Text></Pressable>;}
export type MembershipScreen='companies'|'search'|'team'|'inbox'|'conversations'|'teams';
type Props={host:Host;readOnly?:boolean;connected?:boolean;screen?:MembershipScreen;onOpenSearch?:()=>void;onOpenCompany?:(companyId:string)=>void;onOpenTeam?:(companyId:string)=>void;onOpenInbox?:(companyId:string)=>void;onMembershipChanged?:()=>void;onBack?:()=>void;showSessionAction?:boolean;requestNavigation?:(action:()=>void)=>void};
export function MembershipHostView({host,readOnly=false,connected=false,screen,onOpenSearch,onOpenCompany,onOpenTeam,onOpenInbox,onMembershipChanged,onBack,showSessionAction=true,requestNavigation}:Props){
 if(typeof readOnly!=='boolean'||typeof connected!=='boolean'||typeof showSessionAction!=='boolean'||screen!==undefined&&!['companies','search','team','inbox','conversations','teams'].includes(screen))throw Error('Membership view unavailable');
 return <MediaWindowHost><MembershipContent key={(readOnly?'read-only':'standard')+':'+(screen??'legacy')} {...{host,readOnly,connected,screen,onOpenSearch,onOpenCompany,onOpenTeam,onOpenInbox,onMembershipChanged,onBack,showSessionAction,requestNavigation}}/></MediaWindowHost>;
}
type Staff=ReturnType<Host['snapshot']>['staff'][number];
type Confirmation=Readonly<{host:Host;scopeKey:number;company:string;companyName:string;target:Staff;intent:NonNullable<ReturnType<Host['bindRevokeConfirmation']>>}>;
function MembershipContent({host,readOnly,connected,screen,onOpenSearch,onOpenCompany,onOpenTeam,onOpenInbox,onMembershipChanged,onBack,showSessionAction,requestNavigation}:Props&{readOnly:boolean;connected:boolean;showSessionAction:boolean}){
 const mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 async function changed(action:Promise<boolean>){if(await action&&mounted.current)onMembershipChanged?.();}
 const listScreen=screen==='companies'||screen==='conversations'||screen==='teams';
 const companies=screen===undefined||listScreen,search=screen===undefined||screen==='search',team=screen===undefined||screen==='team',inbox=screen===undefined||screen==='inbox';
 const v=useSyncExternalStore(host.subscribe,host.snapshot,host.snapshot);
 const visibleMembers=v.members.filter(m=>screen==='conversations'?m.state==='active'&&(m.role==='staff'||m.role==='patient'&&!!m.conversationId):screen==='teams'?m.role==='manager'&&m.state==='active':true);
 const cancelSearch=readOnly?null:host.bindSearchCancellation(v);
 const [confirmation,setConfirmation]=useState<Confirmation|null>(null),owned=useRef<Confirmation|null>(null),heading=useRef<React.ComponentRef<typeof Text>>(null);
 const live=!readOnly&&confirmation!==null&&confirmation.host===host&&v.stage==='ready'&&!v.busy&&v.scopeKey===confirmation.scopeKey
   &&v.managedCompany===confirmation.company&&v.staff.some(row=>row===confirmation.target&&row.state==='active');
 function close(captured:Confirmation|null){if(!captured||owned.current!==captured)return;captured.intent.cancel();owned.current=null;setConfirmation(null);}
 function openRevoke(target:Staff){
   if(readOnly)return;Keyboard.dismiss();if(host.snapshot()!==v||!v.managedCompany)return;
   const intent=host.bindRevokeConfirmation(target.userId);if(!intent)return;
   if(host.snapshot()!==v){intent.cancel();return;}
   owned.current?.intent.cancel();
   const captured=Object.freeze({host,scopeKey:v.scopeKey,company:v.managedCompany,companyName:v.members.find(m=>m.companyId===v.managedCompany)?.name??'Empresa',target,intent});
   owned.current=captured;setConfirmation(captured);
 }
 function confirm(captured:Confirmation|null){if(readOnly||!captured||owned.current!==captured)return;owned.current=null;setConfirmation(null);void changed(captured.intent.confirm());}
 useLayoutEffect(()=>{if(confirmation&&!live)close(confirmation);},[confirmation,live]);
 useEffect(()=>()=>{owned.current?.intent.cancel();owned.current=null;},[]);
 return <><KeyboardAvoidingView style={s.page} behavior={Platform.OS==='web'?'height':'padding'}>
 {screen&&!listScreen&&<View style={s.header}>{onBack&&<Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={onBack} style={s.iconButton}><ConnectIcon name="back" color="#185C45"/></Pressable>}<Text accessibilityRole="header" style={s.headerTitle}>{screen==='search'?'Vincular empresa':screen==='team'?'Equipe':'Conversas'}</Text></View>}
 {screen==='inbox'?<InboxPanel host={host} readOnly={readOnly} connected={connected} showSessionAction={showSessionAction} requestNavigation={requestNavigation}/>:<ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
 {companies&&<View style={s.intro}><View style={s.titleRow}><Text accessibilityRole="header" style={[screen==='conversations'?s.choiceTitle:s.title,{flex:1}]}>{screen==='conversations'?'Conversas':screen==='teams'?'Sua equipe':'Empresas'}</Text><Pressable accessibilityRole="button" accessibilityLabel={screen==='conversations'?'Atualizar conversas':'Atualizar meus vínculos'} accessibilityState={{disabled:v.busy}} disabled={v.busy} onPress={()=>{void host.reload();}} style={[s.iconButton,v.busy&&s.disabled]}><ConnectIcon name="refresh" color="#185C45"/></Pressable></View><Text style={s.body}>{screen==='conversations'?'Selecione a empresa.':screen==='teams'?'Selecione a empresa que deseja gerenciar':readOnly?'Seus vínculos com as empresas.':'Escolha uma empresa para continuar'}</Text></View>}
 {v.notice&&<Text accessibilityLiveRegion="polite" style={s.notice}>{notices[v.notice]}</Text>}
 {v.stage==='registration'?<Text style={s.body}>Conclua o cadastro antes de consultar vínculos. Sua conta não recebeu acesso a uma empresa.</Text>:v.stage==='paused'?<Text>Tela protegida</Text>:v.stage==='signed-out'?<Text>Entre para continuar.</Text>:<>
 {v.busy&&screen!=='search'&&<AudioBusy label={inbox&&v.inboxQuery?'Buscando clientes…':'Atualizando…'}/>}
 
 {v.stage==='ready'&&<>
 {companies&&<>
 {screen!=='conversations'&&screen!=='teams'&&v.staffEmployer?.state==='unknown'&&<Text accessibilityLiveRegion="polite" style={s.body}>{readOnly?'Não foi possível conferir seu vínculo de funcionário. Atualize seus vínculos para tentar novamente.':'Não foi possível conferir seu vínculo de funcionário. Atualize seus vínculos antes de solicitar.'}</Text>}
 {v.staffEmployer?.state==='active'&&!v.staffEmployer.companyAvailable&&<Text accessibilityLiveRegion="polite" style={s.body}>{'Vínculo de funcionário em empresa indisponível: '+v.staffEmployer.name+'. Esse vínculo continua ativo.'}</Text>}
 {!v.busy&&(screen==='conversations'?visibleMembers.length===0&&<Text accessibilityLiveRegion="polite" style={s.body}>{v.memberCursor?'Carregue mais empresas para encontrar suas conversas.':'Ainda não há conversas disponíveis. Consulte Empresas.'}</Text>:v.members.length===0&&<Text style={s.body}>Você ainda não tem vínculos nesta lista.</Text>)}
 <View style={screen==='conversations'?s.conversationChoices:s.rows}>{visibleMembers.map(m=>{
 const role=m.role==='patient'?'Cliente':m.role==='staff'?'Funcionário':'Gestor';
 const canOpen=m.state==='active'&&(m.role==='patient'?!!m.conversationId:m.role==='staff'||!readOnly&&m.role==='manager');
 const label=screen==='conversations'?(m.role==='staff'?'Abrir conversas de ':'Abrir conversa com ')+m.name:screen==='companies'&&onOpenCompany?'Abrir empresa '+m.name:m.role==='patient'?'Selecionar meu contexto em '+m.name:m.role==='staff'?'Ver atendimentos de '+m.name:'Gerenciar equipe de '+m.name;
 const open=()=>{if(screen==='conversations'){const current=host.snapshot();if(current.stage!=='ready'||current.busy||current.scopeKey!==v.scopeKey||!current.members.includes(m))return;}if(screen==='companies'&&onOpenCompany){onOpenCompany(m.companyId);return;}if(m.role==='patient'){const action=()=>{host.selectPatient(m.companyId);};if(requestNavigation)requestNavigation(action);else action();}else if(m.role==='staff'){if(onOpenInbox)onOpenInbox(m.companyId);else void host.loadInbox(m.companyId);}else if(!readOnly){if(onOpenTeam)onOpenTeam(m.companyId);else void host.loadTeam(m.companyId);}};
 const contents=screen==='conversations'?<><View style={s.choiceAvatar} accessible={false}><Text accessible={false} style={s.choiceInitial}>{Array.from(m.name.trim())[0]?.toLocaleUpperCase()??'E'}</Text></View><View style={s.rowText}><Text numberOfLines={2} style={s.choiceName}>{m.name}</Text><Text style={s.caption}>{m.role==='staff'?'Conversas dos clientes':'Conversa com a equipe'}</Text></View></>:<><View style={s.avatar}><Text style={s.avatarText}>{Array.from(m.name.trim())[0]?.toLocaleUpperCase()??'E'}</Text></View><View style={s.rowText}><Text testID={screen==='companies'?'membership-company-name':undefined} style={s.rowTitle}>{m.name}</Text><View style={s.chip}><Text style={s.chipText}>{m.state==='active'?'Vínculo ativo':m.state==='pending'?'Aguardando aprovação':'Revogado'}</Text></View><Text style={s.caption}>{role}</Text></View>{canOpen&&<View style={s.chevron}/>}</>;
 return canOpen?<Pressable testID={screen==='companies'?'membership-company-choice':undefined} key={m.companyId+':'+m.role} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled:v.busy}} disabled={v.busy} onPress={open} style={[screen==='conversations'?s.conversationChoice:s.row,v.busy&&s.disabled]}>{contents}</Pressable>:<View key={m.companyId+':'+m.role} style={s.row}>{contents}</View>;
 })}</View>
 {v.memberCursor&&<Button label={screen==='conversations'?'Mais empresas':'Carregar mais vínculos'} disabled={v.busy} onPress={()=>{void host.moreMemberships();}}/>}
 </>}
 {!readOnly&&search&&<><Search key={v.scopeKey} host={host} disabled={v.busy} showHeading={screen===undefined}/>
 {v.searchState==='loading'&&v.busy&&<View style={{gap:12}}><View testID="membership-search-progress"><AudioBusy label="Buscando empresas…"/></View>{cancelSearch&&<Button label="Cancelar busca" onPress={()=>{cancelSearch.cancel();}}/>}</View>}
 {v.searchState==='completed'&&!v.busy&&v.results.length===0&&!v.searchCursor&&!v.notice&&<Text testID="membership-search-empty" accessibilityLiveRegion="polite" style={s.body}>Nenhuma empresa encontrada na última busca. Confira o nome e tente novamente.</Text>}
 {v.results.map(c=>{const staff=staffRequestPolicy(v.members,v.memberCursor!==null,c.companyId,v.staffEmployer);return <View key={c.companyId} style={s.card}><Text style={s.subtitle}>{c.name}</Text><Text style={s.body}>{c.address}{'\n'}{c.phone}</Text><Button text="Vincular como cliente" label={'Vincular como cliente a '+c.name} disabled={v.busy} onPress={()=>{void changed(host.linkPatient(c.companyId));}}/>{staff.message&&<Text style={s.body}>{staff.message}</Text>}<Button text="Solicitar como funcionário" label={'Solicitar como funcionário a '+c.name} disabled={v.busy||!staff.allowed} onPress={()=>{void changed(host.requestStaff(c.companyId));}}/></View>;})}
 {v.searchCursor&&<Button label="Mais empresas encontradas" disabled={v.busy} onPress={()=>{void host.moreSearch();}}/>}
 </>}
 {!readOnly&&team&&v.managedCompany&&<><Text accessibilityRole="header" style={s.subtitle}>{v.members.find(m=>m.companyId===v.managedCompany)?.name??'Equipe desta empresa'}</Text>{v.staff.length===0&&!v.busy&&<Text style={s.body}>Nenhum vínculo de funcionário nesta página.</Text>}{v.staff.map(p=><View key={p.userId} style={s.card}><Text style={s.rowTitle}>{p.displayName}</Text><Text style={s.caption}>{p.state==='pending'?'Pedido pendente':p.state==='active'?'Ativo':'Revogado'}</Text>{p.state==='pending'&&<Button text="Aprovar vínculo" label={'Aprovar vínculo de '+p.displayName} disabled={v.busy} onPress={()=>{void changed(host.approveStaff(p.userId));}}/>}{p.state==='active'&&<Button text="Revogar acesso" label={'Revogar acesso de '+p.displayName} disabled={v.busy} onPress={()=>openRevoke(p)}/>}</View>)}{v.staffCursor&&<Button label="Mais funcionários" disabled={v.busy} onPress={()=>{void host.moreTeam();}}/>}</>}
 {inbox&&v.inboxCompany&&<><Text accessibilityRole="header" style={s.subtitle}>{v.members.find(m=>m.companyId===v.inboxCompany)?.name??'Atendimentos autorizados'}</Text>{v.inboxSearchEnabled&&<InboxSearch key={v.scopeKey+':'+v.inboxCompany} host={host} scopeKey={v.scopeKey} companyId={v.inboxCompany} initialQuery={v.inboxQuery} blocked={v.busy&&v.inboxSearchState!=='loading'} cancel={host.bindInboxSearchCancellation?.(v)??null}/>}
 {v.inboxSearchState==='invalid'&&<Text accessibilityLiveRegion="polite" style={s.caption}>Use de 2 a 80 caracteres.</Text>}
 {v.inboxSearchState==='failed'&&<Text accessibilityLiveRegion="polite" style={s.caption}>{v.inboxQuery?'Não foi possível buscar. Tente novamente.':'Não foi possível atualizar. Tente novamente.'}</Text>}
 {v.inbox.length===0&&!v.busy&&(v.inboxSearchState==='completed'||!v.inboxSearchEnabled)&&<Text accessibilityLiveRegion="polite" style={s.body}>{v.inboxQuery?'Nenhum cliente encontrado.':'Ainda não há conversas nesta empresa.'}</Text>}<View>{v.inbox.map(c=>{const intent=readOnly?null:host.bindInboxReadIntent?.(c);return <InboxConversationRow key={c.conversationId} row={c} disabled={v.busy} onPress={()=>{const action=()=>{host.selectConversation(c.conversationId);};if(requestNavigation)requestNavigation(action);else action();}} onMarkRead={intent?()=>{void intent.confirm();}:undefined}/>;})}</View>{v.inboxCursor&&<Button label="Mais atendimentos" disabled={v.busy} onPress={()=>{void host.moreInbox();}}/>}</>}
 {screen===undefined&&v.context&&<View style={s.card} testID="membership-selected-context"><Text style={s.subtitle}>Contexto selecionado</Text><Text style={s.body}>{v.context.companyName}</Text></View>}
 </>}
 {showSessionAction&&<Button label={connected?'Sair':'Encerrar sessão local'} onPress={()=>{Keyboard.dismiss();void host.signOut();}}/>}
 </>}
 </ScrollView>}
 {screen==='companies'&&!readOnly&&onOpenSearch&&v.stage==='ready'&&<Pressable accessibilityRole="button" accessibilityLabel="Vincular empresa" accessibilityState={{disabled:v.busy}} disabled={v.busy} onPress={onOpenSearch} style={[s.footer,v.busy&&s.disabled]}><Text style={s.footerText}>Vincular empresa</Text><View style={[s.chevron,s.footerChevron]}/></Pressable>}
 </KeyboardAvoidingView>
 {!readOnly&&<MediaWindow priority={30} visible={live} onClose={()=>close(confirmation)} onShow={()=>{if(heading.current&&Platform.OS!=='web')AccessibilityInfo.sendAccessibilityEvent(heading.current,'focus');}}>
   <View style={s.confirmOverlay}><View style={s.confirmCard} accessibilityViewIsModal>
     <ScrollView style={{flexShrink:1}} contentContainerStyle={{gap:14,paddingBottom:8}} keyboardShouldPersistTaps="handled">
     <Text ref={heading} accessibilityRole="header" style={s.title}>Revogar acesso?</Text>
     {live&&<><Text style={s.subtitle}>{confirmation.target.displayName}</Text><Text style={s.body}>{confirmation.companyName}</Text></>}
     <Text style={s.body}>O funcionário perderá o acesso desta empresa.</Text>
     <Button label="Cancelar revogação" onPress={()=>close(confirmation)}/>
     <Button label="Confirmar revogação" onPress={()=>confirm(confirmation)}/>
     </ScrollView>
   </View></View>
 </MediaWindow>}</>;
}
function Search({host,disabled,showHeading=true}:{host:Host;disabled:boolean;showHeading?:boolean}){const [query,setQuery]=useState('');return <View style={{gap:12}}>{showHeading&&<Text accessibilityRole="header" style={s.subtitle}>Vincular a outra empresa</Text>}<TextInput accessibilityLabel="Buscar empresa" placeholder="Nome da empresa" value={query} onChangeText={setQuery} style={s.input} autoCorrect={false}/><Button label="Buscar empresas" disabled={disabled} onPress={()=>{Keyboard.dismiss();void host.search(query);}}/></View>;}
const s=StyleSheet.create({inboxFilters:{flexDirection:'row',flexWrap:'wrap',gap:8},inboxFilter:{minHeight:48,paddingHorizontal:16,paddingVertical:10,borderRadius:24,justifyContent:'center',backgroundColor:'#EAF1E9'},inboxFilterSelected:{backgroundColor:'#185C45'},inboxFilterText:{fontSize:16,lineHeight:24,color:'#185C45'},inboxFilterSelectedText:{color:'white',fontWeight:'600'},inboxCompanyHeading:{flexDirection:'row',alignItems:'center',gap:8},activityDot:{position:'absolute',right:6,top:6,width:10,height:10,borderRadius:5,backgroundColor:'#185C45'},inboxPage:{flex:1,minHeight:0},inboxTop:{paddingHorizontal:20,paddingTop:14,paddingBottom:8,gap:10},inboxList:{flex:1,minHeight:0},inboxContent:{paddingHorizontal:20,paddingBottom:24},inboxEmpty:{paddingVertical:24,gap:16},inboxFooter:{paddingVertical:12,gap:10},inboxSearchRow:{flexDirection:'row',alignItems:'center',minHeight:52,borderRadius:26,backgroundColor:'#EAF1E9'},inboxSearchInput:{flex:1,minWidth:0,minHeight:48,paddingVertical:10,fontSize:17,lineHeight:24,color:'#18372C'},clearSearch:{fontSize:24,lineHeight:32,color:'#435E51'},choiceTitle:{fontSize:24,lineHeight:32,fontWeight:'700',color:'#18372C'},conversationChoices:{gap:0},conversationChoice:{minHeight:76,paddingVertical:12,paddingHorizontal:2,flexDirection:'row',alignItems:'center',gap:12,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:'#DCE6DE'},choiceAvatar:{width:48,height:48,borderRadius:24,backgroundColor:'#E4EDE5',alignItems:'center',justifyContent:'center'},choiceInitial:{fontSize:22,color:'#435E51'},choiceName:{fontSize:18,lineHeight:25,fontWeight:'600',color:'#18372C'},
 confirmOverlay:{flex:1,justifyContent:'center',padding:20,backgroundColor:'#142C2470'},confirmCard:{maxHeight:'95%',padding:20,gap:14,borderRadius:16,backgroundColor:'#F5F9F6'},
 page:{flex:1,backgroundColor:'#F5F9F6'},content:{padding:20,gap:16,paddingBottom:24},titleRow:{flexDirection:'row',alignItems:'center',gap:8},intro:{gap:4,paddingTop:0,paddingBottom:6},title:{fontSize:24,lineHeight:32,fontWeight:'700',color:'#18372C'},subtitle:{fontSize:20,lineHeight:28,fontWeight:'600',color:'#18372C'},body:{fontSize:16,lineHeight:24,color:'#435E51'},caption:{fontSize:14,lineHeight:22,color:'#59665F'},notice:{fontSize:16,lineHeight:24,color:'#6B461E'},
 rows:{gap:12},row:{minHeight:96,paddingVertical:14,paddingHorizontal:16,borderRadius:12,backgroundColor:'#FFFFFF',borderWidth:1,borderColor:'#DCE6DF',flexDirection:'row',alignItems:'center',gap:12},rowText:{flex:1,minWidth:0,gap:4},rowTitle:{fontSize:18,lineHeight:26,fontWeight:'600',color:'#18372C'},avatar:{width:48,height:48,borderRadius:24,backgroundColor:'#D9EDDF',alignItems:'center',justifyContent:'center'},avatarText:{fontSize:22,fontWeight:'600',color:'#185C45'},chevron:{width:9,height:9,borderRightWidth:2,borderTopWidth:2,borderColor:'#185C45',transform:[{rotate:'45deg'}],margin:10},
 card:{padding:16,gap:10,borderRadius:12,borderWidth:1,borderColor:'#DCE8DE',backgroundColor:'white'},button:{minHeight:48,padding:12,borderRadius:12,justifyContent:'center',backgroundColor:'#E5F1E9'},buttonText:{fontSize:16,lineHeight:24,fontWeight:'600',color:'#185C45'},disabled:{opacity:.5},input:{minHeight:52,borderWidth:1,borderColor:'#87998E',borderRadius:12,padding:12,fontSize:18,color:'#18372C',backgroundColor:'white'},chip:{alignSelf:'flex-start',backgroundColor:'#E5F1E9',borderRadius:6,paddingHorizontal:8,paddingVertical:2},chipText:{fontSize:12,lineHeight:18,color:'#284F37',fontWeight:'600'},refreshRow:{alignSelf:'flex-start'},
 header:{minHeight:64,flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:12,backgroundColor:'white',borderBottomWidth:1,borderBottomColor:'#DBE3DE'},headerTitle:{fontSize:22,lineHeight:30,fontWeight:'600',color:'#18372C',flex:1},iconButton:{width:48,height:48,alignItems:'center',justifyContent:'center'},backIcon:{width:16,height:16,borderLeftWidth:2,borderBottomWidth:2,borderColor:'#185C45',transform:[{rotate:'45deg'}]},footer:{minHeight:52,flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:18,paddingVertical:12,marginHorizontal:20,marginTop:4,marginBottom:16,borderRadius:12,backgroundColor:'#185C45'},footerText:{fontSize:16,lineHeight:24,fontWeight:'600',color:'#FFFFFF'},footerChevron:{borderColor:'#FFFFFF'}
});

export function inboxRowSummary(row:StaffConversation,now=Date.now()){
 const message=row.latestMessage;
 if(message===undefined)return Object.freeze({preview:'',time:''});
 if(message===null)return Object.freeze({preview:'Sem mensagens',time:''});
 const date=new Date(message.acceptedAt),today=new Date(now);
 const sameDay=date.getFullYear()===today.getFullYear()&&date.getMonth()===today.getMonth()&&date.getDate()===today.getDate();
 const time=Number.isFinite(date.getTime())?(sameDay?String(date.getHours()).padStart(2,'0')+':'+String(date.getMinutes()).padStart(2,'0'):String(date.getDate()).padStart(2,'0')+'/'+String(date.getMonth()+1).padStart(2,'0')):'';
 return Object.freeze({preview:(message.senderRole==='staff'?'Equipe: ':'')+message.preview+(message.truncated?'…':''),time});
}
/** No photo, unread badge or activity value is fabricated when the port lacks it. */
export function InboxConversationRow({row,disabled,onPress,onMarkRead}:{row:StaffConversation;disabled:boolean;onPress:()=>void;onMarkRead?:()=>void}){
 const summary=inboxRowSummary(row),count=Number.isSafeInteger(row.unreadCount)&&row.unreadCount!>0?row.unreadCount!:0;
 const [markAction,setMarkAction]=useState<(()=>void)|null>(null);
 const options=()=>{if(!disabled&&onMarkRead)setMarkAction(()=>onMarkRead);};
 return <View><Pressable accessibilityRole="button" accessibilityLabel={'Selecionar atendimento de '+row.displayName} accessibilityHint={[summary.preview,summary.time,count>0?count+' mensagens não lidas':'',onMarkRead?'Mantenha pressionado para opções':''].filter(Boolean).join('. ')} accessibilityState={{disabled}} disabled={disabled} onPress={onPress} onLongPress={onMarkRead?options:undefined} accessibilityActions={onMarkRead?[{name:'longpress',label:'Opções da conversa'}]:undefined} onAccessibilityAction={onMarkRead?event=>{if(event.nativeEvent.actionName==='longpress')options();}:undefined} style={[inboxRowStyles.row,disabled&&inboxRowStyles.disabled]}>
  <View style={inboxRowStyles.avatar} accessible={false}><Text accessible={false} style={inboxRowStyles.initial}>{Array.from(row.displayName.trim())[0]?.toLocaleUpperCase()??'C'}</Text></View>
  <View style={inboxRowStyles.content}><View style={inboxRowStyles.heading}><Text numberOfLines={1} style={inboxRowStyles.name}>{row.displayName}</Text><View style={{alignItems:'flex-end',gap:4}}>{summary.time!==''&&<Text style={inboxRowStyles.time}>{summary.time}</Text>}{count>0&&<View style={inboxRowStyles.badge}><Text accessible={false} style={inboxRowStyles.badgeText}>{count>99?'99+':String(count)}</Text></View>}</View></View>{summary.preview!==''&&<Text numberOfLines={1} ellipsizeMode="tail" style={inboxRowStyles.preview}>{summary.preview}</Text>}</View>
 </Pressable>{markAction&&<View style={{gap:8,padding:8}}><Button label="Marcar conversa como lida" text="Marcar como lida" disabled={disabled} onPress={()=>{const action=markAction;setMarkAction(null);action();}}/><Button label="Cancelar marcação de leitura" text="Cancelar" onPress={()=>setMarkAction(null)}/></View>}</View>;
}
const inboxRowStyles=StyleSheet.create({badge:{minWidth:24,minHeight:24,borderRadius:12,paddingHorizontal:6,alignItems:'center',justifyContent:'center',backgroundColor:'#185C45'},badgeText:{fontSize:13,lineHeight:18,color:'white',fontWeight:'600'},row:{minHeight:76,paddingVertical:12,paddingHorizontal:2,flexDirection:'row',alignItems:'center',gap:12,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:'#DCE6DE'},disabled:{opacity:.5},avatar:{width:48,height:48,borderRadius:24,backgroundColor:'#E4EDE5',alignItems:'center',justifyContent:'center'},initial:{fontSize:22,color:'#435E51'},content:{flex:1,minWidth:0,gap:4},heading:{flexDirection:'row',alignItems:'baseline',gap:8},name:{flex:1,minWidth:0,fontSize:18,lineHeight:25,fontWeight:'600',color:'#18372C'},time:{fontSize:13,lineHeight:18,color:'#59665F'},preview:{fontSize:16,lineHeight:22,color:'#435E51'}});

export function InboxSearch({host,scopeKey,companyId,initialQuery,cancel,blocked=false,onFocusChange,requestNavigation}:{requestNavigation?:(action:()=>void)=>void;onFocusChange?:(focused:boolean)=>void;host:Host;scopeKey:number;companyId:string;initialQuery:string;cancel:{cancel:()=>boolean}|null;blocked?:boolean}){
 const [query,setQuery]=useState(initialQuery),value=useRef(initialQuery),dirty=useRef(false),revision=useRef(0),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const stopScheduled=useCallback(()=>{revision.current++;if(timer.current!==null){clearTimeout(timer.current);timer.current=null;}},[]);
 const current=useCallback(()=>{const v=host.snapshot();return v.scopeKey===scopeKey&&v.inboxCompany===companyId&&v.stage==='ready'&&(!v.context||!!requestNavigation)&&(!v.busy||v.inboxSearchState==='loading');},[host,scopeKey,companyId,requestNavigation]);
 const perform=useCallback((text:string,dismiss=false)=>{stopScheduled();if(blocked||!current())return;dirty.current=false;if(dismiss)Keyboard.dismiss();const action=()=>{if(current())void host.searchInbox(text);};if(requestNavigation)requestNavigation(action);else action();},[host,blocked,current,stopScheduled,requestNavigation]);
 useEffect(()=>{
  stopScheduled();if(!dirty.current||blocked||!current()||host.snapshot().context)return;
  const ticket=revision.current;timer.current=setTimeout(()=>{timer.current=null;if(ticket===revision.current&&value.current===query&&current())perform(query);},300);
  return stopScheduled;
 },[query,blocked,current,perform,stopScheduled]);
 useEffect(()=>()=>{dirty.current=false;stopScheduled();},[host,scopeKey,companyId,stopScheduled]);
 const changed=(next:string)=>{if(blocked||!current())return;stopScheduled();value.current=next;dirty.current=true;setQuery(next);host.bindInboxSearchCancellation?.(host.snapshot())?.cancel();};
 const clear=()=>{if(blocked||!current())return;value.current='';dirty.current=true;setQuery('');perform('');};
 const submit=()=>perform(value.current,true);
 return <View style={{gap:4}}><View style={s.inboxSearchRow}>
  <Pressable accessibilityRole="button" accessibilityLabel="Buscar clientes" accessibilityState={{disabled:blocked}} disabled={blocked} onPress={submit} style={s.iconButton}><ConnectIcon name="search" color="#435E51"/></Pressable>
  <TextInput onFocus={()=>onFocusChange?.(true)} onBlur={()=>onFocusChange?.(false)} accessibilityLabel="Buscar cliente" accessibilityHint="Busque pelo nome" placeholder="Buscar cliente" placeholderTextColor="#59665F" value={query} editable={!blocked} maxLength={80} autoCorrect={false} returnKeyType="search" onChangeText={changed} onSubmitEditing={submit} style={s.inboxSearchInput}/>
  {(query!==''||initialQuery!=='')&&<Pressable accessibilityRole="button" accessibilityLabel="Limpar busca de clientes" accessibilityState={{disabled:blocked}} disabled={blocked} onPress={clear} style={s.iconButton}><Text style={s.clearSearch}>×</Text></Pressable>}
 </View>{cancel&&<View style={{alignSelf:'flex-start'}}><Button label="Cancelar busca de clientes" text="Cancelar busca" onPress={()=>{if(!current())return;dirty.current=false;stopScheduled();cancel.cancel();}}/></View>}</View>;
}

/** The inbox owns its scrolling surface; search stays reachable during long lists. */
export function InboxPanel({host,readOnly=false,connected=false,showSessionAction=false,requestNavigation}:{host:Host;readOnly?:boolean;connected?:boolean;showSessionAction?:boolean;requestNavigation?:(action:()=>void)=>void}){
 const v=useSyncExternalStore(host.subscribe,host.snapshot,host.snapshot);
 const onlyUnread=v.inboxUnreadEnabled&&v.inboxOnlyUnread===true;
 const filterMode=useRef(onlyUnread);filterMode.current=onlyUnread;
 const unread=filterUnreadInbox(v.inbox),visibleRows=onlyUnread?unread.rows:v.inbox;
 const idleUpdate=useRef<ReturnType<typeof createIdleInboxUpdate>|null>(null),searchFocused=useRef(false),screenReader=useRef(true),windowFocused=useRef(true);
 const interactionKey=v.scopeKey+':'+v.inboxCompany+':'+v.inboxQuery;
 const interaction=useRef({key:interactionKey,touched:false});if(interaction.current.key!==interactionKey)interaction.current={key:interactionKey,touched:false};
 const interrupt=()=>{interaction.current.touched=true;idleUpdate.current?.dispose();};
 useEffect(()=>{let mounted=true;void AccessibilityInfo.isScreenReaderEnabled().then(value=>{if(mounted)screenReader.current=value;},()=>{});const listener=AccessibilityInfo.addEventListener('screenReaderChanged',value=>{screenReader.current=value;if(value)idleUpdate.current?.dispose();});return()=>{mounted=false;listener.remove();};},[]);
 const activityOwner=useRef<object|null>(null),[activity,setActivity]=useState<{owner:object;rows:readonly StaffConversation[];kind:'changed'|'unavailable'}|null>(null);
 useEffect(()=>{
  if(!connected||v.stage!=='ready'||v.busy||v.context)return;
  const ticket=host.bindInboxActivityProbe?.();if(!ticket)return;
  const owner=Object.freeze({});activityOwner.current=owner;
  const watch=createInboxFreshness({active:AppState.currentState==='active',probe:ticket.probe,changed:kind=>{if(activityOwner.current===owner){setActivity({owner,rows:v.inbox,kind});AccessibilityInfo.announceForAccessibility?.(kind==='changed'?'Há atualizações nas conversas.':'Não foi possível conferir atualizações.');if(kind==='changed'){
    idleUpdate.current?.dispose();
    idleUpdate.current=createIdleInboxUpdate({current:()=>{
     const now=host.snapshot();return Platform.OS!=='web'&&!readOnly&&!screenReader.current&&windowFocused.current&&AppState.currentState==='active'&&!searchFocused.current&&!Keyboard.isVisible()&&!interaction.current.touched&&activityOwner.current===owner&&now.stage==='ready'&&!now.busy&&!now.context&&now.scopeKey===v.scopeKey&&now.inboxCompany===v.inboxCompany&&now.inboxQuery===''&&now.inbox===v.inbox&&now.inbox.length<=10&&now.inboxSearchState==='completed'&&!filterMode.current;
    },refresh:()=>host.loadInbox(v.inboxCompany!,''),schedule:(fn,ms)=>{const timer=setTimeout(fn,ms);return()=>clearTimeout(timer);},failed:()=>{}});
   }}},schedule:(fn,ms)=>{const t=setTimeout(fn,ms);return()=>clearTimeout(t);}});
  const state=AppState.addEventListener('change',next=>{if(next!=='active')idleUpdate.current?.dispose();watch.setActive(next==='active'&&windowFocused.current);});
  const blur=subscribeWindowAttention(Platform.OS,AppState,'blur',()=>{windowFocused.current=false;idleUpdate.current?.dispose();watch.setActive(false);});
  const focus=subscribeWindowAttention(Platform.OS,AppState,'focus',()=>{windowFocused.current=true;watch.setActive(AppState.currentState==='active');});
  return()=>{activityOwner.current=null;watch.dispose();idleUpdate.current?.dispose();state.remove();blur.remove();focus.remove();};
 },[host,connected,readOnly,v.scopeKey,v.stage,v.busy,v.context,v.inboxCompany,v.inboxQuery,v.inbox,v.inboxSearchState]);
 const activityVisible=activity&&activityOwner.current===activity.owner&&activity.rows===v.inbox;
 const current=()=>{const now=host.snapshot();return filterMode.current===onlyUnread&&now.stage==='ready'&&!now.busy&&(!now.context||!!requestNavigation)&&now.scopeKey===v.scopeKey&&now.inboxCompany===v.inboxCompany&&now.inboxQuery===v.inboxQuery&&now.inboxOnlyUnread===v.inboxOnlyUnread&&now.inbox===v.inbox&&now.inboxSearchState===v.inboxSearchState;};
 const chooseFilter=(next:boolean)=>{if(!current()||!v.inboxUnreadEnabled)return;interrupt();if(host.setInboxUnreadFilter(v,next))filterMode.current=next;};
 const retry=()=>{if(!current()||!v.inboxCompany)return;idleUpdate.current?.dispose();interaction.current.touched=false;Keyboard.dismiss();const action=()=>{if(current())void host.loadInbox(v.inboxCompany!,v.inboxQuery);};if(requestNavigation)requestNavigation(action);else action();};
 const more=()=>{if(!current()||!v.inboxCursor||host.snapshot().inboxCursor!==v.inboxCursor)return;void host.moreInbox();};
 if(v.stage!=='ready'||!v.inboxCompany)return <View style={s.inboxTop}><Text accessibilityLiveRegion="polite" style={s.body}>{v.stage==='paused'?'Tela protegida':v.stage==='signed-out'?'Entre para continuar.':'Volte e selecione uma empresa para ver suas conversas.'}</Text></View>;
 const failed=v.inboxSearchState==='failed',cancelled=v.inboxSearchState==='idle',invalid=v.inboxSearchState==='invalid';
 const renderRow=({item}:{item:StaffConversation})=>{
  const intent=readOnly?null:host.bindInboxReadIntent?.(item);
  const owns=()=>current()&&host.snapshot().inbox.includes(item);
  return <InboxConversationRow row={item} disabled={v.busy} onPress={()=>{if(!owns())return;const action=()=>{if(owns())host.selectConversation(item.conversationId);};if(requestNavigation)requestNavigation(action);else action();}} onMarkRead={intent?()=>{if(owns())void intent.confirm();}:undefined}/>;
 };
 return <View style={s.inboxPage} onTouchStart={interrupt}>
  <View style={s.inboxTop}><View style={s.inboxCompanyHeading}><Text accessibilityRole="header" numberOfLines={2} style={[s.subtitle,{flex:1}]}>{v.members.find(m=>m.companyId===v.inboxCompany)?.name??'Conversas da empresa'}</Text><Pressable accessibilityRole="button" accessibilityLabel="Atualizar conversas" accessibilityHint={activityVisible?'Há atualizações nas conversas.':undefined} accessibilityState={{disabled:v.busy}} disabled={v.busy} onPress={retry} style={s.iconButton}><ConnectIcon name="refresh" color="#185C45"/>{activityVisible&&<View style={s.activityDot} accessible={false}/>}</Pressable></View>
   {v.inboxSearchEnabled&&<InboxSearch requestNavigation={requestNavigation} onFocusChange={focused=>{searchFocused.current=focused;if(focused)interrupt();}} key={v.scopeKey+':'+v.inboxCompany} host={host} scopeKey={v.scopeKey} companyId={v.inboxCompany} initialQuery={v.inboxQuery} blocked={v.busy&&v.inboxSearchState!=='loading'} cancel={host.bindInboxSearchCancellation?.(v)??null}/>}

   {v.inboxUnreadEnabled&&<View style={s.inboxFilters}>{([{label:'Todas as conversas',text:'Todas',selected:!onlyUnread,value:false},{label:'Conversas não lidas',text:'Não lidas',selected:onlyUnread,value:true}] as const).map(option=><Pressable key={option.label} accessibilityRole="button" accessibilityLabel={option.label+(Platform.OS==='web'&&option.selected?', filtro ativo':'')} accessibilityState={{selected:option.selected,disabled:v.busy}} disabled={v.busy} onPress={()=>chooseFilter(option.value)} style={[s.inboxFilter,option.selected&&s.inboxFilterSelected,v.busy&&s.disabled]}><Text style={[s.inboxFilterText,option.selected&&s.inboxFilterSelectedText]}>{option.text}</Text></Pressable>)}</View>}
   {onlyUnread&&<Text accessibilityLiveRegion="polite" style={s.caption}>Não lidas nas conversas carregadas.{unread.unknown>0?' Há contagens indisponíveis; atualize para conferir.':''}</Text>}
   {v.notice&&<Text accessibilityLiveRegion="polite" style={s.notice}>{notices[v.notice]}</Text>}
   {v.busy&&<Text accessibilityLiveRegion="polite" style={s.caption}>{v.inbox.length?'Atualizando conversas.':v.inboxQuery?'Buscando clientes.':'Carregando conversas.'}</Text>}
   {!v.busy&&invalid&&<Text accessibilityLiveRegion="polite" style={s.caption}>Use de 2 a 80 caracteres para buscar um cliente.</Text>}
  </View>
  <FlatList key={v.scopeKey+':'+v.inboxCompany+':'+v.inboxQuery+':'+(onlyUnread?'unread':'all')} testID="inbox-conversation-list" onScrollBeginDrag={interrupt} onMomentumScrollBegin={interrupt} style={s.inboxList} contentContainerStyle={s.inboxContent} data={visibleRows} keyExtractor={inboxConversationKey} renderItem={renderRow} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" refreshing={v.busy&&v.inboxSearchState==='loading'} onRefresh={retry} initialNumToRender={12} maxToRenderPerBatch={12} windowSize={7} removeClippedSubviews={false}
   ListEmptyComponent={!v.busy&&!invalid?<View style={s.inboxEmpty}>
    <Text accessibilityLiveRegion="polite" style={s.body}>{failed?(v.inboxQuery?'Não foi possível buscar clientes.':'Não foi possível carregar as conversas.'):cancelled?'A consulta foi interrompida.':onlyUnread?(unread.unknown>0?'Nenhuma não lida confirmada neste trecho. Atualize para conferir as contagens indisponíveis.':'Nenhuma conversa não lida entre as carregadas.'):v.inboxQuery?'Nenhum cliente encontrado. Tente outro nome.':'Ainda não há conversas nesta empresa.'}</Text>
    {(failed||cancelled)&&<Button label="Tentar carregar conversas novamente" text="Tentar novamente" onPress={retry}/>}
   </View>:null}
   ListFooterComponent={<View style={s.inboxFooter}>{!v.busy&&v.inbox.length>0&&(failed||cancelled)&&<><Text accessibilityLiveRegion="polite" style={s.caption}>Atualize para consultar as conversas.</Text><Button label="Tentar carregar conversas novamente" text="Tentar novamente" onPress={retry}/></>}{v.inboxCursor&&v.inboxSearchState==='completed'&&<Button label="Carregar mais conversas" text="Mais conversas" disabled={v.busy} onPress={more}/>}</View>}/>
  {showSessionAction&&<View style={s.inboxFooter}><Button label={connected?'Sair':'Encerrar sessão local'} onPress={()=>{Keyboard.dismiss();void host.signOut();}}/></View>}
 </View>;
}
const inboxConversationKey=(row:StaffConversation)=>row.conversationId;
