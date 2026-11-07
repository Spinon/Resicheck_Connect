import test from 'node:test';
import assert from 'node:assert/strict';
import { backTarget, matchesCompany } from '../src/navigation.ts';

test('root back asks before discarding a demo session', () => {
  for (const screen of ['companies', 'team', 'pending'] as const) {
    assert.equal(backTarget(screen, screen !== 'companies', false, 'companies'), 'confirm-exit');
  }
});
test('profile returns to its entry context and settings return to profile', () => {
  for (const origin of ['companies', 'company', 'team'] as const) {
    assert.equal(backTarget('profile', origin === 'team', false, origin), origin);
  }
  assert.equal(backTarget('settings', false, false, 'companies'), 'profile');
});
test('back closes linking before leaving and chat returns to the correct role context', () => {
  assert.equal(backTarget('companies', false, true, 'companies'), 'close-search');
  assert.equal(backTarget('chat', false, false, 'company'), 'company');
  assert.equal(backTarget('chat', true, false, 'team'), 'team');
  assert.equal(backTarget('staff-search', true, false, 'companies'), 'register');
});
test('company search accepts accents, whitespace and mixed case without exposing conversations', () => {
  assert.ok(matchesCompany('Clínica Horizonte', '  CLINICA  '));
  assert.ok(matchesCompany('Clínica Jardim', 'jardim'));
  assert.ok(matchesCompany('Centro Vida', ''));
  assert.equal(matchesCompany('Centro Vida', 'horizonte'), false);
});
