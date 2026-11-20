import type { AuthSession } from './auth-controller.ts';

type Credentials = Readonly<{ email: string; password: string }>;
type Options = { projectUrl: string; publishableKey: string; fetch: typeof globalThis.fetch; now: () => number;
  schedule: (callback: () => void, ms: number) => () => void; timeoutMs: number; maxPending?: number };
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const safeCodes = new Set(['invalid_credentials','email_not_confirmed','otp_expired','over_request_rate_limit','over_email_send_rate_limit','weak_password','session_expired','session_not_found','refresh_token_not_found','refresh_token_already_used']);
const failure = (code = 'auth_unavailable') => Object.freeze({ code: safeCodes.has(code) ? code : 'auth_unavailable' });
const opaque = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 8192 && !/[\u0000-\u0020\u007f]/.test(v) && !v.startsWith('sb_');
const access = (v: unknown): v is string => opaque(v) && /^[A-Za-z0-9_.-]+$/.test(v);
function credentials(input: Credentials) {
  const { email, password } = input;
  if (typeof email !== 'string' || email.trim().length > 320 || !/^[^\s@]+@[^\s@]+$/.test(email.trim())
    || typeof password !== 'string' || !password || password.length > 1024) throw failure();
  return Object.freeze({ email: email.trim(), password });
}

