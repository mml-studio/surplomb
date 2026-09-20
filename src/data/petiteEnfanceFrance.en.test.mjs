// The childcare layer in English: the card of a territory, the diverging key
// and the status line, read through the real module.
//
// Two misreadings are one careless word away in English and this file pins
// both shut. The number is PLACES PER 100 CHILDREN under three, not a
// percentage — an area with more places than children legitimately passes 100
// — and the layer counts places, never daycare centers, because nothing in
// French open data is a register of them.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPeDepartementLabel,
  buildPeLoadingLabel,
  buildPeSelectionLabel,
  createPeDepartementOverlayEntry,
  peBandLabel,
  peBandRangeLabels,
  _clearPeSelectionForTest,
  _peRowControlsForTest,
  _setPeStateForTest,
} from './petiteEnfanceFrance.js';
import { PE_BANDS, PE_MODES, peModeLabel, peModeShortLabel, peScaleLabel } from './petiteEnfanceFeed.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

/** What the CNAF and Etalab publish rides through an English card as published. */
const NAMES = ['CC DE LA VEYLE', 'AIN', 'AUVERGNE RHONE ALPES', 'Jura'];

const area = (over = {}) => ({
  id: 'epci:200070555',
  scale: 'epci',
  code: '200070555',
  name: 'CC DE LA VEYLE',
  rate: 89.7,
  band: 'haut',
  ratio: 1.473,
  modes: { psu: 6.2, horsPsu: 3.1, prescol: 4.4, am: 74.2, gad: 1.8 },
  subtotals: { collectif: 9.3, individuel: 76 },
  dominant: 'am',
  places: { psu: 60, horsPsu: 30, prescol: 42, am: 715, gad: 17 },
  totalPlaces: 864,
  deptName: 'AIN',
  region: 'AUVERGNE RHONE ALPES',
  lat: 46.2,
  lon: 4.98,
  ...over,
});

const record = (over = {}) => ({
  id: 'epci:200070555', area: area(over.area), national: 60.9, year: 2023, ...over,
});

test.afterEach(() => { _clearPeSelectionForTest(); });

// --- The vocabulary ----------------------------------------------------------

test('the three scales and the six bands have English names', () => {
  const scales = withLocale('en', () => ['dep', 'epci', 'com'].map(peScaleLabel));
  assert.deepEqual(scales, ['Department', 'Intercommunality (EPCI)', 'Municipality']);
  const bands = withLocale('en', () => PE_BANDS.map(peBandLabel));
  assert.deepEqual(bands, ['Far below average', 'Below', 'Slightly below average',
    'Slightly above', 'Above', 'Far above average']);
  assertNoFrench([...scales, ...bands]);
  // An area with no published rate is not a band and never reads as one.
  assert.equal(withLocale('en', () => peBandLabel(null)), 'Rate not published');
});

test('the five funding channels keep their French scheme names, glossed', () => {
  const long = withLocale('en', () => PE_MODES.map(peModeLabel));
  const short = withLocale('en', () => PE_MODES.map(peModeShortLabel));
  assert.deepEqual(long, [
    'Daycare (EAJE funded by the PSU)',
    'Daycare outside the PSU (Paje micro-daycare)',
    'Preschool enrollment (before age 3)',
    'Childminder',
    'In-home childcare',
  ]);
  assert.deepEqual(short,
    ['PSU daycare', 'micro-daycare', 'preschool', 'childminder', 'in-home childcare']);
  // The acronyms are the names of French schemes and are never invented anew:
  // a reader has to be able to find the figure in the CNAF's own file.
  assertNoFrench([...long, ...short], { allow: ['EAJE', 'PSU', 'Paje'] });
});

// --- The card of one territory -----------------------------------------------

test('the English card names the scale first, then the rate and its comparison', () => {
  const copy = withLocale('en', () => buildPeSelectionLabel(record()));
  assertNoFrench(copy, { allow: NAMES });
  const lines = copy.split('\n');
  assert.equal(lines[0], 'CC DE LA VEYLE');
  assert.equal(lines[1], 'Intercommunality (EPCI) · 2023 vintage');
  assert.equal(lines[2],
    '89.7 places per 100 children under three — 47% above the national average (60.9)');
  // Places, never a percentage of anything.
  assert.equal(/89\.7%/.test(copy), false);
});

test('an area below France says below, and one level with it says level', () => {
  const low = withLocale('en',
    () => buildPeSelectionLabel(record({ area: area({ rate: 30.5, band: 'bas' }) })));
  assert.match(low, /^30\.5 places per 100 children under three — 50% below the national average \(60\.9\)$/m);
  const level = withLocale('en',
    () => buildPeSelectionLabel(record({ area: area({ rate: 60.9 }) })));
  assert.match(level, /— level with the national average$/m);
});

test('an area with no published rate says so instead of showing a zero', () => {
  const copy = withLocale('en',
    () => buildPeSelectionLabel(record({ area: area({ rate: null, band: null }) })));
  assert.match(copy, /^Rate not published for this area$/m);
  assert.equal(/0\.0 places/.test(copy), false);
});

