export const IMAGE_GESTURE_LIMITS=Object.freeze({minScale:1,maxScale:4});
export type ImageGestureSize=Readonly<{width:number;height:number}>;
export type ImageGestureLayout=Readonly<{viewport:ImageGestureSize;image:ImageGestureSize}>;
export type ImageGestureTouch=Readonly<{id:string|number;x:number;y:number}>;
export type ImageGestureSnapshot=Readonly<{scale:number;x:number;y:number;contentWidth:number;contentHeight:number}>;
type Geometry={width:number;height:number;contentWidth:number;contentHeight:number};
type Baseline={touches:readonly ImageGestureTouch[];scale:number;x:number;y:number};
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
const finite=(...values:number[])=>values.every(Number.isFinite);
function geometry(layout:ImageGestureLayout):Geometry|null{
 if(!layout?.viewport||!layout.image)return null;
 const {width,height}=layout.viewport,iw=layout.image.width,ih=layout.image.height;
 if(![width,height,iw,ih].every(v=>Number.isFinite(v)&&v>0&&v<=Number.MAX_SAFE_INTEGER))return null;
 const fit=Math.min(1,width/iw,height/ih),contentWidth=Math.min(width,iw*fit),contentHeight=Math.min(height,ih*fit);
 return finite(contentWidth,contentHeight)&&contentWidth>0&&contentHeight>0?{width,height,contentWidth,contentHeight}:null;
}
function points(input:readonly ImageGestureTouch[]):readonly ImageGestureTouch[]|null{
 if(!Array.isArray(input)||input.length>2)return null;
 const copy:ImageGestureTouch[]=[];
 for(const p of input){if(!p||!(typeof p.id==='string'?p.id.length>0&&p.id.length<=128:typeof p.id==='number'&&Number.isSafeInteger(p.id)&&p.id>=0)||!finite(p.x,p.y)||copy.some(t=>t.id===p.id))return null;copy.push({id:p.id,x:p.x,y:p.y});}
 copy.sort((a,b)=>{const x=a.id,y=b.id;if(typeof x==='number'&&typeof y==='number')return x-y;if(typeof x==='string'&&typeof y==='string')return x<y?-1:x>y?1:0;return typeof x==='number'?-1:1;});
 if(copy.length===2&&!Number.isFinite(distance(copy)))return null;
 return copy;
}
const distance=(touches:readonly ImageGestureTouch[])=>Math.hypot(touches[1]!.x-touches[0]!.x,touches[1]!.y-touches[0]!.y);
const midpoint=(touches:readonly ImageGestureTouch[])=>({x:touches[0]!.x/2+touches[1]!.x/2,y:touches[0]!.y/2+touches[1]!.y/2});

// Coordinates and translations are viewport pixels. Fit-contain never upscales
// the base image; explicit zoom may enlarge it. Fit dimensions are
// UNscaled: screen point = viewport center + translation + scale * image point.
// No source identifiers, files, native events, session state or side effects.
export function createImageGestures(layout:ImageGestureLayout){
 let g=geometry(layout);if(!g)throw Error('Image gesture unavailable');
 let view:ImageGestureSnapshot=Object.freeze({scale:1,x:0,y:0,contentWidth:g.contentWidth,contentHeight:g.contentHeight}),baseline:Baseline|null=null;
 function commit(scale:number,x:number,y:number){
  if(!finite(scale,x,y))return false;
  scale=clamp(scale,1,4);const bx=Math.max(0,(g!.contentWidth*scale-g!.width)/2),by=Math.max(0,(g!.contentHeight*scale-g!.height)/2);
  x=clamp(x,-bx,bx)||0;y=clamp(y,-by,by)||0;
  if(scale!==view.scale||x!==view.x||y!==view.y||g!.contentWidth!==view.contentWidth||g!.contentHeight!==view.contentHeight)view=Object.freeze({scale,x,y,contentWidth:g!.contentWidth,contentHeight:g!.contentHeight});
  return true;
 }
 function rebase(touches:readonly ImageGestureTouch[]){baseline=touches.length?{touches,scale:view.scale,x:view.x,y:view.y}:null;}
 function input(touches:readonly ImageGestureTouch[],rebaseOnly:boolean){
  const next=points(touches);if(!next){baseline=null;return false;}
  if(next.length===0){baseline=null;return true;}
  if(rebaseOnly||!baseline||next.length!==baseline.touches.length||next.some((p,i)=>p.id!==baseline!.touches[i]!.id)){rebase(next);return true;}
  const before=baseline;let scale=before.scale,x:number,y:number;
  if(next.length===1){x=before.x+next[0]!.x-before.touches[0]!.x;y=before.y+next[0]!.y-before.touches[0]!.y;}
  else{
   const priorDistance=distance(before.touches);if(priorDistance<1e-6){rebase(next);return true;}
   scale=clamp((distance(next)/priorDistance)*before.scale,1,4);
   const a=midpoint(before.touches),b=midpoint(next),anchorX=(a.x-g!.width/2-before.x)/before.scale,anchorY=(a.y-g!.height/2-before.y)/before.scale;
   x=b.x-g!.width/2-anchorX*scale;y=b.y-g!.height/2-anchorY*scale;
  }
  if(!commit(scale,x,y)){baseline=null;return false;}
  // Incremental rebasing removes a dead zone when reversing at a scale/pan cap.
  rebase(next);return true;
 }
 return Object.freeze({
  snapshot:()=>view,
  start:(touches:readonly ImageGestureTouch[])=>input(touches,true),
  move:(touches:readonly ImageGestureTouch[])=>input(touches,false),
  end:(touches:readonly ImageGestureTouch[]=[])=>input(touches,true),
  cancel:()=>{baseline=null;},
  reset:()=>{baseline=null;commit(1,0,0);},
  setScale:(scale:number)=>{baseline=null;if(!Number.isFinite(scale))return false;const next=clamp(scale,1,4),ratio=next/view.scale;return commit(next,view.x*ratio,view.y*ratio);},
  resize:(next:ImageGestureLayout)=>{baseline=null;const valid=geometry(next);if(!valid)return false;g=valid;return commit(view.scale,0,0);},
 });
}
