// The geometry behind the Gironde day-of-burning rings, on shapes whose answer
// is known in advance: a square, a disc, an annulus, a fire that walks east.
//
// The real pack cannot tell a wrong contour from a right one — nobody knows the
// "true" ring of 24 July to the hectare — so every piece that can be wrong is
// pinned here on synthetic input first: rasterisation counts the right nodes,
// marching squares closes rings and gets their winding, a hole stays a hole,
// nesting survives simplification, and two runs give the same bytes.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MEGAFIRE_BANDS_EARTH_RADIUS_M,
  MEGAFIRE_BANDS_SCHEMA,
  MEGAFIRE_DAY_BANDS,
  assemblePolygons,
  buildMegafireBands,
  chaikinRing,
  detectionsOutside,
  distanceToRegionM,
  fieldToPolygons,
  gaussianBlur,
  gridToMetres,
  makeBandsGrid,
  maskAgreement,
  pickAnchor,
  pointInRegion,
  rasterizePolygons,
  regionAreaHa,
  regionVertexCount,
  ringAreaHa,
  signedRingArea,
  simplifyDouglasPeucker,
  simplifyRing,
  stampEarliest,
  traceContours,
} from './megafireBandsMath.js';

const LINT = { simplifyM: 30, chaikinIterations: 2, minPolygonHa: 20 };
const BOX = { west: -1.1, south: 44.85, east: -0.98, north: 44.95 };
const grid = makeBandsGrid(BOX, { cellM: 60, marginM: 2000 });

/** A field over `grid`, from a function of metres east and north of its centre. */
function field(fn) {
  const out = new Float32Array(grid.nx * grid.ny);
  for (let j = 0; j < grid.ny; j += 1) {
    for (let i = 0; i < grid.nx; i += 1) out[j * grid.nx + i] = fn(grid.x0 + i * grid.cellM, grid.y0 + j * grid.cellM);
  }
  return out;
}

/** Lon/lat square ring, counter-clockwise, centred on the grid. */
function squareRing(halfM, clockwise = false) {
  const lon = (x) => grid.lonC + x / grid.mPerDegLon;
  const lat = (y) => grid.latC + y / grid.mPerDegLat;
  const ccw = [lon(-halfM), lat(-halfM), lon(halfM), lat(-halfM), lon(halfM), lat(halfM), lon(-halfM), lat(halfM)];
  if (!clockwise) return ccw;
  return [ccw[0], ccw[1], ccw[6], ccw[7], ccw[4], ccw[5], ccw[2], ccw[3]];
}

test('a rasterised 4 km square fills 1 600 ha of nodes, to the cell', () => {
  const mask = rasterizePolygons(grid, [[squareRing(2000)]]);
  const nodes = mask.reduce((s, v) => s + v, 0);
  const ha = (nodes * grid.cellM * grid.cellM) / 1e4;
  assert.ok(Math.abs(ha - 1600) / 1600 < 0.04, `${ha} ha`);
});

test('rasterisation is even-odd within a polygon and a union across polygons', () => {
  const withHole = rasterizePolygons(grid, [[squareRing(2000), squareRing(1000, true)]]);
  const centre = Math.round(-grid.y0 / grid.cellM) * grid.nx + Math.round(-grid.x0 / grid.cellM);
  assert.equal(withHole[centre], 0, 'the hole is empty');
  const covered = rasterizePolygons(grid, [[squareRing(2000), squareRing(1000, true)], [squareRing(1000)]]);
  assert.equal(covered[centre], 1, 'a second polygon over the hole fills it: union, not parity');
  const twice = rasterizePolygons(grid, [[squareRing(2000)], [squareRing(2000)]]);
  assert.equal(twice[centre], 1, 'the same polygon twice does not cancel out');
});

test('the contour of a 2 km disc is one counter-clockwise ring of area πr²', () => {
  const r = 2000;
  const rings = traceContours(field((x, y) => r - Math.hypot(x, y)), grid.nx, grid.ny);
  assert.equal(rings.length, 1);
  assert.ok(signedRingArea(rings[0]) > 0, 'outer rings run counter-clockwise');
  const region = fieldToPolygons(grid, field((x, y) => r - Math.hypot(x, y)), LINT);
  assert.equal(region.length, 1);
  const expected = (Math.PI * r * r) / 1e4;
  const got = regionAreaHa(region);
  assert.ok(Math.abs(got - expected) / expected < 0.01, `${got} ha against ${expected} ha`);
});

