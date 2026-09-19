// src/data/powerGridNational.test.mjs
// The national pack: how it is cut from the same Overpass answer the viewport
// path serves, what the layer draws of it at which altitude, and — against the
// SHIPPED file — that the pack in the repository is still the country it
// claims to be. The last group is the tripwire for a rebuild that went wrong
// (an empty mirror, a regional database, a serializer that dropped a line).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  POWER_GRID_TIERS,
  POWER_GRID_VOLTAGE_PREFILTER,
  powerGridRollup,
  projectPowerGrid,
  strokeLengthKm,
} from './powerGridFeed.js';
import {
  POWER_GRID_NATIONAL_BACKBONE_ALTITUDE_M,
  POWER_GRID_NATIONAL_BBOX,
  POWER_GRID_NATIONAL_MIN_WAY_M,
  POWER_GRID_NATIONAL_TIER_BLURBS,
  POWER_GRID_NATIONAL_TOLERANCE_M,
  POWER_GRID_NATIONAL_VERSION,
  POWER_GRID_NATIONAL_WIDTH_PX,
  buildPowerGridNationalPack,
  hydratePowerGridNationalPack,
  isYardInternalLine,
  mergeOverpassElements,
  powerGridNationalAgeDays,
  powerGridNationalBand,
  powerGridNationalTileQuery,
  powerGridNationalTiles,
  powerGridStrokeIds,
  simplifyStrokeCoords,
} from './powerGridNational.js';

/** The same captured Saclay answer the viewport tests use. © OSM contributors, ODbL 1.0. */
const OSM = JSON.parse(readFileSync(new URL('./fixtures/power-grid-osm-sample.json', import.meta.url), 'utf8'));
const EVERYWHERE = () => true;
const PACK = buildPowerGridNationalPack(OSM.elements, {
  inFrance: EVERYWHERE,
  builtAt: '2026-09-19T00:00:00.000Z',
  osmBase: '2026-09-19T12:55:16Z',
});

/** Distance in metres from a point to a segment, on the same local plane the simplifier uses. */
function offsetM(lon, lat, a, b) {
  const kx = 111_320 * Math.cos((lat * Math.PI) / 180);
  const ky = 110_574;
  const px = (lon - a[0]) * kx;
  const py = (lat - a[1]) * ky;
  const vx = (b[0] - a[0]) * kx;
  const vy = (b[1] - a[1]) * ky;
  const length2 = vx * vx + vy * vy;
  const t = length2 > 0 ? Math.max(0, Math.min(1, (px * vx + py * vy) / length2)) : 0;
  return Math.hypot(px - vx * t, py - vy * t);
}

test('simplification keeps both ends and never strays past its tolerance', () => {
  const long = OSM.elements.find((element) => element.id === 85226749);
  const mapped = long.geometry.flatMap((point) => [Number(point.lon.toFixed(5)), Number(point.lat.toFixed(5))]);
  const simplified = simplifyStrokeCoords(mapped, POWER_GRID_NATIONAL_TOLERANCE_M);
  assert.ok(simplified.length < mapped.length, 'a 60-vertex 400 kV route loses its in-line pylons');
  assert.deepEqual(simplified.slice(0, 2), mapped.slice(0, 2), 'the first vertex is where the way meets its neighbour');
  assert.deepEqual(simplified.slice(-2), mapped.slice(-2), 'and so is the last');
  // Every MAPPED vertex is within the tolerance of the drawn line — the claim
  // the card and the key make, checked rather than trusted.
  let worst = 0;
  for (let i = 0; i < mapped.length; i += 2) {
    let nearest = Infinity;
    for (let j = 2; j < simplified.length; j += 2) {
      nearest = Math.min(nearest, offsetM(
        mapped[i], mapped[i + 1],
        [simplified[j - 2], simplified[j - 1]],
        [simplified[j], simplified[j + 1]],
      ));
    }
    worst = Math.max(worst, nearest);
  }
  assert.ok(worst <= POWER_GRID_NATIONAL_TOLERANCE_M + 0.5, `worst offset ${worst.toFixed(1)} m`);
  // Idempotent on what cannot be simplified, and never mutates its input.
  assert.deepEqual(simplifyStrokeCoords([1, 2, 3, 4], 50), [1, 2, 3, 4]);
  const before = mapped.slice();
  simplifyStrokeCoords(mapped, 500);
  assert.deepEqual(mapped, before);
});

