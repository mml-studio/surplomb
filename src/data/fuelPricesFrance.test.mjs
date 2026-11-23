// src/data/fuelPricesFrance.test.mjs
// The key of the `fuel-prices-fr` layer: the readings it offers (the drop,
// then the price of each fuel), the lines that switch a band off and on, and
// what the label and the card say under each reading.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fuelShortageMask } from './fuelPricesFeed.js';
import fuelPricesFrance, {
  FUEL_FR_BAND_COLORS,
  FUEL_FR_DEFAULT_PARAMS,
  fuelBandLegend,
  fuelCardCopy,
  fuelHiddenBands,
  fuelLabelPriority,
  fuelSelectionPanel,
  fuelViewChips,
  setFuelPriceCutsForTest,
} from './fuelPricesFrance.js';


const CUTS = Object.freeze({ gazole: [2.04, 2.09, 2.15, 2.21], sp95: [1.97, 1.99, 2.01, 2.09], e85: [0.8, 0.85, 0.9, 0.95] });

const station = Object.freeze({
  id: '56580001',
  brand: 'E.Leclerc',
  city: 'Bréhan',
  address: '16 rue chateaubriand',
  gazole: 2.109,
  gazoleAt: Date.UTC(2026, 10, 23, 8, 10, 1),
  gazoleBefore: 2.329,
  e10: null,
  sp95: 1.989,
  sp95At: Date.UTC(2026, 10, 22, 17, 0, 0),
  e85: null,
  shortage: fuelShortageMask('E85'),
  dropCents: 22,
  e10DropCents: null,
  band: 'forte',
  motorway: false,
});

const tally = (entries) => new Map(Object.entries(entries).map(([key, total]) => [key, { total, visible: total }]));

test('the row opens on the diesel price, offers every fuel, and keeps the drop last', () => {
  const chips = fuelViewChips(FUEL_FR_DEFAULT_PARAMS);
  assert.deepEqual(chips.map((chip) => chip.label), ['Gazole', 'SP95', 'SP98', 'E10', 'E85', 'GPL', 'Baisse']);
  assert.deepEqual(chips.map((chip) => chip.params.vue), ['gazole', 'sp95', 'sp98', 'e10', 'e85', 'gplc', 'baisse']);
  assert.equal(chips.find((chip) => chip.active).params.vue, 'gazole');
  assert.equal(fuelViewChips({}).find((chip) => chip.active).params.vue, 'gazole', 'no params is the default too');
  assert.equal(fuelViewChips({ vue: 'sp95' }).find((chip) => chip.active).label, 'SP95');
});

test('every key line is its own switch, and « Tout afficher » appears only once one is off', () => {
  setFuelPriceCutsForTest(CUTS);
  const legend = fuelBandLegend(tally({ p1: 10, p2: 8, p5: 3, rupture: 2, inconnue: 40 }), { vue: 'gazole', masquees: '' });
  assert.equal(legend[0].heading, true);
  assert.equal(legend[0].label, 'Prix du gazole');
  const lines = legend.slice(1);
  assert.deepEqual(lines.map((line) => line.label), [
    'Moins de 2,04 €', '2,04 à 2,09 €', '2,21 € et plus', 'En rupture', 'Pas de prix',
  ]);
  assert.equal(lines[0].color, FUEL_FR_BAND_COLORS.p1);
  // Each line sends the WHOLE set it would leave hidden.
  assert.deepEqual(lines.map((line) => line.toggle), [
    { param: 'masquees', value: 'p1' },
    { param: 'masquees', value: 'p2' },
    { param: 'masquees', value: 'p5' },
    { param: 'masquees', value: 'rupture' },
    { param: 'masquees', value: 'inconnue' },
  ]);
  assert.ok(fuelViewChips({ vue: 'gazole', masquees: '' }).every((chip) => chip.id !== 'fuel-show-all'));

  // With « En rupture » off: its line stays, dimmed and at zero, and pressing
  // it again sends the set without it; another line adds itself to the set.
  const off = fuelBandLegend(tally({ p1: 10, rupture: 2 }), { vue: 'gazole', masquees: 'rupture' }).slice(1);
  const rupture = off.find((line) => line.label === 'En rupture');
  assert.equal(rupture.off, true);
  assert.equal(rupture.count, 0);
  assert.equal(rupture.toggle.value, '');
  assert.equal(off[0].toggle.value, 'p1,rupture');
  const showAll = fuelViewChips({ vue: 'gazole', masquees: 'rupture' }).at(-1);
  assert.equal(showAll.label, 'Tout afficher');
  assert.deepEqual(showAll.params, { masquees: '' });
});

