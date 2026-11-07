import { randomUUID } from 'node:crypto';
import type { Conversation, Principal, Snapshot } from '../../access/src/contracts.ts';
import { authorize } from '../../access/src/policy.ts';
import { analyzeMessage } from '../../text/src/message-text.ts';

export type TextMessage = Readonly<{
  id: string; companyId: string; conversationId: string; senderId: string;
  senderRole: 'staff' | 'patient'; sequence: number; acceptedAt: number;
  kind: 'text'; text: string; important: boolean;
}>;
type StoredMessage = TextMessage & Readonly<{ clientMessageId: string }>;
export type AuditEvent = Readonly<{
  sequence: number; kind: 'conversation-created' | 'message-accepted' | 'message-important-changed';
  actorId: string; companyId: string; conversationId: string; messageId?: string; at: number;
}>;
export type ChatStore = Readonly<{
  conversations: readonly Conversation[]; messages: readonly StoredMessage[]; audit: readonly AuditEvent[];
}>;
export type Failure = Readonly<{ ok: false; code: 'UNAVAILABLE' | 'INVALID_INPUT' | 'CONFLICT' | 'RETRY_LATER' }>;
type Success<T> = Readonly<{ ok: true; store: ChatStore; value: T }>;
type Result<T> = Success<T> | Failure;
const fail = (code: Failure['code']): Failure => ({ ok: false, code });
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k));
const id = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
const validTime = (now: number) => Number.isSafeInteger(now) && now >= 0;
const validText = (text: unknown): text is string => typeof text === 'string' && analyzeMessage(text).valid;
const freeId = (store: ChatStore, value: string) => id(value) && !store.messages.some(m => m.id === value) && !store.conversations.some(c => c.id === value);

// Fresh account/company/membership authority is supplied on every call. This store owns only
// reference chat rows. No cache of identity claims or client-submitted roles is authoritative.
export function toAccessSnapshot(store: ChatStore, authority: Snapshot): Snapshot {
  return { ...authority, conversations: store.conversations, messages: store.messages.map(m => ({ id: m.id, companyId: m.companyId, conversationId: m.conversationId })) };
}
function can(store: ChatStore, authority: Snapshot, principal: Principal | null, companyId: string, conversationId: string, now: number, action: 'read' | 'write') {
  return validTime(now) && authorize(toAccessSnapshot(store, authority), principal, {
    channel: 'api', action, resource: { kind: 'conversation', id: conversationId, companyId },
  }, now).allowed;
}
function dto(message: StoredMessage): TextMessage {
  return { id: message.id, companyId: message.companyId, conversationId: message.conversationId,
    senderId: message.senderId, senderRole: message.senderRole, sequence: message.sequence,
    acceptedAt: message.acceptedAt, kind: message.kind, text: message.text, important: message.important };
}
function audit(store: ChatStore, event: Omit<AuditEvent, 'sequence'>): readonly AuditEvent[] {
  return [...store.audit, { ...event, sequence: store.audit.length + 1 }];
}

// Server command input only: never accept patientId, senderId, role, acceptedAt or sequence.
export function ensurePatientConversation(store: ChatStore, authority: Snapshot, principal: Principal | null,
  input: unknown, now: number, idFactory: () => string = randomUUID): Result<Conversation> {
  if (!isRecord(input) || !exactKeys(input, ['companyId']) || !id(input.companyId)) return fail('INVALID_INPUT');
  const companyId = input.companyId;
  if (!validTime(now) || !principal || !authorize(authority, principal, { channel: 'api', action: 'read', resource: { kind: 'profile', id: principal.subject } }, now).allowed
    || !authority.companies.some(c => c.id === companyId && c.state === 'active')
    || !authority.memberships.some(m => m.userId === principal.subject && m.companyId === companyId && m.role === 'patient' && m.state === 'active')) return fail('UNAVAILABLE');
  const existing = store.conversations.find(c => c.companyId === companyId && c.patientId === principal.subject);
  if (existing) return { ok: true, store, value: { ...existing } };
  const serverId = idFactory();
  if (!freeId(store, serverId)) return fail('RETRY_LATER');
  const conversation: Conversation = { id: serverId, companyId, patientId: principal.subject };
  return { ok: true, value: { ...conversation }, store: { ...store, conversations: [...store.conversations, conversation],
    audit: audit(store, { kind: 'conversation-created', actorId: principal.subject, companyId, conversationId: serverId, at: now }) } };
}

