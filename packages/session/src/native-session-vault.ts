// Structural candidate for expo-secure-store. No SDK import or plaintext fallback.
// Encryption, native availability and durability must be verified on device.
export type SecureStoreOptions = Readonly<{ keychainService: string; keychainAccessible: number; requireAuthentication: false }>;
export type SecureStorePort = {
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: number;
  isAvailableAsync: () => PromiseLike<boolean>;
  getItemAsync: (key: string, options: SecureStoreOptions) => PromiseLike<string | null>;
  setItemAsync: (key: string, value: string, options: SecureStoreOptions) => PromiseLike<void>;
  deleteItemAsync: (key: string, options: SecureStoreOptions) => PromiseLike<void>;
};
export type StoredRefresh = Readonly<{ userId: string; refreshToken: string }>;
type Result = Readonly<{ status: 'saved' | 'empty' | 'discarded' | 'unavailable' | 'busy' } | { status: 'loaded'; value: StoredRefresh }>;
const fixed = (status: 'saved' | 'empty' | 'discarded' | 'unavailable' | 'busy'): Result => Object.freeze({ status });
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
function capture(input: StoredRefresh): StoredRefresh {
  const { userId, refreshToken } = input;
  if (!uuid(userId) || typeof refreshToken !== 'string' || !refreshToken || refreshToken.length > 8192
    || /[\u0000-\u0020\u007f]/.test(refreshToken) || refreshToken.startsWith('sb_')) throw Error('Vault unavailable');
  return Object.freeze({ userId, refreshToken });
}

// One owner per native key/process. Do not create a second writer or recover a
// stalled native write by racing another store instance against it.
export function createNativeSessionVault({ store, projectRef, maxQueued = 16 }: {
  store: SecureStorePort; projectRef: string; maxQueued?: number;
}) {
  if (!/^[a-z]{20}$/.test(projectRef) || !Number.isSafeInteger(store.WHEN_UNLOCKED_THIS_DEVICE_ONLY)
    || store.WHEN_UNLOCKED_THIS_DEVICE_ONLY < 0 || !Number.isSafeInteger(maxQueued) || maxQueued < 1 || maxQueued > 100) throw Error('Vault unavailable');
  const key = 'resicheck.connect.' + projectRef + '.session.v1';
  const options = Object.freeze({ keychainService: key, keychainAccessible: store.WHEN_UNLOCKED_THIS_DEVICE_ONLY, requireAuthentication: false as const });
  let generation = 0, queued = 0, blocked = false;
  let tail: Promise<void> = Promise.resolve();
  let clearing: Promise<Result> | null = null;
  function enqueue(work: () => Promise<Result>, priority = false): Promise<Result> {
    if (!priority && queued >= maxQueued) return Promise.resolve(fixed('busy'));
    queued++;
    const pending = tail.then(work).catch(() => { blocked = true; return fixed('unavailable'); });
    // A timeout must not release this tail: native mutations are not cancelable.
    tail = pending.then(() => { queued--; });
    return pending;
  }
  function begin() {
    const activation = ++generation;
    const active = () => generation === activation;
    function save(input: StoredRefresh) {
      if (!active()) return Promise.resolve(fixed('discarded'));
      let serialized: string;
      try { serialized = JSON.stringify({ version: 1, projectRef, ...capture(input) }); }
      catch { return Promise.resolve(fixed('unavailable')); }
      return enqueue(async () => {
        if (!active()) return fixed('discarded');
        if (blocked || await store.isAvailableAsync() !== true) { blocked = true; return fixed('unavailable'); }
        if (!active()) return fixed('discarded');
        await store.setItemAsync(key, serialized, options);
        return fixed(active() ? 'saved' : 'discarded');
      });
    }
    function read() {
      return enqueue(async () => {
        if (!active()) return fixed('discarded');
        if (blocked || await store.isAvailableAsync() !== true) { blocked = true; return fixed('unavailable'); }
        if (!active()) return fixed('discarded');
        const value = await store.getItemAsync(key, options);
        if (!active()) return fixed('discarded');
        if (value === null) return fixed('empty');
        if (typeof value !== 'string' || value.length > 12000) throw Error('Vault unavailable');
        const parsed: unknown = JSON.parse(value);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw Error('Vault unavailable');
        const envelope = parsed as Record<string, unknown>;
        if (envelope.version !== 1 || envelope.projectRef !== projectRef
          || Object.keys(envelope).some(key => !['version', 'projectRef', 'userId', 'refreshToken'].includes(key))) throw Error('Vault unavailable');
        const record = capture(envelope as StoredRefresh);
        return Object.freeze({ status: 'loaded' as const, value: record });
      });
    }
    return Object.freeze({ save, read, close: () => { if (active()) generation++; } });
  }
  function clear(): Promise<Result> {
    generation++; // Immediate invalidation, even if deletion must wait for IO.
    if (clearing) return clearing;
    const pending = enqueue(async () => {
      if (await store.isAvailableAsync() !== true) throw Error('Vault unavailable');
      await store.deleteItemAsync(key, options);
      if (await store.getItemAsync(key, options) !== null) throw Error('Vault unavailable');
      blocked = false;
      return fixed('empty');
    }, true);
    clearing = pending;
    void pending.then(() => { if (clearing === pending) clearing = null; });
    return pending;
  }
  return Object.freeze({ begin, clear,
    snapshot: () => Object.freeze({ state: blocked ? 'blocked' as const : clearing ? 'clearing' as const : 'idle' as const }),
  });
}
