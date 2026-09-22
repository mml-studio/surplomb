/**
 * ADEME DPE feed projection — the energy label of the building, and of its
 * neighbours.
 *
 * WHAT THIS SOURCE IS. Every *diagnostic de performance énergétique* issued in
 * France since July 2021, published by the ADEME. A DPE is compulsory for any
 * sale, so the register is close to a census of what has changed hands — and
 * because it is geocoded against the BAN, it answers a question no listing
 * does: not just "what is this flat's label" but "what are the labels of the
 * whole street".
 *
 * MEASURED against the live API on 2026-09-01:
 *   - dataset `dpe03existant` (id `meg-83tjwtg8dyz4vv7h1dqe`), **15,476,290
 *     rows**, **230 fields**, `access-control-allow-origin: *`, keyless
 *   - `GET /lines?geo_distance=2.3760,48.8300,300` → 200, `total: 2805`
 *     within 300 m of one Paris 13e point
 *   - each row carries `_geo_distance` in METRES and `_geopoint` as the string
 *     `"lat,lon"` — latitude first, the inverse of the `geo_distance` argument
 *     order, which is `lon,lat,radius`
 *
 * WHY A PROXY FOR SOMETHING THIS SMALL. Not for CORS, and not for size: three
 * rows are 1,613 bytes. It exists to pin the FIELD SELECTION. A `select` naming
 * a field the schema does not have returns HTTP 400 with an ODSQL-style error
 * rather than ignoring it, so the 230-field surface has to be pinned somewhere
 * a unit test can see it — and the browser should not carry a list of 230
 * French column names to discover that.
 *
 * WHAT THE PROJECTION REFUSES TO DO. It does not average labels into a
 * "neighbourhood grade". A DPE describes one dwelling's envelope and heating
 * system; the mean of a street's letters is not a property of the street. The
 * distribution is returned instead, and the reader draws their own conclusion.
 *
 * Dependency-free and side-effect-free. The `/api/dpe` proxy imports this.
 */

const DATASET = 'dpe03existant';
const API_ROOT = `https://data.ademe.fr/data-fair/api/v1/datasets/${DATASET}`;

/** Default search radius in metres. */
export const DPE_DEFAULT_RADIUS_M = 200;
/** Ceiling on the radius. */
export const DPE_MAX_RADIUS_M = 1000;
/** Ceiling on rows served in one answer. */
export const DPE_MAX_ENTRIES = 500;

/**
 * The fields the projection reads, and the only ones requested.
 *
 * Pinned as an exported constant because naming a field this dataset does not
 * publish is an HTTP 400, not a silently ignored column: an edition that
 * renamed one of these would take the whole layer down rather than degrade it.
 */
export const DPE_FIELDS = Object.freeze([
  'numero_dpe',
  'etiquette_dpe',
  'etiquette_ges',
  'adresse_ban',
  'identifiant_ban',
  // The pivot. The register names the BUILDING, not just the address point, and
  // that identifier is the same one the BD TOPO tiles carry — see `rnbPivot.js`
  // for what it buys and for the calibration behind the claim. Measured over
  // four boxes on 2026-09-07, `id_rnb` is present on 34.5 % (Ustaritz) to
  // 73.7 % (Paris 13e) of the rows a scan returns.
  'id_rnb',
  // How the register got it: `Reprise RNB` when the RNB matched the diagnostic
  // itself, `Logiciel` when the diagnostician's software declared it. Two
  // different claims about the same key, and the card is entitled to say which.
  'provenance_id_rnb',
  'annee_construction',
  'surface_habitable_logement',
  'cout_total_5_usages',
  'conso_5_usages_par_m2_ep',
  'emission_ges_5_usages_par_m2',
  'date_etablissement_dpe',
  '_geopoint',
]);

/** The seven labels, worst last, so a distribution keeps a meaningful order. */
export const DPE_LABELS = Object.freeze(['A', 'B', 'C', 'D', 'E', 'F', 'G']);

