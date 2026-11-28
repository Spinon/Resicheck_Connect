import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createMembershipRecentBridge} from '../src/membership-recent-bridge.ts';
import {createNormalConversationImages} from '../src/normal-conversation-images.ts';
import {createConversationCache} from '../src/conversation-cache.ts';
import {planRecordChange,type CacheRecordState,type CacheRecordChange} from '../src/cache-record-store.ts';

const id=(n:number)=>'27220000-0000-4000-8000-'+String(n).padStart(12,'0');
const scope={userId:id(1),companyId:id(2),conversationId:id(3)};
const bytes=new Uint8Array([137,80,78,71,13,10,26,10]);
const descriptor={companyId:scope.companyId,conversationId:scope.conversationId,messageId:id(4),attachmentId:id(5),byteLength:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),mime:'image/png' as const,width:1,height:1,mode:'original' as const};
const audio={companyId:scope.companyId,conversationId:scope.conversationId,attachmentId:id(6),byteLength:bytes.length,sha256:descriptor.sha256};
const row={id:id(4),company_id:scope.companyId,conversation_id:scope.conversationId,sender_id:id(7),sender_role:'staff' as const,sequence:2,accepted_at:'2026-11-26T01:00:00Z',kind:'image' as const,body:null,important:false,removed_scope:null};
const tick=()=>new Promise(r=>setImmediate(r));
async function until(fn:()=>boolean){for(let i=0;i<100&&!fn();i++)await tick();assert(fn(),'bridge did not reach expected state');}

function recordStore(){
 const accounts=new Map<string,CacheRecordState>(),data=new Map<string,Uint8Array>();let revision=100,pageWrites=0;
 return {pageWrites:()=>pageWrites,read:async()=>null,write:async()=>{},records:{
  async open(user:string){if(!accounts.has(user))accounts.set(user,{generation:id(++revision),automatic:false,limitMb:100,limitBytes:100*1048576,availableBytes:null,migrated:true,records:[]});return structuredClone(accounts.get(user)!);},
  async get(user:string,generation:string,key:string){assert.equal(accounts.get(user)!.generation,generation);return data.get(user+'/'+key)?.slice()??null;},
  async apply(user:string,generation:string,change:CacheRecordChange){if(change.put?.kind==="page")pageWrites++;const prior=accounts.get(user)!;assert.equal(prior.generation,generation);const plan=planRecordChange(prior,change,Date.now(),null);for(const key of plan.removed)data.delete(user+'/'+key);if(change.put&&plan.state.records.some(r=>r.key===change.put!.key))data.set(user+'/'+change.put.key,change.put.bytes.slice());const next={...plan.state,generation:id(++revision)};accounts.set(user,next);return structuredClone(next);}
 }};
}

