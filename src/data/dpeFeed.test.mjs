// src/data/dpeFeed.test.mjs
// Pins the UPSTREAM ADEME DPE shape against a real captured page, fetched
// through the very URL `buildDpeUrl` produces. The field list is the fragile
// part: this dataset answers HTTP 400 for an unknown column rather than
// ignoring it, so a renamed field takes the layer down instead of degrading it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DPE_AREA_FIELDS,
  DPE_DEFAULT_RADIUS_M,
  DPE_FIELDS,
  DPE_GRID_M,
  DPE_LABELS,
  DPE_MAX_RADIUS_M,
  DPE_POOR_SHARE_NATIONAL,
  DPE_TILE_PAGE_SIZE,
  buildDpeGridUrl,
  buildDpeTileRowsUrl,
  buildDpeUrl,
  clampDpeRadius,
  finishDpeShape,
  letterCountsTotal,
  parseGeopoint,
  placeDpePointsOnShapes,
  projectDpe,
  projectDpeGrid,
  reduceDpeRowsToPoints,
} from './dpeFeed.js';
import { lambert93ToWgs84, isPlausibleFrenchPoint } from '../../scripts/lib/lambert93.mjs';

const SAMPLE = JSON.parse(readFileSync(
  new URL('./fixtures/ademe-dpe-existant-sample.json', import.meta.url),
  'utf8',
));
// Captured 2026-09-22 through `buildDpeTileRowsUrl` (size cut to 6) over one
// 0.01° tile of Lyon 1er–2e, and through `buildDpeGridUrl` over a 0.04° tile of
// central Paris, trimmed to two communes × two columns × two squares.
const AREA_ROWS = JSON.parse(readFileSync(
  new URL('./fixtures/ademe-dpe-area-rows-sample.json', import.meta.url),
  'utf8',
));
const GRID = JSON.parse(readFileSync(
  new URL('./fixtures/ademe-dpe-grid-sample.json', import.meta.url),
  'utf8',
));

test('the captured page still carries every field the projection reads', () => {
  assert.equal(SAMPLE.total, 2805);
  assert.equal(SAMPLE.results.length, 6);
  const row = SAMPLE.results[0];
  for (const key of ['numero_dpe', 'etiquette_dpe', 'etiquette_ges', 'adresse_ban',
    'identifiant_ban', '_geopoint', '_geo_distance']) {
    assert.ok(Object.hasOwn(row, key), `${key} must still be published`);
  }
  // data-fair omits null columns entirely rather than sending null, so an
  // absent key is data, not a schema change: `annee_construction` is in the
  // schema and simply unset for this building.
  assert.equal(Object.hasOwn(row, 'annee_construction'), false);
});

test('the URL sends geo_distance as lon,lat,radius and asks for no sort', () => {
  const url = new URL(buildDpeUrl({ lon: 2.3760, lat: 48.8300, radiusM: 300, limit: 6 }));
  assert.equal(url.searchParams.get('geo_distance'), '2.376,48.83,300');
  // `sort=_geo_distance` is HTTP 400 — the distance is computed per query, not
  // stored — while geo_distance already returns rows nearest-first.
  assert.equal(url.searchParams.has('sort'), false);
  assert.equal(url.searchParams.get('select'), DPE_FIELDS.join(','));
  const distances = SAMPLE.results.map((row) => row._geo_distance);
  assert.deepEqual([...distances].sort((a, b) => a - b), distances);
});

test('the geopoint is latitude-first, against the argument order of the query', () => {
  // `geo_distance` takes lon,lat — `_geopoint` returns "lat,lon". Reading it
  // the same way round would place every Paris diagnostic off the Somali coast.
  assert.deepEqual(parseGeopoint('48.83005900891943,2.3752209432033315'), {
    lat: 48.83005900891943, lon: 2.3752209432033315,
  });
  assert.equal(parseGeopoint('nonsense'), null);
  assert.equal(parseGeopoint(null), null);
});

test('the projection separates how many exist from how many are served', () => {
  const projected = projectDpe(SAMPLE, { radiusM: 300 });
  // 2,805 diagnostics within 300 m; six of them returned. Collapsing that gap
  // would let a reader take six rows for the whole neighbourhood.
  assert.equal(projected.total, 2805);
  assert.equal(projected.entries.length, 6);
  assert.equal(projected.truncated, true);
});

test('labels are counted as a distribution, never averaged into a grade', () => {
  const projected = projectDpe(SAMPLE, { radiusM: 300 });
  assert.deepEqual(projected.distribution, { A: 0, B: 0, C: 2, D: 1, E: 1, F: 0, G: 2 });
  assert.deepEqual(Object.keys(projected.distribution), [...DPE_LABELS]);
});

