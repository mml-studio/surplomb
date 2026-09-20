// The social position index in English: the four absences, the lycée's three
// streams, and the coverage clause that never becomes a bare percentage.
//
// The index exists to expose a gap, so the English is judged on one thing: a
// reader must be able to tell "the DEPP never published an index for this
// school" from "the DEPP examined it and withheld the index" from "the file
// did not download". Three facts, three sentences, and none of them a zero.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  IPS_UNAVAILABLE,
  IPS_VOIE_ORDER,
  formatIps,
  formatIpsDelta,
  ipsBaseline,
  ipsCardLines,
  ipsCoverageClause,
  ipsVoieLabel,
} from './ipsFeed.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

const card = (ips) => withLocale('en', () => ipsCardLines(ips));

test('the three streams of a lycée have English names', () => {
  const labels = withLocale('en', () => IPS_VOIE_ORDER.map((key) => ipsVoieLabel(key)));
  assert.deepEqual(labels,
    ['general and technological stream', 'vocational stream', 'post-secondary']);
  assertNoFrench(labels);
  assert.equal(withLocale('en', () => ipsVoieLabel('nope')), null);
});

test('an establishment outside the index says nothing at all', () => {
  // A rectorat, a CIO, a médico-social: reporting a gap that was never a gap
  // would be the failure this join exists to prevent.
  assert.deepEqual(card(undefined), []);
});

test('the four absences are four different English sentences', () => {
  const notPublished = card(null);
  const unavailable = card(IPS_UNAVAILABLE);
  const withheld = card({ status: 'ns', sentinel: 'NS', value: null });
  const notANumber = card({ status: 'ns', sentinel: 'ND', value: null });

  assert.deepEqual(notPublished, ['IPS not published for this UAI']);
  assert.deepEqual(unavailable,
    ['Social position index unavailable — the DEPP file could not be reached']);
  assert.deepEqual(withheld,
    ['IPS not significant (“NS”) — too few pupils for the DEPP to publish the index']);
  assert.deepEqual(notANumber, ['IPS published as “ND”, not as a number']);

  for (const lines of [notPublished, unavailable, withheld, notANumber]) {
    assertNoFrench(lines);
  }
  const heads = [notPublished[0], unavailable[0], withheld[0], notANumber[0]];
  assert.equal(new Set(heads).size, 4, 'four facts must not read as one');
  // And not one of them may look like a value.
  for (const head of heads) assert.equal(/\b\d+\.\d\b/.test(head), false);
});

test('an école card gives the number, its school year and its two baselines', () => {
  const lines = card({
    kind: 'ecole',
    rentree: '2024-2025',
    status: 'ok',
    value: 96.3,
    spread: null,
    lyceeType: null,
    voies: null,
    national: 103.9,
    departemental: 101.1,
  });
  assertNoFrench(lines);
  assert.deepEqual(lines, [
    'IPS 96.3 — 2024-2025 school year',
    'Ref.: department 101.1 · France 103.9 — gap −4.8 against the department',
  ]);
});

test('a collège card carries the standard deviation it publishes', () => {
  const lines = card({
    kind: 'college',
    rentree: '2025-2026',
    status: 'ok',
    value: 96.3,
    spread: 34.3,
    lyceeType: null,
    voies: null,
    national: null,
    departemental: null,
  });
  assert.deepEqual(lines, ['IPS 96.3 (standard deviation 34.3) — 2025-2026 school year']);
});

test('a lycée names the unit before the number, and the streams it blends', () => {
  const lines = card({
    kind: 'lycee',
    rentree: '2025-2026',
    status: 'ok',
    value: 126.3,
    spread: 12.0,
    lyceeType: 'LPO',
    voies: { gt: 140.1, pro: 92.4 },
    national: 104.4,
    departemental: null,
  });
  assertNoFrench(lines);
  assert.equal(lines[0],
    'IPS 126.3 (standard deviation 12.0) — whole school (LPO), 2025-2026 school year');
  assert.equal(lines[1], 'general and technological stream 140.1 · vocational stream 92.4 '
    + '— the school-wide index blends these populations');
  // The baseline is picked per lycée type, so the label names which one.
  assert.equal(lines[2], 'Ref. LPO: France 104.4 — gap +21.9 against France');
});

test('a lycée with one published stream says it is the only one', () => {
  const lines = card({
    kind: 'lycee',
    rentree: '2025-2026',
    status: 'ok',
    value: 89.9,
    spread: null,
    lyceeType: 'LP',
    voies: { pro: 89.9 },
    national: null,
    departemental: null,
  });
  assert.equal(lines[1], 'vocational stream 89.9 — the only stream published for this high school');
});

test('with no baseline published, the English card prints no gap', () => {
  const lines = card({
    kind: 'ecole', rentree: '2024-2025', status: 'ok', value: 100, spread: null,
    lyceeType: null, voies: null, national: 100, departemental: null,
  });
  // The national reference EQUALS this school's own index: comparing them says
  // nothing, so the anchors print alone.
  assert.deepEqual(lines, ['IPS 100.0 — 2024-2025 school year', 'Ref.: France 100.0']);
  assert.equal(withLocale('en', () => ipsBaseline(lines)), null);
});

test('English numbers use a decimal point and the gap keeps its sign', () => {
  assert.equal(withLocale('en', () => formatIps(119.5)), '119.5');
  assert.equal(withLocale('en', () => formatIps(72)), '72.0');
  assert.equal(withLocale('en', () => formatIpsDelta(-7.8)), '−7.8');
  assert.equal(withLocale('en', () => formatIpsDelta(12.75)), '+12.8');
  // The minus is U+2212, not a hyphen, in both languages.
  assert.equal(withLocale('en', () => formatIpsDelta(-1))[0], '−');
});

test('the coverage clause names its denominator, never a bare percentage', () => {
  const clause = withLocale('en',
    () => ipsCoverageClause({ eligible: 62857, valued: 40529, status: 'ok' }));
  assertNoFrench(clause);
  assert.equal(clause, 'IPS published for 40,529 of the 62,857 schools it covers');
  assert.equal(/%/.test(clause), false);

  assert.equal(
    withLocale('en', () => ipsCoverageClause({ eligible: 100, valued: 40, status: 'partial' })),
    'IPS published for 40 of the 100 schools it covers — partial index',
  );
  assert.equal(
    withLocale('en', () => ipsCoverageClause({ eligible: 0, valued: 0, status: 'unavailable' })),
    'IPS unavailable',
  );
  assert.equal(withLocale('en', () => ipsCoverageClause(null)), '');
});

test('one loaded module answers in either language, from the same record', () => {
  const record = {
    kind: 'ecole', rentree: '2024-2025', status: 'ok', value: 96.3, spread: null,
    lyceeType: null, voies: null, national: 103.9, departemental: 101.1,
  };
  assert.equal(ipsCardLines(record)[0], 'IPS 96,3 — rentrée 2024-2025');
  assert.equal(withLocale('en', () => ipsCardLines(record))[0], 'IPS 96.3 — 2024-2025 school year');
});
