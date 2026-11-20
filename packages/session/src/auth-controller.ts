import { publicAuthError } from './public-auth-error.ts';

export type AuthSession = Readonly<{ userId: string; accessToken: string; refreshToken: string; expiresAt: number }>;
export type LocalExpiryForeground = Readonly<{isCurrent:()=>boolean;onInvalidate:(listener:()=>void)=>()=>void}>;
export type AccessLease = Readonly<{ userId: string; sessionKey: string; close: () => void }>;
type Status = 'signed-out' | 'authenticating' | 'refreshing' | 'authenticated' | 'blocked';
export type AuthView = Readonly<{ status: Status; userId: string | null; companyId: string | null; companyLoading: boolean; error: string | null }>;
type Dependencies<L extends AccessLease> = {
  provider: {
    signIn: (credentials: Readonly<{ email: string; password: string }>, signal: AbortSignal) => PromiseLike<unknown>;
    refresh: (refreshToken: string, signal: AbortSignal) => PromiseLike<unknown>;
    restore?: (signal: AbortSignal) => PromiseLike<unknown|null>;
    canRestore?: () => boolean;
    subscribeRecovery?: (listener: () => void) => () => void;
    forget?: (signal: AbortSignal) => PromiseLike<boolean>;
    // Explicit old session, never a shared SDK signOut against a mutable user.
    revoke: (session: AuthSession, signal: AbortSignal) => PromiseLike<unknown>;
  };
  transport: { bindSession: (input: Readonly<{ userId: string; accessToken: string; sessionKey: string; expiresAt: number }>) => PromiseLike<Readonly<{ ok: true; value: L } | { ok: false }>>; signOut: () => void };
  authorizeCompany: (lease: L, companyId: string, signal: AbortSignal) => PromiseLike<boolean>;
  clearPrivateView: () => undefined;
  createSessionKey: () => string;
  now: () => number;
  schedule: (callback: () => void, ms: number) => () => void;
  timeoutMs: number;
  // Opt-in only; capture a focused foreground generation, never credentials.
  localExpiryRecovery?: () => LocalExpiryForeground | null;
};
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const unavailable = () => new Error('Authentication unavailable');
const COMPANY_ERROR = 'Não foi possível acessar esta empresa.';
const EXPIRED = 'Sua sessão expirou. Entre novamente.';
const BLOCKED = 'Não foi possível preparar uma sessão segura. Reinicie a demonstração.';

