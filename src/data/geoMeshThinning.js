/**
 * @module geoMeshThinning
 *
 * Bounded, spatially-stratified thinning of a national point set to what one
 * viewport can legibly draw.
 *
 * ── Why this file exists apart from its callers ─────────────────────────────
 * `irveMesh.js` worked this policy out for the charge-point layer and carries
 * the measurements that justify every rule in it — read that header first, it
 * is the argument. What is NOT charge-point-specific is the algorithm itself,
 * which only ever reads four numbers per row: a latitude, a longitude, a
 * WEIGHT to rank by, and a CATEGORY to be representative of. Schools have
 * exactly that shape (pupils, level) as charge points do (points de charge,
 * power band), so the second caller would have been a 277-line copy whose
 * divergence from the first nobody would notice until the two maps thinned
 * differently for no stated reason.
 *
 * So the policy lives here once, and `irveMesh.js` and `schoolsMesh.js` are
 * both thin adapters that name the tuple in their own domain and set their own
 * budgets. `irveMesh.js` keeps its full export surface and its own tests, which
 * is what proves this extraction changed nothing.
 *
 * ── The policy, in one paragraph ───────────────────────────────────────────
 * Bucket the view into a grid and give every occupied cell one dot before any
 * cell gets a second, so a sparse region reads as sparse-but-present rather
 * than as absent — which taking the biggest N nationally would make it. Each
 * cell is represented by the largest example of its MODAL category, not by its
 * largest member, because the largest member of a rural cell is an outlier and
 * a map built from outliers describes a country that does not exist. Leftover
 * budget is spent walking position order at a fixed stride, which samples the
 * mix that is actually there instead of re-sorting by size and undoing the
 * correction.
 *
 * ── What the caller must do with the result ────────────────────────────────
 * Report it. A thinned map that does not say it is thinned is a map claiming
 * the country holds `budget` things. `selectGeoMesh` returns both the count it
 * kept and the count it was given, and every caller prints both.
 *
 * Dependency-free and side-effect-free (no Cesium, no DOM) so it runs
 * identically in the browser, in the Vite dev-server proxy, and under
 * `node --test`.
 */

/**
 * A mesh row is a 4-tuple, not an object: `[lat, lon, weight, category]`.
 *
 * Tens of thousands of them travel to the browser in one document, and objects
 * with four keys apiece cost roughly 2.7× what tuples cost (measured on the
 * charge-point set: 2.4 MB against 0.9 MB). The index constants exist so no
 * caller has to remember the order.
 */
export const MESH_LAT = 0;
export const MESH_LON = 1;
export const MESH_WEIGHT = 2;
export const MESH_CATEGORY = 3;

/**
 * Default grid the view is bucketed into.
 *
 * 30 × 20 = 600 cells, deliberately BELOW every budget its callers use: when
 * cells outnumber the budget, only the highest-ranked cells win and the pick
 * silently becomes rank-based again — the exact failure this grid exists to
 * prevent. Keeping cells < budget guarantees every occupied cell is
 * represented before a single second dot is placed anywhere.
 */
export const MESH_COLS = 30;
export const MESH_ROWS = 20;

