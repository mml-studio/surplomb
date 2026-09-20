// Weather stations (France) in English. Their French stays pinned by
// meteoStationsFrance.test.mjs and meteoStationsFrFeed.test.mjs, untouched.
//
// The one line this layer exists for is the one that says a reading exists
// BEHIND A CREDENTIAL rather than not at all. It has its own test here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildNormalsLines,
  buildObservationLines,
  buildStationCard,
  formatObservationTime,
  stationDisplayName,
  stationLegend,
} from './meteoStationsFrance.js';
import { INSTRUMENT_FAMILIES, STATION_CLASSES, STATION_PACKS, POSTE_TYPES } from './meteoStationsFrFeed.js';
import { assertNoFrench, useTestLocale, withLocale } from '../i18n/testing.js';

const REGISTRY = JSON.parse(readFileSync(
  new URL('./local_data/meteo_stations_fr/stations.json', import.meta.url), 'utf8',
));
const byName = (name) => REGISTRY.stations.find((station) => station.name === name);

/** Proper nouns the detector must accept inside the English card. */
const ALLOW = ['Météo-France', 'RADOME', 'SYNOP', 'VERIZIEU', 'BOULOGNE'];

useTestLocale('en');

test('the card leads with what the station can and cannot answer', () => {
  const lines = buildStationCard(byName('VERIZIEU')).split('\n');
  assert.equal(lines[0], 'VERIZIEU');
  assert.match(lines[1], /^◈ measures .*temperature/);
  assert.match(lines[2], /^⊘ does not measure .*wind at 10 m.*pressure/);
});

test('“behind a key” is still not “no data”', () => {
  const card = buildStationCard(byName('VERIZIEU'));
  assert.match(card, /🔒 readings not published openly — Météo-France API, key required/);
  assert.doesNotMatch(card, /unavailable/);
  assertNoFrench(card, { allow: ALLOW });
});

test('a publishing station waits for its reading, then prints it in English units', () => {
  const boulogne = byName('BOULOGNE-SEM');
  assert.ok(boulogne?.live, 'BOULOGNE-SEM publishes hourly');
  assert.match(buildStationCard(boulogne), /🌡 reading loading…/);
  assert.match(buildStationCard(boulogne, { pending: false }), /🌡 public reading unavailable/);
  const card = buildStationCard(boulogne, {
    pending: false,
    observation: {
      at: '2026-09-01T21:00:00Z', tempC: 17.4, humidity: 81, pressureHpa: 1019.1,
      windMs: 6.5, windDir: 260, gustMs: 9.2, rain1hMm: 0, visibilityM: 26_000, snowM: null,
    },
  });
  assert.match(card, /17\.4 °C/);
  assert.match(card, /81% RH/);
  assert.match(card, /1,019\.1 hPa/);
  assert.match(card, /23 km\/h from the W/);
  assert.match(card, /gusting 33 km\/h/);
  // UTC on both globes: the SYNOP product publishes UTC and converting it
  // would invent a precision it does not have.
  assert.match(card, /09\/01, 21:00 UTC/);
  assert.equal(
    withLocale('fr', () => formatObservationTime('2026-09-01T21:00:00Z')),
    '01/09 à 21 h 00 UTC',
  );
});

test('a genuine zero of rain is printed as a fact in English too', () => {
  const lines = buildObservationLines({ at: '2026-09-01T21:00:00Z', rain1hMm: 0 });
  assert.ok(lines.some((line) => /no rain in the last hour/.test(line)));
  assert.ok(buildObservationLines({ at: 'x', rain1hMm: 2.4 })
    .some((line) => /2\.4 mm in the last hour/.test(line)));
});

test('a record keeps the window it stands in', () => {
  const [line] = buildNormalsLines({
    high: { value: 42.4, date: '2023' },
    low: { value: -19.2, date: '1985' },
    period: '01-01-1947 → 31-12-2025',
  });
  assert.match(line, /📈 record 42\.4 °C in 2023 · -19\.2 °C in 1985/);
  assert.match(line, /— records set over 01-01-1947 → 31-12-2025/);
});

test('a closed station spells its month, so the day cannot be misread', () => {
  const closed = { id: 'x', name: 'X', closed: '2019-12-31', fam: null };
  assert.match(buildStationCard(closed), /⚠ station CLOSED on Dec 31, 2019 — still present/);
  assert.match(
    withLocale('fr', () => buildStationCard(closed)),
    /⚠ station FERMÉE le 31\/12\/2019 — toujours présente/,
  );
});

test('the seven classes, the fourteen families and the two packs are worded', () => {
  assert.equal(STATION_CLASSES.synoptic.label, 'Full synoptic');
  assert.equal(STATION_CLASSES.unknown.blurb, 'station listed in real time, absent from the metadata');
  assert.equal(INSTRUMENT_FAMILIES[0].label, 'temperature');
  assert.equal(INSTRUMENT_FAMILIES[0].short, 'T', 'the field code is not a word');
  assert.equal(INSTRUMENT_FAMILIES[0].anchor, 'TEMPERATURE SOUS ABRI HORAIRE',
    'the anchor is a key into the inventory, not a word');
  assert.equal(STATION_PACKS.RADOME.blurb, 'reference network, quality-checked at D+1');
  assert.equal(POSTE_TYPES[0], 'synoptic station, real time, quality-checked at D+1');
  assert.equal(withLocale('fr', () => STATION_CLASSES.synoptic.label), 'Synoptique complète');
  assertNoFrench(
    [...Object.values(STATION_CLASSES).map((c) => `${c.label} — ${c.blurb}`),
      ...INSTRUMENT_FAMILIES.map((f) => `${f.label} — ${f.blurb}`)],
    { allow: ['Radome-Resome'] },
  );
});

test('the key’s two conditional rows say what a ring and a hollow disc mean', () => {
  const stations = [
    { klass: 'synoptic', live: true },
    { klass: 'temp-rain', live: false, closed: '2019-12-31' },
  ];
  const legend = stationLegend(stations);
  const labels = legend.map((row) => row.label);
  assert.ok(labels.includes('Ring = public readings'), labels.join(' / '));
  assert.ok(labels.includes('Hollow disc = closed station'));
  assert.match(
    legend.find((row) => row.label === 'Hollow disc = closed station').blurb,
    /Kept and flagged, never removed in silence/,
  );
  assertNoFrench(legend.map((row) => `${row.label} — ${row.blurb}`), { allow: ALLOW });
});

test('a station with no published name is named in the reader’s language', () => {
  assert.equal(stationDisplayName({ commune: 'Bassussarry' }), 'Weather station at Bassussarry');
  assert.equal(stationDisplayName({}), 'Weather station');
  assert.equal(withLocale('fr', () => stationDisplayName({})), 'Station météo');
});