test('the breakdown lists the five channels with their places, largest first', () => {
  const copy = withLocale('en', () => buildPeSelectionLabel(record()));
  assert.match(copy, /^Childminder: 74\.2 · 715 places$/m);
  assert.match(copy, /^Daycare \(EAJE funded by the PSU\): 6\.2 · 60 places$/m);
  assert.match(copy, /^864 formal childcare places in total$/m);
  assert.match(copy, /^Main provider: childminder$/m);
});

test('the two scale caveats read in English, each on its own scale', () => {
  const epci = withLocale('en', () => buildPeSelectionLabel(record()));
  assert.match(epci, /^Territory drawn as its member municipalities, under one color — /m);
  assert.match(epci, /geo\.api\.gouv\.fr publishes no EPCI outline$/m);

  const commune = withLocale('en', () => buildPeSelectionLabel(record({
    area: area({ scale: 'com', code: '01053' }),
    simplified: true,
  })));
  assert.match(commune,
    /^⚠ The municipal scale is published only for municipalities over 10,000 residents$/m);
  assert.match(commune, /^Municipal outline simplified$/m);
  assert.match(commune, /^Code 01053$/m);
});

// --- The département regime ---------------------------------------------------

test('the département card and its ambient label read in English', () => {
  const row = area({
    scale: 'dep', code: '39', name: 'Jura', rate: 69.7, ratio: 1.144, deptName: 'JURA',
  });
  const card = withLocale('en', () => buildPeDepartementLabel(row, 60.9));
  assertNoFrench(card, { allow: NAMES });
  assert.match(card, /^Jura\n/);
  assert.match(card, /^69\.7 places per 100 children under three — 14% above the national average \(60\.9\)$/m);
  assert.match(card, /^864 formal childcare places$/m);

  const label = withLocale('en', () => createPeDepartementOverlayEntry(row, null));
  assert.equal(label.title, 'Jura · 69.7');
});

// --- The key -------------------------------------------------------------------

test('the key is labelled in places, and its bounds move with the edition', () => {
  const labels = withLocale('en', () => peBandRangeLabels(60.9));
  assert.deepEqual(labels, ['< 37', '37–52', '52–61', '61–70', '70–85', '> 85']);
  // With no national rate yet, the bounds are stated as ratios instead.
  const ratios = withLocale('en', () => peBandRangeLabels(null));
  assert.deepEqual(ratios, ['< 60%', '60%–85%', '85%–100%', '100%–115%', '115%–140%', '> 140%']);
  assertNoFrench([...labels, ...ratios]);
});

test('the legend row carries its unit and the blurb that explains its class', () => {
  _setPeStateForTest({
    regime: 'national',
    national: {
      departements: [
        { code: '39', band: 'haut' },
        { code: '973', band: 'tres-bas' },
      ],
      national: 60.9,
    },
  });
  const row = withLocale('en', () => _peRowControlsForTest());
  assertNoFrench(row);
  assert.deepEqual(row.legend.map((entry) => entry.label),
    ['< 37 places / 100 children', '70–85 places / 100 children']);
  assert.equal(row.legend[0].blurb, 'Less than 60% of the national average. No mainland '
    + 'department is in this class — every one of them is overseas.');
  assert.match(row.legend[1].blurb, /^Between 115 and 140% of the average\./);
});

// --- The status line ------------------------------------------------------------

test('the status line names the scale it drew, and the two silences it can have', () => {
  const nationalLine = withLocale('en', () => buildPeLoadingLabel({
    regime: 'national',
    status: 'ready',
    loading: false,
    national: { painted: 96, national: 60.9, unpainted: ['971', '972', '973', '974', '976'] },
  }));
  assertNoFrench(nationalLine);
  assert.equal(nationalLine, '96 departments · national average 60.9 places / 100 children · '
    + '5 overseas territories not mapped, every one below the average');

  const localLine = withLocale('en', () => buildPeLoadingLabel({
    regime: 'local',
    status: 'ready',
    loading: false,
    count: 60,
    inView: 60,
    communes: 18,
    unpainted: 140,
    dropped: 212,
  }));
  assert.equal(localLine, '42 intercommunalities · 18 municipalities · '
    + '140 municipalities with no published rate · 212 outlines beyond the cap');
});

test('each regime names what it is waiting for, and an empty view says so', () => {
  const waits = withLocale('en', () => [
    buildPeLoadingLabel({ regime: 'national', loading: true }),
    buildPeLoadingLabel({ regime: 'local', loading: true }),
    buildPeLoadingLabel({ regime: 'local', loading: false, status: 'ready', inView: 0 }),
  ]);
  assertNoFrench(waits);
  assert.deepEqual(waits, [
    'reading the national register...',
    'reading the municipal outlines...',
    'no area in this view',
  ]);
});

// --- Both languages, one loaded layer --------------------------------------------

test('one loaded module answers in either language, from the same record', () => {
  const one = record();
  assert.match(buildPeSelectionLabel(one), /^Intercommunalité · millésime 2023$/m);
  assert.match(withLocale('en', () => buildPeSelectionLabel(one)),
    /^Intercommunality \(EPCI\) · 2023 vintage$/m);
});
