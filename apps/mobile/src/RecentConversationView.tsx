import{PrivateImageMessage,type ImageMessageFactory}from'./PrivateImageMessage.tsx';
import{MessageRemovalBar,MessageRemovalDialog}from './MessageRemovalControls.tsx';
import type{MessageRemovalController}from './message-removal-controller.ts';
import{StableMessageViewport}from './StableMessageViewport.tsx';
import{safelyMeasureView}from './safe-view-measurement.ts';
import{createKeyboardLatestIntent,keyboardViewport,currentKeyboardFrame}from './keyboard-message-viewport.ts';
import {HistorySyncStatus} from './HistorySyncStatus.tsx';
import{HistoryPreparation}from './HistoryPreparation.tsx';
import {AudioBusy,AudioProgress,AudioButton,type ComposerSlots} from './AudioControls.tsx';
import {handleWebComposerKey} from './web-composer-keyboard.ts';
import {subscribeWindowAttention} from './window-attention-events.ts';
import type{OwnMessageStatus}from './own-message-status-binding.ts';
import type{createConversationAudioPlayback}from './conversation-audio-playback.ts';
export type AudioPlaybackFactory=(messageId:string)=>ReturnType<typeof createConversationAudioPlayback>;
import{searchOlderMessages}from './search-older-messages.ts';
import{searchLoadedMessages,loadedMessageContext}from './loaded-message-search.ts';
import{createOlderPageGesture}from './older-page-gesture.ts';
import {useMediaWindowCovered} from './MediaWindow.tsx';
import type {MessageVisibilityObserver} from './message-visibility-proof.ts';
import {createAttentionEpoch,createQuietLatestRefresh} from './quiet-latest-refresh.ts';
import type {QueueEntry} from '../../../packages/chat-client/src/text-send-queue.ts';
import {messageCalendar,messageDayHeading} from './message-calendar.ts';
import type {DraftExitPrompt} from './draft-exit-guard.ts';
import {ConnectIcon} from './ConnectIcon.tsx';
import React,{useCallback,useLayoutEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import {AccessibilityInfo,AppState,BackHandler,FlatList,ScrollView,Keyboard,KeyboardAvoidingView,Platform,Pressable,StyleSheet,Text,TextInput,View,type NativeScrollEvent,type NativeSyntheticEvent,type ViewToken} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {analyzeMessage,messageInputError} from '../../../packages/text/src/message-text.ts';
import type {createRecentConversationHost} from './recent-conversation-host.ts';
import type {HistoryMessage} from '../../../packages/chat-client/src/text-history.ts';
import {createRecentLatestFollow} from './recent-latest-follow.ts';
import {createRecentScrollOwnership,isOwnedScrollResize} from './recent-scroll-ownership.ts';
import {isRecentHistoryPositionReady,isRecentFollowReady,isRecentEmptyRefreshReady} from './recent-follow-readiness.ts';
import type {RecentScrollObservation,RecentScrollObserver} from './recent-scroll-observation.ts';
type Host=ReturnType<typeof createRecentConversationHost>;
function Button({label,onPress,disabled=false,elementRef,icon,hint}:{label:string;onPress:()=>void;disabled?:boolean;elementRef?:React.Ref<View>;icon?:'search';hint?:string}){return <Pressable ref={elementRef} accessibilityRole="button" accessibilityLabel={label} accessibilityHint={hint} accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={[icon?s.iconButton:s.button,disabled&&s.disabled]}>{icon?<ConnectIcon name={icon} color="#185C45"/>:<Text style={s.buttonText}>{label}</Text>}</Pressable>;}
export function RecentConversationView({imageMessageFactory,messageRemoval,renderComposer,audioComposer,ownMessageStatuses,host,title='Conversa',subtitle,currentUserId,onBack,onLogout,observeScroll,exitPrompt=null,readOnly=false,connected=false,hasNewMessages=false,visibilityObserver:externalVisibilityObserver,visibilityFactory,audioPlaybackEnabled=false,audioPlaybackFactory}:{imageMessageFactory?:ImageMessageFactory;messageRemoval?:MessageRemovalController;renderComposer?:(controls:ComposerSlots)=>React.ReactNode;audioComposer?:React.ReactNode;ownMessageStatuses?:readonly OwnMessageStatus[];audioPlaybackEnabled?:boolean;audioPlaybackFactory?:AudioPlaybackFactory;host:Host;visibilityObserver?:MessageVisibilityObserver;visibilityFactory?:(viewport:()=>View|null)=>MessageVisibilityObserver;title?:string;subtitle?:string;currentUserId?:string;onBack?:()=>void;onLogout?:()=>void;observeScroll?:RecentScrollObserver;exitPrompt?:DraftExitPrompt|null;readOnly?:boolean;connected?:boolean;hasNewMessages?:boolean}){
  if(typeof audioPlaybackEnabled!=='boolean'||typeof readOnly!=='boolean'||typeof connected!=='boolean'||typeof hasNewMessages!=='boolean')throw Error('Conversation view unavailable');
  const covered=useMediaWindowCovered();
  const viewport=useRef<View>(null);
  const visibilityObserver=useMemo(()=>externalVisibilityObserver??visibilityFactory?.(()=>viewport.current),[host,externalVisibilityObserver,visibilityFactory]);
  useLayoutEffect(()=>()=>{if(!externalVisibilityObserver)visibilityObserver?.dispose();},[visibilityObserver,externalVisibilityObserver]);
  const attentionGate=useRef(createAttentionEpoch(AppState?.currentState==='active'));
  const [attentionEpoch,setAttentionEpoch]=useState(attentionGate.current.snapshot);
  useLayoutEffect(()=>{
   let foreground=AppState?.currentState==='active',focused=true;
   const publish=()=>{visibilityObserver?.setActive(false);if(attentionGate.current.change(foreground,focused))setAttentionEpoch(attentionGate.current.snapshot());};
   publish();
   const subscriptions=[
    AppState.addEventListener('change',state=>{foreground=state==='active';publish();}),
    subscribeWindowAttention(Platform.OS,AppState,'blur',()=>{focused=false;publish();}),
    subscribeWindowAttention(Platform.OS,AppState,'focus',()=>{focused=true;publish();}),
   ];
   return()=>{for(const subscription of subscriptions)subscription.remove();attentionGate.current.change(false,false);};
  },[visibilityObserver]);
  const report=useCallback((event:RecentScrollObservation)=>{if(observeScroll)try{observeScroll(Object.freeze(event));}catch{/* Optional observation cannot fail the UI. */}},[observeScroll]);
  const v=useSyncExternalStore(host.subscribe,host.snapshot,host.snapshot),h=useSyncExternalStore(host.history.subscribe,host.history.snapshot,host.history.snapshot),active=v.status==='active';
  const selection=useSyncExternalStore(messageRemoval?.subscribe??emptySelectionSubscribe,messageRemoval?.snapshot??emptySelectionSnapshot,messageRemoval?.snapshot??emptySelectionSnapshot);
  const selectionActive=selection.phase!=='idle'&&selection.phase!=='closed';
  const selectedIds=useMemo(()=>new Set(selection.selected),[selection.selected]);
  const selectMessage=useCallback((id:string)=>{if(!readOnly&&!covered&&host.snapshot().status==='active')messageRemoval?.toggle(id);},[messageRemoval,host,readOnly,covered]);
  useLayoutEffect(()=>{messageRemoval?.refresh();},[messageRemoval,h.messages]);
  useLayoutEffect(()=>{if(!messageRemoval||!selectionActive||selection.phase!=='selecting'||Platform.OS==='web')return;const sub=BackHandler.addEventListener('hardwareBackPress',()=>messageRemoval.cancel());return()=>sub.remove();},[messageRemoval,selectionActive,selection.phase]);
  const anchorViewport=useRef<StableMessageViewport>(null);
  const list=useRef<FlatList<HistoryMessage>>(null),owner=useRef(host);owner.current=host;
  const insets=useSafeAreaInsets(),origin=useRef<View>(null),localY=useRef<number|null>(null),measurement=useRef(0);
  const [keyboardOffset,setKeyboardOffset]=useState(insets.top);
  const [loadedEndAvailable,setLoadedEndAvailable]=useState({available:false,geometry:null as object|null,manual:false});
  const [draftSaveIssue,setDraftSaveIssue]=useState<DraftExitPrompt|null>(null);
  const draftDecision=useRef<View>(null),composerInput=useRef<TextInput>(null);
  useLayoutEffect(()=>{
   if(Platform.OS!=='web'||!exitPrompt||!active||readOnly||covered)return;
   const frame=requestAnimationFrame(()=>{if(owner.current===host&&host.snapshot().status==='active')draftDecision.current?.focus();});
   return()=>cancelAnimationFrame(frame);
  },[host,exitPrompt,active,readOnly,covered]);
  const [editor,setEditor]=useState({host,open:false});
  const [search,setSearch]=useState({host,open:false});
  const searching=active&&!readOnly&&!covered&&!exitPrompt&&search.host===host&&search.open;
  const expanded=!readOnly&&active&&editor.host===host&&editor.open;
  const editorAvailable=expanded||!readOnly&&active&&(v.draft.length>180||v.draft.split('\n').length>2);
  const resumeVisibility=useCallback(()=>{if(owner.current===host&&connected&&!readOnly&&!covered&&!expanded&&!searching&&!exitPrompt&&host.snapshot().status==='active'&&attentionGate.current.current(attentionEpoch) )visibilityObserver?.setActive(true);},[host,connected,readOnly,covered,expanded,searching,exitPrompt,attentionEpoch,visibilityObserver]);
  useLayoutEffect(()=>{visibilityObserver?.setActive(connected&&!readOnly&&!covered&&active&&!expanded&&!searching&&!exitPrompt&&attentionGate.current.current(attentionEpoch));return()=>visibilityObserver?.setActive(false);},[visibilityObserver,connected,readOnly,covered,active,expanded,searching,exitPrompt,attentionEpoch]);

  useLayoutEffect(()=>{visibilityObserver?.invalidate();},[visibilityObserver,host,h.messages,h.busy]);
  const collapseEditor=useCallback(()=>{if(owner.current===host)setEditor({host,open:false});},[host]);
  useLayoutEffect(()=>{
    if(!expanded||Platform.OS==='web')return;
    const back=BackHandler.addEventListener('hardwareBackPress',()=>{if(owner.current!==host||host.snapshot().status!=='active')return false;collapseEditor();return true;});
    return()=>back.remove();
  },[expanded,host,collapseEditor]);

  useLayoutEffect(()=>{if(!searching||Platform.OS==='web')return;const back=BackHandler.addEventListener('hardwareBackPress',()=>{if(owner.current!==host)return false;setSearch({host,open:false});return true;});return()=>back.remove();},[searching,host]);
  const olderMounted=useRef(false),olderReader=useRef(true),olderGuard=useRef({connected,readOnly,covered,expanded:expanded||searching,exitPrompt,attentionEpoch});olderGuard.current={connected,readOnly,covered,expanded:expanded||searching,exitPrompt,attentionEpoch};
  const olderGesture=useMemo(()=>createOlderPageGesture({current:()=>{
   const gate=olderGuard.current;if(!olderMounted.current||owner.current!==host||Platform.OS==='web'||!gate.connected||gate.readOnly||gate.covered||gate.expanded||gate.exitPrompt||olderReader.current||Keyboard.isVisible()||AppState.currentState!=='active'||!attentionGate.current.current(gate.attentionEpoch))return null;
   const state=host.snapshot(),page=host.history.snapshot();return state.status==='active'&&!state.sending&&!state.draft&&!state.pending.length&&!state.provisional.length&&page.status==='ready'&&!page.busy&&!page.readCancelled&&page.hasOlder===true&&page.messages.length?{owner:host,firstId:page.messages[0].id}:null;
  },load:()=>host.loadOlder()}),[host]);
  useLayoutEffect(()=>{olderMounted.current=true;let mounted=true;void AccessibilityInfo.isScreenReaderEnabled().then(value=>{if(mounted)olderReader.current=value;},()=>{});const subscription=AccessibilityInfo.addEventListener('screenReaderChanged',value=>{olderReader.current=value;olderGesture.cancel();});return()=>{mounted=false;subscription.remove();olderMounted.current=false;olderGesture.cancel();};},[olderGesture]);
  const loadedEnd=useRef({manual:false,available:false,geometry:null as object|null,publishedGeometry:null as object|null,publishedManual:false});
  const loadedEndGate=useRef({host,rows:h.messages,hasNewMessages});loadedEndGate.current={host,rows:h.messages,hasNewMessages};
  const publishLoadedEnd=useCallback((next:boolean)=>{
    if(loadedEnd.current.available===next&&loadedEnd.current.publishedGeometry===loadedEnd.current.geometry&&loadedEnd.current.publishedManual===userInterrupted.current.value)return;
    loadedEnd.current.available=next;loadedEnd.current.publishedGeometry=loadedEnd.current.geometry;loadedEnd.current.publishedManual=userInterrupted.current.value;setLoadedEndAvailable({available:next,geometry:loadedEnd.current.geometry,manual:userInterrupted.current.value});
  },[]);
  function measureOrigin(){visibilityObserver?.invalidate();
    const node=origin.current,y=localY.current;if(!node||y===null)return;const ticket=++measurement.current,capturedHost=host;
    safelyMeasureView(node,()=>owner.current===host,(_x,windowY,width)=>{
      if(ticket!==measurement.current||owner.current!==capturedHost||!Number.isFinite(windowY)||!Number.isFinite(width)||width<=0)return;
      // KAV's frame.y is parent-local, while Keyboard.screenY is global. The
      // first child has the same top as KAV: subtract its parent's local y to
      // recover the actual ancestor/window origin (including safe-area inset).
      const offset=Math.max(0,windowY-y);setKeyboardOffset(previous=>previous===offset?previous:offset);
    });
  }
  useLayoutEffect(()=>{setKeyboardOffset(insets.top);measureOrigin();return()=>{measurement.current++;};},[host,insets.top]);
  type Scope={host:Host;rows:readonly HistoryMessage[];lastId:string};
  const scope=useRef<Scope|null>(null),tail=useRef<{owner:object;host:Host;scopeRows:readonly HistoryMessage[];id:string;node:View}|null>(null),frame=useRef<number|null>(null);
  const tailToken=useMemo(()=>Object.freeze({}),[host,h.messages,report]),tailGeneration=useRef(tailToken);tailGeneration.current=tailToken;
  // Reading intent belongs to this conversation, not to each server projection.
  const userInterrupted=useRef({host,value:false});if(userInterrupted.current.host!==host)userInterrupted.current={host,value:false};
  const [autoBlocked,setAutoBlocked]=useState<object|null>(null);
  const autoAttempt=useRef<{host:Host;id:string|null}|null>(null);

  const metrics=useRef({offset:0,contentHeight:0,height:0,width:0});
  const keyboardIntent=useRef(createKeyboardLatestIntent()).current,keyboardFrame=useRef<number|null>(null);
  const scrollIntent=useRef<object>({});
  const scrollOwnership=useRef(createRecentScrollOwnership()).current;
  const scrollOwner=useRef<ReturnType<typeof scrollOwnership.arm>|null>(null);
  const followRef=useRef<ReturnType<typeof createRecentLatestFollow>|null>(null);
  if(!followRef.current)followRef.current=createRecentLatestFollow(()=>{const s=scope.current;if(!s||owner.current!==s.host)return false;const state=s.host.history.snapshot();return isRecentHistoryPositionReady(s.host.snapshot(),state)&&state.messages===s.rows;});
  const follow=followRef.current;
  const measureTail=useCallback(()=>{
    if(frame.current!==null){report({event:'frame-skipped',reason:'frame-pending'});return;}
    if(!follow.capture()){report({event:'frame-skipped',reason:'not-current'});return;}
    report({event:'frame-scheduled'});
    frame.current=requestAnimationFrame(()=>{
      frame.current=null;const attention=attentionGate.current.snapshot();if(!attentionGate.current.current(attention))return;const ticket=follow.capture(),captured=scope.current;
      report({event:'frame-start',ticket:!!ticket,owner:!!captured,height:metrics.current.height,contentHeight:metrics.current.contentHeight,offset:metrics.current.offset});
      if(!ticket||!captured||metrics.current.height<=0||metrics.current.contentHeight<=0){report({event:'frame-skipped',reason:!ticket||!captured?'not-current':'invalid-size'});return;}
      const apply=(decision:ReturnType<typeof follow.plan>)=>{
        report({event:'plan',decision:decision.kind,...decision.kind==='scroll'?{targetOffset:decision.offset,oversized:decision.oversized}:{}});
        if(decision.kind==='settled'&&scrollOwner.current)scrollOwnership.settled(scrollOwner.current,Math.max(0,metrics.current.contentHeight-metrics.current.height));
        if(decision.kind==='end'||decision.kind==='scroll'){
          const maxOffset=Math.max(0,metrics.current.contentHeight-metrics.current.height);
          // Dispatch exactly the clamped destination recorded by ownership.
          // A growing native extent must not turn an unclamped old request
          // into an unrecognised later ACK.
          const offset=decision.kind==='end'?maxOffset:Math.max(0,Math.min(maxOffset,decision.offset));
          const ticket=scrollOwner.current;
          const allowed=!!ticket&&scrollOwnership.command(ticket,offset,maxOffset);
          report({event:'command',allowed,targetOffset:offset,contentHeight:metrics.current.contentHeight,height:metrics.current.height});
          if(allowed){
            list.current?.scrollToOffset({offset,animated:false});measureTail();
          }
        }
      };
      const target=tail.current;
      if(!target||target.owner!==tailGeneration.current||target.host!==captured.host||target.scopeRows!==captured.rows||target.id!==captured.lastId){report({event:'frame-skipped',reason:'missing-tail',tail:!!target,sameRows:target?.scopeRows===captured.rows});apply(follow.plan(ticket,null));return;}
      const offset=metrics.current.offset,contentHeight=metrics.current.contentHeight;
      safelyMeasureView(viewport.current,()=>attentionGate.current.current(attention)&&scope.current===captured,(_x,top,width,height)=>{
        const visible=keyboardViewport(top,height,currentKeyboardFrame(Platform.OS,Keyboard));if(!visible)return;top=visible.top;height=Math.max(0,visible.height-1);
        report({event:'viewport-measured',viewportTop:top,width,height,owner:scope.current===captured,tail:tail.current===target});
        if(scope.current!==captured||tail.current!==target||width<=0||height<=0){report({event:'frame-skipped',reason:width<=0||height<=0?'zero-size':'stale'});return;}
        safelyMeasureView(target.node,()=>attentionGate.current.current(attention)&&scope.current===captured&&tail.current===target,(_tx,targetTop,targetWidth,targetHeight)=>{
          report({event:'tail-measured',targetTop,targetWidth,targetHeight,owner:scope.current===captured,tail:tail.current===target});
          if(scope.current!==captured||tail.current!==target){report({event:'frame-skipped',reason:'stale'});return;}
          // A retained JS cell may be clipped out of the native tree. Use the
          // same bounded positioning request as a missing tail reference.
          if(targetWidth<=0||targetHeight<=0){report({event:'frame-skipped',reason:'zero-size'});apply(follow.plan(ticket,null));return;}
          apply(follow.plan(ticket,{viewportTop:top,viewportHeight:height,targetTop,targetHeight,offset,contentHeight}));
        });
      });
    });
  },[follow,report,scrollOwnership]);
  const geometry=useCallback((resetBudget=true)=>{report({event:'geometry',resetBudget});follow.geometry(resetBudget);measureTail();},[follow,report,measureTail]);
  useLayoutEffect(()=>{if(attentionGate.current.current(attentionEpoch)&&!covered)geometry();},[attentionEpoch,covered,geometry]);
  const cancelFollow=useCallback((reason:'effect'|'cleanup'|'drag'|'momentum'|'external'='effect')=>{report({event:'cancel',reason,owner:!!scope.current,ticket:!!scrollOwner.current});if(['drag','momentum','external'].includes(reason)){userInterrupted.current.value=true;scrollIntent.current={};}follow.cancel();scrollOwnership.retire();scrollOwner.current=null;if(frame.current!==null){cancelAnimationFrame(frame.current);frame.current=null;}},[follow,report,scrollOwnership]);
  const rememberKeyboardPosition=useCallback(()=>{
   if(Platform.OS==='web'||Keyboard.isVisible())return;
   const page=host.history.snapshot(),live=host.snapshot();
   keyboardIntent.capture(host,metrics.current,owner.current===host&&!olderReader.current&&!readOnly&&!covered&&!expanded&&!searching&&!exitPrompt&&attentionGate.current.current(attentionEpoch)&&isRecentHistoryPositionReady(live,page)&&!page.olderWindow);
  },[host,keyboardIntent,readOnly,covered,expanded,searching,exitPrompt,attentionEpoch]);
  useLayoutEffect(()=>{
   const show=()=>{
    visibilityObserver?.invalidate();resumeVisibility();
    if(!keyboardIntent.consume(host)){geometry();return;}
    if(keyboardFrame.current!==null)cancelAnimationFrame(keyboardFrame.current);
    keyboardFrame.current=requestAnimationFrame(()=>{
     keyboardFrame.current=null;
     const page=host.history.snapshot(),live=host.snapshot(),gate=olderGuard.current;
     if(owner.current!==host||olderReader.current||!gate.connected||gate.readOnly||gate.covered||gate.expanded||gate.exitPrompt||!attentionGate.current.current(gate.attentionEpoch)||!isRecentHistoryPositionReady(live,page)||page.olderWindow)return;
     scope.current={host,rows:page.messages,lastId:page.messages.at(-1)!.id};
     userInterrupted.current={host,value:false};loadedEnd.current.manual=false;loadedEnd.current.geometry=null;publishLoadedEnd(false);
     scrollOwner.current=scrollOwnership.arm(metrics.current.offset);follow.arm();geometry();
    });
   };
   const hide=()=>{keyboardIntent.cancel();visibilityObserver?.invalidate();resumeVisibility();geometry();};
   const events=[Keyboard.addListener('keyboardWillShow',()=>{visibilityObserver?.setActive(false);}),Keyboard.addListener('keyboardDidShow',show),Keyboard.addListener('keyboardDidHide',hide)];
   return()=>{events.forEach(e=>e.remove());keyboardIntent.cancel();if(keyboardFrame.current!==null){cancelAnimationFrame(keyboardFrame.current);keyboardFrame.current=null;}};
  },[host,keyboardIntent,visibilityObserver,resumeVisibility,geometry,follow,scrollOwnership,publishLoadedEnd]);
  const updateLoadedEnd=useCallback(()=>{
    const current=()=>owner.current===host&&tailGeneration.current===tailToken&&loadedEndGate.current.host===host&&loadedEndGate.current.rows===h.messages;
    if(!current())return;const state=host.snapshot(),page=host.history.snapshot();if(!current())return;
    publishLoadedEnd(loadedEnd.current.manual&&loadedEnd.current.geometry===tailToken&&!loadedEndGate.current.hasNewMessages&&page.messages===h.messages&&isRecentFollowReady(state,page)&&farFromLoadedEnd(metrics.current));
  },[host,h.messages,tailToken,publishLoadedEnd]);
  // Sending/uncertain attempts and their provisional footer retire positioning.
  // Arm only when ACK, latest refresh and footer removal have all settled.
  // Geometry events cannot undo manual drag on this quiet page.
  useLayoutEffect(()=>{
    report({event:'gate',ready:isRecentFollowReady(v,h),active,busy:h.busy,sending:v.sending,pending:v.pending.length,provisional:v.provisional.length,rows:h.messages.length,older:h.olderWindow});
    // An arrival hint is not a history mutation. Retain current end ownership
    // long enough to measure/refresh it; actual history, writing or attention
    // changes still retire it. Manual readers never regain ownership here.
    cancelFollow();
    // A poll/edit/arrival cannot reclaim scroll ownership from a reader. Sending
    // or an explicit jump may deliberately return to the latest message.
    const manual=userInterrupted.current.value&&!v.sending;
    if(v.sending)userInterrupted.current.value=false;
    loadedEnd.current.manual=manual;loadedEnd.current.geometry=null;publishLoadedEnd(false);
    if(!isRecentHistoryPositionReady(v,h)){scope.current=null;return;}
    if(manual){scope.current=null;loadedEnd.current.geometry=tailToken;updateLoadedEnd();return;}
    if(h.readCancelled){scope.current=null;userInterrupted.current.value=true;loadedEnd.current.manual=true;loadedEnd.current.geometry=tailToken;updateLoadedEnd();return;}
    const captured:Scope={host,rows:h.messages,lastId:h.messages.at(-1)!.id};scope.current=captured;scrollOwner.current=scrollOwnership.arm(metrics.current.offset);follow.arm();measureTail();
    report({event:'arm',rows:h.messages.length,offset:metrics.current.offset});
    return()=>{if(scope.current===captured){scope.current=null;cancelFollow('cleanup');}};
  },[host,h.status,h.busy,h.olderWindow,h.messages,v.status,v.sending,v.pending.length,v.provisional.length,h.readCancelled,report,cancelFollow,follow,measureTail,scrollOwnership,publishLoadedEnd,tailToken,updateLoadedEnd]);
  // Explain a disabled new send before any attempt: the button cannot invoke
  // host validation while canSend is false. Keep the conservative live-server
  // code-point limit; never trim, normalize or alter a pending retry's text.
  const draftError=readOnly||!active?null:messageInputError(analyzeMessage(v.draft))??([...v.draft].length>2000?'Use até 2.000 caracteres.':null);
  const historyCancellation=useMemo(()=>host.bindHistoryReadCancellation?.()??null,[host,h.status,h.busy,h.mode,h.messages,h.cancelling,v.status,v.sending,v.pending.length,v.provisional.length]);
  const actionLabel='Enviar',actionDisabled=!v.canSend||selectionActive;
  const sendDraft=(keepKeyboard=false)=>{
    if(readOnly||covered||searching||exitPrompt||owner.current!==host||messageRemoval&&!['idle','closed'].includes(messageRemoval.snapshot().phase))return;
    const live=host.snapshot();if(live.status!=='active'||!live.canSend)return;
    if(!keepKeyboard)Keyboard.dismiss();
    void Promise.resolve(host.send()).then(sent=>{if(sent===true&&owner.current===host&&host.snapshot().status==='active'&&host.snapshot().draft==='')setEditor({host,open:false});}).catch(()=>{});
  };

  // Empty projections can be freshly allocated by the host on each keystroke.
  // Normalize only empty values; nonempty rows retain their own source identity.
  const pending=v.pending.length?v.pending:emptyRows,provisional=v.provisional.length?v.provisional:emptyRows;
  const lastId=h.messages.at(-1)?.id??null;
  const tailRef=useCallback((node:View|null)=>{
    if(!node){if(tail.current?.owner===tailToken&&tail.current.host===host&&tail.current.scopeRows===h.messages&&tail.current.id===lastId){report({event:'tail-ref',attached:false});tail.current=null;}return;}
    if(tailGeneration.current!==tailToken||owner.current!==host||host.history.snapshot().messages!==h.messages||lastId===null)return;
    if(tailGeneration.current!==tailToken||owner.current!==host)return;
    report({event:'tail-ref',attached:true});if(tailGeneration.current!==tailToken||owner.current!==host)return;tail.current={owner:tailToken,host,scopeRows:h.messages,id:lastId,node};measureTail();
  },[tailToken,host,h.messages,lastId,report,measureTail]);
  const onTailLayout=useCallback(()=>{if(tailGeneration.current===tailToken&&owner.current===host&&host.history.snapshot().messages===h.messages)geometry();},[tailToken,host,h.messages,geometry]);
  const visibleAudioFactory=audioPlaybackEnabled&&active&&!covered&&!expanded&&!searching&&!exitPrompt&&attentionGate.current.current(attentionEpoch)?audioPlaybackFactory:undefined;
  // Keep the read owner mounted under its own zoom window. Overlay blocks new UI
  // actions/receipts; foreground, context, removal and explicit-read gates remain.
  const visibleImageFactory=active&&!expanded&&!searching&&!exitPrompt&&attentionGate.current.current(attentionEpoch)?imageMessageFactory:undefined;
  const renderMessage=useCallback(({item,index}:{item:HistoryMessage;index:number})=><ConversationMessageRow onSelect={messageRemoval?selectMessage:undefined} selectionActive={selectionActive} selected={selectedIds.has(item.id)} audioReady={h.status==='ready'&&!h.busy} receiptState={ownMessageStatuses?.find(row=>row.messageId===item.id)?.state} imageMessageFactory={visibleImageFactory} audioPlaybackFactory={visibleAudioFactory} visibilityObserver={visibilityObserver} item={item} previousAcceptedAt={h.messages[index-1]?.acceptedAt} own={currentUserId===item.senderId} tailRef={item.id===lastId?tailRef:undefined} onLayout={item.id===lastId?onTailLayout:undefined}/>,[messageRemoval,selectMessage,selectionActive,selectedIds,h.messages,h.status,h.busy,currentUserId,lastId,tailRef,onTailLayout,visibilityObserver,visibleImageFactory,visibleAudioFactory,ownMessageStatuses]);
  const visibleMessageIds=useMemo(()=>new Set(h.messages.map(row=>row.id)),[h.messages]);
  const candidateScope=useRef({host,ids:visibleMessageIds,observer:visibilityObserver});candidateScope.current={host,ids:visibleMessageIds,observer:visibilityObserver};
  const viewabilityConfig=useRef({itemVisiblePercentThreshold:1,minimumViewTime:0}).current;
  const onViewableItemsChanged=useRef(({viewableItems}:{viewableItems:ViewToken<HistoryMessage>[]})=>{
   const gate=candidateScope.current;if(owner.current!==gate.host||gate.host.snapshot().status!=='active')return;
   gate.observer?.setCandidates?.(viewableItems.filter(row=>row.isViewable&&gate.ids.has(row.item.id)).map(row=>row.item.id));
  }).current;
  const onContentSizeChange=useCallback((_width:number,height:number)=>{anchorViewport.current?.geometry();visibilityObserver?.invalidate();
    if(owner.current!==host||tailGeneration.current!==tailToken)return;
    report({event:'content-layout',contentHeight:height});
    if(owner.current!==host||tailGeneration.current!==tailToken)return;
    if(metrics.current.contentHeight!==height){metrics.current.contentHeight=height;geometry();}
    if(Number.isFinite(height)&&height>0&&metrics.current.height>0)loadedEnd.current.geometry=tailToken;
    updateLoadedEnd();
  },[visibilityObserver,host,tailToken,report,geometry,updateLoadedEnd]);
  const onScroll=useCallback((event:NativeSyntheticEvent<NativeScrollEvent>)=>{visibilityObserver?.invalidate();
        if(owner.current!==host||tailGeneration.current!==tailToken)return;
        const e=event.nativeEvent,offset=Math.max(0,e.contentOffset.y);
        const result=scrollOwnership.observe(scrollOwner.current,offset,Math.max(0,e.contentSize.height-e.layoutMeasurement.height));
        const resized=isOwnedScrollResize(result,metrics.current.height,metrics.current.contentHeight,e.layoutMeasurement.height,e.contentSize.height);
        report({event:'scroll',scroll:result,offset,height:e.layoutMeasurement.height,contentHeight:e.contentSize.height,owner:!!scope.current,ticket:!!scrollOwner.current});
        if(owner.current!==host||tailGeneration.current!==tailToken)return;
        // Scroll ACKs may carry pre-layout extents. The layout/content-size
        // callbacks are authoritative; never roll their newer sizes backward.
        // Keep the physical offset and remeasure on an owned resize/ACK.
        metrics.current.offset=offset;
        loadedEnd.current.geometry=[offset,metrics.current.height,metrics.current.contentHeight].every(Number.isFinite)&&metrics.current.height>0&&metrics.current.contentHeight>0?tailToken:null;
        // Native accessibility scrolling need not emit beginDrag. Preserve its
        // native action and stop latest following before any later layout/RAF.
        if(result==='external'){loadedEnd.current.manual=true;cancelFollow('external');}
        else if(resized)geometry();
        else if(result==='command')measureTail();
        // A normal offset change never requests correction. An owned scroll
        // event can carry newer extent information than the last content layout.
        // Only that geometry change schedules measurement; AX never rearms.

        updateLoadedEnd();olderGesture.check(offset);
  },[visibilityObserver,host,tailToken,report,scrollOwnership,cancelFollow,geometry,measureTail,updateLoadedEnd,olderGesture]);
  const onScrollBeginDrag=useCallback(()=>{keyboardIntent.cancel();visibilityObserver?.setActive(false);if(owner.current!==host||tailGeneration.current!==tailToken)return;loadedEnd.current.manual=true;cancelFollow('drag');updateLoadedEnd();olderGesture.begin();olderGesture.check(metrics.current.offset);},[visibilityObserver,host,tailToken,cancelFollow,updateLoadedEnd,olderGesture]);
  const onMomentumScrollBegin=useCallback(()=>{keyboardIntent.cancel();visibilityObserver?.setActive(false);if(owner.current!==host||tailGeneration.current!==tailToken)return;loadedEnd.current.manual=true;cancelFollow('momentum');updateLoadedEnd();},[visibilityObserver,host,tailToken,cancelFollow,updateLoadedEnd]);
  // Reuse the exact list element on draft/banner-only renders. Row ownership,
  // loading, pending/accepted footers and page replacement still invalidate it.
  const messageList=useMemo(()=>(<FlatList key={h.messages.length?(h.busy&&!h.cachedPresentation?"preparing-history":"received-messages"):"empty-history"} ref={list} testID="recent-conversation-list" style={[s.list,loadedEndAvailable.manual?webManualListStyle:webListStyle]} contentContainerStyle={s.content} data={h.messages} initialScrollIndex={!h.olderWindow&&h.messages.length>100?h.messages.length-1:undefined} contentOffset={!h.olderWindow&&h.messages.length>100?{x:0,y:0}:undefined} onScrollToIndexFailed={()=>geometry()} keyExtractor={messageKey} keyboardShouldPersistTaps="handled"
      onContentSizeChange={onContentSizeChange}
      onScroll={onScroll} scrollEventThrottle={16}
      onScrollBeginDrag={onScrollBeginDrag} onMomentumScrollBegin={onMomentumScrollBegin} onScrollEndDrag={resumeVisibility} onMomentumScrollEnd={resumeVisibility}
      ListHeaderComponent={<View style={s.section}>
        {h.olderWindow&&<Text style={s.caption}>Mensagens anteriores</Text>}{h.busy&&!h.messages.length&&!h.syncProgress&&<HistoryPreparation/>}

        {h.hasOlder===true&&<Button label="Carregar mensagens anteriores" disabled={h.busy||!readOnly&&v.sending||!active} onPress={()=>{void host.loadOlder();}}/>}
      </View>}
      viewabilityConfig={viewabilityConfig} onViewableItemsChanged={onViewableItemsChanged} renderItem={renderMessage}
      ListFooterComponent={<View style={s.section}>
        {!readOnly&&provisional.map(row=><View key={row.id} style={[s.card,s.ownBubble]}><Text selectable style={s.body}>{row.text}</Text><SendState label="Enviada" detail="A mensagem foi salva. Isso não confirma entrega nem leitura." live/></View>)}
        {h.status==='failed'&&<View style={s.section}><Text accessibilityLiveRegion="polite" style={s.body}>Não foi possível atualizar.</Text><Button label="Tentar atualizar mensagens" disabled={h.busy||!active} onPress={()=>{Keyboard.dismiss();void host.refreshLatest();}}/></View>}
      </View>}/>),[loadedEndAvailable.manual,host,h.status,h.busy,h.hasOlder,h.olderWindow,h.messages,v.status,v.sending,pending,provisional,readOnly,historyCancellation,h.cancelling,renderMessage,onContentSizeChange,onScroll,onScrollBeginDrag,onMomentumScrollBegin,resumeVisibility]);
  const jumpLoadedEnd=useCallback(()=>{
    const current=()=>owner.current===host&&tailGeneration.current===tailToken&&loadedEndGate.current.host===host&&loadedEndGate.current.rows===h.messages&&!loadedEndGate.current.hasNewMessages;
    if(!current()||!loadedEnd.current.available||!loadedEnd.current.manual||loadedEnd.current.geometry!==tailToken)return;
    const state=host.snapshot(),page=host.history.snapshot();
    if(!current()||page.messages!==h.messages||!isRecentFollowReady(state,page)||!farFromLoadedEnd(metrics.current))return;
    userInterrupted.current={host,value:false};cancelFollow();loadedEnd.current.manual=false;publishLoadedEnd(false);
    if(!current())return;
    const latest=h.messages.at(-1);if(!latest)return;
    userInterrupted.current={host,value:false};scope.current={host,rows:h.messages,lastId:latest.id};scrollOwner.current=scrollOwnership.arm(metrics.current.offset);follow.arm();
    report({event:'arm',rows:h.messages.length,offset:metrics.current.offset});measureTail();
  },[host,h.messages,tailToken,publishLoadedEnd,cancelFollow,follow,scrollOwnership,report,measureTail]);
  const showLoadedEnd=loadedEndAvailable.available&&loadedEnd.current.manual&&loadedEnd.current.geometry===tailToken&&!hasNewMessages&&isRecentFollowReady(v,h);
  const requestNewMessages=useCallback(()=>{
    if(owner.current!==host)return;const state=host.snapshot(),page=host.history.snapshot();
    if(state.status!=='active'||state.sending||page.busy)return;
    userInterrupted.current={host,value:false};loadedEnd.current.manual=false;
    void host.refreshLatest();
  },[host]);

  const autoEmpty=isRecentEmptyRefreshReady(v,h);
  const autoCandidate=Platform.OS!=='web'&&attentionGate.current.current(attentionEpoch)&&connected&&hasNewMessages&&!covered&&!exitPrompt&&!readOnly&&!expanded&&!searching&&autoBlocked!==tailToken&&!(autoAttempt.current?.host===host&&autoAttempt.current.id===lastId)&&!h.readCancelled&&!userInterrupted.current.value&&(autoEmpty||isRecentFollowReady(v,h));
  useLayoutEffect(()=>{
   if(!autoCandidate)return;
   const valid=()=>attentionGate.current.current(attentionEpoch)&&AppState?.currentState==='active'&&owner.current===host&&tailGeneration.current===tailToken&&!userInterrupted.current.value&&host.history.snapshot().messages===h.messages&&!host.history.snapshot().readCancelled&&(autoEmpty?isRecentEmptyRefreshReady(host.snapshot(),host.history.snapshot()):isRecentFollowReady(host.snapshot(),host.history.snapshot())&&Number.isFinite(metrics.current.contentHeight)&&metrics.current.contentHeight>0&&metrics.current.height>0&&(follow.capture()!==null||Math.abs(metrics.current.contentHeight-metrics.current.height-metrics.current.offset)<=8));
   const watch=createQuietLatestRefresh({allowVisibleTail:true,emptyWindow:autoEmpty,current:valid,fallback:()=>{if(owner.current===host&&tailGeneration.current===tailToken)setAutoBlocked(tailToken);},refresh:()=>{autoAttempt.current={host,id:lastId};return host.refreshLatest();},schedule:(fn,ms)=>{const t=setTimeout(fn,ms);return()=>clearTimeout(t);},measure:done=>{
    const target=tail.current,node=viewport.current;
    if(autoEmpty){if(!node){done(null);return;}safelyMeasureView(node,valid,(_x,_top,width,height)=>{if(!valid()){done(null);return;}done({empty:true,viewportWidth:width,viewportHeight:height});});return;}
    if(!node||!target||target.host!==host||target.scopeRows!==h.messages||target.owner!==tailToken){done(null);return;}
    safelyMeasureView(node,valid,(_x,top,width,height)=>{if(!valid()){done(null);return;}const shown=keyboardViewport(top,height,currentKeyboardFrame(Platform.OS,Keyboard));if(!shown){done(null);return;}top=shown.top;height=shown.height;if(width<=0){done(null);return;}safelyMeasureView(target.node,valid,(_tx,y,w,heightOfTail)=>{if(!valid()||tail.current!==target){done(null);return;}done(w>0&&heightOfTail>0?{viewportTop:top,viewportHeight:height,tailBottom:y+heightOfTail}:null);});});
   }});
   const interrupt=[AppState.addEventListener('change',state=>{if(state!=='active')watch.dispose();}),subscribeWindowAttention(Platform.OS,AppState,'blur',()=>watch.dispose())];
   return()=>{watch.dispose();for(const subscription of interrupt)subscription.remove();};
  },[host,tailToken,h.messages,autoCandidate,autoEmpty,attentionEpoch]);

  const composerControls:ComposerSlots={expanded,disabled:!active||covered||searching||!!exitPrompt||v.sending||selectionActive,
   before:editorAvailable&&<View style={s.editorActions}><Pressable accessibilityRole="button" accessibilityLabel={expanded?'Reduzir área de escrita':'Ampliar área de escrita'} accessibilityState={{expanded}} onPress={()=>{if(owner.current!==host||host.snapshot().status!=='active')return;setEditor({host,open:!expanded&&!searching});}} style={s.button}><Text style={s.buttonText}>{expanded?'Voltar à conversa':'Ampliar texto'}</Text></Pressable></View>,
   input:<TextInput ref={composerInput} key="conversation-composer-input" accessibilityLabel="Mensagem" accessibilityHint={draftError??(Platform.OS==='web'&&!expanded?'Enter envia. Shift+Enter cria uma nova linha.':undefined)} aria-invalid={!!draftError} placeholder="Mensagem" onPressIn={rememberKeyboardPosition} onFocus={rememberKeyboardPosition} multiline editable={active&&!selectionActive} value={v.draft} onChangeText={host.setDraft} onKeyPress={Platform.OS==='web'&&!expanded?event=>{handleWebComposerKey(event,()=>sendDraft(true));}:undefined} style={[s.input,expanded&&s.expandedInput]} scrollEnabled textAlignVertical="top"/>,
   send:<Pressable accessibilityRole="button" accessibilityLabel={actionLabel} accessibilityState={{disabled:actionDisabled}} disabled={actionDisabled} onPress={()=>sendDraft()} style={[s.sendButton,actionDisabled&&s.disabled]}><ConnectIcon name="send" size={24} color="#FFFFFF"/></Pressable>,
   after:<>{v.pending.length>0&&!v.sending&&v.draft!==''&&v.draft!==v.pending[0].text&&<Text accessibilityLiveRegion="polite" style={s.caption}>{expanded?'Volte à conversa para resolver o envio pendente.':'Confira o envio acima antes de enviar este texto.'}</Text>}{draftError&&<Text testID="recent-composer-input-error" accessibilityLiveRegion="polite" style={s.notice}>{draftError}</Text>}</>,
  };
  return <KeyboardAvoidingView style={s.page} behavior={Platform.OS==='web'?'height':'padding'} keyboardVerticalOffset={keyboardOffset}
    onLayout={event=>{localY.current=event.nativeEvent.layout.y;measureOrigin();}}>
    <View ref={origin} collapsable={false} onLayout={measureOrigin} style={s.navigation}>
      {selectionActive&&messageRemoval?<MessageRemovalBar controller={messageRemoval} onLeave={onBack}/>:<>
      {onBack&&<Pressable accessibilityRole="button" accessibilityLabel={expanded?"Voltar à conversa":"Voltar"} onPress={expanded?collapseEditor:onBack} style={s.iconButton}><ConnectIcon name="back" color="#185C45"/></Pressable>}
      <View style={s.heading}><Text accessibilityRole="header" accessibilityLabel={title} numberOfLines={2} style={s.title}>{title}</Text>{subtitle&&<Text accessibilityLabel={subtitle} numberOfLines={2} style={s.subtitle}>{subtitle}</Text>}</View>
      <Pressable accessibilityRole="button" accessibilityLabel={h.olderWindow?'Voltar às mensagens recentes':'Atualizar mensagens recentes'} accessibilityState={{disabled:h.busy||!active}} disabled={h.busy||!active} onPress={()=>{void host.refreshLatest();}} style={[s.iconButton,(h.busy||!active)&&s.disabled]}><ConnectIcon name="refresh" color="#185C45"/></Pressable>
    {!readOnly&&active&&!covered&&!expanded&&!searching&&!exitPrompt&&<Button label="Buscar mensagens" icon="search" onPress={()=>{if(owner.current!==host||host.snapshot().status!=='active')return;visibilityObserver?.setActive(false);cancelFollow();Keyboard.dismiss();setSearch({host,open:true});}}/>}
      {onLogout&&<Button label="Sair" onPress={onLogout}/>}</>}
    </View>
    <HistorySyncStatus history={h}/>
    {h.syncProgress?.limited&&!h.busy&&<Text style={s.caption}>Limite de espaço local atingido. As mensagens anteriores continuam disponíveis.</Text>}
    {searching&&<LoadedMessageSearchView host={host} rows={h.messages} current={()=>owner.current===host&&host.snapshot().status==='active'} onClose={()=>{Keyboard.dismiss();setSearch({host,open:false});}}/>}
    {active&&connected&&hasNewMessages&&!autoCandidate&&<View testID="recent-new-messages" style={s.newMessages}><Pressable accessibilityRole="button" accessibilityLabel="Ver novas mensagens" accessibilityLiveRegion="polite" accessibilityState={{disabled:h.busy||v.sending||!active}} disabled={h.busy||v.sending||!active} onPress={requestNewMessages} style={[s.button,(h.busy||v.sending||!active)&&s.disabled]}><Text style={s.buttonText}>Novas mensagens</Text></Pressable></View>}
    {h.busy&&(historyCancellation||h.cancelling)&&<View style={s.historyProgress}>{h.cancelling&&<AudioBusy label="Cancelando…"/>}{historyCancellation&&<Button label="Cancelar carregamento" onPress={()=>{void historyCancellation.cancel();}}/>}</View>}
    <StableMessageViewport ref={anchorViewport} owner={host} messages={h.messages} preserve={userInterrupted.current.value} observe={report} intent={()=>scrollIntent.current} manual={()=>owner.current===host&&userInterrupted.current.value} scroll={offset=>list.current?.scrollToOffset({offset,animated:false})} viewport={()=>viewport.current}><View onTouchStart={()=>visibilityObserver?.setActive(false)} onTouchEnd={resumeVisibility} onTouchCancel={resumeVisibility} ref={viewport} collapsable={false} style={[s.list,(expanded||searching)&&s.hiddenHistory]} accessibilityElementsHidden={expanded||searching} importantForAccessibility={expanded||searching?'no-hide-descendants':'auto'} onLayout={event=>{anchorViewport.current?.geometry();visibilityObserver?.invalidate();
      if(owner.current!==host||tailGeneration.current!==tailToken)return;
      const {width,height}=event.nativeEvent.layout;metrics.current.width=width;metrics.current.height=height;
      if([width,height,metrics.current.contentHeight].every(Number.isFinite)&&width>0&&height>0&&metrics.current.contentHeight>0)loadedEnd.current.geometry=tailToken;
      report({event:'viewport-layout',width,height});
      // onScroll may already have reported the new viewport size. A genuine
      // layout still needs its own measurement; retired follow stays retired.
      geometry();updateLoadedEnd();
    }}>
    {messageList}</View></StableMessageViewport>
    {showLoadedEnd&&!expanded&&!searching&&<View style={s.loadedEnd}><Pressable accessibilityRole="button" accessibilityLabel="Ir para o fim das mensagens carregadas" onPress={jumpLoadedEnd} style={s.button}><Text style={s.buttonText}>Ir para o fim</Text></Pressable></View>}
    {!readOnly&&active&&exitPrompt&&<View testID="draft-exit-prompt" style={s.exitPrompt}><Text accessibilityLiveRegion="polite" style={s.caption}>{exitPrompt.save?"O que deseja fazer com o rascunho?":"Descartar o rascunho desta conversa?"}</Text>{exitPrompt.save&&<Text style={s.caption}>O rascunho fica guardado enquanto você estiver nesta conta e o aplicativo permanecer aberto.</Text>}{draftSaveIssue===exitPrompt&&<Text accessibilityLiveRegion="polite" style={s.caption}>Não foi possível guardar. Continue escrevendo ou descarte para voltar.</Text>}<View style={s.exitActions}><Button elementRef={draftDecision} label="Continuar escrevendo" onPress={()=>{if(exitPrompt.cancel()&&Platform.OS==='web')requestAnimationFrame(()=>{if(owner.current===host&&host.snapshot().status==='active')composerInput.current?.focus();});}}/>{exitPrompt.save&&<Button label="Guardar rascunho e voltar" onPress={()=>{if(owner.current!==host||host.snapshot().status!=='active')return;if(!exitPrompt.save?.())setDraftSaveIssue(exitPrompt);}}/>}<Button label="Descartar rascunho e voltar" onPress={()=>{exitPrompt.discard();}}/></View></View>}
    {!readOnly&&active&&!covered&&!searching&&!exitPrompt&&pending.length>0&&<View testID="recent-pending-recovery" style={s.pendingDock}>{pending.map(entry=><PendingMessage key={entry.clientMessageId} host={host} entry={entry} disabled={v.sending||h.busy||!active}/>)}</View>}
    {!readOnly&&!draftError&&v.notice==='invalid-input'&&<Text accessibilityLiveRegion="polite" style={s.notice}>Revise a mensagem. Use até 2.000 caracteres.</Text>}
    {!readOnly&&v.notice==='capacity'&&<Text accessibilityLiveRegion="polite" style={s.notice}>Atualize as mensagens antes de continuar.</Text>}
    {!active&&<Text accessibilityLiveRegion="polite" style={s.notice}>Conversa indisponível. Volte e tente novamente.</Text>}
    {!readOnly&&<View style={[s.composer,expanded&&s.expandedComposer,searching&&s.hiddenHistory]} accessibilityElementsHidden={searching} importantForAccessibility={searching?"no-hide-descendants":"auto"}>
     {renderComposer&&active?renderComposer(composerControls):<>{composerControls.before}<View style={[s.composerRow,expanded&&s.expandedRow]}>{composerControls.input}{composerControls.send}</View>{composerControls.after}{active&&audioComposer}</>}
    </View>}
    {messageRemoval&&<MessageRemovalDialog controller={messageRemoval} onLeave={onBack}/>}
  </KeyboardAvoidingView>;
}
/** UI distance in React Native layout units, not unread/read or receipt state. */
function farFromLoadedEnd({offset,height,contentHeight}:{offset:number;height:number;contentHeight:number}){
 return [offset,height,contentHeight].every(Number.isFinite)&&height>0&&contentHeight>height&&Math.max(0,contentHeight-height)-Math.max(0,offset)>Math.max(96,height/4);
}
const webManualListStyle=Platform.OS==='web'?{overflowAnchor:'auto'} as unknown as import('react-native').ViewStyle:undefined;
const webListStyle=Platform.OS==='web'?{overflowAnchor:'none'} as unknown as import('react-native').ViewStyle:undefined;
const emptySelection=Object.freeze({phase:'idle' as const,selected:Object.freeze([])as readonly string[],canRemoveAll:false,busy:false,notice:null});
const emptySelectionSubscribe=()=>()=>{};const emptySelectionSnapshot=()=>emptySelection;
const emptyRows=Object.freeze([]);
const messageKey=(row:HistoryMessage)=>row.id;
const MessageBubble=React.memo(function MessageBubble({onSelect,selectionActive=false,selected=false,audioReady=true,receiptState,item,own,tailRef,onLayout,visibilityObserver,audioPlaybackFactory,imageMessageFactory}:{onSelect?:(id:string)=>void;selectionActive?:boolean;selected?:boolean;audioReady?:boolean;receiptState?:OwnMessageStatus['state'];imageMessageFactory?:ImageMessageFactory;audioPlaybackFactory?:AudioPlaybackFactory;visibilityObserver?:MessageVisibilityObserver;visibilityFactory?:(viewport:()=>View|null)=>MessageVisibilityObserver;item:HistoryMessage;own:boolean;tailRef?:React.RefCallback<View>;onLayout?:()=>void}){
 const measuredRef=useCallback((node:View|null)=>{tailRef?.(node);if(!own&&!item.removedScope&&!selectionActive)visibilityObserver?.attach(item.id,node);},[tailRef,own,visibilityObserver,item.id,item.removedScope,selectionActive]);
 const calendar=messageCalendar(item.acceptedAt);
 const content=<>{!own&&<Text style={s.author}>{item.senderRole==='staff'?'Equipe':'Cliente'}</Text>}{!item.removedScope&&!selectionActive&&item.kind==='audio'&&audioPlaybackFactory?<AudioMessagePlayback ready={audioReady} messageId={item.id} createPlayback={audioPlaybackFactory} onSelect={onSelect?()=>onSelect(item.id):undefined}/>:!item.removedScope&&!selectionActive&&item.kind==='image'&&imageMessageFactory?<PrivateImageMessage messageId={item.id} factory={imageMessageFactory} onSelect={onSelect?()=>onSelect(item.id):undefined}/>:<Text selectable={!onSelect} style={[s.body,item.removedScope&&s.removedBody]}>{item.removedScope?'Mensagem removida':item.kind==='audio'?(selectionActive?'Áudio':'Áudio indisponível para ouvir agora'):item.kind==='image'?(selectionActive?'Imagem':'Imagem indisponível para abrir agora'):item.text}</Text>}{!item.removedScope&&item.important&&<Text style={s.caption}>Mensagem importante</Text>}<View style={s.messageMeta}>{calendar&&<Text accessibilityLabel={calendar.accessible} style={s.timestamp}>{calendar.time}</Text>}{own&&!item.removedScope&&<SendState receiptState={receiptState} label="Enviada" detail="A mensagem foi salva. Isso não confirma entrega nem leitura." compact/>}</View>{selected&&<View pointerEvents="none" style={s.selectedOverlay}><View style={s.selectedMark}><ConnectIcon name="check" size={18} color="white"/></View></View>}</>;
 const root={collapsable:false as const,ref:measuredRef,onLayout:()=>{onLayout?.();visibilityObserver?.invalidate();},nativeID:'recent-anchor-'+item.sequence,testID:'recent-message-'+item.sequence,style:[s.card,own?s.ownBubble:s.otherBubble]};
 const selectionLabel=(own?'Sua mensagem':item.senderRole==='staff'?'Mensagem da equipe':'Mensagem do cliente')+': '+(item.removedScope?'Mensagem removida':item.kind==='audio'?'Áudio':item.kind==='image'?'Imagem':item.text.slice(0,160))+(calendar?' '+calendar.accessible:'');
 const keyboardSelection=Platform.OS==='web'&&onSelect?{onKeyDown:(event:{key:string;shiftKey:boolean;preventDefault:()=>void})=>{if(event.key==='ContextMenu'||event.key==='F10'&&event.shiftKey||!selectionActive&&event.key==='Enter'){event.preventDefault();onSelect(item.id);}}}:{};
 return onSelect?<Pressable {...root} {...keyboardSelection} accessible={selectionActive||!(item.kind==='audio'&&audioPlaybackFactory||item.kind==='image'&&imageMessageFactory)} accessibilityHint={Platform.OS==='web'?'Segure ou pressione Enter para selecionar.':'Segure para selecionar. A seleção também está nas ações de acessibilidade.'} delayLongPress={350} onLongPress={()=>onSelect(item.id)} onPress={()=>{if(selectionActive)onSelect(item.id);}} accessibilityRole={selectionActive?'checkbox':undefined} accessibilityLabel={selectionActive||item.kind!=='audio'?selectionLabel:undefined} accessibilityState={selectionActive?{checked:selected}:undefined} accessibilityActions={[{name:'select',label:'Selecionar mensagem'}]} onAccessibilityAction={e=>{if(e.nativeEvent.actionName==='select')onSelect(item.id);}}>{content}</Pressable>:<View {...root}>{content}</View>;
});
/** Recovery belongs to this immutable intent, never the editable composer. */
export function PendingMessage({host,entry,disabled=false}:{host:Host;entry:QueueEntry;disabled?:boolean}){
 const [showText,setShowText]=useState(false);
 const failure=entry.failure,label=failure?.acceptanceUncertain?'Envio não confirmado':failure?'Não enviada':entry.status==='sending'?'Enviando\u2026':'Aguardando envio';
 const action=failure?.acceptanceUncertain?'Verificar envio desta mensagem':failure?.retryable?'Tentar reenviar esta mensagem':'Atualizar conversa';
 const recover=()=>{
  if(disabled)return;const current=host.snapshot(),page=host.history.snapshot();
  if(current.status!=='active'||current.sending||page.busy||!current.pending.includes(entry)||!entry.failure)return;
  Keyboard.dismiss();if(entry.failure.acceptanceUncertain)void host.recoverPending();else if(entry.failure.retryable)void host.retry(entry.clientMessageId);else void host.refreshLatest();
 };
 const retrySame=()=>{
  if(disabled)return;const current=host.snapshot(),page=host.history.snapshot();
  if(current.status!=='active'||current.sending||page.busy||!current.pending.includes(entry)||current.retryableIntent!==entry.clientMessageId||!entry.failure?.retryable||!entry.failure.acceptanceUncertain)return;
  Keyboard.dismiss();void host.retry(entry.clientMessageId);
 };
 const canRetrySame=failure?.acceptanceUncertain===true&&failure.retryable===true&&host.snapshot().retryableIntent===entry.clientMessageId;
 const reveal=()=>{if(disabled)return;const current=host.snapshot();if(current.status!=='active'||!current.pending.includes(entry))return;Keyboard.dismiss();setShowText(value=>!value);};
 return <View style={s.pendingRecovery}>
  <>{!failure?<SendState label={label} detail="" sending live/>:<Text accessibilityLiveRegion="polite" style={s.sendStateText}>{label}</Text>}</>
  <Pressable accessibilityRole="button" accessibilityLabel={showText?'Recolher texto do envio pendente':'Ver texto completo do envio pendente'} accessibilityHint="Mostra a mensagem original sem enviar." accessibilityState={{expanded:showText,disabled}} aria-expanded={showText} disabled={disabled} onPress={reveal} style={s.pendingPreview}>
   <Text numberOfLines={1} style={showText?s.caption:s.body}>{showText?'Recolher texto':entry.text}</Text>
  </Pressable>
  {showText&&<ScrollView style={s.pendingText} keyboardShouldPersistTaps="handled" accessibilityLabel="Texto completo do envio pendente"><Text selectable style={s.body}>{entry.text}</Text></ScrollView>}
  <View style={s.pendingActions}>{failure&&<Button label={action} hint={failure.acceptanceUncertain?'Consulta este envio sem reenviar a mensagem.':undefined} disabled={disabled} onPress={recover}/>}{canRetrySame&&<Button label="Tentar novamente" hint="Repete a mensagem original. Seu rascunho fica separado." disabled={disabled} onPress={retrySame}/>}</View>
 </View>;
}
/** Generic details only: opening a status never sends, refreshes or marks read. */
export function SendState({receiptState,label,detail,live=false,compact=false,sending=false}:{audioReady?:boolean;receiptState?:OwnMessageStatus['state'];label:string;detail:string;live?:boolean;compact?:boolean;sending?:boolean}){
 const [expanded,setExpanded]=useState(false);
 // Accepted means persisted in Connect. A passive status never opens layout-changing details.
 if(sending)return <View accessible accessibilityRole="text" accessibilityLabel={label==='Aguardando envio'?label:'Enviando mensagem'} accessibilityLiveRegion={live?'polite':'none'} style={s.sendingIndicator}><ConnectIcon name="clock" size={18} color="#59665F"/></View>;
 if(label==='Enviada'&&compact&&(receiptState==='delivered'||receiptState==='read'))return <View accessible accessibilityRole="text" accessibilityLabel={receiptState==='read'?'Lida':'Entregue'} accessibilityLiveRegion={live?'polite':'none'} style={s.savedCheck}><ConnectIcon name="double-check" size={20} color={receiptState==='read'?'#1268B3':'#435E51'}/></View>;
 if(label==='Enviada')return <View accessible accessibilityRole="text" accessibilityLabel="Enviada. Salva no Connect." accessibilityLiveRegion={live?'polite':'none'} style={compact?s.savedCheck:s.savedLabel}>{compact?<ConnectIcon name="check" size={18} color="#435E51"/>:<Text style={s.sendStateText}>Enviada</Text>}</View>;
 return <View style={s.sendDetails}><Pressable accessibilityRole="button" accessibilityLabel={'Detalhes do envio: '+label} accessibilityHint={expanded?'Ocultar detalhes':'Mostrar detalhes'} accessibilityState={{expanded}} onPress={()=>setExpanded(previous=>!previous)} style={s.sendState}><Text accessibilityLiveRegion={live?'polite':'none'} style={s.sendStateText}>{compact?'✓':label}</Text></Pressable>{expanded&&<Text accessibilityLiveRegion="polite" style={s.caption}>{detail}</Text>}</View>;
}
/** Separator is outside the measured bubble: latest-follow still targets the message. */
export function ConversationMessageRow({onSelect,selectionActive,selected,audioReady=true,receiptState,item,previousAcceptedAt,own,tailRef,onLayout,visibilityObserver,audioPlaybackFactory,imageMessageFactory}:{onSelect?:(id:string)=>void;selectionActive?:boolean;selected?:boolean;audioReady?:boolean;receiptState?:OwnMessageStatus['state'];imageMessageFactory?:ImageMessageFactory;audioPlaybackFactory?:AudioPlaybackFactory;visibilityObserver?:MessageVisibilityObserver;visibilityFactory?:(viewport:()=>View|null)=>MessageVisibilityObserver;item:HistoryMessage;previousAcceptedAt?:number;own:boolean;tailRef?:React.RefCallback<View>;onLayout?:()=>void}){
 const heading=messageDayHeading(item.acceptedAt,previousAcceptedAt);
 return <>{heading&&<View style={s.dayHeading}><Text accessibilityRole="header" style={s.dayText}>{heading}</Text></View>}<MessageBubble onSelect={onSelect} selectionActive={selectionActive} selected={selected} audioReady={audioReady} receiptState={receiptState} imageMessageFactory={imageMessageFactory} audioPlaybackFactory={audioPlaybackFactory} visibilityObserver={visibilityObserver} item={item} own={own} tailRef={tailRef} onLayout={onLayout}/></>;
}

const s=StyleSheet.create({removedBody:{fontStyle:'italic',color:'#52675A'},selectedOverlay:{position:'absolute',top:0,right:0,bottom:0,left:0,borderWidth:2,borderColor:'#1A7453',borderRadius:16,backgroundColor:'rgba(26,116,83,.08)'},selectedMark:{position:'absolute',right:4,top:4,width:22,height:22,borderRadius:11,backgroundColor:'#1A7453',alignItems:'center',justifyContent:'center'},pendingDock:{borderTopWidth:1,borderTopColor:'#DCE6DE',backgroundColor:'#ECF4EB',paddingHorizontal:12,paddingVertical:8},pendingRecovery:{gap:4},pendingPreview:{minHeight:48,justifyContent:'center'},pendingText:{maxHeight:120},pendingActions:{flexDirection:'row',flexWrap:'wrap',gap:8},hiddenHistory:{display:'none'},expandedComposer:{flex:1,minHeight:0},expandedRow:{flex:1,minHeight:0},expandedInput:{maxHeight:undefined,height:'100%'},editorActions:{alignItems:'flex-end'},dayHeading:{alignItems:'center',paddingVertical:10},dayText:{fontSize:12,lineHeight:18,color:'#52675A',backgroundColor:'#E7F0E9',borderRadius:8,paddingHorizontal:10,paddingVertical:3},historyProgress:{paddingHorizontal:16,paddingVertical:4,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},exitPrompt:{padding:12,gap:8,backgroundColor:'#ECF4EB'},exitActions:{flexDirection:'row',flexWrap:'wrap',gap:8},
 sendingIndicator:{alignSelf:'flex-end',alignItems:'center',justifyContent:'center',minWidth:20,minHeight:20},savedCheck:{alignSelf:'center',alignItems:'center',justifyContent:'center',minWidth:20,minHeight:20,flexShrink:0},savedLabel:{alignSelf:'flex-end'},sendDetails:{alignSelf:'flex-end',maxWidth:'100%',minWidth:0,flexShrink:1},
 messageMeta:{flexDirection:'row',alignItems:'center',justifyContent:'flex-end',gap:4},
 sendState:{alignSelf:'flex-end',minHeight:48,minWidth:48,justifyContent:'center',paddingHorizontal:4},sendStateText:{fontSize:13,lineHeight:18,color:'#435E51'},
 loadedEnd:{alignItems:'center',paddingHorizontal:16,paddingVertical:4},
 newMessages:{paddingHorizontal:16,paddingVertical:8,gap:8,backgroundColor:'#E5F1E9'},
 page:{flex:1,backgroundColor:'#F5F9F6'},navigation:{minHeight:68,paddingHorizontal:8,paddingVertical:8,flexDirection:'row',alignItems:'center',gap:4,backgroundColor:'#FFFFFF',borderBottomWidth:1,borderBottomColor:'#DBE3DE'},heading:{flex:1,minWidth:0,gap:2},title:{fontSize:18,lineHeight:25,fontWeight:'700',color:'#18372C'},subtitle:{fontSize:13,lineHeight:20,color:'#59665F'},iconButton:{width:48,height:48,alignItems:'center',justifyContent:'center'},backIcon:{width:16,height:16,borderLeftWidth:2,borderBottomWidth:2,borderColor:'#185C45',transform:[{rotate:'45deg'}]},refreshIcon:{width:23,height:23,borderWidth:2,borderColor:'#185C45',borderTopColor:'transparent',borderRadius:12,transform:[{rotate:'-25deg'}]},refreshArrow:{position:'absolute',right:-3,top:-4,width:9,height:9,borderRightWidth:2,borderBottomWidth:2,borderColor:'#185C45',transform:[{rotate:'15deg'}]},
 list:{flex:1,minHeight:0},content:{padding:16,paddingBottom:20,gap:4},section:{gap:12,paddingVertical:6},card:{maxWidth:'88%',padding:12,borderRadius:16,gap:4,marginBottom:10},ownBubble:{alignSelf:'flex-end',backgroundColor:'#D8EDDA',borderBottomRightRadius:5},otherBubble:{alignSelf:'flex-start',backgroundColor:'#FFFFFF',borderWidth:1,borderColor:'#DCE6DF',borderBottomLeftRadius:5},author:{fontSize:13,lineHeight:20,fontWeight:'600',color:'#185C45'},body:{fontSize:17,lineHeight:25,color:'#18372C'},caption:{fontSize:14,lineHeight:22,color:'#435E51'},timestamp:{fontSize:12,lineHeight:18,color:'#59665F',alignSelf:'center'},notice:{paddingHorizontal:14,paddingVertical:8,fontSize:16,lineHeight:24,color:'#704B17'},
 composer:{padding:12,gap:4,borderTopWidth:1,borderTopColor:'#DBE3DE',backgroundColor:'white',flexShrink:0},composerRow:{flexDirection:'row',alignItems:'flex-end',gap:10},input:{flex:1,minWidth:0,minHeight:48,maxHeight:140,borderWidth:1,borderColor:'#B7C9BF',borderRadius:18,paddingHorizontal:14,paddingVertical:10,fontSize:17,lineHeight:25,color:'#18372C',backgroundColor:'white'},sendButton:{minWidth:48,minHeight:48,paddingHorizontal:12,borderRadius:24,backgroundColor:'#185C45',alignItems:'center',justifyContent:'center'},sendIcon:{width:0,height:0,borderTopWidth:9,borderBottomWidth:9,borderLeftWidth:18,borderTopColor:'transparent',borderBottomColor:'transparent',borderLeftColor:'white',marginLeft:3},retryText:{fontSize:14,lineHeight:20,color:'white',fontWeight:'600'},button:{minHeight:48,padding:12,borderRadius:12,backgroundColor:'#E5F1E9',justifyContent:'center'},buttonText:{fontSize:16,lineHeight:24,fontWeight:'600',color:'#185C45',flexShrink:1},disabled:{opacity:.5}
});

/** Results are read-only; no visibility observer or read receipt attaches here. */
export function LoadedMessageSearchView({rows,current,onClose,host}:{host?:Host;rows:readonly HistoryMessage[];current:()=>boolean;onClose:()=>void}){
 const [query,setQuery]=useState(''),results=useMemo(()=>searchLoadedMessages(rows,query),[rows,query]);
 const [selection,setSelection]=useState<{host:Host|undefined;query:string;id:string}|null>(null);
 const context=selection?.host===host&&selection?.query===query?loadedMessageContext(rows,query,selection.id):null;
 const expansion=useRef(0),term=useRef(query);term.current=query;
 const [progress,setProgress]=useState<string|null>(null),[expanding,setExpanding]=useState(false);
 useLayoutEffect(()=>()=>{expansion.current++;},[host]);
 const change=(value:string)=>{if(!current())return;expansion.current++;term.current=value;setExpanding(false);setProgress(null);setSelection(null);setQuery(value);};
 const close=()=>{if(current()){expansion.current++;onClose();}};
 const openContext=(id:string)=>{if(!current()||term.current!==query||!loadedMessageContext(rows,query,id))return;expansion.current++;setExpanding(false);setProgress(null);setSelection({host,query,id});};
 const leaveContext=()=>{if(current())setSelection(null);};
 const expand=async()=>{
  if(!host||expanding||!current()||!query.trim())return;
  const ticket=++expansion.current,captured=query;
  const live=()=>current()&&expansion.current===ticket&&term.current===captured&&host.snapshot().status==='active'&&!host.snapshot().sending&&!host.snapshot().pending.length;
  if(!live())return;setExpanding(true);setProgress('Procurando em mensagens anteriores…');
  const result=await searchOlderMessages({query:captured,current:live,page:host.history.snapshot,load:host.loadOlder});
  if(!live())return;setExpanding(false);
  setProgress(result.status==='failed'?'Não foi possível carregar mais mensagens.':result.status==='limit'?'Buscamos parte do histórico. Você pode procurar mais.':result.status==='end'?'Início do histórico carregado.':result.status==='matched'?'Resultados atualizados.':'Procura interrompida.');
 };
 const page=host?.history.snapshot(),canExpand=!!host&&page?.hasOlder===true&&!page.busy&&!host.snapshot().sending&&!host.snapshot().pending.length;

 return <View style={searchStyles.panel}><View style={searchStyles.top}><TextInput accessibilityLabel="Buscar nas mensagens carregadas" placeholder="Buscar nesta conversa" value={query} onChangeText={change} maxLength={80} autoCorrect={false} autoCapitalize="none" style={searchStyles.input}/><Pressable accessibilityRole="button" accessibilityLabel="Fechar busca de mensagens" onPress={close} style={searchStyles.button}><Text style={searchStyles.text}>Fechar</Text></Pressable></View>
 <Text style={searchStyles.hint}>Busque nas mensagens carregadas. Toque em um resultado para ver o contexto.</Text>
 <Text accessibilityLiveRegion="polite" style={searchStyles.hint}>{!query.trim()?'Digite um trecho da mensagem.':results.length?results.length+' resultado(s)':'Nenhuma mensagem encontrada neste trecho do histórico.'}</Text>
 {!context&&host&&query.trim()!==''&&<View>{progress&&<Text accessibilityLiveRegion="polite" style={searchStyles.hint}>{progress}</Text>}{expanding?<Pressable accessibilityRole="button" accessibilityLabel="Parar procura em mensagens anteriores" onPress={()=>{if(!current())return;expansion.current++;setExpanding(false);setProgress('Procura interrompida. O carregamento em andamento pode terminar.');}} style={searchStyles.button}><Text style={searchStyles.text}>Parar procura</Text></Pressable>:canExpand&&<Pressable accessibilityRole="button" accessibilityLabel="Procurar em mensagens anteriores" onPress={()=>{void expand();}} style={searchStyles.button}><Text style={searchStyles.text}>Procurar em mensagens anteriores</Text></Pressable>}</View>}
 {context&&selection?<View style={searchStyles.context}><View style={searchStyles.navigation}><Pressable accessibilityRole="button" accessibilityLabel="Voltar aos resultados da busca" onPress={leaveContext} style={searchStyles.button}><Text style={searchStyles.text}>Resultados</Text></Pressable><Text accessibilityRole="header" accessibilityLiveRegion="polite" style={searchStyles.hint}>Resultado {context.matchIndex+1} de {context.resultCount}</Text></View><View style={searchStyles.navigation}>{([{id:context.previousId,label:'Resultado anterior'},{id:context.nextId,label:'Próximo resultado'}] as const).map(action=><Pressable key={action.label} accessibilityRole="button" accessibilityLabel={action.label} accessibilityState={{disabled:!action.id}} disabled={!action.id} onPress={()=>{if(action.id)openContext(action.id);}} style={[searchStyles.button,!action.id&&s.disabled]}><Text style={searchStyles.hint}>{action.label}</Text></Pressable>)}</View><FlatList key={selection.id} data={context.messages} keyExtractor={item=>item.id} keyboardShouldPersistTaps="handled" ListHeaderComponent={<Text style={searchStyles.hint}>{context.hasBefore?'Há mensagens anteriores a este trecho.':'Início do trecho carregado.'}</Text>} ListFooterComponent={<Text style={searchStyles.hint}>{context.hasAfter?'Há mensagens posteriores a este trecho.':'Fim do trecho carregado.'}</Text>} renderItem={({item})=><View accessibilityLabel={item.id===selection.id?'Mensagem encontrada':undefined} style={[searchStyles.row,item.id===selection.id&&searchStyles.found]}><Text style={searchStyles.hint}>{item.senderRole==='staff'?'Equipe':'Cliente'}</Text><Text selectable style={searchStyles.text}>{item.text}</Text><Text style={searchStyles.hint}>{messageCalendar(item.acceptedAt)?.accessible}</Text></View>}/></View>:<FlatList data={results} keyExtractor={item=>item.id} keyboardShouldPersistTaps="handled" renderItem={({item})=><Pressable accessibilityRole="button" accessibilityLabel={'Ver contexto: '+item.text} onPress={()=>openContext(item.id)} style={searchStyles.row}><Text style={searchStyles.text}>{item.text}</Text><Text style={searchStyles.hint}>{messageCalendar(item.acceptedAt)?.accessible}</Text></Pressable>}/>}
 </View>;
}
const searchStyles=StyleSheet.create({panel:{flex:1,minHeight:0,padding:16,gap:10},top:{flexDirection:'row',gap:8},input:{flex:1,minWidth:0,minHeight:48,borderWidth:1,borderColor:'#9FABAA',borderRadius:12,padding:12,fontSize:18,color:'#18372C',backgroundColor:'white'},button:{minHeight:48,padding:12,justifyContent:'center'},text:{fontSize:18,lineHeight:27,color:'#18372C'},hint:{fontSize:14,lineHeight:21,color:'#435E51'},row:{minHeight:48,paddingVertical:12,borderBottomWidth:1,borderBottomColor:'#DBE3DE',gap:4},navigation:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:8},context:{flex:1,minHeight:0,gap:8},found:{backgroundColor:'#D8EDDA',borderLeftWidth:4,borderLeftColor:'#185C45',paddingHorizontal:12}});

