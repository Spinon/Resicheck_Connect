import type{HistoryMessage}from '../../../packages/chat-client/src/text-history.ts';
const key=(v:string)=>v.normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('pt-BR').trim();
/** Only the authorized host's currently loaded window. No fetch/cache or hidden data. */
export function searchLoadedMessages(rows:readonly HistoryMessage[],query:string):readonly HistoryMessage[]{
 if(typeof query!=='string'||query.length>80||rows.length>10000)return [];
 const term=key(query);if(!term)return [];
 return rows.filter(row=>row.kind==='text'&&key(row.text).includes(term));
}

/** A bounded excerpt from the same loaded, authorized window. No fetch or receipt. */
export function loadedMessageContext(rows:readonly HistoryMessage[],query:string,messageId:string){
 const matches=searchLoadedMessages(rows,query),matchIndex=matches.findIndex(row=>row.id===messageId);
 if(matchIndex<0)return null;
 const index=rows.findIndex(row=>row.id===messageId),start=Math.max(0,index-2),end=Math.min(rows.length,index+3);
 return Object.freeze({messages:rows.slice(start,end),matchIndex,resultCount:matches.length,previousId:matches[matchIndex-1]?.id??null,nextId:matches[matchIndex+1]?.id??null,hasBefore:start>0,hasAfter:end<rows.length});
}
