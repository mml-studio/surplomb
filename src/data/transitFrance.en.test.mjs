// Live transit in English: the bus card, the key, the row line and the two
// coverage sentences, read through the real module from a wire record shaped
// like the proxy's.
//
// This layer arrived from upstream with an English card, and the French globe
// shows that English too (see the header of `transitFrance.i18n.js`). What
// this file pins is therefore twofold: the card and the key are IDENTICAL in
// both languages — no French leaked in while the strings moved — and the one
// string that really was French, the zoom prompt, now has an English that
// says the same thing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTransitSelectionLabel,
  transitKindReadout,
  transitModeLabel,
  transitVehicleReadout,
} from './transitFrance.js';
import { transitCoverageNotice } from './transitCoverage.js';
import messages from './transitFrance.i18n.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

// Networks, lines and destinations are data and stay as published.
const DATA = ['TBM', 'Gare de Bègles', 'Tisséo', 'Ilévia', 'Île-de-France Mobilités'];

const record = (overrides = {}) => ({
  id: 'transit-fr:tbm:1234',
  feed: { network: 'TBM', licence: 'ODbL 1.0' },
  vehicle: {
    route: '11',
    label: 'Gare de Bègles',
    speedMps: 8.9,
    bearing: 184,
    status: 'in-transit',
    occupancy: 'few-seats',
    kind: 'bus',
    kindSource: 'route_type',
    mode: 'urban',
    timestampMs: Date.now() - 12_000,
    ...overrides,
  },
});

test('the bus card, in English', () => {
  const lines = withLocale('en', () => buildTransitSelectionLabel(record()).split('\n'));
  assertNoFrench(lines, { allow: DATA });
  assert.equal(lines[0], 'LINE 11 · Gare de Bègles');
  assert.equal(lines[1], '🚍 TBM');
  assert.equal(lines[2], '32 km/h · 184° · in transit');
  assert.equal(lines[3], '👥 few seats');
  assert.equal(lines[4], '⏱ fix 12s ago');
  assert.equal(lines[5], 'Bus · ODbL 1.0');
});

test('the same card in French — byte for byte what it printed before', () => {
  const fr = withLocale('fr', () => buildTransitSelectionLabel(record()).split('\n'));
  const en = withLocale('en', () => buildTransitSelectionLabel(record()).split('\n'));
  // This card is the inherited English in both languages, on purpose: the
  // wave moves strings, it does not change what a French reader sees.
  assert.deepEqual(fr, en);
});

test('what is not published is said, never filled in with a zero', () => {
  const silent = withLocale('en', () => buildTransitSelectionLabel(record({
    speedMps: null, bearing: null, status: null, occupancy: null,
  })).split('\n'));
  assertNoFrench(silent, { allow: DATA });
  assert.ok(silent.includes('no heading published'));
  assert.ok(!silent.some((line) => line.includes('0 km/h')));
  assert.ok(!silent.some((line) => line.includes('0°')));
});

test('a class the static join could not resolve says so, and how much is known', () => {
  const unresolved = withLocale('en', () => transitKindReadout({ mode: 'intercity' }));
  assertNoFrench(unresolved);
  assert.deepEqual(unresolved, { label: 'Type unknown', qualifier: 'Intercity' });
  const uniform = withLocale('en', () => transitKindReadout({ kind: 'tram', kindSource: 'uniform' }));
  assert.deepEqual(uniform, { label: 'Tram', qualifier: 'single-mode network' });
  assert.equal(withLocale('en', () => transitModeLabel(null)), 'Transit');
  // An unknown line number still reads as a line.
  assert.match(withLocale('en', () => buildTransitSelectionLabel({ vehicle: {} })), /^LINE —/);
});

test('the spoken readout carries the same words as the card', () => {
  const readout = withLocale('en', () => transitVehicleReadout(record()));
  assertNoFrench(
    { mode: readout.mode, status: readout.status, occupancy: readout.occupancy },
    { allow: DATA },
  );
  assert.equal(readout.status, 'in transit');
  assert.equal(readout.occupancy, 'few seats');
  assert.equal(readout.mode, 'Bus');
});

test('the zoom prompt is the one string that was French, and it has an English', () => {
  assert.equal(withLocale('fr', () => messages().row.zoomIn), 'Zoome pour charger les transports en direct');
  const en = withLocale('en', () => messages().row.zoomIn);
  assertNoFrench(en);
  assert.equal(en, 'Zoom in to load live transit');
});

test('an empty view names the operator that is silent, and where to look', () => {
  const dark = withLocale('en', () => transitCoverageNotice(
    { south: 43.55, west: 1.35, north: 43.65, east: 1.50 }, { feedsMatched: 0 },
  ));
  assert.equal(dark.area.id, 'toulouse');
  assert.match(dark.text, /^Tisséo publishes trip updates and alerts, but no vehicle positions — try \w+ \(\d+ live\)$/);
  const nowhere = withLocale('en', () => transitCoverageNotice(
    { south: 46.10, west: 1.80, north: 46.25, east: 1.95 }, { feedsMatched: 0 },
  ));
  assert.equal(nowhere.area, null);
  assert.match(nowhere.text, /^no operator publishes live positions here — try /);
  // A view with feeds in it is not an empty view, in either language.
  assert.equal(withLocale('fr', () => transitCoverageNotice({ south: 44.8, west: -0.6, north: 44.9, east: -0.5 }, { feedsMatched: 3 })), null);
});
