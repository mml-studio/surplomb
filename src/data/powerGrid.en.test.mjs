// The Power grid layer in English: the card of a line, a pylon and a yard,
// the key of the viewport answer, the key of the national pack, and the row's
// sentence in each of the states it can be in.
//
// HALF OF THIS LAYER WAS ALREADY ENGLISH — the card and the viewport key came
// from upstream and print English on the French globe too. What this file
// pins is the other half: the national pack's key and row line, which were
// French-only, now answer in English while the French stays byte for byte
// what it was.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { projectPowerGrid, substationRoleLabel, powerTierBlurb } from './powerGridFeed.js';
import {
  _powerRowControlsForTest,
  _setPowerGridStateForTest,
  _powerStatsForTest,
  buildPowerSelectionLabel,
  createSubstationOverlayEntry,
  formatGridKmFr,
} from './powerGrid.js';
import { buildPowerGridNationalPack, nationalTierBlurb } from './powerGridNational.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

const OSM = JSON.parse(readFileSync(
  new URL('./fixtures/power-grid-osm-sample.json', import.meta.url), 'utf8',
));
const PAYLOAD = projectPowerGrid(OSM);
const PACK = buildPowerGridNationalPack(OSM.elements, {
  inFrance: () => true,
  builtAt: '2026-07-12T00:00:00.000Z',
  osmBase: '2026-07-12T12:55:16Z',
});

// Substation names, route names and operators are mapped data.
const DATA = ['Poste électrique de Villejust', 'Villejust', 'RTE', 'Carrières',
  'Provence', 'France métropolitaine et Corse'];

test('a substation card answers in English, role included', () => {
  const villejust = PAYLOAD.substations.find((s) => s.ref === 'VLEJU');
  const card = withLocale('en', () => buildPowerSelectionLabel(
    { kind: 'substation', substation: villejust }, PAYLOAD,
  ));
  assertNoFrench(card, { allow: DATA });
  assert.match(card, /400 kV · mapped as 400000;225000;90000/);
  assert.match(card, /Transmission substation/);
  assert.match(card, /Position is the mapped yard’s center/);
  // The French card is the inherited English, with its British spelling.
  assert.match(withLocale('fr', () => buildPowerSelectionLabel(
    { kind: 'substation', substation: villejust }, PAYLOAD,
  )), /Position is the mapped yard’s centre/);
});

test('the substation role a French reader saw as “Poste source” reads in English', () => {
  assert.equal(withLocale('en', () => substationRoleLabel('distribution')),
    'Primary substation (HV → distribution)');
  assert.equal(withLocale('fr', () => substationRoleLabel('distribution')),
    'Poste source (HV → distribution)');
  // A tag this build has never seen is repeated, in both languages.
  assert.equal(withLocale('en', () => substationRoleLabel('minor_distribution')),
    'Tagged minor distribution, at high voltage');
  assert.equal(withLocale('en', () => substationRoleLabel('foo_bar')), 'Tagged foo bar');
  assert.equal(withLocale('en', () => substationRoleLabel('')), 'Substation (role not stated)');
});

test('a line card says the simplification it is drawn with, in English', () => {
  const stroke = { ...PAYLOAD.strokes[0], km: 12.4 };
  const card = withLocale('en', () => buildPowerSelectionLabel(
    { kind: 'stroke', stroke }, { ...PAYLOAD, toleranceM: 50 },
  ));
  assertNoFrench(card, { allow: DATA });
  assert.match(card, /〰 National route simplified to 50 m — zoom below 120 km for the exact one/);
  assert.match(card, /↔ 12\.4 km of this mapped way/);
  assert.match(withLocale('fr', () => buildPowerSelectionLabel(
    { kind: 'stroke', stroke }, { ...PAYLOAD, toleranceM: 50 },
  )), /〰 Tracé national simplifié à 50 m — zoome sous 120 km pour le tracé exact/);
});

test('an unnamed yard’s ambient label says “Substation” in English', () => {
  const entry = withLocale('en', () => createSubstationOverlayEntry(
    { id: 'n1', ref: 'VLEJU', vi: 0 }, { x: 1, y: 2, z: 3 }, PAYLOAD,
  ));
  assert.match(entry.title, /^Substation VLEJU · /);
  const french = withLocale('fr', () => createSubstationOverlayEntry(
    { id: 'n1', ref: 'VLEJU', vi: 0 }, { x: 1, y: 2, z: 3 }, PAYLOAD,
  ));
  assert.match(french.title, /^Poste VLEJU · /);
});

test('the national key names each band in plain words, in both languages', () => {
  _setPowerGridStateForTest({
    payload: null, records: new Map(), enabled: true, national: PACK,
    nationalBandId: 'national',
  });
  const { legend, note } = withLocale('en', () => _powerRowControlsForTest());
  assertNoFrench([...legend.map(({ label, blurb }) => ({ label, blurb })), note], { allow: DATA });
  assert.ok(legend.length, 'the pack draws at least one band');
  assert.equal(legend[0].label, 'Extra-high voltage');
  assert.equal(legend[0].blurb, '400 kV in France: the long-distance backbone, region to region.');
  assert.match(note, /Source: OpenStreetMap \(2026-07-12\)\./);
  assert.match(note, /Zoom in for the exact routes and the substations\.$/);

  // French, same pack: the key a French reader now gets is French.
  const french = withLocale('fr', () => _powerRowControlsForTest());
  assert.equal(french.legend[0].label, 'Très haute tension');
  assert.equal(french.legend[0].blurb, '400 kV en France : les grands axes, d’une région à l’autre.');
  assert.match(french.note, /Source : OpenStreetMap \(2026-07-12\)\./);
});

test('the viewport key is plain words too, and French on a French page', () => {
  _setPowerGridStateForTest({ payload: PAYLOAD, records: new Map(), enabled: true, national: null });
  const en = withLocale('en', () => _powerRowControlsForTest().legend);
  const fr = withLocale('fr', () => _powerRowControlsForTest().legend);
  assertNoFrench(en.map(({ label, blurb }) => ({ label, blurb })), { allow: DATA });
  assert.equal(en.length, fr.length);
  assert.notDeepEqual(en.map((row) => row.blurb), fr.map((row) => row.blurb));
  // The band sentences of the feed are still there for the cards.
  assert.equal(withLocale('en', () => powerTierBlurb('ehv')),
    'The backbone. In France this is the 400 kV grid RTE runs the country on.');
});

test('the two length formatters split the work the way their names say', () => {
  // `formatGridKm` is the inherited English half: US grouping, always.
  assert.equal(withLocale('fr', () => formatGridKmFr(89_058.4)).replace(/\s/g, ' '), '89 058 km');
  assert.equal(withLocale('en', () => formatGridKmFr(89_058.4)), '89,058 km');
  assert.equal(withLocale('en', () => formatGridKmFr(12.34)), '12.3 km');
  assert.equal(withLocale('en', () => nationalTierBlurb('hv-mid')),
    '150 kV, a tier almost absent from France');
});
