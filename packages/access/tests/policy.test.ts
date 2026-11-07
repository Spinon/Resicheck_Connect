import test from 'node:test';
import assert from 'node:assert/strict';
import { authorize, inaccessibleResponse, publicCompanyDto } from '../src/policy.ts';
import { listConversationMetadata, readConversationMetadata } from '../src/boundary.ts';
import type { AccessRequest, Action, Channel, Principal, Resource } from '../src/contracts.ts';
import { fixture, now, principal } from './fixtures.ts';

const channels: readonly [Channel, Action, 'conversation' | 'message' | 'attachment', string][] = [
  ['api', 'read', 'conversation', 'chat-a'], ['api', 'write', 'message', 'message-a'],
  ['realtime', 'subscribe', 'message', 'message-a'], ['storage', 'download', 'attachment', 'file-a'],
  ['push', 'read', 'message', 'message-a'],
];

test('negative access matrix covers all company-content channels and both approved employees', () => {
  const db = fixture();
  const expected: Record<string, boolean> = { 'staff-a': true, 'staff-a2': true, 'patient-a': true,
    'staff-b': false, 'patient-b': false, 'patient-other': false, pending: false, revoked: false,
    'manager-a': false, 'manager-b': false, admin: false, 'new-user': false };
  for (const [subject, permitted] of Object.entries(expected)) for (const [channel, action, kind, id] of channels) {
    assert.equal(authorize(db, principal(subject, ['audit:read', 'users:metadata:read', 'companies:metadata:read']),
      { channel, action, resource: { kind, id, companyId: 'a' } }, now).allowed, permitted, `${subject}/${channel}/${action}`);
  }
});

test('company id tampering and corrupt child-parent chains fail across content channels', () => {
  const db = fixture();
  for (const [channel, action, kind, id] of channels) {
    assert.equal(authorize(db, principal('staff-b'), { channel, action, resource: { kind, id, companyId: 'b' } }, now).allowed, false);
  }
  const inconsistent = { ...db, attachments: [{ id: 'file-a', companyId: 'b', conversationId: 'chat-a' }] };
  assert.equal(authorize(inconsistent, principal('staff-a'), { channel: 'storage', action: 'download', resource: { kind: 'attachment', id: 'file-a', companyId: 'a' } }, now).allowed, false);
});

test('anonymous, expired, suspended, nonfinite sessions and suspended company fail closed', () => {
  const db = fixture(); const request: AccessRequest = { channel: 'api', action: 'read', resource: { kind: 'conversation', id: 'chat-a', companyId: 'a' } };
  for (const actor of [null, { ...principal('staff-a'), expiresAt: now }, { ...principal('staff-a'), expiresAt: NaN }, principal('missing')]) {
    assert.equal(authorize(db, actor, request, now).allowed, false);
  }
  assert.equal(authorize({ ...db, accounts: db.accounts.map(a => a.id === 'staff-a' ? { ...a, state: 'suspended' } : a) }, principal('staff-a'), request, now).allowed, false);
  assert.equal(authorize({ ...db, companies: db.companies.map(c => ({ ...c, state: 'suspended' })) }, principal('staff-a'), request, now).allowed, false);
  assert.equal(authorize(db, principal('staff-a'), request, NaN).allowed, false);
});

test('revocation takes effect for subsequent read/event/file/push decisions using same principal', () => {
  const db = fixture(); const actor = principal('staff-a');
  const revoked = { ...db, memberships: db.memberships.map(m => m.userId === actor.subject ? { ...m, state: 'revoked' as const } : m) };
  for (const [channel, action, kind, id] of channels) {
    const request: AccessRequest = { channel, action, resource: { kind, id, companyId: 'a' } };
    assert.equal(authorize(db, actor, request, now).allowed, true);
    assert.equal(authorize(revoked, actor, request, now).allowed, false);
  }
});

