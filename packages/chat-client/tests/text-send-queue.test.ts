import test from 'node:test';
import assert from 'node:assert/strict';
import { createTextSendQueue } from '../src/text-send-queue.ts';
import type { SendContext, TextSendRequest } from '../src/text-send-queue.ts';
import { sendText } from '../../chat/src/chat.ts';
import type { ChatStore } from '../../chat/src/chat.ts';
import { fixture, principal, now } from '../../access/tests/fixtures.ts';

const context: SendContext = { sessionKey: 'synthetic-login-1', userId: 'patient-a', companyId: 'a', conversationId: 'chat-a' };
function deferred<T = unknown>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function clock() {
  const callbacks = new Map<number, () => void>(); let id = 0;
  return {
    callbacks,
    schedule(callback: () => void, delay: number) {
      assert.equal(delay, 5000); const key = ++id; callbacks.set(key, callback);
      return () => { callbacks.delete(key); };
    },
    expire() { const copy = [...callbacks.values()]; callbacks.clear(); for (const callback of copy) callback(); },
  };
}
function setup() {
  const timer = clock(); const calls: { request: TextSendRequest; reply: ReturnType<typeof deferred> }[] = []; let id = 0;
  const queue = createTextSendQueue({ timeoutMs: 5000, schedule: timer.schedule, createId: () => `intent-${++id}`,
    transport: request => { const reply = deferred(); calls.push({ request, reply }); return reply.promise; } });
  const handle = queue.openContext(context);
  return { queue, handle, timer, calls };
}
function add(handle: ReturnType<ReturnType<typeof createTextSendQueue>['openContext']>, text = 'Mensagem sintética') {
  const result = handle.enqueue(text); assert.equal(result.ok, true);
  if (!result.ok) throw Error('Synthetic enqueue failed');
  return result.clientMessageId;
}
function ack(request: TextSendRequest, patch: Record<string, unknown> = {}) {
  return { ok: true, value: { id: 'server-message', companyId: request.companyId, conversationId: request.conversationId,
    senderId: context.userId, senderRole: 'patient', sequence: 1, acceptedAt: now, kind: 'text', text: request.text, important: false, ...patch } };
}

test('pending is explicit; duplicate send shares one attempt; accepted receipt is immutable and minimal', async () => {
  const f = setup(); const id = add(f.handle);
  assert.equal(f.calls.length, 0); assert.equal(f.handle.snapshot()[0].status, 'pending');
  const first = f.handle.send(id); assert.equal(f.handle.snapshot()[0].status, 'sending');
  assert.equal(f.handle.send(id), first); assert.equal(f.calls.length, 1);
  const reply = { ...ack(f.calls[0].request), debug: 'PRIVATE_DIAGNOSTIC' };
  f.calls[0].reply.resolve(reply); assert.equal(await first, 'accepted');
  const rows = f.handle.snapshot(); const row = rows[0];
  assert.equal(row.status, 'accepted'); assert.equal(row.attempts, 1);
  assert.deepEqual(row.receipt, { id: 'server-message', sequence: 1, acceptedAt: now });
  assert(Object.isFrozen(rows) && Object.isFrozen(row) && Object.isFrozen(row.receipt));
  assert.equal(JSON.stringify(rows).includes('PRIVATE_DIAGNOSTIC'), false);
  assert.equal(await f.handle.send(id), 'ignored'); assert.equal(f.calls.length, 1); assert.equal(f.timer.callbacks.size, 0);
});

test('complete Unicode, NFD and surrounding whitespace survive the exact transport and receipt match', async () => {
  const f = setup(); const text = '  👩🏾‍⚕️ 👨‍👩‍👧‍👦 🇧🇷 1️⃣ e\u0301\n'; const id = add(f.handle, text);
  const pending = f.handle.send(id); assert.equal(f.calls[0].request.text, text);
  assert.deepEqual(Object.keys(f.calls[0].request).sort(), ['clientMessageId', 'companyId', 'conversationId', 'text']);
  assert(Object.isFrozen(f.calls[0].request));
  f.calls[0].reply.resolve(ack(f.calls[0].request)); await pending;
  assert.equal(f.handle.snapshot()[0].text, text);
});

