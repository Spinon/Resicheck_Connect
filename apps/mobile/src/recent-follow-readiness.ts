import type {RecentConversationSnapshot} from '../../../packages/chat-client/src/recent-conversation.ts';
import type {HistoryWindowSnapshot} from '../../../packages/chat-client/src/history-window.ts';

/** Position the confirmed latest rows only after sending and its temporary
 * footer have settled. A pending/uncertain attempt remains freely scrollable. */
export function isRecentFollowReady(
  conversation:Pick<RecentConversationSnapshot,'status'|'sending'|'pending'|'provisional'>,
  history:Pick<HistoryWindowSnapshot,'status'|'busy'|'olderWindow'|'messages'>,
):boolean{
  return conversation.status==='active'&&!conversation.sending&&conversation.pending.length===0&&conversation.provisional.length===0
    &&history.status==='ready'&&!history.busy&&!history.olderWindow&&history.messages.length>0;
}

/** Empty latest windows have no tail node. Only an idle confirmed empty page can refresh. */
export function isRecentEmptyRefreshReady(
 conversation:Pick<RecentConversationSnapshot,'status'|'sending'|'pending'|'provisional'|'draft'>,
 history:Pick<HistoryWindowSnapshot,'status'|'busy'|'olderWindow'|'messages'|'readCancelled'>,
):boolean{
 return conversation.status==='active'&&!conversation.sending&&conversation.pending.length===0&&conversation.provisional.length===0
  &&history.status==='ready'&&!history.busy&&!history.olderWindow&&!history.readCancelled&&history.messages.length===0;
}

/** Position an authorized cached snapshot while reconciliation is pending.
 * Presentation only: never used to authorize receipts, playback or refresh. */
export function isRecentHistoryPositionReady(conversation:Pick<RecentConversationSnapshot,'status'|'sending'|'pending'|'provisional'>,history:Pick<HistoryWindowSnapshot,'status'|'busy'|'olderWindow'|'messages'|'cachedPresentation'>):boolean{
 return isRecentFollowReady(conversation,history)||(history.cachedPresentation===true&&history.status==='loading'&&isRecentFollowReady(conversation,{...history,status:'ready',busy:false}));
}