test('the hidden set ignores what is not a band', () => {
  assert.deepEqual([...fuelHiddenBands({ masquees: 'rupture, p1,,bogus' })], ['rupture', 'p1']);
  assert.equal(fuelHiddenBands({}).size, 0);
});

test('the drop reading keeps its five bands and adds the shortage', () => {
  const legend = fuelBandLegend(tally({ forte: 7151, aucune: 147, rupture: 172, inconnue: 671 }), { vue: 'baisse' });
  assert.equal(legend[0].label, 'Baisse du gazole');
  assert.deepEqual(legend.slice(1).map((line) => line.label), ['Baisse ≥ 18 c', 'Pas encore de baisse', 'En rupture', 'Non mesurable']);
});

test('the label leads with what the colour answers', () => {
  assert.match(fuelCardCopy(station, { params: { vue: 'baisse' } }).title, /^\D22 c · E\.Leclerc$/, 'the change, signed');
  assert.equal(fuelCardCopy(station).title, '2,109 €/L · E.Leclerc', 'by default, the diesel price');
  assert.equal(fuelCardCopy(station, { params: { vue: 'sp95' } }).title, '1,989 €/L · E.Leclerc');
  assert.equal(fuelCardCopy(station, { params: { vue: 'e85' } }).title, 'E.Leclerc', 'no price, no number');
});

test('under a price reading the cheapest station wins its cell; under the drop nothing moves', () => {
  const cheap = fuelLabelPriority({ sp95: 1.899 }, { vue: 'sp95' });
  const dear = fuelLabelPriority({ sp95: 2.199 }, { vue: 'sp95' });
  assert.ok(cheap > dear);
  assert.equal(fuelLabelPriority({ sp95: null }, { vue: 'sp95' }), 0);
  assert.equal(fuelLabelPriority({ gazole: 1.9 }, { vue: 'baisse' }), 0);
  assert.ok(fuelLabelPriority({ gazole: 1.9 }, {}) > 0, 'the default reading is a price reading');
});

test('the card under a price reading lists every fuel sold, the one read first, and the shortage', () => {
  setFuelPriceCutsForTest(CUTS);
  const panel = fuelSelectionPanel(station, { id: '56580001', params: { vue: 'sp95' } });
  assert.equal(panel.metric.value, '1,989 €/L');
  assert.equal(panel.metric.color, FUEL_FR_BAND_COLORS.p2, '1,989 sits between the 1,97 and 1,99 cuts');
  assert.deepEqual(panel.metric.caption, ['Prix du SP95']);
  assert.match(panel.lines[0], /^SP95 : 1,989 €\/L/);
  assert.match(panel.lines[1], /^Gazole : 2,109 €\/L/);
  assert.equal(panel.lines.length, 2);
  assert.ok(panel.meta.includes('En rupture : E85'));

  const none = fuelSelectionPanel(station, { id: '56580001', params: { vue: 'e85' } });
  assert.equal(none.metric, null);
  assert.equal(none.lines[0], 'Pas de prix du E85 récent.');

  const drop = fuelSelectionPanel(station, { id: '56580001', params: { vue: 'baisse' } });
  assert.match(drop.metric.value, /^\D22 c$/);
  assert.equal(fuelSelectionPanel(station, { id: '56580001' }).metric.value, '2,109 €/L');
});

test('the layer re-classifies on the reading and filters on the key lines', () => {
  assert.equal(typeof fuelPricesFrance.setParams, 'function');
  assert.deepEqual(fuelPricesFrance.getParams(), { vue: 'gazole', masquees: '' });
});
