import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNotification, notificationLimits } from '../src/notifications.ts';
import type { NotificationEvent } from '../src/notifications.ts';
import type { Principal, Snapshot } from '../../access/src/contracts.ts';

const now = 1000;
const principal = (subject = 'patient-a'): Principal => ({ subject, expiresAt: 2000, platformGrants: [] });
const event: NotificationEvent = {
  messageId: 'message-a', companyId: 'company-a', company: 'Empresa Sintética A',
  attendant: 'Atendente Fictícia', message: 'Mensagem sintética de teste.', important: true,
};
const prefs = { systemPermissionGranted: true, filter: 'all', privacy: 1 } as const;
function fixture(): Snapshot {
  return {
    accounts: ['patient-a', 'other-patient', 'staff-a', 'staff-b', 'manager-a', 'admin'].map(id => ({ id, state: 'active', evidence: { format: 'unchecked', registry: 'unchecked', contact: 'unconfirmed', identity: 'unconfirmed' } })),
    companies: ['company-a', 'company-b'].map(id => ({ id, state: 'active', listed: true, name: id, address: 'Endereço fictício', phone: 'Telefone fictício' })),
    memberships: [
      { userId: 'patient-a', companyId: 'company-a', role: 'patient', state: 'active' },
      { userId: 'patient-a', companyId: 'company-b', role: 'patient', state: 'active' },
      { userId: 'other-patient', companyId: 'company-a', role: 'patient', state: 'active' },
      { userId: 'staff-a', companyId: 'company-a', role: 'staff', state: 'active' },
      { userId: 'staff-b', companyId: 'company-b', role: 'staff', state: 'active' },
      { userId: 'manager-a', companyId: 'company-a', role: 'manager', state: 'active' },
    ],
    conversations: [{ id: 'chat-a', companyId: 'company-a', patientId: 'patient-a' }, { id: 'chat-b', companyId: 'company-b', patientId: 'patient-a' }],
    messages: [{ id: 'message-a', companyId: 'company-a', conversationId: 'chat-a' }, { id: 'message-b', companyId: 'company-b', conversationId: 'chat-b' }],
    attachments: [],
  };
}

test('four levels contain exactly their authorized fields with no hidden envelope or IDs', () => {
  const expected = [
    { app: 'ResiCheck Connect' },
    { app: 'ResiCheck Connect', company: event.company },
    { app: 'ResiCheck Connect', company: event.company, attendant: event.attendant },
    { app: 'ResiCheck Connect', company: event.company, attendant: event.attendant, message: event.message },
  ];
  const augmented = { ...event, app: 'CLIENT APP', debug: 'DEBUG_SENTINEL', raw: { secret: 'RAW_SENTINEL' }, patientId: 'PRIVATE_ID' };
  for (const privacy of [1, 2, 3, 4]) {
    const payload = buildNotification(fixture(), principal(), augmented, { ...prefs, privacy }, now);
    assert.deepEqual(payload, expected[privacy - 1]);
    assert(Object.isFrozen(payload));
    const serialized = JSON.stringify(payload);
    for (const excluded of ['message-a', 'company-a', 'DEBUG_SENTINEL', 'RAW_SENTINEL', 'PRIVATE_ID', 'undefined', 'CLIENT APP']) assert(!serialized.includes(excluded));
  }
});

test('absent or malformed preferences and absent/denied OS permission suppress notifications', () => {
  for (const invalid of [undefined, null, false, [], 'all', {}, { ...prefs, systemPermissionGranted: false }, { ...prefs, systemPermissionGranted: undefined }, { ...prefs, systemPermissionGranted: 'true' }, { ...prefs, filter: undefined }, { ...prefs, filter: 'invalid' }]) {
    assert.equal(buildNotification(fixture(), principal(), event, invalid, now), null);
  }
  assert.equal(buildNotification(fixture(), principal(), event, Object.create(prefs), now), null);
});

test('missing or invalid privacy fails safe to app-only with explicit filter and OS grant', () => {
  for (const privacy of [undefined, null, '4', 0, 5, -1, NaN, Infinity, 2.5, true, {}]) {
    assert.deepEqual(buildNotification(fixture(), principal(), event, { ...prefs, privacy }, now), { app: 'ResiCheck Connect' });
  }
});

test('important-only uses the existing event flag, independently of privacy', () => {
  for (const privacy of [1, 2, 3, 4]) {
    assert.equal(buildNotification(fixture(), principal(), { ...event, important: false }, { ...prefs, filter: 'important', privacy }, now), null);
    assert(buildNotification(fixture(), principal(), event, { ...prefs, filter: 'important', privacy }, now));
    assert(buildNotification(fixture(), principal(), { ...event, important: false }, { ...prefs, filter: 'all', privacy }, now));
  }
});

test('current message authorization denies other patients/companies and management-only or ADM grants', () => {
  for (const subject of ['other-patient', 'staff-b', 'manager-a', 'admin', 'missing']) {
    assert.equal(buildNotification(fixture(), { ...principal(subject), platformGrants: ['audit:read', 'users:metadata:read'] }, event, { ...prefs, privacy: 4 }, now), null, subject);
  }
  assert(buildNotification(fixture(), principal('staff-a'), event, prefs, now));
  assert.equal(buildNotification(fixture(), principal('staff-b'), { ...event, companyId: 'company-b' }, prefs, now), null);
  assert.equal(buildNotification(fixture(), principal(), { ...event, messageId: 'missing' }, prefs, now), null);
});

