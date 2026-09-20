// The fourteen amenity families, in English.
//
// One definition, read by two surfaces: the globe's cards (`amenitiesFrance`)
// and the Address X-ray (`adresseRadiographie`), which used to carry its own
// copy of this table with a drift test to keep the two honest. That copy is
// gone, so what this file pins is the vocabulary itself — heading and count
// head-word, which are not the same words.
import test from 'node:test';
import assert from 'node:assert/strict';

import { AMENITY_FAMILIES } from './amenitiesFeed.js';
import { amenityFamilyLabel, amenityFamilyPlural } from './amenitiesFamilies.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

test('every family has a heading and a count head-word in English', () => {
  const english = withLocale('en', () => AMENITY_FAMILIES.map((family) => [
    family, amenityFamilyLabel(family), amenityFamilyPlural(family),
  ]));
  assert.equal(english.length, 14);
  for (const [family, label, plural] of english) {
    assert.notEqual(label, family, `${family} has no English heading`);
    assert.notEqual(plural, family, `${family} has no English head-word`);
  }
  // The family KEYS are data (`poste`, `courses`) and stay out of the sweep.
  // La Poste is the company, not a post office, and the gendarmerie is a force.
  assertNoFrench(english.map(([, label, plural]) => [label, plural]),
    { allow: ['La Poste', 'Gendarmerie', 'gendarmerie'] });
});

test('the heading and the head-word are different words, in both languages', () => {
  assert.equal(withLocale('en', () => amenityFamilyLabel('courses')), 'Supermarket, convenience store');
  assert.equal(withLocale('en', () => amenityFamilyPlural('courses')), 'food stores');
  assert.equal(amenityFamilyLabel('courses'), 'Supermarché, supérette');
  assert.equal(amenityFamilyPlural('courses'), 'commerces alimentaires');
});

test('a family nobody names falls back to its key, not to a blank', () => {
  assert.equal(withLocale('en', () => amenityFamilyLabel('ecole')), 'ecole');
  assert.equal(withLocale('en', () => amenityFamilyPlural('ecole')), 'ecole');
  assert.equal(amenityFamilyLabel(''), '');
});