test('an out-of-domain label is dropped rather than coerced', () => {
  const projected = projectDpe({ total: 1, results: [{ etiquette_dpe: 'Z', numero_dpe: 'x' }] }, {});
  assert.equal(projected.entries[0].etiquetteDpe, null);
  assert.equal(Object.values(projected.distribution).reduce((a, b) => a + b, 0), 0);
});

test('an entry keeps its position, its distance and its cost', () => {
  const { entries } = projectDpe(SAMPLE, { radiusM: 300 });
  const first = entries[0];
  assert.equal(first.address, '93 Rue du Chevaleret 75013 Paris');
  assert.equal(first.distanceM, 57);
  assert.ok(Number.isFinite(first.lon) && Number.isFinite(first.lat));
  assert.equal(typeof first.annualCostEur, 'number');
  // Absent is null, never zero: a diagnostic with no recorded build year must
  // not read as having been built in year 0.
  assert.equal(first.builtYear, null);
});

test('an empty or missing payload projects to an empty answer, never a throw', () => {
  const projected = projectDpe(null, { radiusM: 200 });
  assert.deepEqual(projected.entries, []);
  assert.equal(projected.total, null);
  assert.equal(projected.truncated, false);
  assert.equal(projected.medianCoutAnnuel, null);
});

test('the radius is clamped rather than trusted', () => {
  assert.equal(clampDpeRadius(99_999), DPE_MAX_RADIUS_M);
  assert.equal(clampDpeRadius(1), 50);
  assert.equal(clampDpeRadius('x'), 200);
  assert.throws(() => buildDpeUrl({ lon: NaN, lat: 48 }), /must be finite/);
});

test('an absent parameter takes the default, not the minimum', () => {
  // FOUND LIVE. `URLSearchParams.get()` returns `null` when a parameter is
  // absent, `Number(null)` is `0`, and `Number.isFinite(0)` is true — so the
  // clamp read "the caller said nothing" as "the caller said zero" and returned
  // its MINIMUM. `GET /api/dpe` with no radius scanned 50 m instead of 200 m and
  // reported `total: 0` for an address with 2,805 diagnostics around it.
  const absent = new URL('http://x/?other=1').searchParams.get('radius');
  assert.equal(absent, null);
  assert.equal(clampDpeRadius(absent), DPE_DEFAULT_RADIUS_M);
  assert.equal(clampDpeRadius(''), DPE_DEFAULT_RADIUS_M);
  assert.equal(clampDpeRadius(undefined), DPE_DEFAULT_RADIUS_M);
  // An EXPLICIT zero is still a request, and is still clamped to the floor.
  assert.equal(clampDpeRadius('0'), 50);
});

/* ── the pivot: the register names the BUILDING, not only the address ──── */

/**
 * A second captured page, from a Marseille point, fetched through the very URL
 * `buildDpeUrl` produces on 2026-09-07.
 *
 * A second fixture rather than a replacement: the Paris one above is a block
 * where NO row carries `id_rnb` — which is 26.3 % of that box and a case the
 * projection has to keep handling — while five of these six do, and the sixth
 * does not. Both halves of the register in two verbatim pages.
 */
const RNB_SAMPLE = JSON.parse(readFileSync(
  new URL('./fixtures/ademe-dpe-rnb-sample.json', import.meta.url),
  'utf8',
));

test('asking for id_rnb is accepted by the dataset, and it is in the pinned selection', () => {
  // This dataset answers HTTP 400 for a column it does not publish, so a field
  // in `DPE_FIELDS` that is absent upstream takes the whole layer down. The
  // captured page is the proof that these two are real columns.
  assert.ok(DPE_FIELDS.includes('id_rnb'));
  assert.ok(DPE_FIELDS.includes('provenance_id_rnb'));
  const row = RNB_SAMPLE.results[0];
  assert.equal(row.id_rnb, '83SJ572HH22P');
  assert.equal(row.provenance_id_rnb, 'Reprise RNB');
});

test('the identifier and its provenance reach the entry the join runs on', () => {
  const { entries } = projectDpe(RNB_SAMPLE, { radiusM: 300 });
  assert.equal(entries[0].rnb, '83SJ572HH22P');
  assert.equal(entries[0].rnbSource, 'Reprise RNB');
});

