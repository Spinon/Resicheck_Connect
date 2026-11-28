import{ownReceiptCommand,decodeOwnReceipt,type OwnReceiptRpc}from './own-send-receipt.ts';
import {createSupabaseSendAdapter,type SubjectBoundRpc} from './supabase-send.ts';
import {createTextSendQueue,type QueueEntry} from './text-send-queue.ts';
import {createHistoryWindow,type HistoryWindowContext,type HistoryWindowReadPort} from './history-window.ts';
import {analyzeMessage} from '../../text/src/message-text.ts';
/** Private, bounded, in-memory presentation state, never backend authority. */
export type RecentConversationCheckpoint=Readonly<{context:HistoryWindowContext;draft:string;pending:Readonly<Pick<QueueEntry,'clientMessageId'|'text'|'attempts'>>|null;draftBelongsToIntent:boolean;pendingAfterSequence?:number}>;
export type RecentProvisionalMessage=Readonly<{id:string;text:string;sequence:number;acceptedAt:number;own:true}>;
export type RecentConversationSnapshot=Readonly<{status:'active'|'unavailable'|'closed';draft:string;sending:boolean;canSend:boolean;retryableIntent:string|null;pending:readonly QueueEntry[];provisional:readonly RecentProvisionalMessage[];notice:null|'invalid-input'|'unavailable'|'uncertain'|'capacity'}>;
const empty=Object.freeze([]),unavailable=()=>new Error('Conversation unavailable');

