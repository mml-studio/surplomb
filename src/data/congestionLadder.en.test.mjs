// The shared congestion ladder in both languages. The rungs are one
// vocabulary read by two layers on one fused row, so what matters here is that
// ONE loaded ladder answers in whichever language the page is in — the labels
// are getters, not constants frozen at import.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONGESTION_RUNGS, CONGESTION_RUNG_ORDER, congestionLabel, congestionColor } from './congestionLadder.js';
import { ROAD_STATUS_LEVELS, roadStatusStyle, formatFlow } from './datexRoadStatus.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

test('the four rungs, in English', () => {
  const words = withLocale('en', () => CONGESTION_RUNG_ORDER.map((rung) => congestionLabel(rung)));
  assertNoFrench(words);
  assert.deepEqual(words, ['Free-flowing', 'Slow', 'Jammed', 'Impassable']);
});

test('the same ladder, a moment later, in French', () => {
  const words = withLocale('fr', () => CONGESTION_RUNG_ORDER.map((rung) => congestionLabel(rung)));
  assert.deepEqual(words, ['Fluide', 'Ralenti', 'Bloqué', 'Impraticable']);
  // The ink does not move with the language.
  assert.equal(congestionColor('jam'), '#e05252');
  assert.equal(CONGESTION_RUNGS.jam.rank, 2);
});

test('the declared DATEX states read from the ladder, and the state nobody measured', () => {
  const en = withLocale('en', () => ({
    free: ROAD_STATUS_LEVELS.freeFlow.label,
    heavy: ROAD_STATUS_LEVELS.heavy.label,
    congested: ROAD_STATUS_LEVELS.congested.label,
    impossible: ROAD_STATUS_LEVELS.impossible.label,
    unknown: roadStatusStyle('nothing-like-this').label,
  }));
  assertNoFrench(en);
  assert.deepEqual(en, {
    free: 'Free-flowing',
    heavy: 'Slow',
    congested: 'Jammed',
    impossible: 'Impassable',
    unknown: 'Not reported',
  });
  assert.equal(withLocale('fr', () => roadStatusStyle('unknown').label), 'Non communiqué');
});

test('an hourly flow keeps its ASCII space in French and reads US English in English', () => {
  assert.equal(withLocale('fr', () => formatFlow(1350)), '1 350 véh/h');
  assert.equal(withLocale('en', () => formatFlow(1350)), '1,350 veh/h');
  assert.equal(withLocale('en', () => formatFlow(0)), '0 veh/h');
  assert.equal(withLocale('en', () => formatFlow(null)), null);
});
