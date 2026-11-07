import type { AccessDecision, AccessRequest, Conversation, Principal, Snapshot } from './contracts.ts';

const denied: AccessDecision = Object.freeze({ allowed: false });
const allowed: AccessDecision = Object.freeze({ allowed: true });
const decision = (value: boolean): AccessDecision => value ? allowed : denied;

function conversationAllowed(db: Snapshot, subject: string, conversation: Conversation): boolean {
  return db.memberships.some(m => m.companyId === conversation.companyId && m.userId === subject && m.state === 'active'
    && (m.role === 'staff' || m.role === 'patient' && conversation.patientId === subject));
}

// All arguments except resource/action selectors must be resolved by a trusted server.
// Re-evaluate against a current snapshot on every action/event, including after revocation.
export function authorize(db: Snapshot, principal: Principal | null, request: AccessRequest, now: number): AccessDecision {
  if (!principal || !Number.isFinite(now) || !Number.isFinite(principal.expiresAt) || principal.expiresAt <= now
    || !db.accounts.some(a => a.id === principal.subject && a.state === 'active')) return denied;
  const { resource: r, action, channel } = request;
  const isApiRead = channel === 'api' && action === 'read';
  if (r.kind === 'secrets' || r.kind === 'development' || r.kind === 'raw-diagnostics') return denied;
  if (r.kind === 'platform-users' || r.kind === 'platform-companies' || r.kind === 'audit') {
    const grant = r.kind === 'platform-users' ? 'users:metadata:read' : r.kind === 'platform-companies' ? 'companies:metadata:read' : 'audit:read';
    return decision(isApiRead && principal.platformGrants.includes(grant));
  }
  // Profile updates need field-specific commands; a general write must not change verified identity.
  if (r.kind === 'profile') return decision(isApiRead && r.id === principal.subject);
  if (r.kind === 'company-public' || r.kind === 'company-management' || r.kind === 'team') {
    const company = db.companies.find(c => c.id === r.id && c.state === 'active');
    if (!company) return denied;
    if (r.kind === 'company-public') return decision(isApiRead && company.listed);
    return decision(channel === 'api' && ['read', 'write'].includes(action) && db.memberships.some(m => m.userId === principal.subject
      && m.companyId === company.id && m.role === 'manager' && m.state === 'active'));
  }
  // Validate the actual parent chain, not only the company supplied by the client.
  if (r.kind !== 'conversation' && r.kind !== 'message' && r.kind !== 'attachment') return denied;
  const child = r.kind === 'message' ? db.messages.find(m => m.id === r.id) : r.kind === 'attachment' ? db.attachments.find(a => a.id === r.id) : null;
  const conversationId = r.kind === 'conversation' ? r.id : child?.conversationId;
  const conversation = db.conversations.find(c => c.id === conversationId && c.companyId === r.companyId);
  if (!conversation || child && child.companyId !== conversation.companyId
    || !db.companies.some(c => c.id === conversation.companyId && c.state === 'active')
    || !conversationAllowed(db, principal.subject, conversation)) return denied;
  if (channel === 'api' && action === 'mark-important') return decision(r.kind === 'message' && db.memberships.some(m => m.userId === principal.subject
    && m.companyId === conversation.companyId && m.role === 'staff' && m.state === 'active'));
  if (channel === 'api') return decision(action === 'read' || action === 'write' && r.kind !== 'attachment');
  if (channel === 'realtime') return decision(action === 'subscribe' && r.kind !== 'attachment');
  if (channel === 'storage') return decision(action === 'download' && r.kind === 'attachment');
  // Push only permits a notification decision; it does not permit putting message content in the payload.
  if (channel === 'push') return decision(action === 'read' && r.kind === 'message');
  // Export policy/retention and additional grants have not been approved: deny until defined.
  return denied;
}

export function publicCompanyDto(company: Snapshot['companies'][number]) {
  return { id: company.id, name: company.name, address: company.address, phone: company.phone };
}
export function inaccessibleResponse() {
  return { status: 404, body: { code: 'RESOURCE_UNAVAILABLE', message: 'Não foi possível acessar este conteúdo.' } } as const;
}