// Memory orchestration only. Providers/transports own I/O and persistence.
// The local-expiry opt-in never restores a prior company or conversation.
export function createAuthController<L extends AccessLease>(deps: Dependencies<L>) {
  if (!Number.isSafeInteger(deps.timeoutMs) || deps.timeoutMs < 1 || deps.timeoutMs > 60000) throw unavailable();
  if (deps.localExpiryRecovery!==undefined&&typeof deps.localExpiryRecovery!=='function') throw unavailable();
  let view: AuthView = Object.freeze({ status: 'signed-out', userId: null, companyId: null, companyLoading: false, error: null });
  let version = 0, companyVersion = 0, memoryClosed = false, restorationAllowed = true, recoveryAllowed = true;
  let session: AuthSession | null = null, lease: L | null = null;
  let cancelExpiry = () => {};
  type ExpiredRecovery=Readonly<{userId:string;version:number}>;
  let expiredRecovery:ExpiredRecovery|null=null;
  let lastRecoveryAvailability=false;
  const listeners = new Set<() => void>();
  const notify = () => { lastRecoveryAvailability=canRestore(); for (const listener of [...listeners]) try { listener(); } catch { /* Observers cannot control session completion. */ } };
  function publish(next: AuthView) { view = Object.freeze(next); notify(); }
  function makeJob() {
    const controller = new AbortController();
    let reject!: (error: Error) => void, finished = false, cancel = () => {};
    const interrupted = new Promise<never>((_, r) => { reject = r; });
    void interrupted.catch(() => {});
    const stop = () => { if (!finished) { reject(unavailable()); controller.abort(); } };
    try { cancel = deps.schedule(stop, deps.timeoutMs); } catch { stop(); }
    return {
      stop, signal: controller.signal,
      wait: <T>(work: () => T | PromiseLike<T>) => Promise.race([interrupted, Promise.resolve().then(() => { if (controller.signal.aborted) throw unavailable(); return work(); })]),
      finish: () => { finished = true; try { cancel(); } catch {} },
    };
  }
  type Job = ReturnType<typeof makeJob>;
  let authJob: Job | null = null, companyJob: Job | null = null;
  let restoreFlight: Promise<boolean> | null = null;
  function reset(status: Status = 'signed-out', error: string | null = null) {
    expiredRecovery=null;
    const activation = ++version; companyVersion++;
    const previousAuth = authJob, previousCompany = companyJob, previousExpiry = cancelExpiry;
    authJob = null; companyJob = null; cancelExpiry = () => {};
    session = null; lease = null;
    view = Object.freeze({ status, userId: null, companyId: null, companyLoading: false, error });
    let failed = false;
    const cleanup = [() => previousAuth?.stop(), () => previousCompany?.stop(), previousExpiry,
      () => deps.transport.signOut(), () => { if (deps.clearPrivateView() !== undefined) throw unavailable(); }];
    for (const clear of cleanup) {
      if (activation !== version) return activation;
      try { clear(); } catch { failed = true; }
    }
    if (failed && activation === version) view = Object.freeze({ status: 'blocked', userId: null, companyId: null, companyLoading: false, error: BLOCKED });
    if (activation === version) notify();
    return activation;
  }
  function validSession(input: unknown): AuthSession {
    if (!record(input)) throw unavailable();
    const { userId, accessToken, refreshToken, expiresAt } = input;
    const timestamp = deps.now();
    const token = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_.-]{1,8192}$/.test(v) && !v.startsWith('sb_');
    // Refresh values are opaque body data, not a JWT or an HTTP header.
    const refresh = typeof refreshToken === 'string' && refreshToken.length > 0 && refreshToken.length <= 8192
      && !/[\u0000-\u0020\u007f]/.test(refreshToken) && !refreshToken.startsWith('sb_');
    if (!uuid(userId) || !token(accessToken) || !refresh || !Number.isSafeInteger(timestamp) || timestamp < 0
      || !Number.isSafeInteger(expiresAt) || (expiresAt as number) <= timestamp || (expiresAt as number) - timestamp > 86400000) throw unavailable();
    return Object.freeze({ userId, accessToken, refreshToken, expiresAt: expiresAt as number });
  }
  function captureRecoveryForeground():LocalExpiryForeground|null {
    try{
      const captured=deps.localExpiryRecovery?.();
      return captured&&typeof captured.isCurrent==='function'&&typeof captured.onInvalidate==='function'&&captured.isCurrent()===true?captured:null;
    }catch{return null;}
  }
  function tryRecoverExpired(expired:ExpiredRecovery,foreground:LocalExpiryForeground):Promise<boolean> {
    try{
      if(memoryClosed||expiredRecovery!==expired||version!==expired.version||session!==null||view.status!=='signed-out'||foreground.isCurrent()!==true||!canRestore())return Promise.resolve(false);
      if(expiredRecovery!==expired||version!==expired.version||foreground.isCurrent()!==true)return Promise.resolve(false);
      // Consume before any synchronous reset/observer. Generic errors and focus
      // changes cannot manufacture another attempt for this expired session.
      expiredRecovery=null;
      return restoreFor(expired.userId,foreground);
    }catch{return Promise.resolve(false);}
  }
  function recoverExpiredSession():Promise<boolean> {
    const expired=expiredRecovery;if(!expired)return Promise.resolve(false);
    const foreground=captureRecoveryForeground();
    return foreground?tryRecoverExpired(expired,foreground):Promise.resolve(false);
  }
  function expireLocal(expired:AuthSession,previousVersion:number) {
    if(memoryClosed||version!==previousVersion||session!==expired)return;
    let elapsed=false;
    try{const timestamp=deps.now();elapsed=Number.isSafeInteger(timestamp)&&timestamp>=expired.expiresAt;}catch{}
    const foreground=elapsed?captureRecoveryForeground():null;
    if(memoryClosed||version!==previousVersion||session!==expired)return;
    const expiredVersion=reset('signed-out',EXPIRED);
    if(!elapsed||!deps.localExpiryRecovery||memoryClosed||version!==expiredVersion||view.status!=='signed-out')return;
    const ticket=Object.freeze({userId:expired.userId,version:expiredVersion});expiredRecovery=ticket;
    // Background expiry leaves its unused budget for a later valid foreground.
    // A foreground expiry queues one attempt on the same captured generation.
    if(foreground)void Promise.resolve().then(()=>tryRecoverExpired(ticket,foreground)).catch(()=>{});
  }
  function resume() {
    if (memoryClosed || !session || view.status !== 'authenticated') return false;
    const current = session, activation = version;
    let timestamp: number;
    try { timestamp = deps.now(); } catch { if (version === activation) reset('signed-out', EXPIRED); return false; }
    if (version !== activation || session !== current) return false;
    if (!Number.isSafeInteger(timestamp) || timestamp < 0) { reset('signed-out', EXPIRED); return false; }
    if (timestamp >= current.expiresAt) { expireLocal(current,activation); return false; }
    return true;
  }
  async function authenticate(obtain: (signal: AbortSignal) => PromiseLike<unknown>, expectedUser: string | null, previousCompany: string | null, allowEmpty=false, foreground:LocalExpiryForeground|null=null) {
    if(memoryClosed)return false;
    const activation = reset(expectedUser ? 'refreshing' : 'authenticating');
    if (activation !== version || view.status === 'blocked') return false;
    const job = makeJob();
    if (activation !== version) { job.stop(); job.finish(); return false; }
    authJob = job;
    let candidate: L | null = null,unsubscribeForeground=()=>{};
    const current = () => activation === version && authJob === job;
    const ensureForeground=()=>{
      if(!current()||job.signal.aborted)throw unavailable();
      if(foreground&&foreground.isCurrent()!==true)throw unavailable();
      if(!current()||job.signal.aborted)throw unavailable();
    };
    try {
      ensureForeground();
      if(foreground){
        const unsubscribe=foreground.onInvalidate(()=>{if(current())reset('signed-out',EXPIRED);});
        if(typeof unsubscribe!=='function')throw unavailable();
        unsubscribeForeground=unsubscribe;ensureForeground();
      }
      const reply = await job.wait(() => {ensureForeground();return obtain(job.signal);});
      if (!current()) return false;
      ensureForeground();
      if(allowEmpty&&reply===null){reset();return false;}
      const fresh = validSession(reply);
      if (!current() || expectedUser && fresh.userId !== expectedUser) throw unavailable();
      const sessionKey = deps.createSessionKey();
      if (typeof sessionKey !== 'string' || !sessionKey.trim() || sessionKey.length > 200
        || sessionKey === fresh.accessToken || sessionKey === fresh.refreshToken) throw unavailable();
      const pendingBinding = Promise.resolve().then(() => {
        if (!current() || job.signal.aborted) throw unavailable();
        ensureForeground();
        return deps.transport.bindSession({ userId: fresh.userId, accessToken: fresh.accessToken, sessionKey, expiresAt: fresh.expiresAt });
      });
      // A port that completes after logout must close only its own lease,
      // never sign out a newer session through the global transport.
      void pendingBinding.then(binding => { if ((!current() || job.signal.aborted) && binding.ok) try { binding.value.close(); } catch {} }, () => {});
      const binding = await job.wait(() => pendingBinding);
      if (!binding.ok) throw unavailable();
      candidate = binding.value;
      if (!current()) return false;
      ensureForeground();
      if (candidate.userId !== fresh.userId || candidate.sessionKey !== sessionKey || typeof candidate.close !== 'function') throw unavailable();
      let companyId: string | null = null, companyError: string | null = null;
      if (previousCompany) {
        const allowed = await job.wait(() => deps.authorizeCompany(candidate!, previousCompany, job.signal));
        if (!current()) return false;
        if (allowed === true) companyId = previousCompany; else companyError = COMPANY_ERROR;
      }
      const timestamp = deps.now();
      if (!current() || !Number.isSafeInteger(timestamp) || timestamp < 0 || timestamp >= fresh.expiresAt) throw unavailable();
      ensureForeground();
      if(!current())return false;
      session = fresh; lease = candidate; recoveryAllowed = true;
      const timer = deps.schedule(() => { if (activation === version) expireLocal(fresh,activation); }, fresh.expiresAt - timestamp);
      if (!current()) { timer(); return false; }
      cancelExpiry = timer;
      publish({ status: 'authenticated', userId: fresh.userId, companyId, companyLoading: false, error: companyError });
      return current() && view.status === 'authenticated';
    } catch (error) {
      if (current()) reset('signed-out', publicAuthError(error));
      return false;
    } finally {
      try{unsubscribeForeground();}catch{}
      job.finish(); if (authJob === job) authJob = null;
      if (candidate && candidate !== lease) try { candidate.close(); } catch {}
    }
  }
  async function signIn(email: string, password: string) {
    if(memoryClosed)return false;
    restorationAllowed=false; recoveryAllowed=false; restoreFlight=null;
    // Password is neither trimmed, stored in the view nor passed to transport.
    if (typeof email !== 'string' || email.trim().length > 320 || !/^[^\s@]+@[^\s@]+$/.test(email.trim())
      || typeof password !== 'string' || password.length < 1 || password.length > 1024) {
      reset('signed-out', publicAuthError(null)); return false;
    }
    const credentials = Object.freeze({ email: email.trim(), password });
    return authenticate(signal => deps.provider.signIn(credentials, signal), null, null);
  }
  function refresh() {
    if (!resume() || !session) return Promise.resolve(false);
    const previous = session, companyId = view.companyId;
    return authenticate(signal => deps.provider.refresh(previous.refreshToken, signal), previous.userId, companyId);
  }
  function canRestore() {
    try{
      if(memoryClosed||!recoveryAllowed||session!==null||view.status!=='signed-out'||restoreFlight!==null||typeof deps.provider.restore!=='function'||typeof deps.provider.canRestore!=='function')return false;
      return deps.provider.canRestore()===true;
    }catch{return false;}
  }
  function recoveryChanged(){
    const available=canRestore();if(available===lastRecoveryAvailability)return;
    lastRecoveryAvailability=available;
    // Recovery has its own boolean external-store snapshot. Keep AuthView
    // identity intact so registration does not invalidate its current fields.
    if(!memoryClosed&&view.status==='signed-out')notify();
  }
  function restoreFor(expectedUser:string|null=null,foreground:LocalExpiryForeground|null=null) {
    if(restoreFlight)return restoreFlight;
    const obtain=deps.provider.restore;
    if(memoryClosed||typeof obtain!=='function'||session!==null||view.status!=='signed-out')return Promise.resolve(false);
    // Legacy providers retain their expiry-only behavior. Capability-aware
    // providers authorize explicit retry without comparing public error copy.
    if(!restorationAllowed&&!(typeof deps.provider.canRestore==='function'?canRestore():view.error===EXPIRED))return Promise.resolve(false);
    restorationAllowed=false;
    const work=authenticate(signal=>obtain(signal),expectedUser,null,true,foreground);
    const shared=work.finally(()=>{if(restoreFlight===shared){restoreFlight=null;recoveryChanged();}});restoreFlight=shared;return shared;
  }
  const restore=()=>restoreFor();
  async function signOut():Promise<Readonly<{remoteConfirmed:boolean;localCleared?:boolean}>> {
    if(memoryClosed)return Object.freeze({remoteConfirmed:false,...(deps.provider.forget?{localCleared:false}:{})});
    restorationAllowed=false; recoveryAllowed=false; restoreFlight=null;
    const previous = session;
    // Capture storage cleanup BEFORE reset notifies a possible new login.
    // Failure here must never suppress revocation of the captured RAM session.
    let forgetting:Promise<boolean>|null=null;
    if(deps.provider.forget){try{forgetting=Promise.resolve(deps.provider.forget(new AbortController().signal));}catch{forgetting=Promise.resolve(false);}void forgetting.catch(()=>{});}
    reset(); // Immediate local denial, before any remote work.
    if (!previous&&!forgetting) return Object.freeze({ remoteConfirmed: false });
    const job = makeJob();
    try {
      const remote=previous?job.wait(()=>deps.provider.revoke(previous,job.signal)).then(value=>value===true,()=>false):Promise.resolve(false);
      if(!forgetting)return Object.freeze({remoteConfirmed:await remote});
      const local=job.wait(()=>forgetting!).then(value=>value===true,()=>false);
      const [remoteConfirmed,localCleared]=await Promise.all([remote,local]);return Object.freeze({remoteConfirmed,localCleared});
    }
    catch { return Object.freeze({ remoteConfirmed: false,...(forgetting?{localCleared:false}:{}) }); }
    finally { job.finish(); }
  }
  async function selectCompany(companyId: string) {
    if (!uuid(companyId) || !resume() || !lease) return false;
    const activation = version, selectedVersion = ++companyVersion, currentLease = lease;
    const previous = companyJob; companyJob = null; previous?.stop();
    if (version !== activation || companyVersion !== selectedVersion) return false;
    const job = makeJob();
    if (version !== activation || companyVersion !== selectedVersion) { job.stop(); job.finish(); return false; }
    companyJob = job;
    const current = () => version === activation && companyVersion === selectedVersion && companyJob === job;
    try {
      try { if (deps.clearPrivateView() !== undefined) throw unavailable(); }
      catch { if (current()) reset('blocked', BLOCKED); return false; }
      if (!current()) return false;
      publish({ ...view, companyId: null, companyLoading: true, error: null });
      const allowed = await job.wait(() => deps.authorizeCompany(currentLease, companyId, job.signal));
      if (!current() || !resume()) return false;
      publish({ ...view, companyId: allowed === true ? companyId : null, companyLoading: false, error: allowed === true ? null : COMPANY_ERROR });
      return current() && allowed === true;
    } catch {
      if (current()) publish({ ...view, companyId: null, companyLoading: false, error: COMPANY_ERROR });
      return false;
    } finally { job.finish(); if (companyJob === job) companyJob = null; }
  }
  const unsubscribeRecovery=deps.provider.subscribeRecovery?.(recoveryChanged)??(()=>{});
  if(typeof unsubscribeRecovery!=='function')throw unavailable();
  return Object.freeze({ signIn, refresh, restore, canRestore, recoverExpiredSession, signOut, selectCompany, resume,
    closeMemory(){if(memoryClosed)return;memoryClosed=true;recoveryAllowed=false;restoreFlight=null;try{unsubscribeRecovery();}catch{}reset();},
    snapshot: (): AuthView => view,
    currentLease: (): L | null => resume() ? lease : null,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  });
}
