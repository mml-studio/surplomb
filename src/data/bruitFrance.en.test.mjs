// Airport noise (PEB/PGS) in English, through the real projection of the real
// captured probes — the same payloads bruitFrance.test.mjs pins in French.
//
// What is checked here is not "no French left": it is that the three things
// this layer refuses to lose survive the translation — WHICH zone was chosen
// and what it beat, the difference between an empty answer and a silent
// service, and the warning that a pre-2002 number is not decibels.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { projectBruit } from './bruitFeed.js';
import {
  BRUIT_WINNER_RULES,
  bruitAerodromeDescription,
  bruitBandDescription,
  bruitBandLabel,
  bruitCardCaveat,
  bruitDayText,
  bruitGuidanceLabel,
  bruitLegend,
  bruitMarkerTitle,
  bruitNearestSentence,
  bruitScanDescription,
  chooseBruitAnswer,
} from './bruitFrance.js';
import { assertNoFrench, useTestLocale, withLocale } from '../i18n/testing.js';

const read = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const norm = (value) => String(value).replace(/[\s ]+/g, ' ');
const EMPTY_PGS = read('bruit-peb-empty-sample.json');

function payloadFor(pebFixture, point, { pgs = EMPTY_PGS, nearest = null } = {}) {
  return {
    ...projectBruit({ peb: pebFixture, pgs, point, nearest }),
    register: { count: 224, total: 224, short: false, truncated: false },
  };
}

/** Saint-Cyr: zones A and B of one plan, both containing the point, psophic. */
const LFPZ = payloadFor(read('bruit-peb-lfpz-sample.json'), { lat: 48.81025, lon: 2.07712 });
/** Le Bourget: two AIRPORTS, LFPB zone A and LFPG zone D. */
const LEBOURGET = payloadFor(read('bruit-peb-lebourget-sample.json'), { lat: 48.96848, lon: 2.43817 });
/** Toussus-le-Noble: an order, and no polygon at any scale. */
const TOUSSUS = payloadFor(read('bruit-peb-empty-sample.json'), { lat: 48.7498, lon: 2.1112 }, {
  nearest: {
    oaci: 'LFPG', name: 'P. CH. DE-GAULLE', lat: 49.009747, lon: 2.547819,
    arreteDate: '2007-04-03', index: 'lden', distanceKm: 39.4,
  },
});

const answers = (payload) => ({
  peb: chooseBruitAnswer(payload.peb, 'peb'),
  pgs: chooseBruitAnswer(payload.pgs, 'pgs'),
});

/** Proper nouns the detector must accept inside the English cards. */
const ALLOW = ['PARIS LE BOURGET', 'P. CH. DE-GAULLE', 'DGAC', 'Lden'];

useTestLocale('en');

test('the rule that chose the zone is named, which is the whole layer', () => {
  const { peb, pgs } = answers(LFPZ);
  assert.equal(peb.ruleLabel, 'the most exposed');
  assert.equal(BRUIT_WINNER_RULES.only, 'the only zone under the marker');
  const card = norm(bruitScanDescription(LFPZ, peb, pgs));
  assert.ok(card.includes('2 zones here, chosen: the most exposed'), card);
  assert.ok(card.includes('also under the marker: zone B — old index 89 to 96 — not decibels'), card);
  assert.ok(card.includes('two overlapping zones here'), card);
});

test('a pre-2002 number is still not decibels in English', () => {
  // Saint-Cyr is on a 1985 order: 96 is an indice psophique and NOT 96 dB. The
  // warning is never dropped for length, in either language.
  const { peb, pgs } = answers(LFPZ);
  const card = norm(bruitScanDescription(LFPZ, peb, pgs));
  assert.ok(card.includes('old index 96 and above'), card);
  assert.ok(card.includes('not decibels'), card);
  // The full index sentence is on the BAND card, which has room for it: the
  // scan card spends its sixth line on the caveat.
  const band = norm(bruitBandDescription(peb.winner, peb));
  assert.ok(band.includes('psophic index, from before 2002: does not convert to dB(A)'), band);
});

test('two airports at one point stay two facts', () => {
  const { peb, pgs } = answers(LEBOURGET);
  const card = norm(bruitScanDescription(LEBOURGET, peb, pgs));
  assert.ok(card.includes('two airports here: LFPB, LFPG — two separate orders'), card);
  assert.ok(card.includes('also under the marker: zone D — 50 to 56 dB(A)'), card);
  assert.equal(
    norm(bruitMarkerTitle(LEBOURGET, peb, pgs)),
    'Aircraft noise · zone A — PARIS LE BOURGET',
  );
  assertNoFrench(card, { allow: ALLOW });
});

test('“no plan here” and “the service did not answer” stay two sentences', () => {
  const { peb, pgs } = answers(TOUSSUS);
  assert.equal(norm(bruitMarkerTitle(TOUSSUS, peb, pgs)), 'Aircraft noise — no plan at this point');
  const healthy = norm(bruitScanDescription(TOUSSUS, peb, pgs));
  assert.ok(healthy.includes('no noise exposure plan covers this point'), healthy);
  assert.ok(healthy.includes('nearest plan: P. CH. DE-GAULLE (LFPG), 39.4 km away'), healthy);
  assert.ok(healthy.includes('order of Apr 3, 2007'), healthy);

  const down = { ...TOUSSUS, available: { peb: false, pgs: false } };
  const a = answers(down);
  assert.equal(norm(bruitMarkerTitle(down, a.peb, a.pgs)), 'Aircraft noise — service did not answer');
  const outage = norm(bruitScanDescription(down, a.peb, a.pgs));
  assert.ok(outage.includes('the PEB service did not answer — this is not “no zone here”'), outage);
  assert.ok(!outage.includes('no noise exposure plan covers this point'), outage);
});

