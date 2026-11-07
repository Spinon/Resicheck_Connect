import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { graphemeSegments } from 'unicode-segmenter/grapheme';

const fixture = readFileSync(new URL('./fixtures/GraphemeBreakTest-17.0.0.txt', import.meta.url));
const fixtureHash = 'e2d134d2c52919bace503ebb6a551c1855fe1a1faec18478c78fff254a1793ec';
const expectedCaseCount = 766;
const cases = fixture.toString('utf8').split(/\r?\n/).flatMap((line, index) => {
  const sample = line.split('#', 1)[0].trim();
  if (!sample) return [];
  const tokens = sample.split(/\s+/);
  assert.equal(tokens[0], '\u00f7', `Missing initial boundary on fixture line ${index + 1}`);
  assert.equal(tokens.at(-1), '\u00f7', `Missing final boundary on fixture line ${index + 1}`);
  assert.equal(tokens.length % 2, 1);
  let input = '';
  const boundaries: number[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (i % 2 === 0) {
      assert.ok(tokens[i] === '\u00f7' || tokens[i] === '\u00d7');
      if (tokens[i] === '\u00f7') boundaries.push(input.length);
    } else {
      assert.match(tokens[i], /^[0-9A-F]{4,6}$/);
      input += String.fromCodePoint(Number.parseInt(tokens[i], 16));
    }
  }
  return [{ line: index + 1, input, boundaries }];
});

test('official Unicode 17.0.0 fixture retains its hash, version and all 766 cases', () => {
  assert.equal(createHash('sha256').update(fixture).digest('hex'), fixtureHash);
  assert.match(fixture.toString('utf8'), /^# GraphemeBreakTest-17\.0\.0\.txt\r?\n/);
  assert.equal(cases.length, expectedCaseCount);
});

// This is segmentation conformance, not the app's accepted-message policy.
// Official cases include controls; deliberately do not call analyzeMessage here.
test('unicode-segmenter passes every boundary and count in 766 Unicode 17.0.0 cases', () => {
  for (const sample of cases) {
    const segments = [...graphemeSegments(sample.input)];
    const diagnostic = `GraphemeBreakTest-17.0.0.txt line ${sample.line}`;
    assert.deepEqual([...segments.map(segment => segment.index), sample.input.length], sample.boundaries, diagnostic);
    assert.equal(segments.length, sample.boundaries.length - 1, diagnostic);
    assert.equal(segments.map(segment => segment.segment).join(''), sample.input, diagnostic);
    assert.deepEqual(segments.map(segment => segment.segment), sample.boundaries.slice(0, -1).map((start, i) => sample.input.slice(start, sample.boundaries[i + 1])), diagnostic);
  }
});