/**
 * ── THE WORLD LATTICE, AND WHY THE VIEW-RELATIVE GRID IS NOT ENOUGH ─────────
 *
 * The grid above is a fraction of the CURRENT BOX, so its cells slide with the
 * camera: pan one kilometre and every cell boundary moves one kilometre, the
 * buckets re-form around different sites, and a different site wins each cell.
 * Nothing in the world changed and the map redrew. That is G3 — *agréger en
 * espace monde, pas en espace écran* — and its test is exactly this one: pan
 * without changing altitude and watch the counters move.
 *
 * A caller can instead pass `lattice: { stepDeg }`, and then a cell is a fixed
 * square of the graticule — `floor(lat / step)`, `floor(lon / step)` — with no
 * reference to the box at all. The same site falls in the same cell in every
 * view that contains it, so panning slides the map under a stationary mesh.
 *
 * THE LADDER IS A QUADTREE, and that is what makes a tier change readable: a
 * caller's steps are powers of two of a degree, so every cell of a finer tier
 * is exactly inside one cell of the coarser tier. Changing tier SUBDIVIDES the
 * mesh; it never reshuffles it.
 *
 * WHAT A LATTICE CELL IS NOT: equal-area (C3). A step of 0.25° is 27.8 km tall
 * everywhere and 20.7 km wide at Perpignan against 17.5 km at Lille — a 15 %
 * spread across metropolitan France. Callers that draw a lattice have to say
 * so in their key; the alternative, a longitude step that widens with
 * latitude, would break the world lock this exists to provide.
 *
 * WITH A LATTICE THERE IS NO STRIDE FILL. The point of the stride was to spend
 * leftover budget on extra individual dots; a lattice pick reports a COMPLETE
 * AGGREGATE per cell instead, and a second dot in an already-counted cell
 * would be counted twice by anything reading those aggregates. One mark per
 * occupied cell, and the budget is spent by choosing the step.
 */

/** Coarsest and finest lattice steps a caller may ask for, in degrees. */
export const MESH_LATTICE_MIN_STEP_DEG = 1 / 4096;
export const MESH_LATTICE_MAX_STEP_DEG = 8;

/**
 * Resolve a latitude span against a caller's budget ladder.
 *
 * Latitude and not the larger of the two spans: on the app's 16:10 viewport
 * the longitude span runs about 2.4× the latitude one (measured — 9.53° lat
 * against 24.42° lon at 1 400 km), so the larger span is mostly a statement
 * about the window's aspect ratio. Latitude is the axis that answers "how far
 * out am I", and it is the one metropolitan France's 9.8° height is measured
 * against.
 *
 * @param {number} latSpanDeg The view's latitude span, in degrees.
 * @param {ReadonlyArray<{maxLatSpanDeg:number, budget:number}>} tiers
 *   Ascending by `maxLatSpanDeg`; the last tier should be `Infinity`.
 * @returns {number}
 */
export function meshBudgetForSpan(latSpanDeg, tiers) {
  const ladder = Array.isArray(tiers) && tiers.length ? tiers : null;
  if (!ladder) return 0;
  const span = Number.isFinite(latSpanDeg) ? Math.max(0, latSpanDeg) : Infinity;
  for (const tier of ladder) {
    if (span <= tier.maxLatSpanDeg) return tier.budget;
  }
  return ladder.at(-1).budget;
}

/** Whether a mesh tuple falls inside a box (edges count). */
export function meshRowInBox(row, box) {
  if (!box || !Array.isArray(row)) return false;
  const lat = row[MESH_LAT];
  const lon = row[MESH_LON];
  return lat >= box.south && lat <= box.north && lon >= box.west && lon <= box.east;
}

/**
 * Stable identity for a mesh row, matching the key the exact regime uses so a
 * selection can survive the handover between the two.
 */
export function meshRowId(row) {
  return `${Number(row[MESH_LAT]).toFixed(5)},${Number(row[MESH_LON]).toFixed(5)}`;
}

/**
 * Heaviest first, ties broken by position.
 *
 * The tie-break is not decoration — without it, two rows with the same weight
 * would swap places between frames as the array order shifted, and the map
 * would shimmer while standing still.
 */
export function byWeight(a, b) {
  const delta = (b[MESH_WEIGHT] || 0) - (a[MESH_WEIGHT] || 0);
  if (delta) return delta;
  if (a[MESH_LAT] !== b[MESH_LAT]) return a[MESH_LAT] - b[MESH_LAT];
  return a[MESH_LON] - b[MESH_LON];
}

/** South-to-north, then west-to-east. The order the stride fill walks. */
export function byPosition(a, b) {
  if (a[MESH_LAT] !== b[MESH_LAT]) return a[MESH_LAT] - b[MESH_LAT];
  return a[MESH_LON] - b[MESH_LON];
}