test('an annulus keeps its hole, wound clockwise, with the net area', () => {
  const inner = 1200; const outer = 3000;
  const annulus = field((x, y) => Math.min(outer - Math.hypot(x, y), Math.hypot(x, y) - inner));
  const region = fieldToPolygons(grid, annulus, LINT);
  assert.equal(region.length, 1);
  assert.equal(region[0].length, 2, 'outer ring plus one hole');
  assert.ok(ringAreaHa(region[0][0]) > 0, 'outer counter-clockwise');
  assert.ok(ringAreaHa(region[0][1]) < 0, 'hole clockwise');
  const expected = (Math.PI * (outer * outer - inner * inner)) / 1e4;
  assert.ok(Math.abs(regionAreaHa(region) - expected) / expected < 0.01);
  assert.equal(pointInRegion(grid.lonC, grid.latC, region), false, 'the centre is in the hole');
});

test('holes and islands under the 20 ha floor are dropped', () => {
  // A disc of 3 km with a 200 m hole (12.6 ha) and a 200 m speck outside it.
  const f = field((x, y) => Math.max(
    Math.min(3000 - Math.hypot(x, y), Math.hypot(x - 1000, y) - 200),
    200 - Math.hypot(x - 4500, y),
  ));
  const region = fieldToPolygons(grid, f, LINT);
  assert.equal(region.length, 1, 'the speck is gone');
  assert.equal(region[0].length, 1, 'the hole is gone');
});

test('a hole is given to the smallest outer ring around it', () => {
  // Island (r 800) inside a hole (r 1500) inside a disc (r 3500); the island has its own hole (r 300).
  const ring = (r, cw) => {
    const out = [];
    for (let k = 0; k < 64; k += 1) {
      const a = ((cw ? -1 : 1) * k * 2 * Math.PI) / 64;
      out.push(r * Math.cos(a), r * Math.sin(a));
    }
    return out;
  };
  const polygons = assemblePolygons([ring(300, true), ring(3500, false), ring(800, false), ring(1500, true)]);
  assert.equal(polygons.length, 2);
  assert.equal(Math.round(Math.sqrt(signedRingArea(polygons[0][0]) / Math.PI) / 100), 35);
  assert.equal(polygons[0].length, 2, 'the big disc owns the 1 500 m hole');
  assert.ok(Math.abs(Math.sqrt(-signedRingArea(polygons[0][1]) / Math.PI) - 1500) < 10);
  assert.equal(polygons[1].length, 2, 'the island owns the 300 m hole');
  assert.ok(Math.abs(Math.sqrt(-signedRingArea(polygons[1][1]) / Math.PI) - 300) < 10);
});

test('a saddle cell closes its rings whichever way the centre falls', () => {
  // 4 × 4 nodes, the two inner diagonal nodes inside: one saddle cell in the middle.
  for (const centre of [1, -1]) {
    const f = new Float32Array(16).fill(-1);
    f[5] = 1; f[10] = 1; f[6] = centre * 0.2 - 1; f[9] = centre * 0.2 - 1;
    // Nodes 6 and 9 outside; the corner sum is 1 + 1 + 2(±0.2 − 1) = ±0.4, so the centre flips.
    const rings = traceContours(f, 4, 4);
    assert.equal(rings.length, centre > 0 ? 1 : 2, `centre ${centre}`);
    for (const r of rings) assert.ok(signedRingArea(r) > 0);
  }
});

test('Douglas–Peucker keeps both endpoints and every spike above tolerance', () => {
  const line = [];
  for (let i = 0; i <= 100; i += 1) line.push(i * 10, i === 50 ? 80 : Math.sin(i) * 3);
  const out = simplifyDouglasPeucker(line, 30);
  assert.deepEqual(out.slice(0, 2), line.slice(0, 2));
  assert.deepEqual(out.slice(-2), line.slice(-2));
  assert.ok(out.includes(80), 'the 80 m spike survives a 30 m tolerance');
  assert.ok(out.length / 2 <= 5, `${out.length / 2} vertices left of 101`);
  assert.deepEqual(simplifyDouglasPeucker([0, 0, 5, 5], 30), [0, 0, 5, 5]);
});

