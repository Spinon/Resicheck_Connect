import test from 'node:test';
import assert from 'node:assert/strict';
import { createTextHistory } from '../src/text-history.ts';
import type { HistoryRequest } from '../src/text-history.ts';
import { sendText, listMessages } from '../../chat/src/chat.ts';
import type { ChatStore } from '../../chat/src/chat.ts';
import { fixture, principal, now } from '../../access/tests/fixtures.ts';

const context = { sessionKey: 'synthetic-login-1', userId: 'patient-a', companyId: 'a', conversationId: 'chat-a' };
function deferred() {
  let resolve!: (value: unknown) => void, reject!: (error: unknown) => void;
  const promise = new Promise<unknown>((yes,no)=>{resolve=yes;reject=no;});
  return { promise, resolve, reject };
}
function setup(maxMessages = 10) {
  const timers = new Set<()=>void>(), calls: {request: HistoryRequest; reply: ReturnType<typeof deferred>}[] = [];
  const history = createTextHistory({ timeoutMs: 5000, pageSize: 2, maxMessages,
    schedule: (cb,delay)=>{assert.equal(delay,5000);timers.add(cb);return()=>{timers.delete(cb);};},
    transport: request=>{const reply=deferred();calls.push({request,reply});return reply.promise;},
  });
  return {history,handle:history.openContext(context),calls,timers};
}
function row(sequence:number, patch:Record<string,unknown>={}) {
  return {id:`m-${sequence}`,companyId:'a',conversationId:'chat-a',senderId:'staff-a',senderRole:'staff',
    kind:'text',text:'  👩🏽‍⚕️ 👨‍👩‍👧‍👦 e\u0301\n',sequence,acceptedAt:now,important:false,...patch};
}
const page = (rows:unknown[],nextAfter:number|null=null) => ({ok:true,value:rows,nextAfter});

test('pages are ordered, immutable and projected; empty refresh keeps watermark; concurrent load shares one request',async()=>{
  const f=setup(), first=f.handle.loadNext();assert.equal(f.handle.loadNext(),first);
  assert.equal(f.handle.snapshot().status,'loading');assert.equal(f.calls.length,1);
  assert.deepEqual(f.calls[0].request,{companyId:'a',conversationId:'chat-a',after:0,limit:2});
  assert(Object.isFrozen(f.calls[0].request));
  const response=page([row(1,{debug:'PRIVATE_DIAGNOSTIC',clientMessageId:'secret'}),row(2)],2);
  f.calls[0].reply.resolve({...response,rawLog:'PRIVATE_ENVELOPE'});assert.equal(await first,'loaded');
  response.value.length=0;
  const snapshot=f.handle.snapshot();assert.equal(snapshot.messages.length,2);assert.equal(snapshot.hasMore,true);
  assert(Object.isFrozen(snapshot)&&Object.isFrozen(snapshot.messages)&&Object.isFrozen(snapshot.messages[0]));
  assert(!/PRIVATE|clientMessageId/.test(JSON.stringify(snapshot)));
  const second=f.handle.loadNext();assert.equal(f.calls[1].request.after,2);
  f.calls[1].reply.resolve(page([row(4)]));await second;
  assert.deepEqual(f.handle.snapshot().messages.map(m=>m.sequence),[1,2,4]); // sequences need not be contiguous
  assert.equal(f.handle.snapshot().hasMore,false);
  const refresh=f.handle.loadNext();assert.equal(f.calls[2].request.after,4);
  f.calls[2].reply.resolve(page([]));await refresh;
  assert.equal(f.handle.snapshot().after,4);assert.equal(f.handle.snapshot().messages[0].text,row(1).text);
  assert.equal(f.timers.size,0);
});

