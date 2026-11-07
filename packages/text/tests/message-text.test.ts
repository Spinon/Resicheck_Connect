import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeMessage, messageInputError, messageLimits } from '../src/message-text.ts';

const clusters = ['😀', '👍🏽', '👩🏾‍⚕️', '👨‍👩‍👧‍👦', '🇧🇷', '🏳️‍🌈', '1️⃣', '✈️', 'e\u0301', 'é', '🫱🏽‍🫲🏻'];
test('composed emoji, modifiers, flags, selectors and combining accent each count as one', () => {
  for (const text of clusters) {
    assert.deepEqual(analyzeMessage(text), { valid: true, reason: null, graphemes: 1, bytes: Buffer.byteLength(text, 'utf8') }, text);
  }
});
test('exact grapheme boundary accepts whole sequences, excess is rejected without transformation', () => {
  for (const cluster of clusters) {
    const text = cluster.repeat(messageLimits.graphemes);
    assert.equal(analyzeMessage(text).valid, true, cluster);
    assert.equal(analyzeMessage(text + cluster).reason, 'graphemes');
    assert.equal(analyzeMessage(text + cluster).graphemes, 2001);
  }
});
test('UTF8 payload budget is independent of cluster count, including combining-mark abuse', () => {
  const exact = 'a' + '\u0301'.repeat(32767) + 'b';
  assert.equal(Buffer.byteLength(exact), messageLimits.bytes);
  assert.equal(analyzeMessage(exact).valid, true);
  assert.equal(analyzeMessage(exact).graphemes, 2);
  assert.equal(analyzeMessage(exact + 'c').reason, 'bytes');
  assert.equal(analyzeMessage(exact + 'c').bytes, messageLimits.bytes + 1);
});
test('isolated or reversed surrogates and controls fail while valid pairs/newlines survive', () => {
  for (const input of ['\ud800', '\udfff', 'x\ud83dy', '\udc00\ud800', '\ud83d😀', null, 42, {}]) assert.equal(analyzeMessage(input).reason, 'unicode');
  for (const input of ['x\0y', 'x\u0008y', 'x\u007fy']) assert.equal(analyzeMessage(input).reason, 'control');
  assert.equal(analyzeMessage(' Texto 😀\ncom\ttab\r\n').valid, true);
  for (const input of ['', ' \n\t ']) assert.equal(analyzeMessage(input).reason, 'empty');
});
test('public validation errors are fixed and contain no original input', () => {
  assert.equal(messageInputError(analyzeMessage('😀')), null);
  assert.equal(messageInputError(analyzeMessage('')), null);
  assert.match(messageInputError(analyzeMessage('😀'.repeat(2001)))!, /2\.000/);
  assert.equal(messageInputError(analyzeMessage('synthetic-private\0text')), 'A mensagem contém caracteres não aceitos. Revise o texto para enviar.');
});

test('portable UTF8 counter matches Node encoding across scalar boundaries and seeded Unicode samples', () => {
  let seed = 0x5eed1234;
  const next = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed; };
  const boundaries = [0x20,0x7e,0x80,0x7ff,0x800,0xd7ff,0xe000,0xffff,0x10000,0x10ffff];
  for (let sample = 0; sample < 256; sample++) {
    const scalars = [...boundaries];
    while (scalars.length < 64) {
      const value = 0x80 + next() % (0x110000 - 0x80);
      if (value < 0xd800 || value > 0xdfff) scalars.push(value);
    }
    const text = String.fromCodePoint(...scalars);
    const analysis = analyzeMessage(text);
    assert.equal(analysis.valid, true);
    assert.equal(analysis.bytes, Buffer.byteLength(text, 'utf8'));
  }
});
