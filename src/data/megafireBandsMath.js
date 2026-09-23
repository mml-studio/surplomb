/*
 * MEGAFIRE BANDS MATH — the "day-of-burning" rings of the Gironde megafire,
 * precomputed as polygons.
 *
 * Pure: no Cesium, no DOM, no fs, no clock, no `Math.random`. The build script
 * (`scripts/build-gironde-megafire-bands.mjs`) reads the frozen pack and writes
 * `bands.json`; this module owns every decision in between, so each of them is
 * unit-testable on a synthetic square or disc before it touches the real fire.
 *
 * ── WHAT A RING MEANS ───────────────────────────────────────────────────────
 *
 * Three nested regions inside the burnt footprint Copernicus mapped. Region b
 * is the ground where NASA FIRMS had SEEN HEAT by the end of band b (a group
 * of local days); its boundary is the glowing ring on the map, and region b
 * minus region b−1 is that band's translucent fill. A ring is where satellites
 * saw heat arrive, at the resolution of a 375 m VIIRS pixel and the rhythm of a
 * few overpasses a day — not a flame front. This is the "day-of-burning" map of
 * the fire literature (Parks 2014, International Journal of Wildland Fire),
 * grouped into days a reader can hold in their head.
 *
 * ── THE PIPELINE (reproduces the approved canvas prototype, as polygons) ────
 *
 *   1. Footprint. The five Copernicus perimeters are rasterised on a local
 *      metric grid ({@link MEGAFIRE_BANDS_PARAMS}.cellM = 60 m), even-odd within
 *      a polygon so holes stay holes, union across polygons. The mask is blurred
 *      by a 350 m gaussian and thresholded LOW (90/255), which closes the gaps
 *      between the hundreds of small Copernicus pieces into one legible shape.
 *   2. Arrival time. Every FIRMS detection stamps a disc of radius R with its
 *      exact timestamp; a node keeps the earliest stamp it received.
 *   3. Region at instant t. Footprint nodes whose earliest stamp is ≤ t are
 *      blurred by a 1.4 km gaussian, DIVIDED by the footprint blurred the same
 *      way (the share of the scar around a node that was lit, so the region
 *      runs to the scar's own edge instead of stopping a few hundred metres
 *      short of it), and thresholded at 0.5 — few, round, strong rings instead
 *      of a pixel mosaic — then clipped to the footprint. Region
 *      b is OR-ed with region b−1 so the rings nest by construction, and the
 *      last region is the whole footprint.
 *   4. Polygons. Marching squares on the continuous blurred field (not the
 *      binary mask) gives sub-cell boundaries; Douglas–Peucker at ~30 m then two
 *      Chaikin passes make the curve read silky from a low camera; polygons and
 *      holes under 20 ha are dropped.
 *
 * ── WHY CONTOUR FIELDS INSTEAD OF CLIPPING POLYGONS ─────────────────────────
 *
 * Clip, OR and "band = region b minus region b−1" are all done on scalar fields
 * whose positive part is the set: intersection is `min`, union is `max`,
 * complement is negation. The zero set of `min(a, b)` is the boundary of
 * `{a > 0} ∩ {b > 0}` whatever the two fields' scales, so no polygon clipper is
 * needed (none is a dependency of this repository), the rings nest exactly at
 * the grid nodes, and a band's fill shares its edges with the two rings that
 * bound it before simplification moves either by a few tens of metres.
 *
 * ── CALIBRATION ─────────────────────────────────────────────────────────────
 *
 * R is chosen on SHAPE. For every candidate (300–1500 m by 50 m) the region is
 * built at the acquisition instant of DEL_MONIT01 (26 July 10:12 UTC) and of
 * GRA_PRODUCT (27 July 16:16) and compared, node by node on this grid and
 * before contouring, with that product's burnt polygons, holes respected. The
 * score is the mean intersection over union (IoU). The radius kept is the
 * SMALLEST whose mean is within 0.005 of the best: past ~1 km the curve is
 * flat (0.673 from 1 150 m to 1 300 m), and a wider disc only paints ground
 * no pixel saw. On this fire that is 1 050 m, mean IoU 0.669, and 0.7 % of
 * the ground DEL_MONIT01 shows burnt is left to a later ring. The two later
 * images are checks, never fitted: DEL_MONIT02 (29 July) scores 0.794 and
 * GRA_MONIT01 (1 August) 0.784. The shares come out at 29 / 88 / 100 % of the
 * footprint.
 *
 * The price is on the other side of the union: 37 % of it on 26 July is ground
 * the region lights and DEL_MONIT01 does not. Much of that is the two
 * smoothings, which widen every edge — the footprint drawn is 38 916 ha against
 * the 31 326.5 ha Copernicus published — so a region's AREA reads high, and the
 * layer should quote Copernicus's hectares, never these.
 *
 * Area was the first objective and is rejected on two counts:
 *   - The first image, DEL_PRODUCT (24 July 09:05, 5 775.4 ha), lags the
 *     detections. The passes of 01:00–03:00 UTC that night (2 136 detections,
 *     2 036 of them VIIRS) saw the fire run past its perimeter: 939 of the
 *     3 776 detections before 09:05 lie more than 500 m outside it, 865 of
 *     them from those passes. No radius reaches its area — 300 m, the
 *     smallest, overshoots by 115 % — and the region misses only 0–1 % of its
 *     ground at every R. Scored on shape it would drag R
 *     down for the wrong reason: its IoU FALLS as R grows (0.38 at the
 *     chosen 1 050 m), all of the loss ground the satellites saw burning and it had not
 *     drawn yet. It is excluded, and `method.calibration.excluded` carries the
 *     count.
 *   - On the later images, area is the wrong target. The radius nearest the
 *     published hectares, 300 m, has the worst shape of the range: IoU 0.557
 *     on DEL_MONIT01 (0.616 on GRA_PRODUCT), with 11.4 % (12.2 %) of the ground
 *     Copernicus already showed burnt outside it — the gaps between 375 m
 *     pixels fall to the last band. Matching area picked the worst radius.
 *
 * ── CONVENTIONS ─────────────────────────────────────────────────────────────
 *
 * A ring is a flat `[lon, lat, lon, lat, …]` array that does NOT repeat its
 * first vertex. Outer rings run counter-clockwise, holes clockwise (east =
 * +x, north = +y). A polygon is `[outer, ...holes]`; a region is an array of
 * polygons, largest first. Areas are in hectares, computed on the sphere (see
 * {@link ringAreaHa}).
 */

/** @constant {string} Schema tag of `bands.json`. Bump it when a field changes meaning. */
export const MEGAFIRE_BANDS_SCHEMA = 'gironde-megafire-2026/bands-1';

/**
 * The three groups of local days the rings are drawn for.
 *
 * Local days are Europe/Paris, UTC+2 in July, so a day ends at 22:00Z. The
 * first band opens with the window (the first FIRMS detection) and the last one
 * closes with it; three bands and not ten because a reader follows three nested
 * shapes and loses track of ten. Grouping is where the fire's own rhythm is:
 * the two days of the first run, the two days it doubled, then the long tail.
 * @constant {ReadonlyArray<{id: string, days: ReadonlyArray<string>, from: string, to: string}>}
 */
