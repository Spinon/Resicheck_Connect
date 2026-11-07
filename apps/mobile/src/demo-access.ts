import { authorize } from '../../../packages/access/src/policy.ts';
import type { AccessRequest, Snapshot } from '../../../packages/access/src/contracts.ts';
import type { DemoState } from './demo.ts';

// Fictional snapshot assembled locally for UX consistency only. The real backend
// must resolve accounts/memberships itself, never trust these client fields.
export function demoAllows(state: DemoState, request: AccessRequest, companyCatalog: readonly { id: string; name: string; address: string; phone: string }[]): boolean {
  const actor = state.actor;
  if (!actor) return false;
  const db: Snapshot = {
    accounts: [{ id: actor.id, state: 'active', evidence: { format: 'unchecked', registry: 'unchecked', contact: 'unconfirmed', identity: 'unconfirmed' } }],
    companies: companyCatalog.map(c => ({ ...c, state: 'active', listed: true })),
    memberships: actor.role === 'staff'
      ? actor.companyId ? [{ userId: actor.id, companyId: actor.companyId, role: 'staff', state: actor.approved ? 'active' : 'pending' }] : []
      : state.linkedCompanies.map(companyId => ({ userId: actor.id, companyId, role: 'patient', state: 'active' })),
    conversations: state.conversations,
    messages: state.conversations.flatMap(c => c.messages.map(m => ({ id: m.id, companyId: c.companyId, conversationId: c.id }))),
    attachments: [],
  };
  return authorize(db, { subject: actor.id, expiresAt: 2, platformGrants: [] }, request, 1).allowed;
}
