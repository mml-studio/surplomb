// The rent map's labels in both languages.
//
// This module is composed on a server with no locale, so the shape of the
// answer is the one `rnbPivot.js` set: the payload keeps the French it has
// always published, and a browser relabels the stable key beside it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertNoFrench, withLocale } from '../i18n/testing.js';
import {
  LOYERS_BASIS,
  LOYERS_OBSERVATION_SOURCE,
  LOYERS_REFERENCE_PERIOD,
  LOYERS_SEGMENTS,
  loyersBasisLabel,
  loyersSegmentLabel,
} from './loyersFeed.js';
import messages, { BASIS, SEGMENTS } from './loyersFeed.i18n.js';

test('the payload keeps the French the ministry’s model is published with', () => {
  assert.deepEqual(LOYERS_SEGMENTS.map((segment) => segment.label),
    ['Appartement', 'Appartement T1-T2', 'Appartement T3 et plus', 'Maison']);
  assert.equal(LOYERS_BASIS.maille.label, 'repris d’une maille de communes voisines');
  assert.equal(LOYERS_OBSERVATION_SOURCE, 'annonces leboncoin et Groupe SeLoger, 2019-2025');
  assert.equal(LOYERS_REFERENCE_PERIOD, '3ᵉ trimestre 2025');
  // And they are the catalog's own French, so the two cannot drift.
  for (const segment of LOYERS_SEGMENTS) {
    assert.equal(segment.label, SEGMENTS('fr')[segment.key]);
  }
  for (const [key, basis] of Object.entries(LOYERS_BASIS)) {
    assert.equal(basis.label, BASIS('fr')[key]);
  }
});

test('a browser relabels the segment and the basis by their key', () => {
  const en = withLocale('en', () => ({
    segments: LOYERS_SEGMENTS.map((segment) => loyersSegmentLabel(segment.key)),
    basis: Object.keys(LOYERS_BASIS).map((key) => loyersBasisLabel(key)),
    undocumented: loyersBasisLabel('xx'),
    source: messages().observationSource,
    period: messages().referencePeriod,
  }));
  assertNoFrench(en, { allow: ['leboncoin', 'Groupe SeLoger'] });
  assert.deepEqual(en.segments,
    ['Apartment', 'Apartment, 1–2 rooms', 'Apartment, 3 rooms and over', 'House']);
  assert.deepEqual(en.basis, ['estimated on the municipality',
    'taken from a mesh of neighboring municipalities', 'taken from the intercommunality (EPCI)']);
  assert.equal(en.undocumented, 'undocumented basis “xx”');
  assert.equal(en.source, 'leboncoin and Groupe SeLoger listings, 2019-2025');
  assert.equal(en.period, 'Q3 2025');
  // In French the helpers print exactly what the payload carries.
  assert.equal(withLocale('fr', () => loyersSegmentLabel('app12')), 'Appartement T1-T2');
  assert.equal(withLocale('fr', () => loyersBasisLabel('epci')), 'repris de l’intercommunalité');
  assert.equal(withLocale('fr', () => loyersBasisLabel('xx')), 'base « xx » non documentée');
});
