import assert from 'node:assert/strict';
import test from 'node:test';
import { ana, attendants, bruno, conversationById, initialState, notificationPreview, patient, reducer, visibleConversations } from '../src/demo.ts';

test('patient only sees their own conversation in selected linked company', () => {
  let state = reducer(initialState(), { type: 'enter', actor: patient });
  assert.deepEqual(visibleConversations(state).map(c => c.id), ['horizonte-marina']);
  assert.equal(conversationById(state, 'horizonte-pedro'), undefined);
  state = reducer(state, { type: 'company', id: 'vida' });
  assert.deepEqual(visibleConversations(state).map(c => c.id), ['vida-marina']);
  const denied = reducer(state, { type: 'send', conversationId: 'horizonte-pedro', time: '12:00' });
  assert.equal(denied, state);
});
test('all approved coworkers see all company patient conversations, including before sending', () => {
  const state = reducer(initialState(), { type: 'enter', actor: ana });
  const colleague = reducer(state, { type: 'enter', actor: bruno });
  assert.deepEqual(visibleConversations(state).map(c => c.id), ['horizonte-marina', 'horizonte-pedro']);
  assert.deepEqual(visibleConversations(colleague).map(c => c.id), visibleConversations(state).map(c => c.id));
  assert.equal(conversationById(colleague, 'vida-marina'), undefined);
  assert.equal(reducer(colleague, { type: 'link', id: 'vida' }), colleague);
});
test('pending and revoked staff cannot list or mutate a conversation', () => {
  const state = reducer(initialState(), { type: 'enter', actor: { ...ana, approved: false } });
  assert.deepEqual(visibleConversations(state), []);
  assert.equal(reducer(state, { type: 'send', conversationId: 'horizonte-marina', time: '12:00', attachment: true }), state);
  assert.equal(reducer(state, { type: 'important', conversationId: 'horizonte-marina', messageId: 'm1' }), state);
});
test('valid manager invitation demo enters directly, while search request remains pending', () => {
  const invited = reducer(initialState(), { type: 'staff-invite-demo', name: 'Alex demo' });
  assert.equal(invited.actor!.approved, true);
  assert.equal(invited.actor!.companyId, 'horizonte');
  assert.equal(visibleConversations(invited).length, 2);
  const requested = reducer(initialState(), { type: 'staff-request-demo', name: 'Alex demo', companyId: 'horizonte' });
  assert.equal(requested.actor!.approved, false);
  assert.deepEqual(visibleConversations(requested), []);
});
test('invitation and request demo do not create a second active company for staff', () => {
  const otherCompany = reducer(initialState(), { type: 'enter', actor: { ...ana, companyId: 'vida' } });
  assert.equal(reducer(otherCompany, { type: 'staff-invite-demo', name: 'Alex demo' }), otherCompany);
  assert.equal(reducer(otherCompany, { type: 'staff-request-demo', name: 'Alex demo', companyId: 'horizonte' }), otherCompany);
});
test('patient links immediately without duplicate membership or chat', () => {
  let state = reducer(initialState(), { type: 'enter', actor: patient });
  state = reducer(state, { type: 'link', id: 'jardim' });
  assert.equal(state.companyId, 'jardim');
  assert.equal(visibleConversations(state).length, 1);
  const again = reducer(state, { type: 'link', id: 'jardim' });
  assert.equal(again.linkedCompanies.filter(x => x === 'jardim').length, 1);
  assert.equal(again.conversations.length, state.conversations.length);
});
test('company switch isolates drafts and send writes to current conversation only', () => {
  let state = reducer(initialState(), { type: 'enter', actor: patient });
  state = reducer(state, { type: 'draft', conversationId: 'horizonte-marina', text: 'Rascunho sintético A' });
  state = reducer(state, { type: 'company', id: 'vida' });
  assert.equal(state.drafts['vida-marina'], undefined);
  assert.equal(reducer(state, { type: 'send', conversationId: 'horizonte-marina', time: '12:00' }), state);
  state = reducer(state, { type: 'draft', conversationId: 'vida-marina', text: 'Mensagem sintética B' });
  const countA = state.conversations.find(c => c.id === 'horizonte-marina')!.messages.length;
  state = reducer(state, { type: 'send', conversationId: 'vida-marina', time: '12:00' });
  assert.equal(state.conversations.find(c => c.id === 'horizonte-marina')!.messages.length, countA);
  assert.equal(state.conversations.find(c => c.id === 'vida-marina')!.messages.at(-1)!.text, 'Mensagem sintética B');
  assert.equal(state.drafts['vida-marina'], '');
});
test('empty sends do not create bubbles and attachment is explicitly fictitious', () => {
  const state = reducer(initialState(), { type: 'enter', actor: patient });
  assert.equal(reducer(state, { type: 'send', conversationId: 'horizonte-marina', time: '12:00' }), state);
  const sent = reducer(state, { type: 'send', conversationId: 'horizonte-marina', time: '12:00', attachment: true });
  assert.equal(conversationById(sent, 'horizonte-marina')!.messages.at(-1)!.attachment, true);
});
test('importance can be changed by approved team only', () => {
  const state = reducer(initialState(), { type: 'enter', actor: patient });
  assert.equal(reducer(state, { type: 'important', conversationId: 'horizonte-marina', messageId: 'm1' }), state);
  const staff = reducer(state, { type: 'enter', actor: ana });
  const marked = reducer(staff, { type: 'important', conversationId: 'horizonte-marina', messageId: 'm1' });
  assert.equal(conversationById(marked, 'horizonte-marina')!.messages[0].important, true);
});
test('fictitious audio preserves draft and stays in its own scoped conversation', () => {
  let state = reducer(initialState(), { type: 'enter', actor: patient });
  state = reducer(state, { type: 'draft', conversationId: 'horizonte-marina', text: 'Rascunho preservado' });
  const otherCount = state.conversations.find(c => c.id === 'vida-marina')!.messages.length;
  state = reducer(state, { type: 'send', conversationId: 'horizonte-marina', time: 'Agora', audio: true });
  assert.equal(conversationById(state, 'horizonte-marina')!.messages.at(-1)!.audio, true);
  assert.equal(state.drafts['horizonte-marina'], 'Rascunho preservado');
  assert.equal(state.conversations.find(c => c.id === 'vida-marina')!.messages.length, otherCount);
  assert.equal(reducer(state, { type: 'send', conversationId: 'vida-marina', time: 'Agora', audio: true }), state);
});
test('notification default contains only app, progressive preview never embeds hidden extra content', () => {
  const event = { company: 'Empresa fictícia', attendant: 'Equipe fictícia', message: 'Texto sentinela sintético', important: true };
  const defaults = initialState().preferences;
  const safe = notificationPreview(defaults, event)!;
  assert.equal(JSON.stringify(safe), '{"app":"ResiCheck Connect"}');
  for (const privacy of [1, 2, 3, 4] as const) {
    const preview = notificationPreview({ ...defaults, privacy }, event)!;
    assert.equal(!!preview.company, privacy >= 2);
    assert.equal(!!preview.attendant, privacy >= 3);
    assert.equal(!!preview.message, privacy >= 4);
  }
  assert.equal(notificationPreview({ filter: 'important', privacy: 4 }, { ...event, important: false }), null);
});
test('logout resets drafts, messages, identity and privacy without prior session data', () => {
  let state = reducer(initialState(), { type: 'enter', actor: patient });
  state = reducer(state, { type: 'draft', conversationId: 'horizonte-marina', text: 'Rascunho local' });
  state = reducer(state, { type: 'preferences', preferences: { privacy: 4, filter: 'important' } });
  assert.deepEqual(reducer(state, { type: 'logout' }), initialState());
});
test('indicators do not invent an owner in tie or when no staff message exists', () => {
  const state = initialState();
  const c = state.conversations[0];
  assert.equal(attendants(c).principal, 'Ana · 2 mensagens');
  assert.equal(attendants(c).last, 'Bruno');
  assert.equal(attendants({ ...c, messages: c.messages.filter(m => m.id !== 'm1') }).principal, 'Empate · regra a definir');
  assert.equal(attendants(state.conversations[1]).principal, 'Sem mensagens da equipe');
});
