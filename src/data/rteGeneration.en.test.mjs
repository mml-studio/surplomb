// The Generating units layer in English: the card of a station, the card of a
// pumping station, the ring-and-disc key and the row's own line.
//
// The two claims the French card was rewritten to make are the two this file
// checks survive translation: an unmeasured station is not a station at zero,
// and a negative value is a machine TAKING power from the grid.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRteLegend,
  buildRteSelectionLabel,
  buildUnitRow,
  createRteStationOverlayEntry,
  formatGenMw,
  formatLoad,
  formatPublishedAge,
  generationErrorFor,
  rtePlacementNote,
} from './rteGeneration.js';
import { rteClassWords, rteProductionTypeLabel } from './rteGenerationFeed.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

const NOW = Date.parse('2026-08-28T13:00:00+02:00');
const POSITION = { x: 1, y: 2, z: 3 };

const unit = (overrides = {}) => ({
  eic: '17W100P100P0130W', name: 'Groupe 01', code: 'GRAV5N01', class: 'nuclear',
  registryMw: 910, installedMw: 910, mw: 905,
  at: Date.parse('2026-08-28T12:00:00+02:00'), regime: 'En service',
  history: [880, 900, 905], reporting: true, ...overrides,
});
const station = (overrides = {}) => ({
  id: 'GRAV5', name: 'Centrale nucléaire de Gravelines', class: 'nuclear',
  commune: 'Gravelines', departement: 'Nord', placement: 'osm-plant',
  placementRef: 'relation/20240158', anchorKm: 1.38, installedMw: 5460, mw: 4730,
  load: 4730 / 5460, reporting: 6, latestAt: Date.parse('2026-08-28T12:00:00+02:00'),
  units: [unit()], ...overrides,
});

// Station names are built at registry-build time and are the plant's name.
const NAMES = ['Centrale nucléaire de Gravelines', 'Station de pompage de Grand-Maison',
  'Gravelines', 'Nord', 'Groupe 01', 'Groupe 7'];

test('the card of a measured station reads in English', () => {
  const card = withLocale('en', () => buildRteSelectionLabel(station(), NOW));
  assertNoFrench(card, { allow: [...NAMES, 'En service'] });
  assert.match(card, /⚡ 4,730 MW of 5,460 MW installed · 87% of its maximum/);
  // TZ=UTC in the suite: the step's 12:00+02:00 is 10:00 on the reader's clock.
  assert.match(card, /🕐 reading for the hour of 10:00, published 60 min ago/);
  assert.match(card, /◈ Nuclear/);
  assert.match(card, /📍 Gravelines · Nord/);
  assert.match(card, /◎ placed on the plant’s footprint as mapped in OpenStreetMap \(1\.4 km from the center of the municipality\)/);
  assert.match(card, /── 1 generating unit ──/);
});

test('the same station, in French, prints exactly what it printed before', () => {
  const card = withLocale('fr', () => buildRteSelectionLabel(station(), NOW));
  assert.match(card, /⚡ 4 730 MW sur 5 460 MW installés · 87 % de son maximum/);
  assert.match(card, /🕐 mesure de l’heure de 10:00, publiée il y a 60 min/);
  assert.match(card, /\(à 1,4 km du centre de la commune\)/);
});

test('an unmeasured station is not a station at zero, in either language', () => {
  const unmeasured = station({
    mw: null, load: null, reporting: 0, latestAt: null,
    units: [unit({ mw: null, at: null, history: null, reporting: false })],
  });
  const card = withLocale('en', () => buildRteSelectionLabel(unmeasured, NOW));
  assertNoFrench(card, { allow: [...NAMES, 'En service'] });
  assert.match(card, /◌ 5,460 MW installed, its maximum/);
  assert.match(card, /RTE published no reading for this plant — this is NOT “it is generating nothing”/);
  assert.doesNotMatch(card, /of its maximum/);
  assert.match(card, /· no reading/);
  // A station whose own capacity is unpublished says that instead.
  const blind = withLocale('en', () => buildRteSelectionLabel(
    station({ mw: null, load: null, installedMw: null, reporting: 0, units: [] }), NOW,
  ));
  assert.match(blind, /◌ installed capacity not published/);
});

