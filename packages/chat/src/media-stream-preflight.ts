import {performance} from 'node:perf_hooks';
import {preflightMedia, type MediaPreflight} from './media-preflight.ts';

export type MediaStreamSource = Readonly<{
  chunks: AsyncIterable<Uint8Array>;
  // Must fulfill only after the source's I/O/resources have actually closed.
  // Rejection leaves closure unconfirmed and permanently retains this slot.
  close: () => Promise<void>;
}>;
export type MediaStreamInput = Readonly<{
  kind: 'audio' | 'image' | 'document';
  sha256: string;
  byteLength: number;
  // Trusted adapter, already bound to the authorized immutable object. No URI,
  // object key, authorization claim or adapter is selected from client input.
  // If opening fails, the adapter must clean up before rejecting.
  open: (signal: AbortSignal) => MediaStreamSource | Promise<MediaStreamSource>;
}>;
export type MediaStreamJob = Readonly<{
  result: Promise<MediaPreflight>;
  // result may time out before I/O settles; callers can observe both honestly.
  // Rejects with a fixed error if source closure could not be confirmed.
  settled: Promise<void>;
  cancel: () => void;
}>;

const unavailable: MediaPreflight = Object.freeze({status: 'unavailable'});
const rejected: MediaPreflight = Object.freeze({status: 'rejected'});
const MAX_CHUNK_BYTES = 65_536;
const MAX_CHUNKS = 4096;
// Shared by every call to this module in this process/isolate. Not a distributed
// quota or an OS sandbox; trusted adapters must bound their own read buffering.
let activeReads = 0;
const immediate = (value: MediaPreflight): MediaStreamJob => Object.freeze({
  result: Promise.resolve(value), settled: Promise.resolve(), cancel() {},
});

export function startMediaStreamPreflight(
  input: MediaStreamInput,
  options: Readonly<{timeoutMs?: number; signal?: AbortSignal}> = {},
): MediaStreamJob {
  let kind: MediaStreamInput['kind'], sha256: string, byteLength: number;
  let open: MediaStreamInput['open'], signal: AbortSignal | undefined, timeoutMs: number;
  try {
    // Read metadata/adapter/options once, before any await or source allocation.
    ({kind, sha256, byteLength, open} = input);
    ({signal, timeoutMs = 2000} = options);
    const limit = kind === 'audio' ? 1_048_576 : kind === 'image' ? 4_194_304
      : kind === 'document' ? 10_485_760 : 0;
    if (!Number.isSafeInteger(byteLength) || byteLength < 1 || byteLength > limit
      || typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256)
      || typeof open !== 'function') return immediate(rejected);
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 5000
      || (signal !== undefined && !(signal instanceof AbortSignal))) return immediate(unavailable);
  } catch { return immediate(rejected); }
  if (signal?.aborted || activeReads >= 2) return immediate(unavailable);

  activeReads++;
  const controller = new AbortController();
  const deadline = performance.now() + timeoutMs;
  let completed = false;
  let resolveResult!: (value: MediaPreflight) => void;
  const result = new Promise<MediaPreflight>(resolve => { resolveResult = resolve; });
  const finish = (value: MediaPreflight) => {
    if (completed) return;
    completed = true;
    resolveResult(value);
  };
  const cancel = () => {
    if (completed) return;
    finish(unavailable);
    controller.abort();
  };
  const expired = () => {
    if (!controller.signal.aborted && performance.now() >= deadline) cancel();
    return controller.signal.aborted;
  };
  const timer = setTimeout(cancel, timeoutMs);
  signal?.addEventListener('abort', cancel, {once: true});

  const settled = (async () => {
    let sourceReturned = false;
    let close: (() => Promise<void>) | undefined;
    let bytes: Uint8Array | undefined;
    let verdict = unavailable;
    try {
      const source = await open(controller.signal);
      sourceReturned = true;
      // A returned resource is live until its closer confirms otherwise. Read
      // the method once: an absent/throwing getter must not look like an open
      // rejection, whose trusted contract requires prior cleanup by the adapter.
      const closeMethod = source.close;
      if (typeof closeMethod !== 'function') throw new Error('Invalid media source');
      close = () => Reflect.apply(closeMethod, source, []);
      if (expired()) return;
      bytes = new Uint8Array(byteLength);
      let offset = 0, count = 0;
      for await (const chunk of source.chunks) {
        if (expired()) return;
        if (++count > MAX_CHUNKS || !(chunk instanceof Uint8Array)
          || chunk.byteLength > MAX_CHUNK_BYTES || chunk.byteLength > byteLength - offset) {
          verdict = rejected;
          return;
        }
        // Copy only the bounded visible view; a reused producer buffer must not
        // change earlier chunks. No unbounded chunk list or Buffer.concat.
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      if (expired()) return;
      if (offset !== byteLength) { verdict = rejected; return; }
      const remaining = Math.floor(deadline - performance.now());
      if (remaining < 1) { cancel(); return; }
      // Existing worker verifies the expected digest and envelope. It never
      // certifies decoding/malware safety or returns accepted/ready/publication.
      verdict = await preflightMedia({bytes, kind, sha256, byteLength}, remaining);
    } catch { verdict = unavailable; }
    finally {
      // Abort the trusted producer even for early rejection. Keep the slot until
      // iterator completion AND adapter close settle, including delayed opens.
      if (!controller.signal.aborted) controller.abort();
      bytes?.fill(0);
      let closureConfirmed = !sourceReturned;
      try {
        if (close) { await close(); closureConfirmed = true; }
      } catch { verdict = unavailable; }
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      if (closureConfirmed) activeReads--;
      if (!completed) finish(performance.now() >= deadline ? unavailable : verdict);
      if (!closureConfirmed) throw new Error('Media source closure unconfirmed');
    }
  })();
  // A caller may only await result; still expose failure through settled without
  // an unhandled rejection or recycling an unconfirmed live-resource slot.
  void settled.catch(() => {});
  return Object.freeze({result, settled, cancel});
}
