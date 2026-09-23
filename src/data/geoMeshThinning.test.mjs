// The shared thinning policy, and the contract that lets two layers share it.
//
// `irveMesh.test.mjs` already exercises this algorithm hard, through the
// charge-point adapter, with the measurements that argue for every rule. This
// file tests the two things that file cannot: that the generic surface behaves
// on its own terms, and that the two adapters are genuinely the SAME code
// rather than two copies that have started to drift.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MESH_CATEGORY,
  MESH_COLS,
  MESH_LAT,
  MESH_LON,
  MESH_ROWS,
  MESH_WEIGHT,
  byPosition,
  byWeight,
  cellRepresentative,
  meshBudgetForSpan,
  meshRowId,
  meshRowInBox,
  meshRowPriority,
  selectGeoMesh,
  selectGeoMeshWorld,
} from './geoMeshThinning.js';
import { irveMeshBudget, selectIrveMesh, IRVE_MESH_BUDGETS } from './irveMesh.js';
import { schoolsMeshBudget, selectSchoolsMesh, SCHOOLS_MESH_BUDGETS } from './schoolsMesh.js';

const BOX = { south: 40, west: 0, north: 50, east: 10 };
const row = (lat, lon, weight = 1, category = 0) => [lat, lon, weight, category];

/** A dense corner plus a sparse scatter — the shape both layers care about. */
function lumpy() {
  const rows = [];
  for (let i = 0; i < 2000; i += 1) {
    rows.push(row(40.1 + (i % 40) * 0.004, 0.1 + Math.floor(i / 40) * 0.004, 10 + (i % 30), i % 3));
  }
  for (let i = 0; i < 150; i += 1) {
    rows.push(row(41 + (i % 15) * 0.55, 2 + Math.floor(i / 15) * 0.7, 1 + (i % 4), (i + 1) % 3));
  }
  return rows;
}

// --- The extraction contract ------------------------------------------------

test('both adapters delegate to this module, and agree row for row', () => {
  // The point of the extraction. If either adapter ever grows its own copy of
  // the algorithm, these three picks stop matching and this test says so.
  //
  // `stepDeg: 0` on the charge-point side is not a loophole, it is the whole
  // remaining claim: that adapter now asks for a WORLD LATTICE by default —
  // a policy, set in `irveMesh.js` — and this asserts that turning the policy
  // off lands back on the shared algorithm, byte for byte, rather than on a
  // private fork of it.
  const rows = lumpy();
  const budget = 300;
  const generic = selectGeoMesh(rows, { box: BOX, budget });
  const irve = selectIrveMesh(rows, { box: BOX, budget, stepDeg: 0 });
  const schools = selectSchoolsMesh(rows, { box: BOX, budget });

  assert.deepEqual(irve.picked, generic.picked);
  assert.deepEqual(schools.picked, generic.picked);
  assert.equal(irve.inBox, generic.inBox);
  assert.equal(schools.cells, generic.cells);
});

test('a lattice pick is world-locked, complete per cell, and stride-free', () => {
  const rows = lumpy();
  const stepDeg = 0.25;
  const lattice = selectGeoMesh(rows, { box: BOX, budget: 5000, lattice: { stepDeg } });

  // One mark per occupied cell, and not one more: the stride fill is off,
  // because a second dot in a counted cell would be counted twice by anything
  // reading the aggregates.
  assert.equal(lattice.picked.length, lattice.cells);
  assert.equal(lattice.aggregates.length, lattice.picked.length);
  assert.equal(lattice.stepDeg, stepDeg);
  assert.equal(lattice.coarsened, 0);

  // COMPLETE, not sampled: the aggregates account for every row in the box.
  const rowsCounted = lattice.aggregates.reduce((sum, cell) => sum + cell.rows, 0);
  assert.equal(rowsCounted, lattice.inBox);

  // Every mark is a real row, and it sits inside the cell it is the aggregate of.
  for (const [index, row] of lattice.picked.entries()) {
    assert.ok(rows.includes(row));
    assert.ok(lattice.aggregates[index].total >= row[MESH_WEIGHT]);
  }
});