export const MEGAFIRE_DAY_BANDS = Object.freeze([
  Object.freeze({
    id: 'jul-22-23',
    days: Object.freeze(['2026-07-22', '2026-07-23']),
    from: '2026-07-22T11:55:00Z',
    to: '2026-07-23T22:00:00Z',
  }),
  Object.freeze({
    id: 'jul-24-25',
    days: Object.freeze(['2026-07-24', '2026-07-25']),
    from: '2026-07-23T22:00:00Z',
    to: '2026-07-25T22:00:00Z',
  }),
  Object.freeze({
    id: 'jul-26-aug-01',
    days: Object.freeze(['2026-07-26', '2026-07-27', '2026-07-28', '2026-07-29', '2026-07-30', '2026-07-31', '2026-08-01']),
    from: '2026-07-25T22:00:00Z',
    to: '2026-08-01T12:44:00Z',
  }),
]);

/**
 * Every knob of the pipeline, in metres unless named otherwise.
 *
 * - `cellM` 60 m: six nodes across the smallest thing that survives the 350 m
 *   footprint blur; 660 × 553 nodes over this fire, and the whole build —
 *   25 radii × 2 images of calibration included — takes 3.5 s.
 * - `marginM` 2 km around the footprint bbox: the 350 m blur reaches 1 km, and
 *   the grid border must be empty for every contour to close.
 * - `footprintSmoothM` / `footprintThreshold`: the prototype's canvas
 *   `blur(12px)` at 29 m/px and its `alpha > 90` test.
 * - `smoothM` / `threshold`: the prototype's `blur(48px)` (1.4 km) and 128/255.
 * - `radiusM` null means "calibrate among `radiusCandidatesM`" (300–1500 m by
 *   50 m); a number skips the search, which is what the unit tests do.
 * - `calibrationProducts` / `checkProducts` / `iouTolerance`: the images R is
 *   fitted on, the images it is only checked against, and how close to the best
 *   mean IoU the smallest radius must come (see CALIBRATION above).
 * - `excludedProduct` / `lagDistanceM`: the image left out because it lags the
 *   detections, and the distance outside its perimeter that counts as lagging.
 * - `simplifyM` 30 m: the curves are the zero set of a field blurred at ≥ 350 m,
 *   so a 30 m tolerance leaves chords of ~460 m on average. Two Chaikin passes
 *   then cut every corner in four: on the shipped rings the median vertex turns
 *   by 4.4° and 95 % turn by less than 13.5°. The few sharper ones are real
 *   corners, where a ring meets the footprint edge it is clipped to.
 * - `minPolygonHa` 20 ha: a fleck smaller than that is a single stamped pixel
 *   cluster at the footprint's edge, not a shape a reader can follow.
 * - `anchorGapM` / `anchorSpreadM`: the date label of a band sits ≥ 2 km outside
 *   the previous ring and ≥ 4 km east or west of the labels already placed.
 * @constant
 */
export const MEGAFIRE_BANDS_PARAMS = Object.freeze({
  cellM: 60,
  marginM: 2000,
  footprintSmoothM: 350,
  footprintThreshold: 90 / 255,
  smoothM: 1400,
  threshold: 0.5,
  radiusM: null,
  radiusCandidatesM: Object.freeze(Array.from({ length: 25 }, (_, i) => 300 + i * 50)),
  calibrationProducts: Object.freeze(['DEL_MONIT01', 'GRA_PRODUCT']),
  checkProducts: Object.freeze(['DEL_MONIT02', 'GRA_MONIT01']),
  excludedProduct: 'DEL_PRODUCT',
  lagDistanceM: 500,
  iouTolerance: 0.005,
  minPolygonHa: 20,
  simplifyM: 30,
  chaikinIterations: 2,
  anchorGapM: 2000,
  anchorSpreadM: 4000,
  timeZone: 'Europe/Paris',
  builtAt: null,
});

/** @constant {number} Decimal places of every output coordinate (~1.1 m). */
export const MEGAFIRE_BANDS_COORD_DP = 5;

/**
 * @constant {number} Sphere radius for areas, metres.
 *
 * The WGS84 equatorial radius, which is also what Turf uses — and, by a happy
 * coincidence, the ellipsoid's Gaussian radius of curvature √(MN) at 45° N to
 * within 36 m (6 ppm), so areas here match an ellipsoidal GIS to ~0.001 %.
 */
export const MEGAFIRE_BANDS_EARTH_RADIUS_M = 6378137;

const WGS84_A = 6378137;
const WGS84_E2 = 0.00669437999014;
const DEG = Math.PI / 180;

// ── Grid ────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} BandsGrid
 * @property {number} nx - Node count east–west.
 * @property {number} ny - Node count south–north (row 0 is the southern edge).
 * @property {number} cellM - Node spacing, metres.
 * @property {number} x0 - Metres east of the projection centre at node (0, 0), the south-west corner.
 * @property {number} y0 - Metres north of the projection centre at node (0, 0).
 * @property {number} lonC - Longitude of the projection centre.
 * @property {number} latC - Latitude of the projection centre.
 * @property {number} mPerDegLon - Metres per degree of longitude at `latC`.
 * @property {number} mPerDegLat - Metres per degree of latitude at `latC`.
 */

/**
 * Build a local metric grid over a lon/lat box.
 *
 * Equirectangular around the box centre, with the WGS84 radii of curvature at
 * that latitude (meridional M for north, prime-vertical N·cos φ for east). Over
 * the ±0.13° of latitude this fire spans, the east–west scale drifts by
 * ±0.23 % — invisible at 60 m cells, and areas are never read off this grid.
 * @param {{west: number, south: number, east: number, north: number}} bbox - Degrees.
 * @param {{cellM: number, marginM: number}} options
 * @returns {BandsGrid}
 */
export function makeBandsGrid(bbox, { cellM, marginM }) {
  if (!(cellM > 0)) throw new RangeError(`cellM must be positive, got ${cellM}`);
  const lonC = (bbox.west + bbox.east) / 2;
  const latC = (bbox.south + bbox.north) / 2;
  const sin = Math.sin(latC * DEG);
  const w = Math.sqrt(1 - WGS84_E2 * sin * sin);
  const mPerDegLat = (WGS84_A * (1 - WGS84_E2)) / (w * w * w) * DEG;
  const mPerDegLon = (WGS84_A / w) * Math.cos(latC * DEG) * DEG;
  const halfW = ((bbox.east - bbox.west) / 2) * mPerDegLon + marginM;
  const halfH = ((bbox.north - bbox.south) / 2) * mPerDegLat + marginM;
  const nx = Math.ceil((2 * halfW) / cellM) + 1;
  const ny = Math.ceil((2 * halfH) / cellM) + 1;
  return Object.freeze({
    nx,
    ny,
    cellM,
    x0: -((nx - 1) * cellM) / 2,
    y0: -((ny - 1) * cellM) / 2,
    lonC,
    latC,
    mPerDegLon,
    mPerDegLat,
  });
}