test('invalid, foreign or mixed pages are rejected atomically without exposing their payload',async()=>{
  const invalid = [
    null,{},page([row(1,{companyId:'b'})]),page([row(1,{conversationId:'chat-b'})]),
    page([row(1),row(2,{companyId:'b',text:'FOREIGN_SECRET'})]),page([row(2),row(1)]),
    page([row(1),row(2,{id:'m-1'})]),page([row(1),row(1,{id:'another'})]),
    page([row(1,{senderRole:'admin'})]),page([row(1,{kind:'audio'})]),page([row(1,{important:'true'})]),
    page([row(1,{acceptedAt:-1})]),page([row(1,{sequence:1.5})]),page([row(1,{text:'\ud800'})]),
    page([row(1,{text:'x'.repeat(2001)})]),page([row(1)],2),page([],1),
    page([row(1),row(2),row(3)]),{ok:true,value:[row(1)]},{ok:false,code:'SQL_PRIVATE_ERROR',detail:'PRIVATE'},
    {get ok(){throw Error('PRIVATE_GETTER');}},
  ];
  for(const reply of invalid){
    const f=setup(), pending=f.handle.loadNext();f.calls[0].reply.resolve(reply);
    assert.equal(await pending,'failed');const state=f.handle.snapshot();
    assert.equal(state.error?.code,'INVALID_RESPONSE');assert.deepEqual(state.messages,[]);assert.equal(state.after,0);
    assert(!/FOREIGN|SECRET|PRIVATE/.test(JSON.stringify(state)));assert.equal(f.timers.size,0);
  }
  // A replay/overlap from the server cannot append a second copy of an already loaded ID.
  const f=setup(), first=f.handle.loadNext();f.calls[0].reply.resolve(page([row(1)],1));await first;
  const overlap=f.handle.loadNext();f.calls[1].reply.resolve(page([row(2,{id:'m-1',text:'OVERLAP'})]));
  assert.equal(await overlap,'failed');assert.equal(f.handle.snapshot().after,1);
  assert.deepEqual(f.handle.snapshot().messages.map(m=>m.text),[row(1).text]);
});

test('network/timeout retain prior safe page; explicit retry starts same cursor; late timed-out page cannot mutate',async()=>{
  const f=setup(), first=f.handle.loadNext();f.calls[0].reply.resolve(page([row(1)],1));await first;
  const failure=f.handle.loadNext();f.calls[1].reply.reject(Error('PRIVATE_NETWORK_TRACE'));assert.equal(await failure,'failed');
  assert.equal(f.handle.snapshot().error?.code,'NETWORK');assert.equal(f.handle.snapshot().messages.length,1);
  const slow=f.handle.loadNext();for(const cb of [...f.timers])cb();assert.equal(await slow,'failed');
  assert.equal(f.handle.snapshot().error?.code,'TIMEOUT');assert.equal(f.handle.snapshot().after,1);
  const retry=f.handle.loadNext();assert.deepEqual(f.calls[2].request,f.calls[3].request);
  f.calls[3].reply.resolve(page([row(2)]));await retry;
  f.calls[2].reply.resolve(page([row(2,{text:'STALE_TIMEOUT'})]));await Promise.resolve();
  assert.equal(f.handle.snapshot().messages[1].text,row(2).text);assert.equal(f.timers.size,0);
});

test('switch A→B→A, repeat login and logout discard old replies and old handles never expose new context',async()=>{
  const f=setup(), old=f.handle.loadNext();
  const b=f.history.openContext({...context,companyId:'b',conversationId:'chat-b'});assert.equal(await old,'discarded');
  assert.deepEqual(f.handle.snapshot().messages,[]);assert.equal(await f.handle.loadNext(),'discarded');
  const bp=b.loadNext();const a=f.history.openContext(context);assert.equal(await bp,'discarded');
  f.calls[0].reply.resolve(page([row(1,{text:'OLD_A'})]));f.calls[1].reply.resolve(page([row(1,{companyId:'b',conversationId:'chat-b'})]));
  await Promise.resolve();assert.equal(a.snapshot().messages.length,0);
  const fresh=a.loadNext();const login=f.history.openContext({...context,sessionKey:'synthetic-login-2'});assert.equal(await fresh,'discarded');
  const logout=login.loadNext();f.history.signOut();assert.equal(await logout,'discarded');
  f.calls[2].reply.resolve(page([row(2)]));f.calls[3].reply.resolve(page([row(3)]));await Promise.resolve();
  assert.deepEqual(login.snapshot().messages,[]);assert.equal(f.timers.size,0);
});

