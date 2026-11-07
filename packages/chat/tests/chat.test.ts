import test from 'node:test';
import assert from 'node:assert/strict';
import { ensurePatientConversation, sendText, setImportant, listMessages, toAccessSnapshot } from '../src/chat.ts';
import type { ChatStore } from '../src/chat.ts';
import { fixture, principal, now } from '../../access/tests/fixtures.ts';

const store = (): ChatStore => ({ conversations: fixture().conversations, messages: [], audit: [] });
const command = (overrides: Record<string,unknown> = {}) => ({ companyId:'a', conversationId:'chat-a',clientMessageId:'local-1',text:'Mensagem totalmente sintética.',...overrides });
function ok<T extends {ok:boolean}>(result:T): Extract<T,{ok:true}> { assert.equal(result.ok,true); return result as Extract<T,{ok:true}>; }

test('patient conversation is unique per company/patient and patient links remain separate', () => {
  const db=fixture();const initial:ChatStore={conversations:[],messages:[],audit:[]};
  const first=ok(ensurePatientConversation(initial,db,principal('patient-a'),{companyId:'a'},now,()=> 'created-a'));
  assert.deepEqual(first.value,{id:'created-a',companyId:'a',patientId:'patient-a'});
  const repeated=ok(ensurePatientConversation(first.store,db,principal('patient-a'),{companyId:'a'},now,()=>{throw Error('must not allocate');}));
  assert.equal(repeated.store,first.store);
  const second=ok(ensurePatientConversation(first.store,db,principal('patient-a'),{companyId:'b'},now,()=> 'created-b'));
  assert.equal(second.store.conversations.length,2);assert.equal(second.store.audit.length,2);
  assert.equal(initial.conversations.length,0);
  assert.equal(ensurePatientConversation(initial,db,principal('patient-b'),{companyId:'a'},now).ok,false);
  assert.equal(ensurePatientConversation(initial,db,principal('staff-a'),{companyId:'a'},now).ok,false);
  assert.equal(ensurePatientConversation(initial,db,principal('patient-a'),{companyId:'a',patientId:'patient-other'},now).ok,false);
});

test('server derives sender, role, order and timestamp; audit and output omit client receipt/private fields', () => {
  const initial=store();const sent=ok(sendText(initial,fixture(),principal('patient-a'),command(),now,()=> 'server-1'));
  assert.deepEqual(sent.value,{id:'server-1',companyId:'a',conversationId:'chat-a',senderId:'patient-a',senderRole:'patient',sequence:1,acceptedAt:now,kind:'text',text:command().text,important:false});
  assert.equal('clientMessageId' in sent.value,false);
  assert.equal(JSON.stringify(sent.store.audit).includes(command().text),false);
  assert.equal(JSON.stringify(sent.store.audit).includes('local-1'),false);
  assert.equal(initial.messages.length,0);assert.equal(initial.audit.length,0);
  for(const extra of ['senderId','senderRole','sequence','acceptedAt','important','kind','id','patientId','debug']) {
    assert.deepEqual(sendText(initial,fixture(),principal('patient-a'),command({[extra]:'forged'}),now),{ok:false,code:'INVALID_INPUT'});
  }
});

test('retry after response loss returns same message once; different payload conflicts without echo', () => {
  const sent=ok(sendText(store(),fixture(),principal('patient-a'),command(),now,()=> 'server-1'));
  const retry=ok(sendText(sent.store,fixture(),principal('patient-a'),command(),now+100,()=>{throw Error('must not allocate');}));
  assert.deepEqual(retry.value,sent.value);assert.equal(retry.store,sent.store);assert.equal(retry.store.audit.length,1);
  assert.deepEqual(sendText(sent.store,fixture(),principal('patient-a'),command({text:'Outro conteúdo sintético'}),now),{ok:false,code:'CONFLICT'});
  assert.equal(sent.store.messages.length,1);
});

test('receipt key is scoped to sender/company/conversation and all approved employees can reply', () => {
  const db=fixture();const one=ok(sendText(store(),db,principal('patient-a'),command(),now,()=> 'server-1'));
  const two=ok(sendText(one.store,db,principal('staff-a'),command({text:'Resposta sintética A'}),now,()=> 'server-2'));
  const three=ok(sendText(two.store,db,principal('staff-a2'),command({text:'Resposta sintética B'}),now,()=> 'server-3'));
  assert.deepEqual(three.store.messages.map(m=>m.sequence),[1,2,3]);assert.equal(three.value.senderRole,'staff');
  const other=ok(sendText(three.store,db,principal('patient-a'),command({companyId:'b',conversationId:'chat-a-in-b'}),now,()=> 'server-b'));
  assert.equal(other.value.sequence,1);assert.equal(other.value.companyId,'b');
});

test('cross-patient/company, manager-only, ADM, pending and revoked actors cannot send or list', () => {
  const db=fixture();const initial=store();
  for(const user of ['patient-other','patient-b','staff-b','manager-a','manager-b','admin','pending','revoked','new-user']) {
    assert.deepEqual(sendText(initial,db,principal(user),command(),now),{ok:false,code:'UNAVAILABLE'},user);
    assert.deepEqual(listMessages(initial,db,principal(user),{companyId:'a',conversationId:'chat-a',after:0,limit:20},now),{ok:false,code:'UNAVAILABLE'},user);
  }
  assert.deepEqual(sendText(initial,db,principal('staff-b'),command({companyId:'b'}),now),{ok:false,code:'UNAVAILABLE'});
  assert.deepEqual(sendText(initial,db,principal('patient-a'),command({conversationId:'missing'}),now),{ok:false,code:'UNAVAILABLE'});
  assert.deepEqual(sendText(initial,db,null,command(),now),{ok:false,code:'UNAVAILABLE'});
});