/**
 * Longitude/latitude → metres east and north of the grid's projection centre.
 * @param {BandsGrid} grid
 * @param {number} lon
 * @param {number} lat
 * @returns {[number, number]}
 */
export function gridToMetres(grid, lon, lat) {
  return [(lon - grid.lonC) * grid.mPerDegLon, (lat - grid.latC) * grid.mPerDegLat];
}

/**
 * Inverse of {@link gridToMetres}, unrounded.
 * @param {BandsGrid} grid
 * @param {number} x - Metres east.
 * @param {number} y - Metres north.
 * @returns {[number, number]} `[lon, lat]`.
 */
export function gridToLonLat(grid, x, y) {
  return [grid.lonC + x / grid.mPerDegLon, grid.latC + y / grid.mPerDegLat];
}

/**
 * Bounding box of a set of polygons, over their outer rings.
 * @param {ReadonlyArray<ReadonlyArray<ArrayLike<number>>>} polygons - Flat lon/lat rings.
 * @returns {{west: number, south: number, east: number, north: number}}
 */
export function polygonsBbox(polygons) {
  let west = Infinity; let south = Infinity; let east = -Infinity; let north = -Infinity;
  for (const polygon of polygons) {
    const ring = polygon[0];
    if (!ring) continue;
    for (let i = 0; i + 1 < ring.length; i += 2) {
      if (ring[i] < west) west = ring[i];
      if (ring[i] > east) east = ring[i];
      if (ring[i + 1] < south) south = ring[i + 1];
      if (ring[i + 1] > north) north = ring[i + 1];
    }
  }
  if (!(west <= east)) throw new RangeError('no vertex to bound');
  return { west, south, east, north };
}

// ── Rasters ─────────────────────────────────────────────────────────────────

/**
 * Scanline-rasterise lon/lat polygons onto the grid's NODES.
 *
 * Within one polygon the fill is even-odd, so its interior rings cut holes;
 * across polygons it is a union, so the five overlapping Copernicus frames add
 * up rather than cancelling where two of them overlap. A node is filled when
 * it lies inside; an edge covers the rows `min(y) ≤ j < max(y)`, the half-open
 * rule that counts a vertex once.
 * @param {BandsGrid} grid
 * @param {ReadonlyArray<ReadonlyArray<ArrayLike<number>>>} polygons - `[outer, ...holes]`, flat lon/lat.
 * @param {Uint8Array} [out] - Mask to OR into; a new one by default.
 * @returns {Uint8Array} 1 inside, 0 outside, row-major from the south-west node.
 */
export function rasterizePolygons(grid, polygons, out = new Uint8Array(grid.nx * grid.ny)) {
  const { nx, ny, cellM, x0, y0, lonC, latC, mPerDegLon, mPerDegLat } = grid;
  const gx = (lon) => ((lon - lonC) * mPerDegLon - x0) / cellM;
  const gy = (lat) => ((lat - latC) * mPerDegLat - y0) / cellM;
  for (const polygon of polygons) {
    /** @type {number[]} */ const rows = [];
    /** @type {number[]} */ const xs = [];
    for (const ring of polygon) {
      const n = Math.floor(ring.length / 2);
      if (n < 3) continue;
      for (let a = 0; a < n; a += 1) {
        const b = a + 1 === n ? 0 : a + 1;
        const xa = gx(ring[a * 2]); const ya = gy(ring[a * 2 + 1]);
        const xb = gx(ring[b * 2]); const yb = gy(ring[b * 2 + 1]);
        if (ya === yb) continue;
        const lo = Math.min(ya, yb); const hi = Math.max(ya, yb);
        const j0 = Math.max(0, Math.ceil(lo));
        const j1 = Math.min(ny - 1, Math.ceil(hi) - 1);
        for (let j = j0; j <= j1; j += 1) {
          rows.push(j);
          xs.push(xa + ((j - ya) * (xb - xa)) / (yb - ya));
        }
      }
    }
    if (!rows.length) continue;
    const order = rows.map((_, i) => i).sort((p, q) => rows[p] - rows[q] || xs[p] - xs[q]);
    let s = 0;
    while (s < order.length) {
      const j = rows[order[s]];
      let e = s;
      while (e < order.length && rows[order[e]] === j) e += 1;
      for (let p = s; p + 1 < e; p += 2) {
        const i0 = Math.max(0, Math.ceil(xs[order[p]]));
        const i1 = Math.min(nx - 1, Math.ceil(xs[order[p + 1]]) - 1);
        for (let i = i0; i <= i1; i += 1) out[j * nx + i] = 1;
      }
      s = e;
    }
  }
  return out;
}

/**
 * Stamp discs of earliest time: every node within `radiusM` of a point keeps
 * the smallest time any such point carried.
 *
 * This is the whole of "when did heat first reach here": a node is lit from
 * the first overpass that saw a hot pixel within R of it.
 * @param {BandsGrid} grid
 * @param {ArrayLike<number>} lons
 * @param {ArrayLike<number>} lats
 * @param {ArrayLike<number>} times - Any monotonic unit (the build uses ms since 1970).
 * @param {number} radiusM
 * @param {Float64Array} [out] - Grid to lower in place; a new one filled with +∞ by default.
 * @returns {Float64Array} Earliest time per node, +∞ where nothing reached.
 */
export function stampEarliest(grid, lons, lats, times, radiusM, out) {
  const { nx, ny, cellM, x0, y0, lonC, latC, mPerDegLon, mPerDegLat } = grid;
  const grid2 = out ?? new Float64Array(nx * ny).fill(Infinity);
  const r = radiusM / cellM;
  const r2 = r * r;
  for (let p = 0; p < times.length; p += 1) {
    const t = times[p];
    const cx = ((lons[p] - lonC) * mPerDegLon - x0) / cellM;
    const cy = ((lats[p] - latC) * mPerDegLat - y0) / cellM;
    const j0 = Math.max(0, Math.ceil(cy - r));
    const j1 = Math.min(ny - 1, Math.floor(cy + r));
    for (let j = j0; j <= j1; j += 1) {
      const dy = j - cy;
      const h2 = r2 - dy * dy;
      if (h2 < 0) continue;
      const h = Math.sqrt(h2);
      const i0 = Math.max(0, Math.ceil(cx - h));
      const i1 = Math.min(nx - 1, Math.floor(cx + h));
      const row = j * nx;
      for (let i = i0; i <= i1; i += 1) if (t < grid2[row + i]) grid2[row + i] = t;
    }
  }
  return grid2;
}

