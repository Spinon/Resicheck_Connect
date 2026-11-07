import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoSession } from '../src/demo-session.ts';
import { createDemoDelivery, interruptedDeliveryError } from '../src/demo-delivery.ts';
import type { DeliveryScenario } from '../src/demo-delivery.ts';
import { ana, bruno, patient, attendants, conversationById } from '../src/demo.ts';

function clock() {
  let now = 0; let id = 0;
  const tasks = new Map<number, { at: number; callback: () => void }>();
  return {
    now: () => now,
    schedule(callback: () => void, delay: number) { const key = ++id; tasks.set(key, { at: now + delay, callback }); return () => { tasks.delete(key); }; },
    async advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const next = [...tasks].filter(([, task]) => task.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        now = next[1].at; tasks.delete(next[0]); next[1].callback();
        for (let i = 0; i < 8; i++) await Promise.resolve();
      }
      now = end; for (let i = 0; i < 8; i++) await Promise.resolve();
    },
    pending: () => tasks.size,
  };
}
const conversationId = 'horizonte-marina';
function fixture(maxEntries = 100, actor = patient) {
  const time = clock(); const store = createDemoSession({ delivery: { schedule: time.schedule, now: time.now, maxEntries } });
  store.bindDispatch()({ type: 'enter', actor });
  store.bindDispatch()({ type: 'open-conversation', conversationId });
  const draft = (text: string) => store.bindDispatch()({ type: 'draft', conversationId, text });
  const rows = () => conversationById(store.getSnapshot(), conversationId)?.messages.filter(m => m.delivery) ?? [];
  return { time, store, draft, rows };
}

test('actual queue publishes pending/sending/accepted, preserves Unicode and clears only enqueued draft', async () => {
  const f = fixture(); const text = '  cafe\u0301 👩🏽‍⚕️\n🇧🇷 ';
  const statuses: string[] = [];
  f.store.subscribe(() => { const row = f.rows()[0]; if (row?.delivery) statuses.push(row.delivery.status); });
  const binding = f.store.bindDelivery(conversationId); f.draft(text);
  assert.equal(binding.sendDraft('12:30'), true);
  assert.equal(f.store.getSnapshot().drafts[conversationId], '');
  assert.deepEqual(statuses, ['pending', 'sending']);
  assert.equal(binding.sendDraft('12:30'), false);
  f.draft('Próximo rascunho'); await f.time.advance(639);
  assert.equal(f.rows()[0].delivery?.status, 'sending'); await f.time.advance(1);
  assert.equal(f.rows()[0].delivery?.status, 'accepted'); assert.equal(f.rows()[0].text, text);
  assert.equal(f.store.getSnapshot().drafts[conversationId], 'Próximo rascunho');
  assert.equal(f.time.pending(), 0); assert.equal(binding.retry(f.rows()[0].id), false);
});

test('failure retries the same intent and bubble exactly once with unchanged text', async () => {
  const f = fixture(); f.draft('Texto integral 🧑🏿‍🦽'); const binding = f.store.bindDelivery(conversationId);
  assert.equal(binding.sendDraft('Agora', 'failure'), true); const original = f.rows()[0];
  await f.time.advance(640);
  assert.deepEqual(f.rows()[0].delivery, { status: 'failed', clientMessageId: original.delivery!.clientMessageId, retryable: true, error: 'Falha no envio simulado. Tente novamente.' });
  f.draft('Novo rascunho que não é retry'); assert.equal(binding.retry(original.id), true);
  assert.equal(binding.retry(original.id), false); await f.time.advance(640);
  assert.equal(f.rows().length, 1); assert.equal(f.rows()[0].id, original.id);
  assert.equal(f.rows()[0].text, original.text); assert.equal(f.rows()[0].delivery?.status, 'accepted');
  assert.equal(f.store.getSnapshot().drafts[conversationId], 'Novo rascunho que não é retry');
});