async function fixture(historical=false){
 const store=recordStore(),cache=createConversationCache(store);await cache.bind(scope.userId);
 const history=historical?[row,{...row,id:id(10),sequence:1,kind:'text' as const,body:'Mensagem removida',removed_scope:'all' as const}]:[row];
 cache.putPage(scope,{items:history,hasOlder:false},cache.ticket());cache.putImage(scope,descriptor,bytes,cache.ticket());cache.putAudio(scope,audio,bytes,cache.ticket());await cache.flush();
 const listeners=new Set<()=>void>(),emit=()=>{for(const fn of [...listeners])fn();};
 let auth={status:'authenticated',userId:scope.userId,companyId:null as string|null,companyLoading:false,error:null};
 let membership={stage:'ready',scopeKey:1,context:null as null|{companyId:string;companyName:string;conversationId:string;kind:'patient'}};
 let removed=false,deny=false,operations=200,scans=0,downloads=0,reads=0;
 let duringScan:(()=>Promise<void>)|undefined;
 const lease={userId:scope.userId,sessionKey:'synthetic-only',close:()=>{},openConversation:()=>{
  let active=true;return {active:()=>active,onClose:()=>()=>{},close:()=>{active=false;},rpc:async()=>({data:null,error:{code:'42501'}}),history:async()=>({ok:false}),imageTransfer:{active:()=>active,busy:()=>false,resolve:async()=>{if(deny||removed)throw Error('Synthetic denied');return descriptor;},read:async()=>{if(deny||removed)throw Error('Synthetic denied');downloads++;return {descriptor,bytes:bytes.slice()};}},revalidateAccess:async()=>active&&!deny,
   messageRemoval:async()=>{scans++;await duringScan?.();if(deny)throw Error('Synthetic denied');return {companyId:scope.companyId,conversationId:scope.conversationId,through:removed?'2':historical?'1':'0',latest:removed?'2':historical?'1':'0',hasMore:false,items:[...(historical?[{messageId:id(10),scope:'all'}]:[]),...(removed?[{messageId:id(4),scope:'all'}]:[])]};},
   // Return the original even after removal to exercise the stale read mask.
   readRecent:async()=>{reads++;return {items:history,hasOlder:false};}};}};
 const bridge=createMembershipRecentBridge({cache,imageHistory:'placeholder-only',messageRemoval:true,conversationAccess:{now:()=>1000,intervalMs:1000,timeoutMs:500},
  auth:{snapshot:()=>auth,currentLease:()=>lease,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};},selectCompany:async(companyId:string)=>{auth={...auth,companyId};emit();return true;},signOut:async()=>{}} as never,
  members:{snapshot:()=>membership,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};},retireConversation:()=>{membership={...membership,context:null};emit();return true;},leaveConversation:()=>{membership={...membership,context:null};emit();return true;},reload:async()=>true,updateConversationUnread:()=>false} as never,
  gate:{matches:()=>true,subscribe:()=>()=>{}},createId:()=>id(++operations),schedule:()=>()=>{},timeoutMs:500});
 const images=createNormalConversationImages({cache,recent:bridge,foreground:()=>true,createPort:()=>({pick:async()=>null,prepare:async()=>{throw Error('Unused');},owns:()=>false,read:async()=>new Uint8Array(),release(){},dispose(){}}),createResource:async()=>({preview:{uri:'blob:synthetic',name:'Imagem',mime:'image/png',bytes:bytes.length,width:1,height:1,mode:'original',profile:null},release(){}}),digest:async b=>createHash('sha256').update(b).digest('hex'),createId:()=>id(++operations),schedule:()=>()=>{},now:Date.now,timeoutMs:500});
 return {cache,store,bridge,images,reads:()=>reads,duringScan:(f:()=>Promise<void>)=>{duringScan=f;},downloads:()=>downloads,scans:()=>scans,remove:()=>{removed=true;},deny:()=>{deny=true;},open:async()=>{membership={...membership,context:{companyId:scope.companyId,companyName:'Synthetic company',conversationId:scope.conversationId,kind:'patient'}};emit();await until(()=>['chat','unavailable'].includes(bridge.snapshot().route));await tick();await cache.flush();await tick();}};
}

test('empty removal scan preserves received image and audio across actual bridge leave/reentry and fresh cache owner',async()=>{
 const f=await fixture();try{
  f.cache.purgeImage(scope,id(4));await f.cache.flush();
  await f.open();assert.equal(f.bridge.snapshot().route,'chat');const first=f.images.readerFor(f.bridge.snapshot().host!)!(id(4));await first.load();assert.equal(first.snapshot().phase,'ready');await f.cache.flush();assert.equal(f.downloads(),1);
  const oldScope=f.bridge.captureMediaScope();assert(oldScope);assert(oldScope.current());await f.bridge.back();assert.equal(oldScope.current(),false);
  await f.open();assert.equal(f.scans(),2);assert.equal(oldScope.current(),false);assert(f.bridge.captureMediaScope()?.current());
  const second=f.images.readerFor(f.bridge.snapshot().host!)!(id(4));await second.load();assert.equal(second.snapshot().phase,'ready');assert.equal(first.snapshot().phase,'closed');assert.equal(f.downloads(),1);
  assert.deepEqual((await f.cache.image(scope,id(4)))?.bytes,bytes);assert.deepEqual(await f.cache.audio(scope,audio),bytes);
  const fresh=createConversationCache(f.store);await fresh.bind(scope.userId);assert.deepEqual((await fresh.image(scope,id(4)))?.bytes,bytes);
  assert.equal(await fresh.image({...scope,companyId:id(9)},id(4)),null);assert.equal(await fresh.image({...scope,conversationId:id(9)},id(4)),null);
  await fresh.bind(id(8));assert.equal(await fresh.image({...scope,userId:id(8)},id(4)),null);assert.equal(await fresh.audio({...scope,userId:id(8)},audio),null);
 }finally{f.images.dispose();f.bridge.dispose();}
});