/**
 * Separable gaussian blur with a zero outside the grid — what a canvas
 * `filter: blur(σ)` does to a transparent border.
 *
 * The kernel is cut at 3σ and normalised; the vertical pass accumulates whole
 * rows so it reads memory in order instead of striding down columns.
 * @param {ArrayLike<number>} src - Row-major, `nx * ny`.
 * @param {number} nx
 * @param {number} ny
 * @param {number} sigmaCells - Standard deviation in nodes; ≤ 0 returns a copy.
 * @returns {Float32Array}
 */
export function gaussianBlur(src, nx, ny, sigmaCells) {
  const out = new Float32Array(nx * ny);
  if (!(sigmaCells > 0)) {
    out.set(src);
    return out;
  }
  const radius = Math.max(1, Math.ceil(3 * sigmaCells));
  const kernel = new Float64Array(radius * 2 + 1);
  let sum = 0;
  for (let t = -radius; t <= radius; t += 1) {
    const v = Math.exp(-(t * t) / (2 * sigmaCells * sigmaCells));
    kernel[t + radius] = v;
    sum += v;
  }
  for (let t = 0; t < kernel.length; t += 1) kernel[t] /= sum;

  const tmp = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j += 1) {
    const row = j * nx;
    for (let i = 0; i < nx; i += 1) {
      const v = src[row + i];
      if (!v) continue;
      const a = Math.max(0, i - radius);
      const b = Math.min(nx - 1, i + radius);
      for (let q = a; q <= b; q += 1) tmp[row + q] += v * kernel[q - i + radius];
    }
  }
  const acc = new Float64Array(nx);
  for (let j = 0; j < ny; j += 1) {
    acc.fill(0);
    const a = Math.max(0, j - radius);
    const b = Math.min(ny - 1, j + radius);
    for (let q = a; q <= b; q += 1) {
      const w = kernel[q - j + radius];
      const row = q * nx;
      for (let i = 0; i < nx; i += 1) acc[i] += w * tmp[row + i];
    }
    out.set(acc, j * nx);
  }
  return out;
}

// ── Contours ────────────────────────────────────────────────────────────────

/**
 * Signed shoelace area of a flat ring in whatever planar units it is in.
 * @param {ArrayLike<number>} flat - `[x, y, …]`, not closed.
 * @returns {number} Positive when counter-clockwise (y up).
 */
export function signedRingArea(flat) {
  const n = Math.floor(flat.length / 2);
  if (n < 3) return 0;
  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    const j = i + 1 === n ? 0 : i + 1;
    sum += flat[i * 2] * flat[j * 2 + 1] - flat[j * 2] * flat[i * 2 + 1];
  }
  return sum / 2;
}

/**
 * Even-odd point-in-ring test.
 * @param {number} x
 * @param {number} y
 * @param {ArrayLike<number>} flat - `[x, y, …]`, not closed.
 * @returns {boolean}
 */
