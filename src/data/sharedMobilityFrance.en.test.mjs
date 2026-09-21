// Shared vehicles in English: the station card, the vehicle card, and the
// « Mobilités partagées » key — its family control and the words it shares
// with the Vélib' block of the same row.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SHARED_MOBILITY_KIND_FILTERS,
  buildSharedMobilitySelectionLabel,
  vehicleKindLabel,
  vehicleKindPlural,
} from './sharedMobilityFrance.js';
import { gbfsVehicleKindLabel } from './gbfsFeeds.js';
import { resolveMobilityOperator } from './mobilityOperators.js';
import messages from './sharedMobilityFrance.i18n.js';
import operatorMessages from './mobilityOperators.i18n.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

// Operators, systems and station names are data.
const DATA = ['Vélib’', "Vélib'", 'Métropole', 'Vélo’v', "Vélo'v", 'Dott', 'Pony', 'Place de la Bourse'];

const station = (overrides = {}) => ({
  type: 'station',
  system: { name: "Vélib' Métropole" },
  object: {
    name: 'Place de la Bourse',
    available: 7,
    capacity: 11,
    docks: 4,
    byKind: { bike: 5, ebike: 2 },
    ...overrides,
  },
});

test('a dock’s card: what is there, what is free, and the split', () => {
  const lines = withLocale('en', () => buildSharedMobilitySelectionLabel(station()).split('\n'));
  assertNoFrench(lines, { allow: DATA });
  assert.ok(lines.some((line) => line === '🚲 7 bikes available of 11 spaces · 4 free docks'));
  assert.ok(lines.some((line) => line === 'of which 5 pedal bikes and 2 e-bikes'));
  // French, same dock.
  const fr = withLocale('fr', () => buildSharedMobilitySelectionLabel(station()).split('\n'));
  assert.ok(fr.some((line) => line === '🚲 7 vélos disponibles sur 11 places · 4 bornes libres'));
  assert.ok(fr.some((line) => line === 'dont 5 mécaniques et 2 VAE'));
});

test('a dock that publishes no inventory says so, and a suspended one says that', () => {
  const silent = withLocale('en', () => buildSharedMobilitySelectionLabel(
    station({ available: null, byKind: null }),
  ).split('\n'));
  assertNoFrench(silent, { allow: DATA });
  assert.ok(silent.includes('Inventory not published'));
  const closed = withLocale('en', () => buildSharedMobilitySelectionLabel(station({ renting: false })));
  assert.match(closed, /⚠️ Rentals suspended/);
  // A painted bay has no dock: what is free there is ground.
  const bay = withLocale('en', () => buildSharedMobilitySelectionLabel(
    station({ virtual: true, docks: 3 }),
  ));
  assert.match(bay, /3 free spaces/);
});

test('a free-floating vehicle: its kind, its operator, its range and its age', () => {
  const vehicle = {
    type: 'vehicle',
    system: { name: 'Trottinettes Dott Paris' },
    object: { kind: 'scooter', rangeMeters: 12_400, lastReported: Math.round(Date.now() / 1000) - 42 },
  };
  const lines = withLocale('en', () => buildSharedMobilitySelectionLabel(vehicle).split('\n'));
  assertNoFrench(lines, { allow: DATA });
  assert.equal(lines[0], 'E-scooter Dott');
  assert.ok(lines.some((line) => line === '🔋 12.4 km of range'));
  assert.ok(lines.some((line) => line === '⏱ position 42 s ago'));
  assert.equal(withLocale('fr', () => buildSharedMobilitySelectionLabel(vehicle).split('\n'))[0],
    'Trottinette Dott');
});

test('the six vehicle kinds keep the false friends apart', () => {
  const kinds = withLocale('en', () => ['bike', 'ebike', 'scooter', 'moped', 'car', 'other']
    .map((kind) => vehicleKindLabel(kind)));
  assertNoFrench(kinds);
  assert.deepEqual(kinds, ['Bike', 'E-bike', 'E-scooter', 'Moped', 'Car', 'Vehicle']);
  assert.equal(withLocale('en', () => vehicleKindPlural('scooter', 4)), 'E-scooters');
  assert.equal(withLocale('en', () => vehicleKindPlural('ebike', 4)), 'E-bikes');
  assert.equal(withLocale('fr', () => vehicleKindPlural('scooter', 4)), 'Trottinettes');
  // A kind the app does not know is printed as it came.
  assert.equal(withLocale('en', () => gbfsVehicleKindLabel('hovercraft')), null);
  assert.equal(withLocale('en', () => vehicleKindLabel('hovercraft')), 'hovercraft');
});

test('the family control speaks the glossary: a scooter is a moped', () => {
  const labels = withLocale('en', () => SHARED_MOBILITY_KIND_FILTERS.map((filter) => filter.label));
  assertNoFrench(labels);
  assert.deepEqual(labels, ['Bikes', 'E-scooters', 'Mopeds', 'Cars']);
  assert.deepEqual(withLocale('fr', () => SHARED_MOBILITY_KIND_FILTERS.map((filter) => filter.label)),
    ['Vélos', 'Trottinettes', 'Scooters', 'Voitures']);
  const m = withLocale('en', () => messages());
  assertNoFrench([m.filters.all, m.legend.segmentsLabel, m.legend.familyTitle('1,540'),
    m.row.filteredOut, m.row.familyOnly('Mopeds'), m.row.operatorOnly('Lime')]);
  assert.equal(m.filters.all, 'All');
  assert.equal(m.legend.familyTitle('1,540'), '1,540 on screen');
  assert.equal(m.legend.moreOperators(3), '+3 operators');
  assert.equal(withLocale('fr', () => messages().legend.moreOperators(3)), '+3 fournisseurs');
});

test('the key shared with the Vélib\' block reads the same in both languages', () => {
  const m = withLocale('en', () => operatorMessages().legend);
  assertNoFrench([m.operators, m.docks, m.full, m.half, m.low, m.showAll, m.focus('Lime', '608'), m.focused('Lime')]);
  assert.equal(m.operators, 'Operators');
  assert.equal(m.docks, 'Docks');
  assert.equal(m.showAll, 'Show all');
  assert.equal(m.focus('Lime', '608'), 'Show only Lime — 608 here');
  assert.equal(m.focused('Lime'), 'Only Lime on screen. Press again to see everything.');
  assert.deepEqual(withLocale('fr', () => {
    const fr = operatorMessages().legend;
    return [fr.operators, fr.docks, fr.full, fr.half, fr.low, fr.showAll];
  }), ['Fournisseurs', 'Stations', 'bien remplie', 'à moitié', 'presque vide', 'Tout afficher']);
  // An operator with no title at all keeps the label it always had.
  assert.equal(withLocale('en', () => resolveMobilityOperator('').label), 'Unknown operator');
});
