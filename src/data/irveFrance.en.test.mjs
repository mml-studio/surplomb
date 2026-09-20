// The EV charging layer in English: the card of a station, of a lattice cell
// and of a department, the power-floor chips, the key and the row's sentence.
//
// The two claims this layer is built on have to survive translation: the
// register publishes INSTALLED CAPACITY and never availability, and when
// QualiCharge does answer, its denominator is the plugs it spoke for — not
// the plugs that are installed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import {
  IRVE_POWER_FLOORS,
  buildIrveDepartementLabel,
  buildIrveMeshLabel,
  buildIrveSelectionLabel,
  irveAccessLabel,
  irveBandColor,
  irveBandLabel,
  irveFilingDate,
  irveFloorLabel,
  irveImplantationLabel,
  irvePmrLabel,
  buildIrveLoadingLabel,
} from './irveFrance.js';
import { irveBandWords, irveConnectorLabel } from './irveFeed.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

const site = (overrides = {}) => ({
  id: '48.89155,2.24202', lat: 48.89155, lon: 2.24202,
  name: 'QPARK - LA DÉFENSE - CENTRE GRANDE ARCHE', commune: 'Courbevoie',
  operators: ['IZIVIA'], networks: ['QPARK'], duplicateOperators: [],
  pdcPublished: 224, pdcDistinct: 224,
  bands: { lente: 219, normale: 5, accelere: 0, rapide: 0, hpc: 0, inconnue: 0 },
  topBand: 'normale', peakKW: 22, implantation: 'Parking public', access: 'Accès libre',
  pmr: 'Accessibilité inconnue', connectors: ['type2'], free: false, coordVerified: true,
  updatedFrom: '2025-11-15', updatedTo: '2026-07-30', ...overrides,
});
const record = (overrides = {}) => {
  const value = site(overrides);
  return {
    id: value.id,
    site: value,
    position: Cesium.Cartesian3.fromDegrees(value.lon, value.lat, 12),
    point: { color: null, width: 0, height: 0, show: true },
    baseColor: irveBandColor(value.topBand),
  };
};

// Station names, operators and communes are data.
const DATA = ['QPARK - LA DÉFENSE - CENTRE GRANDE ARCHE', 'Courbevoie', 'IZIVIA', 'QPARK',
  'Hauts-de-Seine'];

test('a charging station card reads in English, capacity only', () => {
  const card = withLocale('en', () => buildIrveSelectionLabel(record()));
  assertNoFrench(card, { allow: DATA });
  assert.match(card, /^QPARK - LA DÉFENSE - CENTRE GRANDE ARCHE\n/);
  assert.match(card, /🔌 224 charge points/);
  assert.match(card, /⚡ 219 × slow · 5 × standard/);
  assert.match(card, /🔗 Type 2/);
  assert.match(card, /🚧 Open access/);
  assert.match(card, /Public car park/);
  assert.match(card, /💶 Paid/);
  assert.match(card, /🗓 filed Nov 15, 2025 → Jul 30, 2026/);
  assert.match(card, /▮ The beam measures charge points/);
  assert.match(card, /Installed capacity — this file does not publish availability/);
  // The one word the English must not invent: availability.
  assert.doesNotMatch(card, /\bavailable\b/i);
});

test('the same station, in French, prints exactly what it printed before', () => {
  const card = withLocale('fr', () => buildIrveSelectionLabel(record()));
  assert.match(card, /🔌 224 points de charge/);
  assert.match(card, /⚡ 219 × lente · 5 × normale/);
  assert.match(card, /🚧 Accès libre/);
  assert.match(card, /🗓 déclaré 15\/11\/2025 → 30\/07\/2026/);
  assert.match(card, /Capacité installée — ce fichier ne publie pas la disponibilité/);
});

test('QualiCharge answers the second question, with its own denominator', () => {
  const at = Date.now() - 8 * 60_000;
  const live = { at, state: { free: 3, busy: 1, other: 0, down: 0, mute: 2 } };
  const card = withLocale('en', () => buildIrveSelectionLabel(record(), live));
  assertNoFrench(card, { allow: DATA });
  assert.match(card, /Installed capacity — this file does not publish availability/);
  assert.match(card, /⚡ QualiCharge — 3 free of 4 · 2 silent · read 8 min ago/);
  assert.doesNotMatch(card, /free of 224/);
  assert.match(withLocale('fr', () => buildIrveSelectionLabel(record(), live)),
    /QualiCharge — 3 libres sur 4 · 2 muettes · relevé il y a 8 min/);
});

test('a power outside the envelope is named, never converted', () => {
  const card = withLocale('en', () => buildIrveSelectionLabel(record({
    topBand: 'inconnue', peakKW: 7360,
    bands: { lente: 0, normale: 0, accelere: 0, rapide: 0, hpc: 0, inconnue: 2 },
  })));
  assert.match(card, /⚠️ Published power outside the envelope — not converted/);
  assert.equal(withLocale('en', () => irveBandLabel('inconnue')), 'Power unknown');
  assert.equal(withLocale('fr', () => irveBandLabel('inconnue')), 'Puissance inconnue');
});

