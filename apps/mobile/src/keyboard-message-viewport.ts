import{safelyMeasureView}from './safe-view-measurement.ts';
export type KeyboardViewport=Readonly<{top:number;height:number}>;
/** Coordinates use the same global layout units as measureInWindow/screenY.
 * A visible keyboard without a known frame cannot prove visible content. */
export function keyboardViewport(top:number,height:number,keyboard:Readonly<{visible:boolean;top:number|null}>):KeyboardViewport|null{
 if(!Number.isFinite(top)||!Number.isFinite(height)||height<=0||keyboard.visible&&(keyboard.top===null||!Number.isFinite(keyboard.top)||keyboard.top<0))return null;
 const start=Math.max(0,top),end=Math.min(top+height,keyboard.visible?keyboard.top!:Infinity);return end>start?Object.freeze({top:start,height:end-start}):null;
}
type Node={measureInWindow:(f:(x:number,y:number,w:number,h:number)=>void)=>void};
export function keyboardMessageViewport(viewport:()=>Node|null,keyboard:()=>Readonly<{visible:boolean;top:number|null}>){
 const proxy:Node={measureInWindow:done=>{const node=viewport();if(!node)return;safelyMeasureView(node,()=>viewport()===node,(x,y,w,h)=>{let visible:KeyboardViewport|null=null;try{visible=keyboardViewport(y,h,keyboard());}catch{}if(!visible){done(0,0,0,0);return;}done(x,visible.top,w,visible.height);});}};
 return()=>viewport()?proxy:null;
}
/** Captures end proximity BEFORE IME panning. Consumption is one-shot and
 * cannot follow an older reader, a different host, a drag or a stale event. */
export function createKeyboardLatestIntent(now:()=>number=Date.now){
 let ticket:{owner:object;at:number}|null=null;
 const pending=(owner:object)=>{const n=now();return !!ticket&&ticket.owner===owner&&Number.isFinite(n)&&n>=ticket.at&&n-ticket.at<=2000;};
 return Object.freeze({
  capture(owner:object,m:{offset:number;height:number;contentHeight:number},allowed:boolean){if(pending(owner))return true;ticket=null;const n=now();if(!allowed||!Number.isFinite(n)||![m.offset,m.height,m.contentHeight].every(Number.isFinite)||m.offset<0||m.height<=0||m.contentHeight<=0||m.contentHeight-m.height-m.offset>48)return false;ticket={owner,at:n};return true;},
  pending,consume(owner:object){const valid=pending(owner);ticket=null;return valid;},cancel(){ticket=null;}
 });
}

/** RN Web does not implement the native Keyboard metrics/isVisible methods. */
export function currentKeyboardFrame(platform:string,api:Readonly<{isVisible?:()=>boolean;metrics?:()=>Readonly<{screenY:number}>|undefined}>):Readonly<{visible:boolean;top:number|null}>{
 if(platform==='web')return Object.freeze({visible:false,top:null});
 try{const visible=api.isVisible?.();if(typeof visible!=='boolean')return Object.freeze({visible:true,top:null});return Object.freeze({visible,top:visible?api.metrics?.()?.screenY??null:null});}catch{return Object.freeze({visible:true,top:null});}
}