/** Only mounted by the explicit audio gate; no download before pressing play. */
export function AudioMessagePlayback({ready=true,messageId,createPlayback,onSelect}:{ready?:boolean;messageId:string;createPlayback:AudioPlaybackFactory;onSelect?:()=>void}){
 const[controller,setController]=useState<ReturnType<AudioPlaybackFactory>|null>(null),[phase,setPhase]=useState('ready');
 const[progress,setProgress]=useState({durationMs:0,positionMs:0});
 useLayoutEffect(()=>{setController(null);if(!ready){setPhase('preparing');return;}let next:ReturnType<AudioPlaybackFactory>;try{next=createPlayback(messageId);}catch{setPhase('failed');return;}setController(next);const update=()=>setPhase(next.snapshot().phase);const stop=next.subscribe(update);update();return()=>{stop();next.close();};},[messageId,createPlayback,ready]);
 useLayoutEffect(()=>{let active=true;const update=()=>{const next=controller?.sample?.()??{durationMs:0,positionMs:0};if(active)setProgress(previous=>previous.durationMs===next.durationMs&&previous.positionMs===next.positionMs?previous:next);};update();const timer=phase==='playing'?setInterval(update,250):null;return()=>{active=false;if(timer!==null)clearInterval(timer);};},[controller,phase]);
 const busy=!ready||phase==='preparing'||phase==='loading'||phase==='stopping',disabled=!ready||!controller||['off','closed','blocked','loading','stopping'].includes(phase),label=phase==='playing'?'Parar áudio':phase==='failed'?'Tentar ouvir áudio':'Ouvir áudio';
 return <View style={{gap:6,minWidth:180,maxWidth:'100%'}}><View style={{flexDirection:'row',alignItems:'center',gap:10}}><AudioButton onSelect={onSelect} label={label} busyLabel={busy?(!ready||phase==='preparing'?'Preparando áudio':phase==='loading'?'Carregando áudio':'Encerrando áudio'):undefined} icon={phase==='playing'?'stop':'play'} iconOnly disabled={disabled} onPress={()=>{if(!controller)return;if(phase==='playing')return controller.pause();return controller.play();}}/><AudioProgress durationMs={progress.durationMs} positionMs={progress.positionMs}/></View><Text style={{fontSize:12,lineHeight:18,color:'#52675A'}}>Áudio</Text>{ready&&phase==='failed'&&<Text accessibilityLiveRegion="polite" style={{fontSize:14,lineHeight:22,color:'#94392E'}}>Não foi possível ouvir. Toque para tentar novamente.</Text>}{ready&&phase==='blocked'&&<Text accessibilityLiveRegion="polite" style={{fontSize:14,lineHeight:22,color:'#94392E'}}>Áudio indisponível. Volte à conversa e tente novamente.</Text>}</View>;
}