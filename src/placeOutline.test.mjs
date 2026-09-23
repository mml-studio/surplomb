// src/placeOutline.test.mjs — the limits a place search draws (2026-09-23).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { buildDepartementIndex } from './data/franceDepartements.js';
import {
  OUTLINE_COMMUNE_MAX_VERTICES,
  communeAtPointUrl,
  communeOutlineFromReply,
  createPlaceOutlineService,
  departementCodeAt,
  departementOutline,
  parsePlaceOutlineRequest,
  placeOutlineLevelForTypes,
  placeOutlinePointKey,
  regionOutline,
} from './placeOutline.js';

const departements = JSON.parse(fs.readFileSync(
  new URL('./data/local_data/france_departements/departements.geojson', import.meta.url), 'utf8'));
const territoires = JSON.parse(fs.readFileSync(
  new URL('./data/local_data/france_territoires/territoires.json', import.meta.url), 'utf8'));
const index = buildDepartementIndex(departements);
const viteConfig = fs.readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8');

const closed = (ring) => ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1];

test('what a geocode found decides the outline: a region, a département, a town, or none', () => {
  assert.equal(placeOutlineLevelForTypes(['country', 'political']), 'country');
  assert.equal(placeOutlineLevelForTypes(['administrative_area_level_1', 'political']), 'region');
  assert.equal(placeOutlineLevelForTypes(['administrative_area_level_2', 'political']), 'department');
  assert.equal(placeOutlineLevelForTypes(['locality', 'political']), 'municipality');
  assert.equal(placeOutlineLevelForTypes(['postal_town']), 'municipality');
  // A precise place gets a pin, not an outline.
  for (const types of [['street_address'], ['premise'], ['route'], ['point_of_interest'], [], null]) {
    assert.equal(placeOutlineLevelForTypes(types), null, JSON.stringify(types));
  }
});

test('a request names a level and a point, and nothing else gets through', () => {
  const ok = parsePlaceOutlineRequest(new URLSearchParams('level=municipality&lat=43.48&lon=-1.55'));
  assert.deepEqual(ok, { level: 'municipality', lat: 43.48, lon: -1.55 });
  for (const query of ['level=country&lat=1&lon=1', 'level=region&lat=abc&lon=1', 'level=region&lat=91&lon=1',
    'level=region&lon=1', 'lat=1&lon=1', 'level=region&lat=1&lon=200']) {
    assert.ok(parsePlaceOutlineRequest(new URLSearchParams(query)).error, query);
  }
  assert.equal(placeOutlinePointKey(ok), 'municipality|43.480,-1.550');
  assert.equal(communeAtPointUrl(43.48, -1.55),
    'https://geo.api.gouv.fr/communes?lat=43.480000&lon=-1.550000&fields=code,nom&format=geojson&geometry=contour');
});

test('a commune is the one containing the point, its largest pieces kept, closed', () => {
  const square = (x, y, size) => [[x, y], [x + size, y], [x + size, y + size], [x, y + size], [x, y]];
  const reply = {
    type: 'FeatureCollection',
    features: [{
      properties: { code: '64122', nom: 'Biarritz' },
      geometry: {
        type: 'MultiPolygon',
        // A rock offshore listed first, the town second: the town leads.
        coordinates: [[square(-1.57, 43.48, 0.0004)], [[
          [-1.577, 43.447], [-1.555, 43.446], [-1.534, 43.452], [-1.535, 43.47], [-1.541, 43.494],
          [-1.556, 43.494], [-1.566, 43.486], [-1.574, 43.47], [-1.577, 43.447],
        ]]],
      },
    }],
  };
  const outline = communeOutlineFromReply(reply);
  assert.equal(outline.level, 'municipality');
  assert.equal(outline.code, '64122');
  assert.equal(outline.name, 'Biarritz');
  assert.ok(outline.rings.length >= 1);
  assert.equal(outline.rings[0].length, 9, 'the town body, first');
  assert.ok(outline.rings.every(closed));
  assert.equal(communeOutlineFromReply({ type: 'FeatureCollection', features: [] }), null);
  assert.equal(communeOutlineFromReply(null), null);
  assert.ok(OUTLINE_COMMUNE_MAX_VERTICES >= 128, 'one commune under a framed camera keeps its corners');
});

test('a département and a région come from the bundled IGN outlines', () => {
  assert.equal(departementCodeAt(index, 43.4787, -1.558), '64');
  assert.equal(departementCodeAt(index, 48.8566, 2.3522), '75');
  assert.equal(departementCodeAt(index, 51.5074, -0.1278), null, 'London is not in a French département');

  const dep = departementOutline(index, '64');
  assert.equal(dep.name, 'Pyrénées-Atlantiques');
  assert.equal(dep.rings.length, 1);
  assert.ok(dep.rings.every(closed));

  const region = regionOutline(index, territoires, '64');
  assert.equal(region.code, '75');
  assert.equal(region.name, 'Nouvelle-Aquitaine');
  // The mainland body first, then Ré and Oléron; the seams between its
  // twelve départements are gone.
  assert.ok(region.rings[0].length > 400);
  assert.ok(region.rings.length <= 4);
  assert.ok(region.rings.every(closed));
  const idf = regionOutline(index, territoires, '93');
  assert.equal(idf.name, 'Île-de-France');
  assert.equal(idf.rings.length, 1, 'eight départements, one outline');
  assert.equal(regionOutline(index, territoires, 'zz'), null);
});

test('the service keeps what it resolved, and asks geo.api.gouv.fr once per town', async () => {
  const calls = [];
  const service = createPlaceOutlineService({
    loadDepartementIndex: async () => index,
    loadTerritoires: async () => territoires,
    fetchJson: async (url) => {
      calls.push(url);
      return {
        type: 'FeatureCollection',
        features: url.includes('lat=51') ? [] : [{
          properties: { code: '64122', nom: 'Biarritz' },
          geometry: { type: 'Polygon', coordinates: [[[-1.57, 43.45], [-1.53, 43.45], [-1.53, 43.49], [-1.57, 43.49], [-1.57, 43.45]]] },
        }],
      };
    },
  });
  const town = await service.resolve({ level: 'municipality', lat: 43.4787, lon: -1.558 });
  assert.equal(town.name, 'Biarritz');
  await service.resolve({ level: 'municipality', lat: 43.47871, lon: -1.55801 });
  assert.equal(calls.length, 1, 'the same point, rounded to ~100 m, is not asked twice');
  assert.equal(await service.resolve({ level: 'municipality', lat: 51.5, lon: -0.12 }), null);
  assert.equal(await service.resolve({ level: 'municipality', lat: 51.5, lon: -0.12 }), null);
  assert.equal(calls.length, 2, 'a definitive miss is kept too');

  const region = await service.resolve({ level: 'region', lat: 45.76, lon: 4.84 });
  assert.equal(region.name, 'Auvergne-Rhône-Alpes');
  assert.equal((await service.resolve({ level: 'department', lat: 45.76, lon: 4.84 })).code, '69');
  assert.equal(await service.resolve({ level: 'region', lat: 51.5, lon: -0.12 }), null);
  assert.equal(calls.length, 2, 'départements and régions never leave the server');
});

test('the route is mounted on the dev and preview servers', () => {
  assert.match(viteConfig, /middlewares\.use\('\/api\/place-outline'/);
  assert.match(viteConfig, /keylessGeocodeProxy\(\),\s*placeOutlineProxy\(\),/);
});
