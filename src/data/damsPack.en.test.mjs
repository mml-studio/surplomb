// The Dams & levees layer in English: the card of one structure, the key that
// folds every tier onto the structure axis, and the filter chips.
//
// The distinction this layer exists to make — a dam blocks the water, a levee
// runs alongside it, and OpenStreetMap cannot say whether a levee is flood
// defence or a pond bund — has to survive translation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DAM_STRUCTURE_CHIPS,
  damCardDetails,
  damMaterialLabel,
  damSpanLegend,
  damStructureChip,
  damTierLegend,
} from './damsPack.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

// Structure names, operators and rivers are data.
const DATA = ['Barrage de Bort', 'EDF', 'El Abid', 'CNR', 'SHEM'];

test('the card says who runs it, how big it is and what it sits on — in English', () => {
  const card = withLocale('en', () => damCardDetails({
    name: 'Barrage de Bort', operator: 'EDF', heightM: 120, spanM: 310,
    material: 'béton', builtYear: 1952, hydro: true,
  }));
  assertNoFrench(card, { allow: DATA });
  assert.deepEqual(card, ['EDF', '120 m high · 310 m long · concrete', '1952']);
  // French, unchanged.
  assert.deepEqual(withLocale('fr', () => damCardDetails({
    name: 'Barrage de Bort', operator: 'EDF', heightM: 120, spanM: 310,
    material: 'béton', builtYear: 1952, hydro: true,
  })), ['EDF', '120 m de haut · 310 m de long · béton', '1952']);
});

test('a structure with no operator says what it does, and a disused one says so', () => {
  assert.deepEqual(
    withLocale('en', () => damCardDetails({ hydro: true, outputMw: 135, heightM: 133, river: 'El Abid' })),
    ['hydroelectric · 135 MW', '133 m high', 'El Abid'],
  );
  assert.match(withLocale('en', () => damCardDetails({ abandoned: true, spanM: 60 }))[0], /^Disused$/);
  // A material family this build does not know is printed as the pack has it.
  assert.equal(withLocale('en', () => damMaterialLabel('béton')), 'concrete');
  assert.equal(withLocale('en', () => damMaterialLabel('gabion')), 'gabion');
  assert.equal(withLocale('fr', () => damMaterialLabel('maçonnerie')), 'maçonnerie');
});

test('the key names the two structures and what it is hiding', () => {
  const tally = new Map([
    ['dam:major', { total: 1000, visible: 1000 }],
    ['dam:minor', { total: 4579, visible: 0 }],
    ['dyke:named', { total: 110, visible: 110 }],
    ['dam+dyke:named', { total: 25, visible: 25 }],
    [':named', { total: 12, visible: 12 }],
  ]);
  const legend = withLocale('en', () => damTierLegend(tally));
  assertNoFrench(legend.map(({ label, blurb }) => ({ label, blurb })));
  const byLabel = new Map(legend.map((row) => [row.label, row]));
  assert.equal(byLabel.get('Dam').count, 1000);
  assert.match(byLabel.get('Dam').blurb, /^Blocks the watercourse and holds it back\. — 4579 hidden$/);
  assert.equal(byLabel.get('Levee').blurb,
    'Runs alongside the water. Flood defence or pond bund: unknown.');
  assert.equal(byLabel.get('Dam-levee').blurb, 'Both at once, according to OpenStreetMap.');
  assert.equal(byLabel.get('Unclassified').blurb, 'Outside France: type unknown.');
  // French, same key.
  const french = withLocale('fr', () => damTierLegend(tally));
  assert.ok(french.some((row) => row.label === 'Barrage'));
  assert.match(french.find((row) => row.label === 'Barrage').blurb, /4579 masqués/);
});

test('an unmeasured length is a hollow ring, and says why', () => {
  const rows = withLocale('en', () => damSpanLegend(new Map([['nospan', { total: 1512, visible: 900 }]])));
  assert.equal(rows[0].label, 'Length unknown');
  assert.equal(rows[0].blurb, 'Hollow ring: OpenStreetMap does not publish it.');
  assert.equal(withLocale('fr', () => damSpanLegend(new Map([['nospan', { total: 1512, visible: 900 }]])))[0].label,
    'Longueur inconnue');
});

test('the filter chips keep dams and levees apart, in both languages', () => {
  // `localLayers.js` reads `label` and `title` off these frozen objects when
  // it builds the strip, so both are getters and resolve as they are read.
  const chips = withLocale('en', () => DAM_STRUCTURE_CHIPS.map((chip) => ({
    id: chip.id, label: chip.label, title: chip.title,
  })));
  assertNoFrench(chips);
  assert.deepEqual(chips.map((chip) => chip.label), ['ALL', 'DAMS', 'LEVEES']);
  assert.equal(chips[2].title,
    'Embankments along the water — flood defence or pond, OSM does not say');
  const french = withLocale('fr', () => DAM_STRUCTURE_CHIPS.map((chip) => chip.label));
  assert.deepEqual(french, ['TOUS', 'BARRAGES', 'DIGUES']);
  // The chip a params object selects is found by id, in either language.
  assert.equal(withLocale('en', () => damStructureChip('dykes')).id, 'dykes');
});