test('the lattice is the same mesh whatever the box, which the view grid is not', () => {
  // G3's own test, run as arithmetic: pan without changing altitude and see
  // whether the aggregation moved. A lattice cell is `floor(lat/step)`, so the
  // box cannot enter the answer; the view-relative grid is a fraction of the
  // box, so it can only move.
  const rows = lumpy();
  const panned = {
    south: BOX.south + 0.3, north: BOX.north + 0.3, west: BOX.west + 0.3, east: BOX.east + 0.3,
  };
  const inBoth = (row) => row[MESH_LAT] >= panned.south && row[MESH_LAT] <= BOX.north
    && row[MESH_LON] >= panned.west && row[MESH_LON] <= BOX.east;

  const before = selectGeoMesh(rows, { box: BOX, budget: 5000, lattice: { stepDeg: 0.25 } });
  const after = selectGeoMesh(rows, { box: panned, budget: 5000, lattice: { stepDeg: 0.25 } });
  const kept = before.picked.filter(inBoth);
  const still = new Set(after.picked);
  assert.ok(kept.length > 0);
  for (const row of kept) {
    assert.ok(still.has(row), 'a row inside both boxes changed its mark when the camera moved');
  }
});

test('a lattice that would overflow its budget coarsens instead of ranking', () => {
  // The one failure the grid exists to prevent: more cells than budget means
  // only the highest-ranked cells win, and the pick is rank-based again. The
  // view grid rules it out by construction; a world lattice has to double its
  // step until it fits, and it stays on the quadtree while doing it.
  const rows = lumpy();
  const tight = selectGeoMesh(rows, { box: BOX, budget: 12, lattice: { stepDeg: 1 / 64 } });
  assert.ok(tight.cells <= 12, `${tight.cells} cells for a budget of 12`);
  assert.ok(tight.coarsened > 0);
  assert.equal(tight.stepDeg, (1 / 64) * 2 ** tight.coarsened);
  assert.equal(tight.picked.length, tight.cells);
});

test('each adapter resolves its own budget from its own ladder', () => {
  // Sharing the algorithm must not mean sharing the tuning. Today the two
  // ladders happen to hold the same numbers; this asserts each adapter reads
  // ITS OWN, so a future re-tune of one cannot silently move the other.
  assert.equal(irveMeshBudget(0.5), IRVE_MESH_BUDGETS[0].budget);
  assert.equal(schoolsMeshBudget(0.5), SCHOOLS_MESH_BUDGETS[0].budget);
  assert.equal(meshBudgetForSpan(0.5, IRVE_MESH_BUDGETS), irveMeshBudget(0.5));
  assert.equal(meshBudgetForSpan(0.5, SCHOOLS_MESH_BUDGETS), schoolsMeshBudget(0.5));
  // And a caller with a different ladder gets a different answer.
  assert.equal(meshBudgetForSpan(0.5, [{ maxLatSpanDeg: Infinity, budget: 7 }]), 7);
});

test('an adapter that omits the budget still gets one from its ladder', () => {
  const rows = lumpy();
  const wide = { south: 40, west: 0, north: 50, east: 10 };
  assert.equal(selectIrveMesh(rows, { box: wide }).budget, irveMeshBudget(10));
  assert.equal(selectSchoolsMesh(rows, { box: wide }).budget, schoolsMeshBudget(10));
});

// --- The generic surface ----------------------------------------------------

test('the tuple slots are fixed, because the wire format depends on them', () => {
  assert.equal(MESH_LAT, 0);
  assert.equal(MESH_LON, 1);
  assert.equal(MESH_WEIGHT, 2);
  assert.equal(MESH_CATEGORY, 3);
});

test('every occupied cell is represented before any cell gets a second dot', () => {
  // The whole reason the pick is stratified rather than ranked.
  const rows = lumpy();
  const pick = selectGeoMesh(rows, { box: BOX, budget: 5000 });
  assert.equal(pick.picked.length, pick.inBox);
  const small = selectGeoMesh(rows, { box: BOX, budget: pick.cells });
  const cellOf = (r) => {
    const col = Math.min(MESH_COLS - 1, Math.floor(((r[MESH_LON] - BOX.west) / 10) * MESH_COLS));
    const gridRow = Math.min(MESH_ROWS - 1, Math.floor(((r[MESH_LAT] - BOX.south) / 10) * MESH_ROWS));
    return gridRow * MESH_COLS + col;
  };
  assert.equal(new Set(small.picked.map(cellOf)).size, small.picked.length);
});

