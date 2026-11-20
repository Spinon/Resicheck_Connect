import type{RecentScrollObservation}from './recent-scroll-observation.ts';
import React from'react';
import{Platform,type View}from'react-native';
type Rect={top:number;bottom:number;height:number};
type Element={id?:string;children?:Iterable<Element>;isConnected?:boolean;scrollHeight:number;clientHeight:number;scrollTop:number;getBoundingClientRect:()=>Rect};
type Props={observe?:(event:RecentScrollObservation)=>void;owner:object;messages:readonly object[];preserve:boolean;intent:()=>object;manual:()=>boolean;scroll:(offset:number)=>void;viewport:()=>View|null;children:React.ReactNode};
type Anchor={id:string;top:number};type Snapshot={scroll:Element;anchors:Anchor[];intent:object;messages:readonly object[];owner:object}|null;
/** Capture before commit, then preserve a surviving visible row after layout.
 * RN 0.86 exposes read-only host geometry; only FlatList's public scroll method
 * writes a native offset. Bounded frames retire on another data/intent/context.
 * This is presentation, never an authorization or message-visibility proof. */
export class StableMessageViewport extends React.Component<Props,Record<string,never>,Snapshot>{
 private emit(event:RecentScrollObservation){try{this.props.observe?.(event);}catch{}}
 private frame:number|null=null;private expiry:ReturnType<typeof setTimeout>|null=null;private pending:Snapshot=null;private corrections=0;private removeGestures=()=>{};
 private stop(){if(this.frame!==null)cancelAnimationFrame(this.frame);this.frame=null;if(this.expiry!==null)clearTimeout(this.expiry);this.expiry=null;this.pending=null;}
 componentDidMount(){if(Platform.OS!=='web')return;const node=this.props.viewport() as unknown as HTMLElement|null;if(!node?.addEventListener)return;const cancel=()=>this.stop(),events=['wheel','pointerdown','touchstart','keydown'];events.forEach(name=>node.addEventListener(name,cancel,{capture:true,passive:true}));this.removeGestures=()=>events.forEach(name=>node.removeEventListener(name,cancel,true));}
 geometry(){if(!this.pending||this.frame!==null)return;this.frame=requestAnimationFrame(()=>{this.frame=null;this.correct();});}
 private correct(){const snapshot=this.pending;if(!snapshot)return;if(!this.props.manual()||this.props.owner!==snapshot.owner||this.props.messages!==snapshot.messages||this.props.intent()!==snapshot.intent){this.stop();return;}
  try{const all=this.elements(),scroll=all.find(n=>typeof n.getBoundingClientRect==='function'&&n.scrollHeight>n.clientHeight+2);if(!scroll||scroll.isConnected===false)return;
   for(const saved of snapshot.anchors){const row=all.find(n=>n.id===saved.id);if(!row)continue;const delta=row.getBoundingClientRect().top-saved.top;this.emit({event:'anchor',anchor:true,delta,attempt:this.corrections+1,offset:scroll.scrollTop,targetTop:saved.top});
    if(Number.isFinite(delta)&&Math.abs(delta)>.5&&this.corrections<8){const offset=Math.max(0,Math.min(scroll.scrollHeight-scroll.clientHeight,scroll.scrollTop+delta));if(Platform.OS==='web')scroll.scrollTop=offset;else this.props.scroll(offset);this.corrections++;this.geometry();}break;}
  }catch{this.stop();}
 }
 private elements(){const root=this.props.viewport() as unknown as Element|null;if(!root)return[];const all:Element[]=[],pending=[root];while(pending.length&&all.length<4096){const n=pending.shift()!;all.push(n);if(n.children)pending.push(...n.children);}return all;}
 getSnapshotBeforeUpdate(previous:Props):Snapshot{
  if(!this.props.preserve||previous.owner!==this.props.owner||previous.messages===this.props.messages)return null;
  try{const all=this.elements(),scroll=all.find(n=>typeof n.getBoundingClientRect==='function'&&n.scrollHeight>n.clientHeight+2);if(!scroll){this.emit({event:'anchor',anchor:false,reason:'missing-scroll'});return null;}
   const bounds=scroll.getBoundingClientRect(),anchors=all.filter(n=>/^recent-anchor-[0-9]+$/.test(n.id??'')).map(n=>{const rect=n.getBoundingClientRect();return{id:n.id!,top:rect.top,bottom:rect.bottom};}).filter(n=>n.bottom>bounds.top&&n.top<bounds.bottom).map(n=>({id:n.id,top:n.top}));
   this.emit({event:'anchor',anchor:anchors.length>0,...(anchors.length?{targetTop:anchors[0].top,offset:scroll.scrollTop,height:scroll.clientHeight}:{reason:'missing-anchor' as const})});
   return anchors.length?{scroll,anchors,intent:this.props.intent(),messages:this.props.messages,owner:this.props.owner}:null;
  }catch{return null;}
 }
 componentDidUpdate(_previous:Props,_state:Record<string,never>,snapshot:Snapshot){
  if(!snapshot)return;this.stop();this.pending=snapshot;this.corrections=0;
  // Virtualized cells can settle after the React commit. React/native geometry
  // events trigger correction; no continuous loop or unbounded retry is used.
  this.expiry=setTimeout(()=>this.stop(),1500);this.geometry();
 }
 componentWillUnmount(){this.stop();this.removeGestures();}
 render(){return this.props.children;}
}
