// Earthquakes (24 h) in English. Their French stays pinned by
// earthquakes.test.mjs, untouched.
//
// The card exists to stop shipping a bare magnitude, so what is checked here
// is that all four decodings survive the translation: the class, the effect,
// the depth's consequence, and the instant on the READER's clock.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EARTHQUAKE_AGE_BANDS,
  EARTHQUAKE_AGE_UNKNOWN,
  buildEarthquakeCard,
  buildEarthquakeLegend,
  buildEarthquakeNote,
  classifyEarthquakeMagnitude,
  describeEarthquakeDepth,
  earthquakeLegendNote,
  emptyEarthquakeTally,
  formatEarthquakeInstant,
  frenchEarthquakePlace,
} from './earthquakes.js';
import { assertNoFrench, useTestLocale, withLocale } from '../i18n/testing.js';

/** A Wednesday noon, fixed so “today” and “yesterday” never drift. */
const CARD_NOW = Date.parse('2026-09-16T10:00:00Z');
const localNoon = (dayOffset) => {
  const d = new Date(CARD_NOW);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(12, 0, 0, 0);
  return d.getTime();
};

useTestLocale('en');

test('the card decodes the magnitude in English instead of printing it bare', () => {
  const card = buildEarthquakeCard({
    id: 'us7000abcd',
    magnitude: 4.1,
    depthKm: 12.3,
    place: '5 km NE of Mraighah, Lebanon',
    timeMs: CARD_NOW - 6 * 60e3,
  }, CARD_NOW);
  const [title, ...details] = card.split('\n');

  assert.equal(title, 'Magnitude 4.1 — moderate shaking');
  assert.ok(details.includes('Felt locally, damage rare.'), card);

  const gauge = details.find((line) => line.includes('█'));
  assert.match(gauge, /^2\.5 █+─+ 9\.5 world record$/);

  const depth = details.findIndex((line) => line.startsWith('↓'));
  assert.equal(details[depth], '↓ focus 12.3 km below sea level');
  assert.equal(details[depth + 1], '   shallow, so felt more strongly');

  assert.ok(details.some((line) => /^🕐 today at \d{2}:\d{2} your time · 6 min ago$/.test(line)), card);
  assert.ok(details.includes('Source: USGS, the United States Geological Survey'), card);
  assertNoFrench(details.filter((line) => !line.startsWith('📍')), { allow: ['USGS'] });
});

test('USGS’s own place string is passed through, not re-translated', () => {
  // `86 km SSW of Isangel, Vanuatu` IS the English sentence the French branch
  // builds an equivalent of. Rewriting it could only break a place name.
  assert.equal(
    frenchEarthquakePlace('5 km NE of Mraighah, Lebanon'),
    '5 km NE of Mraighah, Lebanon',
  );
  assert.equal(
    frenchEarthquakePlace('off the east coast of Honshu, Japan'),
    'off the east coast of Honshu, Japan',
  );
  assert.equal(frenchEarthquakePlace(null), '');
  // And the French branch still decodes the bearing.
  assert.equal(
    withLocale('fr', () => frenchEarthquakePlace('5 km NE of Mraighah, Lebanon')),
    '5 km au nord-est de Mraighah, Lebanon',
  );
});

test('the fallbacks name the absence, in English, and never invent a number', () => {
  const noDepth = buildEarthquakeCard({
    id: 'a', magnitude: 2.6, depthKm: null, place: 'Nevada', timeMs: null,
  }, CARD_NOW);
  assert.match(noDepth, /↓ depth not published by the USGS/);
  assert.match(noDepth, /🕐 date not published by the USGS/);
  assert.doesNotMatch(noDepth, /NaN|undefined|null/);

  // A measured zero is a measurement, and reads as one.
  const floored = buildEarthquakeCard({
    id: 'b', magnitude: 6.8, depthKm: 0, place: 'Ridgecrest, CA', timeMs: CARD_NOW,
  }, CARD_NOW);
  assert.match(floored, /Magnitude 6\.8 — destructive earthquake/);
  assert.match(floored, /focus 0 km below sea level/);

  // USGS publishes NEGATIVE depths for foci above sea level.
  const above = buildEarthquakeCard({
    id: 'c', magnitude: 3, depthKm: -1.4, place: 'The Geysers, CA', timeMs: CARD_NOW,
  }, CARD_NOW);
  assert.match(above, /1\.4 km above sea level/);
  assert.doesNotMatch(above, /-1\.4|−1\.4/);

  const noMag = buildEarthquakeCard({
    id: 'd', magnitude: null, depthKm: 8, place: 'Nevada', timeMs: CARD_NOW,
  }, CARD_NOW);
  assert.match(noMag, /^Magnitude not published\n/);
  assert.doesNotMatch(noMag, /█/);
});