test('a simplified ring stays within tolerance and keeps its winding', () => {
  const ring = [];
  for (let k = 0; k < 400; k += 1) {
    const a = (k * 2 * Math.PI) / 400;
    ring.push(2000 * Math.cos(a), 2000 * Math.sin(a));
  }
  const out = simplifyRing(ring, 30);
  assert.ok(out.length / 2 < 40, `${out.length / 2} vertices`);
  assert.ok(signedRingArea(out) > 0);
  for (let i = 0; i < out.length; i += 2) assert.ok(Math.abs(Math.hypot(out[i], out[i + 1]) - 2000) < 1e-6);
  assert.ok(Math.abs(signedRingArea(out) - signedRingArea(ring)) / signedRingArea(ring) < 0.02);
});

test('Chaikin doubles the vertices per pass and cuts corners inward only', () => {
  const square = [0, 0, 1000, 0, 1000, 1000, 0, 1000];
  const once = chaikinRing(square, 1);
  const twice = chaikinRing(square, 2);
  assert.equal(once.length, 16);
  assert.equal(twice.length, 32);
  for (let i = 0; i < twice.length; i += 1) assert.ok(twice[i] >= 0 && twice[i] <= 1000);
  assert.ok(signedRingArea(twice) > 0 && signedRingArea(twice) < 1e6);
});

test('the gaussian blur conserves mass away from the border and flattens a constant', () => {
  const nx = 60; const ny = 50;
  const src = new Float32Array(nx * ny);
  src[25 * nx + 30] = 1;
  const out = gaussianBlur(src, nx, ny, 3);
  assert.ok(Math.abs(out.reduce((s, v) => s + v, 0) - 1) < 1e-5);
  const flat = gaussianBlur(new Float32Array(nx * ny).fill(1), nx, ny, 3);
  assert.ok(Math.abs(flat[25 * nx + 30] - 1) < 1e-5, 'a constant interior stays constant');
  assert.ok(flat[0] < 0.35, 'the outside of the grid counts as empty, as on a canvas: a corner keeps ~¼');
  assert.ok(flat[25 * nx] < 0.6, 'an edge keeps ~½');
});

test('a disc stamp keeps the EARLIEST time and reaches R, not further', () => {
  const ci = 100; const cj = 80;
  const lon = grid.lonC + (grid.x0 + ci * grid.cellM) / grid.mPerDegLon;
  const lat = grid.latC + (grid.y0 + cj * grid.cellM) / grid.mPerDegLat;
  const t = stampEarliest(grid, [lon, lon], [lat, lat], [20, 10], 270);
  assert.equal(t[cj * grid.nx + ci], 10);
  assert.equal(t[cj * grid.nx + ci + 4], 10, '240 m east is inside 270 m');
  assert.equal(t[(cj + 4) * grid.nx + ci], 10, '240 m north too');
  assert.equal(t[cj * grid.nx + ci + 5], Infinity, '300 m east is outside');
  assert.equal(t[(cj + 3) * grid.nx + ci + 3], 10, 'the disc is round: 255 m on the diagonal is in');
  assert.equal(t[(cj + 3) * grid.nx + ci + 4], Infinity, '300 m on the (4, 3) diagonal is out');
});

test('areas are spherical: a lon/lat box matches R²·Δλ·Δsin φ, positive counter-clockwise', () => {
  const ring = [-1, 44.9, -0.9, 44.9, -0.9, 45, -1, 45];
  const r = MEGAFIRE_BANDS_EARTH_RADIUS_M;
  const exact = (r * r * 0.1 * (Math.PI / 180) * (Math.sin((45 * Math.PI) / 180) - Math.sin((44.9 * Math.PI) / 180))) / 1e4;
  assert.ok(Math.abs(ringAreaHa(ring) - exact) < 1e-6 * exact);
  assert.ok(ringAreaHa([...ring.slice(6), ...ring.slice(4, 6), ...ring.slice(2, 4), ...ring.slice(0, 2)]) < 0);
});

test('the metric frame round-trips and is metric', () => {
  const [x, y] = gridToMetres(grid, grid.lonC + 0.01, grid.latC + 0.01);
  assert.ok(Math.abs(x - 789) < 3, `${x} m per 0.01° of longitude at 44.9° N`);
  assert.ok(Math.abs(y - 1111) < 2, `${y} m per 0.01° of latitude`);
});

