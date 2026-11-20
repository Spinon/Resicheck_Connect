import {companySearchKey} from './company-search-key.ts';
import {recentInboxParams,recentInboxCommand,decodeRecentInbox,type InboxCursor} from './recent-inbox.ts';
export function inboxSearchParams(p:Record<string,unknown>){
 const base=recentInboxParams(p),query=p.p_query;
 if(typeof query!=='string'||[...query].length>80||[...query.trim()].length<2||[...companySearchKey(query.trim())].length<2||/[\u0000-\u001f\u007f]/.test(query)||/[\ud800-\udfff]/u.test(query))throw Error('Inbox search unavailable');
 return Object.freeze({...base,p_query:query.trim()});
}
export function inboxSearchCommand(companyId:string,query:string,after:InboxCursor|null){
 const key=typeof query==='string'?companySearchKey(query.trim()):'';
 if(after!==null&&after.queryKey!==key)throw Error('Inbox search unavailable');
 const clean=after===null?null:{companyId:after.companyId,conversationId:after.conversationId,acceptedAt:after.acceptedAt};
 const base=recentInboxCommand(companyId,clean);
 return Object.freeze({name:'connect_staff_inbox_search',params:inboxSearchParams({...base.params,p_query:query})});
}
export function decodeInboxSearch(raw:unknown,companyId:string,query:string,after:InboxCursor|null){
 inboxSearchCommand(companyId,query,after);
 const clean=after===null?null:{companyId:after.companyId,conversationId:after.conversationId,acceptedAt:after.acceptedAt};
 const page=decodeRecentInbox(raw,companyId,clean);
 return Object.freeze({...page,nextCursor:page.nextCursor===null?null:Object.freeze({...page.nextCursor,queryKey:companySearchKey(query.trim())})});
}
