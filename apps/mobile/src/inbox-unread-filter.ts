import type {StaffConversation} from '../../../packages/chat-client/src/membership-directory.ts';
/** Read-only projection. Unknown is not zero; no sort, fetch, mutation or receipt. */
export function filterUnreadInbox(rows:readonly StaffConversation[]){
 let unknown=0;const unread=rows.filter(row=>{const n=row.unreadCount;if(!Number.isSafeInteger(n)||n!<0){unknown++;return false;}return n!>0;});
 return Object.freeze({rows:unread,unknown,conversations:unread.length});
}
