import type {createMembershipHost} from './membership-host.ts';
import type {createTextChatHost} from './text-chat-host.ts';

// Presentation wiring only. Selection comes from the membership directory;
// the text channel independently authorizes every history/read/write request.
export function createMembershipTextBridge(members:ReturnType<typeof createMembershipHost>,text:ReturnType<typeof createTextChatHost>){
 let disposed=false,context=members.snapshot().context;
 function sync(){if(disposed)return;const v=members.snapshot(),next=v.stage==='ready'?v.context:null;if(next===context)return;context=next;text.backToCompanies();if(next)void text.openCompany({id:next.companyId,name:next.companyName,conversationId:next.conversationId});}
 const unsubscribe=members.subscribe(sync);context=null;sync();
 // A denied/failed conversation read must also invalidate the directory's
 // cached role presentation. The reload still needs backend authorization.
 const unsubscribeText=text.subscribe(()=>{const v=text.snapshot();if(!disposed&&context&&v.route==='companies'&&!v.busy&&v.notice!==null)void members.reload();});
 return Object.freeze({back:()=>{text.backToCompanies();void members.reload();},dispose:()=>{if(disposed)return;disposed=true;unsubscribe();unsubscribeText();context=null;text.backToCompanies();}});
}