test('the representative is the largest example of the modal category', () => {
  const bucket = [
    row(41, 1, 900, 2), // biggest, but its category is rare here
    row(42, 2, 40, 0),
    row(43, 3, 30, 0),
    row(44, 4, 20, 0),
  ].sort(byWeight);
  const winner = cellRepresentative(bucket);
  assert.equal(winner[MESH_CATEGORY], 0);
  assert.equal(winner[MESH_WEIGHT], 40);
});

test('a tie between equally common categories errs to the lower index', () => {
  // Callers order their ladders so the low end over-claims nothing — slower
  // charging, younger school. The tie-break has to honour that.
  const bucket = [row(41, 1, 10, 1), row(42, 2, 10, 0)].sort(byWeight);
  assert.equal(cellRepresentative(bucket)[MESH_CATEGORY], 0);
});

test('a single-row cell is represented by that row', () => {
  const only = row(41, 1, 5, 3);
  assert.equal(cellRepresentative([only]), only);
});

test('the budget is spent, not left on the table', () => {
  const pick = selectGeoMesh(lumpy(), { box: BOX, budget: 400 });
  assert.equal(pick.picked.length, 400);
});

test('ties break on position, so a still camera does not shimmer', () => {
  const a = row(41, 1, 10, 0);
  const b = row(42, 2, 10, 0);
  assert.ok(byWeight(a, b) < 0);
  assert.ok(byPosition(a, b) < 0);
  const rows = [b, a];
  assert.deepEqual(rows.slice().sort(byWeight), [a, b]);
});

test('a box with no extent resolves to one cell instead of dividing by zero', () => {
  const flat = { south: 45, west: 3, north: 45, east: 3 };
  const pick = selectGeoMesh([row(45, 3, 1, 0), row(45, 3, 2, 0)], { box: flat, budget: 5 });
  assert.equal(pick.cells, 1);
  assert.equal(pick.picked.length, 2);
});

test('a zero or missing budget yields an empty pick that still reports the box', () => {
  const pick = selectGeoMesh(lumpy(), { box: BOX, budget: 0 });
  assert.deepEqual(pick.picked, []);
  assert.ok(pick.inBox > 0);
  assert.equal(pick.thinned, true);
  // No budget at all is the same thing, not an unbounded pick.
  assert.deepEqual(selectGeoMesh(lumpy(), { box: BOX }).picked, []);
});

test('no box means no pick, and no throw', () => {
  const pick = selectGeoMesh(lumpy(), {});
  assert.deepEqual(pick.picked, []);
  assert.equal(pick.inBox, 0);
  assert.doesNotThrow(() => selectGeoMesh());
});

test('a budget ladder that is empty or missing resolves to zero, not NaN', () => {
  assert.equal(meshBudgetForSpan(1, []), 0);
  assert.equal(meshBudgetForSpan(1, null), 0);
  assert.equal(meshBudgetForSpan(NaN, [{ maxLatSpanDeg: Infinity, budget: 5 }]), 5);
});

test('row identity is the coordinate, to 5 decimals', () => {
  assert.equal(meshRowId(row(48.1234567, 2.9876543)), '48.12346,2.98765');
});

test('box membership counts the edges and survives junk', () => {
  assert.equal(meshRowInBox(row(40, 0), BOX), true);
  assert.equal(meshRowInBox(row(50, 10), BOX), true);
  assert.equal(meshRowInBox(row(50.001, 10), BOX), false);
  assert.equal(meshRowInBox('nope', BOX), false);
  assert.equal(meshRowInBox(row(45, 5), undefined), false);
});

// --- World-locked, budget-spending selection ------------------------------------

