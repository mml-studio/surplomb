// What a plugged row says about itself, in English.
//
// The coverage line is doctrine H1 and A5 written out — the edge of the data
// and the cap that cut it — and `docs/DATASETS.md` prints the same sentence in
// English. The progress line still says only what it can prove: an exact
// fraction, and a time left rounded coarser than its own error.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  datasetCoverageLine,
  datasetFilterChips,
  datasetProgressLine,
  datasetRemainingLabel,
} from './datasetLayer.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

test('the coverage line declares the cap, the view and the relay in English', () => {
  const english = (report) => withLocale('en', () => datasetCoverageLine(report));
  assert.equal(english({ count: 4000, total: 186137, truncated: true, maxFeatures: 4000 }),
    '4,000 shown of 186,137 — cap 4,000, first rows');
  assert.equal(english({ count: 1176, scope: 'viewport' }), '1,176 in view');
  assert.equal(english({ count: 888 }), '888 features, whole dataset');
  assert.equal(english({ count: 5000, truncated: true, maxFeatures: 5000 }), '5,000 shown — cap 5,000');
  assert.equal(english({ count: 12, unplaced: 3, via: 'relay' }),
    '12 features, whole dataset · 3 without position · via relay');
  assert.equal(english({ gated: true, maxSpanDeg: 1.5 }), 'beyond a 1.5° view, nothing is requested');
  assertNoFrench([
    english({ count: 4000, total: 186137, truncated: true, maxFeatures: 4000 }),
    english({ count: 12, unplaced: 3, via: 'relay' }),
    english({ gated: true, maxSpanDeg: 1.5 }),
  ]);
});

test('French keeps its own grouping and its own words', () => {
  assert.equal(datasetCoverageLine({ count: 4000, total: 186137, truncated: true, maxFeatures: 4000 }),
    '4 000 affichés sur 186 137 — plafond 4 000, premières lignes');
  assert.equal(datasetCoverageLine({ gated: true, maxSpanDeg: 1.5 }),
    "au-delà de 1,5° de vue, rien n'est demandé");
});

test('the time left is rounded the same way, and worded for the page', () => {
  const english = (ms) => withLocale('en', () => datasetRemainingLabel(ms));
  assert.equal(english(26720), 'about 25 seconds');
  assert.equal(english(90000), 'about 1.5 minutes');
  assert.equal(english(120000), 'about 2 minutes');
  assert.equal(english(2999), null);
  assert.equal(datasetRemainingLabel(90000), 'environ 1,5 minutes');
});

test('the progress line leads with the exact fraction', () => {
  const progress = { received: 4000, ceiling: 16474, requests: 8, startedAt: 1000 };
  const english = withLocale('en', () => datasetProgressLine(progress, 1000 + 8000));
  assert.equal(english, '4,000 of 16,474 — about 25 seconds');
  assert.equal(withLocale('en', () => datasetProgressLine({ received: 2400 })), '2,400 rows received');
  assertNoFrench(english);
});

test('a chip says how much of the map it keeps, in English', () => {
  const manifest = {
    feature: {
      filters: [
        { id: 'all', label: 'All' },
        { id: 'h24', label: '24/7', title: 'Reachable around the clock', groups: ['h24'] },
      ],
    },
  };
  const tally = new Map([['h24', { total: 41 }], ['__other__', { total: 847 }]]);
  const chips = withLocale('en', () => datasetFilterChips(manifest, { filter: 'all' }, tally));
  assert.equal(chips[0].title, '888 of 888 in view');
  assert.equal(chips[1].title, 'Reachable around the clock — 41 of 888');
  assertNoFrench(chips.map((chip) => chip.title));
});
