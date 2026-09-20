// The two amenity tables a reader meets, in English.
//
// A blurb is an argument, not a description: it names the BPE or FINESS codes
// the family is made of, how many rows each contributes, and what was left out
// on purpose. Every figure is measured on the 2025 edition, so the English
// carries the same figures — grouped the English way and with an English
// decimal point.
import test from 'node:test';
import assert from 'node:assert/strict';

import { AMENITY_FAMILIES, AMENITY_PRECISIONS, amenityFamilyBlurb, amenityPrecisionLabel } from './amenitiesFeed.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

test('every family has an English blurb, and it keeps the measured figures', () => {
  const english = withLocale('en', () => AMENITY_FAMILIES.map((family) => amenityFamilyBlurb(family)));
  assert.equal(english.length, 14);
  assertNoFrench(english, {
    allow: ['gendarmerie', 'Pharmacie d’Officine'],
  });
  const restaurant = withLocale('en', () => amenityFamilyBlurb('restaurant'));
  assert.match(restaurant, /BPE A504/);
  assert.match(restaurant, /231,989 rows/);
  const hospital = withLocale('en', () => amenityFamilyBlurb('hopital'));
  assert.match(hospital, /78\.8% of them are within 200 m/);
  assert.match(amenityFamilyBlurb('hopital'), /78,8 % d’entre elles/);
});

test('a family nobody names falls back to its key', () => {
  assert.equal(withLocale('en', () => amenityFamilyBlurb('ecole')), 'ecole');
});

test('the four precision bands read as English, and keep their four distinctions', () => {
  const english = withLocale('en', () => AMENITY_PRECISIONS.map((band) => amenityPrecisionLabel(band)));
  assert.deepEqual(english, [
    'Precision not published',
    'Probable street',
    'Placed along the street',
    'Street number found on a certain street',
  ]);
  assert.equal(new Set(english).size, 4);
  assertNoFrench(english);
  assert.equal(amenityPrecisionLabel('numero'), 'Numéro trouvé dans une voie sûre');
});
