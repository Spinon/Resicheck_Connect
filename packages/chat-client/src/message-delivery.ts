const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
const fail=()=>{throw Error('Delivery receipt unavailable');};
/** Exact recipient ACK protocol. Does not collect, send or imply visual reading. */
export function messagesReceivedCommand(companyId:string,conversationId:string,ids:readonly string[]){
 if(!uuid(companyId)||!uuid(conversationId)||!Array.isArray(ids)||ids.length<1||ids.length>25||ids.some(id=>!uuid(id))||new Set(ids).size!==ids.length)return fail();
 return Object.freeze({name:'mark_connect_messages_received_v1' as const,params:Object.freeze({p_company:companyId,p_conversation:conversationId,p_messages:JSON.stringify(ids)})});
}
export function decodeMessagesReceived(raw:unknown,companyId:string,conversationId:string,ids:readonly string[]){
 messagesReceivedCommand(companyId,conversationId,ids);if(!raw||typeof raw!=='object'||Array.isArray(raw))return fail();const v=raw as Record<string,unknown>;
 if(Object.keys(v).sort().join(',')!=='company_id,conversation_id,message_ids,newly_received'||v.company_id!==companyId||v.conversation_id!==conversationId||!Array.isArray(v.message_ids)||v.message_ids.length!==ids.length||v.message_ids.some((id,i)=>id!==ids[i])||!Number.isSafeInteger(v.newly_received)||(v.newly_received as number)<0||(v.newly_received as number)>ids.length)return fail();
 return Object.freeze({messageIds:Object.freeze([...ids]),newlyReceived:v.newly_received as number});
}
