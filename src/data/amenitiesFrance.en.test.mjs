// What the Everyday amenities layer claims, in English.
//
// The property the French suite pins runs unchanged here: nothing on this map
// may be read back as a quantity neither register publishes, and the refusals
// stay visible. A thinned view still prints BOTH numbers, the choropleth still
// states the five families its share is computed on, and a vaguely-placed dot
// still looks different from one placed at a street number.
import test from 'node:test';
import assert from 'node:assert/strict';

import amenitiesFranceLayer, {
  buildAmenitiesDepartementLabel,
  buildAmenitiesLoadingLabel,
  buildAmenitySelectionLabel,
  _amenitiesRowControlsForTest,
  _setAmenitiesStateForTest,
} from './amenitiesFrance.js';
import { amenitiesDepartementBinLabels } from './amenitiesDepartements.js';
import { assertNoFrench, useTestLocale, withLocale } from '../i18n/testing.js';

const norm = (value) => String(value).replace(/[\s  ]+/g, ' ');

const record = (site = {}) => ({
  id: 'a:0:48.83801,2.34276',
  site: {
    id: 'a:0:48.83801,2.34276',
    family: 'medecin',
    register: 'bpe',
    lat: 48.83801,
    lon: 2.34276,
    precision: 'numero',
    count: 1,
    names: ['NADJIBA GALOUL, MÉDECIN'],
    moreNames: 0,
    unnamed: 0,
    kinds: ['Médecin généraliste'],
    commune: 'PARIS 14',
    ...site,
  },
});

test('a card with 146 practitioners at one address says so in English', () => {
  const label = withLocale('en', () => buildAmenitySelectionLabel(record({
    count: 146,
    names: ['A, MÉDECIN', 'B, MÉDECIN'],
    moreNames: 144,
    unnamed: 2,
  })));
  assert.match(norm(label), /146 general practitioners at this address/);
  assert.match(norm(label), /· and 144 more/);
  assert.match(norm(label), /· 2 with no published business name/);
  // The names and the register's own words are data and stay as published.
  assert.match(label, /A, MÉDECIN/);
  assert.match(label, /Médecin généraliste/);
});

test('the three lines that stop a dot misleading are all in English', () => {
  const vague = withLocale('en', () => buildAmenitySelectionLabel(record({ precision: 'approchee' })));
  assert.match(vague, /⚠ Position: Probable street/);
  const exact = withLocale('en', () => buildAmenitySelectionLabel(record()));
  assert.match(exact, /Position: Street number found on a certain street/);
  assert.match(exact, /Permanent database of amenities \(BPE\) 2025 — Insee/);
  const finess = withLocale('en', () => buildAmenitySelectionLabel(record({
    register: 'finess', finess: ['010000024'], crs: 'EPSG:5490', score: 96, geocoder: 'ATLASANTE',
  })));
  assert.match(finess, /Geocoding ATLASANTE — score 96\/100/);
  assert.match(finess, /Coordinates reprojected from EPSG:5490/);
  assert.match(finess, /FINESS — ARS \/ Agence du Numérique en Santé/);
});

test('a mesh dot still says it is a sample of itself', () => {
  const label = withLocale('en', () => buildAmenitySelectionLabel({ ...record(), mesh: true }));
  assert.match(label, /Mesh point — zoom in for the full card/);
  assert.equal(/at this address/.test(label), false);
});

test('the department card keeps the ratio and its blind spot', () => {
  const label = withLocale('en', () => buildAmenitiesDepartementLabel({
    code: '32',
    name: 'Gers',
    share: 21.6,
    covered: 99,
    communes: 458,
    amenities: 380,
    families: { medecin: 47, courses: 80, hopital: 0 },
    bin: 0,
  }));
  assert.match(norm(label), /21\.6% of municipalities served — 99 of 458/);
  assert.match(norm(label), /380 amenities drawn/);
  assert.match(norm(label), /· 47 general practitioners/);
  assert.equal(/hospitals/.test(label), false, 'a family with zero is not listed as a zero');
  assert.match(label, /FINESS publishes no municipality code/);
  assertNoFrench(label, { allow: ['Gers'] });
});

