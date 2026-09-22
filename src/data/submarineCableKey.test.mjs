import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import {
  LANDING_JOIN_KM,
  cableKeyEntries,
  cablesAtLanding,
  createCableRouteIndex,
  landingCardLines,
  landingCountryLabel,
  landingPlace,
  landingRegionCode,
  landingSelectionPanel,
} from './submarineCableKey.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

const DATA_DIR = new URL('./local_data/telegeography_submarine_cables/', import.meta.url);
const read = (file) => JSON.parse(readFileSync(new URL(file, DATA_DIR), 'utf8'));
// A commercial clone may remove the TeleGeography files (see their README):
// the tests that read them say so rather than fail.
const HAS_DATA = existsSync(new URL('cable-geo.json', DATA_DIR)) && existsSync(new URL('landing-point-geo.json', DATA_DIR));

test('a landing name splits into its place and its country, the Congos included', () => {
  assert.deepEqual(landingPlace('Lannion, France'), { place: 'Lannion', country: 'France' });
  assert.deepEqual(landingPlace('Hermosa Beach, CA, United States'), { place: 'Hermosa Beach, CA', country: 'United States' });
  assert.deepEqual(landingPlace('Muanda, Congo, Dem. Rep.'), { place: 'Muanda', country: 'Congo, Dem. Rep.' });
  assert.deepEqual(landingPlace('Nowhere'), { place: 'Nowhere', country: '' });
});

test('the country reads in the reader’s language, and stays English when nothing matches', () => {
  assert.equal(landingCountryLabel('United Kingdom', 'fr'), 'Royaume-Uni');
  assert.equal(landingCountryLabel('France', 'en'), 'France');
  // The spellings the CLDR does not share, folded or aliased.
  assert.equal(landingCountryLabel('Trinidad and Tobago', 'fr'), 'Trinité-et-Tobago');
  assert.equal(landingCountryLabel('Turkey', 'en'), 'Türkiye');
  assert.equal(landingCountryLabel('Congo, Dem. Rep.', 'fr'), 'Congo-Kinshasa');
  assert.equal(landingCountryLabel('Atlantis', 'fr'), 'Atlantis');
});

test('every landing of the shipped file names a country the runtime can translate', { skip: !HAS_DATA }, () => {
  const unknown = read('landing-point-geo.json').features
    .map((feature) => landingPlace(feature.properties.name).country)
    .filter((country) => !landingRegionCode(country));
  assert.deepEqual([...new Set(unknown)], []);
});

const route = (id, name, coordinates, extra = {}) => ({
  type: 'Feature',
  properties: { id, name, ...extra },
  geometry: { type: 'MultiLineString', coordinates },
});

test('a cable joins a landing when its drawn route comes within 2 km of it, once per cable', () => {
  const index = createCableRouteIndex([
    // Two lines of one system, and a second feature of the same system.
    route('b', 'Bravo', [[[-3.5, 48.8], [-3.46, 48.733]], [[-6, 49], [-7, 50]]]),
    route('b', 'Bravo', [[[-3.46, 48.733], [-2, 47]]]),
    // Ends 1.1 km from the point: lands.
    route('a', 'alpha', [[[-5, 49], [-3.475, 48.733]]]),
    // Passes 5 km off: does not.
    route('c', 'Charlie', [[[-3.46, 48.78], [-3.3, 48.9]]]),
  ]);
  assert.deepEqual(index.map((entry) => entry.id), ['b', 'a', 'c']);
  assert.equal(index[0].coords.length, 12, 'both features of one system are one route');
  assert.equal(LANDING_JOIN_KM, 2);
  assert.deepEqual(cablesAtLanding(index, -3.46, 48.733), [
    { id: 'a', name: 'alpha' },
    { id: 'b', name: 'Bravo' },
  ], 'sorted by name, whatever the case');
  assert.deepEqual(cablesAtLanding(index, Number.NaN, 48), []);
  assert.deepEqual(cablesAtLanding([], -3.46, 48.733), []);
});

