import{decodeMessageProjection,REMOVED_MESSAGE_TEXT}from './message-content.ts';
import {parseHistoryTimestamp} from './history-timestamp.ts';
import {analyzeMessage} from '../../text/src/message-text.ts';
import type {HistoryMessage} from './text-history.ts';
export type HistoryWindowContext=Readonly<{userId:string;sessionKey:string;companyId:string;conversationId:string}>;
export type HistoryWindowRequest=Readonly<{companyId:string;conversationId:string;before:number|null;limit:25}>;
export type HistoryWindowReadPort=(request:HistoryWindowRequest,signal:AbortSignal)=>Promise<unknown>;
export type HistoryWindowSnapshot=Readonly<{status:'idle'|'loading'|'ready'|'failed'|'unavailable'|'closed';busy:boolean;cancelling?:boolean;readCancelled?:boolean;mode:'latest'|'older'|null;messages:readonly HistoryMessage[];hasOlder:boolean|null;olderWindow:boolean;prunedNewer:number;cachedPresentation?:boolean;syncing?:boolean;syncProgress?:Readonly<{loaded:number;complete:boolean;limited:boolean}>}>;
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const exactKeys=(value:Record<string,unknown>,keys:readonly string[])=>{const actual=Reflect.ownKeys(value);return actual.length===keys.length&&actual.every(key=>typeof key==='string'&&keys.includes(key));};
const empty=Object.freeze([]) as readonly HistoryMessage[];
const unavailable=()=>new Error('History unavailable');