export function sendText(store: ChatStore, authority: Snapshot, principal: Principal | null,
  input: unknown, now: number, idFactory: () => string = randomUUID): Result<TextMessage> {
  if (!isRecord(input) || !exactKeys(input, ['companyId', 'conversationId', 'clientMessageId', 'text'])
    || !id(input.companyId) || !id(input.conversationId) || !id(input.clientMessageId) || !validText(input.text)) return fail('INVALID_INPUT');
  const { companyId, conversationId, clientMessageId, text } = input;
  // Authorization precedes deduplication: revoked actors cannot retrieve old receipts/messages.
  if (!principal || !can(store, authority, principal, companyId, conversationId, now, 'write')) return fail('UNAVAILABLE');
  const previous = store.messages.find(m => m.senderId === principal.subject && m.companyId === companyId
    && m.conversationId === conversationId && m.clientMessageId === clientMessageId);
  if (previous) return previous.text === text ? { ok: true, store, value: dto(previous) } : fail('CONFLICT');
  const staff = authority.memberships.some(m => m.userId === principal.subject && m.companyId === companyId && m.role === 'staff' && m.state === 'active');
  // Ambiguous dual operational roles await product policy; do not guess the author's role.
  const ownPatient = store.conversations.some(c => c.id === conversationId && c.patientId === principal.subject)
    && authority.memberships.some(m => m.userId === principal.subject && m.companyId === companyId && m.role === 'patient' && m.state === 'active');
  if (staff && ownPatient) return fail('UNAVAILABLE');
  const sequence = store.messages.reduce((highest, m) => m.conversationId === conversationId ? Math.max(highest, m.sequence) : highest, 0) + 1;
  if (!Number.isSafeInteger(sequence)) return fail('RETRY_LATER');
  const serverId = idFactory();
  if (!freeId(store, serverId)) return fail('RETRY_LATER');
  const message: StoredMessage = { id: serverId, companyId, conversationId, clientMessageId, senderId: principal.subject,
    senderRole: staff ? 'staff' : 'patient', sequence, acceptedAt: now, kind: 'text', text, important: false };
  return { ok: true, value: dto(message), store: { ...store, messages: [...store.messages, message],
    audit: audit(store, { kind: 'message-accepted', actorId: principal.subject, companyId, conversationId, messageId: serverId, at: now }) } };
}

export function setImportant(store: ChatStore, authority: Snapshot, principal: Principal | null, input: unknown, now: number): Result<TextMessage> {
  if (!isRecord(input) || !exactKeys(input, ['companyId', 'messageId', 'important']) || !id(input.companyId) || !id(input.messageId)
    || typeof input.important !== 'boolean') return fail('INVALID_INPUT');
  if (!validTime(now) || !principal || !authorize(toAccessSnapshot(store, authority), principal, {
    channel: 'api', action: 'mark-important', resource: { kind: 'message', id: input.messageId, companyId: input.companyId },
  }, now).allowed) return fail('UNAVAILABLE');
  const previous = store.messages.find(m => m.id === input.messageId)!;
  if (previous.important === input.important) return { ok: true, store, value: dto(previous) };
  const updated = { ...previous, important: input.important };
  return { ok: true, value: dto(updated), store: { ...store, messages: store.messages.map(m => m.id === updated.id ? updated : m),
    audit: audit(store, { kind: 'message-important-changed', actorId: principal.subject, companyId: updated.companyId,
      conversationId: updated.conversationId, messageId: updated.id, at: now }) } };
}

// Cursor is a server sequence within the requested conversation, not an offset into global rows.
export function listMessages(store: ChatStore, authority: Snapshot, principal: Principal | null, input: unknown, now: number):
  Readonly<{ ok: true; value: readonly TextMessage[]; nextAfter: number | null }> | Failure {
  if (!isRecord(input) || !exactKeys(input, ['companyId', 'conversationId', 'after', 'limit'])
    || !id(input.companyId) || !id(input.conversationId) || !Number.isSafeInteger(input.after) || (input.after as number) < 0
    || !Number.isSafeInteger(input.limit) || (input.limit as number) < 1 || (input.limit as number) > 100) return fail('INVALID_INPUT');
  if (!can(store, authority, principal, input.companyId, input.conversationId, now, 'read')) return fail('UNAVAILABLE');
  const rows = store.messages.filter(m => m.companyId === input.companyId && m.conversationId === input.conversationId && m.sequence > (input.after as number))
    .sort((a,b) => a.sequence - b.sequence);
  const page = rows.slice(0, input.limit as number);
  return { ok: true, value: page.map(dto), nextAfter: rows.length > page.length ? page.at(-1)!.sequence : null };
}
