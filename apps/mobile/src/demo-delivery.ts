import { createTextSendQueue } from '../../../packages/chat-client/src/text-send-queue.ts';
import type { QueueEntry, SendContext, TextSendRequest } from '../../../packages/chat-client/src/text-send-queue.ts';

export type DeliveryScenario = 'success' | 'failure' | 'lost-ack';
export type DemoDeliveryOptions = {
  schedule?: (callback: () => void, delayMs: number) => () => void;
  transportDelayMs?: number; timeoutMs?: number; maxEntries?: number; now?: () => number;
};
export type DemoDeliveryState = Readonly<{
  status: QueueEntry['status']; clientMessageId: string; retryable: boolean; error?: string;
}>;
export const interruptedDeliveryError = 'Envio simulado interrompido ao mudar de contexto.';
export const validDeliveryScenario = (value: unknown): value is DeliveryScenario => value === 'success' || value === 'failure' || value === 'lost-ack';
export const deliveryState = (entry: QueueEntry): DemoDeliveryState => Object.freeze({
  status: entry.status, clientMessageId: entry.clientMessageId, retryable: entry.failure?.retryable ?? false,
  ...(entry.failure ? { error: entry.failure.code === 'TIMEOUT'
    ? 'Confirmação simulada não recebida. Tente novamente.' : 'Falha no envio simulado. Tente novamente.' } : {}),
});
let instance = 0;

// Fictional in-memory transport. No fetch, SDK, Auth, device IO or delivery claim.
export function createDemoDelivery(options: DemoDeliveryOptions = {}) {
  const schedule = options.schedule ?? ((callback, delay) => { const id = globalThis.setTimeout(callback, delay); return () => globalThis.clearTimeout(id); });
  const transportDelay = options.transportDelayMs ?? 640;
  const now = options.now ?? (() => Date.now());
  if (!Number.isFinite(transportDelay) || transportDelay < 0) throw new TypeError('Invalid simulation delay');
  const prefix = `demo-${++instance}`; let intent = 0;
  type Run = {
    nextSequence: number;
    context: SendContext; scenarios: Map<string, DeliveryScenario>;
    receipts: Map<string, { request: TextSendRequest; reply: unknown }>;
    transports: Map<string, Set<() => void>>;
  };
  let active: Run | null = null;
  const queue = createTextSendQueue({ timeoutMs: options.timeoutMs ?? 2500, maxEntries: options.maxEntries, schedule,
    createId: () => `${prefix}-intent-${++intent}`,
    transport: request => {
      const run = active;
      if (!run) return Promise.resolve({ ok: false, code: 'UNAVAILABLE' });
      const scenario = run.scenarios.get(request.clientMessageId) ?? 'success';
      run.scenarios.delete(request.clientMessageId);
      return new Promise(resolve => {
        let cancel = () => {};
        const outstanding = run.transports.get(request.clientMessageId) ?? new Set<() => void>();
        run.transports.set(request.clientMessageId, outstanding);
        const stop = () => { cancel(); outstanding.delete(stop); if (!outstanding.size) run.transports.delete(request.clientMessageId); resolve({ ok: false, code: 'UNAVAILABLE' }); };
        outstanding.add(stop);
        cancel = schedule(() => {
          if (active !== run) { stop(); return; }
          if (scenario === 'failure') { outstanding.delete(stop); if (!outstanding.size) run.transports.delete(request.clientMessageId); resolve({ ok: false, code: 'RETRY_LATER' }); return; }
          let accepted = run.receipts.get(request.clientMessageId);
          if (accepted && (accepted.request.text !== request.text || accepted.request.companyId !== request.companyId || accepted.request.conversationId !== request.conversationId)) {
            outstanding.delete(stop); resolve({ ok: false, code: 'CONFLICT' }); return;
          }
          if (!accepted) {
            const reply = { ok: true, value: { id: `accepted-${request.clientMessageId}`, companyId: request.companyId,
              conversationId: request.conversationId, senderId: run.context.userId, text: request.text,
              kind: 'text', sequence: run.nextSequence++, acceptedAt: now() } };
            accepted = { request, reply }; run.receipts.set(request.clientMessageId, accepted);
          }
          if (scenario === 'lost-ack') return; // Queue timeout represents uncertainty; retry returns the saved receipt.
          outstanding.delete(stop); if (!outstanding.size) run.transports.delete(request.clientMessageId);
          resolve(accepted.reply);
        }, transportDelay);
      });
    },
  });
  function clear() {
    const previous = active; active = null; queue.signOut();
    if (previous) {
      for (const tasks of previous.transports.values()) for (const stop of [...tasks]) stop();
      previous.transports.clear(); previous.receipts.clear(); previous.scenarios.clear();
    }
  }
  function activate(context: SendContext, onUpdate: (entry: QueueEntry) => void) {
    clear();
    const run: Run = { nextSequence: 1, context: Object.freeze({ ...context }), scenarios: new Map(), receipts: new Map(), transports: new Map() };
    active = run;
    const handle = queue.openContext(context);
    function publish(id: string) { if (active !== run) return; const entry = handle.snapshot().find(item => item.clientMessageId === id); if (entry) onUpdate(entry); }
    return Object.freeze({
      enqueue(text: string, scenario: DeliveryScenario): QueueEntry | null {
        if (active !== run || !validDeliveryScenario(scenario)) return null;
        const added = handle.enqueue(text); if (!added.ok) return null;
        const retained = new Set(handle.snapshot().map(entry => entry.clientMessageId));
        for (const id of run.receipts.keys()) if (!retained.has(id)) run.receipts.delete(id);
        run.scenarios.set(added.clientMessageId, scenario);
        return handle.snapshot().find(item => item.clientMessageId === added.clientMessageId) ?? null;
      },
      send(id: string): boolean {
        if (active !== run) return false;
        const row = handle.snapshot().find(item => item.clientMessageId === id);
        if (!row || row.status === 'accepted' || row.status === 'sending' || row.status === 'failed' && !row.failure?.retryable) return false;
        const result = handle.send(id); publish(id);
        void result.then(() => {
          if (active !== run) return;
          for (const stop of [...(run.transports.get(id) ?? [])]) stop();
          publish(id);
        });
        return true;
      },
      snapshot: handle.snapshot,
    });
  }
  return Object.freeze({ activate, clear });
}