test('lost acknowledgement times out safely and retry reuses the simulated acceptance receipt', async () => {
  const time = clock(); const controller = createDemoDelivery({ schedule: time.schedule, now: time.now });
  const updates: string[] = [];
  const handle = controller.activate({ sessionKey: 'synthetic', userId: patient.id, companyId: 'horizonte', conversationId }, row => updates.push(row.status));
  const row = handle.enqueue('Sintético', 'lost-ack')!; handle.send(row.clientMessageId);
  await time.advance(640); assert.equal(handle.snapshot()[0].status, 'sending');
  await time.advance(1860); assert.equal(handle.snapshot()[0].failure?.code, 'TIMEOUT');
  assert.equal(handle.send(row.clientMessageId), true); await time.advance(640);
  assert.equal(handle.snapshot().length, 1); assert.equal(handle.snapshot()[0].attempts, 2);
  assert.equal(handle.snapshot()[0].receipt?.sequence, 1); assert.equal(handle.snapshot()[0].receipt?.acceptedAt, 640);
  assert.deepEqual(updates, ['sending', 'failed', 'sending', 'accepted']); assert.equal(time.pending(), 0);
});

test('capacity retains draft and shows scoped fixed notice; stale binding cannot restore notice', async () => {
  const f = fixture(1); const binding = f.store.bindDelivery(conversationId);
  f.draft('Primeiro'); binding.sendDraft('Agora');
  f.draft('Segundo'); assert.equal(binding.sendDraft('Agora'), false);
  assert.equal(f.store.getSnapshot().drafts[conversationId], 'Segundo'); assert.equal(f.rows().length, 1);
  assert.equal(f.store.getSnapshot().deliveryNotice, 'Não foi possível iniciar o envio simulado. Seu rascunho foi mantido.');
  f.store.bindDispatch()({ type: 'company', id: 'vida' });
  assert.equal(f.store.getSnapshot().deliveryNotice, null); assert.equal(binding.sendDraft('Agora'), false);
  assert.equal(f.store.getSnapshot().deliveryNotice, null);
});

test('105 accepted sends keep UI history while bounded simulation receipts retain monotonic sequence and lost-ack retry', async()=>{
  const f=fixture();const binding=f.store.bindDelivery(conversationId);
  for(let i=0;i<105;i++){
    f.draft(`Synthetic ${i}`);assert.equal(binding.sendDraft('Agora'),true);await f.time.advance(640);
  }
  assert.equal(f.rows().length,105);assert(f.rows().every(m=>m.delivery?.status==='accepted'));
  assert.equal(f.store.getSnapshot().deliveryNotice,null);
  const time=clock(), delivery=createDemoDelivery({maxEntries:2,schedule:time.schedule,now:time.now});
  const h=delivery.activate({sessionKey:'synthetic',userId:'patient-a',companyId:'a',conversationId:'chat-a'},()=>{});
  for(let i=1;i<=6;i++){const row=h.enqueue(`Synthetic ${i}`,'success')!;assert(row);h.send(row.clientMessageId);await time.advance(640);assert.equal(h.snapshot().at(-1)?.receipt?.sequence,i);}
  const lost=h.enqueue('Synthetic lost acknowledgment','lost-ack')!;h.send(lost.clientMessageId);await time.advance(2500);
  assert.equal(h.snapshot().at(-1)?.status,'failed');h.send(lost.clientMessageId);await time.advance(640);
  assert.equal(h.snapshot().at(-1)?.receipt?.sequence,7);assert.equal(h.snapshot().at(-1)?.attempts,2);assert.equal(h.snapshot().length,2);
  delivery.clear();assert.equal(time.pending(),0);
});