test('a world pick keeps every mark in view when the view pans over the same rows', () => {
  const rows = lumpy().sort(byPosition);
  const before = selectGeoMeshWorld(rows, { box: BOX, budget: 300 });
  // West, into empty sea: the view holds the same rows.
  const panned = { ...BOX, west: BOX.west - 0.37, east: BOX.east - 0.37 };
  const after = selectGeoMeshWorld(rows, { box: panned, budget: 300 });
  assert.equal(before.stepDeg, after.stepDeg);
  assert.equal(before.fillLevel, after.fillLevel);
  assert.deepEqual(after.picked.map(meshRowId), before.picked.map(meshRowId));
});

test('a world pick nests: a bigger budget adds marks and never swaps them', () => {
  const rows = lumpy().sort(byPosition);
  const small = selectGeoMeshWorld(rows, { box: BOX, budget: 300 });
  const big = selectGeoMeshWorld(rows, { box: BOX, budget: 1200 });
  // Same cells (both fit their half), so the representatives match and the
  // fill of the smaller budget is a subset of the larger one's.
  if (small.stepDeg === big.stepDeg) {
    const bigIds = new Set(big.picked.map(meshRowId));
    for (const r of small.picked) assert.ok(bigIds.has(meshRowId(r)), `${meshRowId(r)} was swapped out`);
  }
  assert.ok(big.picked.length > small.picked.length);
});

test('a world pick spends its budget, keeps the density, and draws a small view whole', () => {
  const rows = lumpy().sort(byPosition);
  const pick = selectGeoMeshWorld(rows, { box: BOX, budget: 300 });
  assert.ok(pick.picked.length <= 300 && pick.picked.length > 150, `${pick.picked.length} picked`);
  assert.ok(pick.cells <= 150, 'the representatives take at most half the budget');
  assert.equal(new Set(pick.picked.map(meshRowId)).size, pick.picked.length, 'no row twice');
  // The dense corner holds 2 000 of the 2 150 rows: it must draw most marks.
  const dense = pick.picked.filter((r) => r[MESH_LAT] < 40.3 && r[MESH_LON] < 0.35).length;
  assert.ok(dense > pick.picked.length / 2, `${dense} of ${pick.picked.length} in the dense corner`);
  // Everything fits under a generous budget: nothing is thinned.
  const all = selectGeoMeshWorld(rows, { box: BOX, budget: 100_000 });
  assert.equal(all.picked.length, rows.length);
  assert.equal(all.thinned, false);
});

test('a world pick keeps the category rule: a tied cell is drawn as its lower category', () => {
  // Two rows in one ~110 m cell, one of each category, and a budget of one.
  const rows = [row(45.0001, 5.0001, 4, 2), row(45.0002, 5.0002, 1, 0)];
  const pick = selectGeoMeshWorld(rows, { box: BOX, budget: 1 });
  assert.equal(pick.picked.length, 1);
  assert.equal(pick.picked[0][MESH_CATEGORY], 0);
});

test('a row’s priority is its own: fixed, in [0, 1), and indifferent to its neighbours', () => {
  const a = row(48.85528, 2.33167);
  assert.equal(meshRowPriority(a), meshRowPriority([...a]));
  const values = lumpy().map(meshRowPriority);
  assert.ok(values.every((v) => v >= 0 && v < 1));
  // Spread, not clumped: the lower half holds about half of the rows.
  const low = values.filter((v) => v < 0.5).length / values.length;
  assert.ok(low > 0.4 && low < 0.6, `${low}`);
});

test('a world pick with no box, no budget or nothing inside says so', () => {
  assert.deepEqual(selectGeoMeshWorld(lumpy(), {}), { picked: [], inBox: 0, budget: 0, thinned: false, cells: 0 });
  const none = selectGeoMeshWorld(lumpy(), { box: BOX, budget: 0 });
  assert.equal(none.picked.length, 0);
  assert.equal(none.thinned, true);
  assert.equal(selectGeoMeshWorld(lumpy(), { box: { south: -10, west: -10, north: -5, east: -5 }, budget: 50 }).inBox, 0);
});

