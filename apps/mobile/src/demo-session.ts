import { createSessionScope } from '../../../packages/session/src/session-scope.ts';
import type { ScopeTicket } from '../../../packages/session/src/session-scope.ts';
import { conversationById, initialState, reducer } from './demo.ts';
import type { Action } from './demo.ts';
import { createDemoDelivery, interruptedDeliveryError, validDeliveryScenario } from './demo-delivery.ts';
import type { DemoDeliveryOptions, DeliveryScenario } from './demo-delivery.ts';
import { analyzeMessage } from '../../../packages/text/src/message-text.ts';

// Synthetic presentation store. No real Auth session, token, persistence or API.
export function createDemoSession(options: { delivery?: DemoDeliveryOptions } = {}) {
  let state = initialState();
  const listeners = new Set<() => void>();
  const scope = createSessionScope(() => {});
  const delivery = createDemoDelivery(options.delivery);
  let deliveryHandle: ReturnType<typeof delivery.activate> | null = null;
  let activation = 0;
  let generation = 0;
  const notify = () => { for (const listener of listeners) { try { listener(); } catch { /* A subscriber cannot interrupt a committed send. */ } } };
  function dispatch(action: Action, ticket: ScopeTicket, capturedGeneration: number): boolean {
    let applied = false;
    const apply = (): undefined => {
      let next = reducer(state, action);
      if (next === state) {
        // Reopening the same chat allows navigation without resetting its queue.
        if (action.type === 'open-conversation' && state.activeConversationId === action.conversationId && conversationById(state, action.conversationId)) applied = true;
        return;
      }
      const identityChanged = action.type === 'enter' || action.type === 'staff-invite-demo' || action.type === 'staff-request-demo';
      if (identityChanged || next.companyId !== state.companyId) next = { ...next, activeConversationId: null };
      const contextChanged = identityChanged || next.companyId !== state.companyId || next.activeConversationId !== state.activeConversationId;
      if (contextChanged) {
        generation++;
        delivery.clear(); deliveryHandle = null;
        next = { ...next, deliveryNotice: null, conversations: next.conversations.map(c => ({ ...c, messages: c.messages.map(m => !m.delivery || m.delivery.status === 'accepted' ? m : { ...m, delivery: { ...m.delivery, status: 'failed', retryable: false, error: interruptedDeliveryError } }) })) };
      }
      if (identityChanged) {
        const auth = scope.beginAuthentication();
        if (next.actor) scope.acceptIdentity(auth, next.actor.id);
        // Preferences are per user; synthetic company history remains shared.
        next = { ...next, preferences: initialState().preferences, drafts: {} };
      }
      if (next.actor) scope.selectCompany(next.companyId);
      state = next;
      applied = true;
      if (contextChanged && state.actor && state.activeConversationId) {
        const conversationId = state.activeConversationId;
        const deliveryTicket = scope.capture();
        const deliveryGeneration = generation;
        deliveryHandle = delivery.activate({ sessionKey: `demo-session-${++activation}`, userId: state.actor.id, companyId: state.companyId, conversationId }, entry => {
          dispatch({ type: 'queue-state', conversationId, entry }, deliveryTicket, deliveryGeneration);
        });
      }
      notify();
    };
    if (action.type === 'logout') {
      // Logout always wins over in-flight work, including stale callbacks.
      scope.signOut();
      generation++;
      delivery.clear(); deliveryHandle = null;
      state = initialState();
      notify();
      return true;
    }
    if (capturedGeneration !== generation) return false;
    if (action.type === 'enter' || action.type === 'staff-invite-demo' || action.type === 'staff-request-demo') {
      // Starting a demo scenario is allowed from welcome; stale scenario callbacks
      // must not replace a newer session or reopen one after logout.
      if (ticket !== scope.capture()) return false;
      apply();
    } else scope.commit(ticket, apply);
    return applied;
  }
  return Object.freeze({
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    // Binding is pure: rendering or returning to the same chat never resets work.
    bindDelivery: (conversationId: string) => {
      const ticket = scope.capture(); const handle = deliveryHandle; const capturedGeneration = generation;
      const current = () => capturedGeneration === generation && ticket === scope.capture() && handle !== null && handle === deliveryHandle && state.activeConversationId === conversationId && !!conversationById(state, conversationId);
      return Object.freeze({
        sendDraft(time: string, scenario: DeliveryScenario = 'success'): boolean {
          if (!current() || typeof time !== 'string' || !/^(?:Agora|(?:[01]\d|2[0-3]):[0-5]\d)$/.test(time) || !validDeliveryScenario(scenario)) return false;
          const text = state.drafts[conversationId] ?? '';
          if (!analyzeMessage(text).valid) return false;
          const entry = handle!.enqueue(text, scenario);
          if (!entry) { dispatch({ type: 'queue-notice', conversationId }, ticket, capturedGeneration); return false; }
          if (!dispatch({ type: 'queue-message', conversationId, time, entry }, ticket, capturedGeneration)) return false;
          handle!.send(entry.clientMessageId);
          return true;
        },
        retry(messageId: string): boolean {
          if (!current() || typeof messageId !== 'string') return false;
          const message = conversationById(state, conversationId)?.messages.find(m => m.id === messageId && m.authorId === state.actor?.id);
          return !!message?.delivery && message.delivery.status === 'failed' && message.delivery.retryable && handle!.send(message.delivery.clientMessageId);
        },
      });
    },
    // Capture once per render/async intent, never after awaiting its response.
    bindDispatch: () => {
      const ticket = scope.capture();
      const capturedGeneration = generation;
      return (action: Action, onAccepted?: () => void) => {
        // Queue transitions originate only from the bound controller, never UI payloads.
        if (action.type === 'queue-message' || action.type === 'queue-state' || action.type === 'queue-notice') return false;
        if (!dispatch(action, ticket, capturedGeneration)) return false;
        // Navigation/modals associated with a rejected intent must not run either.
        onAccepted?.();
        return true;
      };
    },
  });
}
