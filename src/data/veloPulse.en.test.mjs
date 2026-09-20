// The cycling pulse in English: the site card, the hour of the week, the
// phrase that says what the network is doing, the five bands and the panel.
//
// The distinction the whole layer rests on has to survive translation: a
// Vélo’v dock measures a STOCK and is at its weekly MAXIMUM in the middle of
// the night, a Paris counter measures a FLOW and peaks at rush hour. "Maximum"
// is therefore never "peak" on a card, in either language.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PULSE_RAMP,
  PULSE_SLOTS,
  pulsePhrase,
  pulseReading,
  pulseSiteDetails,
  slotLabel,
  summarizePack,
} from './veloPulseFeed.js';
import { PULSE_MODES } from './veloPulse.js';
import { pulseHudDayInitials, pulseLegendSentence } from './veloPulseHud.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

const profile = (spikeSlot, spikeValue, base = 10) => {
  const out = new Array(PULSE_SLOTS).fill(base);
  out[spikeSlot] = spikeValue;
  return out;
};
const LYON_SITE = Object.freeze({
  id: '1024', name: 'Bellecour', lon: 4.83, lat: 45.75, capacity: 40,
  profile: profile(16, 800, 200), samples: new Array(PULSE_SLOTS).fill(4),
});
const PARIS_SITE = Object.freeze({
  id: '100-200', name: 'Pont National', lon: 2.39, lat: 48.83, direction: 'SO-NE',
  installedOn: '2019-06-14',
  profile: profile(32, 350, 40), samples: new Array(PULSE_SLOTS).fill(3),
});
const LYON = Object.freeze({
  label: 'Lyon — Vélo\'v', instrument: 'stock', scale: 1000, source: 'Métropole de Lyon',
});
const PARIS = Object.freeze({
  label: 'Paris — compteurs vélo', instrument: 'flow', scale: 1, source: 'Ville de Paris',
});
const PACK = Object.freeze({
  slots: PULSE_SLOTS,
  window: { start: '2026-06-01', end: '2026-06-28', weeks: 4 },
  cities: {
    lyon: { ...LYON, unit: 'remplissage de la station, en %', sites: [LYON_SITE] },
    paris: { ...PARIS, unit: 'cyclistes comptés par heure', sites: [PARIS_SITE] },
  },
});

// Station names, city labels and the operators are data.
const DATA = ['Bellecour', 'Pont National', 'Vélo’v', "Vélo'v", 'Métropole de Lyon', 'Ville de Paris', 'compteurs vélo'];

test('the hour of the week, on the 24-hour clock in both languages', () => {
  assert.equal(withLocale('en', () => slotLabel(24 + 8)), 'Tuesday 08:00');
  assert.equal(withLocale('en', () => slotLabel(6 * 24 + 23)), 'Sunday 23:00');
  assert.equal(withLocale('fr', () => slotLabel(24 + 8)), 'mardi 08h');
});

test('a dock’s card: a stock, its weekly maximum, and what a full dock means', () => {
  const details = withLocale('en', () => pulseSiteDetails({ site: LYON_SITE, city: LYON }, PACK, 16));
  assertNoFrench(details, { allow: DATA });
  assert.match(details[0], /^Monday 16:00 — \d+% full — about \d+ bikes? of 40$/);
  assert.equal(details[1], 'Measures a STOCK: how many bikes are parked there');
  assert.match(details[2], /^Weekly maximum Monday 16:00 — /);
  assert.equal(details[3], 'A full dock = bikes parked; an empty dock = bikes out on the road');
  assert.equal(details[4], 'Average of 4 weeks out of the 4 sampled');
  assert.ok(details.includes('40 stands'));
  assert.ok(details.includes('Typical week 2026-06-01 → 2026-06-28'));
  // French, same dock: the wording it always printed.
  const fr = withLocale('fr', () => pulseSiteDetails({ site: LYON_SITE, city: LYON }, PACK, 16));
  assert.equal(fr[1], 'Mesure un STOCK : combien de vélos sont garés là');
  assert.match(fr[0], /^lundi 16h — \d+ % pleine — environ \d+ vélos? sur 40$/);
});