export function pointInRing(x, y, flat) {
  const n = Math.floor(flat.length / 2);
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
    const xi = flat[i * 2]; const yi = flat[i * 2 + 1];
    const xj = flat[j * 2]; const yj = flat[j * 2 + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Marching squares on a scalar field: the closed rings of the set `field > 0`,
 * in node units (x = column, y = row, row 0 south).
 *
 * The crossing on each cell edge is linearly interpolated, which is what makes
 * the output curve instead of stair-step: a field blurred at 350 m or more is
 * locally linear across one 60 m cell. Segments are emitted with the inside on
 * their left, so outer rings come out counter-clockwise and holes clockwise
 * with no second pass. The ambiguous saddle cell is resolved by the value at
 * the cell centre (mean of its corners). Border nodes are forced outside so
 * every ring closes.
 * @param {ArrayLike<number>} field - Row-major, `nx * ny`.
 * @param {number} nx
 * @param {number} ny
 * @returns {number[][]} Flat rings, each `[x, y, …]`, not closed.
 */
export function traceContours(field, nx, ny) {
  const ins = new Uint8Array(nx * ny);
  for (let j = 1; j < ny - 1; j += 1) {
    for (let i = 1; i < nx - 1; i += 1) {
      const k = j * nx + i;
      ins[k] = field[k] > 0 ? 1 : 0;
    }
  }
  const value = (k) => (ins[k] ? field[k] : Math.min(field[k], 0));
  // Edge ids: horizontal edge from node k to k+1 is 2k; vertical from k to k+nx is 2k+1.
  const next = new Int32Array(2 * nx * ny).fill(-1);
  const edges = [0, 0, 0, 0];
  const signs = [0, 0, 0, 0];
  for (let j = 0; j < ny - 1; j += 1) {
    for (let i = 0; i < nx - 1; i += 1) {
      const k0 = j * nx + i; const k1 = k0 + 1; const k2 = k0 + nx + 1; const k3 = k0 + nx;
      const s0 = ins[k0]; const s1 = ins[k1]; const s2 = ins[k2]; const s3 = ins[k3];
      const code = s0 | (s1 << 1) | (s2 << 2) | (s3 << 3);
      if (code === 0 || code === 15) continue;
      // Counter-clockwise walk: bottom (k0→k1), right (k1→k2), top (k2→k3), left (k3→k0).
      edges[0] = 2 * k0; edges[1] = 2 * k1 + 1; edges[2] = 2 * k3; edges[3] = 2 * k0 + 1;
      signs[0] = s0; signs[1] = s1; signs[2] = s2; signs[3] = s3;
      if (code === 5 || code === 10) {
        const joined = value(k0) + value(k1) + value(k2) + value(k3) > 0;
        for (let m = 0; m < 4; m += 1) {
          if (!signs[m]) continue; // edge m runs inside → outside
          next[edges[m]] = edges[joined ? (m + 1) % 4 : (m + 3) % 4];
        }
        continue;
      }
      let from = -1; let to = -1;
      for (let m = 0; m < 4; m += 1) {
        const n = (m + 1) % 4;
        if (signs[m] === signs[n]) continue;
        if (signs[m]) from = m; else to = m;
      }
      next[edges[from]] = edges[to];
    }
  }
  const crossing = (id, out) => {
    const k = id >> 1;
    const i = k % nx; const j = (k - i) / nx;
    const vertical = id & 1;
    const a = value(k); const b = value(vertical ? k + nx : k + 1);
    const t = a / (a - b);
    out.push(vertical ? i : i + t, vertical ? j + t : j);
  };
  const rings = [];
  for (let id = 0; id < next.length; id += 1) {
    if (next[id] < 0) continue;
    const ring = [];
    let cur = id;
    while (next[cur] >= 0) {
      crossing(cur, ring);
      const following = next[cur];
      next[cur] = -1;
      cur = following;
    }
    if (ring.length >= 6) rings.push(ring);
  }
  return rings;
}

/**
 * Group rings into polygons: counter-clockwise rings are outers, clockwise
 * rings are holes and go to the SMALLEST outer that contains them — the right
 * one even for an island inside a hole inside an island.
 * @param {number[][]} rings - Flat planar rings, not closed.
 * @returns {number[][][]} `[outer, ...holes]`, outers by descending area, holes likewise.
 */
export function assemblePolygons(rings) {
  const outers = [];
  const holes = [];
  for (const ring of rings) {
    const area = signedRingArea(ring);
    if (area > 0) outers.push({ ring, area, box: ringBox(ring), holes: [] });
    else if (area < 0) holes.push({ ring, area: -area });
  }
  outers.sort((a, b) => b.area - a.area);
  const ascending = outers.slice().reverse();
  for (const hole of holes) {
    const x = hole.ring[0]; const y = hole.ring[1];
    const owner = ascending.find((o) => x >= o.box[0] && x <= o.box[2] && y >= o.box[1] && y <= o.box[3]
      && pointInRing(x, y, o.ring));
    if (owner) owner.holes.push(hole);
  }
  return outers.map((o) => [o.ring, ...o.holes.sort((a, b) => b.area - a.area).map((h) => h.ring)]);
}

function ringBox(flat) {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (let i = 0; i + 1 < flat.length; i += 2) {
    if (flat[i] < x0) x0 = flat[i];
    if (flat[i] > x1) x1 = flat[i];
    if (flat[i + 1] < y0) y0 = flat[i + 1];
    if (flat[i + 1] > y1) y1 = flat[i + 1];
  }
  return [x0, y0, x1, y1];
}

// ── Line work ───────────────────────────────────────────────────────────────

function segmentDistance2(px, py, ax, ay, bx, by) {
  const dx = bx - ax; const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = ax + t * dx - px; const ey = ay + t * dy - py;
  return ex * ex + ey * ey;
}

/**
 * Douglas–Peucker on an OPEN polyline. The first and last vertices are always
 * kept; distance is to the segment, not the infinite line, so a polyline that
 * doubles back is not collapsed.
 * @param {ArrayLike<number>} flat - `[x, y, …]` in metres.
 * @param {number} toleranceM
 * @returns {number[]}
 */
export function simplifyDouglasPeucker(flat, toleranceM) {
  const n = Math.floor(flat.length / 2);
  if (n <= 2) return Array.from(flat);
  const keep = new Uint8Array(n);
  keep[0] = 1; keep[n - 1] = 1;
  const tol2 = toleranceM * toleranceM;
  const stack = [0, n - 1];
  while (stack.length) {
    const b = stack.pop(); const a = stack.pop();
    let worst = -1; let at = -1;
    for (let i = a + 1; i < b; i += 1) {
      const d = segmentDistance2(flat[i * 2], flat[i * 2 + 1], flat[a * 2], flat[a * 2 + 1], flat[b * 2], flat[b * 2 + 1]);
      if (d > worst) { worst = d; at = i; }
    }
    if (worst > tol2) {
      keep[at] = 1;
      stack.push(a, at, at, b);
    }
  }
  const out = [];
  for (let i = 0; i < n; i += 1) if (keep[i]) out.push(flat[i * 2], flat[i * 2 + 1]);
  return out;
}

/**
 * Douglas–Peucker on a CLOSED ring: split at vertex 0 and the vertex farthest
 * from it, simplify both halves, rejoin. Deterministic for a given start.
 * @param {ArrayLike<number>} flat - Not closed.
 * @param {number} toleranceM
 * @returns {number[]} Not closed.
 */
export function simplifyRing(flat, toleranceM) {
  const n = Math.floor(flat.length / 2);
  if (n <= 3) return Array.from(flat);
  let far = 1; let best = -1;
  for (let i = 1; i < n; i += 1) {
    const dx = flat[i * 2] - flat[0]; const dy = flat[i * 2 + 1] - flat[1];
    const d = dx * dx + dy * dy;
    if (d > best) { best = d; far = i; }
  }
  const first = simplifyDouglasPeucker(Array.prototype.slice.call(flat, 0, far * 2 + 2), toleranceM);
  const second = simplifyDouglasPeucker(
    [...Array.prototype.slice.call(flat, far * 2), flat[0], flat[1]],
    toleranceM,
  );
  return [...first, ...second.slice(2, -2)];
}

/**
 * Chaikin corner cutting on a closed ring: each edge PQ becomes the two points
 * at ¼ and ¾. Each pass doubles the vertex count and converges on a quadratic
 * B-spline that stays inside the control polygon's convex hull.
 * @param {ArrayLike<number>} flat - Not closed.
 * @param {number} [iterations=1]
 * @returns {number[]} Not closed.
 */
export function chaikinRing(flat, iterations = 1) {
  let ring = Array.from(flat);
  for (let it = 0; it < iterations; it += 1) {
    const n = Math.floor(ring.length / 2);
    if (n < 3) break;
    const out = new Array(n * 4);
    for (let i = 0; i < n; i += 1) {
      const j = i + 1 === n ? 0 : i + 1;
      const px = ring[i * 2]; const py = ring[i * 2 + 1];
      const qx = ring[j * 2]; const qy = ring[j * 2 + 1];
      out[i * 4] = 0.75 * px + 0.25 * qx;
      out[i * 4 + 1] = 0.75 * py + 0.25 * qy;
      out[i * 4 + 2] = 0.25 * px + 0.75 * qx;
      out[i * 4 + 3] = 0.25 * py + 0.75 * qy;
    }
    ring = out;
  }
  return ring;
}

// ── Areas and distances on lon/lat ──────────────────────────────────────────

/**
 * Signed area of a lon/lat ring on the sphere, hectares.
 *
 * The shoelace formula in the Lambert cylindrical equal-area projection
 * (x = Rλ, y = R sin φ) — the Chamberlain & Duquette (2007) formula Turf uses.
 * The projection is equal-area, so the result is exact on the sphere for edges
 * drawn straight in it, and the edges here are 10 to 350 m long. See
 * {@link MEGAFIRE_BANDS_EARTH_RADIUS_M} for the radius.
 * @param {ArrayLike<number>} flat - `[lon, lat, …]`, not closed.
 * @returns {number} Positive when counter-clockwise.
 */
export function ringAreaHa(flat) {
  const n = Math.floor(flat.length / 2);
  if (n < 3) return 0;
  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    const prev = i === 0 ? n - 1 : i - 1;
    const next = i + 1 === n ? 0 : i + 1;
    sum += (flat[prev * 2] - flat[next * 2]) * DEG * Math.sin(flat[i * 2 + 1] * DEG);
  }
  const r = MEGAFIRE_BANDS_EARTH_RADIUS_M;
  return (sum * r * r) / 2 / 1e4;
}

/**
 * Net area of one polygon — outer ring minus holes — whatever their winding.
 * @param {ReadonlyArray<ArrayLike<number>>} rings - Outer first.
 * @returns {number} Hectares, floored at zero.
 */
export function polygonAreaHa(rings) {
  if (!rings?.length) return 0;
  let area = Math.abs(ringAreaHa(rings[0]));
  for (let i = 1; i < rings.length; i += 1) area -= Math.abs(ringAreaHa(rings[i]));
  return Math.max(0, area);
}

/**
 * Total area of a region (a list of polygons that do not overlap).
 * @param {ReadonlyArray<ReadonlyArray<ArrayLike<number>>>} polygons
 * @returns {number} Hectares.
 */
export function regionAreaHa(polygons) {
  let total = 0;
  for (const polygon of polygons) total += polygonAreaHa(polygon);
  return total;
}

/**
 * Whether a lon/lat point lies inside a region: even-odd within a polygon
 * (so a hole is outside), union across polygons.
 * @param {number} lon
 * @param {number} lat
 * @param {ReadonlyArray<ReadonlyArray<ArrayLike<number>>>} polygons
 * @returns {boolean}
 */
export function pointInRegion(lon, lat, polygons) {
  for (const polygon of polygons) {
    let inside = false;
    for (const ring of polygon) if (pointInRing(lon, lat, ring)) inside = !inside;
    if (inside) return true;
  }
  return false;
}

/**
 * Shortest distance from a lon/lat point to any ring of a region, metres,
 * measured in the local equirectangular plane at the point's latitude (the
 * error is under 0.1 % over the tens of kilometres that matter here).
 * @param {number} lon
 * @param {number} lat
 * @param {ReadonlyArray<ReadonlyArray<ArrayLike<number>>>} polygons
 * @returns {number} +∞ for an empty region.
 */
export function distanceToBoundaryM(lon, lat, polygons) {
  const ky = 111132.954 - 559.822 * Math.cos(2 * lat * DEG);
  const kx = 111412.84 * Math.cos(lat * DEG) - 93.5 * Math.cos(3 * lat * DEG);
  let best = Infinity;
  for (const polygon of polygons) {
    for (const ring of polygon) {
      const n = Math.floor(ring.length / 2);
      for (let i = 0; i < n; i += 1) {
        const j = i + 1 === n ? 0 : i + 1;
        const d = segmentDistance2(
          0, 0,
          (ring[i * 2] - lon) * kx, (ring[i * 2 + 1] - lat) * ky,
          (ring[j * 2] - lon) * kx, (ring[j * 2 + 1] - lat) * ky,
        );
        if (d < best) best = d;
      }
    }
  }
  return Math.sqrt(best);
}

/**
 * Distance from a point to a region: zero inside, else to its boundary.
 * @param {number} lon
 * @param {number} lat
 * @param {ReadonlyArray<ReadonlyArray<ArrayLike<number>>>} polygons
 * @returns {number} Metres.
 */
export function distanceToRegionM(lon, lat, polygons) {
  if (!polygons.length) return Infinity;
  return pointInRegion(lon, lat, polygons) ? 0 : distanceToBoundaryM(lon, lat, polygons);
}

/**
 * East–west metres between two longitudes at a latitude.
 * @param {number} lonA
 * @param {number} lonB
 * @param {number} lat
 * @returns {number}
 */
export function lonGapM(lonA, lonB, lat) {
  return Math.abs(lonA - lonB) * (111412.84 * Math.cos(lat * DEG) - 93.5 * Math.cos(3 * lat * DEG));
}

/**
 * Total vertex count of a region.
 * @param {ReadonlyArray<ReadonlyArray<ArrayLike<number>>>} polygons
 * @returns {number}
 */
export function regionVertexCount(polygons) {
  let n = 0;
  for (const polygon of polygons) for (const ring of polygon) n += Math.floor(ring.length / 2);
  return n;
}

// ── From field to drawable polygons ─────────────────────────────────────────

/**
 * Round, drop repeated vertices (including a last one equal to the first).
 * @param {ArrayLike<number>} flat - Lon/lat.
 * @param {number} dp
 * @returns {number[]}
 */
function roundRing(flat, dp) {
  const p = 10 ** dp;
  const out = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    const lon = Math.round(flat[i] * p) / p;
    const lat = Math.round(flat[i + 1] * p) / p;
    const m = out.length;
    if (m && out[m - 2] === lon && out[m - 1] === lat) continue;
    out.push(lon, lat);
  }
  while (out.length >= 4 && out[0] === out[out.length - 2] && out[1] === out[out.length - 1]) out.length -= 2;
  return out;
}

