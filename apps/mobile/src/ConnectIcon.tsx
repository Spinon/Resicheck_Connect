import React from 'react';
import {View} from 'react-native';
export type ConnectIconName='file'|'image'|'company'|'chat'|'team'|'user'|'arrow'|'back'|'search'|'plus'|'refresh'|'check'|'double-check'|'clock'|'mic'|'send'|'play'|'pause'|'stop'|'trash';
type Props={name:ConnectIconName;color?:string;size?:number};
const width=1.8;
/** Small native outline vocabulary. Decorative shapes, never a font glyph or
 * remote asset; the enclosing control supplies its accessible label. */
export function ConnectIcon({name,color='#526A5B',size=24}:Props){
 if(!Number.isFinite(size)||size<12||size>64)throw Error('Icon unavailable');
 const line=(key:string,x1:number,y1:number,x2:number,y2:number)=>{
  const length=Math.hypot(x2-x1,y2-y1),angle=Math.atan2(y2-y1,x2-x1)*180/Math.PI;
  return <View key={key} style={{position:'absolute',left:(x1+x2-length)/2,top:(y1+y2-width)/2,width:length,height:width,borderRadius:width/2,backgroundColor:color,transform:[{rotate:angle+'deg'}]}}/>;
 };
 const circle=(key:string,left:number,top:number,diameter:number)=><View key={key} style={{position:'absolute',left,top,width:diameter,height:diameter,borderWidth:width,borderColor:color,borderRadius:diameter/2}}/>;
 const shoulders=(key:string,left:number,top:number,w:number,h:number)=><View key={key} style={{position:'absolute',left,top,width:w,height:h,borderWidth:width,borderBottomWidth:0,borderColor:color,borderTopLeftRadius:w/2,borderTopRightRadius:w/2}}/>;
 let shapes:React.ReactNode;
 switch(name){
  case 'file':shapes=<>{line('left',5,3,5,21)}{line('top',5,3,14,3)}{line('fold-top',14,3,20,9)}{line('right',20,9,20,21)}{line('bottom',20,21,5,21)}{line('fold-left',14,3,14,9)}{line('fold-bottom',14,9,20,9)}{line('text-a',8,13,17,13)}{line('text-b',8,17,17,17)}</>;break;
  case 'image':shapes=<><View style={{position:'absolute',left:3,top:3,width:18,height:18,borderWidth:width,borderColor:color,borderRadius:3}}/>{circle('sun',6,6,4)}{line('mountain-a',5,18,11,11)}{line('mountain-b',11,11,16,17)}{line('mountain-c',15,16,19,12)}</>;break;
  case 'company':shapes=<><View style={{position:'absolute',left:5,top:3,width:14,height:18,borderWidth:width,borderColor:color,borderRadius:2}}/>{line('base',3,21,21,21)}{line('door-l',10,21,10,16)}{line('door-t',10,16,14,16)}{line('door-r',14,16,14,21)}{[7,11].flatMap(y=>[9,15].map(x=>line(x+':'+y,x-.5,y,x+.5,y)))}</>;break;
  case 'chat':shapes=<><View style={{position:'absolute',left:3,top:4,width:18,height:13,borderWidth:width,borderColor:color,borderRadius:4}}/>{line('tail-l',7,17,5,21)}{line('tail-r',5,21,12,17)}{line('text-a',7,9,17,9)}{line('text-b',7,12,14,12)}</>;break;
  case 'user':shapes=<>{circle('head',8,3,8)}{shoulders('body',4,14,16,7)}</>;break;
  case 'team':shapes=<>{circle('head-l',3,4,6)}{circle('head-r',15,4,6)}{circle('head-center',8,8,8)}{shoulders('body-l',1,12,7,6)}{shoulders('body-r',16,12,7,6)}{shoulders('body-center',5,18,14,5)}</>;break;
  case 'arrow':shapes=<>{line('shaft',4,12,20,12)}{line('upper',14,6,20,12)}{line('lower',14,18,20,12)}</>;break;
  case 'back':shapes=<>{line('shaft',4,12,20,12)}{line('upper',4,12,10,6)}{line('lower',4,12,10,18)}</>;break;
  case 'search':shapes=<>{circle('lens',3,3,13)}{line('handle',14.5,14.5,21,21)}</>;break;
  case 'refresh':shapes=<><View style={{position:'absolute',left:3,top:3,width:18,height:18,borderWidth:width,borderColor:color,borderTopColor:'transparent',borderRadius:9,transform:[{rotate:'105deg'}]}}/>{line('arrow-v',20,2,20,8)}{line('arrow-h',14,8,20,8)}</>;break;
  case 'clock':shapes=<>{circle('face',3,3,18)}{line('hour',12,7,12,12)}{line('minute',12,12,16,14)}</>;break;
  case 'double-check':shapes=<>{line('short-a',2,12,7,17)}{line('long-a',7,17,17,6)}{line('short-b',10,14,13,17)}{line('long-b',13,17,23,6)}</>;break;
  case 'check':shapes=<>{line('short',5,12,10,17)}{line('long',10,17,20,6)}</>;break;
  case 'plus':shapes=<>{line('vertical',12,4,12,20)}{line('horizontal',4,12,20,12)}</>;break;
  case 'mic':shapes=<><View style={{position:'absolute',left:9,top:2,width:6,height:13,borderWidth:width,borderColor:color,borderRadius:4}}/><View style={{position:'absolute',left:5,top:8,width:14,height:11,borderWidth:width,borderTopWidth:0,borderColor:color,borderBottomLeftRadius:8,borderBottomRightRadius:8}}/>{line('stem',12,19,12,22)}{line('base',8,22,16,22)}</>;break;
  case 'send':shapes=<>{line('upper',3,3,22,12)}{line('lower',22,12,3,21)}{line('tail-up',3,3,7,12)}{line('tail-down',7,12,3,21)}{line('middle',7,12,22,12)}</>;break;
  case 'play':shapes=<View style={{position:'absolute',left:7,top:4,width:0,height:0,borderTopWidth:8,borderBottomWidth:8,borderLeftWidth:13,borderTopColor:'transparent',borderBottomColor:'transparent',borderLeftColor:color}}/>;break;
  case 'pause':shapes=<>{[7,15].map(left=><View key={left} style={{position:'absolute',left,top:4,width:3,height:16,borderRadius:1,backgroundColor:color}}/>)}</>;break;
  case 'stop':shapes=<View style={{position:'absolute',left:5,top:5,width:14,height:14,borderRadius:2,backgroundColor:color}}/>;break;
  case 'trash':shapes=<><View style={{position:'absolute',left:6,top:7,width:12,height:14,borderWidth:width,borderColor:color,borderBottomLeftRadius:2,borderBottomRightRadius:2}}/>{line('lid',3,6,21,6)}{line('handle',9,3,15,3)}{line('bar-a',10,10,10,17)}{line('bar-b',14,10,14,17)}</>;break;
  default:throw Error('Icon unavailable');
 }
 return <View accessible={false} importantForAccessibility="no-hide-descendants" pointerEvents="none" style={{width:size,height:size,alignItems:'center',justifyContent:'center'}}><View style={{width:24,height:24,transform:[{scale:size/24}]}}>{shapes}</View></View>;
}
