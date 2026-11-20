import type{createHistoryWindow}from '../../../packages/chat-client/src/history-window.ts';import{ownMessageStatusCommand,decodeOwnMessageStatus,type MessageReceiptsRpc}from '../../../packages/chat-client/src/message-receipts.ts';
export type OwnMessageStatus=ReturnType<typeof decodeOwnMessageStatus>[number];
/** Existing validated refresh rechecks newest25 and one rotating older batch.
 * One physical request at a time; no optimistic receipts or full-history rescan. */
export function createOwnMessageStatusBinding(input:Readonly<{changed?:()=>void;enabled?:boolean;history:ReturnType<typeof createHistoryWindow>;userId:string;companyId:string;conversationId:string;current:()=>boolean;rpc:MessageReceiptsRpc}>){
 const deps=Object.freeze({...input});let closed=false,window:object|null=null,version=0,cursor=25,headPending=false,olderPending=false;let ids:readonly string[]=Object.freeze([]),job:Readonly<{abort:AbortController;version:number}>|null=null,stop=()=>{};const cache=new Map<string,OwnMessageStatus>();
 const live=()=>{try{return !closed&&deps.enabled===true&&deps.current()===true&&!closed;}catch{return false;}};
 function dispose(){if(closed)return;closed=true;stop();job?.abort.abort();headPending=false;olderPending=false;ids=Object.freeze([]);cache.clear();window=null;}
 function observe(){if(!live()){if(deps.enabled===true)dispose();return false;}const page=deps.history.snapshot();if(page.status!=='ready'||page.busy||page.messages===window)return false;
  const nextIds=page.messages.filter(m=>m.senderId===deps.userId).slice(-10000).reverse().map(m=>m.id),changed=nextIds.length!==ids.length||nextIds.some((id,i)=>id!==ids[i]);window=page.messages;if(changed){version++;job?.abort.abort();cursor=25;ids=Object.freeze(nextIds);const retained=new Set(ids);for(const id of cache.keys())if(!retained.has(id))cache.delete(id);}
  // A decoded own message persisted in this authorized history proves only server acceptance.
  for(const messageId of ids)if(!cache.has(messageId))cache.set(messageId,Object.freeze({messageId,receivedAt:null,visualizedAt:null,state:'server'}));queue();return true;
 }
 function queue(){headPending=true;olderPending=ids.length>25;request();}
 function request(){if(!live())return dispose();if(job||!ids.length||!headPending&&!olderPending)return;const page=deps.history.snapshot();if(page.status!=='ready'||page.busy||page.messages!==window)return;
  const head=headPending;let batch:readonly string[];if(head){headPending=false;batch=ids.slice(0,25);}else{olderPending=false;if(cursor>=ids.length)cursor=25;batch=ids.slice(cursor,cursor+25);cursor+=batch.length;}const own={abort:new AbortController(),version};job=own;
  void(async()=>{try{const reply=await deps.rpc(ownMessageStatusCommand(deps.companyId,deps.conversationId,batch),own.abort.signal);if(!live()||own.abort.signal.aborted||own.version!==version||reply.error!==null)return;
   const decoded=decodeOwnMessageStatus(reply.data,deps.companyId,deps.conversationId,batch);if(!live()||own.abort.signal.aborted||own.version!==version)return;
   let changed=false;for(const item of decoded){const previous=cache.get(item.messageId);if(!previous)continue;const earliest=(a:number|null,b:number|null)=>a===null?b:b===null?a:Math.min(a,b),receivedAt=earliest(previous.receivedAt,item.receivedAt),visualizedAt=earliest(previous.visualizedAt,item.visualizedAt);if(receivedAt!==previous.receivedAt||visualizedAt!==previous.visualizedAt)changed=true;cache.set(item.messageId,Object.freeze({messageId:item.messageId,receivedAt,visualizedAt,state:visualizedAt!==null?'read':receivedAt!==null?'delivered':'server'}));}
   if(changed)try{deps.changed?.();}catch{}
  }catch{}finally{if(job===own)job=null;own.abort.abort();if(!live())dispose();else if(headPending||olderPending)request();}})();
 }
 function refresh(){if(!live())return dispose();if(!observe())queue();}
 if(deps.enabled===true){const unsubscribe=deps.history.subscribe(observe);if(closed)unsubscribe();else stop=unsubscribe;observe();}
 return Object.freeze({refresh,dispose,snapshot:():readonly OwnMessageStatus[]=>{if(!live()){if(deps.enabled===true)dispose();return Object.freeze([]);}return Object.freeze(ids.flatMap(id=>{const item=cache.get(id);return item?[item]:[];}));}});
}