/**
 * Contour a field into drawable lon/lat polygons: marching squares, hole
 * assignment, Douglas–Peucker, Chaikin, the 20 ha floor, rounding.
 *
 * The area floor is applied AFTER smoothing, to the shape as drawn; a ring
 * whose winding flipped during simplification (a sliver pinched to nothing) is
 * dropped rather than drawn inside out.
 * @param {BandsGrid} grid
 * @param {ArrayLike<number>} field - Inside where > 0.
 * @param {{simplifyM: number, chaikinIterations: number, minPolygonHa: number}} options
 * @returns {number[][][]} Region: polygons `[outer (CCW), ...holes (CW)]`, largest first.
 */
export function fieldToPolygons(grid, field, { simplifyM, chaikinIterations, minPolygonHa }) {
  const { cellM, x0, y0 } = grid;
  const metric = traceContours(field, grid.nx, grid.ny).map((ring) => {
    const out = new Array(ring.length);
    for (let i = 0; i < ring.length; i += 2) {
      out[i] = x0 + ring[i] * cellM;
      out[i + 1] = y0 + ring[i + 1] * cellM;
    }
    return out;
  });
  const minM2 = minPolygonHa * 1e4;
  const shape = (ring) => chaikinRing(simplifyRing(ring, simplifyM), chaikinIterations);
  const toLonLat = (ring) => {
    const out = new Array(ring.length);
    for (let i = 0; i < ring.length; i += 2) {
      const [lon, lat] = gridToLonLat(grid, ring[i], ring[i + 1]);
      out[i] = lon; out[i + 1] = lat;
    }
    return roundRing(out, MEGAFIRE_BANDS_COORD_DP);
  };
  const region = [];
  for (const [outer, ...holes] of assemblePolygons(metric)) {
    const o = shape(outer);
    if (signedRingArea(o) < minM2) continue;
    const kept = [];
    for (const hole of holes) {
      const h = shape(hole);
      if (-signedRingArea(h) >= minM2) kept.push(h);
    }
    const polygon = [toLonLat(o), ...kept.map(toLonLat)].filter((r) => r.length >= 6);
    if (polygon.length && ringAreaHa(polygon[0]) > 0) region.push(polygon);
  }
  region.sort((a, b) => polygonAreaHa(b) - polygonAreaHa(a));
  return region;
}

// ── Anchors ─────────────────────────────────────────────────────────────────

/**
 * Where a band's date label is pinned: a vertex of its region's largest outer
 * ring, as far NORTH as possible — the camera looks north-north-east at an
 * oblique angle, so a label on the far side of a ring reads above it — at least
 * `gapM` outside the previous region (so it labels the new ground, not the
 * shared edge) and `spreadM` east or west of every label already placed. When
 * nothing qualifies both thresholds relax by quarters, down to none.
 * @param {ReadonlyArray<ReadonlyArray<ArrayLike<number>>>} region
 * @param {ReadonlyArray<ReadonlyArray<ArrayLike<number>>>|null} previous - Region b−1, null for band 0.
 * @param {ReadonlyArray<{lon: number, lat: number}>} placed
 * @param {{gapM: number, spreadM: number}} options
 * @returns {{lon: number, lat: number, relaxed: number}} `relaxed` = factor the thresholds ended at (1 = none).
 */