test('logout cancels transport/timer and old callbacks cannot repopulate next login', async () => {
  const f = fixture(); const old = f.store.bindDelivery(conversationId); f.draft('Pendente'); old.sendDraft('Agora');
  f.store.bindDispatch()({ type: 'logout' }); assert.equal(f.time.pending(), 0);
  f.store.bindDispatch()({ type: 'enter', actor: patient }); f.store.bindDispatch()({ type: 'open-conversation', conversationId });
  const before = f.store.getSnapshot(); assert.equal(old.sendDraft('Agora'), false); assert.equal(old.retry('anything'), false);
  await f.time.advance(3000); assert.equal(f.store.getSnapshot(), before); assert.equal(f.rows().length, 0);
});

test('conversation A/B/A invalidates callbacks, interrupts existing intent and never invents a retry ID', async () => {
  const f = fixture(100, ana); const binding = f.store.bindDelivery(conversationId);
  const oldDispatch = f.store.bindDispatch();
  f.draft('Pendente da Ana'); binding.sendDraft('Agora'); const row = f.rows()[0];
  f.store.bindDispatch()({ type: 'open-conversation', conversationId: 'horizonte-pedro' });
  assert.equal(f.time.pending(), 0); assert.equal(binding.retry(row.id), false);
  f.store.bindDispatch()({ type: 'open-conversation', conversationId });
  assert.equal(oldDispatch({ type: 'draft', conversationId, text: 'Late callback' }), false);
  assert.equal(binding.sendDraft('Agora'), false); assert.equal(f.store.bindDelivery(conversationId).retry(row.id), false);
  assert.deepEqual(f.rows()[0].delivery, { status: 'failed', clientMessageId: row.delivery!.clientMessageId, retryable: false, error: interruptedDeliveryError });
  await f.time.advance(3000); assert.equal(f.rows().length, 1); assert.equal(f.rows()[0].text, row.text);
});

test('company A/B/A invalidates queue; accepted message remains accepted and pending stays interrupted', async () => {
  const f = fixture(); f.draft('Aceita'); f.store.bindDelivery(conversationId).sendDraft('Agora'); await f.time.advance(640);
  f.draft('Interrompida'); const old = f.store.bindDelivery(conversationId); old.sendDraft('Agora');
  f.store.bindDispatch()({ type: 'company', id: 'vida' }); assert.equal(conversationById(f.store.getSnapshot(), conversationId), undefined);
  f.store.bindDispatch()({ type: 'company', id: 'horizonte' }); f.store.bindDispatch()({ type: 'open-conversation', conversationId });
  assert.equal(old.sendDraft('Agora'), false); await f.time.advance(3000);
  assert.deepEqual(f.rows().map(m => m.delivery?.status), ['accepted', 'failed']);
});

test('actor switch hides nonaccepted messages and staff indicators count only accepted/legacy', async () => {
  const f = fixture(100, ana); const original = attendants(conversationById(f.store.getSnapshot(), conversationId)!);
  f.draft('Falha privada da Ana'); f.store.bindDelivery(conversationId).sendDraft('Agora', 'failure'); await f.time.advance(640);
  assert.equal(f.store.bindDispatch()({ type: 'important', conversationId, messageId: f.rows()[0].id }), false);
  assert.deepEqual(attendants(conversationById(f.store.getSnapshot(), conversationId)!), original);
  f.draft('Aceita da Ana'); f.store.bindDelivery(conversationId).sendDraft('Agora'); await f.time.advance(640);
  const privateId = f.rows()[0].id;
  f.store.bindDispatch()({ type: 'enter', actor: bruno });
  assert.deepEqual(f.rows().map(m => m.text), ['Aceita da Ana']);
  assert.equal(f.store.bindDispatch()({ type: 'important', conversationId, messageId: privateId }), false);
  f.store.bindDispatch()({ type: 'enter', actor: ana });
  assert.equal(f.rows().length, 2); assert.equal(f.rows()[0].delivery?.retryable, false);
  assert.equal(f.store.getSnapshot().activeConversationId, null);
});

