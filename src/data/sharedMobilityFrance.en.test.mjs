// Shared vehicles in English: the station card, the vehicle card, the two
// filter chips and the two-channel key.
//
// Two properties have to survive the translation. The chips are a PARTITION
// and say what they cost — an e-bike is a bike, a dock with no published
// inventory counts as a bike dock, and the tooltip states both. And the key
// names its two channels (shape = what, color = who) and closes by refusing
// the sum: the two lists are one population counted twice.
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

test('the two chips are a partition, and say what they cost', () => {
  const labels = withLocale('en', () => SHARED_MOBILITY_KIND_FILTERS.map((filter) => filter.label));
  assertNoFrench(labels);
  assert.deepEqual(labels, ['Bikes', 'Everything else']);
  const m = withLocale('en', () => messages().chipTitles);
  assertNoFrench([m.bikes(' — 84 objects of 168'), m.rest(''), m.active('Bikes', '')]);
  assert.match(m.bikes(''), /^Keep only the bikes\. Pedal bikes and e-bikes, plus the docks that hold them;/);
  assert.match(m.bikes(''), /as GBFS’s own default has it\.$/);
  assert.match(m.rest(''), /^Keep only the rest\. E-scooters, mopeds, shared cars and unnamed form factors/);
  assert.equal(m.active('Bikes', ' — 84 objects of 168'),
    'Bikes only — 84 objects of 168. Press again to see everything.');
  assert.deepEqual(withLocale('fr', () => SHARED_MOBILITY_KIND_FILTERS.map((filter) => filter.label)),
    ['Vélos', 'Le reste']);
});

test('the key names both channels, and refuses the sum', () => {
  const m = withLocale('en', () => messages());
  assertNoFrench([m.channels.shape, m.channels.operator, m.legend.note, m.legend.stationsBlurb]);
  assert.equal(m.channels.shape, 'shape = what');
  assert.equal(m.channels.operator, 'color + letter = who');
  assert.equal(m.legend.note, 'The same set, counted twice.');
  assert.equal(m.legend.stations, 'Docks');
  assert.match(m.legend.vehiclesBlurb, /^Parked and available — GBFS never publishes a vehicle during a rental\.$/);
  assert.equal(m.legend.moreOperators(3), '+3 operators');
  // An operator with no title at all keeps the label it always had.
  assert.equal(withLocale('en', () => resolveMobilityOperator('').label), 'Unknown operator');
  assert.equal(withLocale('fr', () => messages().legend.note), 'Le même ensemble, compté deux fois.');
});
