const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const fail=()=>{throw Error('Unread state unavailable');};
export function unreadCountsParams(p:Record<string,unknown>){
 if(!uuid(p.p_company)||typeof p.p_conversations!=='string'||p.p_conversations.length>500)return fail();
 const ids:unknown=JSON.parse(p.p_conversations);
 if(!Array.isArray(ids)||ids.length<1||ids.length>10||!ids.every(uuid)||new Set(ids).size!==ids.length)return fail();
 return Object.freeze({p_company:p.p_company,p_conversations:JSON.stringify(ids)});
}
export function unreadCountsCommand(companyId:string,ids:readonly string[]){return Object.freeze({name:'connect_unread_counts',params:unreadCountsParams({p_company:companyId,p_conversations:JSON.stringify(ids)})});}
export function decodeUnreadCounts(raw:unknown,companyId:string,ids:readonly string[]){
 unreadCountsCommand(companyId,ids);
 if(!obj(raw)||!Array.isArray(raw.items)||raw.items.length!==ids.length)return fail();
 return Object.freeze(raw.items.map((v,i)=>{if(!obj(v)||v.company_id!==companyId||v.conversation_id!==ids[i]||!Number.isSafeInteger(v.unread_count)||(v.unread_count as number)<0)return fail();return Object.freeze({conversationId:ids[i],unreadCount:v.unread_count as number});}));
}
export function markInboxReadParams(p:Record<string,unknown>){
 if(!uuid(p.p_company)||!uuid(p.p_conversation)||!uuid(p.p_message)||typeof p.p_through!=='string'||!String(p.p_through).match(/^[1-9][0-9]{0,15}$/)||!Number.isSafeInteger(Number(p.p_through)))return fail();
 return Object.freeze({p_company:p.p_company,p_conversation:p.p_conversation,p_message:p.p_message,p_through:p.p_through});
}
export function decodeMarkedRead(raw:unknown,companyId:string,conversationId:string,through:number){
 if(!obj(raw)||raw.company_id!==companyId||raw.conversation_id!==conversationId||!Number.isSafeInteger(raw.through_sequence)||(raw.through_sequence as number)<through)return fail();
 return Object.freeze({throughSequence:raw.through_sequence as number});
}