test('the register’s enumerated values are labelled, never rewritten', () => {
  assert.equal(withLocale('en', () => irveAccessLabel('Accès libre')), 'Open access');
  assert.equal(withLocale('en', () => irveAccessLabel('Accès réservé')), 'Restricted access');
  assert.equal(withLocale('en', () => irveImplantationLabel('Voirie')), 'On-street');
  assert.equal(withLocale('en', () => irvePmrLabel('Réservé PMR')),
    'Reserved for drivers with reduced mobility');
  // A value this build has never seen is shown as the file published it.
  assert.equal(withLocale('en', () => irveAccessLabel('Accès sur badge')), 'Accès sur badge');
  assert.equal(withLocale('fr', () => irveImplantationLabel('Voirie')), 'Voirie');
});

test('a lattice cell says it is a cell, and a department says which channel is which', () => {
  const cell = withLocale('en', () => buildIrveMeshLabel({
    site: site({ pdcDistinct: 6, topBand: 'rapide' }), mesh: true,
    cell: { stepDeg: 0.25, pdc: 412, sites: 96 },
  }));
  assertNoFrench(cell, { allow: DATA });
  assert.match(cell, /^Charge-point lattice\n▦ 0\.25° cell — [\d.]+ × [\d.]+ km/);
  assert.match(cell, /🔌 412 charge points across 96 sites/);
  assert.match(cell, /📍 Mark placed on a real site inside the cell — 6 charge points, fast/);
  assert.match(cell, /Zoom in for the operator, the connectors and the access conditions/);

  const dep = withLocale('en', () => buildIrveDepartementLabel({
    code: '92', name: 'Hauts-de-Seine', pdc: 10_240, sites: 3127, areaKm2: 176,
    per1000Km2: 58_181, bands: { rapide: 400, hpc: 120 },
  }));
  assertNoFrench(dep, { allow: DATA });
  assert.match(dep, /^Hauts-de-Seine \(92\)\n🔌 10,240 charge points — the prism’s height/);
  assert.match(dep, /📍 3,127 sites/);
  assert.match(dep, /▦ 58,181 per 1,000 km² — the color \(176 km²\)/);
  assert.match(withLocale('fr', () => buildIrveDepartementLabel({
    code: '92', name: 'Hauts-de-Seine', pdc: 10_240, sites: 3127, areaKm2: 176,
    per1000Km2: 58_181, bands: {},
  })), /▦ 58\s181 pour 1 000 km²/u);
});

test('the power-floor chips keep their thresholds and translate their word', () => {
  assert.deepEqual(withLocale('en', () => IRVE_POWER_FLOORS.map((f) => irveFloorLabel(f))),
    ['ALL', '> 22 kW', '> 50 kW', '> 150 kW']);
  assert.deepEqual(withLocale('fr', () => IRVE_POWER_FLOORS.map((f) => irveFloorLabel(f))),
    ['TOUT', '> 22 kW', '> 50 kW', '> 150 kW']);
});

test('the five power classes and the connectors answer in English', () => {
  assert.deepEqual(
    withLocale('en', () => ['lente', 'normale', 'accelere', 'rapide', 'hpc'].map(irveBandWords)),
    ['Slow (≤ 7.4 kW)', 'Standard (≤ 22 kW)', 'Accelerated (≤ 50 kW)',
      'Fast (≤ 150 kW)', 'High power (> 150 kW)'],
  );
  assert.equal(withLocale('fr', () => irveBandWords('lente')), 'Lente (≤ 7,4 kW)');
  assert.equal(withLocale('en', () => irveConnectorLabel('ef')), 'Type E/F socket');
  assert.equal(withLocale('en', () => irveConnectorLabel('chademo')), 'CHAdeMO');
});

test('a filing date follows the reader', () => {
  assert.equal(withLocale('en', () => irveFilingDate('2023-03-04')), 'Mar 4, 2023');
  assert.equal(withLocale('fr', () => irveFilingDate('2023-03-04')), '04/03/2023');
  assert.equal(withLocale('en', () => irveFilingDate('nope')), null);
});

test('the row’s sentence answers in English in each regime', () => {
  const mesh = withLocale('en', () => buildIrveLoadingLabel({
    regime: 'mesh', loading: false, status: 'ready', hidden: 1306,
    meshPick: { picked: new Array(240), inBox: 3747, thinned: true, stepDeg: 0.25 },
  }));
  assertNoFrench(mesh);
  assert.equal(mesh, '240 cells for 3,747 sites in view · 0.25° lattice locked to the world'
    + ' · 1,306 hidden by the filter · zoom in for the detail');
  const national = withLocale('en', () => buildIrveLoadingLabel({
    regime: 'national', loading: false, status: 'ready',
    national: { pdcAssigned: 148_300, painted: 96, pdcUnassigned: 2410, stale: true },
  }));
  assert.equal(national, '148,300 charge points · 96 departments · 2,410 overseas, not mapped'
    + ' · cached · zoom in for the sites');
  const sites = withLocale('en', () => buildIrveLoadingLabel({
    regime: 'sites', loading: false, status: 'ready', hidden: 312,
    summary: { pdcDistinct: 1240, pdcPublished: 1258, pdcWithheld: 4, truncated: true },
  }));
  assert.equal(sites, '1,240 charge points · 18 duplicates merged · 4 misplaced, set aside'
    + ' · 312 sites hidden by the filter · capped');
  // French, same three states.
  assert.match(withLocale('fr', () => buildIrveLoadingLabel({
    regime: 'sites', loading: false, status: 'ready', hidden: 312,
    summary: { pdcDistinct: 1240, pdcPublished: 1258, pdcWithheld: 4, truncated: true },
  })), /^1\s240 points de charge · 18 doublons fusionnés/u);
});
