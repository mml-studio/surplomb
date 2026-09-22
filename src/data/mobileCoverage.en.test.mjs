// The ARCEP coverage in English: the chips, the key, the card — everything a
// reader of `?lang=en` meets once the coverage is on. The French of the same
// surfaces is pinned in mobileCoverage.test.mjs and anfrCoverage.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';

import anfrFranceLayer, { _setAnfrCoverageForTest } from './anfrFrance.js';
import { COVERAGE_FORMAT, coverageCardText, coverageLegend, encodeCoverage } from './mobileCoverage.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

const META = Object.freeze({
  format: COVERAGE_FORMAT,
  edition: '2026_T1',
  quarterEnd: '2026-03-31',
  minZoom: 5,
  maxZoom: 12,
  tiles: {},
  stats: {
    landKm2: 1000,
    histogramKm2: Array.from({ length: 256 }, (_, code) => (code === 0 ? 12 : (code === 255 ? 988 : 0))),
  },
});

const viewer = { imageryLayers: { add() {}, remove() {} }, scene: { globe: { show: true } } };

test('the key reads in English, one plain name per colour', () => {
  const gaps = withLocale('en', () => coverageLegend(META, 'gaps'));
  assert.deepEqual(gaps.map((entry) => entry.label), [
    '4G: operators with signal', 'No operator: dead zone', 'Only 1 operator', '2 operators', '3 operators',
    'All 4 operators: no colour',
  ]);
  const free = withLocale('en', () => coverageLegend(META, 'free'));
  assert.deepEqual(free.map((entry) => entry.label), [
    'Free 4G', 'No signal', 'Weak: outdoors only', 'Good', 'Very good: no colour',
  ]);
  assertNoFrench([...gaps, ...free].map((entry) => entry.label));
});

test('the card answers first, then names each operator', () => {
  const text = withLocale('en', () => coverageCardText(META, { inside: true, code: encodeCoverage([2, 0, 0, 0]) }));
  assert.deepEqual(text.split('\n'), [
    'Only Orange has signal here',
    'Orange: good',
    'SFR: no signal',
    'Bouygues: no signal',
    'Free: no signal',
    'Operators’ estimate (ARCEP, March 2026)',
  ]);
  assertNoFrench(text.split('\n'));
  const outside = withLocale('en', () => coverageCardText(META, { inside: false }));
  assert.match(outside, /^No data here\nThe map covers mainland France, not the sea\.$/);
});

test('the chips, the clock line and the disclosure are English on the loaded layer', () => {
  _setAnfrCoverageForTest({ viewer, mode: 'gaps', meta: META, enabled: true });
  const controls = withLocale('en', () => anfrFranceLayer.getRowControls());
  assert.deepEqual(controls.chips.map((chip) => chip.label), ['Dead zones', 'Orange', 'SFR', 'Bouygues', 'Free']);
  assert.equal(controls.note,
    'Operators’ estimate, published by ARCEP (March 2026). Click the map to see the signal at a spot. Mainland France only.');
  assertNoFrench([
    ...controls.chips.map((chip) => chip.title),
    controls.note,
  ]);
  _setAnfrCoverageForTest({ viewer, mode: 'off', meta: null, status: 'idle', enabled: false });
});