test('UI dispatch cannot fabricate queue transitions or clear a draft using a fabricated entry', () => {
  const f = fixture(); f.draft('Preservado');
  const entry = { clientMessageId: 'fake', text: 'Preservado', status: 'pending' as const, attempts: 0, failure: null, receipt: null };
  assert.equal(f.store.bindDispatch()({ type: 'queue-message', conversationId, time: 'Agora', entry }), false);
  assert.equal(f.store.bindDispatch()({ type: 'queue-state', conversationId, entry: { ...entry, status: 'accepted' } }), false);
  assert.equal(f.store.getSnapshot().drafts[conversationId], 'Preservado'); assert.equal(f.rows().length, 0);
});

test('same conversation reopen and pure render bindings preserve in-flight work', async () => {
  const f = fixture(); f.draft('Continua'); const old = f.store.bindDelivery(conversationId); old.sendDraft('Agora');
  const before = f.store.getSnapshot(); const count = f.time.pending();
  for (let i = 0; i < 5; i++) f.store.bindDelivery(conversationId);
  let navigated = false;
  assert.equal(f.store.bindDispatch()({ type: 'open-conversation', conversationId }, () => { navigated = true; }), true);
  assert.equal(navigated, true); assert.equal(f.store.getSnapshot(), before); assert.equal(f.time.pending(), count);
  // Leaving chat for a company/profile screen makes no context mutation.
  await f.time.advance(640); assert.equal(f.rows()[0].delivery?.status, 'accepted');
  f.draft('Ainda ativo'); assert.equal(old.sendDraft('Agora'), true); await f.time.advance(640);
  const messages = conversationById(f.store.getSnapshot(), conversationId)!.messages;
  f.draft('Digitação não recria lista');
  assert.equal(conversationById(f.store.getSnapshot(), conversationId)!.messages, messages);
});

test('invalid runtime time/scenario/text never enqueue, clear draft or open a notice', () => {
  const f = fixture(); f.draft('Preservado'); const binding = f.store.bindDelivery(conversationId);
  for (const time of ['25:00', '<debug>', '', 123]) assert.equal(binding.sendDraft(time as string), false);
  assert.equal(binding.sendDraft('Agora', 'unknown' as DeliveryScenario), false);
  assert.equal(f.store.getSnapshot().drafts[conversationId], 'Preservado'); assert.equal(f.rows().length, 0);
  f.draft('a'.repeat(2001)); assert.equal(binding.sendDraft('Agora'), false);
  assert.equal(f.store.getSnapshot().drafts[conversationId].length, 2001);
  assert.equal(f.time.pending(), 0); assert.equal(f.store.getSnapshot().deliveryNotice, null);
});

test('subscriber exception cannot strand send or duplicate intent', async () => {
  const f = fixture(); let observed = 0;
  f.store.subscribe(() => { throw new Error('synthetic subscriber failure'); });
  f.store.subscribe(() => { observed++; });
  f.draft('Uma mensagem'); const binding = f.store.bindDelivery(conversationId);
  assert.equal(binding.sendDraft('Agora'), true); assert.equal(binding.sendDraft('Agora'), false);
  await f.time.advance(640); assert.equal(f.rows().length, 1); assert.equal(f.rows()[0].delivery?.status, 'accepted'); assert.ok(observed >= 4);
});

test('signaled access loss cancels pending queue and old or pending-actor intents are denied', async () => {
  const f = fixture(100, ana); f.draft('Pendente'); const old = f.store.bindDelivery(conversationId); old.sendDraft('Agora');
  f.store.bindDispatch()({ type: 'enter', actor: { ...ana, approved: false } });
  assert.equal(f.time.pending(), 0); assert.equal(old.sendDraft('Agora'), false);
  assert.equal(f.store.bindDispatch()({ type: 'open-conversation', conversationId }), false);
  assert.equal(f.store.bindDelivery(conversationId).sendDraft('Agora'), false);
  await f.time.advance(3000); assert.equal(conversationById(f.store.getSnapshot(), conversationId), undefined);
});
