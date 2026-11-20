import{createImageTransferFetch,isImageTransferUrl}from'./image-transfer-http.ts';
import{canonicalRemovalCommand,type MessageRemovalCommand}from'../../../packages/chat-client/src/message-removal.ts';
import{createScopedAudioFetch,isScopedAudioUrl}from './scoped-audio-http.ts';
import{audioResolveCommand}from '../../../packages/chat-client/src/audio-message-resolver.ts';
import{audioMessageCommand}from '../../../packages/chat-client/src/audio-message-rpc.ts';
import{createAudioTransferFetch}from './audio-transfer-http.ts';
import{messagesReceivedCommand}from '../../../packages/chat-client/src/message-delivery.ts';
import{messagesVisualizedCommand,ownMessageStatusCommand}from '../../../packages/chat-client/src/message-receipts.ts';
import {seenMessagesCommand} from '../../../packages/chat-client/src/seen-messages.ts';
import {analyzeMessage} from '../../../packages/text/src/message-text.ts';
import {AUTH_DIAGNOSTIC_ORIGIN as origin} from './auth-diagnostic-http.ts';
import {createMembershipManagementFetch} from './membership-management-http.ts';

const unavailable=()=>Error('Basic text connection unavailable');
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
/** Explicit client admission, not backend authorization. The captured session
 * transport and server determine author and access. Only basic text is added. */
