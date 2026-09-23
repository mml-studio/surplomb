// The registry in English: the seven group headers, the sixty display names,
// the scope chips and the translated source lines, read through the real
// table. The same frozen objects answer in both languages — that is the
// property the getters exist for, and the last test here is the French one.
import test from 'node:test';
import assert from 'node:assert/strict';

import { LAYER_CATEGORIES, LAYER_TAXONOMY, coverageChip, layerTaxonomyFor } from './layerTaxonomy.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

/** Proper nouns an English label keeps, and which are not French text. */
const KEEP = ['Géorisques', 'Hub’Eau', "Hub'Eau", 'Vigicrues', 'IDFM', 'INSEE', 'Sitadel', 'Gironde', 'FIRMS', 'DPE'];

test('every group header is English', () => {
  const headers = withLocale('en', () => LAYER_CATEGORIES.map((entry) => entry.label));
  assert.deepEqual(headers, [
    'SKY & SEA',
    'BUILDINGS & LAND',
    'GROUND MOBILITY',
    'ENERGY',
    'RISKS & ENVIRONMENT',
    'NETWORKS & SENSORS',
    'PLUGGED DATASETS',
  ]);
  assertNoFrench(headers);
});

test('every layer has an English name, and none of them is French', () => {
  const labels = withLocale('en', () => LAYER_TAXONOMY.map((entry) => entry.label));
  assert.equal(labels.length, LAYER_TAXONOMY.length);
  for (const label of labels) assert.ok(label.trim().length > 0);
  assertNoFrench(labels, { allow: KEEP });
});

test('the names a reader recognises the fork by', () => {
  const label = (id) => withLocale('en', () => layerTaxonomyFor(id).label);
  assert.equal(label('dvf-sales'), 'Property prices');
  assert.equal(label('dpe-fr'), 'Energy rating (DPE)');
  assert.equal(label('urbanisme-gpu'), 'Planning');
  assert.equal(label('cadastre-fr'), 'Cadastral parcels');
  assert.equal(label('filosofi-fr'), 'Territory (INSEE 200 m grid)');
  assert.equal(label('amenities-fr'), 'Everyday amenities');
  assert.equal(label('medecins-fr'), 'Health & emergency services');
  assert.equal(label('vigicrues'), 'Rivers (Vigicrues)');
  assert.equal(label('gironde-megafire-2026'), 'Gironde · summer 2026');
  assert.equal(label('local-firms'), 'Fires');
  assert.equal(label('idfm-network'), 'IDFM network and frequency (Paris)');
  assert.equal(label('velo-pulse-fr'), 'Cycling pulse (typical week)');
  assert.equal(label('irve-fr'), 'EV charging stations');
});

test('the scope chip says CITIES in English and VILLES in French', () => {
  assert.equal(withLocale('en', () => coverageChip('cities')), 'CITIES');
  assert.equal(coverageChip('cities'), 'VILLES');
  // FR and US are the same badge in both languages: they are country codes.
  assert.equal(withLocale('en', () => coverageChip('fr')), 'FR');
  assert.equal(withLocale('en', () => coverageChip('global')), null);
  assert.equal(withLocale('en', () => layerTaxonomyFor('bikeshare').scopeChip), 'CITIES');
});

test('a source line written in French words is English on an English page', () => {
  const source = (id) => withLocale('en', () => layerTaxonomyFor(id).sourceLabel);
  assert.equal(source('cadastre-fr'), 'IGN Api Carto — PCI vector cadastre');
  assert.equal(source('dpe-fr'), 'ADEME — DPE observatory');
  assert.equal(source('isochrone-fr'),
    'IGN Géoplateforme (BD TOPO®) · OpenStreetMap / OSRM for cycling');
  assert.equal(source('fraicheur-fr'),
    'Cool islands, cool green spaces and fountains — Ville de Paris & Eau de Paris (opendata.paris.fr)');
  // The publisher keeps its French name inside the English line.
  assert.equal(source('delinquance-fr'), 'Recorded crime — SSMSI (ministère de l’Intérieur)');
});

test('the same frozen table still answers in French', () => {
  assert.equal(layerTaxonomyFor('dvf-sales').label, 'Prix de l’immobilier');
  assert.equal(layerTaxonomyFor('vigicrues').label, "Cours d'eau");
  assert.equal(LAYER_CATEGORIES[0].label, 'CIEL & MER');
  assert.equal(layerTaxonomyFor('cadastre-fr').sourceLabel, 'IGN Api Carto — cadastre PCI vecteur');
});
