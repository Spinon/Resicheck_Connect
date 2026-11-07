import { authorize } from '../../access/src/policy.ts';
import type { Principal, Snapshot } from '../../access/src/contracts.ts';
import { analyzeMessage } from '../../text/src/message-text.ts';

// Local reference only: no OS permission request, device registration or push SDK.
// A trusted server resolver supplies these labels, never a public client request.
export type NotificationEvent = Readonly<{
  messageId: string;
  companyId: string;
  company: string;
  attendant?: string;
  message: string;
  important: boolean;
}>;
export type NotificationPreferences = Readonly<{
  systemPermissionGranted?: boolean;
  filter?: 'all' | 'important';
  privacy?: 1 | 2 | 3 | 4;
}>;
export type NotificationPayload = Readonly<{
  app: 'ResiCheck Connect';
  company?: string;
  attendant?: string;
  message?: string;
}>;

// Engineering bounds for this local reference, not a final provider/UI budget.
// Over-limit input suppresses the preview; no raw string is truncated or logged.
export const notificationLimits = Object.freeze({ id: 128, company: 160, attendant: 120, message: 500, payloadBytes: 3072 });

function textWithin(value: unknown, max: number): value is string {
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f-\u009f]/u.test(value)) return false;
  const analysis = analyzeMessage(value);
  return analysis.valid && analysis.graphemes !== null && analysis.graphemes <= max;
}
function validEvent(event: NotificationEvent): boolean {
  return event !== null && typeof event === 'object'
    && textWithin(event.messageId, notificationLimits.id) && textWithin(event.companyId, notificationLimits.id)
    && textWithin(event.company, notificationLimits.company) && textWithin(event.message, notificationLimits.message)
    && (event.attendant === undefined || textWithin(event.attendant, notificationLimits.attendant))
    && typeof event.important === 'boolean';
}

/**
 * Re-evaluate the current snapshot at local dispatch time. Returns only the chosen
 * preview fields, or null. No IDs, navigation data, diagnostics or event envelope.
 * Missing explicit filter/OS grant means no notification in this reference;
 * onboarding defaults and user/device preference resolution remain undecided.
 */
export function buildNotification(
  snapshot: Snapshot,
  principal: Principal | null,
  event: NotificationEvent,
  prefs: unknown,
  now: number,
): NotificationPayload | null {
  if (!validEvent(event) || !prefs || typeof prefs !== 'object' || Array.isArray(prefs)) return null;
  const preferences = prefs as Record<string, unknown>;
  if (!Object.hasOwn(preferences, 'systemPermissionGranted') || !Object.hasOwn(preferences, 'filter')
    || preferences.systemPermissionGranted !== true
    || preferences.filter !== 'all' && preferences.filter !== 'important') return null;
  if (!authorize(snapshot, principal, {
    channel: 'push', action: 'read',
    resource: { kind: 'message', id: event.messageId, companyId: event.companyId },
  }, now).allowed) return null;
  // Consume the existing trusted importance flag; do not classify incoming messages
  // or generate another event when importance changes. Those policies are open.
  if (preferences.filter === 'important' && !event.important) return null;
  const privacy = Object.hasOwn(preferences, 'privacy') && [1, 2, 3, 4].includes(preferences.privacy as number) ? preferences.privacy as number : 1;
  const payload: { app: 'ResiCheck Connect'; company?: string; attendant?: string; message?: string } = { app: 'ResiCheck Connect' };
  if (privacy >= 2) payload.company = event.company;
  // Missing human attendant stays absent: do not infer principal/last attendant,
  // invent a staff name or label future AI as a person.
  if (privacy >= 3 && event.attendant !== undefined) payload.attendant = event.attendant;
  if (privacy === 4) payload.message = event.message;
  // Local engineering budget only, not a promise about a future push provider.
  if ((analyzeMessage(JSON.stringify(payload)).bytes ?? Infinity) > notificationLimits.payloadBytes) return null;
  return Object.freeze(payload);
}
