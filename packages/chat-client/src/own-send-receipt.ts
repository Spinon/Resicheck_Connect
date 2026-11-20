import{parseHistoryTimestamp}from './history-timestamp.ts';
import type{SendContext}from './text-send-queue.ts';
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
const fail=()=>{throw Error('Receipt lookup unavailable');};
export function ownReceiptCommand(context:SendContext,id:string){if(!uuid(context.userId)||!uuid(context.companyId)||!uuid(context.conversationId)||!context.sessionKey||!/^[A-Za-z0-9_-]{1,80}$/.test(id))return fail();return Object.freeze({name:'lookup_connect_own_send_receipt_v1' as const,params:Object.freeze({p_company:context.companyId,p_conversation:context.conversationId,p_client_id:id})});}
export type OwnReceiptRpc=(command:ReturnType<typeof ownReceiptCommand>,signal:AbortSignal)=>Promise<Readonly<{data:unknown;error:null}|{data:null;error:Readonly<{code:string}>}>>;
export function decodeOwnReceipt(raw:unknown,context:SendContext,id:string){
 ownReceiptCommand(context,id);if(!raw||typeof raw!=='object'||Array.isArray(raw))return fail();const v=raw as Record<string,unknown>;
 if(v.sender_id!==context.userId||v.company_id!==context.companyId||v.conversation_id!==context.conversationId||v.client_message_id!==id)return fail();
 if(v.state==='not_observed'){if(Object.hasOwn(v,'receipt'))return fail();return Object.freeze({state:'not_observed' as const});}
 if(v.state!=='accepted'||!v.receipt||typeof v.receipt!=='object'||Array.isArray(v.receipt))return fail();const row=v.receipt as Record<string,unknown>,sequence=typeof row.sequence==='string'&&/^[1-9][0-9]{0,15}$/.test(row.sequence)?Number(row.sequence):row.sequence,at=typeof row.accepted_at==='string'?parseHistoryTimestamp(row.accepted_at):null;
 if(!uuid(row.id)||!Number.isSafeInteger(sequence)||(sequence as number)<1||at===null)return fail();return Object.freeze({state:'accepted' as const,receipt:Object.freeze({id:row.id,sequence:sequence as number,acceptedAt:at})});
}
