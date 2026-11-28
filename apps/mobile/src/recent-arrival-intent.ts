import type{HistoryMessage}from'../../../packages/chat-client/src/text-history.ts';
export const RECENT_END_DISTANCE=96;
export function nearRecentEnd(m:Readonly<{offset:number;height:number;contentHeight:number}>){return[m.offset,m.height,m.contentHeight].every(Number.isFinite)&&m.height>0&&m.contentHeight>0&&Math.max(0,m.contentHeight-m.height-m.offset)<=RECENT_END_DISTANCE;}
/** Arrival classification precedes geometry updates. Receipts/edits/pagination
 * are not arrivals, and manual intent is never inferred from sender identity. */
export function createRecentArrivalIntent(){
 let owner:object|null=null,initialized=false,maximum=0,pending:string|null=null,presented=new Set<string>();
 return Object.freeze({observe(input:Readonly<{owner:object;ready:boolean;older:boolean;messages:readonly Pick<HistoryMessage,'id'|'sequence'>[];pendingId:string|null;presentedKeys?:readonly string[];nearEnd:boolean;moving:boolean}>):'entry'|'own-send'|'arrival'|null{
  if(owner!==input.owner){owner=input.owner;initialized=false;maximum=0;pending=null;presented=new Set();}
  const own=input.pendingId!==null&&input.pendingId!==pending;pending=input.pendingId;
  if(!input.ready)return own&&!input.older?'own-send':null;
  const max=input.messages.at(-1)?.sequence??0,entry=!initialized,arrived=initialized&&!input.older&&input.messages.some(message=>message.sequence>maximum&&!presented.has(message.id));initialized=true;maximum=Math.max(maximum,max);presented=new Set(input.presentedKeys??input.messages.map(message=>message.id));
  if(own&&!input.older)return'own-send';if(input.older||input.moving)return null;
  return entry?'entry':arrived&&input.nearEnd?'arrival':null;
 }});
}
