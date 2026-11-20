import{messagesVisualizedCommand,decodeMessagesVisualized,type MessageReceiptsRpc}from '../../../packages/chat-client/src/message-receipts.ts';
import {createSeenMessagesCoordinator,type SeenMessagesRpc} from '../../../packages/chat-client/src/seen-messages.ts';
import {unreadCountsCommand,decodeUnreadCounts} from '../../../packages/chat-client/src/unread-counts.ts';
import {createMessageVisibilityObserver,type MessageVisibilityObserver} from './message-visibility-proof.ts';
type CollectorOptions=Parameters<typeof createMessageVisibilityObserver>[0];
/** Candidate binding only. No production caller enables or constructs it yet. */
export function createMessageSeenBinding(deps:Readonly<{
 enabled:boolean;owner:object;current:()=>object|null;companyId:string;conversationId:string;seenRpc?:SeenMessagesRpc;visualReceiptRpc?:MessageReceiptsRpc;visualRecipientIds?:(ids:readonly string[])=>readonly string[];
 countsRpc:(command:ReturnType<typeof unreadCountsCommand>,signal:AbortSignal)=>Promise<Readonly<{data:unknown;error:unknown}>>;
 count:(value:number|null)=>void;allowed:()=>boolean;viewport:CollectorOptions['viewport'];now:()=>number;schedule:CollectorOptions['schedule'];
}>){
 const enabled=deps.enabled===true&&typeof deps.seenRpc==='function';
 let disposed=false,online=true,desiredActive=false,revision=0,dirty=false,countRequest:AbortController|null=null,manual:object|null=null;
 const live=()=>!disposed&&enabled&&deps.current()===deps.owner;
 function invalidate(){revision++;dirty=true;if(live())deps.count(null);}
 async function readCount(){
  if(!live()){if(enabled)dispose();return;}if(!online||manual||countRequest||!dirty)return;
  dirty=false;const own=new AbortController(),captured=revision;countRequest=own;
  try{
   const result=await deps.countsRpc(unreadCountsCommand(deps.companyId,[deps.conversationId]),own.signal);
   if(!live()||own.signal.aborted||captured!==revision||manual)return;
   if(result.error!==null)throw Error('Count unavailable');
   const value=decodeUnreadCounts(result.data,deps.companyId,[deps.conversationId])[0].unreadCount;
   if(live()&&captured===revision&&!manual)deps.count(value);
  }catch{/* Unknown stays unknown; no optimistic zero and no automatic error retry. */}
  finally{if(countRequest===own)countRequest=null;if(!live()&&enabled)dispose();else if(dirty&&online&&!manual)void readCount();}
 }
 const coordinator=createSeenMessagesCoordinator({enabled,owner:deps.owner,current:deps.current,companyId:deps.companyId,conversationId:deps.conversationId,rpc:deps.seenRpc??(async()=>({data:null,error:{code:'42501'}})),acknowledged:()=>{if(live()){invalidate();collector.invalidate();void readCount();}}});
 const visualCoordinator=enabled&&deps.visualReceiptRpc&&deps.visualRecipientIds?createSeenMessagesCoordinator({enabled:true,owner:deps.owner,current:deps.current,companyId:deps.companyId,conversationId:deps.conversationId,rpc:async(command,signal)=>{
  const ids=JSON.parse(command.params.p_messages)as string[],reply=await deps.visualReceiptRpc!(messagesVisualizedCommand(deps.companyId,deps.conversationId,ids),signal);if(reply.error)return reply;
  const ack=decodeMessagesVisualized(reply.data,deps.companyId,deps.conversationId,ids);
  return{data:{company_id:deps.companyId,conversation_id:deps.conversationId,message_ids:ack.messageIds,newly_recorded:ack.newlyVisualized},error:null};
 },acknowledged:()=>{}}):null;
 const collector=createMessageVisibilityObserver({enabled,current:deps.current,allowed:()=>live()&&online&&!manual&&deps.allowed(),viewport:deps.viewport,now:deps.now,schedule:deps.schedule,seen:ids=>{const personal=coordinator.observe(ids),eligible=visualCoordinator?deps.visualRecipientIds!(ids):[],receipt=eligible.length?visualCoordinator!.observe(eligible):true;return personal&&receipt;}});
 function applyActive(){collector.setActive(live()&&online&&!manual&&desiredActive);}
 const observer:MessageVisibilityObserver=Object.freeze({attach:collector.attach,setCandidates:collector.setCandidates,invalidate:collector.invalidate,setActive(next){desiredActive=next;applyActive();},dispose});
 function dispose(){if(disposed)return;disposed=true;revision++;countRequest?.abort();collector.dispose();coordinator.dispose();visualCoordinator?.dispose();}
 return Object.freeze({
  observer,
  setOnline(next:boolean){if(!live()){if(enabled)dispose();return;}if(next===online)return;online=next;invalidate();if(!online)countRequest?.abort();coordinator.setOnline(next);visualCoordinator?.setOnline(next);applyActive();if(online){collector.invalidate();void readCount();}},
  refreshCounts(){if(!live()){if(enabled)dispose();return;}invalidate();void readCount();},
  beginManualRead(){
   if(!live()||manual)return null;const ticket=Object.freeze({});manual=ticket;invalidate();countRequest?.abort();applyActive();
   let consumed=false;return Object.freeze({complete(){if(consumed)return;consumed=true;if(!live()){dispose();return;}if(manual!==ticket)return;manual=null;invalidate();applyActive();void readCount();}});
  },
  dispose,
 });
}