test('revocation/pending state, suspension, expiry and invalid dispatch time are re-evaluated', () => {
  const db = fixture(); const actor = principal();
  assert(buildNotification(db, actor, event, prefs, now));
  for (const state of ['revoked', 'pending'] as const) {
    const current = { ...db, memberships: db.memberships.map(m => m.userId === actor.subject && m.companyId === event.companyId ? { ...m, state } : m) };
    assert.equal(buildNotification(current, actor, event, prefs, now), null);
  }
  assert.equal(buildNotification({ ...db, accounts: db.accounts.map(a => a.id === actor.subject ? { ...a, state: 'suspended' } : a) }, actor, event, prefs, now), null);
  assert.equal(buildNotification({ ...db, companies: db.companies.map(c => c.id === event.companyId ? { ...c, state: 'suspended' } : c) }, actor, event, prefs, now), null);
  assert.equal(buildNotification(db, null, event, prefs, now), null);
  assert.equal(buildNotification(db, { ...actor, expiresAt: now }, event, prefs, now), null);
  assert.equal(buildNotification(db, actor, event, prefs, NaN), null);
});

test('multi-company patient receives only currently authorized message contexts', () => {
  const db = fixture();
  const eventB = { ...event, messageId: 'message-b', companyId: 'company-b', company: 'Empresa Sintética B', attendant: 'Outra Atendente Fictícia' };
  assert.deepEqual(buildNotification(db, principal(), eventB, { ...prefs, privacy: 2 }, now), { app: 'ResiCheck Connect', company: 'Empresa Sintética B' });
  const current = { ...db, memberships: db.memberships.filter(m => !(m.userId === 'patient-a' && m.companyId === 'company-a')) };
  assert.equal(buildNotification(current, principal(), event, prefs, now), null);
  assert(buildNotification(current, principal(), eventB, prefs, now));
});

test('no human attendant remains absent; no inferred staff or literal undefined', () => {
  const { attendant: ignored, ...noAttendant } = event;
  for (const privacy of [3, 4]) {
    const payload = buildNotification(fixture(), principal(), noAttendant, { ...prefs, privacy }, now);
    assert(payload);
    assert(!Object.hasOwn(payload, 'attendant'));
    assert(!JSON.stringify(payload).includes('undefined'));
  }
});

test('invalid event fields and control characters fail closed without copying raw fields', () => {
  for (const patch of [{ messageId: '' }, { companyId: '' }, { company: '' }, { attendant: null }, { message: 5 }, { important: 'true' }, { message: 'Mensagem\u0000interna' }, { company: 'Nome\nOculto' }]) {
    assert.equal(buildNotification(fixture(), principal(), { ...event, ...patch } as NotificationEvent, prefs, now), null);
  }
  for (const invalid of [null, undefined, 'not-an-event', []]) assert.equal(buildNotification(fixture(), principal(), invalid as unknown as NotificationEvent, prefs, now), null);
});

test('local engineering length limits accept boundary Unicode and suppress excess without truncation', () => {
  for (const field of ['company', 'attendant', 'message'] as const) {
    const boundary = '🟢'.repeat(notificationLimits[field]);
    const payload = buildNotification(fixture(), principal(), { ...event, [field]: boundary }, { ...prefs, privacy: 4 }, now);
    assert.equal(payload?.[field], boundary);
    assert.equal(buildNotification(fixture(), principal(), { ...event, [field]: boundary + 'a' }, { ...prefs, privacy: 4 }, now), null);
  }
  assert.equal(buildNotification(fixture(), principal(), { ...event, messageId: 'a'.repeat(notificationLimits.id + 1) }, prefs, now), null);
});

test('emoji preview preserves whole sequences only at explicit privacy level and rejects malformed Unicode', () => {
  const message = '👍🏽 👩🏾‍⚕️ 👨‍👩‍👧‍👦 🇧🇷 1️⃣ e\u0301';
  for (const privacy of [1,2,3,4]) {
    const payload = buildNotification(fixture(), principal(), { ...event, message }, { ...prefs, privacy }, now);
    assert(payload);
    assert.equal(payload.message, privacy === 4 ? message : undefined);
    assert.equal(JSON.stringify(payload).includes('👨'), privacy === 4);
  }
  assert.equal(buildNotification(fixture(), principal(), { ...event, message: '\ud800' }, prefs, now), null);
});

test('preview byte budget suppresses oversized selected payload without truncating or adding hidden text', () => {
  const message = '👨‍👩‍👧‍👦'.repeat(notificationLimits.message);
  assert.equal(buildNotification(fixture(), principal(), { ...event, message }, { ...prefs, privacy:4 }, now), null);
  assert.deepEqual(buildNotification(fixture(), principal(), { ...event, message }, prefs, now), { app:'ResiCheck Connect' });
});