test('the three status regimes each keep their own admission', () => {
  const en = (state) => norm(withLocale('en', () => buildAmenitiesLoadingLabel(state)));
  assert.equal(
    en({
      regime: 'national',
      status: 'ready',
      loading: false,
      national: { nationalShare: 43.7, communesPlaced: 34778, assigned: 92725, painted: 96, unassigned: 2681 },
    }),
    '43.7% of 34,778 municipalities served · 92,725 amenities across 96 departments '
      + '· 2,681 outside mainland France, not painted',
  );
  assert.equal(
    en({
      regime: 'maillage',
      status: 'ready',
      loading: false,
      meshPick: { picked: new Array(1100), inBox: 92748, thinned: true },
    }),
    '1,100 drawn of 92,748 in view — sampled per family',
  );
  assert.equal(
    en({ regime: 'maillage', status: 'ready', loading: false, meshPick: { picked: new Array(12), inBox: 12, thinned: false } }),
    '12 amenities in view',
  );
  assert.equal(
    en({ regime: 'sites', status: 'ready', loading: false, count: 12000, summary: { rows: 67900, capped: 41121 } }),
    '12,000 amenities · 67,900 register rows · 41,121 beyond the answer’s cap — zoom out for the mesh',
  );
  assert.equal(en({ regime: 'sites', status: 'empty', loading: false, count: 0 }), 'no amenity in this view');
  assert.equal(en({ regime: 'national', loading: true }), 'reading the national register...');
});

test('the choropleth ramp reads as English percentages', () => {
  const english = withLocale('en', () => amenitiesDepartementBinLabels([31, 45.2], 21.6));
  assert.deepEqual(english, ['21.6 – 31%', '31 – 45.2%', '> 45.2%']);
  assert.deepEqual(amenitiesDepartementBinLabels([31, 45.2], 21.6),
    ['21,6 – 31 %', '31 – 45,2 %', '> 45,2 %']);
  assertNoFrench(english);
});

test('the legend rows are English, and the two refusals still say where to look', (t) => {
  useTestLocale('en', t);
  _setAmenitiesStateForTest({
    regime: 'maillage',
    records: new Map([['a', { ...record(), id: 'a' }], ['b', { ...record({ family: 'piscine' }), id: 'b' }]]),
    meshPick: {
      picked: [],
      inBox: 92748,
      thinned: true,
      perFamily: [{ family: 'piscine', inBox: 2100, kept: 39 }],
    },
  });
  const { chips, legend } = _amenitiesRowControlsForTest();
  assert.equal(chips.length, 0, 'no filter is on, so no chip');

  const pool = legend.find((row) => row.label === 'Swimming pool');
  assert.match(norm(pool.blurb), /Sample: 1 drawn of 2,100 in view\./);
  assert.match(pool.blurb, /^BPE F101\./);

  const hospitals = legend.find((row) => /Hospitals/.test(row.label));
  assert.equal(hospitals.color, null);
  assert.match(hospitals.label, /Hospitals — drawn by Health & emergency services/);
  assert.match(hospitals.blurb, /A hospital is not an everyday errand\./);

  const schools = legend.at(-1);
  assert.match(schools.label, /Schools — not drawn here/);
  assert.match(schools.blurb, /79,743 “education” rows/);
  assert.match(schools.blurb, /schools-fr/);

  assertNoFrench(legend.map((row) => [row.label, row.blurb]),
    { allow: ['La Poste', 'Gendarmerie', 'gendarmerie', 'Pharmacie d’Officine', 'Agence du Numérique en Santé'] });
});

test('a family switched off says how to switch it back on', (t) => {
  useTestLocale('en', t);
  _setAmenitiesStateForTest({ regime: 'sites', enabled: false, records: new Map() });
  amenitiesFranceLayer.setParams({ basculer: 'piscine' });
  const { chips, legend } = _amenitiesRowControlsForTest();
  const pool = legend.find((row) => row.label === 'Swimming pool');
  assert.equal(pool.off, true);
  assert.equal(pool.blurb,
    'Switched off. Click to switch it back on — the view is then requested again with this family.');
  assert.equal(chips[0].label, 'All');
  assert.equal(chips[0].title, 'Draw all 13 families again');
  amenitiesFranceLayer.setParams({ familles: '' });
});
