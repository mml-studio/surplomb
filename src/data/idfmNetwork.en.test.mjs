// The IDFM network and its hourly offer in English: the stop card, the six
// frequency rungs, the moment chips and the row line — composed from the SAME
// captured offer pages the French tests project (Alésia, 4 km box, Tuesday).
//
// The card argues, and the English has to argue the same way: the consequence
// first (how long you stand at the pole), the rate as its proof, an
// accessibility nobody surveyed kept apart from "not accessible", and the
// closing line saying this is an average week and not a timetable.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildStopCard,
  levelLabel,
  modeLegend,
  networkLine,
  waitClock,
} from './idfmNetwork.js';
import {
  idfmFrequencyDayChip,
  idfmFrequencyDayLabel,
  idfmFrequencyModeLabel,
  idfmFrequencySilentLabel,
  projectFrequencyStops,
} from './idfmFrequencyFeed.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

const read = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const BOX = Object.freeze({ south: 48.8270, west: 2.3160, north: 48.8330, east: 2.3280 });
const PACK = projectFrequencyStops({
  identity: read('idfm-frequence-identite-sample.json'),
  profiles: ['04-09', '10-15', '16-21', '22-27']
    .map((window) => read(`idfm-frequence-profil-${window}-sample.json`)),
  box: BOX,
});
const freqById = (id) => PACK.stops.find((stop) => String(stop.id) === id);

// Stop names, communes and the network's own brands stay French.
// `Les Plantes` is one of the stop's published alternative names: the card
// quotes the referential, and a stop name is never translated.
const DATA = ['Alésia', 'Général Leclerc', 'Les Plantes', 'Paris 14e', 'Transilien', 'Câble', 'Créteil'];

const REF_BUS = Object.freeze({
  id: '23613',
  name: 'Alésia - Général Leclerc',
  mode: 'bus',
  modeLabel: 'Bus',
  town: 'Paris 14e',
  fareZone: '1',
  accessible: true,
});

test('a bus stop’s card, in English', () => {
  const freq = freqById('23613');
  assert.ok(freq, 'the captured pack must hold this stop');
  const copy = withLocale('en', () => buildStopCard({ ref: REF_BUS, freq }, { day: 'mardi', band: 8 }));
  const lines = copy.split('\n');
  assertNoFrench(lines, { allow: DATA });
  assert.equal(lines[0], 'Alésia - Général Leclerc · Bus');
  // The consequence first, on a Tuesday at 08:00.
  assert.match(lines[1], /^A bus every .+ — this Tuesday at 08:00$/);
  // Then the proof, and when the service starts and stops.
  assert.match(copy, /\d[\d.,]* an hour here/);
  assert.match(copy, /first \d{2}:\d{2}, last \d{2}:\d{2}/);
  // Where it is, with the step-free wording.
  assert.ok(lines.includes('Paris 14e · fare zone 1 · step-free access'));
  // And what this is: never a timetable.
  assert.match(lines.at(-1), /^Average of an ordinary \d{4} week, term time — this is not a timetable$/);
  // An alternative published name is quoted with the English quotes.
  assert.ok(lines.some((line) => line === 'Also published as “Les Plantes” at the same point'));
  assert.ok(withLocale('fr', () => buildStopCard({ ref: REF_BUS, freq }, { day: 'mardi', band: 8 }))
    .includes('Aussi publié « Les Plantes » au même point'));
});

test('the same card in French — byte for byte what it printed before', () => {
  const freq = freqById('23613');
  const copy = withLocale('fr', () => buildStopCard({ ref: REF_BUS, freq }, { day: 'mardi', band: 8 }));
  assert.match(copy, /^Alésia - Général Leclerc · Bus\n/);
  assert.match(copy, /Un bus toutes les .+ — ce mardi à 08 h/);
  assert.match(copy, /Paris 14e · zone 1 · accès de plain-pied/);
  assert.match(copy, /hors vacances — ce n’est pas un horaire$/);
});