export function pickAnchor(region, previous, placed, { gapM, spreadM }) {
  const ring = region[0]?.[0];
  if (!ring) throw new RangeError('an empty region has no anchor');
  const n = Math.floor(ring.length / 2);
  const order = Array.from({ length: n }, (_, i) => i)
    .sort((a, b) => ring[b * 2 + 1] - ring[a * 2 + 1] || ring[a * 2] - ring[b * 2]);
  const gaps = previous?.length
    ? order.map((i) => distanceToRegionM(ring[i * 2], ring[i * 2 + 1], previous))
    : null;
  for (const factor of [1, 0.75, 0.5, 0.25, 0]) {
    for (let r = 0; r < order.length; r += 1) {
      const i = order[r];
      const lon = ring[i * 2]; const lat = ring[i * 2 + 1];
      if (gaps && gaps[r] < gapM * factor) continue;
      if (placed.some((a) => lonGapM(a.lon, lon, lat) < spreadM * factor)) continue;
      return { lon, lat, relaxed: factor };
    }
  }
  return { lon: ring[order[0] * 2], lat: ring[order[0] * 2 + 1], relaxed: 0 };
}

// ── Shape agreement ─────────────────────────────────────────────────────────

/**
 * How well a region agrees in SHAPE with a mapped perimeter, counted on the
 * same grid nodes: intersection over union, and the two kinds of
 * disagreement as shares of the union.
 *
 * `copernicusOnly` is the damaging one for this map: ground the perimeter says
 * had already burnt that the region leaves out, i.e. that a later ring would
 * claim. `firmsOnly` is ground the region lights that the perimeter does not
 * (yet) include.
 * @param {ArrayLike<number>} regionField - Inside where > 0.
 * @param {ArrayLike<number>} mappedMask - Inside where truthy.
 * @returns {{iou: number, copernicusOnly: number, firmsOnly: number}} Fractions in [0, 1].
 */
export function maskAgreement(regionField, mappedMask) {
  let both = 0; let regionOnly = 0; let mappedOnly = 0;
  for (let k = 0; k < regionField.length; k += 1) {
    const a = regionField[k] > 0; const b = !!mappedMask[k];
    if (a && b) both += 1;
    else if (a) regionOnly += 1;
    else if (b) mappedOnly += 1;
  }
  const union = both + regionOnly + mappedOnly;
  if (!union) return { iou: 0, copernicusOnly: 0, firmsOnly: 0 };
  return { iou: both / union, copernicusOnly: mappedOnly / union, firmsOnly: regionOnly / union };
}

/**
 * How many detections up to an instant lie farther than `distanceM` outside a
 * region — the measure of a perimeter that lags the fire it maps.
 * @param {ReadonlyArray<ReadonlyArray<ArrayLike<number>>>} polygons - Lon/lat region.
 * @param {ArrayLike<number>} lons
 * @param {ArrayLike<number>} lats
 * @param {ArrayLike<number>} times
 * @param {number} untilMs
 * @param {number} distanceM
 * @returns {{outside: number, total: number}}
 */
export function detectionsOutside(polygons, lons, lats, times, untilMs, distanceM) {
  let outside = 0; let total = 0;
  for (let i = 0; i < times.length; i += 1) {
    if (times[i] > untilMs) continue;
    total += 1;
    if (distanceToRegionM(lons[i], lats[i], polygons) > distanceM) outside += 1;
  }
  return { outside, total };
}

// ── Entry point ─────────────────────────────────────────────────────────────

/**
 * @typedef {Object} MegafireBandsTrace
 * @property {Array<{radiusM: number, iou: number, perProduct: Array<{product: string, iou: number, copernicusOnly: number, firmsOnly: number}>}>} [calibration] - Every candidate tried.
 * @property {Array<{product: string, at: string, regionHa: number, iou: number, copernicusOnly: number, firmsOnly: number}>} [perImage] - Every Copernicus image, at the chosen R.
 * @property {{nx: number, ny: number, cellM: number}} [grid]
 * @property {number} [footprintRasterHa] - Node count × cell area, before contouring.
 * @property {number[]} [anchorRelaxed] - Per band, the factor the anchor thresholds ended at.
 */

/**
 * Build the whole `bands.json` object from the frozen pack.
 *
 * Deterministic: no clock is read (`builtAt` comes from `params`), no random
 * number is drawn, polygons and holes come out by descending area.
 * @param {Object} input
 * @param {{window: {start: string, end: string}, steps: Array<{product: string, acq: string, burntHa: number, rings: number[][][]}>}} input.event
 * @param {{epoch: string, columns: string[], rows: Array<Array<number|string>>}} input.hotspots
 * @param {ReadonlyArray<{id: string, days: ReadonlyArray<string>, from: string, to: string}>} [input.bands]
 * @param {Partial<typeof MEGAFIRE_BANDS_PARAMS>} [input.params]
 * @param {MegafireBandsTrace} [input.trace] - Filled with diagnostics when given.
 * @returns {Object} The `gironde-megafire-2026/bands-1` document.
 */