test('a yard is recognised by its own tags as well as by its length', () => {
  assert.equal(isYardInternalLine({ power: 'line', line: 'busbar' }), true);
  assert.equal(isYardInternalLine({ power: 'line', line: 'Bay' }), true);
  assert.equal(isYardInternalLine({ power: 'line' }), false);
  assert.equal(isYardInternalLine(undefined), false);
  const bays = OSM.elements.filter((element) => isYardInternalLine(element.tags)).map((element) => `w${element.id}`);
  assert.equal(bays.length, 2, 'the captured Saclay yard carries two tagged bays');
  for (const id of bays) assert.ok(!PACK.strokes.some((stroke) => stroke.id === id), `${id} is not a route`);
  assert.equal(PACK.stats.dropped.yardInternal, 2);
});

test('the pack keeps the routes, drops the switchyard, and keeps every OSM way id', () => {
  const viewport = projectPowerGrid(OSM);
  for (const stroke of PACK.strokes) {
    assert.ok(stroke.km * 1000 >= POWER_GRID_NATIONAL_MIN_WAY_M, `${stroke.id} is ${stroke.km} km`);
    assert.match(stroke.id, /^w\d+$/, 'the id is the OSM way id — the handover keys on it');
    const same = viewport.strokes.find((candidate) => candidate.id === stroke.id);
    assert.ok(same, `${stroke.id} is a way the viewport path serves too`);
    // The LENGTH is the mapped way's, not the simplified line's.
    assert.equal(stroke.km, same.km);
    assert.equal(stroke.u ? 1 : 0, same.u);
  }
  const kept = new Set(PACK.strokes.map((stroke) => stroke.id));
  assert.ok(kept.has('w85226749'), 'the 31 km 400 kV route');
  assert.ok(kept.has('w685361021'), 'a 171 m underground cable is a route, not a jumper');
  assert.ok(!kept.has('w22812236'), 'a 60 m way is inside a yard');
  assert.equal(PACK.stats.dropped.short, 3);
});

test('dictionaries are re-interned so the pack carries only what it draws', () => {
  const usedOperators = new Set();
  const usedRoutes = new Set();
  const usedVoltages = new Set();
  for (const item of [...PACK.strokes, ...PACK.substations]) {
    assert.ok(Number.isInteger(item.vi) && item.vi >= 0 && item.vi < PACK.voltages.length);
    usedVoltages.add(item.vi);
    if (item.o !== undefined) { assert.ok(item.o < PACK.operators.length); usedOperators.add(item.o); }
    if (item.n !== undefined) { assert.ok(item.n < PACK.routes.length); usedRoutes.add(item.n); }
    // Absent is ABSENT in the file: no -1 sentinels shipped.
    assert.notEqual(item.o, -1);
    assert.notEqual(item.n, -1);
  }
  assert.equal(usedOperators.size, PACK.operators.length);
  assert.equal(usedRoutes.size, PACK.routes.length);
  assert.equal(usedVoltages.size, PACK.voltages.length);
  // The legend numbers are the shared roll-up over exactly what is shipped.
  const hydrated = hydratePowerGridNationalPack(structuredClone(PACK));
  const { tiers } = powerGridRollup(hydrated.strokes, hydrated.substations, hydrated.voltages);
  assert.deepEqual(PACK.tiers, tiers);
});

test('France only: a pack of a foreign box is empty, not mislabelled', () => {
  const foreign = buildPowerGridNationalPack(OSM.elements, { inFrance: () => false });
  assert.equal(foreign.strokes.length, 0);
  assert.equal(foreign.substations.length, 0);
  assert.equal(foreign.stats.dropped.foreign, PACK.strokes.length);
  assert.throws(() => buildPowerGridNationalPack(OSM.elements, {}), /inFrance/);
});