export function createBasicTextFetch(nativeFetch:typeof fetch,publishableKey:string,options:Readonly<{seenMessages?:boolean;messageReceipts?:boolean;messageRemoval?:boolean;imageHistory?:boolean;imageTransfer?:boolean;audioMessages?:boolean;audioTransfer?:boolean;scopedAudioTransfer?:boolean}>={}):typeof fetch{
 if(options.audioMessages!==undefined&&typeof options.audioMessages!=='boolean')throw unavailable();
 if(options.audioTransfer!==undefined&&typeof options.audioTransfer!=='boolean')throw unavailable();
 if(options.scopedAudioTransfer!==undefined&&typeof options.scopedAudioTransfer!=='boolean')throw unavailable();
 if(options.messageRemoval!==undefined&&typeof options.messageRemoval!=='boolean')throw unavailable();
 if(options.imageHistory!==undefined&&typeof options.imageHistory!=='boolean'||options.imageHistory===true&&options.messageRemoval!==true)throw unavailable();
 if(options.imageTransfer!==undefined&&typeof options.imageTransfer!=='boolean'||options.imageTransfer===true&&options.imageHistory!==true)throw unavailable();
 const images=createImageTransferFetch(nativeFetch,publishableKey);
 const scopedAudio=createScopedAudioFetch(nativeFetch,publishableKey);
 const audio=createAudioTransferFetch(nativeFetch,publishableKey);
 if(options.messageReceipts!==undefined&&typeof options.messageReceipts!=='boolean')throw unavailable();
 if(options.seenMessages!==undefined&&typeof options.seenMessages!=='boolean')throw unavailable();
 const existing=createMembershipManagementFetch(nativeFetch,publishableKey);
 return (async(input,init)=>{
  if(typeof input!=='string')throw unavailable();
  if(isImageTransferUrl(input)){if(options.imageTransfer!==true)throw unavailable();return images(input,init);}
  if(isScopedAudioUrl(input)){if(options.scopedAudioTransfer!==true)throw unavailable();return scopedAudio(input,init);}
  if(input.startsWith(origin+'/functions/v1/connect-audio-transfer-v1/')){if(options.audioTransfer!==true)throw unavailable();return audio(input,init);}
  const removalNames=['remove_connect_messages_v1','lookup_connect_message_removal_v1','connect_message_removal_changes_v1'];
  const removal=options.messageRemoval===true&&removalNames.some(name=>input===origin+'/rest/v1/rpc/'+name);
  if(options.messageRemoval===true&&(input.startsWith(origin+'/rest/v1/rpc/read_connect_messages_v2?')||options.imageHistory===true&&input.startsWith(origin+'/rest/v1/rpc/read_connect_messages_v3?'))){
   try{
    if(!init||init.method!=='GET'||init.body!==undefined||!(init.signal instanceof AbortSignal)||init.signal.aborted||init.redirect!=='error'||init.credentials!=='omit'||input.length>600)throw unavailable();
    const url=new URL(input),q=url.searchParams,keys=[...q.keys()];if(url.origin!==origin||url.hash||keys.length!==new Set(keys).size||keys.some(k=>!['p_company','p_conversation','p_before','p_after','p_limit'].includes(k))||!uuid(q.get('p_company'))||!uuid(q.get('p_conversation'))||q.has('p_before')&&q.has('p_after'))throw unavailable();
    const integer=(v:string|null,min:number,max:number)=>v!==null&&/^(0|[1-9][0-9]*)$/.test(v)&&Number.isSafeInteger(Number(v))&&Number(v)>=min&&Number(v)<=max;
    if(!integer(q.get('p_limit'),1,100)||q.has('p_before')&&!integer(q.get('p_before'),1,Number.MAX_SAFE_INTEGER)||q.has('p_after')&&!integer(q.get('p_after'),0,Number.MAX_SAFE_INTEGER)||input!==origin+url.pathname+'?'+q.toString())throw unavailable();
    const headers=new Headers(init.headers),allowed=new Set(['apikey','authorization','accept','accept-profile']);headers.forEach((_,k)=>{if(!allowed.has(k))throw unavailable();});
    const bearer=headers.get('authorization');if(headers.get('apikey')!==publishableKey||headers.get('accept')!=='application/json'||headers.get('accept-profile')!=='public'||!bearer||!/^Bearer [A-Za-z0-9_.-]{1,8192}$/.test(bearer)||bearer.startsWith('Bearer sb_'))throw unavailable();
    headers.set('Cache-Control','no-store');return await nativeFetch(input,{method:'GET',headers,signal:init.signal,redirect:'error',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});
   }catch{throw unavailable();}
  }
  const audioMessage=options.audioMessages===true&&['resolve_connect_audio_message_v1','send_connect_audio_message_v1','lookup_connect_audio_message_v1'].some(name=>input===origin+'/rest/v1/rpc/'+name);
  const messageReceipt=options.messageReceipts===true&&['mark_connect_messages_received_v1','mark_connect_messages_visualized_v1','lookup_connect_own_message_status_v1'].some(name=>input===origin+'/rest/v1/rpc/'+name);
  const receipt=input===origin+'/rest/v1/rpc/lookup_connect_own_send_receipt_v1';
  const seen=input===origin+'/rest/v1/rpc/mark_connect_messages_seen_v1'&&options.seenMessages===true;
  if(input!==origin+'/rest/v1/rpc/send_text'&&!seen&&!receipt&&!messageReceipt&&!audioMessage&&!removal){
   try{return await existing(input,init);}catch{throw unavailable();}
  }
  let request:RequestInit;
  try{
   if(!init)throw unavailable();
   const {method,body,headers:rawHeaders,signal,redirect,credentials}=init;
   if(method!=='POST'||!(signal instanceof AbortSignal)||signal.aborted||redirect!=='error'||credentials!=='omit'||typeof body!=='string'||body.length>32768||new TextEncoder().encode(body).byteLength>32768)throw unavailable();
   const headers=new Headers(rawHeaders),allowed=new Set(['apikey','accept','authorization','accept-profile','content-type','content-profile']);
   headers.forEach((_,key)=>{if(!allowed.has(key))throw unavailable();});
   const bearer=headers.get('authorization');
   if(headers.get('apikey')!==publishableKey||headers.get('accept')!=='application/json'||bearer===null||!/^Bearer [A-Za-z0-9_.-]{1,8192}$/.test(bearer)||bearer.startsWith('Bearer sb_')||headers.get('accept-profile')!=='public'||headers.get('content-type')!=='application/json'||headers.get('content-profile')!=='public')throw unavailable();
   const parsed:unknown=JSON.parse(body);
   if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw unavailable();
   let canonical:string;
   if(removal){const name=input.slice(input.lastIndexOf('/')+1) as MessageRemovalCommand['name'];canonical=JSON.stringify(canonicalRemovalCommand({name,params:parsed}as MessageRemovalCommand).params);}
   else if(audioMessage){const p=parsed as Record<string,string>;canonical=input.endsWith('/resolve_connect_audio_message_v1')?JSON.stringify(audioResolveCommand(p.p_company,p.p_conversation,p.p_message).params):JSON.stringify(audioMessageCommand(input.endsWith('/send_connect_audio_message_v1')?'send':'lookup',p.p_company,p.p_conversation,p.p_client,p.p_attachment).params);}
   else if(messageReceipt){const {p_company,p_conversation,p_messages}=parsed as Record<string,unknown>;if(typeof p_messages!=='string'||p_messages.length>1000)throw unavailable();const ids=JSON.parse(p_messages);const command=input.endsWith('/mark_connect_messages_received_v1')?messagesReceivedCommand(p_company as string,p_conversation as string,ids):input.endsWith('/mark_connect_messages_visualized_v1')?messagesVisualizedCommand(p_company as string,p_conversation as string,ids):ownMessageStatusCommand(p_company as string,p_conversation as string,ids);canonical=JSON.stringify(command.params);}
   else if(receipt){const {p_company,p_conversation,p_client_id}=parsed as Record<string,unknown>;if(!uuid(p_company)||!uuid(p_conversation)||typeof p_client_id!=='string'||!/^[-A-Za-z0-9_]{1,80}$/.test(p_client_id))throw unavailable();canonical=JSON.stringify({p_company,p_conversation,p_client_id});}
   else if(seen){const {p_company,p_conversation,p_messages}=parsed as Record<string,unknown>;if(typeof p_messages!=='string'||p_messages.length>1000)throw unavailable();canonical=JSON.stringify(seenMessagesCommand(p_company as string,p_conversation as string,JSON.parse(p_messages)).params);}
   else{
   const {p_company,p_conversation,p_client_id,p_body}=parsed as Record<string,unknown>;
   if(!uuid(p_company)||!uuid(p_conversation)||typeof p_client_id!=='string'||!/^[-A-Za-z0-9_]{1,80}$/.test(p_client_id)||typeof p_body!=='string'||!analyzeMessage(p_body).valid||[...p_body].length>2000)throw unavailable();
   canonical=JSON.stringify({p_company,p_conversation,p_client_id,p_body});
   }
   if(body!==canonical)throw unavailable();
   headers.set('Cache-Control','no-store');if(signal.aborted)throw unavailable();
   request={method:'POST',body:canonical,headers,signal,redirect:'error',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'};
  }catch{throw unavailable();}
  try{return await nativeFetch(input,request);}catch{throw unavailable();}
 }) as typeof fetch;
}
