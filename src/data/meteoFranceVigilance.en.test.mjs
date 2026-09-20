// The weather-warning map in English. Its French stays pinned, untouched, by
// meteoFranceVigilance.test.mjs and vigilanceReaches.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  VIGILANCE_LEVELS,
  VIGILANCE_UNKNOWN_LEVEL,
  vigilanceLabelText,
  vigilanceLevelLegend,
  vigilancePhenomenonName,
} from './meteoFranceVigilance.js';
import { VIGILANCE_PHENOMENA } from './meteoFranceVigilanceFeed.js';
import { VIGILANCE_PHENOMENON_NAMES } from './meteoFranceVigilance.i18n.js';
import { assertNoFrench, useTestLocale, withLocale } from '../i18n/testing.js';

useTestLocale('en');

test('the key names each painted level and repeats Météo-France’s instruction', () => {
  assert.deepEqual(
    vigilanceLevelLegend({ green: 57, yellow: 27, orange: 12, red: 1 })
      .map((entry) => [entry.label, entry.blurb, entry.count]),
    [
      ['RED', 'Absolute vigilance is required', 1],
      ['ORANGE', 'Be very vigilant', 12],
      ['YELLOW', 'Be alert', 27],
    ],
  );
  // The official hexes are the state's signal and are never repainted.
  assert.equal(VIGILANCE_LEVELS[4].color, '#e71919');
});

test('the label still carries the WORD, because the colour cannot be trusted', () => {
  // #f9ff00 washes out on a bright globe and orange against red is a common
  // colour-vision collision. An English reader must get the word too.
  const record = {
    name: 'Isère',
    level: VIGILANCE_LEVELS[4],
    phenomena: [
      { id: '2', name: 'Pluie-inondation', level: VIGILANCE_LEVELS[2] },
      { id: '8', name: 'Avalanches', level: VIGILANCE_LEVELS[4] },
    ],
  };
  assert.equal(vigilanceLabelText(record), 'Isère · RED · Avalanches');
  assert.equal(
    vigilanceLabelText({ name: 'Ain', level: VIGILANCE_LEVELS[2], phenomena: [] }),
    'Ain · YELLOW',
  );
});

test('the nine phenomena are named, and a tenth would be numbered', () => {
  assert.deepEqual(
    ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(vigilancePhenomenonName),
    [
      'High wind', 'Rain and flooding', 'Thunderstorms', 'River flooding',
      'Snow and ice', 'Heatwave', 'Extreme cold', 'Avalanches',
      'Waves and marine flooding',
    ],
  );
  assert.equal(vigilancePhenomenonName('11'), 'Phenomenon 11');
  assert.equal(withLocale('fr', () => vigilancePhenomenonName('11')), 'Phénomène 11');
});

test('a département the bulletin skipped says so, and is never green', () => {
  assert.equal(VIGILANCE_UNKNOWN_LEVEL.label, 'UNKNOWN');
  assert.equal(VIGILANCE_UNKNOWN_LEVEL.meaning, 'Level not published');
  assert.equal(VIGILANCE_UNKNOWN_LEVEL.level, null);
  assertNoFrench([VIGILANCE_UNKNOWN_LEVEL.label, VIGILANCE_UNKNOWN_LEVEL.meaning]);
});

test('the French phenomenon table has not drifted from the feed’s own', () => {
  // The feed owns the nine names and is not bilingual yet; this table carries
  // its French beside the English so the day the feed moves, a test fails.
  for (const [id, name] of Object.entries(VIGILANCE_PHENOMENA)) {
    assert.equal(VIGILANCE_PHENOMENON_NAMES('fr')[id], name, `phenomenon ${id} drifted`);
  }
  assert.equal(
    Object.keys(VIGILANCE_PHENOMENON_NAMES.definition).length,
    Object.keys(VIGILANCE_PHENOMENA).length,
  );
});

test('French is untouched', () => {
  assert.deepEqual(
    withLocale('fr', () => vigilanceLevelLegend({ yellow: 2, orange: 1 })
      .map((entry) => [entry.label, entry.blurb])),
    [['ORANGE', 'Soyez très vigilant'], ['JAUNE', 'Soyez attentif']],
  );
});