test('tiles overlap, so the same way from two tiles is one way', () => {
  const merged = mergeOverpassElements([OSM.elements, OSM.elements.slice(0, 10), null]);
  assert.equal(merged.length, OSM.elements.length);
  const node = { type: 'node', id: 85226749 };
  assert.equal(mergeOverpassElements([[node], [{ type: 'way', id: 85226749 }]]).length, 2,
    'identity is type AND id — a node and a way can share a number');
});

test('the build tiles cover France and skip open sea', () => {
  const tiles = powerGridNationalTiles([[-4.8, 47.3, -1.0, 48.9], [8.5, 41.3, 9.6, 43.0]], 2);
  const keys = tiles.map((tile) => tile.key);
  assert.ok(keys.includes('46_-6') && keys.includes('48_-2'), 'Brittany');
  assert.ok(keys.includes('40_8') && keys.includes('42_8'), 'Corsica');
  assert.ok(!keys.includes('44_-6'), 'the Bay of Biscay is not asked for');
  for (const tile of tiles) assert.equal(tile.north - tile.south, 2);
  const query = powerGridNationalTileQuery(tiles[0]);
  assert.ok(query.includes(POWER_GRID_VOLTAGE_PREFILTER), 'the viewport path’s voltage prefilter');
  assert.ok(!/out (geom|center tags|tags) \d/.test(query), 'no output cap: a cap is a hole in a national map');
  assert.ok(!query.includes('tower'), 'no pylons: those are the viewport path’s');
  assert.match(query, /\[maxsize:268435456\]/);
});

test('the altitude bands: backbone from space, the mesh below 600 km, the handover under the ceiling', () => {
  const ceiling = 120_000;
  const national = powerGridNationalBand(2_000_000, ceiling);
  assert.equal(national.id, 'national');
  assert.deepEqual(national.strokeTiers, ['ehv', 'hv-high']);
  assert.deepEqual(national.substationTiers, ['ehv']);
  assert.equal(powerGridNationalBand(POWER_GRID_NATIONAL_BACKBONE_ALTITUDE_M, ceiling).id, 'regional',
    'the mesh arrives AT 600 km, not one metre under it');
  const regional = powerGridNationalBand(300_000, ceiling);
  assert.deepEqual(regional.strokeTiers, POWER_GRID_TIERS.map((tier) => tier.id));
  const local = powerGridNationalBand(80_000, ceiling);
  assert.equal(local.id, 'local');
  assert.deepEqual(local.substationTiers, [], 'under the ceiling the viewport answer owns the yards');
  assert.equal(powerGridNationalBand(Number.NaN, ceiling).id, 'local', 'an unknown altitude never draws the backbone alone');
  // A national stroke is drawn slimmer than a viewport one, and never at zero.
  for (const tier of POWER_GRID_TIERS) {
    assert.ok(POWER_GRID_NATIONAL_WIDTH_PX[tier.id] > 0 && POWER_GRID_NATIONAL_WIDTH_PX[tier.id] < tier.widthPx);
    assert.ok(POWER_GRID_NATIONAL_TIER_BLURBS[tier.id], `${tier.id} has a French blurb`);
  }
});

test('hydration gives the pack the viewport document’s conventions, and refuses a pack it cannot read', () => {
  const hydrated = hydratePowerGridNationalPack(structuredClone(PACK));
  for (const stroke of hydrated.strokes) {
    assert.ok(Number.isInteger(stroke.o) && Number.isInteger(stroke.n));
    assert.ok(stroke.u === 0 || stroke.u === 1);
  }
  for (const substation of hydrated.substations) assert.ok(substation.roleLabel);
  assert.throws(() => hydratePowerGridNationalPack({ ...PACK, version: 99 }), /version 99/);
  assert.throws(() => hydratePowerGridNationalPack(null), /version missing/);
  assert.throws(() => hydratePowerGridNationalPack({ version: POWER_GRID_NATIONAL_VERSION }), /malformed/);
});

