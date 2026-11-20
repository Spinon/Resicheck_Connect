// Local candidate only. No Storage SDK, credentials, paths or message creation.
// A production adapter must bind authority to its authenticated session and
// reauthorize on the server; this local capability is only a presentation fence.
export type AudioUploadScope = Readonly<{
  companyId: string; conversationId: string; current: () => boolean;
}>;
export type AudioUploadCommand = Readonly<{
  companyId: string; conversationId: string; clientUploadId: string;
}>;
export type AudioUploadPort = (command: AudioUploadCommand, bytes: Uint8Array,
  signal: AbortSignal) => Promise<unknown>;
export type AudioUploadView = Readonly<{
  phase: 'idle' | 'reading' | 'submitting' | 'pending' | 'uncertain' | 'ready' | 'rejected' | 'failed' | 'closed';
  attachmentId: string | null;
  notice: null | 'unavailable' | 'awaiting-validation' | 'result-unknown' | 'invalid-audio';
}>;
type Options = Readonly<{
  scope: AudioUploadScope;
  // Trusted private-file adapter, created only after explicit review. It must
  // bound I/O itself; these metadata do not prove media validity to the server.
  source: Readonly<{ durationMs: number; read: (maxBytes: number, signal: AbortSignal) => Promise<Uint8Array> }>;
  lookup?: (command:AudioUploadCommand,signal:AbortSignal)=>Promise<unknown>;
  upload: AudioUploadPort; idFactory: () => string;
  schedule: (callback: () => void, ms: number) => () => void;
  timeoutMs: number;
}>;
export const AUDIO_UPLOAD_LIMITS = Object.freeze({ bytes: 1_048_576, minimumMs: 500, maximumMs: 60_500 });
const id = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(v);
function exact(v: unknown, keys: string[]): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
    && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
}
const hidden: AudioUploadView = Object.freeze({ phase: 'closed', attachmentId: null, notice: null });