// Candidate stateless provider. No SDK session mutation, storage, metadata,
// default fetch, automatic retry or auth activation from a signup response.
export function createSupabaseAuthProvider({ projectUrl, publishableKey, fetch: fetchRequest, now, schedule, timeoutMs, maxPending = 4 }: Options) {
  if (!/^https:\/\/[a-z]{20}\.supabase\.co$/.test(projectUrl) || !/^sb_publishable_[A-Za-z0-9_-]{1,200}$/.test(publishableKey)
    || typeof fetchRequest !== 'function' || typeof now !== 'function' || typeof schedule !== 'function'
    || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000 || !Number.isSafeInteger(maxPending) || maxPending < 1 || maxPending > 16) throw failure();
  const pending = new Set<() => void>(); let disposed = false;
  async function request(endpoint: '/signup' | '/token?grant_type=password' | '/token?grant_type=refresh_token' | '/logout?scope=local', body: object | undefined, signal: AbortSignal, bearer?: string) {
    if (disposed || signal.aborted || pending.size >= maxPending) throw failure();
    const controller = new AbortController(); let reject!: (e: unknown) => void, done = false, workStarted = false, cancel = () => {};
    const interrupted = new Promise<never>((_, r) => { reject = r; }); void interrupted.catch(() => {});
    const stream = { reader: null as ReadableStreamDefaultReader<Uint8Array> | null, body: null as ReadableStream<Uint8Array> | null };
    let cleanup: Promise<void> | null = null;
    function cancelStream() {
      if (!stream.reader && !stream.body) return Promise.resolve();
      if (!cleanup) {
        try { cleanup = Promise.resolve(stream.reader ? stream.reader.cancel() : stream.body!.cancel()).catch(() => {}); }
        catch { cleanup = Promise.resolve(); }
      }
      return cleanup;
    }
    const stop = () => { if (!done) { reject(failure()); controller.abort(); void cancelStream(); } };
    pending.add(stop);
    try {
      signal.addEventListener('abort', stop, { once: true }); cancel = schedule(stop, timeoutMs);
      if (disposed || signal.aborted || controller.signal.aborted) throw failure();
      const started = now(); if (!Number.isSafeInteger(started) || started < 0) throw failure();
      const url = projectUrl + '/auth/v1' + endpoint;
      const operation = async () => {
        if (disposed || signal.aborted || controller.signal.aborted) throw failure();
        const response = await fetchRequest(url, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body),
          headers: Object.freeze({ apikey: publishableKey, Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}) }),
          signal: controller.signal, redirect: 'error', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' });
        stream.body = response.body;
        if (disposed || signal.aborted || controller.signal.aborted || response.redirected || response.url && response.url !== url) {
          await cancelStream();
          throw failure();
        }
        if (response.status === 204 && endpoint === '/logout?scope=local') return { status: 204, body: null, started };
        if (response.status === 429) throw failure('over_request_rate_limit');
        if (response.status >= 500) throw failure();
        if (!/^(?:application\/json)(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) throw failure();
        const length = response.headers.get('content-length');
        if (length !== null && (!/^\d+$/.test(length) || Number(length) > 524288) || !stream.body?.getReader) throw failure();
        stream.reader = stream.body.getReader(); let size = 0; const chunks: Uint8Array[] = [];
        while (true) { const part = await stream.reader.read(); if (disposed || signal.aborted || controller.signal.aborted) throw failure(); if (part.done) break;
          if (!(part.value instanceof Uint8Array) || (size += part.value.byteLength) > 524288) throw failure(); chunks.push(part.value); }
        const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
        if (response.status !== 200) {
          const code = record(parsed) ? typeof parsed.error_code === 'string' ? parsed.error_code : parsed.code : null;
          throw failure(typeof code === 'string' ? code : 'auth_unavailable');
        }
        return { status: 200, body: parsed, started };
      };
      // Timeout ends the caller's wait, not an uncooperative fetch/read. Keep
      // its admission until that work (including a late body cancel) settles.
      workStarted = true;
      const work = operation().finally(async () => {
        try { await cancelStream(); }
        finally { try { stream.reader?.releaseLock(); } catch {} pending.delete(stop); }
      });
      const result = await Promise.race([interrupted, work]);
      if (disposed || signal.aborted || controller.signal.aborted) throw failure();
      return result;
    } catch (error) { throw failure(record(error) && typeof error.code === 'string' ? error.code : 'auth_unavailable'); }
    finally { done = true; if (!workStarted) pending.delete(stop); try { cancel(); } catch {} signal.removeEventListener('abort', stop);
      void cancelStream(); controller.abort(); }
  }
  function decode(body: unknown, started: number): AuthSession {
    if (!record(body) || !record(body.user)) throw failure();
    const { access_token, refresh_token, expires_in, expires_at, token_type } = body;
    const { id, role } = body.user;
    if (!uuid(id) || role !== 'authenticated' || !access(access_token) || !opaque(refresh_token)
      || typeof token_type !== 'string' || token_type.toLowerCase() !== 'bearer' || !Number.isSafeInteger(expires_in) || (expires_in as number) < 1 || (expires_in as number) > 86400) throw failure();
    let expiresAt = started + (expires_in as number) * 1000;
    if (expires_at !== undefined) { if (!Number.isSafeInteger(expires_at) || (expires_at as number) < 0) throw failure(); expiresAt = Math.min(expiresAt, (expires_at as number) * 1000); }
    const timestamp = now(); if (!Number.isSafeInteger(timestamp) || timestamp < 0 || !Number.isSafeInteger(expiresAt) || expiresAt <= timestamp) throw failure();
    return Object.freeze({ userId: id, accessToken: access_token, refreshToken: refresh_token, expiresAt });
  }
  return Object.freeze({
    signIn: async (input: Credentials, signal: AbortSignal) => { const r = await request('/token?grant_type=password', credentials(input), signal); if (disposed || signal.aborted) throw failure(); return decode(r.body, r.started); },
    refresh: async (refreshToken: string, signal: AbortSignal) => { if (!opaque(refreshToken)) throw failure(); const r = await request('/token?grant_type=refresh_token', { refresh_token: refreshToken }, signal); if (disposed || signal.aborted) throw failure(); return decode(r.body, r.started); },
    signUp: async (input: Credentials, signal: AbortSignal) => {
      const r = await request('/signup', credentials(input), signal);
      if (disposed || signal.aborted) throw failure();
      const user = record(r.body) && record(r.body.user) ? r.body.user : r.body;
      if (!record(user) || !uuid(user.id)) throw failure();
      // Same public receipt for user-only, obfuscated existing-user or session
      // responses. Do not infer account existence or activate returned tokens.
      return Object.freeze({ status: 'submitted' as const });
    },
    revoke: async (session: AuthSession, signal: AbortSignal) => { try { if (!access(session.accessToken)) return false; return (await request('/logout?scope=local', undefined, signal, session.accessToken)).status === 204; } catch { return false; } },
    dispose: () => { disposed = true; for (const stop of [...pending]) stop(); },
  });
}
