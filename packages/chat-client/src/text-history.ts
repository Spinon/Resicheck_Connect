import { analyzeMessage } from '../../text/src/message-text.ts';
import type { SendContext } from './text-send-queue.ts';

export type HistoryRequest = Readonly<{ companyId: string; conversationId: string; after: number; limit: number }>;
export type HistoryMessage = Readonly<{
  id: string; companyId: string; conversationId: string; senderId: string;
  senderRole: 'patient' | 'staff'; kind: 'text'; text: string;
  sequence: number; acceptedAt: number; important: boolean;
}>;
type ErrorCode = 'NETWORK' | 'TIMEOUT' | 'INVALID_RESPONSE' | 'UNAVAILABLE' | 'CAPACITY';
export type HistorySnapshot = Readonly<{
  status: 'idle' | 'loading' | 'ready' | 'failed' | 'unavailable';
  messages: readonly HistoryMessage[]; after: number; hasMore: boolean | null;
  error: Readonly<{ code: ErrorCode; message: string; retryable: boolean }> | null;
}>;
type Outcome = 'loaded' | 'failed' | 'discarded' | 'unavailable';
type Dependencies = {
  transport: (request: HistoryRequest) => Promise<unknown>;
  schedule: (callback: () => void, delayMs: number) => () => void;
  timeoutMs: number; pageSize?: number; maxMessages?: number;
};
const validId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(v);
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const integer = (v: unknown, min: number): v is number => Number.isSafeInteger(v) && (v as number) >= min;
const empty = Object.freeze([]) as readonly HistoryMessage[];
const idle: HistorySnapshot = Object.freeze({ status: 'idle', messages: empty, after: 0, hasMore: null, error: null });
const errors: Record<ErrorCode, string> = {
  NETWORK: 'Não foi possível atualizar a conversa. Tente novamente.',
  TIMEOUT: 'A atualização demorou mais que o esperado. Tente novamente.',
  INVALID_RESPONSE: 'Não foi possível atualizar a conversa. Tente novamente.',
  UNAVAILABLE: 'Não foi possível acessar esta conversa.',
  CAPACITY: 'O limite local desta conversa foi atingido.',
};
const problem = (code: ErrorCode) => Object.freeze({ code, message: errors[code], retryable: ['NETWORK', 'TIMEOUT', 'INVALID_RESPONSE'].includes(code) });

