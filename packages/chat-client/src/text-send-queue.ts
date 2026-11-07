import { createSessionScope } from '../../session/src/session-scope.ts';
import { analyzeMessage } from '../../text/src/message-text.ts';

// Local presentation context, never credentials or proof of backend authorization.
export type SendContext = Readonly<{ sessionKey: string; userId: string; companyId: string; conversationId: string }>;
export type TextSendRequest = Readonly<{ companyId: string; conversationId: string; clientMessageId: string; text: string }>;
export type SendFailure = Readonly<{
  code: 'TIMEOUT' | 'NETWORK' | 'UNAVAILABLE' | 'INVALID_INPUT' | 'CONFLICT' | 'RETRY_LATER' | 'INVALID_RESPONSE';
  message: string; retryable: boolean; acceptanceUncertain: boolean;
}>;
export type QueueEntry = Readonly<{
  clientMessageId: string; text: string; status: 'pending' | 'sending' | 'accepted' | 'failed'; attempts: number;
  failure: SendFailure | null;
  receipt: Readonly<{ id: string; sequence: number; acceptedAt: number }> | null;
}>;
export type AttemptOutcome = 'accepted' | 'failed' | 'discarded' | 'ignored';
type Attempt = { promise: Promise<AttemptOutcome>; resolve: (value: AttemptOutcome) => void; cancel: () => void; done: boolean };
type Dependencies = {
  transport: (request: TextSendRequest) => Promise<unknown>;
  createId: () => string;
  // Schedule once; cancellation must be synchronous and must not throw.
  schedule: (callback: () => void, delayMs: number) => () => void;
  timeoutMs: number;
  maxEntries?: number;
};
const validId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value);
const messages = Object.freeze({
  TIMEOUT: 'A confirmação não chegou a tempo. Tente novamente para confirmar o envio.',
  NETWORK: 'Não foi possível confirmar o envio. Tente novamente.',
  UNAVAILABLE: 'Não foi possível acessar esta conversa.',
  INVALID_INPUT: 'Não foi possível enviar esta mensagem. Revise o texto.',
  CONFLICT: 'Não foi possível confirmar esta mensagem. Atualize a conversa.',
  RETRY_LATER: 'Não foi possível enviar agora. Tente novamente.',
  INVALID_RESPONSE: 'Não foi possível confirmar esta mensagem. Atualize a conversa.',
});
function failure(code: SendFailure['code']): SendFailure {
  return Object.freeze({ code, message: messages[code], retryable: ['TIMEOUT', 'NETWORK', 'RETRY_LATER'].includes(code), acceptanceUncertain: ['TIMEOUT', 'NETWORK', 'INVALID_RESPONSE'].includes(code) });
}