test('the clock is still the reader’s own day, and written 24-hour', () => {
  assert.match(formatEarthquakeInstant(localNoon(0), CARD_NOW), /^today at 12:00 your time$/);
  assert.match(formatEarthquakeInstant(localNoon(-1), CARD_NOW), /^yesterday at 12:00 your time$/);
  assert.match(formatEarthquakeInstant(localNoon(-4), CARD_NOW), /^Sep \d{1,2} at 12:00 your time$/);
  // English pads the hour (09:05); French does not (9 h 05), and never 24 h.
  const midnight = new Date(CARD_NOW);
  midnight.setHours(0, 5, 0, 0);
  assert.match(formatEarthquakeInstant(midnight.getTime(), CARD_NOW), /at 00:05 your time$/);
  assert.match(
    withLocale('fr', () => formatEarthquakeInstant(midnight.getTime(), CARD_NOW)),
    /à 0 h 05 chez vous$/,
  );
});

test('the age line is floored and reads as an age, not a second clock', () => {
  const at = (ms) => buildEarthquakeCard(
    { id: 'x', magnitude: 4, depthKm: 10, place: 'p', timeMs: CARD_NOW - ms },
    CARD_NOW,
  );
  assert.match(at(30e3), /just now/);
  assert.match(at(6 * 60e3), /6 min ago/);
  assert.match(at(90 * 60e3), /1 h ago(?! \d)/);
  assert.match(at(11 * 3600e3 + 11 * 60e3), /11 h ago(?! \d)/);
});

test('the key states the two shape domains and the ramp, in English', () => {
  const tally = emptyEarthquakeTally();
  tally.byAge.h1 = 3;
  tally.byAge[EARTHQUAKE_AGE_UNKNOWN.id] = 1;
  tally.noDepth = 2;
  const legend = buildEarthquakeLegend(tally);
  const labels = legend.map((entry) => entry.label);
  assert.ok(labels.some((l) => /^Dot — magnitude, M2\.5 to M9\.5$/.test(l)), labels.join(' / '));
  assert.ok(labels.some((l) => /^Stem — focus depth, 0 to 700 km$/.test(l)));
  assert.ok(labels.includes('Color — age within the 24 h window'));
  assert.ok(labels.includes('under 1 h'));
  assert.ok(labels.includes('age not published'));
  assert.ok(labels.includes('depth not published — hollow dot, no stem'));
  assert.match(earthquakeLegendNote(), /USGS, “all_day” feed, M2\.5\+ · polled every 60 s/);
  assertNoFrench(legend.map((row) => `${row.label} — ${row.blurb ?? ''}`),
    { allow: ['USGS', 'all_day'] });
  // The energy ratio keeps its decimal point.
  assert.match(legend[0].blurb, /\+1 is ×31\.6/);
});

test('the note agrees with its own count, in a language with irregular plurals', () => {
  const one = emptyEarthquakeTally();
  one.depthFloor = 1;
  assert.match(buildEarthquakeNote(one), /^1 focus under 1 km:/);
  const many = emptyEarthquakeTally();
  many.depthFloor = 3;
  assert.match(buildEarthquakeNote(many), /^3 foci under 1 km:/);
  const clipped = emptyEarthquakeTally();
  clipped.drawn = 140;
  clipped.labelled = 96;
  assert.match(buildEarthquakeNote(clipped), /All 140 quakes are drawn; only the 96 strongest/);
});

test('every class is named in both languages', () => {
  assert.equal(classifyEarthquakeMagnitude(2.5).label, 'very light shaking');
  assert.equal(classifyEarthquakeMagnitude(4).label, 'moderate shaking');
  assert.equal(classifyEarthquakeMagnitude(6.999).label, 'destructive earthquake');
  assert.equal(describeEarthquakeDepth(400), 'very deep, rarely felt at the surface');
  assert.equal(describeEarthquakeDepth(100), 'intermediate depth, shaking damped');
  assert.equal(withLocale('fr', () => classifyEarthquakeMagnitude(4).label), 'secousse modérée');
  for (const band of EARTHQUAKE_AGE_BANDS) {
    assert.ok(band.label.length > 0 && band.blurb.length > 0, band.id);
  }
});