// Bounded presentation window only. The injected subject-bound read port must
// authorize EVERY page in the backend, including a post-read revocation check.
// Local current is UI fencing, never authentication. No sequence gaps are filled
// or assumed contiguous; trimming is memory-only and cannot delete backend rows.
export function createHistoryWindow(options:Readonly<{allowAudio?:boolean;allowRemoval?:boolean;allowImage?:boolean;context:HistoryWindowContext;readPort:HistoryWindowReadPort;current:()=>boolean;schedule:(fn:()=>void,ms:number)=>()=>void;timeoutMs:number;validateReadCancellation?:(signal:AbortSignal)=>Promise<boolean>;maxMessages?:number;maxPageBytes?:number;cachedPage?:unknown;progressiveHistory?:Readonly<{maxBytes:number;incremental?:boolean;onSnapshot?:(page:unknown,removedIds?:readonly string[])=>void}>}>){
  const {context,readPort,current,schedule,timeoutMs,validateReadCancellation,maxMessages=100,maxPageBytes=2*1024*1024}=options;
  const {userId,sessionKey,companyId,conversationId}=context;
  if(options.allowRemoval!==undefined&&typeof options.allowRemoval!=='boolean')throw unavailable();
  if(validateReadCancellation!==undefined&&typeof validateReadCancellation!=='function')throw unavailable();
  if(!uuid(userId)||!uuid(companyId)||!uuid(conversationId)||typeof sessionKey!=='string'||!sessionKey.trim()||sessionKey.length>200||/[\u0000-\u001f\u007f]/.test(sessionKey)
    ||typeof readPort!=='function'||typeof current!=='function'||typeof schedule!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000
    ||!Number.isInteger(maxMessages)||maxMessages<25||maxMessages>10000||!Number.isInteger(maxPageBytes)||maxPageBytes<512||maxPageBytes>2*1024*1024)throw unavailable();
  const progressive=options.progressiveHistory;if(progressive&&(!Number.isSafeInteger(progressive.maxBytes)||progressive.maxBytes<1024||progressive.maxBytes>16*1024*1024))throw unavailable();
  const removalMasks=new Map<string,'self'|'all'>();
  let closed=false,invalid=false,generation=0,reconcileCursor:number|null=null,checkpoint=false;
  let view:HistoryWindowSnapshot=Object.freeze({status:'idle',busy:false,mode:null,messages:empty,hasOlder:null,olderWindow:false,prunedNewer:0,cancelling:false,syncing:false,cachedPresentation:false});const listeners=new Set<()=>void>();
  type Job={controller:AbortController;stop:()=>void;previous:HistoryWindowSnapshot;cancelTimer:()=>void};let pending:Job|null=null;let cancellation:Readonly<{stop:()=>void}>|null=null;
  function publish(patch:Partial<HistoryWindowSnapshot>,notify=true){
    if(patch.messages&&removalMasks.size)patch={...patch,messages:protectRows(patch.messages)};
    const next={...view,...patch},a=view.syncProgress,b=next.syncProgress;
    if(a&&b&&a.loaded===b.loaded&&a.complete===b.complete&&a.limited===b.limited)next.syncProgress=a;
    if(Object.keys(next).every(k=>next[k as keyof HistoryWindowSnapshot]===view[k as keyof HistoryWindowSnapshot]))return;
    view=Object.freeze(next);if(notify)for(const f of [...listeners])try{f();}catch{}
  }
  function revoke(notify=true){if(invalid||closed)return;invalid=true;removalMasks.clear();generation++;pending?.stop();cancellation?.stop();publish({status:'unavailable',cancelling:false,readCancelled:false,busy:false,mode:null,messages:empty,hasOlder:null,olderWindow:false,prunedNewer:0},notify);}
  function active(){try{if(closed||invalid)return false;const allowed=current();return !closed&&!invalid&&allowed===true;}catch{return false;}}
  function protectRow(m:HistoryMessage):HistoryMessage{const scope=removalMasks.get(m.id);return !scope||scope===m.removedScope?m:Object.freeze({...m,kind:'text' as const,text:REMOVED_MESSAGE_TEXT,important:false,removedScope:scope});}
  function protectRows(rows:readonly HistoryMessage[]){let changed=false;const next=rows.map(m=>{const safe=protectRow(m);if(safe!==m)changed=true;return safe;});return changed?Object.freeze(next):rows;}
const wireRow=(m:HistoryMessage)=>({...options.allowRemoval?{removed_scope:m.removedScope??null}:{},id:m.id,company_id:companyId,conversation_id:conversationId,sender_id:m.senderId,sender_role:m.senderRole,sequence:m.sequence,accepted_at:new Date(m.acceptedAt).toISOString(),kind:m.kind,body:m.kind==='text'?m.text:null,important:m.important});
  function decode(raw:unknown,before:number|null,existing:readonly HistoryMessage[],seed=false){
    if(!record(raw)||!exactKeys(raw,['items','hasOlder']))throw unavailable();const {items,hasOlder}=raw;
    if(!Array.isArray(items))throw unavailable();const length=items.length;
    if(length>(seed?maxMessages:25)||typeof hasOlder!=='boolean'||!seed&&hasOlder&&length!==25)throw unavailable();
    const ids=new Set(existing.map(row=>row.id)),rows:HistoryMessage[]=[];let last=before??Infinity,bytes=64;
    for(let index=0;index<length;index++){
      const item=items[index];
      if(!record(item)||!exactKeys(item,['id','company_id','conversation_id','sender_id','sender_role','sequence','accepted_at','kind','body','important',...(options.allowRemoval?['removed_scope']:[])]))throw unavailable();
      const {id,company_id,conversation_id,sender_id,sender_role,sequence,accepted_at,kind,body,important}=item;
      if(!uuid(id)||ids.has(id)||company_id!==companyId||conversation_id!==conversationId||!uuid(sender_id)||(sender_role!=='patient'&&sender_role!=='staff')
        ||!Number.isSafeInteger(sequence)||typeof sequence!=='number'||sequence<1||sequence>=last||typeof important!=='boolean'
        ||typeof accepted_at!=='string')throw unavailable();
      let content=decodeMessageProjection(kind,body,important,item.removed_scope,options.allowAudio,options.allowRemoval,options.allowImage);const incoming='removedScope'in content?content.removedScope:undefined,knownMask=removalMasks.get(id);if(incoming){if(!knownMask&&removalMasks.size>=20000)throw unavailable();removalMasks.set(id,knownMask==='all'?'all':incoming);}const mask=removalMasks.get(id);if(mask)content=Object.freeze({kind:'text',text:REMOVED_MESSAGE_TEXT,body:REMOVED_MESSAGE_TEXT,removedScope:mask});
      const acceptedAt=parseHistoryTimestamp(accepted_at);if(acceptedAt===null)throw unavailable();
      const encoded=JSON.stringify({id,company_id,conversation_id,sender_id,sender_role,sequence,accepted_at,kind,body,important});const size=analyzeMessage(encoded).bytes;
      if(size===null||(bytes+=size)>(seed&&progressive?.incremental?16*1024*1024:maxPageBytes))throw unavailable();
      rows.push(Object.freeze({id,companyId,conversationId,senderId:sender_id,senderRole:sender_role,sequence,acceptedAt,kind:content.kind,text:content.text,important:mask?false:important,...(mask?{removedScope:mask}:{})}));ids.add(id);last=sequence;
    }
    return{rows:Object.freeze(rows.reverse()),hasOlder};
  }
  if(options.cachedPage!==undefined){try{const cached=options.cachedPage;checkpoint=record(cached)&&cached.checkpoint===true;const raw=record(cached)&&Object.keys(cached).every(k=>['items','hasOlder','checkpoint'].includes(k))?{items:cached.items,hasOlder:cached.hasOlder}:cached;const page=decode(raw,null,empty,!!progressive);view=Object.freeze({...view,status:'loading',messages:page.rows,hasOlder:page.hasOlder,cachedPresentation:true});}catch{/* Cache corruption never authorizes or blocks a fresh page. */}}
  async function load(mode:'latest'|'older'|'reconcile',poll=false):Promise<boolean>{
    if(!active()){revoke();return false;}if(pending||cancellation)return false;
    if(mode==='reconcile'&&(!progressive?.incremental||view.status!=='ready'||view.busy||view.olderWindow||!view.messages.length))return false;
    if(mode==='older'&&(view.status!=='ready'||view.hasOlder!==true||!view.messages.length))return false;
    const quiet=poll&&mode==='latest'&&view.status==='ready'&&!view.busy&&!view.olderWindow&&view.messages.length>0;
    const previousSnapshot=view,previous=view.messages,before=mode==='older'?previous[0].sequence:mode==='reconcile'?reconcileCursor:null,version=generation,controller=new AbortController();
    let interrupted=false,resolve!:(value:boolean)=>void,cancel=()=>{};
    const interruption=new Promise<boolean>(r=>{resolve=r;});
    const task:Job={controller,previous:previousSnapshot,cancelTimer:()=>cancel(),stop:()=>{if(interrupted)return;interrupted=true;controller.abort();resolve(false);}};pending=task;
    // Keep the already validated window visible while a same-context read is
    // pending. Only a successful latest page replaces it. Any failure, timeout
    // or authorization/context loss still clears it; a generic read error is
    // not evidence that the old data remains authorized.
    // Periodic reconciliation has its own physical admission lock (pending).
    // It must not perturb the visible, already-authorized window merely to poll.
    // Authorization failures/timeouts still clear that window below.
    if(mode!=='reconcile'&&!quiet)publish({status:'loading',busy:true,cachedPresentation:previous.length>0,cancelling:false,readCancelled:false,mode,...(progressive&&mode==='latest'?{syncProgress:{loaded:0,complete:false,limited:false}}:{})});
    const matches=()=>!closed&&!invalid&&generation===version&&pending===task&&!interrupted;
    try{cancel=schedule(()=>{if(!matches())return;task.stop();publish({status:'failed',messages:empty,hasOlder:null,mode:null,olderWindow:false,prunedNewer:0});},timeoutMs);}catch{task.stop();publish({status:'failed',messages:empty,hasOlder:null,mode:null,olderWindow:false,prunedNewer:0});}
    const work=Promise.resolve().then(async()=>{
      try{
        if(!matches())return false;if(!active()){revoke();return false;}
        if(progressive?.incremental&&previous.length&&(mode==='latest'||mode==='reconcile')){
          const wasCheckpoint=checkpoint;let cursor=before,network:HistoryMessage[]=[],hasOlder=true,lowest:number|null=null;const knownIds=new Set(previous.map(m=>m.id));
          for(;;){
            const raw=await readPort({companyId,conversationId,before:cursor,limit:25},controller.signal);if(!matches()||!active())return false;
            const page=decode(raw,cursor,network);network=[...page.rows,...network];hasOlder=page.hasOlder;lowest=page.rows[0]?.sequence??cursor;
            if(mode==='reconcile'||!hasOlder||page.rows.some(m=>knownIds.has(m.id))||network.length>=maxMessages)break;
            cursor=lowest;if(cursor===null)throw unavailable();try{cancel();}catch{}cancel=schedule(()=>{if(matches())task.stop();},timeoutMs);
          }
          const top=before??Infinity,bottom=hasOlder?(lowest??top):0;
          const kept=previous.filter(m=>m.sequence>=top||m.sequence<bottom),combined=[...kept,...network].sort((a,b)=>a.sequence-b.sequence),ids=new Set<string>();
          for(const m of combined){if(ids.has(m.id))throw unavailable();ids.add(m.id);}
          let rows=combined.map(protectRow),limited=false;while(rows.length>maxMessages){rows.shift();limited=true;}let wire=rows.map(wireRow).reverse();
          while(wire.length&&analyzeMessage(JSON.stringify({items:wire,hasOlder:hasOlder})).bytes!>progressive.maxBytes){rows.shift();wire.pop();limited=true;}
          const known=new Map(previous.map(m=>[m.id,m]));rows=rows.map(m=>{const old=known.get(m.id);return old&&Object.keys(m).every(k=>m[k as keyof HistoryMessage]===old[k as keyof HistoryMessage])?old:m;});
          const changed=rows.length!==previous.length||rows.some((m,i)=>m!==previous[i]);
          const deleted=previous.filter(m=>m.sequence<top&&m.sequence>=bottom&&!ids.has(m.id)).map(m=>m.id);
          if(mode==='reconcile'){reconcileCursor=hasOlder?lowest:null;if(!hasOlder&&checkpoint)checkpoint=false;}
          else if(reconcileCursor===null)reconcileCursor=lowest;
          if(reconcileCursor!==null&&rows.length&&reconcileCursor<=rows[0].sequence&&!checkpoint)reconcileCursor=null;
          const older=limited||checkpoint&&hasOlder||previousSnapshot.hasOlder===true&&hasOlder;
          if(changed||checkpoint!==wasCheckpoint||older!==previousSnapshot.hasOlder)progressive.onSnapshot?.({items:wire,hasOlder:older,...(checkpoint?{checkpoint:true}:{})},deleted);
          if(!matches()||!active())return false;publish({status:'ready',busy:false,syncing:false,cachedPresentation:false,messages:changed?Object.freeze(rows):previous,hasOlder:older,mode:null,olderWindow:false,prunedNewer:0,syncProgress:{loaded:rows.length,complete:!older,limited}});return true;
        }
        if(progressive&&mode==='latest'){
          // Each page is separately authorized. Reconcile all retained ranges,
          // including old edits/deletions; sequence-only polling cannot do that.
          let cursor:number|null=null,all:HistoryMessage[]=[],wire:unknown[]=[],hasOlder=true,limited=false;
          const began=Date.now();
          while(hasOlder){
            if(!matches()||!active())return false;
            const raw=await readPort(Object.freeze({companyId,conversationId,before:cursor,limit:25}),controller.signal);
            if(!matches())return false;if(!active()){revoke();return false;}
            const page=decode(raw,cursor,all),input=raw as {items:unknown[];hasOlder:boolean};
            const candidate=[...wire,...input.items];
            if(candidate.length>maxMessages||analyzeMessage(JSON.stringify({items:candidate,hasOlder:page.hasOlder})).bytes!>progressive.maxBytes){limited=true;break;}
            wire=candidate;all=[...page.rows,...all];hasOlder=page.hasOlder;
            if(progressive.incremental&&hasOlder&&(all.length===25||all.length%100===0))progressive.onSnapshot?.({items:Object.freeze(all.map(protectRow).map(wireRow).reverse()),hasOlder:true,checkpoint:true});
            // A warm snapshot stays stable until reconciliation completes.
            if(!quiet)publish({messages:previous.length?previous:Object.freeze([...all]),syncProgress:{loaded:all.length,complete:false,limited:false}});
            if(!matches()||!active())return false;
            if(hasOlder){cursor=page.rows[0]?.sequence??null;if(cursor===null)throw unavailable();}
            if(Date.now()-began>60000&&hasOlder)throw unavailable();
            try{cancel();}catch{}cancel=schedule(()=>{if(matches()){task.stop();publish({status:'failed',messages:empty,hasOlder:null,mode:null});}},timeoutMs);
          }
          const known=new Map(previous.map(row=>[row.id,row]));
          const mapped=all.map(protectRow).map(row=>{const old=known.get(row.id);return old&&Object.keys(row).every(k=>row[k as keyof HistoryMessage]===old[k as keyof HistoryMessage])?old:row;});
          const rows=mapped.length===previous.length&&mapped.every((row,i)=>row===previous[i])?previous:Object.freeze(mapped);
          if(!matches()||!active())return false;
          checkpoint=false;reconcileCursor=null;progressive.onSnapshot?.(Object.freeze({items:Object.freeze(rows.map(wireRow).reverse()),hasOlder:hasOlder||limited}),previous.filter(m=>!all.some(n=>n.id===m.id)).map(m=>m.id));
          if(!matches()||!active())return false;
          publish({status:'ready',cachedPresentation:false,messages:rows,hasOlder:hasOlder||limited,mode:null,olderWindow:false,prunedNewer:0,syncProgress:{loaded:all.length,complete:!hasOlder&&!limited,limited}});
          return matches()&&active();
        }
        const request:HistoryWindowRequest=Object.freeze({companyId,conversationId,before,limit:25});const raw=await readPort(request,controller.signal);
        if(!matches())return false;if(!active()){revoke();return false;}
        const page=decode(raw,before,mode==='older'?previous:empty);if(!matches())return false;if(!active()){revoke();return false;}
        const known=new Map(previous.map(row=>[row.id,row]));const reconciled=page.rows.map(row=>{const old=known.get(row.id);return old&&Object.keys(row).every(k=>row[k as keyof HistoryMessage]===old[k as keyof HistoryMessage])?old:row;});
        const combined=mode==='older'?[...reconciled,...previous]:reconciled,removed=Math.max(0,combined.length-maxMessages);
        const sliced=combined.slice(0,maxMessages),rows=sliced.length===previous.length&&sliced.every((row,i)=>row===previous[i])?previous:Object.freeze(sliced);
        publish({status:'ready',messages:rows,hasOlder:page.hasOlder,mode:null,olderWindow:mode==='older',prunedNewer:mode==='older'?view.prunedNewer+removed:0});
        return matches()&&active();
      }catch{if(matches()){if(!active())revoke();else publish({status:'failed',messages:empty,hasOlder:null,mode:null,olderWindow:false,prunedNewer:0});}return false;}
      finally{
        try{cancel();}catch{}
        if(pending===task){pending=null;if(!closed&&!invalid&&!cancellation)publish({busy:false,cancelling:false,syncing:false});}
      }
    });
    // No unlimited overlapping I/O: timeout settles presentation, but admission
    // stays occupied until a non-cooperative read port actually finishes.
    return Promise.race([work,interruption]);
  }
  function applyRemovals(items:readonly Readonly<{messageId:string;scope:'self'|'all'}>[]){
    if(options.allowRemoval!==true||!active()){if(!active())revoke();return false;}
    if(!Array.isArray(items)||items.length>5000||items.some(m=>!m||!uuid(m.messageId)||!['self','all'].includes(m.scope))||new Set(items.map(m=>m.messageId)).size!==items.length)return false;
    const incoming=new Map(removalMasks);for(const m of items)incoming.set(m.messageId,incoming.get(m.messageId)==='all'?'all':m.scope);
    if(incoming.size>20000){revoke();return false;}for(const [id,scope]of incoming)removalMasks.set(id,scope);
    let changed=false;const rows=view.messages.map(m=>{const scope=removalMasks.get(m.id);if(!scope||scope===m.removedScope)return m;changed=true;return Object.freeze({...m,kind:'text' as const,text:REMOVED_MESSAGE_TEXT,important:false,removedScope:scope});});
    if(changed){publish({messages:Object.freeze(rows)});if(active()&&['ready','loading'].includes(view.status)&&view.messages.length&&!view.olderWindow)progressive?.onSnapshot?.({items:view.messages.map(wireRow).reverse(),hasOlder:view.hasOlder??true,...(checkpoint||view.hasOlder===null?{checkpoint:true}:{})},items.map(m=>m.messageId));}return active();
  }
  function bindCancellation(){
    const task=pending,version=generation;
    if(!active()){revoke();return null;}
    const valid=()=>active()&&pending===task&&generation===version&&!cancellation&&view.status==='loading'&&view.busy&&view.messages===task?.previous.messages;
    if(!task||!validateReadCancellation||task.previous.status!=='ready'||!task.previous.messages.length||!valid())return null;
    let consumed=false;
    return Object.freeze({cancel:async():Promise<boolean>=>{
      if(consumed||!valid())return false;consumed=true;
      const controller=new AbortController();let stopped=false,resolve!:(value:boolean)=>void,stopTimer=()=>{};
      const interruption=new Promise<boolean>(r=>{resolve=r;});
      const gate={stop:()=>{if(stopped)return;stopped=true;controller.abort();resolve(false);}};
      cancellation=gate;const revision=++generation;
      const owns=()=>!closed&&!invalid&&cancellation===gate&&generation===revision&&!stopped;
      try{task.cancelTimer();}catch{}task.stop();
      if(!owns()){gate.stop();return false;}
      publish({busy:true,cancelling:true});
      const fail=()=>{if(!owns())return;if(!active())revoke();else publish({status:'failed',messages:empty,hasOlder:null,mode:null,olderWindow:false,prunedNewer:0,readCancelled:false});};
      try{stopTimer=schedule(()=>{if(!owns())return;fail();gate.stop();},timeoutMs);}catch{fail();gate.stop();}
      const work=Promise.resolve().then(async()=>{
        try{
          if(!owns())return false;if(!active()){revoke();return false;}
          const allowed=await validateReadCancellation(controller.signal);
          if(!owns())return false;if(!active()){revoke();return false;}
          if(allowed!==true){fail();return false;}
          const previous=task.previous;
          publish({status:'ready',messages:previous.messages,hasOlder:previous.hasOlder,olderWindow:previous.olderWindow,prunedNewer:previous.prunedNewer,mode:null,readCancelled:true});
          return owns()&&active();
        }catch{fail();return false;}
        finally{try{stopTimer();}catch{}if(cancellation===gate){cancellation=null;if(!closed&&!invalid)publish({busy:pending!==null,cancelling:pending!==null});}}
      });
      // Both an abandoned page and a non-cooperative validation retain their
      // physical admission until settled. Logical cancellation is never a slot.
      return Promise.race([work,interruption]);
    }});
  }
  function close(){if(closed)return;closed=true;removalMasks.clear();generation++;pending?.stop();cancellation?.stop();publish({status:'closed',cancelling:false,readCancelled:false,busy:false,mode:null,messages:empty,hasOlder:null,olderWindow:false,prunedNewer:0});listeners.clear();}
  return Object.freeze({snapshot:()=>{if(!closed&&!invalid&&!active())revoke(false);return view;},subscribe:(fn:()=>void)=>{if(closed)return()=>{};listeners.add(fn);return()=>{listeners.delete(fn);};},
    applyRemovals,bindCancellation,loadLatest:()=>load('latest'),refreshLatest:()=>load('latest'),pollLatest:()=>load('latest',true),loadOlder:()=>load('older'),reconcileNext:()=>load('reconcile'),close,dispose:close,
  });
}