/**
 * Coerce a query value to a number, treating ABSENT as absent.
 *
 * `URLSearchParams.get()` returns `null` for a missing parameter, `Number(null)`
 * is `0`, and `Number.isFinite(0)` is true — so a plain `Number()` turns "the
 * caller said nothing" into "the caller said zero", and every clamp below then
 * returns its MINIMUM instead of its default. Measured live: `GET /api/dpe`
 * with no `radius` scanned 50 m rather than the documented 200 m, and returned
 * `total: 0` for an address with 2,805 diagnostics around it. Same root cause
 * as the `addressPoint` guard in `vite.config.js`.
 *
 * @param {unknown} value
 * @returns {number|null} A finite number, or null when nothing usable was given.
 */
function requestedNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Clamp a requested radius into the range this layer will serve.
 * @param {unknown} value @returns {number}
 */
export function clampDpeRadius(value) {
  const requested = requestedNumber(value);
  if (requested === null) return DPE_DEFAULT_RADIUS_M;
  return Math.min(DPE_MAX_RADIUS_M, Math.max(50, Math.round(requested)));
}

/**
 * Build the upstream URL for one address scan.
 *
 * `geo_distance` takes LONGITUDE, LATITUDE, RADIUS — while the `_geopoint` it
 * returns is latitude-first. The two orders are built and parsed in this one
 * module so the inconsistency is handled once.
 *
 * No `sort` is sent, and that is deliberate rather than an omission:
 * `sort=_geo_distance` is rejected with HTTP 400 — the distance is computed per
 * query, not stored — while `geo_distance` already returns rows nearest-first.
 * Asking for the sort explicitly takes the whole layer down.
 *
 * @param {{lon: number, lat: number, radiusM?: number, limit?: number}} query
 * @returns {string}
 */
export function buildDpeUrl({ lon, lat, radiusM, limit }) {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    throw new Error('dpe: lon/lat must be finite numbers');
  }
  const radius = clampDpeRadius(radiusM);
  const size = Math.min(DPE_MAX_ENTRIES, Math.max(1, Math.round(Number(limit) || 100)));
  const params = new URLSearchParams({
    size: String(size),
    geo_distance: `${lon},${lat},${radius}`,
    select: DPE_FIELDS.join(','),
  });
  return `${API_ROOT}/lines?${params}`;
}

/**
 * Parse the `"lat,lon"` geopoint string into a pair.
 * @param {unknown} value @returns {{lon: number, lat: number}|null}
 */
export function parseGeopoint(value) {
  const parts = String(value ?? '').split(',');
  if (parts.length !== 2) return null;
  const lat = Number(parts[0]);
  const lon = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lon, lat };
}

/** Normalise a label to one of the seven, or null. */
function label(value) {
  const letter = String(value ?? '').trim().toUpperCase();
  return DPE_LABELS.includes(letter) ? letter : null;
}

/** Coerce to a finite number, or null. Absent is not zero. */
function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Project the upstream page into the entries the client draws.
 *
 * `total` is the upstream's own count of matching diagnostics and is kept
 * separate from `entries.length`: the difference between "2,805 DPE within
 * 300 m" and "here are the 100 nearest" is the whole honesty of the layer.
 *
 * @param {object|null|undefined} payload Upstream `/lines` body.
 * @param {{radiusM: number}} context
 * @returns {{total: number|null, entries: Array<object>, truncated: boolean,
 *   distribution: Record<string, number>, medianCoutAnnuel: number|null}}
 */