/**
 * The row that represents a cell: the largest example of the cell's most
 * common category.
 *
 * The bucket is assumed already sorted heaviest-first, so the first match is
 * the largest of the modal category. Ties between equally common categories go
 * to the LOWER category index, which is deterministic — callers are expected to
 * order their category ladders so that the low end is the one that over-claims
 * nothing (slower charging, smaller school).
 *
 * @param {Array<Array<number>>} bucket Rows in one cell, sorted by `byWeight`.
 * @returns {Array<number>}
 */
export function cellRepresentative(bucket) {
  const counts = [];
  for (const row of bucket) {
    const category = row[MESH_CATEGORY];
    counts[category] = (counts[category] || 0) + 1;
  }
  let modal = -1;
  let best = 0;
  for (let category = 0; category < counts.length; category += 1) {
    if ((counts[category] || 0) > best) {
      best = counts[category];
      modal = category;
    }
  }
  return bucket.find((row) => row[MESH_CATEGORY] === modal) || bucket[0];
}

/**
 * Bucket the rows inside a box into cells, either view-relative or world-locked.
 *
 * @param {Array<Array<number>>} rowsIn
 * @param {{south:number, west:number, north:number, east:number}} box
 * @param {{nCols:number, nRows:number, stepDeg:?number}} grid
 * @returns {{cells:Map<string|number, Array<Array<number>>>, inBox:number}}
 */
function bucketRows(rowsIn, box, { nCols, nRows, stepDeg }) {
  // A degenerate box would divide by zero; one cell is the honest answer for a
  // view with no extent rather than a NaN column index.
  const latSpan = box.north - box.south;
  const lonSpan = box.east - box.west;
  const cells = new Map();
  let inBox = 0;
  for (const row of rowsIn) {
    if (!meshRowInBox(row, box)) continue;
    inBox += 1;
    const key = stepDeg
      // World-locked: the cell is a square of the graticule and the box is not
      // in the expression at all, which is the whole property (G3).
      ? `${Math.floor(row[MESH_LAT] / stepDeg)}:${Math.floor(row[MESH_LON] / stepDeg)}`
      : (latSpan > 0
        ? Math.min(nRows - 1, Math.max(0, Math.floor(((row[MESH_LAT] - box.south) / latSpan) * nRows)))
        : 0) * nCols
        + (lonSpan > 0
          ? Math.min(nCols - 1, Math.max(0, Math.floor(((row[MESH_LON] - box.west) / lonSpan) * nCols)))
          : 0);
    const bucket = cells.get(key);
    if (bucket) bucket.push(row);
    else cells.set(key, [row]);
  }
  return { cells, inBox };
}

/**
 * Pick a bounded, spatially-spread subset of the rows inside a box.
 *
 * @param {Array<Array<number>>} rows National mesh tuples.
 * @param {object} options
 * @param {{south:number, west:number, north:number, east:number}} options.box
 * @param {number} options.budget Row cap. Callers resolve it from their own
 *   ladder via `meshBudgetForSpan` before calling.
 * @param {number} [options.cols]
 * @param {number} [options.rows]
 * @param {{stepDeg:number}} [options.lattice] World-locked cells of `stepDeg`
 *   degrees instead of a fraction of the box. Doubles the step until the
 *   occupied cells fit the budget, so the pick can never silently degrade into
 *   "the biggest N cells". Turns off the stride fill and returns a complete
 *   aggregate per cell.
 * @returns {{picked:Array<Array<number>>, inBox:number, budget:number,
 *   thinned:boolean, cells:number, stepDeg:?number, coarsened:number,
 *   aggregates:?Array<{total:number, rows:number}>}}
 */
