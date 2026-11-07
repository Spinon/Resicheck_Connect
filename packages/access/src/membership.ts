import type { Membership, Principal, Snapshot } from './contracts.ts';

export type StaffInvitation = Readonly<{
  id: string; companyId: string; issuerId: string; recipientId: string;
  expiresAt: number; revoked: boolean; consumedBy?: string;
}>;
export type Ledger = Readonly<{ data: Snapshot; invitations: readonly StaffInvitation[] }>;
export type MembershipCommand =
  | Readonly<{ kind: 'accept-staff-invite'; invitationId: string }>
  | Readonly<{ kind: 'request-staff' | 'link-patient'; companyId: string }>
  | Readonly<{ kind: 'approve-staff' | 'revoke-staff'; companyId: string; userId: string }>;
export type Transition = Readonly<{ ok: true; ledger: Ledger; membership: Membership }> | Readonly<{ ok: false; code: 'UNAVAILABLE' }>;
const unavailable: Transition = Object.freeze({ ok: false, code: 'UNAVAILABLE' });

// Synthetic reference state machine only: a database adapter must lock/serialize the affected
// invitation and user's staff membership plus persist the audit atomically. No bearer token here.
export function transition(ledger: Ledger, principal: Principal | null, command: MembershipCommand, now: number): Transition {
  const db = ledger.data;
  if (!principal || !Number.isFinite(now) || !Number.isFinite(principal.expiresAt) || principal.expiresAt <= now
    || !db.accounts.some(a => a.id === principal.subject && a.state === 'active')) return unavailable;
  const invite = command.kind === 'accept-staff-invite' ? ledger.invitations.find(i => i.id === command.invitationId) : undefined;
  const companyId = command.kind === 'accept-staff-invite' ? invite?.companyId : command.companyId;
  if (!companyId || !db.companies.some(c => c.id === companyId && c.state === 'active')) return unavailable;
  const isManager = (userId: string) => db.memberships.some(m => m.userId === userId && m.companyId === companyId && m.role === 'manager' && m.state === 'active')
    && db.accounts.some(a => a.id === userId && a.state === 'active');
  const management = command.kind === 'approve-staff' || command.kind === 'revoke-staff';
  if (management && !isManager(principal.subject)) return unavailable;
  const userId = management ? command.userId : principal.subject;
  if (!db.accounts.some(a => a.id === userId && a.state === 'active')) return unavailable;
  const role = command.kind === 'link-patient' ? 'patient' : 'staff';
  const current = db.memberships.find(m => m.userId === userId && m.companyId === companyId && m.role === role);
  let state: Membership['state'];
  switch (command.kind) {
    case 'accept-staff-invite':
      if (!invite || invite.revoked || !Number.isFinite(invite.expiresAt) || invite.expiresAt <= now
        || invite.recipientId !== userId || !isManager(invite.issuerId)
        || invite.consumedBy && invite.consumedBy !== userId) return unavailable;
      // Replaying a used invitation must not reactivate a revoked membership.
      if (invite.consumedBy) return current?.state === 'active' ? { ok: true, ledger, membership: current } : unavailable;
      if (current?.state === 'revoked') return unavailable; // Explicit reactivation policy/command still required.
      state = 'active'; break;
    case 'request-staff':
      if (current?.state === 'active' || current?.state === 'pending') return { ok: true, ledger, membership: current };
      if (current?.state === 'revoked') return unavailable; // Re-entry/dispute policy is not defined.
      state = 'pending'; break;
    case 'approve-staff':
      if (current?.state !== 'pending') return unavailable;
      state = 'active'; break;
    case 'revoke-staff':
      if (!current || current.state === 'revoked') return unavailable;
      state = 'revoked'; break;
    case 'link-patient':
      if (current?.state === 'active') return { ok: true, ledger, membership: current };
      if (current) return unavailable;
      state = 'active'; break;
  }
  if (role === 'staff' && state === 'active' && db.memberships.some(m => m.userId === userId && m.role === 'staff'
    && m.state === 'active' && m.companyId !== companyId)) return unavailable;
  const membership: Membership = { userId, companyId, role, state };
  const memberships = [...db.memberships.filter(m => !(m.userId === userId && m.companyId === companyId && m.role === role)), membership];
  const invitations = command.kind === 'accept-staff-invite' ? ledger.invitations.map(i => i.id === invite!.id ? { ...i, consumedBy: userId } : i) : ledger.invitations;
  return { ok: true, membership, ledger: { data: { ...db, memberships }, invitations } };
}
