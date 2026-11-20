// Internal QA only. Backend Auth/RLS still authorize every request.
const co='678e7072-b9d9-489f-8f4a-827ebc3fc340',cv='d834fa16-90ab-4065-a9a7-5da30ac71945',actor='e3fe7071-f9ea-48fd-afe5-41d5915998a2';
const staffActors=new Set(['69cf7bf8-ae10-488c-b3cc-f1eedf7078ce','aa8fdd8b-442e-422f-ae1b-dfceb9ac4ada']);
const combinedReads=new Set(['connect_staff_inbox','connect_staff_inbox_recent','connect_staff_inbox_search','lookup_connect_own_message_status_v1']);
const receiptWrites=new Set(['mark_connect_messages_received_v1','mark_connect_messages_visualized_v1','mark_connect_messages_seen_v1']);
const unavailable=()=>Error('QA request unavailable');
const reads=new Set(['my_profile_registration','my_profile_registration_request','my_company_registration_page','my_company_registration','my_connect_staff_employer','my_connect_memberships','my_company_registry_check','connect_unread_counts']);
export type PreservedSendQaEvent=Readonly<{type:'initial-send-held'|'accepted-ack-dropped'|'extra-send-blocked'|'original-lookup'|'lookup-withheld'|'initial-send-not-dispatched'|'explicit-retry-accepted';clientMessageId:string;count:number}>;
/** One real synthetic send, then deliberately withhold only its valid ACK.
 * Telemetry contains synthetic intent ID/counters only, never text or headers. */
export function createPreservedSendQaFetch(projectUrl:string,nativeFetch:typeof fetch,event:(value:PreservedSendQaEvent)=>void,mode:'after-acceptance'|'before-acceptance'|'combined-regression'='after-acceptance'):typeof fetch{
 if(projectUrl!=='https://ibdlvlwdzmsrbqadrudb.supabase.co'||typeof nativeFetch!=='function'||typeof event!=='function'||!['after-acceptance','before-acceptance','combined-regression'].includes(mode))throw unavailable();
 const combined=mode==='combined-regression',beforeAcceptance=mode!=='after-acceptance';
 let verifiedActor:string|null=null,verifiedAuthorization:string|null=null,originalId:string|null=null,sendCalls=0,transportLossObserved=false,originalText:string|null=null;
 return async(input,init)=>{
  if(typeof input!=='string')throw unavailable();const url=new URL(input);if(url.origin!==projectUrl)throw unavailable();
  const name=url.pathname.match(/^\/rest\/v1\/rpc\/([a-z_][a-z_0-9]*)$/)?.[1],method=init?.method??'GET';
  if(name==='send_text'||name==='lookup_connect_own_send_receipt_v1'){
   const authorization=new Headers(init?.headers).get('authorization');if(method!=='POST'||!verifiedAuthorization||authorization!==verifiedAuthorization||typeof init?.body!=='string')throw unavailable();
   if(verifiedActor!==actor)throw unavailable();
   const p=JSON.parse(init.body);if(p.p_company!==co||p.p_conversation!==cv||typeof p.p_client_id!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(p.p_client_id))throw unavailable();
   if(name==='send_text'){
    if(typeof p.p_body!=='string'||!/^CONNECT-QA-RECONNECT-[a-f0-9-]{36}$/.test(p.p_body)||Object.keys(p).sort().join(',')!=='p_body,p_client_id,p_company,p_conversation')throw unavailable();
    sendCalls++;
    if(beforeAcceptance&&sendCalls===1){originalId=p.p_client_id;originalText=p.p_body;if(combined){event({type:'initial-send-held',clientMessageId:p.p_client_id,count:sendCalls});await new Promise(resolve=>setTimeout(resolve,8000));}event({type:'initial-send-not-dispatched',clientMessageId:p.p_client_id,count:sendCalls});throw Error('QA dispatch withheld');}
    if(sendCalls!==(beforeAcceptance?2:1)||beforeAcceptance&&(p.p_client_id!==originalId||p.p_body!==originalText)){event({type:'extra-send-blocked',clientMessageId:p.p_client_id,count:sendCalls});throw unavailable();}
    originalId=p.p_client_id;
    const response=await nativeFetch(input,init);if(!response.ok)return response;const raw=await response.clone().json(),row=Array.isArray(raw)?raw.length===1?raw[0]:null:raw;
    if(!row||row.company_id!==co||row.conversation_id!==cv||row.sender_id!==actor||row.body!==p.p_body||row.kind!=='text'||typeof row.id!=='string')throw unavailable();
    if(beforeAcceptance){event({type:'explicit-retry-accepted',clientMessageId:p.p_client_id,count:sendCalls});return response;}
    event({type:'accepted-ack-dropped',clientMessageId:p.p_client_id,count:sendCalls});throw Error('QA confirmation withheld');
   }
   if(p.p_client_id!==originalId||Object.keys(p).sort().join(',')!=='p_client_id,p_company,p_conversation')throw unavailable();
   if(!transportLossObserved){event({type:'lookup-withheld',clientMessageId:p.p_client_id,count:sendCalls});throw Error('QA lookup waiting for transport loss');}
   event({type:'original-lookup',clientMessageId:p.p_client_id,count:sendCalls});return nativeFetch(input,init);
  }
  if(name){if(method!=='POST')throw unavailable();if(combined&&receiptWrites.has(name)){const p=typeof init?.body==='string'?JSON.parse(init.body):null;if(!verifiedActor||!verifiedAuthorization||new Headers(init?.headers).get('authorization')!==verifiedAuthorization||p?.p_company!==co||p?.p_conversation!==cv)throw unavailable();}else if(!reads.has(name)&&!(combined&&combinedReads.has(name)))throw unavailable();return nativeFetch(input,init);}
  if(['/rest/v1/messages','/rest/v1/conversations'].includes(url.pathname)){if(method!=='GET')throw unavailable();try{return await nativeFetch(input,init);}catch{if(originalId!==null)transportLossObserved=true;throw unavailable();}}
  if(!['/auth/v1/token','/auth/v1/user','/auth/v1/logout'].includes(url.pathname)||url.pathname==='/auth/v1/user'&&method!=='GET'||url.pathname!=='/auth/v1/user'&&method!=='POST')throw unavailable();
  if(url.pathname==='/auth/v1/logout'){verifiedAuthorization=null;verifiedActor=null;}
  const response=await nativeFetch(input,init);
  if(url.pathname==='/auth/v1/user'){
   verifiedAuthorization=null;verifiedActor=null;const authorization=new Headers(init?.headers).get('authorization');if(response.ok&&authorization?.startsWith('Bearer ')){const id=(await response.clone().json()).id;if(id===actor||combined&&staffActors.has(id)){verifiedAuthorization=authorization;verifiedActor=id;}}
  }
  return response;
 };
}
