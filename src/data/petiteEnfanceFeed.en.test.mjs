// The CNAF's childcare files in English: the three scales, the five funding
// channels and the six bands.
//
// The module itself is read by the server (`vite.config.js` imports its
// projections), and this file pins what makes that safe: the projection
// carries the CNAF's own KEYS and not one word, so the same cached document
// is drawn in either language.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PE_BANDS,
  PE_MODES,
  PE_SCALES,
  peBandName,
  peModeLabel,
  peModeShortLabel,
  peScaleLabel,
  projectPeAreas,
} from './petiteEnfanceFeed.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

test('the three published scales have English names', () => {
  const labels = withLocale('en', () => PE_SCALES.map(peScaleLabel));
  assertNoFrench(labels, { allow: ['EPCI'] });
  assert.deepEqual(labels, ['Department', 'Intercommunality (EPCI)', 'Municipality']);
  assert.equal(withLocale('en', () => peScaleLabel('nope')), null);
});

test('the six bands are stated against France, not against the screen', () => {
  const labels = withLocale('en', () => PE_BANDS.map(peBandName));
  assertNoFrench(labels);
  assert.deepEqual(labels, ['Far below average', 'Below', 'Slightly below average',
    'Slightly above', 'Above', 'Far above average']);
  // An area with no rate has no band, and the caller decides what to say.
  assert.equal(withLocale('en', () => peBandName(null)), null);
});

test('the five channels keep the French schemes that name them', () => {
  const long = withLocale('en', () => PE_MODES.map(peModeLabel));
  assertNoFrench(long, { allow: ['EAJE', 'PSU', 'Paje'] });
  assert.deepEqual(long, [
    'Daycare (EAJE funded by the PSU)',
    'Daycare outside the PSU (Paje micro-daycare)',
    'Preschool enrollment (before age 3)',
    'Childminder',
    'In-home childcare',
  ]);
  const short = withLocale('en', () => PE_MODES.map(peModeShortLabel));
  assertNoFrench(short, { allow: ['PSU'] });
  assert.deepEqual(short,
    ['PSU daycare', 'micro-daycare', 'preschool', 'childminder', 'in-home childcare']);
  assert.equal(withLocale('en', () => peModeLabel('nope')), null);
});

test('the projection publishes KEYS, so a cached payload is language-free', () => {
  const taux = [{
    numepci: '200070555',
    nomepci: 'CC DE LA VEYLE',
    txcouv_epci: 89.7,
    txcouv_am_ind_epci: 74.2,
    txcouv_psu_col_epci: 6.2,
    numdep: '01',
    nomdep: 'AIN',
  }];
  const french = projectPeAreas({ scale: 'epci', taux, national: 60.9, year: 2023 });
  const english = withLocale('en',
    () => projectPeAreas({ scale: 'epci', taux, national: 60.9, year: 2023 }));
  assert.deepEqual(english.areas, french.areas);
  assert.equal(french.areas[0].band, 'tres-haut');
  assert.equal(french.areas[0].dominant, 'am');
});