// --- The index changes the speed of a world pick, never its answer -------------
//
// `selectGeoMeshWorld` answers from an index built once per mesh (binary search
// on latitude, cells counted by runs, typed columns for the representative).
// What follows is the implementation it replaced, verbatim — a linear walk of
// every row on every call — and the picks are compared row for row: the same
// row objects in the same order, and the same step, fill level and counts.

function linearRepresentativeOf(rows, indices) {
  const counts = [];
  for (const index of indices) {
    const category = rows[index][MESH_CATEGORY];
    counts[category] = (counts[category] || 0) + 1;
  }
  let modal = -1;
  let most = 0;
  for (let category = 0; category < counts.length; category += 1) {
    if ((counts[category] || 0) > most) {
      most = counts[category];
      modal = category;
    }
  }
  let best = -1;
  for (const index of indices) {
    const row = rows[index];
    if (row[MESH_CATEGORY] !== modal) continue;
    if (best < 0 || (row[MESH_WEIGHT] || 0) > (rows[best][MESH_WEIGHT] || 0)) best = index;
  }
  return best < 0 ? indices[0] : best;
}

function linearSelectGeoMeshWorld(rows, { box, budget, minStepDeg = 1 / 1024 } = {}) {
  if (!box) return { picked: [], inBox: 0, budget: 0, thinned: false, cells: 0 };
  const cap = Math.max(0, Math.floor(Number.isFinite(budget) ? budget : 0));
  const inside = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    if (meshRowInBox(r, box)) inside.push(r);
  }
  const n = inside.length;
  if (!cap || !n) return { picked: [], inBox: n, budget: cap, thinned: n > 0, cells: 0 };
  if (n <= cap) return { picked: inside, inBox: n, budget: cap, thinned: false, cells: 0, stepDeg: null, fillLevel: null };
  const repCap = Math.max(1, Math.floor(cap * 0.5));
  const finest = Math.min(8, Math.max(1 / 4096, minStepDeg));
  const ci = new Int32Array(n);
  const cj = new Int32Array(n);
  let minI = Infinity;
  let maxI = -Infinity;
  let minJ = Infinity;
  let maxJ = -Infinity;
  for (let x = 0; x < n; x += 1) {
    const i = Math.floor(inside[x][MESH_LAT] / finest);
    const j = Math.floor(inside[x][MESH_LON] / finest);
    ci[x] = i;
    cj[x] = j;
    if (i < minI) minI = i;
    if (i > maxI) maxI = i;
    if (j < minJ) minJ = j;
    if (j > maxJ) maxJ = j;
  }
  const keysAt = (level) => {
    const i0 = minI >> level;
    const j0 = minJ >> level;
    const width = (maxJ >> level) - j0 + 1;
    const keys = new Int32Array(n);
    for (let x = 0; x < n; x += 1) keys[x] = ((ci[x] >> level) - i0) * width + ((cj[x] >> level) - j0);
    return keys;
  };
  const countDistinct = (keys) => {
    const seen = new Set();
    for (let x = 0; x < n; x += 1) seen.add(keys[x]);
    return seen.size;
  };
  const maxLevel = Math.max(0, Math.floor(Math.log2(8 / finest)));
  let level = 0;
  while (((maxJ - minJ + 1) * (maxI - minI + 1)) / 4 ** level > 2 ** 30 && level < maxLevel) level += 1;
  let keys = keysAt(level);
  let occupied = countDistinct(keys);
  while (occupied > repCap && level < maxLevel) {
    level = Math.min(maxLevel, level + Math.max(1, Math.ceil(Math.log(occupied / repCap) / Math.log(4))));
    keys = keysAt(level);
    occupied = countDistinct(keys);
  }
  while (level > 0) {
    const finer = keysAt(level - 1);
    if (countDistinct(finer) > repCap) break;
    level -= 1;
    keys = finer;
  }
  const stepDeg = finest * 2 ** level;
  const cells = new Map();
  for (let x = 0; x < n; x += 1) {
    const members = cells.get(keys[x]);
    if (members) members.push(x);
    else cells.set(keys[x], [x]);
  }
  const reps = [];
  for (const members of cells.values()) reps.push(linearRepresentativeOf(inside, members));
  if (reps.length >= cap) {
    const best = reps.map((x) => inside[x]).sort(byWeight).slice(0, cap);
    return { picked: best, inBox: n, budget: cap, thinned: true, cells: cells.size, stepDeg, fillLevel: null };
  }
  const isRep = new Uint8Array(n);
  for (const x of reps) isRep[x] = 1;
  const rowLevel = new Uint8Array(n);
  const histogram = new Uint32Array(256);
  for (let x = 0; x < n; x += 1) {
    if (isRep[x]) continue;
    const p = meshRowPriority(inside[x]);
    const at = p > 0 ? Math.min(255, Math.floor(-4 * Math.log2(p))) : 255;
    rowLevel[x] = at;
    histogram[at] += 1;
  }
  const room = cap - reps.length;
  let fillLevel = 256;
  let drawn = 0;
  while (fillLevel > 0 && drawn + histogram[fillLevel - 1] <= room) {
    fillLevel -= 1;
    drawn += histogram[fillLevel];
  }
  const picked = [];
  for (let x = 0; x < n; x += 1) {
    if (isRep[x] || rowLevel[x] >= fillLevel) picked.push(inside[x]);
  }
  return { picked, inBox: n, budget: cap, thinned: picked.length < n, cells: cells.size, stepDeg, fillLevel };
}

