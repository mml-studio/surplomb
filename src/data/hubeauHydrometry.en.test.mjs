// The Hub'Eau stations layer in English: the card of one gauging station, the
// seasonal block that puts today's flow against the month's own average, and
// the line that says why a view holds what it holds.
//
// The two units this layer keeps apart survive the translation: a DISCHARGE
// in m³/s means the same everywhere, and a STAGE is a staff-gauge reading
// against that station's own zero — which is why it keeps a prefix and why
// the gauge zero is never added to it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHubeauCard,
  formatHubeauDischarge,
  formatHubeauStage,
  hubeauSeasonalLines,
} from './hubeauHydrometry.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

const TARASCON = Object.freeze({
  code: 'V720001002', name: 'Le Rhône à Tarascon', river: 'Le Rhône',
  commune: 'TARASCON', departement: 'BOUCHES-DU-RHONE', openedYear: 1994,
  influence: 'Nulle', qualification: 'Donnée brute / Non qualifiée', gaugeZeroM: null,
  reading: { kind: 'Q', value: 617, text: '617 m³/s', freshness: 'live', doubtful: false },
});
const SEPTEMBER = {
  month: 9, mean: 933, min: 538, max: 1888, years: 26, firstYear: 2000, lastYear: 2025,
};
const FLAT_DAY = { values: Array.from({ length: 144 }, () => 617), min: 610, max: 620, count: 144 };

// Station names, rivers, communes and departments are data.
const DATA = ['Le Rhône à Tarascon', 'Le Rhône', 'TARASCON', 'BOUCHES-DU-RHONE'];

test('a station card reads in English, reading and history included', () => {
  const card = withLocale('en', () => buildHubeauCard(TARASCON, FLAT_DAY, null));
  assertNoFrench(card, { allow: DATA });
  assert.match(card, /^Le Rhône à Tarascon\n◈ 617 m³\/s · discharge\n/);
  assert.match(card, /^ {3}from 610 m³\/s to 620 m³\/s over 24 h$/mu);
  assert.match(card, /🕐 station opened in 1994/);
  // French, unchanged.
  const french = withLocale('fr', () => buildHubeauCard(TARASCON, FLAT_DAY, null));
  assert.match(french, /◈ 617 m³\/s · débit\n/);
  assert.match(french, /^ {3}de 610 m³\/s à 620 m³\/s sur 24 h$/mu);
});

test('a stage is a gauge reading, and its zero is a datum, never a sum', () => {
  const stage = withLocale('en', () => buildHubeauCard({
    ...TARASCON, gaugeZeroM: 6.5,
    reading: { kind: 'H', value: 2.4, text: withLocale('en', () => formatHubeauStage(2.4)), freshness: 'live' },
  }));
  assertNoFrench(stage, { allow: DATA });
  assert.match(stage, /◈ gauge height 2\.40 m · stage/);
  assert.match(stage, /↧ gauge zero at 6\.5 m/);
  assert.doesNotMatch(stage, /above sea level|absolute altitude/i);
  assert.equal(withLocale('fr', () => formatHubeauStage(2.4)), 'échelle 2,40 m');
});

test('the seasonal block compares today with the month’s own average', () => {
  const lines = withLocale('en', () => hubeauSeasonalLines(448, SEPTEMBER, 2026));
  assertNoFrench(lines, { allow: DATA });
  assert.match(lines[0], /^◑ September: 933 m³\/s on average over the last 26 years$/);
  assert.match(lines[1], /^ {3}between 538 m³\/s and 1,888 m³\/s$/);
  assert.match(lines[2], /^ {3}today 48% /);
  // A series that stops years ago names its window instead.
  const old = withLocale('en', () => hubeauSeasonalLines(448, {
    ...SEPTEMBER, firstYear: 1967, lastYear: 1998,
  }, 2026));
  assert.match(old[0], /^◑ September: 933 m³\/s on average between 1967 and 1998$/);
  // French, same three lines.
  const french = withLocale('fr', () => hubeauSeasonalLines(448, SEPTEMBER, 2026));
  assert.match(french[0], /^◑ septembre : 933 m³\/s en moyenne sur les 26 dernières années$/);
  assert.match(french[2], /^ {3}aujourd'hui 48 % /);
});

test('a pending mean, a failed history and a doubtful reading all say so', () => {
  assert.match(withLocale('en', () => buildHubeauCard(TARASCON, null, { pending: true })),
    /◑ monthly average …/);
  assert.match(withLocale('en', () => buildHubeauCard(TARASCON, { failed: true })),
    /↻ 24 h history unavailable/);
  assert.match(withLocale('en', () => buildHubeauCard({
    ...TARASCON,
    reading: { ...TARASCON.reading, doubtful: true, freshness: 'stale' },
  })), /◈ 617 m³\/s · discharge · old reading/);
  assert.match(withLocale('en', () => buildHubeauCard({
    ...TARASCON, reading: { ...TARASCON.reading, doubtful: true },
  })), /⚠ reading flagged as doubtful by the producer/);
});

test('discharges group the English way', () => {
  assert.equal(withLocale('en', () => formatHubeauDischarge(0.42)), '0.42 m³/s');
  assert.equal(withLocale('en', () => formatHubeauDischarge(12.4)), '12.4 m³/s');
  assert.equal(withLocale('en', () => formatHubeauDischarge(11_000)), '11,000 m³/s');
  assert.equal(withLocale('fr', () => formatHubeauDischarge(0.42)), '0,42 m³/s');
  assert.equal(withLocale('fr', () => formatHubeauDischarge(11_000)).replace(/\s/g, ' '),
    '11 000 m³/s');
});