test('a row the register could not attach to a building says so with null', () => {
  // data-fair omits a null column entirely. `''` or `'null'` here would mint an
  // identifier that names nothing and quietly hand the row to no building.
  const { entries } = projectDpe(RNB_SAMPLE, { radiusM: 300 });
  const orphan = entries.find((entry) => !entry.rnb);
  assert.equal(orphan.rnb, null);
  assert.equal(orphan.rnbSource, null, 'no key, no provenance to report');
});

test('the coverage of the pivot is reported, not assumed', () => {
  // It is the ceiling on what the identity join can reach in this scan, and it
  // moves with the edition — 34.5 % over Ustaritz against 73.7 % over Paris 13e.
  const projected = projectDpe(RNB_SAMPLE, { radiusM: 300 });
  assert.equal(projected.rnbCoverage, 5 / 6);
  assert.equal(projectDpe(SAMPLE, { radiusM: 300 }).rnbCoverage, 0,
    'a block where no row names a building is a real answer, not a broken one');
  assert.equal(projectDpe(null, {}).rnbCoverage, 0);
});

// ── the area regimes ───────────────────────────────────────────────────────
// Above 600 m the layer paints the cadastre. The parcel band reads a tile's
// ROWS (four fields), the section band a 50 m GRID the ADEME aggregates itself.
const BOX = { south: 45.760, west: 4.830, north: 45.770, east: 4.840 };

test('a tile is read with four fields and the largest page data-fair serves', () => {
  const url = new URL(buildDpeTileRowsUrl({ box: BOX }));
  assert.ok(url.pathname.endsWith('/lines'));
  // west,south,east,north — the opposite order from `geo_distance`'s
  // lon,lat,radius, which is exactly the kind of swap this file exists to pin.
  assert.equal(url.searchParams.get('bbox'), '4.83,45.76,4.84,45.77');
  assert.equal(url.searchParams.get('size'), String(DPE_TILE_PAGE_SIZE));
  assert.deepEqual(url.searchParams.get('select').split(','), [...DPE_AREA_FIELDS]);
  // No `page`: data-fair refuses to page past 10 000 rows by number, and the
  // next page is the `after` cursor its answer carries.
  assert.equal(url.searchParams.get('page'), null);
});

test('the captured rows carry exactly the four fields asked for', () => {
  for (const row of AREA_ROWS.results) {
    for (const field of DPE_AREA_FIELDS) assert.ok(field in row, `${field} present`);
  }
});

test('rows fold into one point per geocode, with its letters and its address', () => {
  const rows = [
    ...AREA_ROWS.results,
    // The same doorway filed twice more, once with no letter.
    { ...AREA_ROWS.results[0], etiquette_dpe: 'F' },
    { ...AREA_ROWS.results[0], etiquette_dpe: '' },
    { _geopoint: '', etiquette_dpe: 'D' },
  ];
  const { points, withoutPoint } = reduceDpeRowsToPoints(rows);
  assert.equal(withoutPoint, 1, 'a row with no geocode is counted, never placed at 0,0');
  const first = points.get(AREA_ROWS.results[0]._geopoint);
  assert.equal(first.insee, '69382');
  assert.equal(first.address, '3 Rue des Quatre Chapeaux 69002 Lyon');
  // Latitude first on the wire, longitude first once parsed.
  assert.ok(first.lat > 45 && first.lon < 5);
  assert.equal(first.counts[DPE_LABELS.indexOf('D')], 1);
  assert.equal(first.counts[DPE_LABELS.indexOf('F')], 1);
  assert.equal(first.ungraded, 1);
  const total = [...points.values()].reduce(
    (sum, point) => sum + letterCountsTotal(point.counts) + point.ungraded, 0,
  );
  assert.equal(total, rows.length - 1);
});

test('points fold into the map they are given, so four tiles make one set', () => {
  const into = new Map();
  reduceDpeRowsToPoints(AREA_ROWS.results.slice(0, 3), into);
  reduceDpeRowsToPoints(AREA_ROWS.results.slice(3), into);
  assert.equal(into.size, reduceDpeRowsToPoints(AREA_ROWS.results).points.size);
});

