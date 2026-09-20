// The Gas network layer in English: the card of a pipe, of a gas-fired plant
// and of a biomethane injection site, and the key that keeps the two networks
// apart — the one this layer draws, and the distribution one it does not.
//
// Like the power grid, this layer is half-inherited: the cards were written
// in English upstream and print English on the French globe. What moves is
// the row line, the key and the two French titles; what does not move is any
// byte a French reader already sees.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import gasFranceLayer, {
  _gasRowControlsForTest,
  _setGasStateForTest,
  buildGasSelectionLabel,
  formatGwhPerYear,
  formatKm,
  formatMw,
} from './gasFrance.js';
import { GAS_INJECTION_COLOR, GAS_PLANT_COLOR, gasTierWords } from './gasFranceFeed.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

const POSITION = Cesium.Cartesian3.fromDegrees(2.3, 48.8, 40);
const record = (kind, site) => ({
  id: site.id, kind, site, position: POSITION,
  point: { show: true, color: null, pixelSize: 0 },
  baseColor: Cesium.Color.fromCssColorString(kind === 'plant' ? GAS_PLANT_COLOR : GAS_INJECTION_COLOR),
  baseSize: 10,
});
const PLANT = record('plant', {
  id: 'gas-plant:martigues@5.02173,43.35914', kind: 'plant', name: 'Martigues',
  lon: 5.02173, lat: 43.35914, mw: 930, operator: 'EDF', status: 'En service',
  inService: true, commissioned: '2012', edition: 2025,
  editions: [2019, 2020, 2021, 2022, 2023, 2024, 2025], supersededBy: [],
});
const INJECTION = record('injection', {
  id: 'gas-injection:550', kind: 'injection', name: 'BIOBEARN', lon: -0.61709, lat: 43.37404,
  gwh: 250.264, tier: 'transport', network: 'Teréga', feedstock: 'Agricole territorial',
  process: 'Méthanisation', commune: 'Mourenx', departement: 'Pyrénées-Atlantiques',
  commissioned: '2022-09-01', expanding: false,
});
const PIPE = record('pipe', {
  id: 'gas-pipe:natran:0', kind: 'pipe', operator: 'natran', km: 12.4,
  departement: 'Moselle', region: 'Grand Est',
});

// Site names, operators, communes, and the register's own status and
// feedstock words are data.
const DATA = ['Martigues', 'EDF', 'En service', 'BIOBEARN', 'Teréga', 'Mourenx',
  'Pyrénées-Atlantiques', 'Agricole territorial', 'Méthanisation', 'Moselle', 'Grand Est',
  'NaTran (ex-GRTgaz)', 'Licence Ouverte'];

test('a pipe card names the network it belongs to, in English', () => {
  const card = withLocale('en', () => buildGasSelectionLabel(PIPE));
  assertNoFrench(card, { allow: DATA });
  assert.match(card, /^NaTran \(ex-GRTgaz\) — transmission network\n/);
  assert.match(card, /⌇ 12\.4 km of published trace/);
  assert.match(card, /Simplified route — accurate to about 250 m, by design/);
  // French, unchanged: the title it always had and the inherited English line.
  const french = withLocale('fr', () => buildGasSelectionLabel(PIPE));
  assert.match(french, /^NaTran \(ex-GRTgaz\) — réseau de transport\n/);
  assert.match(french, /Tracé simplifié — accurate to about 250 m, by design/);
});

test('a gas-fired plant card says installed, never live', () => {
  const card = withLocale('en', () => buildGasSelectionLabel(PLANT));
  assertNoFrench(card, { allow: DATA });
  assert.match(card, /^Martigues\n⚡ 930 MW installed/);
  assert.match(card, /🗓 commissioned 2012/);
  assert.match(card, /Edition 2025 of 7 — installed capacity, not live output/);
  assert.match(withLocale('fr', () => buildGasSelectionLabel(PLANT)), /🗓 mise en service 2012/);
});