test('lost ack timeout retries the same intent against actual local reference dedup without another row', async () => {
  const timer = clock(), db = fixture(), lost = deferred();
  let store: ChatStore = { conversations: db.conversations, messages: [], audit: [] };
  const requests: TextSendRequest[] = []; let acceptedReply: unknown;
  const queue = createTextSendQueue({ timeoutMs: 5000, schedule: timer.schedule, createId: () => 'stable-intent', transport: async request => {
    requests.push(request);
    const result = sendText(store, db, principal('patient-a'), request, now, () => 'server-accepted');
    assert.equal(result.ok, true); if (!result.ok) throw Error('Reference rejected fixture');
    store = result.store; acceptedReply = result;
    return requests.length === 1 ? lost.promise : result;
  } });
  const handle = queue.openContext(context), text = '  e\u0301 👍🏽\n', id = add(handle, text);
  const first = handle.send(id); timer.expire(); assert.equal(await first, 'failed');
  assert.equal(handle.snapshot()[0].failure?.code, 'TIMEOUT'); assert.equal(handle.snapshot()[0].failure?.acceptanceUncertain, true);
  assert.equal(store.messages.length, 1);
  assert.equal(await handle.send(id), 'accepted');
  assert.deepEqual(requests[0], requests[1]); assert.equal(handle.snapshot()[0].attempts, 2);
  assert.equal(store.messages.length, 1); assert.equal(store.audit.length, 1); assert.equal(store.messages[0].text, text);
  lost.resolve(acceptedReply); await Promise.resolve(); await Promise.resolve();
  assert.equal(handle.snapshot()[0].status, 'accepted'); assert.equal(handle.snapshot()[0].receipt?.id, 'server-accepted');
});

test('an older timed-out ack cannot complete or fail the newer attempt', async () => {
  const f = setup(), id = add(f.handle); const first = f.handle.send(id);
  f.timer.expire(); await first; const retry = f.handle.send(id);
  f.calls[0].reply.resolve(ack(f.calls[0].request)); await Promise.resolve();
  assert.equal(f.handle.snapshot()[0].status, 'sending');
  f.calls[1].reply.resolve(ack(f.calls[1].request)); assert.equal(await retry, 'accepted');
});

test('logout drops pending memory, settles in-flight work and rejects late ack and old UI intents', async () => {
  const f = setup(), id = add(f.handle); const sending = f.handle.send(id); add(f.handle, 'Ainda pendente');
  f.queue.signOut(); assert.equal(await sending, 'discarded'); assert.deepEqual(f.handle.snapshot(), []);
  assert.deepEqual(f.handle.enqueue('old callback'), { ok: false, code: 'INACTIVE' });
  assert.equal(await f.handle.send(id), 'discarded'); assert.equal(f.timer.callbacks.size, 0);
  const latest = f.queue.openContext({ ...context, sessionKey: 'synthetic-login-2' });
  f.calls[0].reply.resolve(ack(f.calls[0].request)); await Promise.resolve();
  assert.deepEqual(latest.snapshot(), []); assert.equal(f.handle.revoke(), false);
});

test('company, conversation, user and same-identity session changes all invalidate old handles', async () => {
  for (const changed of [{ companyId: 'b', conversationId: 'chat-b' }, { conversationId: 'chat-other' }, { userId: 'patient-other' }, { sessionKey: 'synthetic-login-2' }]) {
    const f = setup(), id = add(f.handle); const pending = f.handle.send(id);
    const next = f.queue.openContext({ ...context, ...changed }); assert.equal(await pending, 'discarded');
    assert.deepEqual(next.snapshot(), []); assert.deepEqual(f.handle.snapshot(), []);
    f.calls[0].reply.resolve(ack(f.calls[0].request)); await Promise.resolve(); assert.deepEqual(next.snapshot(), []);
    assert.equal(f.handle.revoke(), false); add(next, 'novo contexto');
    const back = f.queue.openContext(context); assert.deepEqual(back.snapshot(), []);
    assert.equal(await f.handle.send(id), 'discarded'); assert.equal(await next.send(id), 'discarded');
  }
});

