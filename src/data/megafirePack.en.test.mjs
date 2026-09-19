// megafirePack in English: the step labels a reader sees come from the
// acquisition instant, in the page's language; the French `label` stored in
// the pack (and written into event.json) stays the data it is.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MEGAFIRE_STEPS, megafireStepLabel } from './megafirePack.js';
import { assertNoFrench, useTestLocale, withLocale } from '../i18n/testing.js';

const EVENT = JSON.parse(readFileSync(new URL('./local_data/gironde_megafire_2026/event.json', import.meta.url), 'utf8'));

test('in French, the displayed label IS the stored one, for the pack and for event.json', () => {
  for (const step of MEGAFIRE_STEPS) assert.equal(megafireStepLabel(Date.parse(step.acq)), step.label, step.id);
  for (const step of EVENT.steps) assert.equal(megafireStepLabel(Date.parse(step.acq)), step.label, step.id);
});

test('in English, a step reads month first, 24-hour clock, no French ordinal', (t) => {
  useTestLocale('en', t);
  assert.deepEqual(MEGAFIRE_STEPS.map((step) => megafireStepLabel(Date.parse(step.acq))), [
    'Jul 24 09:05', 'Jul 26 10:12', 'Jul 27 16:16', 'Jul 29 14:07', 'Aug 1 11:38',
  ]);
  assertNoFrench(MEGAFIRE_STEPS.map((step) => megafireStepLabel(Date.parse(step.acq))));
  // The data does not move: the stored label is still the French one.
  assert.equal(MEGAFIRE_STEPS[4].label, '1ᵉʳ août 11:38');
});

test('a non-finite instant is a dash in both languages', () => {
  assert.equal(megafireStepLabel(NaN), '—');
  assert.equal(withLocale('en', () => megafireStepLabel(undefined)), '—');
});