test('the handover ids are exactly the viewport answer’s way ids', () => {
  const viewport = projectPowerGrid(OSM);
  const ids = powerGridStrokeIds(viewport);
  assert.equal(ids.size, viewport.strokes.length);
  for (const stroke of PACK.strokes) assert.ok(ids.has(stroke.id));
  assert.equal(powerGridStrokeIds(null).size, 0);
});

test('the pack’s age is read from the OSM base it was built on', () => {
  assert.equal(powerGridNationalAgeDays({ osmBase: '2026-09-01T00:00:00Z' }, Date.parse('2026-09-19T12:00:00Z')), 18);
  assert.equal(powerGridNationalAgeDays({ builtAt: '2026-09-19T00:00:00Z' }, Date.parse('2026-09-19T12:00:00Z')), 0);
  assert.equal(powerGridNationalAgeDays({}), null);
});

// --- The shipped file -------------------------------------------------------

const SHIPPED_TEXT = readFileSync(new URL('./local_data/power_grid_fr/national.json', import.meta.url), 'utf8');
const SHIPPED = JSON.parse(SHIPPED_TEXT);

test('the shipped pack is a whole country, in a version this build reads', () => {
  assert.equal(SHIPPED.version, POWER_GRID_NATIONAL_VERSION);
  // Floors, not exact counts: OSM grows, and a rebuild must not fail CI for
  // gaining a line. What they catch is a mirror that served a region or nothing.
  assert.ok(SHIPPED.strokes.length > 10_000, `${SHIPPED.strokes.length} strokes`);
  assert.ok(SHIPPED.stats.lengthKm > 80_000, `${SHIPPED.stats.lengthKm} km`);
  assert.ok(SHIPPED.substations.length > 4_000, `${SHIPPED.substations.length} substations`);
  for (const tier of POWER_GRID_TIERS) {
    assert.ok(SHIPPED.tiers.some((entry) => entry.id === tier.id), `${tier.label} is present`);
  }
  assert.ok(Number.isFinite(Date.parse(SHIPPED.osmBase)), 'the OSM base is a date the key can print');
  assert.equal(SHIPPED.toleranceM, POWER_GRID_NATIONAL_TOLERANCE_M);
  assert.ok(!SHIPPED.missingTiles?.length, `a pack with a hole in it: ${SHIPPED.missingTiles}`);
});

test('every shipped stroke is a drawable, French, long-enough mapped way', () => {
  const box = POWER_GRID_NATIONAL_BBOX;
  const ids = new Set();
  for (const stroke of SHIPPED.strokes) {
    assert.ok(!ids.has(stroke.id), `${stroke.id} twice`);
    ids.add(stroke.id);
    assert.ok(Array.isArray(stroke.c) && stroke.c.length >= 4 && stroke.c.length % 2 === 0, stroke.id);
    assert.ok(SHIPPED.voltages[stroke.vi]?.tier, `${stroke.id} has a band`);
    assert.ok(stroke.km * 1000 >= POWER_GRID_NATIONAL_MIN_WAY_M, `${stroke.id} is a yard jumper`);
    let inBox = false;
    for (let i = 0; i < stroke.c.length; i += 2) {
      const lon = stroke.c[i];
      const lat = stroke.c[i + 1];
      if (lat >= box.south && lat <= box.north && lon >= box.west && lon <= box.east) { inBox = true; break; }
    }
    assert.ok(inBox, `${stroke.id} never enters France's box`);
  }
  // The simplified line is never LONGER than the mapped way — a simplifier
  // that invented a vertex would show up here first.
  const sample = SHIPPED.strokes.filter((_, index) => index % 97 === 0);
  for (const stroke of sample) assert.ok(strokeLengthKm(stroke.c) <= stroke.km + 0.01, stroke.id);
});

test('the shipped file is one element per line, so a rebuild diffs as the routes that changed', () => {
  const lines = SHIPPED_TEXT.split('\n').filter(Boolean);
  assert.ok(lines.length >= SHIPPED.strokes.length + SHIPPED.substations.length);
  assert.ok(lines.every((line) => line.length < 200_000), 'no line carries the whole pack');
});
