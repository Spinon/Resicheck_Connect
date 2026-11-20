import {bindTextConversation} from '../../../packages/chat-client/src/bound-text-conversation.ts';
import type {TextSession} from '../../../packages/chat-client/src/text-session-channel.ts';
import type {AuthView} from '../../../packages/session/src/auth-controller.ts';
import {analyzeMessage,messageInputError} from '../../../packages/text/src/message-text.ts';
export type TextCompany=Readonly<{id:string;name:string;conversationId:string}>;
type AuthPort={snapshot:()=>AuthView;currentLease:()=>TextSession|null;subscribe:(fn:()=>void)=>()=>void;selectCompany:(id:string)=>Promise<boolean>;signOut:()=>Promise<unknown>};
export type TextChatRow=Readonly<{id:string;text:string;senderId:string;senderRole:'patient'|'staff'|null;sequence:number;status:'history'|'accepted'}>;
type Bound=ReturnType<typeof bindTextConversation>;
type View=Readonly<{scopeKey:number;route:'signed-out'|'companies'|'chat';userId:string|null;company:TextCompany|null;draft:string;busy:boolean;notice:string|null;rows:readonly TextChatRow[];pending:ReturnType<Bound['snapshot']>['entries'];hasMore:boolean|null}>;
// Candidate foreground host; no login, IO or persistence. Caller owns the Auth
// controller and supplies company metadata. Backend authorization stays in RLS.
export function createTextChatHost(deps:{auth:AuthPort;createId:()=>string;schedule:(fn:()=>void,ms:number)=>()=>void;timeoutMs:number}){
 let disposed=false,selection=0,lease:TextSession|null=null,bound:Bound|null=null,unsubscribeBound=()=>{};
 const empty=Object.freeze([]);let view:View=Object.freeze({scopeKey:0,route:'signed-out',userId:null,company:null,draft:'',busy:false,notice:null,rows:empty,pending:empty,hasMore:null});const observers=new Set<()=>void>();
 const publish=(patch:Partial<View>)=>{if(disposed)return;view=Object.freeze({...view,...patch});for(const f of [...observers])try{f();}catch{}};
 function clearPrivateView():undefined{const old=bound;bound=null;unsubscribeBound();unsubscribeBound=()=>{};old?.close();publish({scopeKey:view.scopeKey+1,route:lease?'companies':'signed-out',company:null,draft:'',busy:false,notice:null,rows:empty,pending:empty,hasMore:null});return undefined;}
 function syncAuth(){if(disposed)return;const state=deps.auth.snapshot(),next=state.status==='authenticated'?deps.auth.currentLease():null;if(deps.auth.snapshot()!==state)return;if(next!==lease){selection++;lease=next;clearPrivateView();}publish({userId:next?.userId??null,busy:state.status==='authenticating'||state.status==='refreshing'||state.companyLoading,notice:state.error});}
 function update(captured:Bound){if(disposed||bound!==captured)return;const s=captured.snapshot(),ids=new Set(s.history.messages.map(m=>m.id));
  const rows:TextChatRow[]=s.history.messages.map(m=>Object.freeze({id:m.id,text:m.text,senderId:m.senderId,senderRole:m.senderRole,sequence:m.sequence,status:'history'}));
  for(const e of s.entries)if(e.status==='accepted'&&e.receipt&&!ids.has(e.receipt.id))rows.push(Object.freeze({id:e.receipt.id,text:e.text,senderId:lease!.userId,senderRole:null,sequence:e.receipt.sequence,status:'accepted'}));
  rows.sort((a,b)=>a.sequence-b.sequence);publish({rows:Object.freeze(rows),pending:Object.freeze(s.entries.filter(e=>e.status!=='accepted')),hasMore:s.history.hasMore,notice:s.history.error?.message??view.notice});
 }
 async function load(captured:Bound){const result=await captured.loadNext();if(bound!==captured||disposed)return false;if(result==='unavailable'){clearPrivateView();publish({notice:'Não foi possível acessar esta conversa.'});return false;}update(captured);return result==='loaded';}
 async function openCompany(company:TextCompany){const oldLease=deps.auth.currentLease();if(!oldLease||disposed)return false;const attempt=++selection;clearPrivateView();publish({busy:true});
  const allowed=await deps.auth.selectCompany(company.id);if(disposed||attempt!==selection||lease!==oldLease||deps.auth.currentLease()!==oldLease)return false;
  if(!allowed){publish({busy:false,notice:'Não foi possível acessar esta empresa.'});return false;}
  try{const next=bindTextConversation(oldLease,company.id,company.conversationId,deps);bound=next;unsubscribeBound=next.subscribe(()=>update(next));publish({scopeKey:view.scopeKey+1,route:'chat',company:Object.freeze({...company}),busy:false,draft:'',notice:null});return await load(next);}catch{clearPrivateView();publish({notice:'Não foi possível acessar esta conversa.'});return false;}
 }
 const unsubscribe=deps.auth.subscribe(syncAuth);syncAuth();
 return Object.freeze({snapshot:()=>view,subscribe:(fn:()=>void)=>{observers.add(fn);return()=>{observers.delete(fn);};},clearPrivateView,openCompany,
  backToCompanies:()=>{selection++;clearPrivateView();},
  setDraft:(text:string)=>{if(bound&&!disposed)publish({draft:text,notice:null});},
  send:async()=>{const captured=bound,text=view.draft;if(!captured||disposed)return false;const analysis=analyzeMessage(text);if(!analysis.valid){publish({notice:messageInputError(analysis)??'Digite uma mensagem para enviar.'});return false;}
   // Current online foundation still uses char_length(2000). Match the send
   // adapter conservatively and keep the editor intact until Unicode promotion.
   if(Array.from(text).length>2000){publish({notice:'A mensagem ultrapassa o limite atual de envio. Divida o texto para enviar.'});return false;}
   const entry=captured.enqueue(text);if(!entry.ok){publish({notice:'Não foi possível preparar esta mensagem. Revise o texto ou tente mais tarde.'});return false;}publish({draft:'',notice:null});const outcome=await captured.send(entry.clientMessageId);if(bound!==captured||disposed)return false;update(captured);if(outcome==='accepted')return load(captured);return false;},
  retry:async(id:string)=>{const captured=bound;if(!captured||disposed)return false;const outcome=await captured.send(id);if(bound!==captured||disposed)return false;update(captured);return outcome==='accepted'?load(captured):false;},
  refreshHistory:()=>bound?load(bound):Promise.resolve(false),
  signOut:()=>deps.auth.signOut(),
  dispose:()=>{if(disposed)return;selection++;clearPrivateView();disposed=true;unsubscribe();observers.clear();},
 });
}