test('an injection card says which network it feeds — the layer’s honesty point', () => {
  const card = withLocale('en', () => buildGasSelectionLabel(INJECTION));
  assertNoFrench(card, { allow: DATA });
  assert.match(card, /^BIOBEARN\n♻️ 250 GWh\/yr declared capacity/);
  assert.match(card, /⌇ Transmission · Teréga/);
  const distribution = withLocale('en', () => buildGasSelectionLabel(
    record('injection', { ...INJECTION.site, tier: 'distribution' }),
  ));
  assert.match(distribution, /⌇ Distribution · Teréga/);
  assert.match(distribution, /↳ distribution network — not the trace drawn here/);
  // French: the same two rows, with the tier word it always printed.
  assert.match(withLocale('fr', () => buildGasSelectionLabel(INJECTION)), /⌇ Transport · Teréga/);
  assert.match(withLocale('fr', () => buildGasSelectionLabel(INJECTION)), /♻️ 250 GWh\/an declared capacity/);
});

test('the key names the two networks and the two kinds of site', () => {
  _setGasStateForTest({
    records: new Map(), plants: [PLANT.site], injections: [INJECTION.site],
    operators: [{
      id: 'natran', label: 'NaTran (ex-GRTgaz)', color: '#c08bff',
      strokes: 120, lengthKm: 32_600, departements: 66,
    }],
    siteStats: { plants: { fleetMw: 12_400 } },
    networkStats: { strokes: 120, lengthKm: 36_106 },
  });
  const { legend } = withLocale('en', () => _gasRowControlsForTest());
  assertNoFrench(legend.map(({ label, blurb }) => ({ label, blurb })), { allow: DATA });
  assert.match(legend[0].blurb, /^32,600 km of published trace across 66 departments/);
  assert.equal(legend[1].label, 'Gas-fired plants');
  // 12,400 MW is past the layer's 10 GW threshold, so it drops its decimal.
  assert.match(legend[1].blurb, /^12 GW installed, sized by nameplate power/);
  assert.match(legend[1].blurb, /is the Electricity mix layer\.$/);
  assert.equal(legend[2].label, 'Injection · transmission');
  assert.equal(legend[2].blurb, 'Injects into the transmission network drawn here.');

  // French: départements, « Centrales gaz », and the sibling layer’s French name.
  const french = withLocale('fr', () => _gasRowControlsForTest());
  assert.match(french.legend[0].blurb, /départements — simplified to about 250 m/);
  assert.equal(french.legend[1].label, 'Centrales gaz');
  assert.match(french.legend[1].blurb, /is the Mix élec layer\.$/);
  assert.equal(french.legend[2].label, 'Injection · transport');
});

test('the row’s sentence counts what is drawn, in English', () => {
  _setGasStateForTest({
    records: new Map(), plants: [PLANT.site], injections: [INJECTION.site],
    operators: [], siteStats: null, networkStats: { strokes: 120, lengthKm: 36_106 },
  });
  const stats = withLocale('en', () => gasFranceLayer.getStats());
  assert.match(stats.loadingLabel, /^36,106 km of route · 1 gas-fired plants · 1 injection sites$/);
  const french = withLocale('fr', () => gasFranceLayer.getStats());
  assert.match(french.loadingLabel, /^36\s106 km de tracé · 1 centrales · 1 sites d’injection$/u);
});

test('the numbers and the annual unit follow the reader', () => {
  assert.equal(withLocale('en', () => formatMw(930)), '930 MW');
  assert.equal(withLocale('en', () => formatMw(12_400)), '12 GW');
  assert.equal(withLocale('en', () => formatMw(1_240)), '1.2 GW');
  assert.equal(withLocale('fr', () => formatMw(1_240)), '1,2 GW');
  assert.equal(withLocale('en', () => formatGwhPerYear(15.6)), '15.6 GWh/yr');
  assert.equal(withLocale('fr', () => formatGwhPerYear(15.6)), '15,6 GWh/an');
  assert.equal(withLocale('en', () => formatGwhPerYear(16_311)), '16.3 TWh/yr');
  assert.equal(withLocale('en', () => formatKm(36_106)), '36,106 km');
  assert.equal(withLocale('en', () => gasTierWords('transport').label), 'Transmission');
  assert.equal(withLocale('fr', () => gasTierWords('transport').label), 'Transport');
});
