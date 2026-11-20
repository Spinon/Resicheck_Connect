import{searchLoadedMessages}from './loaded-message-search.ts';import type{HistoryMessage}from '../../../packages/chat-client/src/text-history.ts';
/** Explicit bounded read-only expansion; caller owns term/context and may retire it. */
export async function searchOlderMessages(deps:Readonly<{query:string;current:()=>boolean;page:()=>Readonly<{messages:readonly HistoryMessage[];hasOlder:boolean|null;busy:boolean}>;load:()=>Promise<boolean>}>){
 let pages=0;const live=()=>{try{return deps.current()===true;}catch{return false;}};
 if(!deps.query.trim()||deps.query.length>80)return{status:'stopped' as const,pages};
 for(let budget=0;budget<3;budget++){
  if(!live())return{status:'stopped' as const,pages};
  const before=deps.page();if(before.busy)return{status:'stopped' as const,pages};if(before.hasOlder!==true)return{status:'end' as const,pages};
  let ok=false;try{ok=await deps.load();}catch{}
  if(!live())return{status:'stopped' as const,pages};if(!ok)return{status:'failed' as const,pages};
  const after=deps.page();pages++;if(after.messages[0]?.id===before.messages[0]?.id)return{status:'failed' as const,pages};
  if(searchLoadedMessages(after.messages,deps.query).length)return{status:'matched' as const,pages};
  if(after.hasOlder!==true)return{status:'end' as const,pages};
 }
 return{status:'limit' as const,pages};
}