test('a counter’s card: a flow, its direction, and when it was installed', () => {
  const details = withLocale('en', () => pulseSiteDetails({ site: PARIS_SITE, city: PARIS }, PACK, 32));
  assertNoFrench(details, { allow: [...DATA, 'SO-NE'] });
  assert.equal(details[0], 'Tuesday 08:00 — 350 cyclists an hour');
  assert.equal(details[1], 'Measures a FLOW: how many cyclists ride past');
  assert.equal(details[3], 'A high counter = cyclists riding past right now');
  assert.ok(details.includes('Direction SO-NE'));
  assert.ok(details.includes('Counter installed on 2019-06-14'));
  assert.equal(details[4], 'Average of 3 weeks out of the 4 sampled');
  // An hour nobody sampled says so rather than printing a zero.
  const quiet = withLocale('en', () => pulseReading(null, PARIS, PARIS_SITE));
  assert.equal(quiet, 'not sampled at this hour');
});

test('what the network is doing at one hour, in four words', () => {
  const curve = { values: new Array(PULSE_SLOTS).fill(0.1) };
  curve.values[32] = 1;
  curve.values[24 * 5 + 14] = 0.95;
  const en = withLocale('en', () => ({
    peak: pulsePhrase(32, curve),
    weekendPeak: pulsePhrase(24 * 5 + 14, curve),
    night: pulsePhrase(3, curve),
    unsampled: pulsePhrase(3, null),
  }));
  assertNoFrench(en);
  assert.equal(en.peak, 'peak');
  assert.equal(en.weekendPeak, 'weekend peak');
  assert.equal(en.night, 'night — almost nobody riding');
  assert.equal(en.unsampled, 'hour not sampled');
  assert.equal(withLocale('fr', () => pulsePhrase(32, curve)), 'pointe');
});

test('the five bands lose the French space before the percent sign', () => {
  const bands = withLocale('en', () => PULSE_RAMP.map((entry) => entry.label));
  assertNoFrench(bands);
  assert.deepEqual(bands, ['< 20%', '20 – 40%', '40 – 60%', '60 – 80%', '≥ 80%']);
  assert.deepEqual(withLocale('fr', () => PULSE_RAMP.map((entry) => entry.label)),
    ['< 20 %', '20 – 40 %', '40 – 60 %', '60 – 80 %', '≥ 80 %']);
});

test('the three ways to look at the week', () => {
  const chips = withLocale('en', () => PULSE_MODES.map(({ id, label, blurb }) => ({ id, label, blurb })));
  assertNoFrench(chips);
  assert.deepEqual(chips.map((chip) => chip.label), ['NOW', 'WEEK', 'PEAK']);
  assert.equal(chips[0].blurb, 'The hour of the week it currently is.');
  assert.match(chips[1].blurb, /^Plays the 168 hours of a typical week, one hour every 0\.5 s\./);
  assert.match(chips[1].blurb, /also moves the other typical-week layers\.$/);
  assert.equal(withLocale('fr', () => PULSE_MODES[0].label), 'MAINTENANT');
});

test('the panel names each city’s instrument, and its letters fit the strip', () => {
  const summary = summarizePack(PACK);
  const sentence = withLocale('en', () => pulseLegendSentence(summary));
  assertNoFrench(sentence, { allow: DATA });
  assert.match(sentence, /^One blob per station: the color is its share of that site’s own weekly maximum, the area is the measured quantity\./);
  assert.match(sentence, /Lyon: how full the docks are \(a STOCK\)/);
  assert.match(sentence, /Paris: the cyclists counted \(a FLOW\)/);
  assert.deepEqual(withLocale('en', () => [...pulseHudDayInitials()]), ['M', 'T', 'W', 'T', 'F', 'S', 'S']);
  assert.match(withLocale('fr', () => pulseLegendSentence(summary)), /^Une tache par station/);
});