test('an anchor is the northernmost vertex that clears the previous ring and the other labels', () => {
  const region = [[[0, 0, 0.2, 0, 0.2, 0.1, 0.1, 0.12, 0, 0.1]]];
  assert.deepEqual(pickAnchor(region, null, [], { gapM: 2000, spreadM: 4000 }), { lon: 0.1, lat: 0.12, relaxed: 1 });
  const moved = pickAnchor(region, null, [{ lon: 0.1, lat: 0.05 }], { gapM: 2000, spreadM: 4000 });
  assert.equal(moved.lat, 0.1, 'the peak is taken: next-highest vertex 11 km away wins');
  assert.equal(moved.lon, 0);
  const inner = [[[0.05, 0.02, 0.15, 0.02, 0.15, 0.1, 0.05, 0.1]]];
  const cleared = pickAnchor(region, inner, [], { gapM: 2000, spreadM: 4000 });
  assert.ok(distanceToRegionM(cleared.lon, cleared.lat, inner) >= 2000);
});

// ── A fire that walks east through a 10 km square ────────────────────────────

const EPOCH = '2026-07-22T11:55:00Z';
const HALF = 5000;
const synthetic = (() => {
  const lon = (x) => grid.lonC + x / grid.mPerDegLon;
  const lat = (y) => grid.latC + y / grid.mPerDegLat;
  const rect = (east) => [lon(-HALF), lat(-HALF), lon(east), lat(-HALF), lon(east), lat(HALF), lon(-HALF), lat(HALF)];
  // Two mapped images: the western two thirds on 25 July, the whole square on 28 July.
  const event = {
    window: { start: EPOCH, end: '2026-08-01T12:44:00Z' },
    steps: [
      { product: 'MID', acq: '2026-07-25T12:00:00Z', burntHa: 6667, rings: [[rect(HALF / 3)]] },
      { product: 'END', acq: '2026-07-28T12:00:00Z', burntHa: 10000, rings: [[rect(HALF)]] },
    ],
  };
  // One detection every 375 m; the western third burns on 22–23 July, the
  // middle on 24–25, the east on 26 July onwards.
  const minutesAt = ['2026-07-23T01:00:00Z', '2026-07-24T13:00:00Z', '2026-07-27T13:00:00Z']
    .map((iso) => (Date.parse(iso) - Date.parse(EPOCH)) / 60000);
  const rows = [];
  for (let x = -HALF + 150; x < HALF; x += 375) {
    for (let y = -HALF + 150; y < HALF; y += 375) {
      const third = Math.min(2, Math.floor(((x + HALF) / (2 * HALF)) * 3));
      rows.push([lon(x), lat(y), minutesAt[third], 10, 'n', 0]);
    }
  }
  rows.push([lon(0), lat(0), 0, 10, 'n', 0]); // exactly at the window start: band 1 counts it
  return { event, hotspots: { epoch: EPOCH, columns: ['lon', 'lat', 'minutes', 'frp', 'confidence', 'source'], rows } };
})();
const SYN = { calibrationProducts: ['MID'], checkProducts: ['END'], excludedProduct: null };

test('a fire walking east gives three nested regions of about one, two and three thirds', () => {
  const pack = buildMegafireBands({ ...synthetic, params: { ...SYN, radiusM: 400, builtAt: '2026-09-23' } });
  assert.equal(pack.schema, MEGAFIRE_BANDS_SCHEMA);
  assert.deepEqual(pack.bands.map((b) => b.id), MEGAFIRE_DAY_BANDS.map((b) => b.id));
  const shares = pack.bands.map((b) => b.regionHa / pack.footprintHa);
  assert.ok(shares[0] > 0.2 && shares[0] < 0.45, `${shares[0]}`);
  assert.ok(shares[1] > 0.55 && shares[1] < 0.8, `${shares[1]}`);
  assert.equal(shares[2], 1);
  for (let b = 0; b + 1 < pack.bands.length; b += 1) {
    for (const polygon of pack.bands[b].region) {
      for (const ring of polygon) {
        for (let i = 0; i < ring.length; i += 2) {
          const d = distanceToRegionM(ring[i], ring[i + 1], pack.bands[b + 1].region);
          assert.ok(d <= 150, `band ${b} vertex ${d.toFixed(0)} m outside band ${b + 1}`);
        }
      }
    }
  }
  const fills = pack.bands.reduce((s, b) => s + regionAreaHa(b.band), 0);
  assert.ok(Math.abs(fills - pack.footprintHa) / pack.footprintHa < 0.03, `${fills} vs ${pack.footprintHa}`);
  const at = (minutes) => synthetic.hotspots.rows.filter((r) => r[2] === minutes).length;
  const [first, second, third] = [...new Set(synthetic.hotspots.rows.map((r) => r[2]))].filter((m) => m > 0);
  assert.deepEqual(pack.bands.map((b) => b.detections), [at(first) + 1, at(second), at(third)],
    'every detection counted once, the one at the window start in band 1');
});

