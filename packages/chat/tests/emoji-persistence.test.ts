import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sendText, listMessages } from '../src/chat.ts';
import type { ChatStore } from '../src/chat.ts';
import { fixture, principal, now } from '../../access/tests/fixtures.ts';

test('synthetic UTF8 file persistence preserves Unicode, retry identity and authorization', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'connect-unicode-'));
  const file = path.join(dir, 'synthetic-store.json');
  try {
    const db = fixture(); let store: ChatStore = { conversations: db.conversations, messages: [], audit: [] };
    const samples = ['  Guia fictícia 😀 👍🏽 👩🏾‍⚕️ 👨‍👩‍👧‍👦 🇧🇷 🏳️‍🌈 1️⃣ ✈️\n', 'e\u0301 é', '👩🏾‍⚕️'.repeat(2000), '<script>texto literal fictício</script>😀'];
    for (const [index, text] of samples.entries()) {
      const input = { companyId: 'a', conversationId: 'chat-a', clientMessageId: `unicode-${index}`, text };
      const sent = sendText(store, db, principal('patient-a'), input, now, () => `stored-${index}`);
      assert.equal(sent.ok, true); if (!sent.ok) throw Error('Synthetic message rejected');
      await writeFile(file, JSON.stringify(sent.store), 'utf8');
      store = JSON.parse(await readFile(file, 'utf8')) as ChatStore;
      const retry = sendText(store, db, principal('patient-a'), input, now, () => { throw Error('Retry must not allocate'); });
      assert.equal(retry.ok, true); if (!retry.ok) throw Error('Synthetic retry rejected');
      assert.equal(retry.value.text, text); assert.equal(retry.value.id, sent.value.id);
      assert.equal(retry.store.messages.length, index + 1);
    }
    const page = listMessages(store, db, principal('staff-a'), { companyId: 'a', conversationId: 'chat-a', after: 0, limit: 20 }, now);
    assert.equal(page.ok, true); if (!page.ok) throw Error('Synthetic read rejected');
    assert.deepEqual(page.value.map(m=>m.text), samples);
    assert.equal(listMessages(store, db, principal('patient-other'), { companyId:'a',conversationId:'chat-a',after:0,limit:20 }, now).ok, false);
    for (const sample of samples) assert.equal(JSON.stringify(store.audit).includes(JSON.stringify(sample)), false);
    for (const event of store.audit) assert.ok(Object.keys(event).every(key => ['sequence','kind','actorId','companyId','conversationId','messageId','at'].includes(key)));
  } finally {
    await unlink(file).catch(error=>{if(error.code!=='ENOENT')throw error;});
    await rmdir(dir);
  }
});

test('chat rejects malformed Unicode and excess clusters without changing original store', () => {
  const db = fixture(); const store: ChatStore = { conversations:db.conversations,messages:[],audit:[] };
  for (const text of ['👍🏽'.repeat(2001), '\ud800', '\udc00', 'a'+'\u0301'.repeat(32768)]) {
    assert.deepEqual(sendText(store,db,principal('patient-a'),{companyId:'a',conversationId:'chat-a',clientMessageId:'invalid-unicode',text},now),{ok:false,code:'INVALID_INPUT'});
    assert.equal(store.messages.length,0);
  }
});