test('effective removal invalidates image and masks stale original on repeated reentry; denied access stays closed',async()=>{
 const f=await fixture();try{
  await f.open();await f.bridge.back();f.remove();await f.open();
  assert.equal(f.bridge.snapshot().route,'chat');assert.equal(f.images.readerFor(f.bridge.snapshot().host!)!.available!(id(4)),false);assert.equal(await f.cache.image(scope,id(4)),null);
  assert.equal(f.bridge.snapshot().host!.history.snapshot().messages[0].removedScope,'all');assert.deepEqual(await f.cache.audio(scope,audio),bytes);
  await f.bridge.back();await f.open();assert.equal(await f.cache.image(scope,id(4)),null);
  assert.equal(f.bridge.snapshot().host!.history.snapshot().messages[0].removedScope,'all');
  assert.equal((await f.cache.page(scope))!.items[0].removed_scope,'all');
  await f.bridge.back();f.deny();await f.open();assert.equal(f.bridge.snapshot().route,'unavailable');assert.equal(f.bridge.snapshot().host,null);
 }finally{f.images.dispose();f.bridge.dispose();}
});


test('historical tombstone replay preserves unrelated image and audio on reentry',async()=>{
 const f=await fixture(true);try{await f.open();assert.deepEqual((await f.cache.image(scope,id(4)))?.bytes,bytes);await f.bridge.back();await f.open();assert.deepEqual((await f.cache.image(scope,id(4)))?.bytes,bytes);assert.deepEqual(await f.cache.audio(scope,audio),bytes);}finally{f.images.dispose();f.bridge.dispose();}
});

test('image invalidation fences an already captured write ticket',async()=>{
 const f=await fixture();try{const stale=f.cache.ticket();f.cache.purgeImage(scope,id(4));f.cache.putImage(scope,descriptor,bytes,stale);await f.cache.flush();assert.equal(await f.cache.image(scope,id(4)),null);assert.deepEqual(await f.cache.audio(scope,audio),bytes);}finally{f.images.dispose();f.bridge.dispose();}
});


test('a removal batch keeps every targeted deletion while rejecting older writes',async()=>{
 const f=await fixture();try{const other={...descriptor,messageId:id(11)};f.cache.putImage(scope,other,bytes,f.cache.ticket());await f.cache.flush();const stale=f.cache.ticket();f.cache.purgeImage(scope,id(4));f.cache.purgeImage(scope,id(11));f.cache.putImage(scope,descriptor,bytes,stale);await f.cache.flush();assert.equal(await f.cache.image(scope,id(4)),null);assert.equal(await f.cache.image(scope,id(11)),null);assert.deepEqual(await f.cache.audio(scope,audio),bytes);}finally{f.images.dispose();f.bridge.dispose();}
});

test('identical protected disk pages open without a page write and still reconcile with the server',async()=>{
 for(const tombstone of [false,true]){
  const f=await fixture(tombstone);
  try{
   const writes=f.store.pageWrites();
   await f.open();await f.bridge.back();await f.open();
   assert.equal(f.scans(),2);assert.equal(f.reads(),2);
   assert.equal(f.store.pageWrites(),writes);
   assert.equal(f.bridge.snapshot().host!.history.snapshot().status,'ready');
   if(tombstone)assert.equal((await f.cache.page(scope))!.items[1].removed_scope,'all');
  }finally{f.images.dispose();f.bridge.dispose();}
 }
});

test('a new removal persists its projection; a repeated scan avoids the same write',async()=>{
 const f=await fixture();
 try{
  const before=f.store.pageWrites();f.remove();await f.open();
  assert.equal(f.store.pageWrites(),before+1);
  assert.equal((await f.cache.page(scope))!.items[0].removed_scope,'all');
  await f.bridge.back();await f.open();assert.equal(f.store.pageWrites(),before+1);
  assert.equal(await f.cache.image(scope,id(4)),null);
 }finally{f.images.dispose();f.bridge.dispose();}
});

test('eviction during the removal scan falls back to network hydration even for an identical page',async()=>{
 const f=await fixture();
 try{
  const before=f.store.pageWrites();
  f.duringScan(async()=>{assert(await f.cache.clear());});
  await f.open();assert.equal(f.scans(),1);assert.equal(f.reads(),1);
  assert.equal(f.bridge.snapshot().host!.history.snapshot().status,'ready');
  assert.equal(f.store.pageWrites(),before+1);
  assert.equal((await f.cache.page(scope))!.items[0].id,id(4));
 }finally{f.images.dispose();f.bridge.dispose();}
});