export function selectGeoMesh(rows, { box, budget, cols, rows: rowCount, lattice } = {}) {
  const rowsIn = Array.isArray(rows) ? rows : [];
  const empty = {
    picked: [], inBox: 0, budget: 0, thinned: false, cells: 0,
    stepDeg: null, coarsened: 0, aggregates: null,
  };
  if (!box) return empty;

  const cap = Math.max(0, Math.floor(Number.isFinite(budget) ? budget : 0));
  const nCols = Math.max(1, Math.floor(cols ?? MESH_COLS));
  const nRows = Math.max(1, Math.floor(rowCount ?? MESH_ROWS));

  const asked = Number(lattice?.stepDeg);
  let stepDeg = Number.isFinite(asked) && asked > 0
    ? Math.min(MESH_LATTICE_MAX_STEP_DEG, Math.max(MESH_LATTICE_MIN_STEP_DEG, asked))
    : null;

  let { cells, inBox } = bucketRows(rowsIn, box, { nCols, nRows, stepDeg });
  // MORE CELLS THAN BUDGET IS THE ONE FAILURE THE GRID EXISTS TO PREVENT: only
  // the highest-ranked cells would win and the pick would be rank-based again.
  // The view-relative grid rules it out by construction (600 cells, every
  // budget above it); a world lattice cannot, because the box is free to hold
  // any number of cells. So the step DOUBLES — staying on the quadtree, so the
  // coarser mesh is the finer one merged four cells at a time — until it fits.
  let coarsened = 0;
  while (stepDeg && cap > 0 && cells.size > cap && stepDeg < MESH_LATTICE_MAX_STEP_DEG) {
    stepDeg = Math.min(MESH_LATTICE_MAX_STEP_DEG, stepDeg * 2);
    coarsened += 1;
    ({ cells, inBox } = bucketRows(rowsIn, box, { nCols, nRows, stepDeg }));
  }

  if (!cap || !inBox) {
    return {
      ...empty, inBox, budget: cap, thinned: inBox > 0, cells: cells.size, stepDeg, coarsened,
    };
  }

  const cellBest = [];
  const rest = [];
  /** Aligned with `cellBest`: what the whole cell holds, not what its mark is. */
  const aggregates = [];
  for (const bucket of cells.values()) {
    bucket.sort(byWeight);
    const winner = cellRepresentative(bucket);
    cellBest.push(winner);
    if (stepDeg) {
      let total = 0;
      for (const row of bucket) total += Number(row[MESH_WEIGHT]) || 0;
      aggregates.push({ total, rows: bucket.length });
      continue;
    }
    for (const row of bucket) {
      if (row !== winner) rest.push(row);
    }
  }

  if (stepDeg) {
    // One mark per occupied cell, heaviest cell first so a view that somehow
    // still overflows keeps the most substantial cells. `byWeight` ranks the
    // MARKS; the cells are ranked by what they hold, which is the figure the
    // caller draws.
    const order = aggregates
      .map((aggregate, index) => index)
      .sort((a, b) => aggregates[b].total - aggregates[a].total
        || byWeight(cellBest[a], cellBest[b]));
    const kept = order.slice(0, cap);
    return {
      picked: kept.map((index) => cellBest[index]),
      aggregates: kept.map((index) => aggregates[index]),
      inBox,
      budget: cap,
      // A lattice pick is "thinned" whenever it stands for more rows than it
      // draws — which is nearly always, since a cell with four sites draws one
      // mark. The caller prints both numbers either way.
      thinned: kept.length < inBox,
      cells: cells.size,
      stepDeg,
      coarsened,
    };
  }
  // Cell winners are cut heaviest-first if there are somehow more cells than
  // budget, so an under-budget view still shows the most substantial ones.
  cellBest.sort(byWeight);
  const picked = cellBest.slice(0, cap);

  // Spend the rest by walking position order at a fixed stride: that samples
  // whatever category mix is actually in view, where re-sorting by size would
  // put back the over-representation the cell rule just removed.
  rest.sort(byPosition);
  const need = cap - picked.length;
  if (need > 0 && rest.length) {
    const taken = new Set();
    const stride = Math.max(1, Math.floor(rest.length / need));
    for (let i = 0; i < rest.length && picked.length < cap; i += stride) {
      taken.add(i);
      picked.push(rest[i]);
    }
    // The stride can undershoot on a short remainder; top up in order so the
    // budget is actually spent rather than silently left on the table.
    for (let i = 0; i < rest.length && picked.length < cap; i += 1) {
      if (taken.has(i)) continue;
      picked.push(rest[i]);
    }
  }
  return {
    picked,
    inBox,
    budget: cap,
    thinned: picked.length < inBox,
    cells: cells.size,
    stepDeg: null,
    coarsened: 0,
    aggregates: null,
  };
}

