// The satellite classes in both languages. The layer arrived from upstream
// with English-only prose; satelliteClass.test.mjs still pins the labels,
// which are deliberately the same word in French and in English.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SATELLITE_CLASSES,
  SATELLITE_CLASS_ORDER,
  satelliteClassLabel,
  satelliteClassLegend,
  tallySatelliteClasses,
} from './satelliteClass.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

const legend = () => satelliteClassLegend(
  tallySatelliteClasses(['stations', 'gps-ops', 'geo', 'visual', 'dense']),
);

test('the English legend glosses every class and carries no French', () => {
  const rows = withLocale('en', legend);
  assert.deepEqual(rows.map((row) => row.label),
    ['STATION', 'NAV', 'GEO', 'VISUAL', 'STARLINK']);
  assert.equal(rows[0].blurb, 'Crewed stations and their visiting vehicles');
  assert.equal(rows[2].blurb, 'Geostationary belt — comms and weather, fixed over the equator');
  assertNoFrench(rows.map((row) => row.blurb), { allow: ['visual'] });
});

test('the French legend finally reads in French, and keeps the same chips', () => {
  const rows = withLocale('fr', legend);
  assert.deepEqual(rows.map((row) => row.label),
    ['STATION', 'NAV', 'GEO', 'VISUAL', 'STARLINK']);
  assert.equal(rows[0].blurb, 'Stations habitées et leurs véhicules de desserte');
  assert.equal(rows[1].blurb, 'Navigation GNSS — GPS, GLONASS, Galileo');
  assert.match(rows[4].blurb, /^Constellation haut débit Starlink/);
});

test('a card label is the same token in both languages', () => {
  for (const locale of ['fr', 'en']) {
    assert.equal(withLocale(locale, () => satelliteClassLabel('gps-ops')), 'NAV · GPS');
    assert.equal(
      withLocale(locale, () => satelliteClassLabel('stations', { isIss: true })),
      'STATION · ISS',
    );
  }
});

test('every class carries a gloss in both languages', () => {
  for (const locale of ['fr', 'en']) {
    for (const klass of SATELLITE_CLASS_ORDER) {
      const spec = withLocale(locale, () => ({
        label: SATELLITE_CLASSES[klass].label,
        blurb: SATELLITE_CLASSES[klass].blurb,
      }));
      assert.ok(spec.label.length > 0, `${klass} has no label in ${locale}`);
      assert.ok(spec.blurb.length > 0, `${klass} has no gloss in ${locale}`);
    }
  }
});
