const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
const fail=()=>{throw Error('Seen messages unavailable');};
export function seenMessagesCommand(companyId:string,conversationId:string,ids:readonly string[]){
 if(!uuid(companyId)||!uuid(conversationId)||!Array.isArray(ids)||ids.length<1||ids.length>25||!ids.every(uuid)||new Set(ids).size!==ids.length)return fail();
 return Object.freeze({name:'mark_connect_messages_seen_v1' as const,params:Object.freeze({p_company:companyId,p_conversation:conversationId,p_messages:JSON.stringify(ids)})});
}
export function decodeSeenMessages(raw:unknown,companyId:string,conversationId:string,ids:readonly string[]){
 seenMessagesCommand(companyId,conversationId,ids);if(!raw||typeof raw!=='object'||Array.isArray(raw))return fail();const v=raw as Record<string,unknown>;
 if(v.company_id!==companyId||v.conversation_id!==conversationId||!Array.isArray(v.message_ids)||v.message_ids.length!==ids.length||!v.message_ids.every((id,i)=>id===ids[i])||!Number.isSafeInteger(v.newly_recorded)||(v.newly_recorded as number)<0||(v.newly_recorded as number)>ids.length)return fail();
 return Object.freeze({messageIds:Object.freeze([...ids]),newlyRecorded:v.newly_recorded as number});
}

export type SeenMessagesCommand=ReturnType<typeof seenMessagesCommand>;
export type SeenMessagesRpc=(command:SeenMessagesCommand,signal:AbortSignal)=>Promise<Readonly<{data:unknown;error:null}|{data:null;error:Readonly<{code:string}>}>>;
/** Memory-only queue, bound to one immutable session/conversation owner. */
export function createSeenMessagesCoordinator(deps:Readonly<{enabled:boolean;owner:object;current:()=>object|null;companyId:string;conversationId:string;rpc:SeenMessagesRpc;acknowledged:(ids:readonly string[])=>void}>){
 const queued=new Set<string>(),acked=new Set<string>();let stopped=false,online=true,resume=false,request:AbortController|null=null,retry:readonly string[]|null=null;
 const live=()=>!stopped&&deps.enabled&&deps.current()===deps.owner;
 function dispose(){stopped=true;request?.abort();queued.clear();acked.clear();retry=null;}
 async function flush():Promise<boolean>{
  if(!live()){if(deps.enabled)dispose();return false;}if(!online||request||!queued.size)return false;
  const ids=retry??Object.freeze([...queued].slice(0,25)),own=new AbortController();request=own;resume=false;let success=false;
  try{
   const result=await deps.rpc(seenMessagesCommand(deps.companyId,deps.conversationId,ids),own.signal);
   if(!live()){dispose();return false;}if(own.signal.aborted)return false;
   if(result.error){if(['42501','P0001'].includes(result.error.code))dispose();return false;}
   const ack=decodeSeenMessages(result.data,deps.companyId,deps.conversationId,ids);
   if(!live()){dispose();return false;}
   for(const id of ids){queued.delete(id);acked.add(id);}while(acked.size>512)acked.delete(acked.values().next().value!);
   retry=null;success=true;deps.acknowledged(ack.messageIds);return true;
  }catch{return false;}
  finally{
   if(!success&&!stopped)retry=ids;
   if(request===own)request=null;
   if(!live()&&deps.enabled)dispose();
   if(live()&&online&&(success||resume)&&queued.size){resume=false;void flush();}
  }
 }
 return Object.freeze({
  observe(ids:readonly string[]){
   if(!live()){if(deps.enabled)dispose();return false;}
   try{seenMessagesCommand(deps.companyId,deps.conversationId,ids);}catch{return false;}
   const fresh=ids.filter(id=>!acked.has(id)&&!queued.has(id));if(queued.size+fresh.length>100)return false;
   for(const id of fresh)queued.add(id);if(retry===null)void flush();return true;
  },
  flush,
  setOnline(next:boolean){if(stopped||next===online)return;online=next;if(!next){request?.abort();return;}resume=true;void flush();},
  dispose,
 });
}
