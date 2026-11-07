// Reference contracts for a future trusted server adapter. Never hydrate authority from client JSON.
export type IdentityEvidence = Readonly<{
  format: 'unchecked' | 'valid' | 'invalid';
  registry: 'unchecked' | 'matched' | 'mismatched' | 'unavailable';
  contact: 'unconfirmed' | 'confirmed';
  identity: 'unconfirmed' | 'confirmed' | 'disputed';
}>;
export type Account = Readonly<{ id: string; state: 'active' | 'suspended'; evidence: IdentityEvidence }>;
export type Membership = Readonly<{
  userId: string; companyId: string; role: 'manager' | 'staff' | 'patient';
  state: 'pending' | 'active' | 'revoked';
}>;
export type Company = Readonly<{
  id: string; state: 'pending' | 'active' | 'suspended'; listed: boolean;
  name: string; address: string; phone: string;
}>;
export type Conversation = Readonly<{ id: string; companyId: string; patientId: string }>;
export type ChildResource = Readonly<{ id: string; companyId: string; conversationId: string }>;
export type Snapshot = Readonly<{
  accounts: readonly Account[]; companies: readonly Company[]; memberships: readonly Membership[];
  conversations: readonly Conversation[]; messages: readonly ChildResource[]; attachments: readonly ChildResource[];
}>;
export type Principal = Readonly<{
  // Resolved from authenticated session on the server; grants never come from a request body.
  subject: string; expiresAt: number;
  platformGrants: readonly ('users:metadata:read' | 'companies:metadata:read' | 'audit:read')[];
}>;
export type Channel = 'api' | 'realtime' | 'storage' | 'push' | 'export';
export type Action = 'read' | 'write' | 'subscribe' | 'download' | 'export' | 'mark-important';
export type Resource =
  | Readonly<{ kind: 'company-public' | 'company-management' | 'team'; id: string }>
  | Readonly<{ kind: 'profile'; id: string }>
  | Readonly<{ kind: 'conversation' | 'message' | 'attachment'; id: string; companyId: string }>
  | Readonly<{ kind: 'platform-users' | 'platform-companies' | 'audit' | 'raw-diagnostics' | 'secrets' | 'development'; id: string }>;
export type AccessRequest = Readonly<{ channel: Channel; action: Action; resource: Resource }>;
// Opaque not-found response covers missing and inaccessible objects equally.
export type AccessDecision = Readonly<{ allowed: boolean }>;