export function projectDpe(payload, { radiusM } = {}) {
  const rows = Array.isArray(payload?.results) ? payload.results : [];
  const total = Number.isFinite(payload?.total) ? payload.total : null;
  const entries = [];
  const distribution = Object.fromEntries(DPE_LABELS.map((letter) => [letter, 0]));
  const costs = [];
  let withRnb = 0;
  for (const row of rows) {
    const point = parseGeopoint(row?._geopoint);
    const dpe = label(row?.etiquette_dpe);
    if (dpe) distribution[dpe] += 1;
    const cost = num(row?.cout_total_5_usages);
    if (cost !== null) costs.push(cost);
    const rnb = String(row?.id_rnb ?? '').trim() || null;
    if (rnb) withRnb += 1;
    entries.push({
      id: String(row?.numero_dpe ?? `dpe-${entries.length}`),
      etiquetteDpe: dpe,
      etiquetteGes: label(row?.etiquette_ges),
      address: row?.adresse_ban ?? null,
      banId: row?.identifiant_ban ?? null,
      // `rnb` is the name `buildingTheme.js` joins on. Carried on every entry,
      // graded or not: a diagnostic with no letter still belongs to a building
      // and still has to be counted against it.
      rnb,
      rnbSource: rnb ? (String(row?.provenance_id_rnb ?? '').trim() || null) : null,
      builtYear: num(row?.annee_construction),
      surfaceM2: num(row?.surface_habitable_logement),
      annualCostEur: cost,
      consoKwhM2: num(row?.conso_5_usages_par_m2_ep),
      gesKgM2: num(row?.emission_ges_5_usages_par_m2),
      issuedOn: row?.date_etablissement_dpe ?? null,
      lon: point ? point.lon : null,
      lat: point ? point.lat : null,
      distanceM: Number.isFinite(row?._geo_distance) ? Math.round(row._geo_distance) : null,
    });
  }
  costs.sort((a, b) => a - b);
  return {
    radiusM,
    total,
    entries,
    truncated: total !== null && total > entries.length,
    distribution,
    // Share of the served rows that name a building. It is the ceiling on what
    // the identity join can reach in this scan, and the layer prints it rather
    // than letting a thin edition look like a thin city.
    rnbCoverage: entries.length ? withRnb / entries.length : 0,
    medianCoutAnnuel: costs.length ? Math.round(costs[Math.floor((costs.length - 1) / 2)]) : null,
  };
}

// ---------------------------------------------------------------------------
// The area regimes — the cadastre's own shapes, painted on the DPE scale
// ---------------------------------------------------------------------------
/**
 * Above 600 m the layer paints the CADASTRE, the way the price layer does:
 * every parcel that holds a diagnostic from 600 m to 1 800 m, every cadastral
 * section above. Until 2026-09-22 it drew discs over geohash cells, sized by
 * their count and coloured by their share of F and G; the operator asked for
 * « directement les parcelles des bâtiments concernés », on the A–G scale.
 *
 * The register names no parcel and no section, so both are reached BY
 * GEOMETRY: a diagnostic's BAN point, placed on the shape it stands on
 * (`shapeLocator.js`, which also holds the measurements behind its 3 m snap).
 * What differs between the two bands is how the points are read.
 */

/**
 * The fields a box's diagnostics are read with in the parcel band.
 *
 * FOUR, NOT THE DISC REGIME'S FIFTEEN. The shape only needs where and which
 * letter; the commune says whose cadastre to load; the address is what the
 * card of a parcel is titled with. Measured on one 0.01° tile of Lyon 1er
 * (8 338 rows): 128 KB gzipped without the address, 177 KB with it.
 */
export const DPE_AREA_FIELDS = Object.freeze([
  '_geopoint',
  'etiquette_dpe',
  'code_insee_ban',
  'adresse_ban',
]);

/** The largest page data-fair serves. */
export const DPE_TILE_PAGE_SIZE = 10_000;

/**
 * Pages read per 0.01° tile, at most.
 *
 * The densest tiles measured are Paris: 12 231 (11e), 11 953 (9e) and 14 074
 * (15e) diagnostics — two pages. Four leaves room for a denser block and
 * bounds what one camera settle can cost; a tile that needed a fifth is
 * reported as truncated rather than drawn as if it were whole.
 */
export const DPE_TILE_MAX_PAGES = 4;

/**
 * URL for one page of a tile's diagnostics, the fields above only.
 *
 * `bbox` is `west,south,east,north`, data-fair's order. The next page is the
 * `next` link the answer carries (an `after` cursor), never a `page` number:
 * data-fair refuses to page past 10 000 rows by number.
 *
 * @param {{box: {south: number, west: number, north: number, east: number}}} query
 * @returns {string}
 */
export function buildDpeTileRowsUrl({ box }) {
  if (!box || ![box.south, box.west, box.north, box.east].every(Number.isFinite)) {
    throw new Error('dpe: a tile scan needs a finite box');
  }
  const params = new URLSearchParams({
    bbox: `${box.west},${box.south},${box.east},${box.north}`,
    size: String(DPE_TILE_PAGE_SIZE),
    select: DPE_AREA_FIELDS.join(','),
  });
  return `${API_ROOT}/lines?${params}`;
}