// One reviewed clip, one idempotency key and at most one in-flight operation.
// Retries retain the original byte snapshot; a new recording needs a new owner.
export function createAudioUploadCandidate(options: Options) {
  const { companyId, conversationId, current } = options.scope;
  const { durationMs, read } = options.source;
  const { upload, idFactory, schedule, timeoutMs } = options;
  if (!id(companyId) || !id(conversationId) || typeof current !== 'function'
    || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000)
    throw new Error('Audio upload unavailable');
  let closed = false, revision = 0, held: Uint8Array | null = null;
  let command: AudioUploadCommand | null = null;
  let interrupt: (() => void) | null = null, ioPending = false;
  let view: AudioUploadView = Object.freeze({ phase: 'idle', attachmentId: null, notice: null });
  const listeners = new Set<() => void>();
  const active = () => { try { return !closed && current(); } catch { return false; } };
  const notify = () => { for (const f of listeners) try { f(); } catch { /* Observer cannot interrupt cleanup. */ } };
  function publish(phase: AudioUploadView['phase'], notice: AudioUploadView['notice'] = null, attachmentId: string | null = null) {
    view = Object.freeze({ phase, notice, attachmentId }); notify();
  }
  function release() { held?.fill(0); held = null; }
  function close() {
    if (closed) return;
    closed = true; revision++; release(); command = null;
    const abort = interrupt; interrupt = null; abort?.(); view = hidden; notify();
  }
  function valid(ticket: number) { if (!active()) { close(); return false; } return ticket === revision; }
  async function bounded<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController(); let reject!: (reason: Error) => void;
    const interrupted = new Promise<never>((_, r) => { reject = r; });
    void interrupted.catch(() => {});
    const abort = () => { controller.abort(); reject(new Error('Audio upload unavailable')); };
    interrupt = abort; let cancel = () => {};
    try {
      cancel = schedule(abort, timeoutMs);
      if (!active() || controller.signal.aborted) throw new Error('Audio upload unavailable');
      ioPending = true;
      const pending = Promise.resolve().then(() => {
        if (!active() || controller.signal.aborted) throw new Error('Audio upload unavailable');
        return operation(controller.signal);
      }).finally(() => { ioPending = false; });
      return await Promise.race([interrupted, pending]);
    } finally { try { cancel(); } catch {} if (interrupt === abort) interrupt = null; }
  }
  async function submit(ticket: number) {
    if (!valid(ticket) || !held || !command) return;
    publish('submitting');
    if (!valid(ticket) || !held || !command) return;
    // Adapter receives a separate buffer: mutation cannot corrupt a retry.
    // Retain it until adapter completion; abort alone does not prove server rollback.
    const outgoing = Uint8Array.from(held);
    try {
      const result = await bounded(signal => upload(command!, outgoing, signal));
      if (!valid(ticket)) return;
      if (exact(result, ['ok', 'value']) && result.ok === true && exact(result.value, ['id', 'state'])
        && id(result.value.id) && ['ready', 'quarantined', 'rejected'].includes(String(result.value.state))) {
        if (result.value.state === 'ready') { release(); publish('ready', null, result.value.id); }
        else if (result.value.state === 'quarantined') publish('pending', 'awaiting-validation');
        else { release(); publish('rejected', 'unavailable'); }
      } else if (exact(result, ['ok', 'code']) && result.ok === false
        && ['INVALID_INPUT', 'UNAVAILABLE', 'CONFLICT', 'RETRY_LATER'].includes(String(result.code))) {
        if (result.code === 'RETRY_LATER') publish('pending', 'awaiting-validation');
        else { release(); publish('rejected', 'unavailable'); }
      } else publish('uncertain', 'result-unknown');
    } catch { if (valid(ticket)) publish('uncertain', 'result-unknown'); }
    // No finally scrub of outgoing: a non-cooperative adapter may still be using
    // it after timeout. The adapter owns bounded I/O and buffer lifetime.
  }
  async function start() {
    if (!active()) { close(); return; }
    if (view.phase !== 'idle') return;
    const ticket = ++revision;
    if (!Number.isFinite(durationMs) || durationMs < AUDIO_UPLOAD_LIMITS.minimumMs || durationMs > AUDIO_UPLOAD_LIMITS.maximumMs) {
      publish('failed', 'invalid-audio'); return;
    }
    publish('reading');
    try {
      const uploadId = idFactory(); if (!id(uploadId)) throw new Error('Audio upload unavailable');
      command = Object.freeze({ companyId, conversationId, clientUploadId: uploadId });
      const bytes = await bounded(signal => read(AUDIO_UPLOAD_LIMITS.bytes, signal));
      if (!valid(ticket)) return;
      if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1 || bytes.byteLength > AUDIO_UPLOAD_LIMITS.bytes) {
        release(); publish('failed', 'invalid-audio'); return;
      }
      held = Uint8Array.from(bytes);
      await submit(ticket);
    } catch { if (valid(ticket)) { release(); publish('failed', 'unavailable'); } }
  }
  return Object.freeze({
    start,
    recover:async()=>{
      if(!options.lookup||!active()||ioPending||!command||!['uncertain','pending'].includes(view.phase))return;
      const ticket=++revision;
      try{
        const result=await bounded(signal=>options.lookup!(command!,signal));
        if(!valid(ticket))return;
        if(exact(result,['ok','code'])&&result.ok===false&&result.code==='NOT_OBSERVED')return;
        if(!exact(result,['ok','value'])||result.ok!==true||!exact(result.value,['id','state'])||!id(result.value.id)||!['ready','quarantined','rejected'].includes(String(result.value.state)))throw Error('Audio upload unavailable');
        if(result.value.state==='ready'){release();publish('ready',null,result.value.id);}
        else if(result.value.state==='quarantined')publish('pending','awaiting-validation');
        else{release();publish('rejected','unavailable');}
      }catch{if(valid(ticket))publish('uncertain','result-unknown');}
    },
    retry: async () => {
      if (!active()) { close(); return; }
      if (ioPending || view.phase !== 'uncertain' && view.phase !== 'pending') return;
      if(options.lookup)return;
      await submit(++revision);
    },
    close,
    snapshot: () => active() ? view : hidden,
    subscribe: (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; },
  });
}