/** A deterministic stream in [0, 1). */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A national mesh in miniature: dense cities, a rural scatter and a few
 * overseas territories across both hemispheres, on ANFR's arc-second lattice
 * so co-sited rows share a coordinate, and a lopsided category mix.
 */
function nationalMesh(seed = 7) {
  const random = seeded(seed);
  const arc = (deg) => Math.round(deg * 3600) / 3600;
  const out = [];
  const add = (lat, lon) => {
    const band = random() < 0.7 ? 4 : Math.floor(random() * 4);
    out.push([Number(arc(lat).toFixed(5)), Number(arc(lon).toFixed(5)), 1 + Math.floor(random() * 4), band]);
  };
  const cities = [[48.86, 2.35, 3000, 0.25], [45.76, 4.84, 1200, 0.15], [43.3, 5.37, 1000, 0.15], [47.22, -1.55, 600, 0.1]];
  for (const [lat, lon, count, spread] of cities) {
    for (let i = 0; i < count; i += 1) add(lat + (random() - 0.5) * spread, lon + (random() - 0.5) * spread * 1.4);
  }
  for (let i = 0; i < 9000; i += 1) add(42.3 + random() * 8.8, -4.8 + random() * 13);
  for (const [lat, lon] of [[-21.1, 55.5], [16.2, -61.5], [-17.6, -149.5], [4.9, -52.3]]) {
    for (let i = 0; i < 250; i += 1) add(lat + (random() - 0.5) * 0.6, lon + (random() - 0.5) * 0.6);
  }
  // Co-sited: the same coordinate twice or three times, as 952 real supports are.
  for (let i = 0; i < 400; i += 1) out.push([...out[Math.floor(random() * out.length)]]);
  return out.sort(byPosition);
}

function viewBoxes(rows, seed = 11) {
  const random = seeded(seed);
  const boxes = [
    { south: 41, north: 51.5, west: -5.5, east: 10 },
    { south: -60, north: 70, west: -179, east: 179 },
    { south: 48.5, north: 49.1, west: 1.9, east: 2.8 },
    { south: 48.84, north: 48.88, west: 2.3, east: 2.36 },
    { south: -22, north: -20, west: 54.5, east: 56.5 },
    { south: 60, north: 61, west: 0, east: 1 },
  ];
  // Edges placed exactly on rows, so the edge rule is exercised both ways.
  for (let i = 0; i < 6; i += 1) {
    const a = rows[Math.floor(random() * rows.length)];
    const b = rows[Math.floor(random() * rows.length)];
    boxes.push({
      south: Math.min(a[MESH_LAT], b[MESH_LAT]),
      north: Math.max(a[MESH_LAT], b[MESH_LAT]),
      west: Math.min(a[MESH_LON], b[MESH_LON]),
      east: Math.max(a[MESH_LON], b[MESH_LON]),
    });
  }
  for (let i = 0; i < 20; i += 1) {
    const span = 0.02 * 2 ** (random() * 10);
    const lat = 42 + random() * 9;
    const lon = -5 + random() * 14;
    boxes.push({ south: lat - span / 2, north: lat + span / 2, west: lon - span * 1.2, east: lon + span * 1.2 });
  }
  return boxes;
}

