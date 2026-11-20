import{decodeOwnReceipt}from './own-send-receipt.ts';import type{SendContext}from './text-send-queue.ts';
type Command=Readonly<{companyId:string;conversationId:string;attachmentId:string;clientMessageId:string}>;
const fail=()=>Error('Audio message unavailable'),uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
/** Attachment ready is not a sent message. Separate explicit commit and exact lookup; never automatic resend. */
export function createAudioMessageCommit(deps:Readonly<{enabled?:boolean;context:SendContext;attachmentId:string;current:()=>boolean;createId:()=>string;send:(command:Command,signal:AbortSignal)=>Promise<unknown>;lookup:(command:Command,signal:AbortSignal)=>Promise<unknown>;schedule:(fn:()=>void,ms:number)=>()=>void;timeoutMs:number}>){
 const context=Object.freeze({...deps.context}),attachmentId=deps.attachmentId;if(![context.userId,context.companyId,context.conversationId,attachmentId].every(uuid)||typeof context.sessionKey!=='string'||!context.sessionKey||!Number.isSafeInteger(deps.timeoutMs)||deps.timeoutMs<1||deps.timeoutMs>60000)throw fail();let closed=false,started=false,physical=false,command:Command|null=null,abort:(()=>void)|null=null;
 let view=Object.freeze({phase:deps.enabled===true?'ready' as string:'off',messageId:null as string|null});
 const live=()=>{try{return !closed&&deps.enabled===true&&deps.current();}catch{return false;}};
 function close(){if(closed)return;closed=true;abort?.();command=null;view=Object.freeze({phase:'closed',messageId:null});}
 async function perform(kind:'send'|'lookup'){
  if(!live()){if(deps.enabled===true)close();return;}if(physical||!command)return;const captured=command;physical=true;const ac=new AbortController();let reject!:(reason:Error)=>void;const interrupted=new Promise<never>((_,no)=>reject=no);void interrupted.catch(()=>{});const stop=()=>{ac.abort();reject(fail());};abort=stop;let cancel=()=>{},launched=false;
  try{cancel=deps.schedule(stop,deps.timeoutMs);if(!live()||ac.signal.aborted)throw fail();view=Object.freeze({phase:kind==='send'?'sending':'checking',messageId:null});launched=true;const raw=Promise.resolve().then(()=>{if(!live()||ac.signal.aborted)throw fail();return deps[kind](captured,ac.signal);}).finally(()=>{physical=false;});const result=await Promise.race([interrupted,raw]);if(!live()||ac.signal.aborted)throw fail();
   if(!result||typeof result!=='object'||(result as Record<string,unknown>).attachment_id!==attachmentId||(result as Record<string,unknown>).kind!=='audio')throw fail();const decoded=decodeOwnReceipt(result,context,captured.clientMessageId);if(decoded.state==='accepted')view=Object.freeze({phase:'sent',messageId:decoded.receipt.id});else if(kind==='lookup')view=Object.freeze({phase:'uncertain',messageId:null});else throw fail();
  }catch{if(live())view=Object.freeze({phase:'uncertain',messageId:null});else close();}finally{cancel();ac.abort();if(abort===stop)abort=null;if(!launched)physical=false;}
 }
 return Object.freeze({snapshot:()=>{if(deps.enabled===true&&!live())close();return view;},
  start:async()=>{if(!live()||started)return;const clientMessageId=deps.createId();if(!/^[-A-Za-z0-9_]{1,80}$/.test(clientMessageId))throw fail();command=Object.freeze({companyId:context.companyId,conversationId:context.conversationId,attachmentId,clientMessageId});started=true;await perform('send');},
  recover:async()=>{if(view.phase==='uncertain')await perform('lookup');},close,
 });
}