test('a pumping station shouts the same verb in English', () => {
  const pumping = station({
    id: 'VAUJA', name: 'Station de pompage de Grand-Maison', class: 'hydro-pumped',
    installedMw: 1690, mw: -1180, load: -1180 / 1690, reporting: 1,
    units: [unit({ name: 'Groupe 7', installedMw: 1690, registryMw: 1690, mw: -1180, history: [940, 0, -1180] })],
  });
  const card = withLocale('en', () => buildRteSelectionLabel(pumping, NOW));
  assertNoFrench(card, { allow: [...NAMES, 'En service'] });
  assert.match(card, /🔌 −1,180 MW of 1,690 MW installed · −70% of its maximum/);
  assert.match(card, /↓ it is TAKING power from the grid instead of supplying it/);
  assert.match(card, /◈ Hydro · pumped storage/);
});

test('a unit row, with and without a reading', () => {
  const measured = withLocale('en', () => buildUnitRow(unit({ registryMw: 1136 })));
  assertNoFrench(measured, { allow: NAMES });
  assert.match(measured, /^Groupe 01 · 905\/910 MW \(register: 1,136 MW\)/);
  assert.match(withLocale('fr', () => buildUnitRow(unit({ registryMw: 1136 }))),
    /\(registre : 1\s136 MW\)/);
  assert.match(withLocale('en', () => buildUnitRow(unit({ mw: null }))), /· no reading$/);
  assert.match(withLocale('en', () => buildUnitRow({})), /^unit · — · no reading$/);
});

test('the key leads with the ring-and-disc grammar, then one row per class', () => {
  const sites = [station(), station({ id: 'VAUJA', class: 'hydro-pumped', mw: null, installedMw: 1690 })];
  const legend = withLocale('en', () => buildRteLegend(sites));
  assertNoFrench(legend.map(({ label, blurb }) => ({ label, blurb })), { allow: ['Rance'] });
  assert.equal(legend[0].label, 'Nuclear');
  assert.match(legend[0].blurb, /^4,730 MW generated of 5,460 MW installed — Fission reactors\./);
  const pumped = legend.find((row) => row.label === 'Hydro · pumped storage');
  assert.match(pumped.blurb, /^1,690 MW installed, no output published — Pumped storage\./);
  assert.match(pumped.blurb, /it generates AND it consumes/i);
  // French, same key.
  assert.equal(withLocale('fr', () => buildRteLegend(sites))[0].label, 'Nucléaire');
});

test('the ambient label and the placement notes answer in English', () => {
  const entry = withLocale('en', () => createRteStationOverlayEntry(
    station({ mw: null, installedMw: 1690 }), POSITION,
  ));
  assert.equal(entry.title, 'Centrale nucléaire de Gravelines · 1,690 MW installed');
  assert.equal(withLocale('en', () => rtePlacementNote('commune-centre')),
    'placed at the center of its municipality: no open source publishes where it is');
  assert.equal(withLocale('en', () => rtePlacementNote('nowhere')), null);
});

test('ages, loads and megawatts take the reader’s typography', () => {
  const at = NOW - 25 * 60_000;
  assert.equal(withLocale('en', () => formatPublishedAge(at, NOW)), '25 min ago');
  assert.equal(withLocale('fr', () => formatPublishedAge(at, NOW)), 'il y a 25 min');
  assert.equal(withLocale('en', () => formatPublishedAge(NOW - 40 * 3_600_000, NOW)), '2 d ago');
  assert.equal(withLocale('en', () => formatPublishedAge(NOW + 60_000, NOW)),
    'published for the hour ahead');
  assert.equal(withLocale('en', () => formatLoad(-0.7)), '−70%');
  assert.equal(withLocale('en', () => formatGenMw(-1180)), '−1,180 MW');
  assert.equal(withLocale('en', () => formatGenMw(12_500)), '12.5 GW');
  assert.equal(withLocale('fr', () => formatGenMw(12_500)), '12,5 GW');
});

test('the row’s error and an unpublished generation type', () => {
  assert.equal(withLocale('en', () => generationErrorFor('failed')), 'RTE output unavailable');
  assert.equal(withLocale('en', () => generationErrorFor('missing')), null);
  assert.equal(withLocale('en', () => rteProductionTypeLabel('')), 'Generation type not published');
  assert.equal(withLocale('en', () => rteProductionTypeLabel('NUCLEAR')), 'Nuclear');
  // An unknown token is repeated rather than flattened, in both languages.
  assert.equal(withLocale('en', () => rteProductionTypeLabel('FOSSIL_COAL_DERIVED_GAS')),
    'production_type=FOSSIL_COAL_DERIVED_GAS');
  assert.equal(withLocale('en', () => rteClassWords('nope').label), 'Other');
});
