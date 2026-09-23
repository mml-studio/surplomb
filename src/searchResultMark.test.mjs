// src/searchResultMark.test.mjs — what a place search leaves on the globe.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  SEARCH_PIN_FILL,
  createSearchResultMark,
  fetchPlaceOutline,
  searchMarkPlan,
  searchPinImage,
  shortPlaceLabel,
} from './searchResultMark.js';

const uiSource = fs.readFileSync(new URL('./ui.js', import.meta.url), 'utf8');
const ring = [[-1.57, 43.45], [-1.53, 43.45], [-1.53, 43.49], [-1.57, 43.49], [-1.57, 43.45]];

test('a precise place gets a pin, a town or a région its limits, a country nothing', () => {
  assert.deepEqual(searchMarkPlan({ types: ['street_address'], navigationMode: 'precise-place' }), { kind: 'pin' });
  assert.deepEqual(searchMarkPlan({ types: [], navigationMode: 'precise-place' }), { kind: 'pin' });
  assert.deepEqual(searchMarkPlan({ types: ['route'], navigationMode: 'street-corridor' }), { kind: 'pin' });
  assert.deepEqual(searchMarkPlan({ types: ['locality', 'political'] }), { kind: 'outline', level: 'municipality' });
  assert.deepEqual(searchMarkPlan({ types: ['administrative_area_level_2'] }), { kind: 'outline', level: 'department' });
  assert.deepEqual(searchMarkPlan({ types: ['administrative_area_level_1'] }), { kind: 'outline', level: 'region' });
  assert.deepEqual(searchMarkPlan({ types: ['country'] }), { kind: 'none' });
  assert.deepEqual(searchMarkPlan({ types: ['natural_feature'], navigationMode: 'natural-region-swath' }), { kind: 'none' });
});

test('the name beside the pin is the first part of the label, cut to fit', () => {
  assert.equal(shortPlaceLabel('12 Avenue de la Marne, 64200 Biarritz, France'), '12 Avenue de la Marne');
  assert.equal(shortPlaceLabel('  Rocher   de la Vierge '), 'Rocher de la Vierge');
  assert.equal(shortPlaceLabel(''), '');
  assert.equal(shortPlaceLabel(null), '');
  const long = shortPlaceLabel('x'.repeat(80));
  assert.equal(long.length, 48);
  assert.ok(long.endsWith('…'));
});

test('the pin is a filled drop, not line art', () => {
  const svg = decodeURIComponent(searchPinImage().replace('data:image/svg+xml;charset=utf-8,', ''));
  assert.match(svg, new RegExp(`fill="${SEARCH_PIN_FILL}"`));
  assert.match(svg, /<circle [^>]*fill="#f7f4ea"/, 'an ivory core');
  assert.doesNotMatch(svg, /fill="none"/);
});

test('the outline is asked of the server for France, and a failure is a null, never a throw', async () => {
  const asked = [];
  const ok = await fetchPlaceOutline('municipality', 43.4787, -1.558, {
    fetchImpl: async (url) => { asked.push(url); return { ok: true, json: async () => ({ rings: [ring], name: 'Biarritz' }) }; },
  });
  assert.equal(ok.name, 'Biarritz');
  assert.deepEqual(asked, ['/api/place-outline?level=municipality&lat=43.47870&lon=-1.55800']);
  assert.equal(await fetchPlaceOutline('region', 51.5, -0.12, { fetchImpl: async () => ({ ok: false, status: 404 }) }), null);
  assert.equal(await fetchPlaceOutline('region', 1, 1, { fetchImpl: async () => { throw new Error('offline'); } }), null);
  assert.equal(await fetchPlaceOutline('country', 1, 1, { fetchImpl: async () => { throw new Error('never asked'); } }), null);
  assert.equal(await fetchPlaceOutline('region', 1, 1, { fetchImpl: async () => ({ ok: true, json: async () => ({ rings: [] }) }) }), null);
});

function markWorld({ outline = async () => null, foreign = async () => null } = {}) {
  const drawn = [];
  const mark = createSearchResultMark(null, {
    outline,
    foreignOutline: foreign,
    drawOutline: (_viewer, shapes) => {
      const entry = { shapes, cleared: false };
      drawn.push(entry);
      return { clear() { entry.cleared = true; } };
    },
  });
  return { mark, drawn };
}

test('a town is outlined from France first, then from OpenStreetMap, then pinned', async () => {
  const france = markWorld({ outline: async (level) => (level === 'municipality' ? { rings: [ring] } : null) });
  assert.equal(await france.mark.show({ lat: 43.48, lng: -1.55, types: ['locality'], label: 'Biarritz' }), 'outline');
  assert.equal(france.drawn.length, 1);
  assert.deepEqual(france.drawn[0].shapes[0].parts, [[ring]]);

  let foreignAsk = null;
  const abroad = markWorld({ foreign: async (place) => { foreignAsk = place; return { rings: [ring] }; } });
  assert.equal(await abroad.mark.show({ lat: 40.41, lng: -3.7, types: ['locality'], label: 'Madrid, Spain' }), 'outline');
  assert.equal(foreignAsk.name, 'Madrid', 'OpenStreetMap is asked by the short name');

  const nowhere = markWorld();
  assert.equal(await nowhere.mark.show({ lat: 1, lng: 1, types: ['locality'], label: 'Somewhere' }), 'pin',
    'no limits found: a pin on the centre still says where the search went');
  assert.equal(nowhere.drawn.length, 0);
});

test('one mark at a time: a newer search supersedes one still loading, and clear removes it', async () => {
  let release;
  const slow = new Promise((resolve) => { release = resolve; });
  const { mark, drawn } = markWorld({ outline: () => slow });
  const first = mark.show({ lat: 43.48, lng: -1.55, types: ['locality'], label: 'Biarritz' });
  const second = await mark.show({ lat: 48.85, lng: 2.35, types: ['street_address'], label: '1 rue de Rivoli, Paris' });
  assert.equal(second, 'pin');
  release({ rings: [ring] });
  assert.equal(await first, 'superseded');
  assert.equal(drawn.length, 0, 'the late outline of the older search is never drawn');
  assert.equal(mark.current().kind, 'pin');
  mark.clear();
  assert.equal(mark.current(), null);

  const outlined = markWorld({ outline: async () => ({ rings: [ring] }) });
  await outlined.mark.show({ lat: 43.48, lng: -1.55, types: ['locality'], label: 'Biarritz' });
  outlined.mark.clear();
  assert.equal(outlined.drawn[0].cleared, true);
  assert.equal(await outlined.mark.show({ lat: NaN, lng: 1 }), 'none');
});

test('the globe marks what a search found, and forgets it when the field is emptied', () => {
  const fly = uiSource.slice(uiSource.indexOf('  async flyToAddress('));
  assert.match(fly.slice(0, 6000), /this\._landOnSearchedLocation\(label\);\s*\/\/[^\n]*\n\s*this\._showSearchResult\(destination, label\);/);
  const land = uiSource.slice(uiSource.indexOf('  _landOnSearchedLocation(label) {'));
  assert.match(land.slice(0, 600), /this\._clearSearchResult\(\);/, '« Autour de moi » and every landing clear the old mark');
  assert.match(uiSource, /if \(!this\._locationSearch\.value\.trim\(\)\) this\._clearSearchResult\(\);/);
  // Loaded with the first search, not with the globe.
  assert.match(uiSource, /await import\('\.\/searchResultMark\.js'\)/);
  assert.doesNotMatch(uiSource, /^import .*searchResultMark/m);
});
