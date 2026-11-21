import{createNormalConversationImages,type NormalConversationImages}from'../src/normal-conversation-images.ts';
import{NormalImageComposer}from'../src/NormalImageComposer.tsx';
import{createExpoLocalImage}from'../src/expo-local-image.ts';
import{createExpoReceivedImage}from'../src/expo-received-image.ts';
import{createNativeImageDigest}from'../src/native-image-digest.ts';
import{MembershipInviteSurface}from '../src/MembershipInviteSurface.tsx';
import{bindNativeMembershipInviteLinks}from '../src/membership-invite-links.ts';
import{nativeMembershipInviteRandom}from '../src/native-membership-invite-random.ts';
import{MediaWindowHost}from'../src/MediaWindow.tsx';
import{useConnectBuildInfo}from '../src/ConnectBuildInfo.tsx';
import{createRecentScrollTraceBuffer,type RecentScrollObserver}from '../src/recent-scroll-observation.ts';
import{keyboardMessageViewport}from '../src/keyboard-message-viewport.ts';
import{nativeConversationCache}from '../src/native-conversation-cache.ts';
import {DeviceEventEmitter} from 'react-native';
import {AudioBusy,type ComposerSlots} from '../src/AudioControls.tsx';
import {recordingBlocksNavigation} from '../src/scoped-recording-host.ts';
import type{createScopedRecordingHost}from '../src/scoped-recording-host.ts';
import type{createRecentConversationHost}from '../src/recent-conversation-host.ts';
import {createMessageSeenBinding} from '../src/message-seen-binding.ts';
import {createDraftExitGuard} from '../src/draft-exit-guard.ts';
import {nativeSecureSessionStore} from '../src/native-secure-session-store.ts';
import {createForegroundRecoveryScope} from '../../../packages/session/src/foreground-recovery-scope.ts';
import React,{useEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import {AccessibilityInfo,AppState,BackHandler,Keyboard,Linking,Share,NativeModules,Pressable,Text,ToastAndroid,View} from 'react-native';
import {registerRootComponent} from 'expo';
import {uuid} from 'expo-modules-core';
import {SafeAreaProvider,SafeAreaView} from 'react-native-safe-area-context';
import {StatusBar} from 'expo-status-bar';
import {createConnectedCompanyRegistry}from '../src/connected-company-registry.ts';
import {CompanyRegistryRegistrationView}from '../src/CompanyRegistryRegistrationView.tsx';
import {PendingRegistrationHostView} from '../src/PendingRegistrationHostView.tsx';
import {MembershipHostView} from '../src/MembershipHostView.tsx';
import {ConnectedAppBar,ConnectedSettingsView} from '../src/ConnectedSettingsView.tsx';
import {ConnectedBottomBar} from '../src/ConnectedBottomBar.tsx';
import {ConnectedCompanyView} from '../src/ConnectedCompanyView.tsx';
import {connectedTabs,activeConnectedTab,type ConnectedTabId} from '../src/connected-tabs.ts';
import {createConnectedNavigation,leaveConnectedConversation,openConnectedConversations} from '../src/connected-navigation.ts';
import {RecentConversationView} from '../src/RecentConversationView.tsx';
import {createPrivacyAccessRecentRuntimeCore} from '../src/privacy-access-recent-core.ts';
import type {NativePrivacyPort} from '../src/native-privacy-binding.ts';
import {connectedMembershipManagementConfig,createConnectedMembershipManagement} from '../src/connected-membership-management.ts';

type AudioExtension=Readonly<{
 createRecordingHost:(deps:Readonly<{recent:ReturnType<typeof createConnectedMembershipManagement>['recent'];foreground:()=>boolean;createId:()=>string;schedule:(fn:()=>void,ms:number)=>()=>void;now:()=>number;timeoutMs:number}>)=>ReturnType<typeof createScopedRecordingHost>;
 composer:(recording:ReturnType<typeof createScopedRecordingHost>,host:ReturnType<typeof createRecentConversationHost>,controls:ComposerSlots,attachmentAction?:React.ReactNode)=>React.ReactNode;
 playback?:Parameters<typeof createConnectedMembershipManagement>[0]['audioPlayback'];
}>;

/** Explicit protected membership management bootstrap. Chat is consultation.
 * Import registers nothing and performs no network I/O. Its fixed boundary
 * admits only the reviewed membership operations and existing read surface. */
export function createConnectedMembershipManagementRoot(publicConfig:unknown,nativeFetch:typeof fetch,textSend?:'basic-manual',receiptMode?:'candidate-observed-v1',audioCandidate?:AudioExtension,registryMode?:'candidate-worker-check'|'candidate-on-demand-check',registryCorrections?:'candidate-own-company',messageRemovalMode?:'candidate-selection-v1',membershipLinkMode?:'candidate-secret-v1',registryPreviewMode?:'candidate-preview-v1',imageMode?:'candidate-private-v1'){
 if(imageMode!==undefined&&(imageMode!=='candidate-private-v1'||!messageRemovalMode||textSend!=='basic-manual'))throw Error('Images unavailable');
 if(membershipLinkMode!==undefined&&membershipLinkMode!=='candidate-secret-v1')throw Error('Invitations unavailable');
 if(messageRemovalMode!==undefined&&(messageRemovalMode!=='candidate-selection-v1'||textSend!=='basic-manual'))throw Error('Removal configuration unavailable');
 if(registryPreviewMode!==undefined&&(registryPreviewMode!=='candidate-preview-v1'||registryMode!=='candidate-on-demand-check'))throw Error('Registry preview unavailable');
 if(registryCorrections!==undefined&&(registryCorrections!=='candidate-own-company'||registryMode===undefined))throw Error('Registry corrections unavailable');
 if(registryMode!==undefined&&registryMode!=='candidate-worker-check'&&registryMode!=='candidate-on-demand-check')throw Error('Registry configuration unavailable');
 if(audioCandidate&&(textSend!=='basic-manual'||typeof audioCandidate.createRecordingHost!=='function'||typeof audioCandidate.composer!=='function'))throw Error('Audio configuration unavailable');
 if(receiptMode!==undefined&&(receiptMode!=='candidate-observed-v1'||textSend!=='basic-manual'))throw Error('Receipt configuration unavailable');
 if(textSend!==undefined&&textSend!=='basic-manual')throw Error('Basic text configuration unavailable');
 const config=connectedMembershipManagementConfig(publicConfig);
 if(typeof nativeFetch!=='function')throw Error('Membership management configuration unavailable');
 function createRuntime(){
  let active=AppState.currentState==='active',focused=true;
  const expiryForeground=createForegroundRecoveryScope(AppState);
  const owned:{app:ReturnType<typeof createConnectedMembershipManagement>|null}={app:null};
  let images:NormalConversationImages|null=null;const imageDigest=imageMode?createNativeImageDigest(NativeModules.ConnectAudioDigest):null;
  let recording:ReturnType<typeof createScopedRecordingHost>|null=null;const recordingStops:(()=>void)[]=[];
  const listeners=new Set<(active:boolean)=>void>();
  const emit=()=>{
   for(const listener of [...listeners])try{listener(active&&focused);}catch{}
   images?.foregroundChanged();recording?.foregroundChanged();
   if(active&&focused)void owned.app?.auth.recoverExpiredSession().catch(()=>{});
  };
  const subscriptions:{remove:()=>void}[]=[];
  const schedule=(fn:()=>void,ms:number)=>{const timer=setTimeout(fn,ms);return()=>clearTimeout(timer);};
  try{
   subscriptions.push(AppState.addEventListener('change',state=>{active=state==='active';emit();}));
   subscriptions.push(AppState.addEventListener('blur',()=>{focused=false;emit();}));
   subscriptions.push(AppState.addEventListener('focus',()=>{focused=true;emit();}));
   const runtime=createPrivacyAccessRecentRuntimeCore({retainedDomainAccess:{pauseIfNeeded:()=>{if(images?.reviews.pickerGuard.retainDomain()!==true)return false;if(!owned.app?.recent.pauseForegroundAccess())throw Error('Image access unavailable');return true;},resume:signal=>owned.app?.recent.resumeForegroundAccess(signal)??Promise.resolve(false)},retainDomainWhileBackground:()=>recording?.permissionGuard.retainDomain()===true||images?.reviews.pickerGuard.retainDomain()===true,createApp:()=>{const app=createConnectedCompanyRegistry({...(imageMode?{images:{protocol:'private-v1' as const,digest:imageDigest!}}:{}),...(registryPreviewMode?{companyRegistryPreview:registryPreviewMode}:{}),...(membershipLinkMode?{membershipLinks:{protocol:'secret-v1' as const,origin:'https://connect.resicheck.com.br',randomFill:nativeMembershipInviteRandom(NativeModules.ConnectSecureSession),share:async(url:string)=>{const result=await Share.share({message:url});if(result.action!==Share.sharedAction)throw Error('Sharing cancelled');}}}:{}),...(messageRemovalMode?{messageRemoval:'selection-v1' as const}:{}),cacheStore:nativeConversationCache(NativeModules.ConnectConversationCache),audioHistory:'placeholder-only',...(registryCorrections?{companyRegistryCorrections:registryCorrections}:{}),...(registryMode?{companyRegistry:registryMode==='candidate-on-demand-check'?'on-demand-v1' as const:'worker-check' as const}:{}),...(receiptMode?{messageSeen:'observed-v1' as const,messageReceipts:'observed-v1' as const}:{}),...(audioCandidate?.playback?{audioPlayback:audioCandidate.playback}:{}),publicConfig:config,fetch:nativeFetch,...(textSend?{textSend,inboxFeatures:{recent:true,search:true,unread:true}}:{}),createId:uuid.v4,now:Date.now,schedule,timeoutMs:15000,sessionStore:nativeSecureSessionStore(NativeModules.ConnectSecureSession),localExpiryRecovery:expiryForeground.capture});owned.app=app;if(imageMode){images=createNormalConversationImages({recent:app.recent,foreground:()=>active&&focused,createPort:current=>createExpoLocalImage(current,undefined,true),createResource:createExpoReceivedImage,digest:imageDigest!,createId:uuid.v4,schedule,now:Date.now,timeoutMs:15000});recordingStops.push(images.reviews.pickerGuard.subscribe(emit));}if(audioCandidate){recording=audioCandidate.createRecordingHost({recent:app.recent,foreground:()=>active&&focused,createId:uuid.v4,now:Date.now,schedule,timeoutMs:15000});recordingStops.push(recording.permissionGuard.subscribe(emit));const timer=setInterval(()=>recording?.tick(),150);recordingStops.push(()=>clearInterval(timer));}void app.restoreSession().catch(()=>{});return app;},native:NativeModules.ConnectPrivacyCurtain as NativePrivacyPort,foreground:{current:()=>active&&focused,subscribe:listener=>{listeners.add(listener);return()=>{listeners.delete(listener);};}}});
   subscriptions.push(DeviceEventEmitter.addListener('connectPrivacyRetry',()=>{if(active&&focused)void runtime.binding.refresh();}));
   const navigation=createConnectedNavigation(runtime.app.auth);
   const draftExit=createDraftExitGuard({save:host=>runtime.app.recent.retainDraft(host as NonNullable<ReturnType<typeof runtime.app.recent.snapshot>['host']>),current:()=>{const app=runtime.app,r=app.recent.snapshot(),owner=app.auth.currentLease();return active&&focused&&runtime.snapshot().readyEpoch!==null&&app.textSendEnabled&&app.auth.snapshot().status==='authenticated'&&owner&&r.route==='chat'&&r.host?{owner,host:r.host}:null;},subscribe:listener=>{const stops=[runtime.subscribe(listener),runtime.app.auth.subscribe(listener),runtime.app.recent.subscribe(listener)];return()=>{for(const stop of stops)stop();};}});
   const canLeaveConversation=()=>{
    const host=runtime.app.recent.snapshot().host,view=host&&recording?recording.bind(host).snapshot():null;
    if(host&&images?.blocksNavigation(host)){ToastAndroid.show('Conclua ou descarte a imagem antes de sair desta conversa.',ToastAndroid.LONG);return false;}
    if(!recordingBlocksNavigation(view))return true;
    ToastAndroid.show('Conclua ou descarte o áudio antes de sair desta conversa.',ToastAndroid.LONG);return false;
   };
   let disposed=false;
   return {...runtime,navigation,draftExit,recording,images:images as NormalConversationImages|null,canLeaveConversation,audioComposer:audioCandidate?.composer,dispose(){if(disposed)return;disposed=true;for(const stop of recordingStops)stop();images?.dispose();recording?.dispose();draftExit.dispose();navigation.dispose();expiryForeground.dispose();try{runtime.dispose();}finally{for(const subscription of subscriptions)subscription.remove();listeners.clear();}}};
  }catch{
   for(const stop of recordingStops)try{stop();}catch{}
   try{(recording as ReturnType<typeof createScopedRecordingHost>|null)?.dispose();}catch{}
   (images as NormalConversationImages|null)?.dispose();expiryForeground.dispose();
   if(owned.app)void owned.app.dispose();
   for(const subscription of subscriptions)subscription.remove();listeners.clear();
   throw Error('Application unavailable');
  }
 }
 function Journey({runtime}:{runtime:ReturnType<typeof createRuntime>}){
  const build=useConnectBuildInfo();const qaObserve=useMemo<RecentScrollObserver|undefined>(()=>{if(!build?.internalQa)return undefined;const trace=createRecentScrollTraceBuffer({limit:256});return event=>{const before=trace.stats().recorded;trace.record(event);if(trace.stats().recorded!==before)console.info('CONNECT_SCROLL32 '+JSON.stringify(trace.snapshot().at(-1)));};},[build?.internalQa]);
  const app=runtime.app;
  const registry=useSyncExternalStore(app.registry.subscribe,app.registry.snapshot,app.registry.snapshot);
  const exitPrompt=useSyncExternalStore(runtime.draftExit.subscribe,runtime.draftExit.snapshot,runtime.draftExit.snapshot);
  const auth=useSyncExternalStore(app.auth.subscribe,app.auth.snapshot,app.auth.snapshot);
  const recoveryAvailable=useSyncExternalStore(app.auth.subscribe,app.auth.canRestore,app.auth.canRestore);
  const gate=useSyncExternalStore(app.gate.subscribe,app.gate.snapshot,app.gate.snapshot);
  const recent=useSyncExternalStore(app.recent.subscribe,app.recent.snapshot,app.recent.snapshot);
  const members=useSyncExternalStore(app.members.subscribe,app.members.snapshot,app.members.snapshot);
  const observed=useRef<ReturnType<typeof createMessageSeenBinding>['observer']|null>(null);
  const [screenReader,setScreenReader]=useState(true);
  useEffect(()=>{let mounted=true;void AccessibilityInfo.isScreenReaderEnabled().then(value=>{if(mounted)setScreenReader(value);},()=>{});const subscription=AccessibilityInfo.addEventListener('screenReaderChanged',value=>{observed.current?.setActive(false);setScreenReader(value);});return()=>{mounted=false;subscription.remove();};},[]);
  const seenScope=app.messageSeenEnabled?app.recent.captureSeenScope():null;
  const visibilityFactory=useMemo(()=>seenScope?(viewport:()=>View|null)=>{const binding=createMessageSeenBinding({...seenScope,enabled:true,allowed:()=>!screenReader&&seenScope.current()!==null&&!(app.recent.snapshot().host&&runtime.images?.blocksNavigation(app.recent.snapshot().host!)),viewport:keyboardMessageViewport(viewport,()=>({visible:Keyboard.isVisible(),top:Keyboard.metrics()?.screenY??null})),now:()=>Math.floor(performance.now()),schedule:(fn,ms)=>{const timer=setTimeout(fn,ms);return()=>clearTimeout(timer);}});observed.current=binding.observer;return binding.observer;}:undefined,[seenScope,screenReader]);
  const navigationView=useSyncExternalStore(runtime.navigation.subscribe,runtime.navigation.snapshot,runtime.navigation.snapshot);
  const navigation=runtime.navigation.bind();
  if(auth.status!=='authenticated'||!gate.ready){
   const restoreSession={available:auth.status==='signed-out'&&recoveryAvailable,retry:()=>{Keyboard.dismiss();void app.restoreSession();}};
   return <MembershipInviteSurface host={app.invites}>{app.companyRegistryEnabled?<CompanyRegistryRegistrationView app={app} restoreSession={restoreSession}/>:<PendingRegistrationHostView host={app.registration} connectedPending restoreSession={restoreSession}/>}</MembershipInviteSurface>;
  }
  const tabs=connectedTabs(members.members);
  const selectTab=(id:ConnectedTabId)=>{
   if(!navigation.current()||!connectedTabs(app.members.snapshot().members).some(tab=>tab.id===id)||!runtime.canLeaveConversation())return;
   Keyboard.dismiss();const privateRoute=['chat','opening','unavailable'].includes(app.recent.snapshot().route);if(privateRoute)app.recent.back();
   if(id==='conversations'&&!privateRoute){openConnectedConversations(runtime.navigation,app.members);return;}
   navigation.go(id);
  };
  const shell=(children:React.ReactNode)=><MembershipInviteSurface host={app.invites} allowEntry={navigationView.screen==='companies'||navigationView.screen==='search'} onDone={()=>navigation.go('companies')}><View style={{flex:1,backgroundColor:'#F7FAF7'}}><View style={{flex:1}}>{children}</View><ConnectedBottomBar tabs={tabs} active={activeConnectedTab(navigationView.screen)} onSelect={selectTab}/></View></MembershipInviteSurface>;
  const backToCompanies=()=>{Keyboard.dismiss();navigation.go('companies');};
  const backFromChat=()=>{if(navigation.current()&&runtime.canLeaveConversation()){Keyboard.dismiss();runtime.draftExit.request(()=>leaveConnectedConversation(runtime.navigation,()=>app.recent.back(),(co,query,onlyUnread)=>app.members.loadInbox(co,query,onlyUnread),app.members.snapshot().inboxQuery,app.members.snapshot().inboxOnlyUnread===true));}};
  const openTeam=(id:string)=>{if(navigation.company('team',id))void app.members.loadTeam(id);};
  const openInbox=(id:string)=>{if(navigation.company('inbox',id))void app.members.loadInbox(id);};
  if(recent.route==='unavailable'&&recent.recovering)return <View style={{flex:1,backgroundColor:'#F7FAF7'}}><ConnectedAppBar title="Conversa" onBack={backFromChat}/><View style={{padding:24}}><AudioBusy label="Reconectando…"/></View></View>;
  if(recent.route==='opening')return <View style={{flex:1,backgroundColor:'#F7FAF7'}}><ConnectedAppBar title={recent.heading?.title??'Conversa'} onBack={backFromChat}/><View accessibilityState={{busy:true}} style={{padding:24,gap:12}}><Text numberOfLines={2} style={{fontSize:17,lineHeight:26,color:'#52675A'}}>{recent.heading?.subtitle}</Text><AudioBusy label="Carregando conversa…"/></View></View>;
  if(recent.route==='chat'&&recent.host)return <RecentConversationView observeScroll={qaObserve} imageMessageFactory={runtime.images?.readerFor(recent.host)} renderComposer={runtime.images||runtime.recording&&runtime.audioComposer?controls=>runtime.images?<NormalImageComposer images={runtime.images} host={recent.host!} controls={controls} renderText={runtime.recording&&runtime.audioComposer?action=>runtime.audioComposer!(runtime.recording!,recent.host!,controls,action):undefined}/>:runtime.audioComposer!(runtime.recording!,recent.host!,controls):undefined} ownMessageStatuses={app.recent.ownMessageStatusesFor(recent.host)} audioPlaybackEnabled={app.audioPlaybackEnabled} audioPlaybackFactory={app.recent.audioPlaybackFor(recent.host)} messageRemoval={app.recent.messageRemovalFor(recent.host)} visibilityFactory={visibilityFactory} host={recent.host} exitPrompt={exitPrompt} hasNewMessages={recent.hasNewMessages} title={recent.heading?.title} currentUserId={auth.userId??undefined} subtitle={recent.heading?.subtitle} readOnly={!app.textSendEnabled} connected onBack={backFromChat}/>;
  if(navigationView.screen==='company-registration')return shell(app.companyRegistryEnabled?<CompanyRegistryRegistrationView app={app} onOpenCompanies={()=>{if(navigation.current())backToCompanies();}} onBack={()=>{Keyboard.dismiss();navigation.back();}}/>:<View><ConnectedAppBar title="Cadastro da empresa" onBack={()=>navigation.back()}/><Text>Consulta indisponível nesta versão.</Text></View>);
  if(navigationView.screen==='settings'||navigationView.screen==='about'){
   const profile=app.registration.snapshot().profile;
   const roles=[...new Set(members.members.filter(m=>m.state==='active').map(m=>m.role==='manager'?'Gestor':m.role==='staff'?'Funcionário':'Cliente'))].join(' · ');
   return shell(<ConnectedSettingsView cache={app.cache} audioEnabled={app.audioPlaybackEnabled} receiptsEnabled={app.messageReceiptsEnabled} name={profile?.kind==='profile'?profile.name:'Sua conta'} roles={roles} about={navigationView.screen==='about'} onBack={()=>{Keyboard.dismiss();navigation.back();}} onCompanyRegistration={app.companyRegistryEnabled?()=>{if(navigation.current()){Keyboard.dismiss();navigation.go('company-registration');}}:undefined} onCompanies={backToCompanies} onAbout={()=>{navigation.go('about');}} onLogout={()=>{if(navigation.current()){Keyboard.dismiss();void app.recent.signOut();}}}/>);
  }
  if(navigationView.screen==='company'){
   const selected=members.members.filter(m=>m.companyId===navigationView.companyId);
   return shell(<ConnectedCompanyView members={selected} onBack={backToCompanies} onChat={()=>{if(navigation.current()&&navigationView.companyId)app.members.selectPatient(navigationView.companyId);}} onInbox={()=>{if(navigationView.companyId)openInbox(navigationView.companyId);}} onTeam={()=>{if(navigationView.companyId)openTeam(navigationView.companyId);}} onInviteStaff={app.invites?()=>{if(navigationView.companyId)app.invites?.openIssuer(navigationView.companyId,'staff');}:undefined} onInviteClient={app.invites?()=>{if(navigationView.companyId)app.invites?.openIssuer(navigationView.companyId,'patient');}:undefined} onManageStaffInvites={app.invites?()=>{if(navigationView.companyId)app.invites?.openManagement(navigationView.companyId,'staff');}:undefined} onManageClientInvites={app.invites?()=>{if(navigationView.companyId)app.invites?.openManagement(navigationView.companyId,'patient');}:undefined}/>);
  }
  return shell(<View style={{flex:1,backgroundColor:'#F7FAF7'}}>
   {['companies','conversations','teams'].includes(navigationView.screen)&&<ConnectedAppBar title="ResiCheck Connect" brand/>}
   {recent.route==='unavailable'&&<View style={{padding:16,gap:12}}><Text accessibilityLiveRegion="polite" style={{fontSize:16,lineHeight:24,color:'#704B17'}}>Não foi possível abrir esta conversa. Atualize suas empresas e tente novamente.</Text><Pressable accessibilityRole="button" accessibilityLabel="Voltar aos vínculos" style={{minHeight:48,padding:12}} onPress={backFromChat}><Text style={{color:'#185C45',fontSize:16}}>Voltar</Text></Pressable></View>}
   <MembershipHostView host={app.members} connected screen={navigationView.screen} showSessionAction={false} onOpenCompany={id=>{navigation.company('company',id);}} onOpenSearch={()=>{navigation.go('search');}} onBack={()=>{Keyboard.dismiss();navigation.back();}} onMembershipChanged={backToCompanies} onOpenTeam={openTeam} onOpenInbox={openInbox}/>
  </View>);
 }
 function Ready({runtime}:{runtime:ReturnType<typeof createRuntime>}){
  const state=useSyncExternalStore(runtime.subscribe,runtime.snapshot,runtime.snapshot);
  const boundary=useSyncExternalStore(runtime.binding.subscribe,runtime.binding.snapshot,runtime.binding.snapshot);
  return <View key={state.readyEpoch===null?'covered':state.readyEpoch} collapsable={false} nativeID={state.readyEpoch===null?'connect-private-'+boundary.stage:'connect-private-ready-'+state.readyEpoch} style={{flex:1}}>
   {state.readyEpoch===null?<View style={{flex:1,alignItems:'center',justifyContent:'center'}}><Text>ResiCheck Connect</Text></View>:<MediaWindowHost><Journey runtime={runtime}/></MediaWindowHost>}
  </View>;
 }
 return function ConnectedMembershipManagementApp(){
  const [runtime]=useState(()=>{try{return createRuntime();}catch{return null;}});
  useEffect(()=>()=>runtime?.dispose(),[runtime]);
  // Navigation must remain mounted while the native curtain hides Journey.
  // This does not release the cover or authorize a conversation.
  useEffect(()=>{
   if(!runtime)return;
   const app=runtime.app,back=BackHandler.addEventListener('hardwareBackPress',()=>{
    if(AppState.currentState!=='active'||app.auth.snapshot().status!=='authenticated')return false;
    Keyboard.dismiss();if(app.invites&&!['idle','paused'].includes(app.invites.snapshot().stage)){if(app.invites.snapshot().stage!=='busy')app.invites.clear();return true;}if(['chat','unavailable','opening'].includes(app.recent.snapshot().route)){if(!runtime.canLeaveConversation())return true;return runtime.draftExit.request(()=>leaveConnectedConversation(runtime.navigation,()=>app.recent.back(),(co,query,onlyUnread)=>app.members.loadInbox(co,query,onlyUnread),app.members.snapshot().inboxQuery,app.members.snapshot().inboxOnlyUnread===true));}return runtime.navigation.back();
   });return()=>back.remove();
  },[runtime]);
  useEffect(()=>{
   if(!runtime||membershipLinkMode!=='candidate-secret-v1')return;
   const app=runtime.app;
   return bindNativeMembershipInviteLinks(Linking,'https://connect.resicheck.com.br',url=>{
    const owner=app.auth.currentLease(),open=()=>{if(app.auth.currentLease()!==owner)return;if(owner)runtime.navigation.go('companies');app.invites?.openUrl(url);};
    if(!owner){app.invites?.openUrl(url);return;}
    if(!runtime.canLeaveConversation())return;
    runtime.draftExit.request(()=>{if(['chat','opening','unavailable'].includes(app.recent.snapshot().route)){void app.recent.back().then(ok=>{if(ok)open();});}else open();});
   });
  },[runtime]);
  return <SafeAreaProvider><StatusBar style="dark"/><SafeAreaView style={{flex:1,backgroundColor:'#F5F9F6'}}>
   {runtime?<Ready runtime={runtime}/>:<View style={{flex:1,padding:24,justifyContent:'center'}}><Text>Não foi possível abrir o Connect. Feche e abra o aplicativo para tentar novamente.</Text></View>}
  </SafeAreaView></SafeAreaProvider>;
 };
}
export function registerConnectedMembershipManagement(publicConfig:unknown,nativeFetch:typeof fetch){
 registerRootComponent(createConnectedMembershipManagementRoot(publicConfig,nativeFetch));
}

/** Explicit basic-text entry. Normal session TTL and native privacy are shared. */
export function registerConnectedBasicText(publicConfig:unknown,nativeFetch:typeof fetch){
 registerRootComponent(createConnectedMembershipManagementRoot(publicConfig,nativeFetch,'basic-manual'));
}