test('explicit revocation clears current private state and cannot retry or revive from late replies', async () => {
  const f = setup(), id = add(f.handle); const pending = f.handle.send(id);
  assert.equal(f.handle.revoke(), true); assert.equal(await pending, 'discarded');
  f.calls[0].reply.resolve(ack(f.calls[0].request)); await Promise.resolve();
  assert.deepEqual(f.handle.snapshot(), []); assert.equal(await f.handle.send(id), 'discarded');
  assert.equal(f.calls.length, 1); assert.equal(f.timer.callbacks.size, 0);
});

test('backend unavailability blocks retries and unknown rejected errors expose no raw diagnostics', async () => {
  const f = setup(), id = add(f.handle); const first = f.handle.send(id);
  f.calls[0].reply.reject(new Error('synthetic-private-token /internal/path'));
  assert.equal(await first, 'failed'); const failure = f.handle.snapshot()[0].failure;
  assert.equal(failure?.code, 'NETWORK'); assert.equal(failure?.retryable, true);
  assert.equal(JSON.stringify(failure).includes('synthetic-private'), false);
  const retry = f.handle.send(id); f.calls[1].reply.resolve({ ok: false, code: 'UNAVAILABLE', details: 'private membership' });
  assert.equal(await retry, 'failed'); assert.equal(f.handle.snapshot()[0].failure?.retryable, false);
  assert.equal(await f.handle.send(id), 'ignored'); assert.equal(f.calls.length, 2);
});

test('terminal server failures stop retry; RETRY_LATER preserves the original intent', async () => {
  for (const code of ['INVALID_INPUT', 'CONFLICT', 'RETRY_LATER']) {
    const f = setup(), id = add(f.handle); const pending = f.handle.send(id);
    f.calls[0].reply.resolve({ ok: false, code, message: 'private details' }); await pending;
    assert.equal(f.handle.snapshot()[0].failure?.code, code);
    if (code === 'RETRY_LATER') {
      const retry = f.handle.send(id); assert.deepEqual(f.calls[1].request, f.calls[0].request);
      f.calls[1].reply.resolve(ack(f.calls[1].request)); assert.equal(await retry, 'accepted');
    } else { assert.equal(await f.handle.send(id), 'ignored'); assert.equal(f.calls.length, 1); }
  }
});

test('unknown ack boundary rejects malformed metadata and mismatched user/company/conversation/text', async () => {
  for (const patch of [{ id: '' }, { companyId: 'b' }, { conversationId: 'foreign' }, { senderId: 'other' }, { text: 'foreign secret' }, { kind: 'audio' }, { sequence: 0 }, { sequence: 1.5 }, { sequence: NaN }, { acceptedAt: -1 }, { acceptedAt: Infinity }]) {
    const f = setup(), id = add(f.handle); const pending = f.handle.send(id);
    f.calls[0].reply.resolve(ack(f.calls[0].request, patch)); assert.equal(await pending, 'failed');
    assert.equal(f.handle.snapshot()[0].failure?.code, 'INVALID_RESPONSE'); assert.equal(f.handle.snapshot()[0].receipt, null);
    assert.equal(JSON.stringify(f.handle.snapshot()).includes('foreign secret'), false);
  }
  for (const reply of [null, 'raw diagnostic', {}, { ok: true }, { ok: false, code: 'raw secret' }, { get ok() { throw new Error('private getter'); } }]) {
    const f = setup(), id = add(f.handle); const pending = f.handle.send(id); f.calls[0].reply.resolve(reply);
    assert.equal(await pending, 'failed'); assert.equal(f.handle.snapshot()[0].failure?.code, 'INVALID_RESPONSE');
  }
});

