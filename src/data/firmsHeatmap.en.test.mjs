// Active fires (FIRMS) in both languages. The layer arrived from upstream
// with English-only prose; firmsHeatmap.test.mjs still pins its behaviour.
//
// The vocabulary is the megafire's on purpose: two fire layers on one globe
// that named the same measurement two ways would read as two measurements.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSelectedFireCard } from './firmsHeatmap.js';
import megafireMessages from './girondeMegafire.i18n.js';
import { assertNoFrench, useTestLocale, withLocale } from '../i18n/testing.js';

const FIRE = {
  lat: 44.72, lon: -0.88, frp: 1520, confidence: 'high',
  sensor: 'VIIRS', acqMs: Date.parse('2026-07-24T09:05:00Z'), night: false,
};

useTestLocale('en');

test('one detection is named in both languages, with its FRP', () => {
  assert.equal(buildSelectedFireCard(FIRE, FIRE.acqMs).title, 'FIRE · 1520 MW');
  assert.equal(
    withLocale('fr', () => buildSelectedFireCard(FIRE, FIRE.acqMs).title),
    'FEU · 1520 MW',
  );
});

test('the French says “puissance radiative”, the word the megafire settled', () => {
  // `girondeMegafire.i18n.js` (#282) owns the fire vocabulary of this product.
  // If that layer ever renames the measurement, this fails rather than
  // letting two fire layers disagree on one globe.
  assert.match(megafireMessages('fr').legend.hotspotBlurb, /puissance radiative/);
  assert.match(megafireMessages('en').legend.hotspotBlurb, /radiative power/);
});

test('the English card carries no French, and the French one carries French', () => {
  const card = buildSelectedFireCard(FIRE, FIRE.acqMs);
  assertNoFrench([card.title, ...card.details], { allow: ['VIIRS', 'MODIS'] });
  const french = withLocale('fr', () => buildSelectedFireCard(FIRE, FIRE.acqMs));
  assert.match(french.title, /^FEU · /);
});