test('authorization is re-evaluated before returning a retry receipt after revocation', () => {
  const db=fixture();const sent=ok(sendText(store(),db,principal('staff-a'),command(),now,()=> 'server-1'));
  const revoked={...db,memberships:db.memberships.map(m=>m.userId==='staff-a'?{...m,state:'revoked' as const}:m)};
  assert.deepEqual(sendText(sent.store,revoked,principal('staff-a'),command(),now),{ok:false,code:'UNAVAILABLE'});
  assert.deepEqual(listMessages(sent.store,revoked,principal('staff-a'),{companyId:'a',conversationId:'chat-a',after:0,limit:20},now),{ok:false,code:'UNAVAILABLE'});
});

test('text limits accept Unicode graphemes, preserve whitespace and reject controls/empty/oversize', () => {
  for(const text of ['', ' \n\t ', 'x'.repeat(2001), 'x\0y', 'x\u007fy']) assert.deepEqual(sendText(store(),fixture(),principal('patient-a'),command({text}),now),{ok:false,code:'INVALID_INPUT'});
  for(const text of ['😀'.repeat(2000),' Linha\ncom tab\t e espaço ']) {
    const sent=ok(sendText(store(),fixture(),principal('patient-a'),command({text}),now,()=> 'unicode'));
    assert.equal(sent.value.text,text);
  }
  for(const value of [null,[],{},42,{...command(),clientMessageId:'bad/id'}, {...command(),text:5}]) assert.equal(sendText(store(),fixture(),principal('patient-a'),value,now).ok,false);
});

test('ID collision and invalid server time make no partial mutation', () => {
  const initial=store();
  assert.deepEqual(sendText(initial,fixture(),principal('patient-a'),command(),now,()=> 'chat-a'),{ok:false,code:'RETRY_LATER'});
  assert.deepEqual(sendText(initial,fixture(),principal('patient-a'),command(),now,()=> 'unsafe/id'),{ok:false,code:'RETRY_LATER'});
  for(const time of [NaN,Infinity,-1,1.5]) assert.deepEqual(sendText(initial,fixture(),principal('patient-a'),command(),time),{ok:false,code:'UNAVAILABLE'});
  assert.equal(initial.messages.length,0);assert.equal(initial.audit.length,0);
});

test('importance is an idempotent staff-only assignment; retries do not toggle it accidentally', () => {
  const db=fixture();const sent=ok(sendText(store(),db,principal('patient-a'),command(),now,()=> 'server-1'));
  const input={companyId:'a',messageId:'server-1',important:true};
  for(const user of ['patient-a','staff-b','pending','revoked','manager-a','admin']) assert.deepEqual(setImportant(sent.store,db,principal(user),input,now),{ok:false,code:'UNAVAILABLE'});
  const changed=ok(setImportant(sent.store,db,principal('staff-a'),input,now));assert.equal(changed.value.important,true);
  const retry=ok(setImportant(changed.store,db,principal('staff-a2'),input,now));assert.equal(retry.store,changed.store);assert.equal(changed.store.audit.length,2);
  assert.equal(ok(setImportant(changed.store,db,principal('staff-a'),{...input,important:false},now)).value.important,false);
  assert.deepEqual(setImportant(sent.store,db,principal('staff-b'),{...input,companyId:'b'},now),{ok:false,code:'UNAVAILABLE'});
  assert.equal(setImportant(sent.store,db,principal('staff-a'),{...input,senderId:'forged'},now).ok,false);
});

test('pagination uses per-conversation server order, handles equal timestamps and projects only public message fields', () => {
  const db=fixture();let current=store();
  for(let n=1;n<=5;n++) current=ok(sendText(current,db,principal('patient-a'),command({clientMessageId:`local-${n}`,text:`Sintético ${n}`}),now,()=>`server-${n}`)).store;
  current=ok(sendText(current,db,principal('patient-a'),command({companyId:'b',conversationId:'chat-a-in-b'}),now,()=> 'other-company')).store;
  const first=ok(listMessages(current,db,principal('patient-a'),{companyId:'a',conversationId:'chat-a',after:0,limit:2},now));
  assert.deepEqual(first.value.map(m=>m.sequence),[1,2]);assert.equal(first.nextAfter,2);
  const second=ok(listMessages(current,db,principal('staff-a2'),{companyId:'a',conversationId:'chat-a',after:2,limit:2},now));
  const third=ok(listMessages(current,db,principal('patient-a'),{companyId:'a',conversationId:'chat-a',after:second.nextAfter!,limit:2},now));
  assert.deepEqual([...first.value,...second.value,...third.value].map(m=>m.id),['server-1','server-2','server-3','server-4','server-5']);
  assert.equal(third.nextAfter,null);assert.equal(first.value.some(m=>'clientMessageId' in m),false);
  for(const args of [{after:-1,limit:20},{after:0,limit:0},{after:0,limit:101},{after:NaN,limit:20}]) assert.equal(listMessages(current,db,principal('patient-a'),{companyId:'a',conversationId:'chat-a',...args},now).ok,false);
  assert.equal(toAccessSnapshot(current,db).messages.length,6);
});

test('ambiguous own-patient and staff role cannot silently choose authorship', () => {
  const db=fixture();const dual={...db,memberships:[...db.memberships,{userId:'patient-a',companyId:'a',role:'staff' as const,state:'active' as const}]};
  assert.deepEqual(sendText(store(),dual,principal('patient-a'),command(),now),{ok:false,code:'UNAVAILABLE'});
});
