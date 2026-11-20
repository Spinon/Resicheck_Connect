import { analyzeMessage } from '../../text/src/message-text.ts';
import { parseHistoryTimestamp } from './history-timestamp.ts';
import type { TextSendRequest, SendContext } from './text-send-queue.ts';

type Params = Readonly<{ p_company: string; p_conversation: string; p_client_id: string; p_body: string }>;
// The integration must bind this port to one authenticated subject/session.
// Never inject a service-role client or a shared SDK client that changes users.
export type SubjectBoundRpc = (name: 'send_text', params: Params, signal: AbortSignal) => PromiseLike<unknown>;
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const fail = (code: 'INVALID_INPUT' | 'UNAVAILABLE' | 'RETRY_LATER' | 'INVALID_RESPONSE') => Object.freeze({ ok: false as const, code });
const id = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(v);

function decodeRow(value: unknown, request: TextSendRequest, senderId: string) {
  const row = Array.isArray(value) ? value.length === 1 ? value[0] : null : value;
  if (!record(row)) return null;
  const { id: messageId, company_id, conversation_id, sender_id, sender_role,
    sequence, accepted_at, kind, body, important } = row;
  // PostgREST bigint may be a number or a decimal string; never round it.
  const seq = typeof sequence === 'string' && /^[1-9][0-9]{0,15}$/.test(sequence) ? Number(sequence) : sequence;
  // The same strict calendar/offset parser used by history accepts actual
  // PostgREST timestamps without assuming that the server timezone is UTC.
  if (typeof accepted_at !== 'string') return null;
  const acceptedAt = parseHistoryTimestamp(accepted_at);
  if (acceptedAt === null) return null;
  if (!uuid(messageId) || company_id !== request.companyId || conversation_id !== request.conversationId
    || sender_id !== senderId || !['staff', 'patient'].includes(sender_role as string)
    || kind !== 'text' || body !== request.text || typeof important !== 'boolean'
    || !Number.isSafeInteger(seq) || (seq as number) < 1) return null;
  return Object.freeze({ id: messageId, companyId: company_id, conversationId: conversation_id,
    senderId: sender_id, senderRole: sender_role, sequence: seq as number, acceptedAt,
    kind: 'text' as const, text: body, important });
}

// Candidate adapter only: no SDK import, token/password, network, storage or UI.
// Current online SQL still uses char_length2000. Fail conservatively instead of
// claiming the local Unicode17 candidate has already been deployed.
export function createSupabaseSendAdapter({ schedule, timeoutMs, maxPending = 8 }: {
  schedule: (callback: () => void, ms: number) => () => void;
  timeoutMs: number; maxPending?: number;
}) {
  if (typeof schedule !== 'function' || !Number.isFinite(timeoutMs) || timeoutMs <= 0
    || !Number.isSafeInteger(maxPending) || maxPending < 1) throw new TypeError('Invalid adapter budget');
  let generation = 0;
  const pending = new Set<{ abort: () => void }>();
  function close() {
    const activation = ++generation;
    const previous = [...pending];
    pending.clear();
    // Abort listeners can reenter and activate a newer context. Never cancel
    // its jobs or let the outer activation borrow that newer generation.
    for (const job of previous) job.abort();
    return activation;
  }
  function openContext(context: SendContext, rpc: SubjectBoundRpc) {
    if (!context) throw new TypeError('Invalid adapter context');
    const { userId, companyId, conversationId, sessionKey } = context;
    if (!uuid(userId) || !uuid(companyId) || !uuid(conversationId)
      || typeof sessionKey !== 'string' || !sessionKey.trim() || typeof rpc !== 'function') throw new TypeError('Invalid adapter context');
    const activation = close();
    const active = () => activation === generation;
    async function send(request: TextSendRequest): Promise<unknown> {
      if (!active()) return fail('UNAVAILABLE');
      let captured: TextSendRequest;
      try {
        if (!request) return fail('INVALID_INPUT');
        const { companyId: destinationCompany, conversationId: destinationConversation, clientMessageId, text } = request;
        if (destinationCompany !== companyId || destinationConversation !== conversationId
          || !id(clientMessageId) || typeof text !== 'string'
          || !analyzeMessage(text).valid || [...text].length > 2000) return fail('INVALID_INPUT');
        captured = Object.freeze({ companyId, conversationId, clientMessageId, text });
      } catch { return fail('INVALID_INPUT'); }
      if (pending.size >= maxPending) return fail('RETRY_LATER');
      const ac = new AbortController();
      let reject!: (reason: Error) => void;
      const interrupted = new Promise<never>((_, r) => { reject = r; });
      void interrupted.catch(() => {}); // Safe even if the port throws before Promise.race attaches.
      let finished = false;
      const job = { abort: () => { if (!finished) { reject(new Error('Transport unavailable')); ac.abort(); } } };
      let cancel = () => {};
      pending.add(job);
      try {
        cancel = schedule(job.abort, timeoutMs);
        if (!active() || ac.signal.aborted) { job.abort(); await interrupted; return fail('UNAVAILABLE'); }
        const params = Object.freeze({ p_company: companyId, p_conversation: conversationId,
          p_client_id: captured.clientMessageId, p_body: captured.text });
        const response = await Promise.race([interrupted, rpc('send_text', params, ac.signal)]);
        if (!active()) return fail('UNAVAILABLE');
        if (!record(response)) return fail('INVALID_RESPONSE');
        // Do not inspect/copy message/details/hint. P0001 is ambiguous in the
        // existing SQL, so no classification based on human error text.
        if (response.error !== null) {
          const code = record(response.error) ? response.error.code : null;
          return fail(code === 'P0001' || code === '42501' || code === 'PGRST301' || code === 'PGRST302'
            ? 'UNAVAILABLE' : code === '40001' || code === '40P01' || code === 'RATE_LIMITED' ? 'RETRY_LATER' : 'INVALID_RESPONSE');
        }
        const value = decodeRow(response.data, captured, userId);
        if (!active()) return fail('UNAVAILABLE');
        return value ? Object.freeze({ ok: true as const, value }) : fail('INVALID_RESPONSE');
      } catch {
        if (!active()) return fail('UNAVAILABLE');
        // A thrown transport result may follow a server acceptance. The queue
        // classifies rejection as NETWORK/uncertain and retains the same ID.
        throw new Error('Transport unavailable');
      } finally { finished = true; try { cancel(); } catch { /* A timer cleanup failure cannot expose raw errors. */ } pending.delete(job); }
    }
    return Object.freeze({ send, close: () => { if (active()) close(); } });
  }
  return Object.freeze({ openContext, signOut: close });
}