// Presentation-only, bounded and in memory. The transport/server must authorize each page.
// sessionKey/userId are never sent as authentication. No IO, subscription or automatic retry.
export function createTextHistory({ transport, schedule, timeoutMs, pageSize = 50, maxMessages = 1000 }: Dependencies) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || !integer(pageSize, 1) || pageSize > 100 || !integer(maxMessages, 1)) throw new TypeError('Invalid history budget');
  let generation = 0;
  type Run = { generation: number; state: HistorySnapshot; closePending: (() => void) | null };
  let run: Run | null = null;
  function clear() {
    generation++;
    const previous = run; run = null;
    if (previous) { previous.state = idle; previous.closePending?.(); }
  }
  function openContext(context: SendContext, onUpdate: () => void = () => {}) {
    if (!context || !validId(context.userId) || !validId(context.companyId) || !validId(context.conversationId)
      || typeof context.sessionKey !== 'string' || !context.sessionKey.trim()) throw new TypeError('Invalid presentation context');
    clear();
    const current: Run = { generation, state: idle, closePending: null }; run = current;
    // Only required primitive context values are captured; callers cannot mutate routing.
    const companyId = context.companyId, conversationId = context.conversationId;
    const active = () => run === current && current.generation === generation;
    let pending: Promise<Outcome> | null = null;
    const publish = (next: HistorySnapshot) => {
      if (!active()) return;
      current.state = Object.freeze(next);
      try { onUpdate(); } catch { /* Observers do not control state or completion. */ }
    };
    function loadNext(): Promise<Outcome> {
      if (!active()) return Promise.resolve('discarded');
      if (pending) return pending;
      if (current.state.status === 'unavailable') return Promise.resolve('unavailable');
      if (current.state.messages.length >= maxMessages) {
        publish({ ...current.state, status: 'failed', error: problem('CAPACITY') });
        return Promise.resolve('failed');
      }
      const before = current.state;
      const request: HistoryRequest = Object.freeze({ companyId, conversationId, after: before.after, limit: Math.min(pageSize, maxMessages - before.messages.length) });
      let complete!: (outcome: Outcome) => void;
      const attempt = new Promise<Outcome>(resolve => { complete = resolve; }); pending = attempt;
      let done = false, cancel = () => {};
      function settle(outcome: Outcome) {
        if (done) return;
        done = true;
        try { cancel(); } catch { /* Never strand an operation. */ }
        if (pending === attempt) { pending = null; current.closePending = null; }
        complete(outcome);
      }
      const isCurrent = () => active() && !done;
      const reject = (code: ErrorCode) => {
        if (!isCurrent()) return;
        if (code === 'UNAVAILABLE') publish({ status: 'unavailable', messages: empty, after: 0, hasMore: null, error: problem(code) });
        else publish({ ...before, status: 'failed', error: problem(code) });
        settle(code === 'UNAVAILABLE' ? 'unavailable' : 'failed');
      };
      current.closePending = () => settle('discarded');
      publish({ ...before, status: 'loading', error: null });
      function receive(reply: unknown) {
        if (!isCurrent()) return;
        try {
          if (!record(reply)) { reject('INVALID_RESPONSE'); return; }
          const { ok, code, value, nextAfter } = reply;
          if (ok === false) { reject(code === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'INVALID_RESPONSE'); return; }
          if (ok !== true || !Array.isArray(value) || value.length > request.limit) { reject('INVALID_RESPONSE'); return; }
          const rows: HistoryMessage[] = [], ids = new Set(before.messages.map(m => m.id));
          let last = request.after;
          for (const raw of value) {
            if (!record(raw)) { reject('INVALID_RESPONSE'); return; }
            const { id, companyId: rowCompany, conversationId: rowConversation, senderId, senderRole, kind, text, sequence, acceptedAt, important } = raw;
            if (!validId(id) || ids.has(id) || rowCompany !== companyId || rowConversation !== conversationId
              || !validId(senderId) || (senderRole !== 'staff' && senderRole !== 'patient') || kind !== 'text'
              || typeof text !== 'string' || !analyzeMessage(text).valid || typeof important !== 'boolean'
              || !integer(sequence, 1) || sequence <= last || !integer(acceptedAt, 0)) { reject('INVALID_RESPONSE'); return; }
            ids.add(id); last = sequence;
            // Explicit public DTO: never retain envelope diagnostics, credentials or internal fields.
            rows.push(Object.freeze({ id, companyId, conversationId, senderId, senderRole,
              kind: 'text', text, sequence, acceptedAt, important }));
          }
          if (nextAfter !== null && (!rows.length || nextAfter !== last)) { reject('INVALID_RESPONSE'); return; }
          publish({ status: 'ready', messages: Object.freeze([...before.messages, ...rows]), after: last, hasMore: nextAfter !== null, error: null });
          settle('loaded');
        } catch { reject('INVALID_RESPONSE'); }
      }
      try {
        const stop = schedule(() => reject('TIMEOUT'), timeoutMs);
        if (done) stop(); else cancel = stop;
        if (isCurrent()) Promise.resolve(transport(request)).then(receive, () => reject('NETWORK'));
      } catch { reject('NETWORK'); }
      return attempt;
    }
    return Object.freeze({ loadNext, snapshot: (): HistorySnapshot => active() ? current.state : idle });
  }
  return Object.freeze({ openContext, signOut: clear });
}