/** Seven zeros, one per letter, in {@link DPE_LABELS} order. */
export function emptyLetterCounts() {
  return [0, 0, 0, 0, 0, 0, 0];
}

/** Sum of a seven-letter count array. */
export function letterCountsTotal(counts) {
  let total = 0;
  for (const n of counts || []) total += Number(n) || 0;
  return total;
}

/**
 * Fold rows into POINTS — one per distinct BAN geocode, with its letters.
 *
 * A block of flats files one diagnostic per sale on the same geocode, so this
 * is where the volume goes: 8 338 rows over Lyon 1er are 1 107 points. The
 * point keeps the commune the register filed it under (whose cadastre it will
 * be looked up in) and the address it was filed at.
 *
 * @param {Array<object>} rows `/lines` results with {@link DPE_AREA_FIELDS}.
 * @param {Map<string, object>} [into] Points already folded, merged into.
 * @returns {{points: Map<string, object>, withoutPoint: number}}
 */
export function reduceDpeRowsToPoints(rows, into = new Map()) {
  let withoutPoint = 0;
  for (const row of rows || []) {
    const key = String(row?._geopoint ?? '').trim();
    const at = parseGeopoint(key);
    if (!at) { withoutPoint += 1; continue; }
    let point = into.get(key);
    if (!point) {
      point = {
        lon: at.lon,
        lat: at.lat,
        insee: String(row?.code_insee_ban ?? '').trim() || null,
        address: String(row?.adresse_ban ?? '').trim() || null,
        counts: emptyLetterCounts(),
        ungraded: 0,
      };
      into.set(key, point);
    }
    const index = DPE_LABELS.indexOf(label(row?.etiquette_dpe));
    if (index >= 0) point.counts[index] += 1;
    else point.ungraded += 1;
  }
  return { points: into, withoutPoint };
}

/**
 * How far off a parcel's edge a diagnostic's point may stand and still be
 * placed on it, in metres. See `shapeLocator.js` for the measurement: over
 * Lyon 1er, 534 of 1 107 points stood within 2 m of a parcel and outside it
 * — on the front door's line, facing the street.
 */
export const DPE_PARCEL_SNAP_M = 3;

/**
 * How far off a section a 50 m grid square's centre may stand. Half the
 * square's diagonal: a square whose centre falls on a road between two
 * sections still holds addresses, and they are on one side or the other.
 */
export const DPE_SECTION_SNAP_M = 36;

/**
 * Place points on shapes and add up each shape's letters.
 *
 * One function for both bands — a point is a geocode in the parcel band and a
 * grid square in the section band — so both count the same four things: the
 * diagnostics placed INSIDE a shape, those placed by the snap, those placed
 * nowhere, and the points behind the last.
 *
 * @param {Iterable<object>} points `{lon, lat, insee, counts, ungraded, address?}`.
 * @param {(point: object) => ?{id: string, inside: boolean, whole?: boolean}} locate
 *   Given the whole point, so a caller can look in the commune the register
 *   filed it under before the others. `whole` is the section band's: the
 *   grid square lies ENTIRELY inside the shape, not just its centre.
 * @returns {{shapes: Map<string, object>, inside: number, snapped: number,
 *   unplaced: number, unplacedPoints: number}}
 */
export function placeDpePointsOnShapes(points, locate) {
  const shapes = new Map();
  let inside = 0;
  let snapped = 0;
  let unplaced = 0;
  let unplacedPoints = 0;
  for (const point of points || []) {
    const total = letterCountsTotal(point.counts) + (point.ungraded || 0);
    if (!total) continue;
    const hit = locate(point);
    if (!hit) {
      unplaced += total;
      unplacedPoints += 1;
      continue;
    }
    let shape = shapes.get(hit.id);
    if (!shape) {
      shape = {
        id: hit.id, counts: emptyLetterCounts(), ungraded: 0, snapped: 0, whole: 0, addresses: new Map(),
      };
      shapes.set(hit.id, shape);
    }
    for (let i = 0; i < DPE_LABELS.length; i += 1) shape.counts[i] += point.counts[i] || 0;
    if (hit.whole) shape.whole += letterCountsTotal(point.counts);
    shape.ungraded += point.ungraded || 0;
    if (hit.inside) inside += total;
    else { snapped += total; shape.snapped += total; }
    if (point.address) shape.addresses.set(point.address, (shape.addresses.get(point.address) || 0) + total);
  }
  return { shapes, inside, snapped, unplaced, unplacedPoints };
}

