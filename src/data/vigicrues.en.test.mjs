// Rivers (Vigicrues) in English. Its French stays pinned by
// vigicrues.test.mjs, untouched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  VIGICRUES_LEVELS,
  VIGICRUES_UNKNOWN_LEVEL,
  vigicruesLevelLegend,
} from './vigicrues.js';
import { assertNoFrench, useTestLocale, withLocale } from '../i18n/testing.js';

useTestLocale('en');

test('the key spells out each level and repeats the service’s own sentence', () => {
  assert.deepEqual(
    vigicruesLevelLegend({ green: 337, yellow: 4, orange: 2, red: 1 })
      .map((entry) => [entry.label, entry.blurb, entry.count]),
    [
      ['RED', 'Risk of major flooding — a direct and widespread threat', 1],
      ['ORANGE', 'Risk of flooding that causes major overflow', 2],
      ['YELLOW', 'Risk of flooding, or of a rapid and dangerous rise in water levels', 4],
      ['NO WARNING', 'No particular vigilance required', 337],
    ],
  );
  assertNoFrench(vigicruesLevelLegend({ green: 1, yellow: 1, orange: 1, red: 1 }));
});

test('the calm row is named for what it is, not for its colour', () => {
  // Level 1 is drawn as water, not as green, so its key row spells the level
  // out instead of printing a colour word beside a cyan line.
  const [calm] = vigicruesLevelLegend({ green: 337 });
  assert.equal(calm.label, 'NO WARNING');
  assert.equal(calm.color, '#25e2ff');
  // The colour WORD still travels to the analyst engine and to every entity.
  assert.equal(VIGICRUES_LEVELS[1].label, 'GREEN');
  // And the state's own swatch is untouched on every level.
  assert.equal(VIGICRUES_LEVELS[1].color, '#009245');
  assert.equal(VIGICRUES_LEVELS[4].color, '#ff0000');
});

test('a reach with no published assessment says so, and is never green', () => {
  assert.equal(VIGICRUES_UNKNOWN_LEVEL.label, 'UNKNOWN');
  assert.equal(VIGICRUES_UNKNOWN_LEVEL.meaning, 'Level not published');
  assert.equal(VIGICRUES_UNKNOWN_LEVEL.level, null);
});

test('French is untouched', () => {
  assert.deepEqual(
    withLocale('fr', () => vigicruesLevelLegend({ green: 337, red: 1 })
      .map((entry) => [entry.label, entry.blurb])),
    [
      ['ROUGE', 'Risque de crue majeure — menace directe et généralisée'],
      ['SANS VIGILANCE', 'Pas de vigilance particulière requise'],
    ],
  );
  assert.equal(withLocale('fr', () => VIGICRUES_LEVELS[1].label), 'VERT');
});