test('on the shipped file, Lannion lands two cables and Marseille sixteen', { skip: !HAS_DATA }, () => {
  const index = createCableRouteIndex(read('cable-geo.json').features);
  const landings = new Map(read('landing-point-geo.json').features.map((feature) => [feature.properties.id, feature]));
  const at = (id) => cablesAtLanding(index, ...landings.get(id).geometry.coordinates).map((cable) => cable.name);
  assert.deepEqual(at('lannion-france'), ['Apollo', 'High-capacity Undersea Guernsey Optical-fibre (HUGO)']);
  const marseille = at('marseille-france');
  assert.equal(marseille.length, 16);
  for (const name of ['2Africa', 'PEACE Cable', 'SeaMeWe-6']) assert.ok(marseille.includes(name), name);
});

test('the key names the route and the landing in the colours the map draws them', () => {
  assert.deepEqual(cableKeyEntries({ route: '#39d5ff', landing: '#8fffd2' }), [
    { label: 'Tracé publié', color: '#39d5ff', swatch: 'line' },
    { label: 'Point d’atterrissement', color: '#8fffd2' },
  ]);
});

const LANNION = Object.freeze({ id: 'lannion-france', name: 'Lannion, France' });
const TWO = Object.freeze([{ id: 'apollo', name: 'Apollo' }, { id: 'hugo', name: 'HUGO' }]);

test('the landing card is the place, what it is, and its cables folded under one button', () => {
  const panel = withLocale('fr', () => landingSelectionPanel(LANNION, TWO));
  assert.equal(panel.key, 'landing:lannion-france');
  assert.equal(panel.title, 'Lannion');
  assert.deepEqual(panel.meta, ['Point d’atterrissement · France']);
  assert.deepEqual(panel.lines, []);
  assert.match(panel.footnote, /^Géométries illustratives · câbles dont le tracé passe à moins de 2 km du point$/);
  assert.equal(panel.list.summary, 'Voir les 2 câbles associés');
  assert.deepEqual(panel.list.items, [{ text: 'Apollo' }, { text: 'HUGO' }]);

  const one = withLocale('fr', () => landingSelectionPanel(LANNION, TWO.slice(0, 1)));
  assert.equal(one.list.summary, 'Voir le câble associé');

  // A landing no route reaches says so, and a pending one says it is pending.
  const none = withLocale('fr', () => landingSelectionPanel({ ...LANNION, tbd: true }, []));
  assert.equal(none.list, null);
  assert.deepEqual(none.lines, [
    'Emplacement encore à confirmer selon TeleGeography.',
    'Aucun tracé publié ne touche ce point.',
  ]);
  assert.equal(landingSelectionPanel({ id: 'x' }, []), null);
});

test('on the globe, the card lists the first four cables and counts the rest', () => {
  const six = ['A', 'B', 'C', 'D', 'E', 'F'].map((name) => ({ id: name, name }));
  const card = withLocale('fr', () => landingCardLines({ id: 'm', name: 'Marseille, France' }, six));
  assert.deepEqual(card, {
    title: 'Marseille',
    details: ['Point d’atterrissement · France', '6 câbles arrivent ici', 'A, B, C, D et 2 autres'],
  });
});

test('the key and the card read in English', () => {
  const entries = withLocale('en', () => cableKeyEntries({ route: '#39d5ff', landing: '#8fffd2' }));
  assert.deepEqual(entries.map((entry) => entry.label), ['Published route', 'Landing point']);
  const panel = withLocale('en', () => landingSelectionPanel({ id: 'bude', name: 'Bude, United Kingdom' }, TWO));
  assert.deepEqual(panel.meta, ['Landing point · United Kingdom']);
  assert.equal(panel.list.summary, 'See the 2 connected cables');
  assertNoFrench(panel);
  const card = withLocale('en', () => landingCardLines({ id: 'bude', name: 'Bude, United Kingdom' }, TWO));
  assert.deepEqual(card.details, ['Landing point · United Kingdom', '2 cables land here', 'Apollo, HUGO']);
  assertNoFrench(card);
});