test('rings do not repeat their first vertex and are rounded to 5 decimals', () => {
  const pack = buildMegafireBands({ ...synthetic, params: { ...SYN, radiusM: 400 } });
  for (const band of pack.bands) {
    for (const polygon of [...band.region, ...band.band]) {
      for (const ring of polygon) {
        assert.ok(ring[0] !== ring[ring.length - 2] || ring[1] !== ring[ring.length - 1]);
        for (const v of ring) assert.equal(v, Math.round(v * 1e5) / 1e5);
      }
    }
  }
  assert.ok(regionVertexCount(pack.bands[2].region) >= 4);
});

test('the build is deterministic: same input, same bytes', () => {
  const a = buildMegafireBands({ ...synthetic, params: { ...SYN, radiusM: 400, builtAt: 'x' } });
  const b = buildMegafireBands({ ...synthetic, params: { ...SYN, radiusM: 400, builtAt: 'x' } });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test('the calibration keeps the SMALLEST radius within 0.005 of the best mean IoU', () => {
  const trace = {};
  const pack = buildMegafireBands({ ...synthetic, params: { ...SYN, radiusCandidatesM: [500, 200, 300, 400] }, trace });
  const radii = trace.calibration.map((c) => c.radiusM);
  assert.deepEqual(radii, [200, 300, 400, 500], 'candidates are tried from the smallest up');
  const best = Math.max(...trace.calibration.map((c) => c.iou));
  const chosen = trace.calibration.find((c) => c.radiusM === pack.method.radiusM);
  assert.ok(chosen.iou >= best - 0.005 - 0.001);
  for (const c of trace.calibration) if (c.radiusM < chosen.radiusM) assert.ok(c.iou < best - 0.005 + 0.001);
  const cal = pack.method.calibration;
  assert.equal(cal.objective, 'iou');
  assert.deepEqual(cal.products, ['MID']);
  assert.equal(cal.chosenIoU, chosen.iou);
  assert.deepEqual(cal.perRadius, trace.calibration.map((c) => ({ radiusM: c.radiusM, iou: c.iou })));
  assert.deepEqual(cal.checks.map((c) => c.product), ['END']);
  assert.ok(cal.fit[0].iou > 0.8, `a fire detected every 375 m fits its own map: ${cal.fit[0].iou}`);
  assert.equal(cal.excluded, undefined, 'nothing excluded, nothing said');
});

test('an excluded image carries the count of detections that outran it', () => {
  const pack = buildMegafireBands({ ...synthetic, params: { ...SYN, radiusM: 400, excludedProduct: 'MID' } });
  assert.equal(pack.method.calibration.excluded.product, 'MID');
  assert.match(pack.method.calibration.excluded.reason, /^lags the detections: 0 of \d+ earlier detections lie > 500 m outside it$/);
});

test('mask agreement counts intersection, union and both one-sided shares', () => {
  const region = [1, 1, 1, 0, 0, -1, 0.5, 0];
  const mapped = [1, 1, 0, 1, 1, 0, 0, 0];
  const a = maskAgreement(region, mapped);
  // region: nodes 0, 1, 2, 6; mapped: 0, 1, 3, 4 → both 2, region only 2, mapped only 2, union 6.
  assert.equal(a.iou, 2 / 6);
  assert.equal(a.copernicusOnly, 2 / 6);
  assert.equal(a.firmsOnly, 2 / 6);
  assert.deepEqual(maskAgreement([0, 0], [0, 0]), { iou: 0, copernicusOnly: 0, firmsOnly: 0 });
});

test('a detection counts as outrunning a perimeter only beyond the distance and before the instant', () => {
  const square = [[[0, 45, 0.1, 45, 0.1, 45.1, 0, 45.1]]];
  // At 45° N: inside; 394 m east of the edge; 1.18 km east; 1.18 km east but too late.
  const out = detectionsOutside(square, [0.05, 0.105, 0.115, 0.115], [45.05, 45.05, 45.05, 45.05], [1, 2, 3, 9], 5, 500);
  assert.deepEqual(out, { outside: 1, total: 3 });
});
