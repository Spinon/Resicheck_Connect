import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionScope } from '../src/session-scope.ts';
import { AUTH_ERROR_FALLBACK, publicAuthError } from '../src/public-auth-error.ts';

// Compile-time contracts: async cleanup can erase a newer context after await.
// Never execute these deliberately invalid adapter examples.
if (false) {
  // @ts-expect-error cleanup must finish synchronously
  createSessionScope(async () => {});
  const scope = createSessionScope(() => {});
  // @ts-expect-error applying an async response requires checking after await
  scope.commit(scope.capture(), async () => {});
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
function fixture() {
  let content: string[] = [];
  const scope = createSessionScope(() => { content = []; });
  const auth = scope.beginAuthentication();
  assert.equal(scope.acceptIdentity(auth, 'synthetic-user-a'), true);
  scope.selectCompany('synthetic-company-a');
  return { scope, content: () => content, write: (text: string) => { content.push(text); } };
}

test('delayed chat response after logout cannot repopulate cleared private view', async () => {
  const f = fixture(); const response = deferred<string>();
  const ticket = f.scope.capture();
  const job = response.promise.then(text => f.scope.commit(ticket, () => { f.write(text); }));
  f.scope.commit(ticket, () => { f.write('old visible message'); });
  f.scope.signOut();
  assert.deepEqual(f.content(), []);
  response.resolve('late private message');
  assert.equal(await job, false);
  assert.deepEqual(f.content(), []);
  assert.deepEqual(f.scope.snapshot(), { userId: null, companyId: null });
});

test('company switch drops late previous-company request including A to B to A', async () => {
  const f = fixture(); const response = deferred<string>(); const ticket = f.scope.capture();
  const job = response.promise.then(text => f.scope.commit(ticket, () => { f.write(text); }));
  f.scope.selectCompany('synthetic-company-b');
  f.scope.selectCompany('synthetic-company-a');
  response.resolve('old company request');
  assert.equal(await job, false);
  assert.equal(f.scope.commit(f.scope.capture(), () => { f.write('fresh'); }), true);
  assert.deepEqual(f.content(), ['fresh']);
});

test('late sign-in is discarded after logout and after another sign-in attempt', async () => {
  const scope = createSessionScope(() => {});
  const old = scope.beginAuthentication(); const reply = deferred<string>();
  const job = reply.promise.then(user => scope.acceptIdentity(old, user));
  scope.signOut();
  const latest = scope.beginAuthentication();
  assert.equal(scope.acceptIdentity(latest, 'synthetic-user-b'), true);
  reply.resolve('synthetic-user-a');
  assert.equal(await job, false);
  assert.equal(scope.snapshot().userId, 'synthetic-user-b');
});

test('duplicate auth callback cannot reset company or restore old context', () => {
  const scope = createSessionScope(() => {}); const auth = scope.beginAuthentication();
  assert.equal(scope.acceptIdentity(auth, 'synthetic-user-a'), true);
  scope.selectCompany('synthetic-company-a');
  assert.equal(scope.acceptIdentity(auth, 'synthetic-user-a'), false);
  assert.equal(scope.snapshot().companyId, 'synthetic-company-a');
});

test('tickets are instance-specific, signed-out commits fail and snapshots are immutable', () => {
  const a = fixture(); const b = fixture();
  assert.equal(a.scope.commit(b.scope.capture(), () => { a.write('cross-instance'); }), false);
  assert.equal(Object.isFrozen(a.scope.snapshot()), true);
  assert.equal(Object.isFrozen(a.scope.capture()), true);
  a.scope.signOut();
  assert.equal(a.scope.commit(a.scope.capture(), () => { a.write('signed out'); }), false);
  assert.throws(() => a.scope.selectCompany('company'));
});

test('same context preserves current request; context removal invalidates it', () => {
  const f = fixture(); const ticket = f.scope.capture();
  f.scope.selectCompany('synthetic-company-a');
  assert.equal(f.scope.commit(ticket, () => { f.write('current'); }), true);
  f.scope.selectCompany(null);
  assert.deepEqual(f.content(), []);
  assert.equal(f.scope.commit(ticket, () => { f.write('obsolete'); }), false);
});

test('failed private-view cleanup invalidates old tickets and leaves scope signed out', () => {
  let fail = false;
  const scope = createSessionScope(() => { if (fail) throw new Error('synthetic cleanup failure'); });
  const auth = scope.beginAuthentication(); scope.acceptIdentity(auth, 'synthetic-user-a');
  const ticket = scope.capture(); fail = true;
  assert.throws(() => scope.signOut());
  assert.deepEqual(scope.snapshot(), { userId: null, companyId: null });
  assert.equal(scope.commit(ticket, () => {}), false);
});

test('blank identities cannot activate scope and blank company cannot replace context', () => {
  const scope = createSessionScope(() => {}); const auth = scope.beginAuthentication();
  assert.equal(scope.acceptIdentity(auth, '  '), false);
  assert.equal(scope.acceptIdentity(auth, 'synthetic-user-a'), true);
  assert.throws(() => scope.selectCompany('  '));
  assert.equal(scope.snapshot().companyId, null);
});

test('known auth codes map to fixed public messages without backend details', () => {
  assert.equal(publicAuthError({ code: 'invalid_credentials', message: 'synthetic-internal-path' }), 'E-mail ou senha inválidos.');
  assert.equal(publicAuthError({ code: 'session_not_found', hint: 'synthetic-private-id' }), 'Sua sessão expirou. Entre novamente.');
});

test('unknown, prototype, malformed and throwing auth errors never reveal arbitrary text', () => {
  for (const error of [null, undefined, 'synthetic secret', new Error('synthetic internal error'),
    { code: '__proto__' }, { code: 'constructor' }, { code: 'new_backend_error', message: 'synthetic SQL' },
    { code: 123 }, { get code() { throw new Error('synthetic getter'); } }]) {
    assert.equal(publicAuthError(error), AUTH_ERROR_FALLBACK);
  }
});
