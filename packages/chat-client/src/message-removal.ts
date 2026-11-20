export type MessageRemovalScope='self'|'all';
export type MessageRemovalContext=Readonly<{companyId:string;conversationId:string}>;
export type MessageRemovalReceipt=MessageRemovalContext&Readonly<{operationId:string;scope:MessageRemovalScope;messageIds:readonly string[];revision:string}>;
export type MessageRemovalChange=Readonly<{messageId:string;scope:MessageRemovalScope}>;
export type MessageRemovalChanges=MessageRemovalContext&Readonly<{through:string;latest:string;hasMore:boolean;items:readonly MessageRemovalChange[]}>;
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v),object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v),fail=()=>Error('Message action unavailable');
const exact=(v:Record<string,unknown>,keys:readonly string[])=>Reflect.ownKeys(v).length===keys.length&&Reflect.ownKeys(v).every(k=>typeof k==='string'&&keys.includes(k));
export const removalRevision=(v:unknown):v is string=>typeof v==='string'&&/^(0|[1-9][0-9]{0,18})$/.test(v)&&BigInt(v)<=9223372036854775807n;
export function removalMessageIds(ids:readonly string[]){if(!Array.isArray(ids)||ids.length<1||ids.length>50||ids.some(v=>!uuid(v))||new Set(ids).size!==ids.length)throw fail();return Object.freeze([...ids].sort());}
const context=(c:MessageRemovalContext)=>{if(!uuid(c.companyId)||!uuid(c.conversationId))throw fail();};
export function removeMessagesCommand(c:MessageRemovalContext,operationId:string,scope:MessageRemovalScope,ids:readonly string[]){context(c);if(!uuid(operationId)||!['self','all'].includes(scope))throw fail();return Object.freeze({name:'remove_connect_messages_v1' as const,params:Object.freeze({p_company:c.companyId,p_conversation:c.conversationId,p_operation:operationId,p_scope:scope,p_messages:removalMessageIds(ids)})});}
export function lookupRemovalCommand(c:MessageRemovalContext,operationId:string){context(c);if(!uuid(operationId))throw fail();return Object.freeze({name:'lookup_connect_message_removal_v1' as const,params:Object.freeze({p_company:c.companyId,p_conversation:c.conversationId,p_operation:operationId})});}
export function removalChangesCommand(c:MessageRemovalContext,after:string,limit=100){context(c);if(!removalRevision(after)||!Number.isInteger(limit)||limit<1||limit>100)throw fail();return Object.freeze({name:'connect_message_removal_changes_v1' as const,params:Object.freeze({p_company:c.companyId,p_conversation:c.conversationId,p_after:after,p_limit:limit})});}
export type MessageRemovalCommand=ReturnType<typeof removeMessagesCommand>|ReturnType<typeof lookupRemovalCommand>|ReturnType<typeof removalChangesCommand>;
/** Capture every caller field before the first await; no live params object
 * is allowed to change conversation while its access probe is in flight. */
export function canonicalRemovalCommand(raw:MessageRemovalCommand):MessageRemovalCommand{
 if(!object(raw)||!exact(raw,['name','params']))throw fail();const name=raw.name,p:Record<string,unknown>=raw.params;if(!object(p))throw fail();
 const companyId=p.p_company,conversationId=p.p_conversation;if(!uuid(companyId)||!uuid(conversationId))throw fail();const c={companyId,conversationId};
 switch(name){
  case'remove_connect_messages_v1':if(!exact(p,['p_company','p_conversation','p_operation','p_scope','p_messages']))throw fail();return removeMessagesCommand(c,p.p_operation as string,p.p_scope as MessageRemovalScope,p.p_messages as readonly string[]);
  case'lookup_connect_message_removal_v1':if(!exact(p,['p_company','p_conversation','p_operation']))throw fail();return lookupRemovalCommand(c,p.p_operation as string);
  case'connect_message_removal_changes_v1':if(!exact(p,['p_company','p_conversation','p_after','p_limit']))throw fail();return removalChangesCommand(c,p.p_after as string,p.p_limit as number);
  default:throw fail();
 }
}
export type MessageRemovalRpc=(command:MessageRemovalCommand,signal:AbortSignal)=>Promise<unknown>;
export function decodeRemovalReceipt(raw:unknown,command:ReturnType<typeof removeMessagesCommand>):MessageRemovalReceipt{
 if(!object(raw)||!exact(raw,['companyId','conversationId','operationId','scope','messageIds','revision']))throw fail();const{companyId,conversationId,operationId,scope,messageIds,revision}=raw,p=command.params;
 if(companyId!==p.p_company||conversationId!==p.p_conversation||operationId!==p.p_operation||scope!==p.p_scope||!Array.isArray(messageIds)||!removalRevision(revision)||revision==='0')throw fail();const ids=removalMessageIds(messageIds);if(ids.some((id,i)=>id!==p.p_messages[i])||ids.length!==p.p_messages.length||messageIds.some((id,i)=>id!==ids[i]))throw fail();
 return Object.freeze({companyId,conversationId,operationId,scope:scope as MessageRemovalScope,messageIds:ids,revision});
}
export function decodeRemovalLookup(raw:unknown,command:ReturnType<typeof removeMessagesCommand>){if(!object(raw))throw fail();if(exact(raw,['state'])&&raw.state==='not_observed')return null;if(exact(raw,['state','receipt'])&&raw.state==='accepted')return decodeRemovalReceipt(raw.receipt,command);throw fail();}
export function decodeRemovalChanges(raw:unknown,command:ReturnType<typeof removalChangesCommand>):MessageRemovalChanges{
 if(!object(raw)||!exact(raw,['companyId','conversationId','through','latest','hasMore','items']))throw fail();const{companyId,conversationId,through,latest,hasMore,items}=raw,p=command.params;
 if(companyId!==p.p_company||conversationId!==p.p_conversation||!removalRevision(through)||!removalRevision(latest)||BigInt(through)<BigInt(p.p_after)||BigInt(through)>BigInt(latest)||typeof hasMore!=='boolean'||hasMore!==(BigInt(through)<BigInt(latest))||hasMore&&through===p.p_after||!Array.isArray(items)||items.length>p.p_limit*50)throw fail();
 const seen=new Set<string>(),rows=items.map(v=>{if(!object(v)||!exact(v,['messageId','scope'])||!uuid(v.messageId)||!['self','all'].includes(v.scope as string)||seen.has(v.messageId))throw fail();seen.add(v.messageId);return Object.freeze({messageId:v.messageId,scope:v.scope as MessageRemovalScope});});
 if((through===p.p_after)!==(rows.length===0))throw fail();return Object.freeze({companyId,conversationId,through,latest,hasMore,items:Object.freeze(rows)});
}
