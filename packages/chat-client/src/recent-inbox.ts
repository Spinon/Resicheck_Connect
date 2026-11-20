import {parseHistoryTimestamp} from './history-timestamp.ts';
export type InboxMessage=Readonly<{id:string;sequence:number;acceptedAt:string;senderRole:'staff'|'patient';preview:string;truncated:boolean}>;
export type InboxCursor=Readonly<{companyId:string;conversationId:string;acceptedAt:string|null;queryKey?:string}>;
export type RecentInboxRow=Readonly<{companyId:string;conversationId:string;patientId:string;displayName:string;latestMessage:InboxMessage|null}>;
const uuid=(x:unknown):x is string=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(x);
const obj=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const timestamp=(x:unknown):x is string=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(x)&&parseHistoryTimestamp(x)!==null;
function text(x:unknown,max:number):x is string{if(typeof x!=='string'||!x.trim()||[...x].length>max||/[\u0000-\u001f\u007f]/.test(x))return false;for(let i=0;i<x.length;i++){const c=x.charCodeAt(i);if(c>=0xd800&&c<=0xdbff){const low=x.charCodeAt(++i);if(!(low>=0xdc00&&low<=0xdfff))return false;}else if(c>=0xdc00&&c<=0xdfff)return false;}return true;}
const invalid=()=>{throw Error('Inbox unavailable');};
export function recentInboxParams(p:Record<string,unknown>){
 if(!uuid(p.p_company)||(p.p_after_id!==null&&!uuid(p.p_after_id))||(p.p_after_at!==null&&!timestamp(p.p_after_at))||(p.p_after_id===null&&p.p_after_at!==null))return invalid();
 return Object.freeze({p_company:p.p_company,p_after_at:p.p_after_at as string|null,p_after_id:p.p_after_id as string|null});
}
export function inboxCursor(row:RecentInboxRow):InboxCursor{return Object.freeze({companyId:row.companyId,conversationId:row.conversationId,acceptedAt:row.latestMessage?.acceptedAt??null});}
/** Exact microsecond wire timestamps retained; Date milliseconds are display-only. */
export function compareInboxCursor(a:InboxCursor,b:InboxCursor):number{
 const x=a.acceptedAt??'',y=b.acceptedAt??'';return x===y?(a.conversationId===b.conversationId?0:a.conversationId>b.conversationId?-1:1):x>y?-1:1;
}
export function recentInboxCommand(companyId:string,after:InboxCursor|null){
 if(after!==null&&(!obj(after)||after.queryKey!==undefined||after.companyId!==companyId||!uuid(after.conversationId)||(after.acceptedAt!==null&&!timestamp(after.acceptedAt))))return invalid();
 return Object.freeze({name:'connect_staff_inbox_recent',params:recentInboxParams({p_company:companyId,p_after_at:after?.acceptedAt??null,p_after_id:after?.conversationId??null})});
}
export function decodeRecentInbox(raw:unknown,companyId:string,after:InboxCursor|null){
 recentInboxCommand(companyId,after);
 if(!obj(raw)||!Array.isArray(raw.items)||raw.items.length>10||typeof raw.has_more!=='boolean')return invalid();
 const seen=new Set<string>(),items:RecentInboxRow[]=[];let previous=after;
 for(const v of raw.items){
  if(!obj(v)||v.company_id!==companyId||!uuid(v.conversation_id)||!uuid(v.patient_id)||!text(v.display_name,120)||seen.has(v.conversation_id))return invalid();
  seen.add(v.conversation_id);let latestMessage:InboxMessage|null=null;
  // Legacy image summaries have no textual body: SQL returns both preview and truncated null.
  // Map only that exact presentation pair; it supplies no authority or media access.
  if(v.last_message!==null){const m=v.last_message;if(!obj(m))return invalid();const imagePlaceholder=m.preview===null&&m.truncated===null;const preview=imagePlaceholder?'Imagem':m.preview,truncated=imagePlaceholder?false:m.truncated;if(!uuid(m.id)||!Number.isSafeInteger(m.sequence)||(m.sequence as number)<1||!timestamp(m.accepted_at)||!['staff','patient'].includes(m.sender_role as string)||!text(preview,240)||typeof truncated!=='boolean')return invalid();latestMessage=Object.freeze({id:m.id,sequence:m.sequence as number,acceptedAt:m.accepted_at,senderRole:m.sender_role as 'staff'|'patient',preview,truncated});}
  const row=Object.freeze({companyId,conversationId:v.conversation_id,patientId:v.patient_id,displayName:v.display_name,latestMessage}),cursor=inboxCursor(row);
  if(previous&&compareInboxCursor(previous,cursor)>=0)return invalid();previous=cursor;items.push(row);
 }
 let nextCursor:InboxCursor|null=null;
 if(raw.has_more){const c=raw.next_cursor;if(items.length!==10||!obj(c))return invalid();nextCursor=Object.freeze({companyId,conversationId:c.conversation_id as string,acceptedAt:c.accepted_at as string|null});const expected=inboxCursor(items.at(-1)!);if(nextCursor.conversationId!==expected.conversationId||nextCursor.acceptedAt!==expected.acceptedAt)return invalid();}else if(raw.next_cursor!==null)return invalid();
 return Object.freeze({items:Object.freeze(items),hasMore:raw.has_more,nextCursor});
}
