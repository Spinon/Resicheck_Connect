import{ConnectIcon}from'./ConnectIcon.tsx';
import{ safelyMeasureView }from './safe-view-measurement.ts';
import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {AppState,Image,PanResponder,Pressable,StyleSheet,Text,View,useWindowDimensions} from 'react-native';
import type {GestureResponderEvent,PanResponderGestureState} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {LocalImagePreview} from './local-image.ts';
import {createImageGestures} from './image-gestures.ts';
import {useMediaPrivacy} from './MediaPrivacy.tsx';
import {MediaWindow} from './MediaWindow.tsx';

export function ImageAction({label,onPress,disabled=false,onSelect}:{label:string;onPress:()=>void;disabled?:boolean;onSelect?:()=>void}){
 const privacy=useMediaPrivacy();
 return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled}} disabled={disabled} {...(onSelect?{delayLongPress:350,onLongPress:()=>{if(!disabled&&privacy.allowed())onSelect();},accessibilityActions:[{name:"select",label:"Selecionar mensagem de imagem"}],onAccessibilityAction:(e:{nativeEvent:{actionName:string}})=>{if(e.nativeEvent.actionName==="select"&&!disabled&&privacy.allowed())onSelect();}}:{})} onPress={()=>{if(!disabled&&privacy.allowed())onPress();}} style={[s.button,disabled&&{opacity:.4}]}><Text style={s.buttonText}>{label}</Text></Pressable>;
}
// Caller must unmount this view synchronously when its conversation capability
// is revoked. No URI or private path is ever rendered as text.
export function LocalImagePreviewView({preview,label='Ampliar imagem local',thumbnailMaxHeight=260,published=false,onSelect,compact=false,onUnavailable,viewerUri}:{viewerUri?:()=>Promise<string|null>;onUnavailable?:()=>void;compact?:boolean;preview:LocalImagePreview;label?:string;thumbnailMaxHeight?:number;published?:boolean;onSelect?:()=>void}){
 const privacy=useMediaPrivacy();
 const [openUri,setOpenUri]=useState<string|null>(null),[failedUri,setFailedUri]=useState<string|null>(null),[touching,setTouching]=useState(false),[geometryReady,setGeometryReady]=useState(false),window=useWindowDimensions();
 // Identity gates the native modal during render, before URI-change effects.
 const open=openUri===preview.uri&&privacy.view.mediaVisible,failed=failedUri===preview.uri;
 const model=useRef<ReturnType<typeof createImageGestures>|null>(null);
 if(!model.current)model.current=createImageGestures({viewport:{width:1,height:1},image:{width:1,height:1}});
 const [transform,setTransform]=useState(()=>model.current!.snapshot());
 const viewport=useRef<View|null>(null),viewportSize=useRef({width:1,height:1});
 const origin=useRef<{x:number;y:number}|null>(null),gestureOrigin=useRef<{x:number;y:number}|null>(null);
 const gestureEpoch=useRef<number|null>(null),responderId=useRef<number|null>(null);
 const epoch=useRef(0),measurement=useRef(0),mounted=useRef(true),isOpen=useRef(false),foreground=useRef(AppState.currentState==='active');
 const identity=useRef(preview.uri),imageSize=useRef({width:preview.width??1,height:preview.height??1});
 identity.current=preview.uri;imageSize.current={width:preview.width??1,height:preview.height??1};isOpen.current=open;
 const publish=useCallback(()=>{if(mounted.current)setTransform(model.current!.snapshot());},[]);
 const cancelGesture=useCallback(()=>{model.current!.cancel();gestureOrigin.current=null;gestureEpoch.current=null;responderId.current=null;if(mounted.current)setTouching(false);},[]);
 const reset=useCallback((scale:number)=>{cancelGesture();model.current!.reset();model.current!.setScale(scale);publish();},[cancelGesture,publish]);
 const invalidateGeometry=useCallback(()=>{epoch.current++;measurement.current++;origin.current=null;cancelGesture();if(mounted.current)setGeometryReady(false);},[cancelGesture]);
 const close=useCallback(()=>{isOpen.current=false;invalidateGeometry();reset(1);if(mounted.current)setOpenUri(null);},[invalidateGeometry,reset]);
 useEffect(()=>{if(!privacy.view.mediaVisible)close();},[privacy.view.mediaVisible,close]);
 const measureViewport=useCallback(()=>{
  if(!isOpen.current||!mounted.current)return;
  const version=epoch.current,request=++measurement.current,uri=identity.current;
  safelyMeasureView(viewport.current,()=>mounted.current&&isOpen.current&&epoch.current===version&&measurement.current===request&&identity.current===uri,(x,y,width,height)=>{
   if(!mounted.current||!isOpen.current||epoch.current!==version||measurement.current!==request||identity.current!==uri||![x,y,width,height].every(Number.isFinite)||width<=0||height<=0)return;
   // Page coordinates stay independent of the transformed Image. Freeze this
   // measured origin for each gesture; layout changes cancel/rebase the gesture.
   cancelGesture();if(!model.current!.resize({viewport:{width,height},image:imageSize.current}))return;
   viewportSize.current={width,height};origin.current={x,y};publish();setGeometryReady(true);
  });
 },[cancelGesture,publish]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;isOpen.current=false;epoch.current++;measurement.current++;model.current!.cancel();};},[]);
 useEffect(()=>{close();setFailedUri(null);},[preview.uri,preview.mime,preview.width,preview.height,close]);
 useEffect(()=>{
  // Android Modal uses a focused Dialog; Activity blur alone is not background.
  const change=AppState.addEventListener('change',state=>{foreground.current=state==='active';if(state!=='active')close();});
  return()=>{change.remove();};
 },[close]);
 useEffect(()=>{if(isOpen.current){invalidateGeometry();reset(1);measureViewport();}},[window.width,window.height,window.fontScale,invalidateGeometry,reset,measureViewport]);
 const canGesture=useCallback(()=>mounted.current&&isOpen.current&&foreground.current&&origin.current!==null,[]);
 const responder=useMemo(()=>{
  const touches=(event:GestureResponderEvent)=>{
   const at=gestureOrigin.current;
   return at?event.nativeEvent.touches.map(touch=>({id:touch.identifier,x:touch.pageX-at.x,y:touch.pageY-at.y})):[];
  };
  const matching=(state:PanResponderGestureState)=>canGesture()&&gestureOrigin.current!==null&&gestureEpoch.current===epoch.current&&responderId.current===state.stateID;
  const start=(event:GestureResponderEvent,state:PanResponderGestureState)=>{if(!canGesture())return;if(!matching(state)){gestureOrigin.current={...origin.current!};gestureEpoch.current=epoch.current;responderId.current=state.stateID;}if(model.current!.start(touches(event)))setTouching(true);publish();};
  return PanResponder.create({
   onStartShouldSetPanResponder:()=>canGesture(),onMoveShouldSetPanResponder:()=>canGesture(),
   onPanResponderGrant:start,onPanResponderStart:start,
   onPanResponderMove:(event,state)=>{if(matching(state)){model.current!.move(touches(event));publish();}},
   onPanResponderEnd:(event,state)=>{if(matching(state)){model.current!.end(touches(event));publish();}},
   onPanResponderRelease:(_event,state)=>{if(matching(state)){model.current!.end([]);gestureOrigin.current=null;gestureEpoch.current=null;responderId.current=null;setTouching(false);publish();}},
   onPanResponderTerminate:(_event,state)=>{if(matching(state)){cancelGesture();publish();}},onPanResponderTerminationRequest:()=>!canGesture(),onShouldBlockNativeResponder:()=>true,
  });
 },[canGesture,cancelGesture,publish]);
 const changeZoom=useCallback((delta:number)=>{if(!isOpen.current||!foreground.current||!origin.current)return;cancelGesture();model.current!.setScale(model.current!.snapshot().scale+delta);publish();},[cancelGesture,publish]);
 const adjustImage=useCallback(()=>{if(!isOpen.current||!foreground.current||!origin.current)return;reset(1);},[reset]);
 const moveImage=useCallback((horizontal:number,vertical:number)=>{
  if(!isOpen.current||!foreground.current||!origin.current)return;cancelGesture();
  const {width,height}=viewportSize.current,start={id:'accessibility-pan',x:width/2,y:height/2};
  model.current!.start([start]);model.current!.move([{...start,x:start.x+horizontal*width*0.2,y:start.y+vertical*height*0.2}]);model.current!.end([]);publish();
 },[cancelGesture,publish]);
 const fail=useCallback((uri:string)=>{if(!mounted.current||identity.current!==uri)return;close();if(published&&onUnavailable){onUnavailable();return;}setFailedUri(uri);},[close,published,onUnavailable]);
 const [expandedSource,setExpandedSource]=useState<string|null>(null);
 const show=async()=>{
  const allowed=()=>privacy.allowed()&&mounted.current&&foreground.current&&identity.current===preview.uri&&!failed;
  if(!allowed())return;
  const uri=viewerUri?await viewerUri():preview.uri;
  if(!uri||!allowed())return;
  setExpandedSource(uri);invalidateGeometry();reset(1);isOpen.current=true;setOpenUri(preview.uri);
 };
 const width=Math.min(published&&compact?260:300,Math.max(100,window.width-88)),ratio=preview.width&&preview.height?preview.height/preview.width:1;
 const thumbnailLimit=Number.isFinite(thumbnailMaxHeight)&&thumbnailMaxHeight>=96&&thumbnailMaxHeight<=400?thumbnailMaxHeight:260;
 // The composer already reserves this frame. Center its contained image and
 // overlay in that same box, including wide images, without resizing on progress.
 const thumbnailHeight=compact?(published?220:thumbnailLimit):Math.min(thumbnailLimit,width*ratio);
 // Give Android one fixed layout target at the explicit 4x zoom ceiling. A
 // fit-size decode followed only by GPU scaling can blur document text. This
 // target does not change per pinch or restore detail absent from the source.
 const decodeWidth=transform.contentWidth*4,decodeHeight=transform.contentHeight*4;
 const zoomLabel=Math.abs(transform.scale-Math.round(transform.scale))<0.001?String(Math.round(transform.scale)):transform.scale.toFixed(1).replace('.',',');
 if(failed)return <Text accessibilityRole="alert">A prévia não está disponível. Selecione o arquivo de origem novamente.</Text>;
 if(preview.mime==='application/pdf')return <Text>Documento original. PDF não é regravado; prévia PDF indisponível.</Text>;
 if(!preview.width||!preview.height)return <Text>Original preservado. Prévia indisponível para esta resolução.</Text>;
 return <View style={s.preview}>{!compact&&<ImageAction label={label} onPress={show} onSelect={onSelect}/>}<Pressable accessibilityRole="button" accessibilityLabel={label} onPress={show} delayLongPress={onSelect?350:undefined} onLongPress={onSelect}><Image fadeDuration={published&&compact?0:undefined} key={'thumbnail-'+preview.uri} onError={()=>fail(preview.uri)} accessibilityLabel={published?"Imagem da conversa":"Imagem local, não enviada"} source={{uri:preview.uri}} resizeMode="contain" style={{width,height:thumbnailHeight}}/></Pressable>
 <MediaWindow priority={20} key={'modal-'+preview.uri} visible={open} onShow={measureViewport} onClose={close}><SafeAreaView style={s.screen} onAccessibilityEscape={close}>
  <View style={s.controls}><Pressable accessibilityRole="button" accessibilityLabel="Fechar imagem ampliada" onPress={close} style={s.viewerAction}><ConnectIcon name="back" color="white"/></Pressable><View style={{flex:1}}/>{([{label:'Menos zoom',action:()=>changeZoom(-1),glyph:'−'},{label:'Mais zoom',action:()=>changeZoom(1),glyph:'+'},{label:'Ajustar imagem',action:adjustImage,glyph:'↺'}]).map(button=><Pressable key={button.label} accessibilityRole="button" accessibilityLabel={button.label} onPress={button.action} disabled={!geometryReady} style={s.viewerAction}><Text style={{color:'white',fontSize:24}}>{button.glyph}</Text></Pressable>)}</View>
  <View ref={viewport} testID="image-preview-viewport" collapsable={false} accessible accessibilityRole="adjustable" accessibilityLabel="Imagem ampliada para conferência" accessibilityHint="Use os botões de zoom ou as ações de acessibilidade para mover a imagem em quatro direções e ajustar a imagem inteira." accessibilityValue={{min:1,max:4,now:transform.scale,text:'Zoom '+zoomLabel+' vezes'}} accessibilityActions={[{name:'increment',label:'Mais zoom'},{name:'decrement',label:'Menos zoom'},{name:'moveLeft',label:'Mover imagem para a esquerda'},{name:'moveRight',label:'Mover imagem para a direita'},{name:'moveUp',label:'Mover imagem para cima'},{name:'moveDown',label:'Mover imagem para baixo'},{name:'fitImage',label:'Ajustar imagem inteira e centralizar'},{name:'escape',label:'Fechar imagem ampliada'}]} onAccessibilityAction={event=>{const action=event.nativeEvent.actionName;if(action==='increment')changeZoom(1);else if(action==='decrement')changeZoom(-1);else if(action==='moveLeft')moveImage(-1,0);else if(action==='moveRight')moveImage(1,0);else if(action==='moveUp')moveImage(0,-1);else if(action==='moveDown')moveImage(0,1);else if(action==='fitImage')adjustImage();else if(action==='escape')close();}} onAccessibilityEscape={close} style={s.viewport} onLayout={()=>{if(isOpen.current){invalidateGeometry();measureViewport();}}} {...responder.panHandlers}>
   {geometryReady&&<View pointerEvents="none" accessible={false} importantForAccessibility="no" style={{position:'absolute',width:decodeWidth,height:decodeHeight,left:(viewportSize.current.width-decodeWidth)/2,top:(viewportSize.current.height-decodeHeight)/2,transform:[{translateX:transform.x},{translateY:transform.y}]}}><Image key={'expanded-'+preview.uri} onError={()=>fail(preview.uri)} accessible={false} importantForAccessibility="no" source={{uri:expandedSource??preview.uri}} resizeMode="contain" resizeMethod="resize" style={{width:decodeWidth,height:decodeHeight,transform:[{scale:transform.scale/4}]}}/></View>}
  </View>
 </SafeAreaView></MediaWindow></View>;
}
const s=StyleSheet.create({preview:{gap:10,alignItems:'flex-start'},screen:{flex:1,backgroundColor:'#101813'},controls:{padding:6,gap:2,flexDirection:'row',alignItems:'center'},viewerAction:{width:48,height:48,alignItems:'center',justifyContent:'center'},viewport:{flex:1,minHeight:96,overflow:'hidden',backgroundColor:'#FFFFFF'},row:{flexDirection:'row',flexWrap:'wrap',gap:8},button:{minHeight:48,padding:12,borderRadius:10,backgroundColor:'#17644B',justifyContent:'center'},buttonText:{fontSize:16,color:'white'}});