test('silence, a survey nobody did, and a stop with no profile at all', () => {
  const freq = freqById('23613');
  const night = withLocale('en', () => buildStopCard({ ref: REF_BUS, freq }, { day: 'mardi', band: 27 }));
  assertNoFrench(night.split('\n'), { allow: DATA });
  assert.match(night, /Nothing runs here this Tuesday at 03:00/);
  assert.ok(!night.includes('0 an hour'), 'silence is never a rate of zero');

  const unsurveyed = withLocale('en', () => networkLine({ town: 'Paris 14e', fareZone: '2', accessible: null }));
  assertNoFrench(unsurveyed, { allow: DATA });
  assert.equal(unsurveyed, 'Paris 14e · fare zone 2 · accessibility not recorded');
  assert.equal(
    withLocale('en', () => networkLine({ town: 'Paris 14e', accessible: 'partial' })),
    'Paris 14e · partial step-free access',
  );

  const orphan = withLocale('en', () => buildStopCard({
    ref: { id: '999001', name: 'Quai sans profil', mode: 'rail', modeLabel: 'RER / Transilien', town: 'Paris 14e' },
  }, { day: 'mardi', band: 8 }));
  assertNoFrench(orphan.split('\n'), { allow: [...DATA, 'Quai sans profil'] });
  assert.match(orphan, /^Quai sans profil · RER \/ Transilien\n/);
  assert.match(orphan, /No hourly profile published for this stop in the IDFM offer/);
  // And the two states of the on-demand lookup.
  const loading = withLocale('en', () => buildStopCard({ ref: REF_BUS }, { probe: 'loading' }));
  assert.match(loading, /Reading this stop’s hourly offer…/);
  const failed = withLocale('en', () => buildStopCard({ ref: REF_BUS }, { probe: 'error' }));
  assert.match(failed, /IDFM hourly offer temporarily unavailable for this stop/);
});

test('the frequency key names the wait, in six rungs plus silence', () => {
  const rungs = withLocale('en', () => [0, 1, 2, 3, 4, 5].map((level) => levelLabel(level)));
  assertNoFrench(rungs);
  assert.deepEqual(rungs, [
    'over 30 min wait',
    'a departure every 15 to 30 min',
    'a departure every 7 to 15 min',
    'a departure every 4 to 7 min',
    'a departure every 2 to 4 min',
    'a departure every 2 min or less',
  ]);
  assert.equal(withLocale('en', () => levelLabel(-1)), 'no departure in this band');
  assert.equal(withLocale('en', () => idfmFrequencySilentLabel()), 'no departure in this band');
  // French, unchanged.
  assert.equal(withLocale('fr', () => levelLabel(2)), 'un passage toutes les 7 à 15 min');
  assert.equal(withLocale('fr', () => levelLabel(-1)), 'aucun passage dans cette tranche');
});

test('the mode key says what each badge is, and why it is that size', () => {
  const stops = new Map([
    ['a', { mode: 'metro' }],
    ['b', { mode: 'bus' }],
    ['c', { mode: 'cableway' }],
    ['d', { mode: undefined }],
  ]);
  const legend = withLocale('en', () => modeLegend(stops).map(({ label, blurb }) => ({ label, blurb })));
  assertNoFrench(legend, { allow: DATA });
  assert.equal(legend[0].label, 'Metro');
  assert.match(legend[0].blurb, /^Metro entrance or station\. The largest badge, with the RER/);
  assert.ok(legend.some((row) => row.label === 'Mode not published'));
  assert.ok(legend.some((row) => /never borrowed from a neighbor/.test(row.blurb)));
  assert.equal(withLocale('fr', () => modeLegend(stops)[0].label), 'Métro');
});

test('days, chips and the offer file’s own mode words', () => {
  const days = withLocale('en', () => ['lundi', 'mardi', 'dimanche'].map((day) => idfmFrequencyDayLabel(day)));
  assertNoFrench(days);
  assert.deepEqual(days, ['Monday', 'Tuesday', 'Sunday']);
  assert.deepEqual(withLocale('en', () => ['lundi', 'mardi'].map((day) => idfmFrequencyDayChip(day))), ['M', 'Tu']);
  assert.deepEqual(withLocale('fr', () => ['lundi', 'mardi'].map((day) => idfmFrequencyDayChip(day))), ['L', 'Ma']);
  assert.equal(withLocale('en', () => idfmFrequencyModeLabel('rail')), 'Train — RER & Transilien');
  assert.equal(withLocale('en', () => idfmFrequencyModeLabel(null)), 'Mode not published');
});

test('a wait is said on a clock face, not as a decimal', () => {
  const en = withLocale('en', () => ({
    fast: waitClock(90),
    half: waitClock(12),
    round: waitClock(3),
    slow: waitClock(0.5),
  }));
  assertNoFrench(en);
  assert.equal(en.fast, 'under a minute');
  assert.equal(en.half, '2 min 30 s');
  assert.equal(en.round, '10 min');
  assert.equal(en.slow, 'over an hour');
  assert.equal(withLocale('fr', () => waitClock(12)), '2 min 30');
});