// In-memory orchestration only. No SDK, IO, credentials, storage or automatic retry.
export function createTextSendQueue({ transport, createId, schedule, timeoutMs, maxEntries = 100 }: Dependencies) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TypeError('Invalid timeout');
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) throw new TypeError('Invalid queue capacity');
  const entries = new Map<string, QueueEntry>();
  const attempts = new Map<string, Attempt>();
  function settle(id: string, attempt: Attempt, outcome: AttemptOutcome) {
    if (attempt.done) return;
    attempt.done = true;
    if (attempts.get(id) === attempt) attempts.delete(id);
    try { attempt.cancel(); } catch { /* Cleanup must not strand an outcome or an old context. */ }
    attempt.resolve(outcome);
  }
  function clearView(): undefined {
    entries.clear();
    for (const [id, attempt] of attempts) settle(id, attempt, 'discarded');
  }
  const scope = createSessionScope(clearView);

  function openContext(context: SendContext) {
    if (!context || !validId(context.userId) || !validId(context.companyId) || !validId(context.conversationId)
      || typeof context.sessionKey !== 'string' || !context.sessionKey.trim()) throw new TypeError('Invalid presentation context');
    // Every activation invalidates old handles, even A -> B -> A or the same user
    // logging in again. Conversation changes must open a fresh context as well.
    const current = Object.freeze({ ...context });
    const auth = scope.beginAuthentication();
    scope.acceptIdentity(auth, current.userId);
    scope.selectCompany(current.companyId);
    const ticket = scope.capture();
    const active = () => ticket === scope.capture();
    const update = (entry: QueueEntry) => scope.commit(ticket, () => { entries.set(entry.clientMessageId, Object.freeze(entry)); });

    function enqueue(text: unknown): Readonly<{ ok: true; clientMessageId: string } | { ok: false; code: 'INACTIVE' | 'INVALID_INPUT' | 'LOCAL_ERROR' | 'QUEUE_FULL' }> {
      if (!active()) return Object.freeze({ ok: false, code: 'INACTIVE' });
      // Capacity protects unresolved work, not the lifetime number of messages.
      if ([...entries.values()].filter(entry => entry.status !== 'accepted').length >= maxEntries) return Object.freeze({ ok: false, code: 'QUEUE_FULL' });
      if (typeof text !== 'string' || !analyzeMessage(text).valid) return Object.freeze({ ok: false, code: 'INVALID_INPUT' });
      let id: string;
      try { id = createId(); } catch { return Object.freeze({ ok: false, code: 'LOCAL_ERROR' }); }
      if (!validId(id) || entries.has(id)) return Object.freeze({ ok: false, code: 'LOCAL_ERROR' });
      if (!active()) return Object.freeze({ ok: false, code: 'INACTIVE' });
      // Keep the receipt observable until a subsequent valid enqueue needs its
      // slot. UI/history owns accepted messages; this bounded map is not history.
      for (const [acceptedId, entry] of entries) {
        if (entries.size < maxEntries) break;
        if (entry.status === 'accepted') entries.delete(acceptedId);
      }
      if (!update({ clientMessageId: id, text, status: 'pending', attempts: 0, failure: null, receipt: null })) return Object.freeze({ ok: false, code: 'INACTIVE' });
      return Object.freeze({ ok: true, clientMessageId: id });
    }

    function send(id: string): Promise<AttemptOutcome> {
      if (!active()) return Promise.resolve('discarded');
      const entry = entries.get(id);
      if (!entry || entry.status === 'accepted' || entry.status === 'failed' && !entry.failure?.retryable) return Promise.resolve('ignored');
      const running = attempts.get(id);
      if (running) return running.promise;
      let resolve!: (value: AttemptOutcome) => void;
      const attempt: Attempt = { promise: new Promise(r => { resolve = r; }), resolve: value => resolve(value), cancel: () => {}, done: false };
      const sending = Object.freeze({ ...entry, status: 'sending' as const, attempts: entry.attempts + 1, failure: null });
      update(sending);
      attempts.set(id, attempt);
      const isCurrent = () => active() && !attempt.done && attempts.get(id) === attempt;
      function reject(code: SendFailure['code']) {
        if (!isCurrent()) return;
        update({ ...sending, status: 'failed', failure: failure(code) });
        settle(id, attempt, 'failed');
      }
      function receive(reply: unknown) {
        if (!isCurrent()) return;
        try {
          if (!reply || typeof reply !== 'object') { reject('INVALID_RESPONSE'); return; }
          const result = reply as Record<string, unknown>;
          if (result.ok === false) {
            const code = result.code;
            reject(code === 'UNAVAILABLE' || code === 'INVALID_INPUT' || code === 'CONFLICT' || code === 'RETRY_LATER' ? code : 'INVALID_RESPONSE');
            return;
          }
          const message = result.value as Record<string, unknown> | null;
          if (result.ok !== true || !message || typeof message !== 'object') { reject('INVALID_RESPONSE'); return; }
          const { id: messageId, companyId, conversationId, senderId, text, kind, sequence, acceptedAt } = message;
          if (!validId(messageId) || companyId !== current.companyId || conversationId !== current.conversationId
            || senderId !== current.userId || text !== sending.text || kind !== 'text'
            || !Number.isSafeInteger(sequence) || (sequence as number) < 1
            || !Number.isSafeInteger(acceptedAt) || (acceptedAt as number) < 0) { reject('INVALID_RESPONSE'); return; }
          // Copy only the minimal receipt, never server envelopes/debug/foreign text.
          update({ ...sending, status: 'accepted', receipt: Object.freeze({ id: messageId, sequence: sequence as number, acceptedAt: acceptedAt as number }) });
          settle(id, attempt, 'accepted');
        } catch { reject('INVALID_RESPONSE'); }
      }
      try {
        const cancel = schedule(() => reject('TIMEOUT'), timeoutMs);
        if (attempt.done) cancel(); else attempt.cancel = cancel;
        if (isCurrent()) {
          const request = Object.freeze({ companyId: current.companyId, conversationId: current.conversationId, clientMessageId: id, text: sending.text });
          Promise.resolve(transport(request)).then(receive, () => reject('NETWORK'));
        }
      } catch { reject('NETWORK'); }
      return attempt.promise;
    }
    return Object.freeze({
      enqueue, send,
      snapshot: (): readonly QueueEntry[] => active() ? Object.freeze([...entries.values()]) : Object.freeze([]),
      // Must be called when the integration learns of revocation; it does not
      // discover revocation itself or cancel an already accepted server command.
      revoke: (): boolean => { if (!active()) return false; scope.signOut(); return true; },
    });
  }
  return Object.freeze({ openContext, signOut: (): void => scope.signOut() });
}