test('manager, staff, patient and platform operator have separate capabilities', () => {
  const db=fixture();
  for (const kind of ['company-management', 'team'] as const) for (const user of ['manager-a','staff-a','patient-a','admin','manager-b']) {
    assert.equal(authorize(db,principal(user),{channel:'api',action:'read',resource:{kind,id:'a'}},now).allowed,user==='manager-a');
  }
  const audit: AccessRequest={channel:'api',action:'read',resource:{kind:'audit',id:'audit'}};
  assert.equal(authorize(db,principal('admin'),audit,now).allowed,false);
  assert.equal(authorize(db,principal('admin',['audit:read']),audit,now).allowed,true);
  assert.equal(authorize(db,principal('manager-a'),audit,now).allowed,false);
  for(const kind of ['raw-diagnostics','secrets','development'] as const) {
    assert.equal(authorize(db,principal('admin',['audit:read','users:metadata:read','companies:metadata:read']),{channel:'api',action:'read',resource:{kind,id:'restricted'}},now).allowed,false);
  }
});

test('only approved staff mark important; profile read belongs only to owner; unsupported export denied', () => {
  const db=fixture();
  for(const user of ['staff-a','staff-b','pending','patient-a','manager-a','admin']) {
    assert.equal(authorize(db,principal(user),{channel:'api',action:'mark-important',resource:{kind:'message',id:'message-a',companyId:'a'}},now).allowed,user==='staff-a');
    assert.equal(authorize(db,principal(user),{channel:'export',action:'export',resource:{kind:'conversation',id:'chat-a',companyId:'a'}},now).allowed,false);
    assert.equal(authorize(db,principal(user),{channel:'api',action:'read',resource:{kind:'profile',id:'patient-a'}},now).allowed,user==='patient-a');
  }
  assert.equal(authorize(db,principal('patient-a'),{channel:'api',action:'write',resource:{kind:'profile',id:'patient-a'}},now).allowed,false);
  assert.equal(authorize(db,principal('staff-a'),{channel:'api',action:'read',resource:{kind:'unknown',id:'x'} as unknown as Resource},now).allowed,false);
});

test('public company projection drops extra private fields and listing respects visibility', () => {
  const db=fixture(); const company={...db.companies[0],cpfSentinel:'PRIVATE_CPF_SENTINEL',internalNotes:'DEVELOPMENT_SENTINEL'};
  assert.deepEqual(Object.keys(publicCompanyDto(company)),['id','name','address','phone']);
  const req: AccessRequest={channel:'api',action:'read',resource:{kind:'company-public',id:'a'}};
  assert.equal(authorize(db,principal('new-user'),req,now).allowed,true);
  assert.equal(authorize({...db,companies:[{...company,listed:false}]},principal('new-user'),req,now).allowed,false);
});

test('list, detail and company context expose only authorized metadata, with opaque denials', () => {
  const db=fixture(); const actor=principal('patient-a');
  assert.deepEqual(listConversationMetadata(db,actor,'a',now).body.conversations.map(c=>c.id),['chat-a']);
  assert.deepEqual(listConversationMetadata(db,actor,'b',now).body.conversations.map(c=>c.id),['chat-a-in-b']);
  assert.deepEqual(listConversationMetadata(db,principal('staff-a'),'b',now).body.conversations,[]);
  assert.deepEqual(readConversationMetadata(db,actor,'a','chat-other',now),inaccessibleResponse());
  assert.deepEqual(readConversationMetadata(db,actor,'a','does-not-exist',now),inaccessibleResponse());
  assert.deepEqual(readConversationMetadata(db,actor,'b','chat-a',now),inaccessibleResponse());
});

test('valid registry checks do not grant a role or access to a new account', () => {
  const db=fixture(); const user=db.accounts.find(a=>a.id==='new-user')!;
  assert.equal(user.evidence.registry,'matched');
  assert.equal(user.evidence.identity,'unconfirmed');
  assert.deepEqual(listConversationMetadata(db,principal(user.id),'a',now).body.conversations,[]);
});
