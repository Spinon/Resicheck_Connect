import{decodeRemovalChanges,removalChangesCommand,type MessageRemovalRpc,type MessageRemovalContext,type MessageRemovalChange,type MessageRemovalReceipt}from'../../../packages/chat-client/src/message-removal.ts';
import{REMOVED_MESSAGE_TEXT}from'../../../packages/chat-client/src/message-content.ts';
import type{RecentHistoryPage,RecentHistoryRead}from'../../../packages/chat-client/src/recent-history-read.ts';
/** A cache is never presented before a fresh authorized removal scan. Cursor is
 * scoped to this live conversation only; opening again replays the bounded feed.
 * Receipt revisions never advance it: another actor's intervening op must not be skipped. */
export function createMessageRemovalSync(input:Readonly<{context:MessageRemovalContext;rpc:MessageRemovalRpc;current:()=>boolean;purgeMedia:(items:readonly MessageRemovalChange[])=>Promise<void>;apply:(items:readonly MessageRemovalChange[])=>void}>){
 const masks=new Map<string,'self'|'all'>();let closed=false,started=false,cursor='0',flight:Promise<void>|null=null;const abort=new AbortController();
 const live=()=>{try{return!closed&&!abort.signal.aborted&&input.current()===true;}catch{return false;}},fail=()=>Error('Conversation unavailable');
 function mark(items:readonly MessageRemovalChange[]){if(!live())throw fail();for(const item of items){const old=masks.get(item.messageId);if(old!=='all')masks.set(item.messageId,item.scope);}if(masks.size>20000)throw fail();if(items.length)input.apply(items);}
 function project(page:RecentHistoryPage){
  if(!live()||!started)throw fail();
  let changed=false;
  const items=page.items.map(row=>{
   const scope=masks.get(row.id);
   const next=scope?{...row,kind:'text' as const,body:REMOVED_MESSAGE_TEXT,important:false,removed_scope:scope}
                   :{...row,removed_scope:row.removed_scope??null};
   if(next.removed_scope!==row.removed_scope||next.kind!==row.kind||
      next.body!==row.body||next.important!==row.important)changed=true;
   return Object.freeze(next);
  });
  return {page:Object.freeze({...page,items:Object.freeze(items)}),changed};
 }
 const protect=(page:RecentHistoryPage):RecentHistoryPage=>project(page).page;
 async function scan(){
  for(let pages=0;pages<200;pages++){
   if(!live())throw fail();const command=removalChangesCommand(input.context,cursor),raw=await input.rpc(command,abort.signal);
   if(!live())throw fail();const next=decodeRemovalChanges(raw,command);mark(next.items);
   // Purge before releasing any new cache/presentation barrier. The cache port
   // must fence writes already in flight; this does not touch drafts/outgoing media.
   if(next.items.length){await input.purgeMedia(next.items);if(!live())throw fail();}
   cursor=next.through;if(!next.hasMore){started=true;return;}
  }throw fail();
 }
 function poll(){if(!live())return Promise.reject(fail());if(flight)return flight;const work=scan();flight=work;void work.finally(()=>{if(flight===work)flight=null;}).catch(()=>{});return work;}
 async function applyReceipt(receipt:MessageRemovalReceipt){
  if(!live()||receipt.companyId!==input.context.companyId||receipt.conversationId!==input.context.conversationId)throw fail();
  const items=receipt.messageIds.map(messageId=>({messageId,scope:receipt.scope}));mark(items);
  await input.purgeMedia(items);if(!live())throw fail();await poll();
 }
 const wrapRead=(read:RecentHistoryRead):RecentHistoryRead=>async(request,signal)=>{
  if(!started)await poll();if(signal?.aborted||!live())throw fail();const page=await read(request,signal);
  if(signal?.aborted||!live())throw fail();return protect(page);
 };
 return Object.freeze({poll,project,protect,wrapRead,applyReceipt,snapshot:()=>Object.freeze({started,cursor,masked:masks.size}),close:()=>{closed=true;abort.abort();masks.clear();}});
}