function assertSamePick(actual, expected, context) {
  const { picked: a, ...restA } = actual;
  const { picked: b, ...restB } = expected;
  assert.deepEqual(restA, restB, context);
  assert.equal(a.length, b.length, context);
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) assert.fail(`${context}: row ${i} differs (${meshRowId(a[i])} against ${meshRowId(b[i])})`);
  }
}

test('the indexed world pick draws exactly what the linear one drew, box for box', () => {
  const rows = nationalMesh();
  const budgets = [1, 3, 40, 660, 1100, 2200, 100_000];
  let thinned = 0;
  for (const box of viewBoxes(rows)) {
    for (const budget of budgets) {
      const context = `${JSON.stringify(box)} budget ${budget}`;
      const expected = linearSelectGeoMeshWorld(rows, { box, budget });
      assertSamePick(selectGeoMeshWorld(rows, { box, budget }), expected, context);
      if (expected.fillLevel !== null && expected.fillLevel !== undefined) thinned += 1;
    }
  }
  // The comparison is only worth something if it crossed the density branch.
  assert.ok(thinned > 20, `${thinned} thinned picks compared`);
});

test('the indexed world pick falls back, and still agrees, where its shortcuts do not hold', () => {
  const sorted = nationalMesh(3);
  const random = seeded(5);
  // Out of position order: no binary search, no runs.
  const shuffled = [...sorted];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  // String weights compare as text in the linear version, and a category
  // outside a byte cannot index the typed counts: both take the generic path.
  const oddWeights = sorted.map((r, i) => (i % 97 === 0 ? [r[0], r[1], String(r[2] * 3), r[3]] : r));
  const oddCategories = sorted.map((r, i) => (i % 89 === 0 ? [r[0], r[1], r[2], 300] : r));
  const junk = [...sorted.slice(0, 2000), 'nope', null, ...sorted.slice(2000)];
  // A string edge: compared the way `meshRowInBox` compares it.
  const stringBox = { south: '43', north: '49', west: '-2', east: '7' };
  for (const [name, rows] of [['shuffled', shuffled], ['string weights', oddWeights], ['wide categories', oddCategories], ['junk rows', junk]]) {
    for (const box of [...viewBoxes(sorted, 17).slice(0, 12), stringBox]) {
      for (const budget of [3, 660, 2200]) {
        assertSamePick(
          selectGeoMeshWorld(rows, { box, budget }),
          linearSelectGeoMeshWorld(rows, { box, budget }),
          `${name} ${JSON.stringify(box)} budget ${budget}`,
        );
      }
    }
  }
});

test('the index follows its mesh: a longer array, a new first row or another step is re-indexed', () => {
  const rows = nationalMesh(9);
  const box = { south: 41, north: 51.5, west: -5.5, east: 10 };
  assertSamePick(selectGeoMeshWorld(rows, { box, budget: 660 }), linearSelectGeoMeshWorld(rows, { box, budget: 660 }), 'first');
  // Appended in place, still in position order.
  rows.push([51.4, 9.9, 4, 4], [51.45, 9.95, 4, 4]);
  assertSamePick(selectGeoMeshWorld(rows, { box, budget: 660 }), linearSelectGeoMeshWorld(rows, { box, budget: 660 }), 'appended');
  rows[0] = [rows[0][0], rows[0][1], 4, 0];
  assertSamePick(selectGeoMeshWorld(rows, { box, budget: 660 }), linearSelectGeoMeshWorld(rows, { box, budget: 660 }), 'first row replaced');
  assertSamePick(
    selectGeoMeshWorld(rows, { box, budget: 660, minStepDeg: 1 / 256 }),
    linearSelectGeoMeshWorld(rows, { box, budget: 660, minStepDeg: 1 / 256 }),
    'coarser finest step',
  );
});