test('standing on an aerodrome that answers nothing says exactly that', () => {
  const here = norm(bruitNearestSentence({
    oaci: 'LFPN', name: 'TOUSSUS', arreteDate: '1985-07-03', distanceKm: 0,
  }));
  assert.equal(
    here,
    'the marker is on TOUSSUS (LFPN), order of Jul 3, 1985 '
      + '— the service returns no polygon here',
  );
  assert.ok(!here.includes('0 km'), here);
  assert.ok(norm(bruitNearestSentence({
    oaci: 'LFPN', name: 'TOUSSUS', arreteDate: '1985-07-03', distanceKm: 0.6,
  })).includes('0.6 km away'));
});

test('a date spells its month in English, and stays DD/MM/YYYY in French', () => {
  // `03/04/2007` reads as the fourth of March to an English reader, on a card
  // whose whole job is to identify one prefectoral order among several.
  assert.equal(bruitDayText('2007-04-03'), 'Apr 3, 2007');
  assert.equal(withLocale('fr', () => bruitDayText('2007-04-03')), '03/04/2007');
  assert.equal(bruitDayText('2007-04-03Z'), null, 'the raw register value is not a day');
  assert.equal(bruitDayText(null), null);
  assert.equal(bruitDayText('hier'), null);
});

test('the key names each zone and what it means for a home, in plain English', () => {
  const legend = bruitLegend(LEBOURGET);
  assert.ok(legend.length > 0);
  assert.equal(legend[0].label, 'What can be built');
  assert.equal(legend[1].label, 'Very loud');
  assert.equal(legend[1].blurb.split(' — ')[0], 'no new homes');
  assertNoFrench(legend.map((row) => `${row.label} — ${row.blurb ?? ''}`), { allow: ALLOW });
});

test('the caveat still says what is NOT in the layer, and how coarse it is drawn', () => {
  assert.equal(
    bruitCardCaveat({ area: false }),
    'aircraft only, neither road nor rail — drawn to ~11 m',
  );
  assert.equal(
    bruitCardCaveat({ area: true, coarseBands: 4, refinedBands: 2 }),
    'aircraft only — drawn to ~1.1 km, 2 zones to ~11 m',
  );
  assert.equal(
    bruitCardCaveat({ area: true, coarseBands: 4, refinedBands: 1 }),
    'aircraft only — drawn to ~1.1 km, 1 zone to ~11 m',
    'the English agrees with its count; the French says “1 zone” too',
  );
});

test('the guidance line agrees with its counts and keeps the 24-hour typography', () => {
  assert.equal(
    bruitGuidanceLabel({ available: { peb: false }, area: true, missing: 1 }),
    'The DGAC service did not answer for 1 aerodrome — the view is incomplete',
  );
  assert.equal(
    bruitGuidanceLabel({ available: { peb: false }, area: true, missing: 3 }),
    'The DGAC service did not answer for 3 aerodromes — the view is incomplete',
  );
  assert.equal(
    bruitGuidanceLabel({ available: { peb: false } }),
    'The DGAC service did not answer — this is not “no zone here”',
  );
  assert.equal(
    bruitGuidanceLabel({ area: true, lastUpdate: 1, aerodromes: 0, nearestKm: 48.25 }),
    'No plan in this frame — the nearest is 48.3 km away',
  );
  assert.equal(
    bruitGuidanceLabel({ area: true, lastUpdate: 1, aerodromes: 12, refining: 1 }),
    'outlines being sharpened — 1 aerodrome still coarsely drawn',
  );
});

test('an aerodrome card lists its plan and still says to descend', () => {
  const card = norm(bruitAerodromeDescription({
    oaci: 'LFPG',
    zones: 1,
    probed: false,
    bands: LEBOURGET.peb.slice(0, 1),
    top: LEBOURGET.peb[0],
  }, { area: true }));
  assert.ok(card.includes('1 zone published:'), card);
  assert.ok(card.includes('zoom below 12 km to see which zone applies to an address'), card);
  assert.ok(card.includes('returned by a neighboring aerodrome’s probe'), card);
  assertNoFrench(card, { allow: ALLOW });
});

test('French is untouched, on the same payloads', () => {
  // The whole answer inside one locale: `chooseBruitAnswer` resolves the
  // winning RULE into words as it decides, which is what a page does — one
  // language per load, from the scan to the card.
  const card = withLocale('fr', () => {
    const { peb, pgs } = answers(LFPZ);
    return norm(bruitScanDescription(LFPZ, peb, pgs));
  });
  assert.ok(card.includes('2 zones ici, retenue : la plus exposée'), card);
  assert.ok(card.includes('aussi sous le repère : zone B — ancien indice de 89 à 96 — pas des décibels'), card);
  assert.equal(
    withLocale('fr', () => bruitBandLabel(LEBOURGET.peb.find((band) => band.zone === 'D'))),
    'zone D — de 50 à 56 dB(A)',
  );
  assert.equal(
    withLocale('fr', () => bruitGuidanceLabel({ available: { peb: false } })),
    'Le service DGAC n’a pas répondu — ce n’est pas « aucune zone ici »',
  );
});
