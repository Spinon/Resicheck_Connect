export const CHAT_END_DISTANCE=96; // Logical viewport units, not physical pixels.
type Reason='entry'|'own-send'|'messages'|'resize';
type Request={reason:Reason;target?:string;measured?:boolean;present?:boolean};
// Small presentation policy. No messages/content, URI, scrolling API or timers.
// current() captures one immutable conversation capability.
export function createChatScrollFollow(current:()=>boolean){
 let height=0,viewport=0,offset=0,nearEnd=true,dragging=false,momentum=false;
 let request:Request|null={reason:'entry'},count:number|null=null,lastId:string|undefined;
 // Constant-size acknowledgements: current tail plus one early native layout.
 let tailMeasured=false,earlyMeasured:string|undefined;
 const live=()=>{try{return current()===true;}catch{return false;}};
 const reading=()=>dragging||momentum;
 const updateNear=()=>{nearEnd=Math.max(0,height-viewport-offset)<=CHAT_END_DISTANCE;};
 function enqueue(reason:Reason,target?:string){
  if(!live()||reading())return false;
  if(!request||reason==='own-send'||reason==='messages'&&(request.reason==='messages'||request.reason==='resize'))request={reason,target,measured:target!==undefined&&(target===lastId&&tailMeasured||target===earlyMeasured),present:target===lastId};
  return true;
 }
 return Object.freeze({
  pending:()=>live()&&request!==null&&!reading(),
  content:(next:number)=>{
   if(!live()||!Number.isFinite(next)||next<0)return false;
   height=next;updateNear();return true;
  },
  layout:(next:number)=>{
   if(!live()||!Number.isFinite(next)||next<=0)return false;
   const followed=nearEnd,previous=viewport;viewport=next;updateNear();
   if(previous>0&&previous!==next&&followed)enqueue('resize');
   return true;
  },
  scroll:(nextOffset:number,nextViewport:number,nextHeight:number)=>{
   if(!live()||![nextOffset,nextViewport,nextHeight].every(Number.isFinite)||nextViewport<=0||nextHeight<0)return false;
   // Android may report the resized viewport here before onLayout. Capture
   // the reading intent before overwriting those metrics, in either order.
   const followed=nearEnd,previous=viewport;
   offset=Math.max(0,nextOffset);viewport=nextViewport;height=nextHeight;updateNear();
   if(previous>0&&previous!==nextViewport&&followed)enqueue('resize');
   return true;
  },
  drag:(active:boolean)=>{if(!live())return;dragging=active;if(active)request=null;},
  momentum:(active:boolean)=>{if(!live())return;momentum=active;if(active)request=null;},
  messages:(ids:readonly string[])=>{
   if(!live())return false;
   const appended=count!==null&&ids.length>count&&(count===0||ids[count-1]===lastId);
   const nextTail=ids.at(-1);
   if(nextTail!==lastId)tailMeasured=nextTail!==undefined&&nextTail===earlyMeasured;
   count=ids.length;lastId=nextTail;
   if(request?.target){request.present=ids.includes(request.target);if(request.target===lastId&&tailMeasured)request.measured=true;}
   // Status changes and media-footer updates are not message arrivals.
   const following=nearEnd||request?.reason==='resize'||request?.reason==='messages';
   return appended&&following&&lastId!==undefined?enqueue('messages',lastId):false;
  },
  ownSend:(targetId:string)=>typeof targetId==='string'&&targetId.length>0?enqueue('own-send',targetId):false,
  messageLayout:(id:string)=>{
   if(!live()||typeof id!=='string'||id.length===0)return false;
   earlyMeasured=id;
   if(id===lastId)tailMeasured=true;
   if(request?.target===id)request.measured=true;
   return true;
  },
  take:():Reason|null=>{
   if(!live()||reading()||!request||viewport<=0||height<=0||request.target!==undefined&&(!request.measured||!request.present))return null;
   const reason=request.reason;request=null;offset=Math.max(0,height-viewport);nearEnd=true;return reason;
  },
 });
}
