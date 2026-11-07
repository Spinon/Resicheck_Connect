import type { Principal, Snapshot } from '../src/contracts.ts';
import type { Ledger } from '../src/membership.ts';
export const now = 1000;
export const principal = (subject: string, platformGrants: Principal['platformGrants'] = []): Principal => ({ subject, expiresAt: 2000, platformGrants });
export function fixture(): Snapshot {
  return {
    accounts: ['manager-a', 'manager-b', 'staff-a', 'staff-a2', 'staff-b', 'pending', 'revoked', 'patient-a', 'patient-other', 'patient-b', 'admin', 'new-user'].map(id => ({ id, state: 'active', evidence: { format: 'valid', registry: 'matched', contact: 'confirmed', identity: 'unconfirmed' } })),
    companies: ['a', 'b'].map(id => ({ id, state: 'active', listed: true, name: `Empresa sintética ${id}`, address: 'Endereço fictício', phone: 'Não disponível' })),
    memberships: [
      { userId: 'manager-a', companyId: 'a', role: 'manager', state: 'active' },
      { userId: 'manager-b', companyId: 'b', role: 'manager', state: 'active' },
      { userId: 'staff-a', companyId: 'a', role: 'staff', state: 'active' },
      { userId: 'staff-a2', companyId: 'a', role: 'staff', state: 'active' },
      { userId: 'staff-b', companyId: 'b', role: 'staff', state: 'active' },
      { userId: 'pending', companyId: 'a', role: 'staff', state: 'pending' },
      { userId: 'revoked', companyId: 'a', role: 'staff', state: 'revoked' },
      { userId: 'patient-a', companyId: 'a', role: 'patient', state: 'active' },
      { userId: 'patient-a', companyId: 'b', role: 'patient', state: 'active' },
      { userId: 'patient-other', companyId: 'a', role: 'patient', state: 'active' },
      { userId: 'patient-b', companyId: 'b', role: 'patient', state: 'active' },
    ],
    conversations: [
      { id: 'chat-a', companyId: 'a', patientId: 'patient-a' },
      { id: 'chat-other', companyId: 'a', patientId: 'patient-other' },
      { id: 'chat-b', companyId: 'b', patientId: 'patient-b' },
      { id: 'chat-a-in-b', companyId: 'b', patientId: 'patient-a' },
    ],
    messages: [{ id: 'message-a', companyId: 'a', conversationId: 'chat-a' }, { id: 'message-b', companyId: 'b', conversationId: 'chat-b' }],
    attachments: [{ id: 'file-a', companyId: 'a', conversationId: 'chat-a' }, { id: 'file-b', companyId: 'b', conversationId: 'chat-b' }],
  };
}
export function ledger(): Ledger {
  return { data: fixture(), invitations: [
    { id: 'invite-a', companyId: 'a', issuerId: 'manager-a', recipientId: 'new-user', expiresAt: 1800, revoked: false },
    { id: 'invite-b', companyId: 'b', issuerId: 'manager-b', recipientId: 'new-user', expiresAt: 1800, revoked: false },
  ] };
}