/** Addresses a parcel's card names, busiest first. */
export const DPE_PARCEL_MAX_ADDRESSES = 3;

/**
 * One placed shape, as it travels: the letters and the admissions, and its
 * addresses capped, busiest first.
 * @param {object} shape From {@link placeDpePointsOnShapes}.
 * @returns {object}
 */
export function finishDpeShape(shape) {
  const ranked = [...(shape?.addresses || new Map())]
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    .map(([address]) => address);
  return {
    id: shape.id,
    counts: [...shape.counts],
    ungraded: shape.ungraded,
    snapped: shape.snapped,
    ...(shape.whole ? { whole: shape.whole } : {}),
    ...(ranked.length ? {
      addresses: ranked.slice(0, DPE_PARCEL_MAX_ADDRESSES),
      moreAddresses: Math.max(0, ranked.length - DPE_PARCEL_MAX_ADDRESSES),
    } : {}),
  };
}

/**
 * The grid the section band reads the register on, in Lambert-93 metres.
 *
 * WHY A GRID, AND NOT THE ROWS. A 0.08° box seen from above 1 800 m holds
 * 227 114 diagnostics over Lyon, 513 554 over central Paris and 140 309 over
 * Bordeaux–Mérignac (measured 2026-09-22) — 14 to 52 pages of rows per camera
 * settle. The ADEME aggregates for us instead: `values_agg` nests a histogram
 * on the register's own Lambert-93 coordinates (`coordonnee_cartographique_x_ban`
 * / `_y_ban`) under the commune and over the letters, so one request per
 * 0.04° tile returns every 50 m square that holds a diagnostic, with its seven
 * counts. Central Paris, 102 104 diagnostics: 5 230 squares, 92 KB, 3.2 s,
 * and the counts add up to the total exactly.
 *
 * FIFTY METRES, BECAUSE TWENTY-FIVE TRIPS THE CLUSTER. The same Paris tile at
 * 25 m was refused twice with HTTP 429 and Elasticsearch's own « Data too
 * large, data for [allocated_buckets] » — a circuit breaker on the ADEME's
 * side, not a quota; Lyon passed at 25 m (17 870 squares, 117 KB). A square
 * is placed whole on the section under its centre, so a square that straddles
 * two sections gives all its diagnostics to one of them. Sections run 200 to
 * 600 m across in a city; the error is at their edges, and the card says how
 * each section's letters were counted.
 */
export const DPE_GRID_M = 50;

/** Communes one grid request may name — a 0.04° tile of open country holds a score. */
export const DPE_GRID_MAX_COMMUNES = 40;

/**
 * URL for one tile's grid.
 * @param {{box: {south: number, west: number, north: number, east: number}}} query
 * @returns {string}
 */
export function buildDpeGridUrl({ box }) {
  if (!box || ![box.south, box.west, box.north, box.east].every(Number.isFinite)) {
    throw new Error('dpe: a grid scan needs a finite box');
  }
  const params = new URLSearchParams({
    field: 'code_insee_ban;coordonnee_cartographique_x_ban;coordonnee_cartographique_y_ban;etiquette_dpe',
    interval: `value;${DPE_GRID_M};${DPE_GRID_M};value`,
    // Histograms return every non-empty bucket whatever this says; the terms
    // levels (communes, letters) are the ones it caps. Kept small on purpose:
    // the breaker above is sized on what the request could allocate.
    agg_size: `${DPE_GRID_MAX_COMMUNES};100;100;${DPE_LABELS.length}`,
    bbox: `${box.west},${box.south},${box.east},${box.north}`,
    // No sample rows per bucket — the same default that turned a 5 KB geohash
    // answer into 10.6 MB.
    size: '0',
  });
  return `${API_ROOT}/values_agg?${params}`;
}

