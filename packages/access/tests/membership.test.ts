import test from 'node:test';
import assert from 'node:assert/strict';
import { transition } from '../src/membership.ts';
import type { Ledger, Transition } from '../src/membership.ts';
import { authorize } from '../src/policy.ts';
import { ledger, now, principal } from './fixtures.ts';
const accepted = (result: Transition) => { assert.equal(result.ok,true); if (!result.ok) throw Error('Expected successful reference transition'); return result; };

test('invitation activates directly without a second approval and is idempotent for the recipient', () => {
  const before=ledger();const result=accepted(transition(before,principal('new-user'),{kind:'accept-staff-invite',invitationId:'invite-a'},now));
  assert.equal(result.membership.state,'active');
  assert.equal(result.ledger.invitations[0].consumedBy,'new-user');
  assert.equal(before.data.memberships.some(m=>m.userId==='new-user'),false);
  assert.equal(before.invitations[0].consumedBy,undefined);
  assert.equal(accepted(transition(result.ledger,principal('new-user'),{kind:'accept-staff-invite',invitationId:'invite-a'},now)).ledger,result.ledger);
});

test('no-invitation request remains pending and only own-company manager can approve it', () => {
  const pending=accepted(transition(ledger(),principal('new-user'),{kind:'request-staff',companyId:'a'},now));
  assert.equal(pending.membership.state,'pending');
  assert.equal(authorize(pending.ledger.data,principal('new-user'),{channel:'api',action:'read',resource:{kind:'conversation',id:'chat-a',companyId:'a'}},now).allowed,false);
  const command={kind:'approve-staff',companyId:'a',userId:'new-user'} as const;
  for(const user of ['manager-b','staff-a','patient-a','admin','new-user']) assert.equal(transition(pending.ledger,principal(user),command,now).ok,false);
  assert.equal(accepted(transition(pending.ledger,principal('manager-a'),command,now)).membership.state,'active');
});

test('expired, revoked, wrong-recipient, missing and no-longer-authorized issuer invitations fail', () => {
  for(const change of [{expiresAt:now},{expiresAt:NaN},{revoked:true},{recipientId:'patient-b'},{issuerId:'staff-a'},{consumedBy:'patient-b'}]) {
    const db=ledger(); const altered={...db,invitations:db.invitations.map(i=>({...i,...change}))};
    assert.equal(transition(altered,principal('new-user'),{kind:'accept-staff-invite',invitationId:'invite-a'},now).ok,false);
  }
  const db=ledger(); const revokedManager={...db,data:{...db.data,memberships:db.data.memberships.map(m=>m.userId==='manager-a'?{...m,state:'revoked' as const}:m)}};
  assert.equal(transition(revokedManager,principal('new-user'),{kind:'accept-staff-invite',invitationId:'invite-a'},now).ok,false);
  assert.equal(transition(db,principal('new-user'),{kind:'accept-staff-invite',invitationId:'missing'},now).ok,false);
});

test('serial activation through two invitations enforces one active staff company in either order', () => {
  for(const [first,second] of [['invite-a','invite-b'],['invite-b','invite-a']]) {
    const a=accepted(transition(ledger(),principal('new-user'),{kind:'accept-staff-invite',invitationId:first},now));
    assert.equal(transition(a.ledger,principal('new-user'),{kind:'accept-staff-invite',invitationId:second},now).ok,false);
    assert.equal(a.ledger.data.memberships.filter(m=>m.userId==='new-user'&&m.role==='staff'&&m.state==='active').length,1);
    assert.equal(a.ledger.invitations.find(i=>i.id===second)?.consumedBy,undefined);
  }
});

test('invitation and approval paths share the same single-company constraint', () => {
  const pending=accepted(transition(ledger(),principal('new-user'),{kind:'request-staff',companyId:'b'},now));
  const active=accepted(transition(pending.ledger,principal('new-user'),{kind:'accept-staff-invite',invitationId:'invite-a'},now));
  assert.equal(transition(active.ledger,principal('manager-b'),{kind:'approve-staff',userId:'new-user',companyId:'b'},now).ok,false);
});

test('patient links immediately to multiple companies without exposing other patient conversations', () => {
  let state:Ledger=ledger();
  for(const companyId of ['a','b']) state=accepted(transition(state,principal('new-user'),{kind:'link-patient',companyId},now)).ledger;
  const links=state.data.memberships.filter(m=>m.userId==='new-user'&&m.role==='patient');
  assert.equal(links.length,2);assert.ok(links.every(m=>m.state==='active'));
  const same=accepted(transition(state,principal('new-user'),{kind:'link-patient',companyId:'a'},now));
  assert.equal(same.ledger,state);
  assert.equal(authorize(state.data,principal('new-user'),{channel:'api',action:'read',resource:{kind:'conversation',id:'chat-a',companyId:'a'}},now).allowed,false);
});

test('revocation removes content access and consumed invitation replay cannot resurrect it', () => {
  const active=accepted(transition(ledger(),principal('new-user'),{kind:'accept-staff-invite',invitationId:'invite-a'},now));
  const command={kind:'revoke-staff',companyId:'a',userId:'new-user'} as const;
  assert.equal(transition(active.ledger,principal('manager-b'),command,now).ok,false);
  const revoked=accepted(transition(active.ledger,principal('manager-a'),command,now));
  assert.equal(revoked.membership.state,'revoked');
  assert.equal(transition(revoked.ledger,principal('new-user'),{kind:'accept-staff-invite',invitationId:'invite-a'},now).ok,false);
  const replacement={...revoked.ledger,invitations:[{...revoked.ledger.invitations[0],id:'replacement',consumedBy:undefined}]};
  assert.equal(transition(replacement,principal('new-user'),{kind:'accept-staff-invite',invitationId:'replacement'},now).ok,false);
  assert.equal(authorize(revoked.ledger.data,principal('new-user'),{channel:'storage',action:'download',resource:{kind:'attachment',id:'file-a',companyId:'a'}},now).allowed,false);
});

test('unauthenticated/expired/suspended actors cannot transition membership; unknown company denied', () => {
  const db=ledger();const command={kind:'link-patient',companyId:'a'} as const;
  assert.equal(transition(db,null,command,now).ok,false);
  assert.equal(transition(db,{...principal('new-user'),expiresAt:now},command,now).ok,false);
  assert.equal(transition({...db,data:{...db.data,accounts:db.data.accounts.map(a=>a.id==='new-user'?{...a,state:'suspended' as const}:a)}},principal('new-user'),command,now).ok,false);
  assert.equal(transition(db,principal('new-user'),{...command,companyId:'missing'},now).ok,false);
});
