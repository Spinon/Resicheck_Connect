// Local server reference only. Catalog/audit are process-local, not durable chat persistence.
import { createHash, randomUUID } from 'node:crypto';
import type { Principal, Snapshot } from '../../access/src/contracts.ts';
import { authorize } from '../../access/src/policy.ts';

type Scope = Readonly<{ companyId: string; conversationId: string }>;
type Failure = Readonly<{ ok: false; code: 'INVALID_INPUT' | 'UNAVAILABLE' | 'CONFLICT' | 'RETRY_LATER' }>;
type Receipt = Readonly<{ id: string; state: 'quarantined' | 'ready' | 'rejected' }>;
type Row = Scope & { id: string; senderId: string; clientUploadId: string; objectKey: string;
  sha256: string; byteLength: number; state: Receipt['state']; mediaType?: string };
export type AttachmentAudit = Readonly<Scope & { attachmentId: string; actorId: string;
  state: Receipt['state']; at: number; sha256: string; byteLength: number }>;
export type Inspection = Readonly<{ accepted: true; sha256: string; byteLength: number; mediaType: string }>
  | Readonly<{ accepted: false }>;
export type AttachmentPorts = Readonly<{
  // Trusted server adapters only. Never accept authority/inspection from HTTP input.
  authority: () => Snapshot; now: () => number;
  // Keys are server-generated. Must be private, immutable/create-only; never upsert or publish.
  objects: { put: (key: string, bytes: Uint8Array) => Promise<void>;
    read: (key: string, maxBytes: number) => Promise<Uint8Array> };
  // Required isolation/time/memory/parser limits belong to the worker adapter.
  // No built-in MIME sniffing claims to replace this validation.
  inspect: (bytes: Uint8Array) => Promise<Inspection>;
  maxBytes: number; allowedMediaTypes: readonly string[]; idFactory?: () => string;
}>;
const id = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(v);
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const failure = (code: Failure['code']): Failure => ({ ok: false, code });
function exact(value: unknown, keys: string[]): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k));
}

export function createPrivateAttachments(ports: AttachmentPorts) {
  if (!Number.isSafeInteger(ports.maxBytes) || ports.maxBytes < 1 || !ports.allowedMediaTypes.length
    || ports.allowedMediaTypes.some(t => !/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(t))) throw new Error('Invalid attachment configuration');
  // Snapshot configuration; later mutation must not widen the allowlist/byte budget.
  const maxBytes = ports.maxBytes, mediaTypes = new Set(ports.allowedMediaTypes);
  const rows = new Map<string, Row>();
  const events: AttachmentAudit[] = [];
  function allowed(principal: Principal | null, scope: Scope, action: 'read' | 'write') {
    try {
      const now = ports.now();
      return Number.isSafeInteger(now) && now >= 0 && authorize(ports.authority(), principal, { channel: 'api', action,
        resource: { kind: 'conversation', id: scope.conversationId, companyId: scope.companyId } }, now).allowed;
    } catch { return false; }
  }
  function record(row: Row) {
    events.push({ companyId: row.companyId, conversationId: row.conversationId, attachmentId: row.id,
      actorId: row.senderId, state: row.state, at: ports.now(), sha256: row.sha256, byteLength: row.byteLength });
  }
  const receipt = (row: Row) => ({ id: row.id, state: row.state });
  return {
    // Restricted operational caller only; never serialize the service/audit to ordinary users.
    audit: (): readonly AttachmentAudit[] => events.map(e => ({ ...e })),
    async upload(principal: Principal | null, input: unknown, content: Uint8Array): Promise<Readonly<{ ok: true; value: Receipt }> | Failure> {
      if (!exact(input, ['companyId', 'conversationId', 'clientUploadId']) || !id(input.companyId)
        || !id(input.conversationId) || !id(input.clientUploadId) || !(content instanceof Uint8Array)
        || !content.byteLength || content.byteLength > maxBytes) return failure('INVALID_INPUT');
      const scope = { companyId: input.companyId, conversationId: input.conversationId };
      if (!principal || !allowed(principal, scope, 'write')) return failure('UNAVAILABLE');
      const bytes = Uint8Array.from(content), sha256 = digest(bytes);
      const previous = [...rows.values()].find(r => r.companyId === scope.companyId && r.conversationId === scope.conversationId
        && r.senderId === principal.subject && r.clientUploadId === input.clientUploadId);
      if (previous) {
        if (previous.sha256 !== sha256) return failure('CONFLICT');
        return previous.state === 'quarantined' ? failure('RETRY_LATER')
          : previous.state === 'rejected' ? failure('UNAVAILABLE') : { ok: true, value: receipt(previous) };
      }
      const serverId = (ports.idFactory ?? randomUUID)();
      if (!id(serverId) || rows.has(serverId)) return failure('RETRY_LATER');
      const row: Row = { ...scope, id: serverId, senderId: principal.subject, clientUploadId: input.clientUploadId,
        objectKey: `quarantine/${serverId}`, byteLength: bytes.byteLength, sha256, state: 'quarantined' };
      // Reserve before the first await: concurrent retry cannot create a second object in this process.
      rows.set(serverId, row); record(row);
      try {
        await ports.objects.put(row.objectKey, Uint8Array.from(bytes));
        const verdict = await ports.inspect(Uint8Array.from(bytes));
        if (!verdict.accepted || verdict.sha256 !== sha256 || verdict.byteLength !== bytes.byteLength
          || !mediaTypes.has(verdict.mediaType) || !allowed(principal, scope, 'write')) {
          row.state = 'rejected'; record(row); return failure('UNAVAILABLE');
        }
        row.mediaType = verdict.mediaType; row.state = 'ready'; record(row);
        return { ok: true, value: receipt(row) };
      } catch {
        row.state = 'rejected'; record(row); return failure('UNAVAILABLE');
      }
    },
    async download(principal: Principal | null, input: unknown): Promise<Readonly<{ ok: true; bytes: Uint8Array;
      headers: Readonly<Record<string, string>> }> | Failure> {
      if (!exact(input, ['companyId', 'attachmentId']) || !id(input.companyId) || !id(input.attachmentId)) return failure('INVALID_INPUT');
      const row = rows.get(input.attachmentId);
      if (!row || row.companyId !== input.companyId || row.state !== 'ready' || !allowed(principal, row, 'read')) return failure('UNAVAILABLE');
      try {
        const bytes = Uint8Array.from(await ports.objects.read(row.objectKey, maxBytes));
        // Re-evaluate after I/O: revocation/expiry while reading must not release the buffer.
        if (bytes.byteLength !== row.byteLength || digest(bytes) !== row.sha256 || !allowed(principal, row, 'read')) return failure('UNAVAILABLE');
        return { ok: true, bytes, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
          'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment', 'Content-Length': String(bytes.byteLength) } };
      } catch { return failure('UNAVAILABLE'); }
    },
  };
}