test('unavailable wipes cached text and cursor and locks handle until explicit context activation',async()=>{
  const f=setup(), first=f.handle.loadNext();f.calls[0].reply.resolve(page([row(1)],1));await first;
  const denied=f.handle.loadNext();f.calls[1].reply.resolve({ok:false,code:'UNAVAILABLE',debug:'PRIVATE'});
  assert.equal(await denied,'unavailable');assert.deepEqual(f.handle.snapshot().messages,[]);assert.equal(f.handle.snapshot().after,0);
  assert.equal(f.handle.snapshot().status,'unavailable');assert.equal(await f.handle.loadNext(),'unavailable');assert.equal(f.calls.length,2);
});

test('capacity is bounded with adjusted last page and no silent eviction or unbounded request',async()=>{
  const f=setup(3), first=f.handle.loadNext();f.calls[0].reply.resolve(page([row(1),row(2)],2));await first;
  const last=f.handle.loadNext();assert.equal(f.calls[1].request.limit,1);f.calls[1].reply.resolve(page([row(3)],3));await last;
  assert.equal(await f.handle.loadNext(),'failed');assert.equal(f.calls.length,2);assert.equal(f.handle.snapshot().error?.code,'CAPACITY');
  assert.equal(f.handle.snapshot().messages.length,3);assert.equal(f.handle.snapshot().after,3);
});

test('sync schedule, throwing transport/cancellation and reentrant logout do not strand state or leak a reply',async()=>{
  let calls=0;
  const immediate=createTextHistory({timeoutMs:1,schedule:cb=>{cb();return()=>{};},transport:async()=>{calls++;return page([]);}});
  const i=immediate.openContext(context);assert.equal(await i.loadNext(),'failed');assert.equal(i.snapshot().error?.code,'TIMEOUT');assert.equal(calls,0);
  const throwing=createTextHistory({timeoutMs:1,schedule:()=>()=>{throw Error('cleanup');},transport:()=>{throw Error('PRIVATE');}});
  const t=throwing.openContext(context);assert.equal(await t.loadNext(),'failed');assert.equal(t.snapshot().error?.code,'NETWORK');
  let history:ReturnType<typeof createTextHistory>;
  history=createTextHistory({timeoutMs:1,schedule:()=>()=>{},transport:async()=>{calls++;return page([]);}});
  const h=history.openContext(context,()=>{history.signOut();throw Error('observer');});assert.equal(await h.loadNext(),'discarded');
  assert.deepEqual(h.snapshot().messages,[]);assert.equal(calls,0);
});

test('reference server integration reauthorizes pages; patient/staff see own company, outsider/admin/revoked cannot',async()=>{
  let authority=fixture(), store:ChatStore={conversations:authority.conversations,messages:[],audit:[]};
  for(let n=1;n<=3;n++){
    const sent=sendText(store,authority,principal('patient-a'),{companyId:'a',conversationId:'chat-a',clientMessageId:`synthetic-${n}`,text:`Guia fictícia ${n} 👩🏽‍⚕️`},now,()=>`server-${n}`);
    assert(sent.ok);store=sent.store;
  }
  let user='patient-a';
  const history=createTextHistory({pageSize:2,timeoutMs:1000,schedule:(cb,ms)=>{const id=setTimeout(cb,ms);return()=>clearTimeout(id);},
    transport:async request=>JSON.parse(JSON.stringify(listMessages(store,authority,principal(user,user==='admin'?['users:metadata:read','companies:metadata:read','audit:read']:[]),request,now))),
  });
  const patient=history.openContext(context);assert.equal(await patient.loadNext(),'loaded');assert.equal(patient.snapshot().messages.length,2);
  assert.equal(await patient.loadNext(),'loaded');assert.equal(patient.snapshot().messages.length,3);
  user='staff-a';const staff=history.openContext({...context,userId:user});assert.equal(await staff.loadNext(),'loaded');
  authority={...authority,memberships:authority.memberships.map(m=>m.userId==='staff-a'?{...m,state:'revoked' as const}:m)};
  assert.equal(await staff.loadNext(),'unavailable');assert.deepEqual(staff.snapshot().messages,[]);
  user='staff-a2';const teammate=history.openContext({...context,userId:user});assert.equal(await teammate.loadNext(),'loaded');
  for(const outsider of ['staff-b','patient-b','patient-other','manager-a','pending','admin']){
    user=outsider;const handle=history.openContext({...context,userId:user});assert.equal(await handle.loadNext(),'unavailable');assert.deepEqual(handle.snapshot().messages,[]);
  }
  history.signOut();
});
