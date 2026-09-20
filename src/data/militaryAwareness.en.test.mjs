// The Context panel's four cohort names, in both languages.
//
// Upstream shipped them in English; a French page read four English words in
// the middle of a French panel. `src/ui.js` prints each one twice — upper-cased
// beside the nearest contact, and again as the row's caption — so each has to
// read as one word either way.
import test from 'node:test';
import assert from 'node:assert/strict';

import messages from './militaryAwareness.i18n.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

test('the four cohorts are named in both languages', () => {
  const en = withLocale('en', () => messages().cohorts);
  assert.deepEqual(
    [en.flights, en.military, en.vessels, en.installations],
    ['Flights', 'Military flights', 'AIS vessels', 'Mapped installations'],
  );
  const fr = messages().cohorts;
  assert.deepEqual(
    [fr.flights, fr.military, fr.vessels, fr.installations],
    ['Vols', 'Vols militaires', 'Navires AIS', 'Sites cartographiés'],
  );
  assertNoFrench([en.flights, en.military, en.vessels, en.installations]);
  // Each is one word or two: `ui.js` upper-cases them inline.
  for (const label of Object.values(fr)) assert.ok(label.split(' ').length <= 2, label);
});

test('HDG is HDG in a French cockpit too', () => {
  assert.equal(messages().heading('045'), 'HDG 045°');
  assert.equal(withLocale('en', () => messages().heading('045')), 'HDG 045°');
});
