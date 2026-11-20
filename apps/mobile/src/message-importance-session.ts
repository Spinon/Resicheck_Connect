import {createMessageImportanceAdapter,type MessageImportanceRpc} from '../../../packages/chat-client/src/message-importance.ts';import {createMessageImportanceHost,type ImportanceScope} from './message-importance-host.ts';
export type MessageImportanceLease=Readonly<{userId:string;sessionKey:string;messageImportance:MessageImportanceRpc}>;
export type ImportanceConversationContext=Readonly<{companyId:string;conversationId:string;role:ImportanceScope['role']}>;
// Caller supplies the current verified lease and membership-derived context.
// UI capability never replaces backend authorization. This host owns its adapter,
// not the shared session; suspension must not sign out unrelated conversations.
export function createMessageImportanceSessionHost(deps:{lease:MessageImportanceLease;currentLease:()=>MessageImportanceLease|null;context:ImportanceConversationContext;currentContext:()=>ImportanceConversationContext|null;messageId:string;createId:()=>string}){
 let owned:ReturnType<typeof createMessageImportanceAdapter>|null=null;try{
  const {lease,currentLease,context,currentContext,messageId,createId}=deps,{userId,sessionKey,messageImportance}=lease,{companyId,conversationId,role}=context;
  if(!['staff','patient','manager','platform-admin'].includes(role)||typeof currentLease!=='function'||typeof currentContext!=='function'||typeof createId!=='function')throw Error();
  const scope:ImportanceScope=Object.freeze({userId,sessionKey,companyId,conversationId,role});const live=()=>{try{const nextLease=currentLease(),nextContext=currentContext();if(nextLease!==lease||nextContext!==context)return false;return nextLease.userId===userId&&nextLease.sessionKey===sessionKey&&nextLease.messageImportance===messageImportance&&nextContext.companyId===companyId&&nextContext.conversationId===conversationId&&nextContext.role===role;}catch{return false;}};
  const adapter=createMessageImportanceAdapter({userId,sessionKey,companyId,conversationId,messageId,rpc:messageImportance,current:live});owned=adapter;
  return createMessageImportanceHost({scope,current:()=>live()?scope:null,port:adapter,createId});
 }catch{try{owned?.close();}catch{}throw Error('Message action unavailable');}
}