// --- World-locked, budget-spending selection -----------------------------------

/**
 * The representative of a cell, in one pass over rows in position order:
 * the heaviest row of the cell's most common category, ties to the lower
 * category and then to the first row — exactly `cellRepresentative` over the
 * cell sorted by `byWeight`, without the sort.
 */
function representativeOf(rows, indices) {
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

/** The finest step a world pick starts from: ~110 m of latitude. */
export const MESH_WORLD_MIN_STEP_DEG = 1 / 1024;
/** Share of a world pick's budget spent on one representative per cell. */
export const MESH_WORLD_REP_SHARE = 0.5;
/** Fill thresholds are 2^(-level / 4): a quarter power of two per level. */
const FILL_LEVELS_PER_OCTAVE = 4;
const FILL_MAX_LEVEL = 255;

/**
 * A row's fixed priority in [0, 1), from its own coordinates.
 *
 * A 32-bit integer mix of the 1e-5° grid indices (the precision the national
 * meshes are published at): the same row gets the same number on every call,
 * in every browser, whatever else is in view. That is the whole property the
 * density fill below rests on.
 */
export function meshRowPriority(row) {
  let h = Math.imul(Math.round(row[MESH_LAT] * 1e5), 0x9e3779b1) ^ Math.round(row[MESH_LON] * 1e5);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * Pick a bounded subset of the rows inside a box that a PAN DOES NOT RESHUFFLE.
 *
 * WHY. The view-relative grid of {@link selectGeoMesh} is recomputed from the
 * box, so every pan moves every cell boundary and re-elects most of its
 * winners: measured in the browser on the 72 746 ANFR supports, a France view
 * panned by 3 % of its altitude kept 5 to 36 % of its dots from one step to
 * the next — the map rained dots, which the reader took for a reload.
 *
 * HOW, in two halves, neither of which looks at the box beyond "is this row
 * inside it":
 *
 *   1. COVERAGE. Cells locked to the graticule, at the finest power-of-two
 *      step from {@link MESH_WORLD_MIN_STEP_DEG} whose occupied cells fit
 *      {@link MESH_WORLD_REP_SHARE} of the budget — a quadtree, so a coarser
 *      step merges four cells rather than reshuffling them. Each cell draws
 *      its representative ({@link cellRepresentative}'s rule: the heaviest
 *      row of its most common category), so empty country keeps its marks.
 *   2. DENSITY. The rest of the budget goes to every other row whose fixed
 *      {@link meshRowPriority} is under 2^(-level/4), at the lowest level that
 *      fits. A uniform sample of the rows, so a city draws more marks than a
 *      plateau, as the view-relative stride did — and a nested one: a zoom
 *      that moves the threshold adds or removes marks, never swaps them.
 *
 * A view that holds no more rows than the budget draws them all.
 *
 * NO AGGREGATES, on purpose: these are individual rows, several to a cell, and
 * must never be read as one mark standing for its cell. Callers that print
 * per-cell totals use the `lattice` option of {@link selectGeoMesh}.
 *
 * @param {Array<Array<number>>} rows In position order ({@link byPosition}),
 *   as every national mesh this module serves already is.
 * @param {object} options
 * @param {{south:number, west:number, north:number, east:number}} options.box
 * @param {number} options.budget Row cap.
 * @param {number} [options.minStepDeg]
 * @returns {{picked:Array<Array<number>>, inBox:number, budget:number,
 *   thinned:boolean, cells:number, stepDeg?:?number, fillLevel?:?number}}
 */
export function selectGeoMeshWorld(rows, { box, budget, minStepDeg = MESH_WORLD_MIN_STEP_DEG } = {}) {
  if (!box) return { picked: [], inBox: 0, budget: 0, thinned: false, cells: 0 };
  const cap = Math.max(0, Math.floor(Number.isFinite(budget) ? budget : 0));
  const inside = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (meshRowInBox(row, box)) inside.push(row);
  }
  const n = inside.length;
  if (!cap || !n) {
    return { picked: [], inBox: n, budget: cap, thinned: n > 0, cells: 0 };
  }
  if (n <= cap) {
    return { picked: inside, inBox: n, budget: cap, thinned: false, cells: 0, stepDeg: null, fillLevel: null };
  }

  // 1. Coverage — cell indices at the finest step, once; a coarser step is a
  // right shift of the same integers, so every level stays graticule-locked.
  const repCap = Math.max(1, Math.floor(cap * MESH_WORLD_REP_SHARE));
  const finest = Math.min(MESH_LATTICE_MAX_STEP_DEG, Math.max(MESH_LATTICE_MIN_STEP_DEG, minStepDeg));
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
  // Small integer keys — offsets from the view's first cell at that level —
  // because a Set of doubles past 2^31 made the France-wide pick 20 ms.
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
  // A level merges at most four cells into one, so a count `c` over the cap
  // rules out the next ceil(log4(c / cap)) - 1 levels: skip them, then step
  // back while the finer level still fits.
  const maxLevel = Math.max(0, Math.floor(Math.log2(MESH_LATTICE_MAX_STEP_DEG / finest)));
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
  for (const members of cells.values()) reps.push(representativeOf(inside, members));
  if (reps.length >= cap) {
    // Even the coarsest step holds more cells than budget (a world view over
    // scattered territories): the heaviest representatives, as `selectGeoMesh`
    // does, so the budget stays a ceiling.
    const best = reps.map((x) => inside[x]).sort(byWeight).slice(0, cap);
    return { picked: best, inBox: n, budget: cap, thinned: true, cells: cells.size, stepDeg, fillLevel: null };
  }

  // 2. Density — the other rows under a fixed-priority threshold.
  const isRep = new Uint8Array(n);
  for (const x of reps) isRep[x] = 1;
  const rowLevel = new Uint8Array(n);
  const histogram = new Uint32Array(FILL_MAX_LEVEL + 1);
  for (let x = 0; x < n; x += 1) {
    if (isRep[x]) continue;
    const p = meshRowPriority(inside[x]);
    const at = p > 0 ? Math.min(FILL_MAX_LEVEL, Math.floor(-FILL_LEVELS_PER_OCTAVE * Math.log2(p))) : FILL_MAX_LEVEL;
    rowLevel[x] = at;
    histogram[at] += 1;
  }
  // A row is drawn at threshold level `m` when its own level is `m` or more.
  const room = cap - reps.length;
  let fillLevel = FILL_MAX_LEVEL + 1;
  let drawn = 0;
  while (fillLevel > 0 && drawn + histogram[fillLevel - 1] <= room) {
    fillLevel -= 1;
    drawn += histogram[fillLevel];
  }
  const picked = [];
  for (let x = 0; x < n; x += 1) {
    if (isRep[x] || rowLevel[x] >= fillLevel) picked.push(inside[x]);
  }
  return {
    picked,
    inBox: n,
    budget: cap,
    thinned: picked.length < n,
    cells: cells.size,
    stepDeg,
    fillLevel,
  };
}