test('placing points counts inside, snapped and unplaced apart', () => {
  const points = [
    { lon: 1, lat: 1, insee: 'a', address: 'A 1', counts: [0, 0, 2, 1, 0, 0, 0], ungraded: 0 },
    { lon: 2, lat: 2, insee: 'a', address: 'A 2', counts: [0, 0, 0, 3, 0, 0, 0], ungraded: 1 },
    { lon: 3, lat: 3, insee: 'a', address: null, counts: [0, 0, 0, 0, 0, 5, 0], ungraded: 0 },
    { lon: 9, lat: 9, insee: 'a', address: 'nowhere', counts: [0, 0, 0, 0, 0, 0, 7], ungraded: 0 },
  ];
  const where = {
    1: { id: 'P1', inside: true },
    2: { id: 'P1', inside: false, distanceM: 1.2 },
    3: { id: 'P2', inside: true, whole: true },
  };
  const placed = placeDpePointsOnShapes(points, (point) => where[point.lon] || null);
  assert.equal(placed.inside, 3 + 5);
  assert.equal(placed.snapped, 4);
  assert.equal(placed.unplaced, 7);
  assert.equal(placed.unplacedPoints, 1);
  const p1 = finishDpeShape(placed.shapes.get('P1'));
  assert.deepEqual(p1.counts, [0, 0, 2, 4, 0, 0, 0]);
  assert.equal(p1.ungraded, 1);
  assert.equal(p1.snapped, 4, 'the card can say how many came from the frontage');
  // Busiest address first.
  assert.deepEqual(p1.addresses, ['A 2', 'A 1']);
  assert.equal(p1.moreAddresses, 0);
  assert.equal(p1.whole, undefined, 'a parcel never carries the section band\'s whole count');
  const p2 = finishDpeShape(placed.shapes.get('P2'));
  assert.equal(p2.whole, 5);
  assert.equal(p2.addresses, undefined, 'a grid square names no address');
});

test('a parcel names its three busiest addresses and counts the rest', () => {
  const points = ['a', 'b', 'c', 'd', 'e'].map((name, i) => ({
    lon: 1, lat: 1, address: name, counts: [i + 1, 0, 0, 0, 0, 0, 0], ungraded: 0,
  }));
  const shape = finishDpeShape(
    placeDpePointsOnShapes(points, () => ({ id: 'P', inside: true })).shapes.get('P'),
  );
  assert.deepEqual(shape.addresses, ['e', 'd', 'c']);
  assert.equal(shape.moreAddresses, 2);
});

test('the grid asks the ADEME for 50 m squares under the commune, over the letters', () => {
  const url = new URL(buildDpeGridUrl({ box: BOX }));
  assert.ok(url.pathname.endsWith('/values_agg'));
  assert.equal(url.searchParams.get('field'),
    'code_insee_ban;coordonnee_cartographique_x_ban;coordonnee_cartographique_y_ban;etiquette_dpe');
  assert.equal(url.searchParams.get('interval'), `value;${DPE_GRID_M};${DPE_GRID_M};value`);
  // No sample rows: the default embeds a 230-field row in every bucket.
  assert.equal(url.searchParams.get('size'), '0');
  assert.equal(url.searchParams.get('bbox'), '4.83,45.76,4.84,45.77');
  assert.throws(() => buildDpeGridUrl({ box: null }));
  assert.throws(() => buildDpeTileRowsUrl({ box: { south: 1, west: 2, north: Number.NaN, east: 4 } }));
});

test('the captured grid projects to squares whose counts add up to its total', () => {
  const { points, total, outside, truncated } = projectDpeGrid(GRID, lambert93ToWgs84, isPlausibleFrenchPoint);
  assert.equal(truncated, false);
  assert.equal(outside, 0);
  const sum = points.reduce((acc, point) => acc + letterCountsTotal(point.counts) + point.ungraded, 0);
  assert.equal(sum, total);
  const first = points[0];
  assert.equal(first.insee, '75105');
  // The square's CENTRE, reprojected: central Paris.
  assert.ok(first.lat > 48.8 && first.lat < 48.9 && first.lon > 2.3 && first.lon < 2.4,
    `${first.lat}, ${first.lon}`);
  assert.equal(first.key, `75105|${first.x}|${first.y}`);
  // The corner is kept for the whole-square test.
  assert.equal(first.x, 652150);
  assert.equal(first.y, 6861050);
});

test('a square that does not land in France is dropped and counted, not drawn at sea', () => {
  const { points, outside } = projectDpeGrid(GRID, () => ({ lon: -30, lat: 10 }), isPlausibleFrenchPoint);
  assert.equal(points.length, 0);
  assert.equal(outside, GRID.total);
});

test('a grid the API capped says so', () => {
  const capped = { ...GRID, aggs: [{ ...GRID.aggs[0], total_other: 12 }] };
  assert.equal(projectDpeGrid(capped, lambert93ToWgs84).truncated, true);
});

test('the national anchor is a property of the REGISTER and is published as a number', () => {
  assert.ok(DPE_POOR_SHARE_NATIONAL > 0 && DPE_POOR_SHARE_NATIONAL < 100);
});
