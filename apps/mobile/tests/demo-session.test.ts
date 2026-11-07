import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoSession } from '../src/demo-session.ts';
import { ana, bruno, companies, conversationById, patient, visibleConversations } from '../src/demo.ts';
import { demoAllows } from '../src/demo-access.ts';

function fixture() {
  const store = createDemoSession();
  store.bindDispatch()({ type: 'enter', actor: patient });
  return store;
}

test('actual demo store drops a delayed reply after logout and next login', async () => {
  const store = fixture(); const oldDispatch = store.bindDispatch();
  let resolve!: () => void; const reply = new Promise<void>(r => { resolve = r; });
  const job = reply.then(() => oldDispatch({ type: 'simulate-reply', conversationId: 'horizonte-marina' }));
  store.bindDispatch()({ type: 'logout' });
  assert.equal(store.getSnapshot().actor, null);
  store.bindDispatch()({ type: 'enter', actor: patient });
  const before = store.getSnapshot(); resolve();
  assert.equal(await job, false); assert.equal(store.getSnapshot(), before);
});

test('company switch invalidates old UI callbacks even when returning to the same company', () => {
  const store = fixture(); const old = store.bindDispatch();
  old({ type: 'draft', conversationId: 'horizonte-marina', text: 'Rascunho fictício A' });
  store.bindDispatch()({ type: 'company', id: 'vida' });
  assert.deepEqual(visibleConversations(store.getSnapshot()).map(c => c.id), ['vida-marina']);
  assert.equal(conversationById(store.getSnapshot(), 'horizonte-marina'), undefined);
  assert.equal(old({ type: 'draft', conversationId: 'vida-marina', text: 'callback antigo' }), false);
  assert.equal(store.getSnapshot().drafts['vida-marina'], undefined);
  store.bindDispatch()({ type: 'company', id: 'horizonte' });
  assert.equal(old({ type: 'send', conversationId: 'horizonte-marina', time: 'Agora' }), false);
  assert.equal(store.getSnapshot().drafts['horizonte-marina'], 'Rascunho fictício A');
  assert.equal(store.bindDispatch()({ type: 'send', conversationId: 'horizonte-marina', time: 'Agora' }), true);
});

test('account switch clears drafts and privacy without sharing old actor callbacks', () => {
  const store = fixture(); const old = store.bindDispatch();
  old({ type: 'draft', conversationId: 'horizonte-marina', text: 'Privado fictício' });
  old({ type: 'preferences', preferences: { privacy: 4, filter: 'important' } });
  store.bindDispatch()({ type: 'enter', actor: ana });
  assert.deepEqual(store.getSnapshot().drafts, {});
  assert.deepEqual(store.getSnapshot().preferences, { privacy: 1, filter: 'all' });
  assert.equal(old({ type: 'enter', actor: patient }), false);
  assert.equal(old({ type: 'preferences', preferences: { privacy: 4, filter: 'all' } }), false);
  assert.equal(store.getSnapshot().actor?.id, ana.id);
});

test('rejected old UI intents cannot navigate or reopen modals after logout', () => {
  const store = fixture(); const old = store.bindDispatch();
  let screen = 'companies'; let opened = false;
  store.bindDispatch()({ type: 'logout' }, () => { screen = 'welcome'; });
  assert.equal(old({ type: 'company', id: 'vida' }, () => { screen = 'company'; opened = true; }), false);
  assert.equal(old({ type: 'enter', actor: ana }, () => { screen = 'team'; opened = true; }), false);
  assert.equal(screen, 'welcome'); assert.equal(opened, false);
  assert.equal(store.bindDispatch()({ type: 'enter', actor: patient }, () => { screen = 'companies'; }), true);
  assert.equal(screen, 'companies');
});

test('same-user scenario reload invalidates callbacks and fresh pending role denies content', () => {
  const store = createDemoSession(); store.bindDispatch()({ type: 'enter', actor: ana });
  const old = store.bindDispatch();
  store.bindDispatch()({ type: 'enter', actor: { ...ana, approved: false } });
  assert.deepEqual(visibleConversations(store.getSnapshot()), []);
  assert.equal(old({ type: 'enter', actor: ana }), false);
  assert.equal(store.bindDispatch()({ type: 'important', conversationId: 'horizonte-marina', messageId: 'm1' }), false);
});

test('store uses current conversation policy for patient, coworker and mismatched parent', () => {
  const store = fixture();
  assert.equal(store.bindDispatch()({ type: 'draft', conversationId: 'horizonte-pedro', text: 'Denied' }), false);
  assert.equal(store.bindDispatch()({ type: 'important', conversationId: 'horizonte-marina', messageId: 'm1' }), false);
  store.bindDispatch()({ type: 'enter', actor: bruno });
  assert.equal(visibleConversations(store.getSnapshot()).length, 2);
  assert.equal(store.bindDispatch()({ type: 'important', conversationId: 'horizonte-marina', messageId: 'm6' }), false);
  assert.equal(demoAllows(store.getSnapshot(), { channel: 'api', action: 'read', resource: { kind: 'message', id: 'm6', companyId: 'horizonte' } }, companies), false);
  assert.equal(store.bindDispatch()({ type: 'important', conversationId: 'horizonte-marina', messageId: 'm1' }), true);
});

test('direct invitation is active, search pending, patient link immediate, subscription cleaned', () => {
  const store = createDemoSession(); let notifications = 0;
  const stop = store.subscribe(() => { notifications++; });
  store.bindDispatch()({ type: 'staff-request-demo', name: 'Alex', companyId: 'horizonte' });
  assert.equal(store.getSnapshot().actor?.approved, false);
  assert.deepEqual(visibleConversations(store.getSnapshot()), []);
  store.bindDispatch()({ type: 'logout' });
  store.bindDispatch()({ type: 'staff-invite-demo', name: 'Alex' });
  assert.equal(store.getSnapshot().actor?.approved, true);
  assert.equal(visibleConversations(store.getSnapshot()).length, 2);
  store.bindDispatch()({ type: 'enter', actor: patient });
  store.bindDispatch()({ type: 'link', id: 'jardim' });
  assert.equal(store.getSnapshot().companyId, 'jardim');
  assert.equal(visibleConversations(store.getSnapshot()).length, 1);
  const notified = notifications; stop(); store.bindDispatch()({ type: 'logout' });
  assert.equal(notifications, notified);
  assert.deepEqual(store.getSnapshot().drafts, {});
});
