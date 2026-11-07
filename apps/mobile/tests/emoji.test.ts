import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoSession } from '../src/demo-session.ts';
import { conversationById, patient } from '../src/demo.ts';

test('demo sends original Unicode and whitespace, clears only its draft and keeps company isolation', () => {
  const store = createDemoSession(); store.bindDispatch()({ type: 'enter', actor: patient });
  const text = '  Guia fictícia 👍🏽 👩🏾‍⚕️ 👨‍👩‍👧‍👦 🇧🇷 1️⃣ e\u0301\n';
  store.bindDispatch()({ type: 'draft', conversationId: 'horizonte-marina', text });
  store.bindDispatch()({ type: 'send', conversationId: 'horizonte-marina', time: 'Agora' });
  assert.equal(conversationById(store.getSnapshot(), 'horizonte-marina')!.messages.at(-1)!.text, text);
  assert.equal(store.getSnapshot().drafts['horizonte-marina'], '');
  store.bindDispatch()({ type: 'company', id: 'vida' });
  assert.equal(conversationById(store.getSnapshot(), 'horizonte-marina'), undefined);
  assert.equal(store.getSnapshot().conversations.find(c=>c.id==='vida-marina')!.messages.some(m=>m.text===text), false);
});

test('demo keeps excess and invalid input intact for editing and refuses sending it', () => {
  const store = createDemoSession(); store.bindDispatch()({ type: 'enter', actor: patient });
  for (const text of ['👨‍👩‍👧‍👦'.repeat(2001), 'x\ud800', 'x\0y', 'a'+'\u0301'.repeat(32768)]) {
    store.bindDispatch()({ type: 'draft', conversationId: 'horizonte-marina', text });
    assert.equal(store.getSnapshot().drafts['horizonte-marina'], text);
    const before = store.getSnapshot();
    assert.equal(store.bindDispatch()({ type: 'send', conversationId: 'horizonte-marina', time: 'Agora' }), false);
    assert.equal(store.getSnapshot(), before);
  }
  store.bindDispatch()({ type: 'draft', conversationId: 'horizonte-marina', text: '👩🏾‍⚕️'.repeat(2000) });
  assert.equal(store.bindDispatch()({ type: 'send', conversationId: 'horizonte-marina', time: 'Agora' }), true);
});
