import type { Principal, Snapshot } from './contracts.ts';
import { authorize, inaccessibleResponse } from './policy.ts';

// Reference read boundary: authorized metadata only, not a production chat API.
export function readConversationMetadata(db: Snapshot, principal: Principal | null, companyId: string, id: string, now: number) {
  if (!authorize(db, principal, { channel: 'api', action: 'read', resource: { kind: 'conversation', companyId, id } }, now).allowed) return inaccessibleResponse();
  const c = db.conversations.find(c => c.id === id && c.companyId === companyId)!;
  return { status: 200, body: { id: c.id, companyId: c.companyId, patientId: c.patientId } } as const;
}
export function listConversationMetadata(db: Snapshot, principal: Principal | null, companyId: string, now: number) {
  // Never fetch unrestricted content into a client to hide it later. Database adapters must
  // scope/filter in their query as well as apply object checks. This fixture scans memory only.
  const rows = db.conversations.filter(c => c.companyId === companyId && authorize(db, principal, {
    channel: 'api', action: 'read', resource: { kind: 'conversation', companyId, id: c.id },
  }, now).allowed).map(c => ({ id: c.id, companyId: c.companyId, patientId: c.patientId }));
  return { status: 200, body: { conversations: rows } } as const;
}