// Candidate composition: all ports must already belong to one authorized
// subject/session. Context is immutable UI routing, never backend authority.
// No credentials, real HTTP, persistence, polling or automatic write retry.
export function createRecentConversation(options:Readonly<{allowAudio?:boolean;allowRemoval?:boolean;allowImage?:boolean;cachedPage?:unknown;progressiveHistory?:Readonly<{maxBytes:number;incremental?:boolean;onSnapshot?:(page:unknown,removedIds?:readonly string[])=>void}>;context:HistoryWindowContext;rpc:SubjectBoundRpc;readPort:HistoryWindowReadPort;current:()=>boolean;createId:()=>string;schedule:(fn:()=>void,ms:number)=>()=>void;timeoutMs:number;validateReadCancellation?:(signal:AbortSignal)=>Promise<boolean>;maxMessages?:number;maxEntries?:number;receiptLookup?:OwnReceiptRpc;resume?:RecentConversationCheckpoint;onCheckpoint?:(value:RecentConversationCheckpoint)=>void}>){
  const {context,rpc,readPort,validateReadCancellation,current,createId,schedule,timeoutMs,maxMessages=100,maxEntries=100}=options;
  const {userId,sessionKey,companyId,conversationId}=context,captured=Object.freeze({userId,sessionKey,companyId,conversationId});
  if(options.onCheckpoint!==undefined&&typeof options.onCheckpoint!=='function')throw unavailable();
  if(options.receiptLookup!==undefined&&typeof options.receiptLookup!=='function')throw unavailable();
  if(validateReadCancellation!==undefined&&typeof validateReadCancellation!=='function')throw unavailable();
  if(typeof rpc!=='function'||typeof readPort!=='function'||typeof current!=='function'||typeof createId!=='function'||!Number.isInteger(maxEntries)||maxEntries<1||maxEntries>100)throw unavailable();
  let lookup:AbortController|null=null,lookupPhysical:object|null=null,draftRevision=0,intentDraftRevision=-1;
  let status:RecentConversationSnapshot['status']='active',draft='',sending=false,activeIntent:string|null=null,retryableIntent:string|null=null,notice:RecentConversationSnapshot['notice']=null;
  const listeners=new Set<()=>void>(),provisional=new Map<string,RecentProvisionalMessage>();
  const observedTextReceipts=new Map<string,NonNullable<QueueEntry['receipt']>>();
  const textAliases=new Map<string,string>();let pendingAfterSequence=0,observedReceiptKey='';
  function rememberTextReceipt(clientMessageId:string,receipt:NonNullable<QueueEntry['receipt']>){
    const old=textAliases.get(receipt.id);if(old&&old!==clientMessageId){clear('unavailable');return false;}
    textAliases.set(receipt.id,clientMessageId);observedTextReceipts.set(clientMessageId,Object.freeze({...receipt}));return true;
  }
  let view:RecentConversationSnapshot=Object.freeze({status,draft,sending,canSend:false,retryableIntent,pending:empty,provisional:empty,notice});
  const adapter=createSupabaseSendAdapter({schedule,timeoutMs,maxPending:1});
  function active(){try{if(status!=='active')return false;const valid=current();return status==='active'&&valid===true;}catch{return false;}}
  const history=createHistoryWindow({progressiveHistory:options.progressiveHistory,allowAudio:options.allowAudio,allowRemoval:options.allowRemoval,allowImage:options.allowImage,...(options.cachedPage!==undefined?{cachedPage:options.cachedPage}:{}),context:captured,current:active,schedule,timeoutMs,maxMessages,...(validateReadCancellation?{validateReadCancellation:async(signal:AbortSignal)=>ensure()&&!signal.aborted&&await validateReadCancellation(signal)===true&&ensure()&&!signal.aborted}:{}),readPort:async(request,signal)=>{
    if(!ensure())throw unavailable();try{const reply=await readPort(request,signal);if(!ensure())throw unavailable();return reply;}catch{ensure();throw unavailable();}
  }});
  const sender=adapter.openContext(captured,async(name,params,signal)=>{
    if(!ensure())return{data:null,error:{code:'42501'}};
    try{const reply=await rpc(name,params,signal);if(!ensure())return{data:null,error:{code:'42501'}};return reply;}catch{ensure();throw unavailable();}
  });
  const queue=createTextSendQueue({transport:sender.send,createId,schedule,timeoutMs,maxEntries}),q=queue.openContext(captured);
  function notify(){for(const fn of [...listeners])try{fn();}catch{}}
  function clear(next:'unavailable'|'closed'){
    if(status==='closed'||status==='unavailable'&&next==='unavailable')return;
    lookup?.abort();status=next;draft='';sending=false;activeIntent=null;retryableIntent=null;notice=next==='unavailable'?'unavailable':null;provisional.clear();textAliases.clear();observedTextReceipts.clear();adapter.signOut();queue.signOut();history.close();
    view=Object.freeze({status,draft,sending,canSend:false,retryableIntent,pending:empty,provisional:empty,notice});notify();
  }
  function ensure(){if(active())return true;clear('unavailable');return false;}
  function publish(){
    if(!ensure())return;const h=history.snapshot();if(!active()){clear('unavailable');return;}
    const known=new Set(h.messages.map(row=>row.id));for(const id of known)provisional.delete(id);
    // A confirmed receipt older than an authoritative latest window need not
    // remain appended as though recent. This trims a local receipt only; it
    // neither infers sequence continuity nor asserts that a row was deleted.
    if(h.status==='ready'&&!h.olderWindow&&h.messages.length)for(const [id,row] of provisional)if(row.sequence<h.messages[0].sequence)provisional.delete(id);
    const pending=Object.freeze(q.snapshot().filter(row=>row.status!=='accepted'));
    const retained=new Set([...known,...provisional.keys()]);for(const [id,client] of textAliases)if(!retained.has(id)&&!pending.some(e=>e.clientMessageId===client)){textAliases.delete(id);observedTextReceipts.delete(client);}
    view=Object.freeze({status,draft,sending,canSend:!sending&&!activeIntent&&!h.busy&&provisional.size<maxEntries&&analyzeMessage(draft).valid&&[...draft].length<=2000,
      retryableIntent,pending,provisional:Object.freeze([...provisional.values()].sort((a,b)=>a.sequence-b.sequence)),notice});
    const entry=pending.find(row=>row.clientMessageId===activeIntent);
    const checkpoint:RecentConversationCheckpoint=Object.freeze({context:captured,draft,pending:entry?Object.freeze({clientMessageId:entry.clientMessageId,text:entry.text,attempts:entry.attempts}):null,draftBelongsToIntent:!!entry&&draftRevision===intentDraftRevision&&draft===entry.text,...(entry?{pendingAfterSequence}:{})});
    // Capture only while current, before any listener may retire this host.
    try{options.onCheckpoint?.(checkpoint);}catch{}
    if(!active()){clear('unavailable');return;}notify();
  }
  // The history wire deliberately omits clientMessageId. Only the existing
  // subject-bound own-receipt RPC may associate an outstanding intent with a row.
  // This observes acceptance; it never retries a write or settles physical I/O.
  async function observeHistoryReceipt(){
    const id=activeIntent,page=history.snapshot();if(!id||!options.receiptLookup||lookup||lookupPhysical||!ensure()||page.status!=='ready'||page.busy)return;
    const candidates=page.messages.filter(m=>m.senderId===userId&&m.kind==='text'&&m.sequence>pendingAfterSequence&&!textAliases.has(m.id));if(!candidates.length)return;
    const key=id+':'+candidates.at(-1)!.sequence;if(observedReceiptKey===key)return;observedReceiptKey=key;
    const own=new AbortController(),physical=Object.freeze({});lookup=own;lookupPhysical=physical;
    let reject!:(e:Error)=>void;const stopped=new Promise<never>((_,no)=>reject=no);void stopped.catch(()=>{});
    own.signal.addEventListener('abort',()=>reject(unavailable()),{once:true});const cancel=schedule(()=>own.abort(),timeoutMs);
    try{
      let started:ReturnType<OwnReceiptRpc>;try{started=options.receiptLookup(ownReceiptCommand(captured,id),own.signal);}catch{if(lookupPhysical===physical)lookupPhysical=null;throw unavailable();}
      const request=Promise.resolve(started).finally(()=>{if(lookupPhysical===physical)lookupPhysical=null;});
      const reply=await Promise.race([request,stopped]);if(!ensure()||own.signal.aborted||activeIntent!==id)return;
      if(reply.error!==null){if(['42501','P0001'].includes(reply.error.code))clear('unavailable');return;}
      const result=decodeOwnReceipt(reply.data,captured,id);if(result.state!=='accepted')return;
      const row=history.snapshot().messages.find(m=>m.id===result.receipt.id&&m.sequence===result.receipt.sequence&&m.senderId===userId&&m.kind==='text');
      if(row&&rememberTextReceipt(id,result.receipt)){
        const entry=q.snapshot().find(e=>e.clientMessageId===id),ticket=q.bindReceiptRecovery(id);
        if(entry&&ticket?.accept(result.receipt)){activeIntent=null;retryableIntent=null;notice=null;if(draftRevision===intentDraftRevision&&draft===entry.text)draft='';}
        publish();
      }
    }catch{/* No identity inference from text, timestamps or a failed lookup. */}
    finally{cancel();own.abort();if(lookup===own)lookup=null;}
  }
  const unsubscribeHistory=history.subscribe(()=>{if(status==='active'){publish();void observeHistoryReceipt();}});
  async function attempt(id:string):Promise<boolean>{
    if(!ensure()||sending||history.snapshot().busy)return false;const entry=q.snapshot().find(row=>row.clientMessageId===id);if(!entry)return false;
    sending=true;retryableIntent=null;notice=null;publish();
    try{
      // Return older/unready views to latest before sending. An already ready
      // recent window needs no duplicate presentation read: the subject-bound
      // RPC must authorize every write independently, never trust these rows.
      const page=history.snapshot();
      if(page.status!=='ready'||page.olderWindow)await history.refreshLatest();
      if(!ensure())return false;
      // Capture the latest authoritative boundary after returning from older
      // history, before the first physical dispatch of this immutable intent.
      if(entry.attempts===0)pendingAfterSequence=history.snapshot().messages.at(-1)?.sequence??0;
      const pending=q.send(id);publish();const outcome=await pending;if(!ensure())return false;
      let result=q.snapshot().find(row=>row.clientMessageId===id);
      if(result?.failure?.code==='UNAVAILABLE'){clear('unavailable');return false;}
      if(outcome!=='accepted'&&result?.failure?.acceptanceUncertain){const observed=observedTextReceipts.get(id);if(observed&&q.bindReceiptRecovery(id)?.accept(observed))result=q.snapshot().find(row=>row.clientMessageId===id);}
      if(result?.status!=='accepted'||!result.receipt){notice=result?.failure?.acceptanceUncertain?'uncertain':result?.failure?.code==='INVALID_INPUT'?'invalid-input':null;publish();return false;}
      const receipt=result.receipt;if(!rememberTextReceipt(id,receipt))return false;
      provisional.set(receipt.id,Object.freeze({id:receipt.id,text:result.text,sequence:receipt.sequence,acceptedAt:receipt.acceptedAt,own:true}));
      activeIntent=null;if(draftRevision===intentDraftRevision&&draft===result.text)draft='';publish();
      await history.refreshLatest();if(!ensure())return false;publish();return true;
    }finally{if(status==='active'){sending=false;publish();}}
  }
  if(options.resume!==undefined){
    const resumed=options.resume;
    if(!resumed||!resumed.context||Object.keys(captured).some(key=>resumed.context[key as keyof HistoryWindowContext]!==captured[key as keyof HistoryWindowContext])||typeof resumed.draft!=='string'||resumed.draft.length>65536||typeof resumed.draftBelongsToIntent!=='boolean'||resumed.pending!==null&&!q.restoreUncertain(resumed.pending))throw unavailable();
    if(resumed.pendingAfterSequence!==undefined&&(!Number.isSafeInteger(resumed.pendingAfterSequence)||resumed.pendingAfterSequence<0))throw unavailable();
    pendingAfterSequence=resumed.pendingAfterSequence??0;draft=resumed.draft;
    if(resumed.pending){activeIntent=resumed.pending.clientMessageId;intentDraftRevision=resumed.draftBelongsToIntent&&draft===resumed.pending.text?draftRevision:-1;notice='uncertain';}
    publish();
  }
  return Object.freeze({history,textTimeline:()=>Object.freeze({aliases:Object.freeze([...textAliases].map(([messageId,clientMessageId])=>Object.freeze({messageId,clientMessageId}))),afterSequence:activeIntent?pendingAfterSequence:null}),snapshot:()=>{ensure();return view;},subscribe:(fn:()=>void)=>{if(status==='closed')return()=>{};listeners.add(fn);return()=>{listeners.delete(fn);};},
    setDraft(value:unknown){if(!ensure()||typeof value!=='string'||value.length>65536)return false;if(draft!==value)draftRevision++;draft=value;notice=null;publish();return true;},
    async send(){
      if(!ensure()||sending||activeIntent||history.snapshot().busy)return false;
      if(!analyzeMessage(draft).valid||[...draft].length>2000){notice='invalid-input';publish();return false;}
      if(provisional.size>=maxEntries){notice='capacity';publish();return false;}
      const result=q.enqueue(draft);if(!result.ok){notice=result.code==='QUEUE_FULL'?'capacity':'invalid-input';publish();return false;}
      activeIntent=result.clientMessageId;pendingAfterSequence=history.snapshot().messages.at(-1)?.sequence??0;observedReceiptKey='';intentDraftRevision=draftRevision;publish();return attempt(result.clientMessageId);
    },
    retry:(id:string)=>{if(!ensure()||id!==activeIntent||sending)return Promise.resolve(false);const entry=q.snapshot().find(row=>row.clientMessageId===id);return entry?.failure?.retryable?attempt(id):Promise.resolve(false);},
    async recoverPending(){
      if(!options.receiptLookup||!ensure()||sending||lookup||lookupPhysical||!activeIntent||history.snapshot().busy)return false;
      const id=activeIntent,entry=q.snapshot().find(row=>row.clientMessageId===id),ticket=q.bindReceiptRecovery(id);if(!entry||!ticket)return false;
      const own=new AbortController();lookup=own;let reject!:(reason:Error)=>void;const interrupted=new Promise<never>((_,no)=>reject=no);void interrupted.catch(()=>{});
      const stop=()=>{own.abort();reject(unavailable());};own.signal.addEventListener('abort',()=>reject(unavailable()),{once:true});const cancel=schedule(stop,timeoutMs);
      try{
        // A deadline releases the logical lookup, never ownership of unfinished I/O.
        const physical=Object.freeze({});lookupPhysical=physical;
        let request:ReturnType<OwnReceiptRpc>;
        try{request=options.receiptLookup(ownReceiptCommand(captured,id),own.signal);}catch{lookupPhysical=null;throw unavailable();}
        const settled=Promise.resolve(request).finally(()=>{if(lookupPhysical===physical)lookupPhysical=null;});
        const reply=await Promise.race([interrupted,settled]);
        if(!ensure()||own.signal.aborted||activeIntent!==id)return false;
        if(reply.error!==null){const code=reply.error&&typeof reply.error==='object'?(reply.error as Record<string,unknown>).code:null;if(code==='42501'||code==='P0001')clear('unavailable');return false;}
        const result=decodeOwnReceipt(reply.data,captured,id);
        if(result.state==='not_observed'){
          // Absence is not proof of rejection. Permit only an explicit retry of
          // this immutable intent; backend idempotency still owns acceptance.
          if(q.snapshot().find(row=>row.clientMessageId===id)===entry&&entry.failure?.retryable===true){retryableIntent=id;publish();}
          return false;
        }
        if(!ticket.accept(result.receipt)||!rememberTextReceipt(id,result.receipt))return false;
        activeIntent=null;retryableIntent=null;notice=null;if(draftRevision===intentDraftRevision&&draft===entry.text)draft='';
        provisional.set(result.receipt.id,Object.freeze({...result.receipt,text:entry.text,own:true}));publish();return true;
      }catch{return false;}finally{cancel();own.abort();if(lookup===own)lookup=null;}
    },
    bindHistoryReadCancellation(){if(!ensure()||sending||activeIntent||provisional.size)return null;const ticket=history.bindCancellation();return ticket?Object.freeze({cancel:()=>ensure()&&!sending&&!activeIntent&&!provisional.size?ticket.cancel():Promise.resolve(false)}):null;},
    refreshLatest:()=>ensure()?history.refreshLatest():Promise.resolve(false),loadOlder:()=>ensure()&&!sending?history.loadOlder():Promise.resolve(false),
    close(){unsubscribeHistory();clear('closed');listeners.clear();},dispose(){unsubscribeHistory();clear('closed');listeners.clear();},
  });
}
