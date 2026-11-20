import{removeMessagesCommand,lookupRemovalCommand,decodeRemovalReceipt,decodeRemovalLookup,type MessageRemovalContext,type MessageRemovalReceipt,type MessageRemovalScope,type MessageRemovalRpc}from'../../../packages/chat-client/src/message-removal.ts';
export type SelectableMessage=Readonly<{id:string;companyId:string;conversationId:string;senderId:string;kind:'text'|'audio'|'image'}>;
export type MessageRemovalSnapshot=Readonly<{phase:'idle'|'selecting'|'confirming'|'removing'|'uncertain'|'closed';selected:readonly string[];canRemoveAll:boolean;busy:boolean;notice:null|'unavailable'|'uncertain'}>;
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v),empty=Object.freeze([])as readonly string[];
/** Selection is presentation, never authorization. The injected subject-bound
 * transport/server must verify session, access, authorship and idempotency.
 * No message body, media bytes, token or password is retained here. */
export function createMessageRemovalController(input:Readonly<{context:MessageRemovalContext;userId:string;current:()=>boolean;rows:()=>readonly SelectableMessage[];createOperationId:()=>string;rpc:MessageRemovalRpc;apply:(receipt:MessageRemovalReceipt)=>void|Promise<void>}>){
 const companyId=input.context.companyId,conversationId=input.context.conversationId,userId=input.userId;if(![companyId,conversationId,userId].every(uuid))throw Error('Message action unavailable');
 const context=Object.freeze({companyId,conversationId}),listeners=new Set<()=>void>();let closed=false,selected:string[]=[],phase:MessageRemovalSnapshot['phase']='idle',notice:MessageRemovalSnapshot['notice']=null,flight:AbortController|null=null,attempt:ReturnType<typeof removeMessagesCommand>|null=null;
 let view:MessageRemovalSnapshot=Object.freeze({phase,selected:empty,canRemoveAll:false,busy:false,notice});
 const live=()=>{try{return !closed&&input.current()===true;}catch{return false;}};
 const row=(id:string)=>{const m=input.rows().find(m=>m.id===id);return m&&uuid(m.id)&&uuid(m.senderId)&&m.companyId===companyId&&m.conversationId===conversationId&&['text','audio','image'].includes(m.kind)?m:null;};
 function publish(){const ids=selected.length?Object.freeze([...selected]):empty;let canRemoveAll=false;try{canRemoveAll=ids.length>0&&ids.every(id=>row(id)?.senderId===userId);}catch{}view=Object.freeze({phase,selected:ids,canRemoveAll,busy:flight!==null,notice});for(const f of[...listeners])try{f();}catch{}}
 function close(){if(closed)return;closed=true;flight?.abort();flight=null;attempt=null;selected=[];phase='closed';notice=null;publish();listeners.clear();}
 function active(){if(live())return true;close();return false;}
 function toggle(id:string){if(!active()||flight||attempt||!['idle','selecting'].includes(phase))return false;try{if(!row(id))return false;}catch{return false;}if(selected.includes(id))selected=selected.filter(v=>v!==id);else{if(selected.length>=50)return false;selected=[...selected,id];}phase=selected.length?'selecting':'idle';notice=null;publish();return true;}
 function cancel(){if(!active()||flight||attempt)return false;selected=[];phase='idle';notice=null;publish();return true;}
 function refresh(){if(!active()||flight||attempt)return;const retained=selected.filter(id=>{try{return!!row(id);}catch{return false;}});if(retained.length===selected.length)return;selected=retained;phase=selected.length?'selecting':'idle';notice=null;publish();}
 function confirm(){refresh();if(!active()||phase!=='selecting'||!selected.length||flight||attempt)return false;phase='confirming';notice=null;publish();return true;}
 function cancelConfirmation(){if(!active()||phase!=='confirming'||flight||attempt)return false;phase='selecting';notice=null;publish();return true;}
 async function execute(kind:'submit'|'verify'|'retry',scope?:MessageRemovalScope){
  if(!active()||flight)return false;
  if(kind==='submit'){
   if(phase!=='confirming'||attempt||!selected.length||!scope||!['self','all'].includes(scope))return false;
   try{if(selected.some(id=>!row(id))||scope==='all'&&selected.some(id=>row(id)?.senderId!==userId))return false;attempt=removeMessagesCommand(context,input.createOperationId(),scope,selected);}catch{notice='unavailable';publish();return false;}
  }else if(phase!=='uncertain'||!attempt)return false;
  const original=attempt!;const ac=new AbortController();flight=ac;phase='removing';notice=null;publish();
  try{
   const command=kind==='verify'?lookupRemovalCommand(context,original.params.p_operation):original,raw=await input.rpc(command,ac.signal);
   if(!live()||flight!==ac||attempt!==original||ac.signal.aborted)return false;
   const receipt=kind==='verify'?decodeRemovalLookup(raw,original):decodeRemovalReceipt(raw,original);
   if(receipt===null){phase='uncertain';notice='uncertain';return false;}
   await input.apply(receipt);if(!live()||flight!==ac||attempt!==original||ac.signal.aborted)return false;
   attempt=null;selected=[];phase='idle';notice=null;return true;
  }catch{if(live()&&attempt===original){phase='uncertain';notice='uncertain';}return false;}
  finally{ac.abort();if(flight===ac){flight=null;if(!live())close();else publish();}}
 }
 return Object.freeze({snapshot:()=>{if(!live())close();return view;},subscribe:(f:()=>void)=>{if(closed)return()=>{};listeners.add(f);return()=>{listeners.delete(f);};},toggle,cancel,refresh,confirm,cancelConfirmation,submit:(scope:MessageRemovalScope)=>execute('submit',scope),verify:()=>execute('verify'),retry:()=>execute('retry'),close});
}
export type MessageRemovalController=ReturnType<typeof createMessageRemovalController>;