/**
 * The grid squares of one answer, as points on the square's centre.
 *
 * `toWgs84` is injected — `scripts/lib/lambert93.mjs` in the proxy — so this
 * module stays free of projection arithmetic and a test can pass a plain
 * function. A square whose centre does not come back inside France is not
 * Lambert-93 at all (an overseas row keeps its local UTM coordinates in the
 * same column) and is dropped and counted rather than drawn in the Atlantic.
 *
 * @param {?object} body `values_agg` answer.
 * @param {(x: number, y: number) => {lon: number, lat: number}} toWgs84
 * @param {(lon: number, lat: number) => boolean} [plausible]
 * @returns {{points: Array<object>, total: number, outside: number, truncated: boolean}}
 */
export function projectDpeGrid(body, toWgs84, plausible = () => true) {
  const points = [];
  let outside = 0;
  let truncated = Number(body?.total_other) > 0;
  const half = DPE_GRID_M / 2;
  for (const commune of body?.aggs || []) {
    const insee = String(commune?.value ?? '').trim() || null;
    if (Number(commune?.total_other) > 0) truncated = true;
    for (const column of commune?.aggs || []) {
      const x = Number(column?.value);
      if (Number(column?.total_other) > 0) truncated = true;
      for (const square of column?.aggs || []) {
        const y = Number(square?.value);
        const total = Number(square?.total) || 0;
        if (!Number.isFinite(x) || !Number.isFinite(y) || total <= 0) continue;
        const counts = emptyLetterCounts();
        for (const bucket of square?.aggs || []) {
          const index = DPE_LABELS.indexOf(label(bucket?.value));
          if (index >= 0) counts[index] += Number(bucket?.total) || 0;
        }
        const at = toWgs84(x + half, y + half);
        if (!at || !plausible(at.lon, at.lat)) { outside += total; continue; }
        points.push({
          key: `${insee}|${x}|${y}`,
          // The square's own corner, kept so the proxy can test whether the
          // WHOLE square lies in one section (see DPE_SECTION_MIN_GRADED).
          x,
          y,
          lon: at.lon,
          lat: at.lat,
          insee,
          counts,
          ungraded: Math.max(0, total - letterCountsTotal(counts)),
        });
      }
    }
  }
  return { points, total: Number(body?.total) || 0, outside, truncated };
}

/**
 * Fewest labelled diagnostics a SECTION must hold in grid squares lying
 * WHOLLY inside it before it is painted.
 *
 * Three, the price layer's own floor for the same shape and for the same
 * reason: a section's area is the cadastre's, and one house must not colour a
 * hillside. A PARCEL has no floor — it is one building's ground, painted from
 * what was filed there, exactly as the building is below 600 m.
 *
 * WHOLLY INSIDE, because a square astride two sections is given to the one
 * under its centre, and that is where the grid can paint a section nobody
 * lives in. Measured on 2026-09-22 against the rows placed point by point,
 * over one 0.01° tile of Lyon 1er–2e: 40 % of the diagnostics sit in squares
 * astride a boundary and 5.6 % end up in a neighbouring section; two sections
 * holding NO diagnostic received 3 and 89 (a square, a quay), and were painted
 * D. Counting only whole squares toward the floor turns both neutral, and
 * every section still painted wears the same letter as the exact placement
 * (14 of 14). The price of it is one real section of 25 diagnostics, too small
 * to hold a whole square, drawn neutral.
 */
export const DPE_SECTION_MIN_GRADED = 3;

/**
 * Letters counted as *passoires thermiques* — F and G, the cut with a legal
 * consequence attached, which the key reports beside the scale.
 */
export const DPE_POOR_LABELS = Object.freeze(['F', 'G']);

/**
 * Share of F and G across the WHOLE register — **9.75 %**, 967 510 F and
 * 549 691 G out of 15 557 428 labelled diagnostics, measured against
 * `values_agg` on 2026-09-14. A property of the register, not of the housing
 * stock: a rating is compulsory on a sale or a new let, so the register
 * over-represents what has changed hands recently.
 */
export const DPE_POOR_SHARE_NATIONAL = 9.75;
