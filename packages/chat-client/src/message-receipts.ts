import{messagesReceivedCommand}from './message-delivery.ts';import{parseHistoryTimestamp}from './history-timestamp.ts';
export function messagesVisualizedCommand(co:string,cv:string,ids:readonly string[]){const base=messagesReceivedCommand(co,cv,ids);return Object.freeze({name:'mark_connect_messages_visualized_v1' as const,params:Object.freeze({...base.params,p_evidence:'viewport-v1' as const})});}
export function ownMessageStatusCommand(co:string,cv:string,ids:readonly string[]){return Object.freeze({name:'lookup_connect_own_message_status_v1' as const,params:messagesReceivedCommand(co,cv,ids).params});}
export type MessageReceiptCommand=ReturnType<typeof messagesReceivedCommand>|ReturnType<typeof messagesVisualizedCommand>|ReturnType<typeof ownMessageStatusCommand>;
export type MessageReceiptsRpc=(command:MessageReceiptCommand,signal:AbortSignal)=>Promise<Readonly<{data:unknown;error:null}|{data:null;error:Readonly<{code:string}>}>>;
const fail=()=>{throw Error('Message status unavailable');};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export function decodeMessagesVisualized(raw:unknown,co:string,cv:string,ids:readonly string[]){
 messagesVisualizedCommand(co,cv,ids);if(!object(raw)||Object.keys(raw).sort().join(',')!=='company_id,conversation_id,evidence_version,message_ids,newly_visualized'||raw.company_id!==co||raw.conversation_id!==cv||raw.evidence_version!=='viewport-v1'||!Array.isArray(raw.message_ids)||raw.message_ids.length!==ids.length||raw.message_ids.some((id,i)=>id!==ids[i])||!Number.isSafeInteger(raw.newly_visualized)||(raw.newly_visualized as number)<0||(raw.newly_visualized as number)>ids.length)return fail();
 return Object.freeze({messageIds:Object.freeze([...ids]),newlyVisualized:raw.newly_visualized as number});
}
export function decodeOwnMessageStatus(raw:unknown,co:string,cv:string,ids:readonly string[]){
 ownMessageStatusCommand(co,cv,ids);if(!object(raw)||Object.keys(raw).sort().join(',')!=='company_id,conversation_id,items'||raw.company_id!==co||raw.conversation_id!==cv||!Array.isArray(raw.items)||raw.items.length!==ids.length)return fail();
 return Object.freeze(raw.items.map((v,i)=>{if(!object(v)||Object.keys(v).sort().join(',')!=='message_id,received_at,visualized_at'||v.message_id!==ids[i])return fail();const timestamp=(x:unknown)=>x===null?null:typeof x==='string'?parseHistoryTimestamp(x):null;
 const received=timestamp(v.received_at),visualized=timestamp(v.visualized_at);if(v.received_at!==null&&received===null||v.visualized_at!==null&&visualized===null||visualized!==null&&(received===null||visualized<received))return fail();
 return Object.freeze({messageId:ids[i],receivedAt:received,visualizedAt:visualized,state:visualized!==null?'read' as const:received!==null?'delivered' as const:'server' as const});}));
}