export function buildMegafireBands({ event, hotspots, bands = MEGAFIRE_DAY_BANDS, params = {}, trace = {} }) {
  const p = { ...MEGAFIRE_BANDS_PARAMS, ...params };
  if (!bands.length) throw new RangeError('at least one band is needed');
  const polygons = event.steps.flatMap((s) => s.rings);
  const grid = makeBandsGrid(polygonsBbox(polygons), p);
  const { nx, ny, cellM } = grid;
  const size = nx * ny;
  trace.grid = { nx, ny, cellM };

  // 1. Footprint: union of every Copernicus frame, closed by a low threshold.
  const raw = rasterizePolygons(grid, polygons);
  const footBlur = gaussianBlur(raw, nx, ny, p.footprintSmoothM / cellM);
  const foot = new Float32Array(size);
  const footMask = new Uint8Array(size);
  let footNodes = 0;
  for (let k = 0; k < size; k += 1) {
    foot[k] = footBlur[k] - p.footprintThreshold;
    if (foot[k] > 0) { footMask[k] = 1; footNodes += 1; }
  }
  trace.footprintRasterHa = (footNodes * cellM * cellM) / 1e4;

  // 2. Detections, as exact instants.
  const col = (name) => {
    const at = hotspots.columns.indexOf(name);
    if (at < 0) throw new RangeError(`hotspots has no ${name} column`);
    return at;
  };
  const iLon = col('lon'); const iLat = col('lat'); const iMin = col('minutes');
  const epoch = Date.parse(hotspots.epoch);
  const n = hotspots.rows.length;
  const lons = new Float64Array(n); const lats = new Float64Array(n); const times = new Float64Array(n);
  hotspots.rows.forEach((row, i) => {
    lons[i] = row[iLon]; lats[i] = row[iLat]; times[i] = epoch + row[iMin] * 60000;
  });

  const lint = { simplifyM: p.simplifyM, chaikinIterations: p.chaikinIterations, minPolygonHa: p.minPolygonHa };
  // NORMALIZED blur: the share of the FOOTPRINT around a node that was lit,
  // not the share of all ground. A plain blur of the lit mask counts the
  // unburnt ground outside the scar as "not lit", so near the scar's edge every
  // region fell under the threshold a few hundred metres early — and the last
  // band showed up as a thin rim all round the fire, as if its whole edge had
  // burnt on the last days (capture of 2026-09-23). Divided by the blurred
  // footprint, a node at the edge of ground that was all lit reads 1, the
  // region runs to the footprint's own edge, and there the two contours are
  // the SAME contour.
  const footShare = gaussianBlur(Float32Array.from(footMask), nx, ny, p.smoothM / cellM);
  const regionField = (earliest, untilMs) => {
    const lit = new Float32Array(size);
    for (let k = 0; k < size; k += 1) lit[k] = footMask[k] && earliest[k] <= untilMs ? 1 : 0;
    const blurred = gaussianBlur(lit, nx, ny, p.smoothM / cellM);
    for (let k = 0; k < size; k += 1) {
      const share = footShare[k] > 1e-4 ? blurred[k] / footShare[k] : 0;
      blurred[k] = Math.min(share - p.threshold, foot[k]);
    }
    return blurred;
  };

  // 3. Calibration: the radius whose regions best match the Copernicus
  // perimeters in SHAPE, scored on the grid nodes before contouring.
  const stepOf = (product) => {
    const found = event.steps.find((s) => s.product === product);
    if (!found) throw new RangeError(`event has no ${product} step`);
    return found;
  };
  const calSteps = p.calibrationProducts.map(stepOf);
  const checkSteps = p.checkProducts.map(stepOf);
  const mapped = new Map();
  const mappedMask = (st) => {
    if (!mapped.has(st.product)) mapped.set(st.product, rasterizePolygons(grid, st.rings));
    return mapped.get(st.product);
  };
  const agree = (earliest, st) => ({
    product: st.product,
    ...maskAgreement(regionField(earliest, Date.parse(st.acq)), mappedMask(st)),
  });
  const rounded = (a) => ({
    product: a.product, iou: round3(a.iou), copernicusOnly: round3(a.copernicusOnly), firmsOnly: round3(a.firmsOnly),
  });
  const meanIoU = (rows) => rows.reduce((sum, r) => sum + r.iou, 0) / rows.length;
  const candidates = typeof p.radiusM === 'number'
    ? [p.radiusM]
    : [...p.radiusCandidatesM].sort((a, b) => a - b);
  // Scored unrounded: the rule compares means that differ in the fourth decimal.
  const scored = candidates.map((r) => {
    const stamped = stampEarliest(grid, lons, lats, times, r);
    const perProduct = calSteps.map((st) => agree(stamped, st));
    return { radiusM: r, iou: meanIoU(perProduct), perProduct };
  });
  const bestIoU = Math.max(...scored.map((c) => c.iou));
  const chosen = scored.find((c) => c.iou >= bestIoU - p.iouTolerance);
  const radiusM = chosen.radiusM;
  trace.calibration = scored.map((c) => ({ radiusM: c.radiusM, iou: round3(c.iou), perProduct: c.perProduct.map(rounded) }));

  // 4. Cumulative regions and the band fills between them.
  const earliest = stampEarliest(grid, lons, lats, times, radiusM);
  trace.perImage = event.steps.map((st) => ({
    at: st.acq,
    regionHa: round1(regionAreaHa(fieldToPolygons(grid, regionField(earliest, Date.parse(st.acq)), lint))),
    ...rounded(agree(earliest, st)),
  }));
  const checks = checkSteps.map((st) => rounded(agree(earliest, st)));
  let excluded;
  if (p.excludedProduct) {
    const st = stepOf(p.excludedProduct);
    const lag = detectionsOutside(st.rings, lons, lats, times, Date.parse(st.acq), p.lagDistanceM);
    excluded = {
      product: st.product,
      reason: `lags the detections: ${lag.outside} of ${lag.total} earlier detections lie > ${p.lagDistanceM} m outside it`,
    };
  }
  const fields = [];
  for (let b = 0; b < bands.length; b += 1) {
    if (b === bands.length - 1) { fields.push(foot); continue; }
    const g = regionField(earliest, Date.parse(bands[b].to));
    if (b > 0) for (let k = 0; k < size; k += 1) g[k] = Math.max(g[k], fields[b - 1][k]);
    fields.push(g);
  }
  const regions = fields.map((f) => fieldToPolygons(grid, f, lint));
  const fills = fields.map((f, b) => {
    if (b === 0) return regions[0];
    const prev = fields[b - 1];
    const g = new Float32Array(size);
    for (let k = 0; k < size; k += 1) g[k] = Math.min(f[k], -prev[k]);
    return fieldToPolygons(grid, g, lint);
  });

  // 5. Detection counts and label anchors.
  const placed = [];
  trace.anchorRelaxed = [];
  const out = bands.map((band, b) => {
    const from = Date.parse(band.from); const to = Date.parse(band.to);
    let detections = 0;
    for (let i = 0; i < n; i += 1) {
      if (times[i] <= to && (times[i] > from || (b === 0 && times[i] === from))) detections += 1;
    }
    const anchor = pickAnchor(regions[b], b ? regions[b - 1] : null, placed,
      { gapM: p.anchorGapM, spreadM: p.anchorSpreadM });
    placed.push(anchor);
    trace.anchorRelaxed.push(anchor.relaxed);
    return {
      id: band.id,
      days: [...band.days],
      from: band.from,
      to: band.to,
      detections,
      regionHa: round1(regionAreaHa(regions[b])),
      region: regions[b],
      band: fills[b],
      anchor: { lon: anchor.lon, lat: anchor.lat },
    };
  });

  return {
    schema: MEGAFIRE_BANDS_SCHEMA,
    builtAt: p.builtAt,
    method: {
      timeZone: p.timeZone,
      cellM,
      radiusM,
      smoothM: p.smoothM,
      footprintSmoothM: p.footprintSmoothM,
      minPolygonHa: p.minPolygonHa,
      simplifyM: p.simplifyM,
      calibration: {
        objective: 'iou',
        products: calSteps.map((st) => st.product),
        chosenIoU: round3(chosen.iou),
        fit: chosen.perProduct.map(rounded),
        checks,
        perRadius: trace.calibration.map((c) => ({ radiusM: c.radiusM, iou: c.iou })),
        ...(excluded ? { excluded } : {}),
      },
    },
    footprintHa: round1(regionAreaHa(regions[regions.length - 1])),
    bands: out,
  };
}

function round1(v) {
  return Math.round(v * 10) / 10;
}

function round3(v) {
  return Math.round(v * 1000) / 1000;
}
