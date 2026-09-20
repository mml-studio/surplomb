// What is built on a cadastral parcel, in English: the count, the ground it
// covers, and the RULE that produced both — a footprint centre inside this
// polygon, which is a measurement this application makes and not a figure
// anyone publishes about the parcel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addressLine, buildingLines, dimensionLine } from './cadastreParcelDetail.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

const SUMMARY = Object.freeze({
  count: 2,
  footprintM2: 1250,
  coverage: 0.42,
  tallestM: 27.1,
  storeys: 7,
  dwellings: 30,
  usages: [{ name: 'Résidentiel', count: 2 }],
  oldest: '1985',
  anonymous: 0,
});

const SQUARE = [[[[2.28, 48.86], [2.2805, 48.86], [2.2805, 48.8604], [2.28, 48.8604], [2.28, 48.86]]]];

test('the building lines read in English, and still name the rule they rest on', () => {
  const lines = withLocale('en', () => buildingLines(SUMMARY));
  assert.deepEqual(lines, [
    '2 buildings · 1,250 m² of footprint · 42% of the parcel',
    'ground + 7 · 27 m tall · 30 dwellings · residential',
    'IGN BD TOPO buildings, joined by footprint centre (no published link)',
  ]);
  assertNoFrench(lines);
  const partial = withLocale('en', () => buildingLines(SUMMARY, true));
  assert.match(partial.at(-1), /partial search$/);
});

test('an empty parcel says so in English, and says differently when the search was bounded', () => {
  const empty = { ...SUMMARY, count: 0 };
  assert.equal(withLocale('en', () => buildingLines(empty, false))[0],
    'No BD TOPO building on this parcel');
  assert.equal(withLocale('en', () => buildingLines(empty, true))[0],
    'No buildings found — partial search (the parcel straddles several tiles)');
});

test('the same lines in French, byte for byte what the card printed before', () => {
  const lines = withLocale('fr', () => buildingLines(SUMMARY)).map((line) => line.replace(/ | /g, ' '));
  assert.equal(lines[0], '2 bâtiments · 1 250 m² au sol · 42 % de la parcelle');
  assert.equal(lines[1], 'R+7 · 27 m de haut · 30 logements · résidentiel');
  assert.equal(lines[2], 'Bâti IGN BD TOPO, joint par centre d\'emprise (aucun lien publié)');
});

test('a distant address point is qualified in English too, and a close one is not', () => {
  const far = { label: '19 Avenue Raymond Poincaré 75116 Paris', distanceM: 54 };
  assert.equal(withLocale('en', () => addressLine(far)),
    '19 Avenue Raymond Poincaré 75116 Paris · address point 54 m away');
  assert.equal(withLocale('fr', () => addressLine(far)).replace(/ | /g, ' '),
    '19 Avenue Raymond Poincaré 75116 Paris · point adresse à 54 m');
  const close = { label: '1 Rue de la Paix 75002 Paris', distanceM: 4 };
  assert.equal(withLocale('en', () => addressLine(close)), '1 Rue de la Paix 75002 Paris');
});

test('the parcel’s longest dimension is named in English', () => {
  assert.match(withLocale('en', () => dimensionLine(SQUARE)), /^Longest dimension \d+ m$/);
  assert.match(withLocale('fr', () => dimensionLine(SQUARE)), /^Plus grande dimension \d+ m$/);
  assert.equal(dimensionLine([]), null);
});
