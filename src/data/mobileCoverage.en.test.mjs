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
    'Operators with signal', 'None: dead zone', 'Only 1 operator', '2 operators', '3 operators',
    'All 4: left untinted',
  ]);
  const free = withLocale('en', () => coverageLegend(META, 'free'));
  assert.deepEqual(free.map((entry) => entry.label), [
    'Free network', 'No signal', 'Weak: outdoors only', 'Good', 'Very good: left untinted',
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

test('the coverage block, its segments, its clock line and its disclosure are English on the loaded layer', () => {
  _setAnfrCoverageForTest({ viewer, mode: 'gaps', meta: META, enabled: true });
  const [block] = withLocale('en', () => anfrFranceLayer.getRowControls().legendBlocks);
  assert.equal(block.title, '4G coverage');
  assert.deepEqual(block.legendSegments.map((segment) => segment.label), ['No 4G', 'By operator']);
  assert.equal(block.note,
    'Operators’ estimate, published by ARCEP (March 2026). Click the map to see the signal at a spot. Mainland France only.');
  _setAnfrCoverageForTest({ viewer, mode: 'bouygues', meta: META, enabled: true });
  const [byOperator] = withLocale('en', () => anfrFranceLayer.getRowControls().legendBlocks);
  assert.deepEqual(byOperator.legendSubSegments.map((segment) => segment.label), ['Orange', 'SFR', 'Bouygues', 'Free']);
  assertNoFrench([
    block.title,
    block.legendSegmentsLabel,
    ...block.legendSegments.map((segment) => segment.title),
    ...byOperator.legendSegments.map((segment) => segment.title),
    ...byOperator.legendSubSegments.map((segment) => segment.title),
    block.note,
  ]);
  _setAnfrCoverageForTest({ viewer, mode: 'off', meta: null, status: 'idle', enabled: false });
});
