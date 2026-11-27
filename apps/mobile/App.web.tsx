import{createNormalConversationImages,type NormalConversationImages}from'./src/normal-conversation-images.ts';
import{NormalImageComposer}from'./src/NormalImageComposer.tsx';
import{createWebLocalImage}from'./src/web-local-image.ts';
import{createWebReceivedImage}from'./src/web-received-image.ts';
import{webImageDigest}from'./src/web-image-digest.ts';
import{MembershipInviteSurface}from './src/MembershipInviteSurface.tsx';
import{takeWebMembershipInvite}from './src/membership-invite-links.ts';
import {createMessageSeenBinding} from './src/message-seen-binding.ts';
import {webReadingAllowed} from './src/web-message-reading.ts';
import{webConversationCache}from './src/web-conversation-cache.ts';
import {AudioBusy} from './src/AudioControls.tsx';
import {recordingBlocksNavigation} from './src/scoped-recording-host.ts';
import {createConnectedNavigation,leaveConnectedConversation,type ConnectedScreen} from './src/connected-navigation.ts';
import {ConnectWebShell,WebAccount,WebContentPanel,WebBrand,type WebDestination} from './src/web/ConnectWebShell.tsx';
import {ConnectedCompanyView} from './src/ConnectedCompanyView.tsx';
import './src/web/connect-web.css';
import React,{useEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import {Image,Pressable,ScrollView,StyleSheet,Text,TextInput,View,useWindowDimensions} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {createConnectedCompanyRegistry as createApp} from './src/connected-company-registry.ts';
import {CompanyRegistryRegistrationView} from './src/CompanyRegistryRegistrationView.tsx';
import {connectedMembershipManagementConfig} from './src/connected-membership-management.ts';
import {MembershipHostView} from './src/MembershipHostView.tsx';
import {RecentConversationView} from './src/RecentConversationView.tsx';
import {PendingRegistrationHostView} from './src/PendingRegistrationHostView.tsx';
import {createDraftExitGuard} from './src/draft-exit-guard.ts';
import {bindBrowserLifecycle} from './src/web/browser-lifecycle.ts';
import {ConnectIcon} from './src/ConnectIcon.tsx';
import {createWebRecordingHost} from './src/web-recording-host.ts';
import {createConnectedWebAudioCandidate} from './src/connected-web-audio-candidate.ts';
import {ScopedAudioComposer} from './src/ScopedAudioComposer.tsx';
const logo=require('./assets/resicheck-icon-round.png');
type App=ReturnType<typeof createApp>;
const schedule=(fn:()=>void,ms:number)=>{const timer=setTimeout(fn,ms);return()=>clearTimeout(timer);};
function Button({label,onPress,quiet=false,disabled=false}:{label:string;onPress:()=>void;quiet?:boolean;disabled?:boolean}){return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} accessibilityState={{disabled}} onPress={onPress} style={({pressed})=>[s.button,quiet&&s.quiet,(pressed||disabled)&&{opacity:.6}]}><Text style={[s.buttonText,quiet&&s.quietText]}>{label}</Text></Pressable>;}
function Brand(){return <View style={s.brand}><Image source={logo} style={s.logo}/><View><Text style={s.brandName}>ResiCheck <Text style={s.brandLight}>Connect</Text></Text><Text style={s.caption}>Empresas ao seu alcance.</Text></View></View>;}
function Notice({children,busy=false}:{children:React.ReactNode;busy?:boolean}){return <View style={s.center}>{busy?<AudioBusy label={typeof children==='string'?children:'Carregando…'}/>:<><ConnectIcon name="chat" size={48} color="#17644B"/><Text style={s.emptyTitle}>{children}</Text></>}</View>;}
function Login({app}:{app:App}){
 const wide=useWindowDimensions().width>=900;
 const auth=useSyncExternalStore(app.auth.subscribe,app.auth.snapshot,app.auth.snapshot);
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[invalid,setInvalid]=useState(false);
 const busy=!['signed-out','authenticated'].includes(auth.status);
 const submit=()=>{if(!email.trim()||!password){setInvalid(true);return;}setInvalid(false);const p=password;setPassword('');void app.auth.signIn(email.trim(),p);};
 return <ScrollView style={{flex:1}} contentContainerStyle={[s.loginPage,!wide&&{flexDirection:'column',flexWrap:'nowrap'}]}><View style={[s.loginIntro,!wide&&{flexGrow:0,flexBasis:'auto',padding:24,gap:16}]}><Brand/><Text accessibilityRole="header" style={[s.heroTitle,!wide&&{fontSize:30,lineHeight:38}]}>Empresas ao
seu alcance.</Text>{wide&&<><Text style={s.heroBody}>Um espaço simples para conversar com suas empresas e acompanhar seus vínculos.</Text><Text style={s.eyebrow}>VERSÃO WEB DE TESTES</Text></>}</View><View style={[s.loginPanel,!wide&&{flexBasis:'auto',padding:24}]}><View style={s.loginForm}><Text accessibilityRole="header" style={s.formTitle}>Bom ter você aqui</Text><Text style={s.body}>Entre com sua conta do Connect.</Text><Text style={s.label}>E-mail</Text><TextInput accessibilityLabel="E-mail" textContentType="emailAddress" autoComplete="email" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} value={email} onChangeText={setEmail} style={s.input}/><Text style={s.label}>Senha</Text><TextInput accessibilityLabel="Senha" textContentType="password" autoComplete="off" secureTextEntry value={password} onChangeText={setPassword} onSubmitEditing={submit} style={s.input}/>{invalid&&<Text accessibilityRole="alert" style={s.error}>Preencha seu e-mail e sua senha.</Text>}{auth.error&&<Text accessibilityRole="alert" style={s.error}>Não foi possível entrar. Confira os dados e tente novamente.</Text>}<Button label={busy?'Entrando…':'Entrar'} disabled={busy} onPress={submit}/><Text style={s.caption}>Use somente dados fictícios. A sessão fica nesta aba e não é salva no navegador.</Text></View></View></ScrollView>;
}
function PendingNavigationNotice({host}:{host:NonNullable<ReturnType<App['recent']['snapshot']>['host']>}){const v=useSyncExternalStore(host.subscribe,host.snapshot,host.snapshot);return v.sending||v.pending.length?<Text accessibilityRole="alert" style={[s.error,{padding:14}]}>{v.sending?'Aguarde o envio para trocar de conversa ou sair.':'Confira o envio pendente antes de trocar de conversa ou sair.'}</Text>:null;}
function Journey({app,navigation,recording=null,images=null}:{app:App;navigation:ReturnType<typeof createConnectedNavigation>;recording?:ReturnType<typeof createWebRecordingHost>|null;images?:NormalConversationImages|null}){
 const {width}=useWindowDimensions(),wide=width>=1100;
 const auth=useSyncExternalStore(app.auth.subscribe,app.auth.snapshot,app.auth.snapshot);
 const gate=useSyncExternalStore(app.gate.subscribe,app.gate.snapshot,app.gate.snapshot);
 const members=useSyncExternalStore(app.members.subscribe,app.members.snapshot,app.members.snapshot);
 const recent=useSyncExternalStore(app.recent.subscribe,app.recent.snapshot,app.recent.snapshot);
 const registration=useSyncExternalStore(app.registration.subscribe,app.registration.snapshot,app.registration.snapshot);
 const route=useSyncExternalStore(navigation.subscribe,navigation.snapshot,navigation.snapshot);
 const bound=navigation.bind(),screen=route.screen;
 const [navigationIssue,setNavigationIssue]=useState<'text'|'audio'|'image'|null>(null);
 const [guard]=useState(()=>createDraftExitGuard({current:()=>{const host=app.recent.snapshot().host,owner=app.auth.currentLease();return host&&owner?{host,owner}:null;},save:host=>app.recent.retainDraft(host as NonNullable<typeof recent.host>),subscribe:fn=>{const stops=[app.auth.subscribe(fn),app.recent.subscribe(fn)];return()=>stops.forEach(stop=>stop());}}));
 const prompt=useSyncExternalStore(guard.subscribe,guard.snapshot,guard.snapshot);
 useEffect(()=>()=>guard.dispose(),[guard]);
 const observed=useRef<ReturnType<typeof createMessageSeenBinding>['observer']|null>(null);
 const seenScope=app.messageSeenEnabled?app.recent.captureSeenScope():null;
 const visibilityFactory=useMemo(()=>seenScope?(viewport:()=>View|null)=>{const binding=createMessageSeenBinding({...seenScope,enabled:true,allowed:()=>{const host=app.recent.snapshot().host;return seenScope.current()!==null&&webReadingAllowed(document)&&!(host&&images?.blocksNavigation(host))&&!(host&&recording&&recordingBlocksNavigation(recording.bind(host).snapshot()));},viewport,now:()=>Math.floor(performance.now()),schedule});observed.current=binding.observer;return binding.observer;}:undefined,[app,seenScope,recording,images]);
 useEffect(()=>{const invalidate=()=>observed.current?.invalidate();document.addEventListener('focusin',invalidate);document.addEventListener('focusout',invalidate);window.addEventListener('resize',invalidate);return()=>{document.removeEventListener('focusin',invalidate);document.removeEventListener('focusout',invalidate);window.removeEventListener('resize',invalidate);};},[]);

 const navigate=(action:()=>void)=>{
  if(!bound.current())return;
  const v=app.recent.snapshot().host?.snapshot();
  if(v&&(v.sending||v.pending.length)){setNavigationIssue('text');return;}
  const host=app.recent.snapshot().host,media=host&&recording?recording.bind(host).snapshot():null;
  if(host&&images?.blocksNavigation(host)){setNavigationIssue('image');return;}
  if(recordingBlocksNavigation(media)){setNavigationIssue('audio');return;}
  setNavigationIssue(null);guard.request(()=>{if(bound.current())action();});
 };
 const hasPrivateRoute=()=>['chat','opening','unavailable'].includes(app.recent.snapshot().route);
 const go=(next:ConnectedScreen)=>navigate(()=>{
  if(!bound.go(next))return;
  // Retire private media/context before showing another area. Mere tab changes
  // outside a conversation do not trigger a redundant membership reload.
  if(hasPrivateRoute())void app.recent.back();
 });
 // false can mean a superseded read, not a lost company. The inbox owns its
 // loading/error/retry state; keep it while its current context is still valid.
 const loadInbox=(co:string,query='',unread?:boolean)=>app.members.loadInbox(co,query,unread).then(ok=>ok||app.members.snapshot().inboxCompany===co);
 const openInbox=(companyId:string)=>navigate(()=>{
  if(!app.members.snapshot().members.some(m=>m.companyId===companyId&&m.role==='staff'&&m.state==='active'))return;
  if(!bound.company('inbox',companyId))return;
  const destination=navigation.snapshot();
  const current=()=>bound.current()&&navigation.snapshot()===destination;
  const load=()=>{if(current())void loadInbox(companyId).then(ok=>{if(!ok&&current())bound.company('company',companyId);});};
  if(hasPrivateRoute())void app.recent.back().then(ok=>{if(ok)load();else if(current())bound.company('company',companyId);});else load();
 });
 const openTeam=(companyId:string)=>navigate(()=>{
  if(!app.members.snapshot().members.some(m=>m.companyId===companyId&&m.role==='manager'&&m.state==='active'))return;
  if(bound.company('team',companyId))void app.members.loadTeam(companyId);
 });
 const openCompany=(companyId:string)=>navigate(()=>{
  if(app.members.snapshot().members.some(m=>m.companyId===companyId))bound.company('company',companyId);
 });
 const openPatient=(companyId:string)=>navigate(()=>{
  const state=app.members.snapshot();
  if(!state.members.some(m=>m.companyId===companyId&&m.role==='patient'&&m.state==='active'&&m.conversationId))return;
  if(bound.go('conversations'))app.members.selectPatient(companyId);
 });
 const back=()=>navigate(()=>{leaveConnectedConversation(navigation,()=>app.recent.back(),loadInbox,app.members.snapshot().inboxQuery,app.members.snapshot().inboxOnlyUnread===true);});
 const logout=()=>navigate(()=>{void app.recent.signOut();});
 useEffect(()=>{const prevent=(e:BeforeUnloadEvent)=>{const host=app.recent.snapshot().host,v=host?.snapshot(),media=host&&recording?recording.bind(host).snapshot():null;const audioPending=media?.available&&(media.hasReview||media.draft&&media.draft.phase!=='idle');if(v&&(v.draft||v.sending||v.pending.length)||audioPending){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',prevent);return()=>window.removeEventListener('beforeunload',prevent);},[app,recording]);
 if(auth.status!=='authenticated')return <MembershipInviteSurface host={app.invites}><Login app={app}/></MembershipInviteSurface>;
 if(!gate.ready)return <MembershipInviteSurface host={app.invites}><View style={s.pending}><WebBrand/><View style={{alignSelf:'flex-start'}}><Button label="Sair da conta" quiet onPress={logout}/></View>{app.companyRegistryEnabled?<CompanyRegistryRegistrationView key="company-registry-panel" app={app} onOpenCompanies={()=>go('companies')}/>:<PendingRegistrationHostView host={app.registration} connectedPending/>}</View></MembershipInviteSurface>;
 const profile=registration.profile,name=profile?.kind==='profile'?profile.name:'Sua conta';
 const roles=[...new Set(members.members.filter(m=>m.state==='active').map(m=>m.role==='manager'?'Gestor':m.role==='staff'?'Funcionário':'Cliente'))].join(' · ');
 const canManage=members.members.some(m=>m.role==='manager'&&m.state==='active');
 const chatting=screen==='conversations'||screen==='inbox';
 const chat=chatting&&['chat','opening','unavailable'].includes(recent.route),currentHost=recent.host;
 const list=<View style={[s.sidebar,wide?{width:340}:{flex:1}]}>{screen==='inbox'&&<View style={s.companyBar}><Button label="Trocar empresa" quiet onPress={()=>go('conversations')}/></View>}<MembershipHostView host={app.members} connected screen={screen==='inbox'?'inbox':'conversations'} showSessionAction={false} requestNavigation={navigate} onOpenInbox={openInbox}/></View>;
 const conversation=<View style={s.conversation}>{recent.route==='chat'&&currentHost?<RecentConversationView key={members.scopeKey+':'+members.context?.conversationId} host={currentHost} visibilityFactory={visibilityFactory} ownMessageStatuses={app.recent.ownMessageStatusesFor(currentHost)} audioPlaybackEnabled={app.audioPlaybackEnabled} audioPlaybackFactory={app.recent.audioPlaybackFor(currentHost)} imageMessageFactory={images?.readerFor(currentHost)} messageRemoval={app.recent.messageRemovalFor(currentHost)} title={recent.heading?.title} subtitle={recent.heading?.subtitle} currentUserId={auth.userId??undefined} connected renderComposer={images||recording?.supported()?controls=>images?<NormalImageComposer images={images} host={currentHost} controls={controls} renderText={recording?.supported()?action=><ScopedAudioComposer recording={recording} conversation={currentHost} permissionContext="web" controls={controls} attachmentAction={action}/>:undefined}/>:<ScopedAudioComposer recording={recording!} conversation={currentHost} permissionContext="web" controls={controls}/>:undefined} audioComposer={recording?(recording.supported()?null:<Text style={s.caption}>Gravação de áudio indisponível neste navegador ou conexão.</Text>):undefined} hasNewMessages={recent.hasNewMessages} exitPrompt={prompt} onBack={back}/>:<View style={{flex:1}}><Notice busy={recent.route==='opening'||recent.recovering}>{recent.route==='opening'?'Abrindo conversa…':recent.recovering?'Reconectando…':recent.route==='unavailable'?'Não foi possível abrir esta conversa.':'Suas conversas, em um só lugar'}</Notice>{recent.route==='unavailable'?<View style={{alignItems:'center',padding:20}}><Button label="Voltar às conversas" quiet onPress={back}/></View>:recent.route!=='opening'&&<Text style={[s.caption,{textAlign:'center',paddingHorizontal:24,paddingBottom:40}]}>Escolha uma empresa para começar.</Text>}</View>}</View>;
 let content:React.ReactNode;
 if(chatting)content=<View style={s.workspace}>{(wide||!chat)&&list}{(wide||chat)&&conversation}</View>;
 else if(screen==='settings'||screen==='about')content=<WebAccount cache={app.cache} name={name} roles={roles} about={screen==='about'} audioEnabled={app.audioPlaybackEnabled} registryEnabled={app.companyRegistryEnabled} onCompanies={()=>go('companies')} onRegistration={()=>go('company-registration')} onAbout={()=>go('about')} onBack={()=>go('settings')} onLogout={logout}/>;
 else if(screen==='company-registration')content=<WebContentPanel title="Cadastro da empresa" description="Acompanhe seus pedidos e consulte os dados públicos do CNPJ.">{app.companyRegistryEnabled?<CompanyRegistryRegistrationView key="company-registry-panel" app={app} onOpenCompanies={()=>go('companies')}/>:<Notice>Consulta indisponível nesta versão.</Notice>}</WebContentPanel>;
 else if(screen==='company')content=<section className="connect-content-panel"><ConnectedCompanyView members={members.members.filter(m=>m.companyId===route.companyId)} onBack={()=>go('companies')} onChat={()=>{if(route.companyId)openPatient(route.companyId);}} onInbox={()=>{if(route.companyId)openInbox(route.companyId);}} onTeam={()=>{if(route.companyId)openTeam(route.companyId);}} onInviteStaff={app.invites?()=>{if(route.companyId)app.invites?.openIssuer(route.companyId,'staff');}:undefined} onInviteClient={app.invites?()=>{if(route.companyId)app.invites?.openIssuer(route.companyId,'patient');}:undefined} onManageStaffInvites={app.invites?()=>{if(route.companyId)app.invites?.openManagement(route.companyId,'staff');}:undefined} onManageClientInvites={app.invites?()=>{if(route.companyId)app.invites?.openManagement(route.companyId,'patient');}:undefined}/></section>;
 else content=<section className="connect-content-panel"><MembershipHostView host={app.members} connected screen={screen==='team'&&!canManage?'companies':screen==='teams'&&!canManage?'companies':screen as 'companies'|'search'|'team'|'teams'} showSessionAction={false} requestNavigation={navigate} onOpenCompany={openCompany} onOpenSearch={()=>go('search')} onOpenTeam={openTeam} onOpenInbox={openInbox} onBack={()=>go(screen==='team'?'teams':'companies')} onMembershipChanged={()=>go('companies')}/></section>;
 content=<MembershipInviteSurface host={app.invites} allowEntry={screen==='companies'||screen==='search'} onDone={()=>go('companies')}>{content}</MembershipInviteSurface>;
 return <ConnectWebShell screen={screen} canManage={canManage} registryEnabled={app.companyRegistryEnabled} name={name} onNavigate={(next:WebDestination)=>go(next)}><View style={{flex:1,minHeight:0,minWidth:0}}>{navigationIssue==='text'&&recent.host&&<PendingNavigationNotice host={recent.host}/>}{navigationIssue==='image'&&<Text accessibilityRole="alert" style={[s.error,{padding:14}]}>Conclua ou descarte a imagem antes de sair desta conversa.</Text>}{navigationIssue==='audio'&&recent.host&&<Text accessibilityRole="alert" style={[s.error,{padding:14}]}>Conclua ou descarte o áudio antes de sair desta conversa.</Text>}{content}</View></ConnectWebShell>;
}
/** Code-only candidate entry: default remains OFF; no URL/storage switch. */
export function createConnectWebRoot(companyRegistryMode?:'candidate-worker-check'|'candidate-on-demand-check',audioMode?:'candidate-scoped-playback'|'candidate-scoped-chat',companyCorrections?:'candidate-own-company',messageRemovalMode:'candidate-selection-v1'|undefined='candidate-selection-v1',membershipLinkMode?:'candidate-secret-v1',companyPreviewMode?:'candidate-preview-v1',imageMode?:'candidate-private-v1'){
 if(imageMode!==undefined&&(imageMode!=='candidate-private-v1'||!messageRemovalMode))throw Error('Images unavailable');
 if(membershipLinkMode!==undefined&&membershipLinkMode!=='candidate-secret-v1')throw Error('Invitations unavailable');
 if(messageRemovalMode!==undefined&&messageRemovalMode!=='candidate-selection-v1')throw Error('Web configuration unavailable');
 if(companyPreviewMode!==undefined&&(companyPreviewMode!=='candidate-preview-v1'||companyRegistryMode!=='candidate-on-demand-check'))throw Error('Web preview configuration unavailable');
 if(companyCorrections!==undefined&&(companyCorrections!=='candidate-own-company'||companyRegistryMode===undefined))throw Error('Web correction configuration unavailable');
 if(companyRegistryMode!==undefined&&companyRegistryMode!=='candidate-worker-check'&&companyRegistryMode!=='candidate-on-demand-check')throw Error('Web registration configuration unavailable');
 if(audioMode!==undefined&&!['candidate-scoped-playback','candidate-scoped-chat'].includes(audioMode))throw Error('Web audio configuration unavailable');
 return function ConnectWeb(){
 const [app,setApp]=useState<App|null>(null),[failed,setFailed]=useState(false),[covered,setCovered]=useState(false),[lifecycle,setLifecycle]=useState<ReturnType<typeof bindBrowserLifecycle>|null>(null);
 const [navigation,setNavigation]=useState<ReturnType<typeof createConnectedNavigation>|null>(null);
 const [images,setImages]=useState<NormalConversationImages|null>(null);
 const [recording,setRecording]=useState<ReturnType<typeof createWebRecordingHost>|null>(null);
 useEffect(()=>{document.title='ResiCheck Connect · Testes';let owned:App|null=null,alive=true,life:ReturnType<typeof bindBrowserLifecycle>|null=null;const abort=new AbortController();let teardown=()=>{};const incomingInvite=membershipLinkMode?takeWebMembershipInvite(window,'https://connect.resicheck.com.br'):null;
 void fetch('/connect-public-config.json',{cache:'no-store',credentials:'omit',signal:abort.signal}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(raw=>{if(!alive)return;const config=connectedMembershipManagementConfig(raw),foreground=()=>document.visibilityState==='visible'&&document.hasFocus()&&life?.isCovered()!==true,options={...(imageMode?{images:{protocol:'private-v1' as const,digest:webImageDigest}}:{}),...(companyPreviewMode?{companyRegistryPreview:companyPreviewMode}:{}),...(membershipLinkMode?{membershipLinks:{protocol:'secret-v1' as const,origin:'https://connect.resicheck.com.br',share:async(url:string)=>{if(typeof navigator.share==='function')await navigator.share({url});else if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(url);else throw Error('Sharing unavailable');}}}:{}),...(messageRemovalMode?{messageRemoval:'selection-v1' as const}:{}),messageSeen:'observed-v1' as const,messageReceipts:'observed-v1' as const,cacheStore:webConversationCache(),...(companyCorrections?{companyRegistryCorrections:companyCorrections}:{}),...(companyRegistryMode?{companyRegistry:companyRegistryMode==='candidate-on-demand-check'?'on-demand-v1' as const:'worker-check' as const}:{}),publicConfig:config,fetch,createId:()=>crypto.randomUUID(),now:Date.now,schedule,timeoutMs:15000,textSend:'basic-manual' as const,inboxFeatures:{recent:true,search:true,unread:true}};owned=audioMode?createConnectedWebAudioCandidate({...options,foreground,mode:'scoped-candidate'}):createApp({...options,audioHistory:'placeholder-only'});const captured=owned;if(incomingInvite)captured.invites?.openUrl(incomingInvite);const nav=createConnectedNavigation(captured.auth);const media=createWebRecordingHost({recent:captured.recent,foreground,createId:()=>crypto.randomUUID(),now:Date.now,schedule,timeoutMs:15000,sendEnabled:audioMode==='candidate-scoped-chat'});const imageOwner=imageMode?createNormalConversationImages({cache:captured.cache,recent:captured.recent,foreground,createPort:current=>createWebLocalImage(current,true),createResource:createWebReceivedImage,digest:webImageDigest,createId:()=>crypto.randomUUID(),schedule,now:Date.now,timeoutMs:15000}):null;const retain=()=>media.permissionGuard.retainDomain()||imageOwner?.reviews.pickerGuard.retainDomain()===true;let stopGuard=()=>{};const tick=setInterval(()=>media.tick(),150);teardown=()=>{stopGuard();clearInterval(tick);imageOwner?.dispose();media.dispose();nav.dispose();};const adapter={suspend(){imageOwner?.foregroundChanged();media.foregroundChanged();if(!retain())captured.suspend();},resume(){captured.resume();imageOwner?.foregroundChanged();},dispose(){teardown();return captured.dispose();}};life=bindBrowserLifecycle({document,window,app:adapter,cover:setCovered});const guardChanged=()=>{if(life?.isCovered()&&!retain())captured.suspend();};const guardStops=[media.permissionGuard.subscribe(guardChanged),...(imageOwner?[imageOwner.reviews.pickerGuard.subscribe(guardChanged)]:[])];stopGuard=()=>{for(const stop of guardStops)stop();};setNavigation(nav);setApp(owned);setRecording(media);setImages(imageOwner);setLifecycle(life);}).catch(()=>{teardown();if(owned)void owned.dispose();if(alive)setFailed(true);});
 return()=>{alive=false;abort.abort();if(life)life.dispose();else{teardown();if(owned)void owned.dispose();}};},[]);
 return <SafeAreaProvider><View style={s.page}>{covered?<View style={s.cover}><Brand/><Text style={s.emptyTitle}>Sua conversa está protegida</Text><Text style={s.body}>Continue quando estiver pronto.</Text><Button label={lifecycle?.isClosed()?'Entrar novamente':'Continuar'} onPress={()=>{if(lifecycle?.isClosed())window.location.reload();else if(lifecycle?.resume()){recording?.foregroundChanged();images?.foregroundChanged();}}}/></View>:failed?<Notice>Não foi possível carregar o Connect. Atualize a página para tentar novamente.</Notice>:app&&navigation?<Journey app={app} navigation={navigation} recording={recording} images={images}/>:<Notice busy>Abrindo Connect…</Notice>}</View></SafeAreaProvider>;
 };
}
export default createConnectWebRoot();
const s=StyleSheet.create({
 page:{flex:1,minHeight:0,backgroundColor:'#EDF2ED'},workspace:{flex:1,minHeight:0,flexDirection:'row',width:'100%',maxWidth:1600,alignSelf:'center',backgroundColor:'#FFF'},sidebar:{minHeight:0,borderRightWidth:1,borderColor:'#DFE6DF',backgroundColor:'#FFF'},sidebarHeader:{padding:20,gap:12,backgroundColor:'#F0F6F0'},brand:{flexDirection:'row',alignItems:'center',gap:12},logo:{height:42,width:42},brandName:{fontSize:22,fontWeight:'700',color:'#153D31'},brandLight:{fontWeight:'400'},caption:{fontSize:13,lineHeight:20,color:'#647269'},body:{fontSize:16,lineHeight:25,color:'#52675A'},eyebrow:{fontSize:12,letterSpacing:2,color:'#52675A',marginTop:40},conversation:{flex:1,minWidth:0,backgroundColor:'#F6F8F3'},center:{flex:1,padding:32,gap:22,justifyContent:'center',alignItems:'center'},emptyTitle:{fontSize:25,lineHeight:34,color:'#153D31',textAlign:'center',maxWidth:500},button:{minHeight:46,paddingHorizontal:20,paddingVertical:12,borderRadius:12,backgroundColor:'#17644B',alignItems:'center',justifyContent:'center'},buttonText:{fontSize:16,fontWeight:'600',color:'#FFF'},quiet:{backgroundColor:'#E5F1E8'},quietText:{color:'#17644B'},companyBar:{padding:12,gap:8,borderBottomWidth:1,borderColor:'#DFE6DF'},companyName:{fontSize:15,color:'#153D31',paddingHorizontal:8},testFooter:{fontSize:12,color:'#647269',padding:14,borderTopWidth:1,borderColor:'#DFE6DF'},loginPage:{flexGrow:1,flexDirection:'row',flexWrap:'wrap',backgroundColor:'#F6F8F3'},loginIntro:{flexGrow:1,flexBasis:380,padding:40,justifyContent:'center',gap:24,backgroundColor:'#E5F1E8'},heroTitle:{fontSize:46,lineHeight:54,fontWeight:'600',color:'#153D31',maxWidth:540},heroBody:{fontSize:19,lineHeight:29,color:'#52675A',maxWidth:400},loginPanel:{flexGrow:1,flexBasis:400,padding:32,justifyContent:'center',alignItems:'center'},loginForm:{width:'100%',maxWidth:400,gap:14},formTitle:{fontSize:30,lineHeight:38,fontWeight:'600',color:'#153D31'},label:{fontSize:14,fontWeight:'600',color:'#153D31',marginTop:10},input:{minHeight:50,padding:14,borderRadius:12,borderWidth:1,borderColor:'#CCD8CE',backgroundColor:'#FFF',fontSize:16,color:'#1D2D26'},error:{fontSize:14,lineHeight:22,color:'#9B392E'},cover:{flex:1,alignItems:'center',justifyContent:'center',gap:24,padding:32},pending:{flex:1,padding:20,gap:20}
});
