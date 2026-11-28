import type{HistoryMessage}from'../../../packages/chat-client/src/text-history.ts';
import type{QueueEntry}from'../../../packages/chat-client/src/text-send-queue.ts';
import type{RecentProvisionalMessage}from'../../../packages/chat-client/src/recent-conversation.ts';
export type ConversationTimelineRow=Readonly<{key:string;message:HistoryMessage|null;pending:QueueEntry|null;receipt:RecentProvisionalMessage|null}>;
export type TextTimelineOwnership=Readonly<{aliases:readonly Readonly<{messageId:string;clientMessageId:string}>[];afterSequence:number|null}>;
/** Presentation only. Never deduplicate by equal bodies or invented delivery. */
export function createConversationTimeline(){
 let previous:readonly ConversationTimelineRow[]=Object.freeze([]);
 return Object.freeze({project(input:Readonly<{messages:readonly HistoryMessage[];pending:readonly QueueEntry[];provisional:readonly RecentProvisionalMessage[];userId?:string;ownership?:TextTimelineOwnership}>){
  const aliases=new Map(input.ownership?.aliases.map(a=>[a.messageId,a.clientMessageId])),pending=new Map(input.pending.map(p=>[p.clientMessageId,p])),used=new Set<string>(),known=new Set(input.messages.map(m=>m.id)),rows:ConversationTimelineRow[]=[],old=new Map(previous.map(r=>[r.key,r]));
  function add(key:string,message:HistoryMessage|null,entry:QueueEntry|null,receipt:RecentProvisionalMessage|null){const cached=old.get(key);rows.push(cached&&cached.message===message&&cached.pending===entry&&cached.receipt===receipt?cached:Object.freeze({key,message,pending:entry,receipt}));if(entry)used.add(entry.clientMessageId);}
  for(const message of input.messages){
   const client=aliases.get(message.id),after=input.ownership?.afterSequence;
   const unresolved=input.pending.some(entry=>entry.status==='sending'||entry.failure?.acceptanceUncertain===true);
   // A sync can beat the send response. Until a scoped own receipt binds the
   // ID, defer ambiguous NEW own text; retain the immutable local bubble.
   // Other senders/media and pre-intent history are never deferred.
   if(!client&&unresolved&&typeof after==='number'&&message.senderId===input.userId&&message.kind==='text'&&message.sequence>after)continue;
   add(client?'own-text:'+client:'message:'+message.id,message,client?pending.get(client)??null:null,null);
  }
  for(const receipt of input.provisional){if(known.has(receipt.id))continue;const client=aliases.get(receipt.id);add(client?'own-text:'+client:'message:'+receipt.id,null,client?pending.get(client)??null:null,receipt);}
  rows.sort((a,b)=>(a.message?.sequence??a.receipt?.sequence??Infinity)-(b.message?.sequence??b.receipt?.sequence??Infinity));
  for(const entry of input.pending)if(!used.has(entry.clientMessageId))add('own-text:'+entry.clientMessageId,null,entry,null);
  if(rows.length===previous.length&&rows.every((r,i)=>r===previous[i]))return previous;
  previous=Object.freeze(rows);return previous;
 }});
}
export function timelineAcceptedAt(row:ConversationTimelineRow|undefined){return row?.message?.acceptedAt??row?.receipt?.acceptedAt;}
