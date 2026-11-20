import type { AuthView } from './auth-controller.ts';

type ControllerPort = { snapshot: () => AuthView; resume: () => boolean; subscribe: (listener: () => void) => () => void };
export type AppStatePort = { currentState: unknown; addEventListener: (event: 'change' | 'focus' | 'blur', listener: (state?: unknown) => void) => { remove: () => void } };
type Screen = Readonly<{ route: 'signed-out' | 'busy' | 'company-picker' | 'company' | 'blocked' | 'suspended';
  userId: string | null; companyId: string | null; notice: 'AUTH_ERROR' | 'COMPANY_ERROR' | 'RESTART_REQUIRED' | null }>;
const hidden: Screen = Object.freeze({ route: 'suspended', userId: null, companyId: null, notice: null });
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);

// Candidate external-store bridge, not a native screen or an authorization layer.
// No lease, credential, Auth payload, log or arbitrary error enters the snapshot.
export function createAuthScreenBinding(controller: ControllerPort, appState: AppStatePort) {
  let state = appState.currentState, focused = true, checking = false, fresh = false, disposed = false, failed = false, epoch = 0;
  let view = hidden;
  const listeners = new Set<() => void>(), cleanup: (() => void)[] = [];
  function project(): Screen {
    if (disposed || state !== 'active' || !focused || checking) return hidden;
    if (failed) return Object.freeze({ route: 'blocked', userId: null, companyId: null, notice: 'RESTART_REQUIRED' });
    const auth = controller.snapshot();
    if (auth.status === 'blocked') return Object.freeze({ route: 'blocked', userId: null, companyId: null, notice: 'RESTART_REQUIRED' });
    if (auth.status === 'authenticating' || auth.status === 'refreshing' || auth.companyLoading) return Object.freeze({ route: 'busy', userId: null, companyId: null, notice: null });
    if (auth.status !== 'authenticated') return Object.freeze({ route: 'signed-out', userId: null, companyId: null, notice: auth.error ? 'AUTH_ERROR' : null });
    if (!uuid(auth.userId) || auth.companyId !== null && !uuid(auth.companyId)) return Object.freeze({ route: 'blocked', userId: null, companyId: null, notice: 'RESTART_REQUIRED' });
    if (!fresh) return hidden;
    return Object.freeze({ route: auth.companyId ? 'company' : 'company-picker', userId: auth.userId, companyId: auth.companyId, notice: auth.error ? 'COMPANY_ERROR' : null });
  }
  function update() {
    if (disposed) return;
    epoch++;
    try { view = project(); } catch { failed = true; view = Object.freeze({ route: 'blocked', userId: null, companyId: null, notice: 'RESTART_REQUIRED' }); }
    for (const listener of [...listeners]) try { listener(); } catch {}
  }
  function foreground() {
    if (disposed) return;
    if (checking) { update(); return; }
    checking = true;
    fresh = false;
    try { fresh = controller.resume() === true; } catch { failed = true; }
    finally { checking = false; update(); }
  }
  function listen(event: 'change' | 'focus' | 'blur', listener: (state?: unknown) => void) {
    const subscription = appState.addEventListener(event, listener);
    cleanup.push(() => subscription.remove());
  }
  try {
    cleanup.push(controller.subscribe(() => { if (state === 'active' && focused) foreground(); else update(); }));
    listen('change', next => { if (disposed) return; state = next; if (next === 'active') foreground(); else { fresh = false; update(); } });
    listen('blur', () => { if (disposed) return; focused = false; fresh = false; update(); });
    listen('focus', () => { if (disposed) return; focused = true; foreground(); });
    if (state === 'active') foreground(); else update();
  } catch { failed = true; update(); }
  return Object.freeze({
    snapshot: (): Screen => view,
    subscribe: (listener: () => void) => { if (!disposed) listeners.add(listener); return () => { listeners.delete(listener); }; },
    bindPrivateIntent: () => {
      const captured = epoch;
      return (action: () => undefined) => {
        if (disposed || failed || captured !== epoch || view.route !== 'company') return false;
        // Recheck expiry before executing a foreground action; resume can
        // synchronously invalidate the session and publish another snapshot.
        try { if (!controller.resume()) { fresh = false; update(); return false; } if (captured !== epoch) return false; } catch { failed = true; update(); return false; }
        action(); return true;
      };
    },
    dispose: () => {
      if (disposed) return;
      disposed = true; epoch++; view = hidden;
      for (const close of cleanup) try { close(); } catch {}
      for (const listener of [...listeners]) try { listener(); } catch {}
      listeners.clear();
    },
  });
}