test('invalid Unicode and excess input never allocate intent or enter transport', () => {
  const f = setup();
  for (const text of [null, '', ' \n', '\ud800', 'a\0b', '👨‍👩‍👧‍👦'.repeat(2001), 'a' + '\u0301'.repeat(32768)]) {
    assert.deepEqual(f.handle.enqueue(text), { ok: false, code: 'INVALID_INPUT' });
  }
  assert.deepEqual(f.handle.snapshot(), []); assert.equal(f.calls.length, 0);
});

test('capacity, duplicate ID and ID-generator failure are bounded safe local failures', () => {
  const timer = clock(); const queue = createTextSendQueue({ timeoutMs: 5000, maxEntries: 1, schedule: timer.schedule, createId: () => 'constant', transport: async () => { throw Error('Must not send'); } });
  const handle = queue.openContext(context); add(handle);
  assert.deepEqual(handle.enqueue('excesso'), { ok: false, code: 'QUEUE_FULL' });
  assert.equal(handle.snapshot().length, 1); queue.signOut(); assert.deepEqual(handle.snapshot(), []);
  for (const createId of [() => { throw Error('private generator'); }, () => 'invalid id']) {
    const bad = createTextSendQueue({ timeoutMs: 5000, schedule: timer.schedule, createId, transport: async () => null }).openContext(context);
    assert.deepEqual(bad.enqueue('válido'), { ok: false, code: 'LOCAL_ERROR' });
  }
  const duplicate = createTextSendQueue({ timeoutMs: 5000, schedule: timer.schedule, createId: () => 'same', transport: async () => null }).openContext(context);
  add(duplicate); assert.deepEqual(duplicate.enqueue('outra intenção'), { ok: false, code: 'LOCAL_ERROR' });
});

test('injected synchronous transport failure settles safely and timer cleanup cannot strand logout', async () => {
  const queue = createTextSendQueue({ timeoutMs: 5000, createId: () => 'intent', schedule: () => () => { throw Error('cleanup failure'); }, transport: () => { throw Error('private synchronous failure'); } });
  const handle = queue.openContext(context), id = add(handle);
  assert.equal(await handle.send(id), 'failed'); assert.equal(handle.snapshot()[0].failure?.code, 'NETWORK');
  queue.signOut(); assert.deepEqual(handle.snapshot(), []);
});

test('more than100 accepted sends free queue slots while bounded snapshots retain unresolved retry intents', async () => {
  const f=setup();
  for(let n=0;n<205;n++){
    const id=add(f.handle,`Synthetic accepted ${n}`), result=f.handle.send(id);
    f.calls[n].reply.resolve(ack(f.calls[n].request,{id:`server-${n}`,sequence:n+1}));
    assert.equal(await result,'accepted');assert(f.handle.snapshot().length<=100);
  }
  assert.equal(f.calls.length,205);assert.equal(f.handle.snapshot().length,100);assert.equal(f.timer.callbacks.size,0);
  let id=0;const timer=clock();const calls:{request:TextSendRequest;reply:ReturnType<typeof deferred>}[]=[];
  const q=createTextSendQueue({maxEntries:2,timeoutMs:5000,schedule:timer.schedule,createId:()=>`mixed-${++id}`,transport:request=>{const reply=deferred();calls.push({request,reply});return reply.promise;}});
  const h=q.openContext(context), uncertain=add(h,'Retry original'), first=h.send(uncertain);timer.expire();assert.equal(await first,'failed');
  const accepted=add(h,'Accepted'), second=h.send(accepted);calls[1].reply.resolve(ack(calls[1].request,{id:'accepted-2',sequence:2}));await second;
  const pending=add(h,'Pending');assert.equal(h.snapshot().some(e=>e.clientMessageId===uncertain),true);
  assert.equal(h.snapshot().some(e=>e.clientMessageId===accepted),false);assert.equal(h.snapshot().some(e=>e.clientMessageId===pending),true);
  assert.deepEqual(h.enqueue('Overflow unresolved'),{ok:false,code:'QUEUE_FULL'});
  const retry=h.send(uncertain);assert.deepEqual(calls[2].request,calls[0].request);calls[2].reply.resolve(ack(calls[2].request,{id:'retry-receipt'}));assert.equal(await retry,'accepted');
  q.signOut();
});
