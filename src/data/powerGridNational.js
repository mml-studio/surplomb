/**
 * @module powerGridNational
 *
 * The NATIONAL pack for the Power Grid layer: every high-voltage route and
 * substation OpenStreetMap has mapped in metropolitan France, built once
 * offline (`npm run power-grid:national`) and shipped as a static asset, so the
 * grid draws at a national camera the way the gas network does — in the time
 * it takes to download one file, with no Overpass call behind it.
 *
 * ── Why a pack, when the layer already loads per viewport ───────────────────
 *
 * The per-viewport path (`/api/power-grid`, `powerGridFeed.js`) asks Overpass
 * for a box of at most 0.8°, under a camera of at most 120 km. That is the only
 * shape a live query can take — measured 2026-09-19, the same query over all of
 * France took **4 min 01 s** and answered 90 MB of JSON — and it is also why
 * the layer drew NOTHING above 120 km and made the operator wait 4 to 21 s for
 * every box it had not seen before. The gas layer has neither problem because
 * ODRÉ publishes the whole network as one file. OpenStreetMap does not, so this
 * module makes one, once, and the layer ships it.
 *
 * ── What the pack is ────────────────────────────────────────────────────────
 *
 * The same projection the viewport path serves (`projectPowerGrid`), over the
 * whole country, with three cuts, each measured on the 2026-09-19 build:
 *
 * 1. **Switchyard internals are not lines.** 26 768 of the 40 730 mapped ways
 *    touching France are shorter than 150 m — median way length 61 m. They are
 *    the busbars and bays INSIDE substations, which OSM tags `power=line`, and
 *    at a national camera they are not even a pixel. Dropped by length
 *    (`POWER_GRID_NATIONAL_MIN_WAY_M`, the pylon rule's own threshold) and by
 *    tag (`line=busbar|bay`), which catches the few long ones.
 *
 * 2. **The geometry is simplified, and by how much is a stated number.**
 *    Douglas-Peucker at `POWER_GRID_NATIONAL_TOLERANCE_M` (50 m): no drawn
 *    vertex is more than 50 m off the mapped route. At the 120 km camera where
 *    the per-viewport path takes over, one CSS pixel is ~140 m of ground, so
 *    the simplification is invisible wherever the pack is the only thing drawn.
 *    What it removes is the in-line pylons of straight spans; the first and
 *    last vertex of every way are kept, so a way still meets its neighbour.
 *
 * 3. **France only, and a way crossing the border is kept whole.** A way is
 *    kept when any of its vertices falls in a French département, so an
 *    interconnector keeps its foreign half rather than stopping at a line no
 *    pylon stands on — and a Belgian 380 kV corridor ten kilometres away is
 *    not drawn as if it were French infrastructure.
 *
 * Every stroke keeps its OSM way id. That is what lets the layer hand over to
 * the per-viewport path without drawing a route twice: the ways a viewport
 * answer brings back are hidden in the national batch, one by one, and the rest
 * of the country stays on screen around them (see `powerGrid.js`).
 *
 * ── What it is NOT ──────────────────────────────────────────────────────────
 *
 * Not live, and it says so: the pack carries the Overpass base timestamp it was
 * built from, and the card and key read it. A transmission line is built over a
 * decade, so a pack a month old is the same map; a pack a year old should be
 * rebuilt, and `--check` says how old it is.
 *
 * Dependency-free and side-effect-free, like `powerGridFeed.js`: the build
 * script runs it in Node and the layer runs the client half in the browser.
 */

import {
  POWER_GRID_TIERS,
  POWER_GRID_VOLTAGE_PREFILTER,
  POWER_PYLON_MIN_WAY_M,
  powerGridRollup,
  projectPowerGrid,
  substationRoleLabel,
} from './powerGridFeed.js';

/** Bump when the pack's shape changes; the layer refuses a pack it cannot read. */
export const POWER_GRID_NATIONAL_VERSION = 1;

/**
 * Douglas-Peucker tolerance, in metres. See the module header, cut 2.
 *
 * Measured 2026-09-19 on the whole country, after the length cut: 50 m keeps
 * 61 615 segments, 100 m keeps 47 780 — and 50 m is the one whose error stays
 * under two pixels where the pack is drawn BEHIND a viewport answer, on a
 * tilted camera at 30 km looking at the horizon.
 */
export const POWER_GRID_NATIONAL_TOLERANCE_M = 50;

/** Shortest way the pack keeps, in metres. See the module header, cut 1. */
export const POWER_GRID_NATIONAL_MIN_WAY_M = POWER_PYLON_MIN_WAY_M;

/**
 * `line=*` values that mark a `power=line` way as the inside of a yard.
 *
 * OSM's own vocabulary for it (`line=busbar`, `line=bay`), and a stronger
 * statement than length: a 200 m busbar in a 400 kV yard is still a busbar.
 */
export const POWER_GRID_YARD_LINE_VALUES = Object.freeze(new Set(['busbar', 'bay']));

/**
 * Metropolitan France and Corsica, with a little sea. The build asks Overpass
 * for tiles inside this box; the layer draws the pack when the camera's view
 * touches it.
 */
export const POWER_GRID_NATIONAL_BBOX = Object.freeze({
  south: 41.3,
  west: -5.3,
  north: 51.15,
  east: 9.65,
});

/**
 * Tile edge for the build, in degrees.
 *
 * One query for the whole country took four minutes and would lose everything
 * to a single 504; a 2° tile is a few seconds and is cached on its own, so a
 * failed tile is retried alone and a rebuild resumes where it stopped.
 */
export const POWER_GRID_NATIONAL_TILE_DEG = 2;

/** Overpass `[timeout:]` for one tile (seconds). */
export const POWER_GRID_NATIONAL_QUERY_TIMEOUT_SEC = 120;
/**
 * Overpass `[maxsize:]` for one tile, in bytes (256 MiB).
 *
 * Deliberately UNDER the server's 512 MiB default rather than over it:
 * Overpass admits a query against the memory it declares, and a busy
 * FOSSGIS answered a 1 GiB declaration with 504 on every tile of the
 * 2026-09-19 build while the national query that preceded it had got
 * through. A 2° tile of French grid is a few MB of answer.
 */
export const POWER_GRID_NATIONAL_QUERY_MAXSIZE = 256 * 1024 * 1024;

/** Metres per degree of latitude (WGS84 mean). */
const M_PER_DEG_LAT = 110_574;
/** Metres per degree of longitude at the equator. */
const M_PER_DEG_LON_EQ = 111_320;

/**
 * The build tiles: the `tileDeg` grid over the national box, keeping only the
 * cells that touch a département's bounding box — the Bay of Biscay and the
 * Ligurian Sea cost nothing to skip.
 *
 * @param {Array<Array<number>>} departementBboxes `[west, south, east, north]` each.
 * @param {number} [tileDeg]
 * @returns {Array<{south:number, west:number, north:number, east:number, key:string}>}
 */
export function powerGridNationalTiles(departementBboxes, tileDeg = POWER_GRID_NATIONAL_TILE_DEG) {
  const box = POWER_GRID_NATIONAL_BBOX;
  const tiles = [];
  const row0 = Math.floor(box.south / tileDeg);
  const row1 = Math.floor(box.north / tileDeg);
  const col0 = Math.floor(box.west / tileDeg);
  const col1 = Math.floor(box.east / tileDeg);
  for (let row = row0; row <= row1; row += 1) {
    for (let col = col0; col <= col1; col += 1) {
      const tile = {
        south: row * tileDeg,
        west: col * tileDeg,
        north: (row + 1) * tileDeg,
        east: (col + 1) * tileDeg,
      };
      const touches = (departementBboxes || []).some(([west, south, east, north]) => (
        east >= tile.west && west <= tile.east && north >= tile.south && south <= tile.north
      ));
      if (!touches) continue;
      tiles.push({ ...tile, key: `${tile.south}_${tile.west}` });
    }
  }
  return tiles;
}

/**
 * Overpass QL for one build tile.
 *
 * The per-viewport query's classes and voltage prefilter, with two
 * differences that are the point: NO output caps (a cap is a hole in a map
 * that is supposed to be the whole country), and no pylons (the pack draws
 * routes; the pylons are the per-viewport path's, at the zoom they read at).
 * `out geom` returns the WHOLE geometry of a way that crosses the tile edge,
 * so a way is never cut at a tile boundary — the build dedupes it by id.
 *
 * @param {{south:number, west:number, north:number, east:number}} box
 * @param {{timeoutSec?: number}} [options]
 * @returns {string}
 */
export function powerGridNationalTileQuery(box, { timeoutSec = POWER_GRID_NATIONAL_QUERY_TIMEOUT_SEC } = {}) {
  const bbox = [box.south, box.west, box.north, box.east]
    .map((value) => Number(value).toFixed(6))
    .join(',');
  const voltage = `["voltage"~"${POWER_GRID_VOLTAGE_PREFILTER}"]`;
  return `[out:json][timeout:${Math.max(30, Math.floor(timeoutSec))}][maxsize:${POWER_GRID_NATIONAL_QUERY_MAXSIZE}];`
    + `way["power"~"^(line|cable)$"]${voltage}(${bbox})->.s;`
    + `way["power"="substation"]${voltage}(${bbox})->.pw;`
    + `node["power"="substation"]${voltage}(${bbox})->.pn;`
    + `relation["power"="substation"]${voltage}(${bbox})->.pr;`
    + '.s out geom;.pw out center tags;.pn out tags;.pr out center tags;';
}

/**
 * Whether a raw `power=line` element is the inside of a yard by its own tags.
 * @param {Record<string,string>|undefined} tags
 * @returns {boolean}
 */
export function isYardInternalLine(tags) {
  const line = String(tags?.line ?? '').trim().toLowerCase();
  return POWER_GRID_YARD_LINE_VALUES.has(line);
}

/**
 * Union of several Overpass element lists, each element once.
 *
 * Tiles overlap by construction — a way crossing a tile edge comes back from
 * both, with its whole geometry each time — so identity is `type` + `id`, and
 * the first copy wins (the copies are the same element at the same base).
 *
 * @param {Array<Array<object>>} lists
 * @returns {Array<object>}
 */
export function mergeOverpassElements(lists) {
  const seen = new Set();
  const merged = [];
  for (const list of lists || []) {
    for (const element of Array.isArray(list) ? list : []) {
      const key = `${element?.type}/${element?.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(element);
    }
  }
  return merged;
}

/**
 * Douglas-Peucker over a flat `[lon, lat, …]` stroke, tolerance in metres.
 *
 * Projected to a local equirectangular plane at the stroke's first latitude —
 * exact enough over the length of one mapped way, which is kilometres, not a
 * continent. Iterative, so a 5 000-vertex cable cannot blow the stack. The
 * first and last vertex are always kept: they are where a way meets the next
 * one, and moving either would open a gap in the route.
 *
 * @param {Array<number>} coords
 * @param {number} toleranceM
 * @returns {Array<number>} A new flat array; the input is untouched.
 */
export function simplifyStrokeCoords(coords, toleranceM = POWER_GRID_NATIONAL_TOLERANCE_M) {
  if (!Array.isArray(coords)) return [];
  const count = Math.floor(coords.length / 2);
  if (count <= 2 || !(toleranceM > 0)) return coords.slice(0, count * 2);
  const kx = M_PER_DEG_LON_EQ * Math.cos((coords[1] * Math.PI) / 180);
  const ky = M_PER_DEG_LAT;
  const keep = new Uint8Array(count);
  keep[0] = 1;
  keep[count - 1] = 1;
  const tolerance2 = toleranceM * toleranceM;
  const stack = [0, count - 1];
  while (stack.length) {
    const last = stack.pop();
    const first = stack.pop();
    const ax = coords[first * 2] * kx;
    const ay = coords[first * 2 + 1] * ky;
    const vx = coords[last * 2] * kx - ax;
    const vy = coords[last * 2 + 1] * ky - ay;
    const length2 = vx * vx + vy * vy;
    let worst = -1;
    let worstIndex = -1;
    for (let i = first + 1; i < last; i += 1) {
      const px = coords[i * 2] * kx - ax;
      const py = coords[i * 2 + 1] * ky - ay;
      const t = length2 > 0 ? Math.max(0, Math.min(1, (px * vx + py * vy) / length2)) : 0;
      const dx = px - vx * t;
      const dy = py - vy * t;
      const distance2 = dx * dx + dy * dy;
      if (distance2 > worst) {
        worst = distance2;
        worstIndex = i;
      }
    }
    if (worst > tolerance2) {
      keep[worstIndex] = 1;
      stack.push(first, worstIndex, worstIndex, last);
    }
  }
  const out = [];
  for (let i = 0; i < count; i += 1) {
    if (keep[i]) out.push(coords[i * 2], coords[i * 2 + 1]);
  }
  return out;
}

/** Caps high enough that nothing is ever reported saturated in a whole-country build. */
const UNCAPPED = Object.freeze({
  strokes: Number.MAX_SAFE_INTEGER,
  substationWays: Number.MAX_SAFE_INTEGER,
  substationNodes: Number.MAX_SAFE_INTEGER,
  substationRelations: Number.MAX_SAFE_INTEGER,
  towers: Number.MAX_SAFE_INTEGER,
});

/**
 * Build the national pack from raw Overpass elements.
 *
 * @param {Array<object>} elements Raw Overpass elements (already merged).
 * @param {object} options
 * @param {(lat:number, lon:number) => boolean} options.inFrance Membership test.
 * @param {number} [options.toleranceM]
 * @param {number} [options.minWayM]
 * @param {string} [options.builtAt] ISO build time.
 * @param {?string} [options.osmBase] Overpass `timestamp_osm_base` of the data.
 * @returns {object} The pack document.
 */
export function buildPowerGridNationalPack(elements, {
  inFrance,
  toleranceM = POWER_GRID_NATIONAL_TOLERANCE_M,
  minWayM = POWER_GRID_NATIONAL_MIN_WAY_M,
  builtAt = new Date().toISOString(),
  osmBase = null,
} = {}) {
  if (typeof inFrance !== 'function') throw new Error('buildPowerGridNationalPack needs an inFrance(lat, lon) test');
  let yardInternal = 0;
  const kept = [];
  for (const element of Array.isArray(elements) ? elements : []) {
    if (element?.type === 'way' && isYardInternalLine(element.tags)) {
      yardInternal += 1;
      continue;
    }
    kept.push(element);
  }
  const projected = projectPowerGrid({ elements: kept }, { caps: UNCAPPED, towersRequested: false });

  // Re-interned from scratch: the projection's dictionaries also hold every
  // foreign and every dropped way's strings, and the pack should carry none.
  const dictionary = () => {
    const values = [];
    const index = new Map();
    return {
      values,
      intern(value) {
        if (value === null || value === undefined) return -1;
        let at = index.get(value);
        if (at === undefined) {
          at = values.push(value) - 1;
          index.set(value, at);
        }
        return at;
      },
    };
  };
  const operators = dictionary();
  const routes = dictionary();
  const voltages = dictionary();
  const voltageOf = (vi) => projected.voltages[vi];
  const reVoltage = (vi) => {
    const entry = voltageOf(vi);
    return entry ? voltages.intern(entry.raw) : -1;
  };

  const strokes = [];
  let droppedShort = 0;
  let droppedForeign = 0;
  let publishedVertices = 0;
  let vertices = 0;
  for (const stroke of projected.strokes) {
    if (!(stroke.km * 1000 >= minWayM)) { droppedShort += 1; continue; }
    let french = false;
    for (let i = 0; i < stroke.c.length; i += 2) {
      if (inFrance(stroke.c[i + 1], stroke.c[i])) { french = true; break; }
    }
    if (!french) { droppedForeign += 1; continue; }
    const c = simplifyStrokeCoords(stroke.c, toleranceM);
    publishedVertices += stroke.c.length / 2;
    vertices += c.length / 2;
    const out = { id: stroke.id, c, vi: reVoltage(stroke.vi), km: stroke.km };
    const operator = stroke.o >= 0 ? operators.intern(projected.operators[stroke.o]) : -1;
    const route = stroke.n >= 0 ? routes.intern(projected.routes[stroke.n]) : -1;
    // Absent is ABSENT rather than -1 here: 14 000 strokes × three sentinel
    // fields is 150 KB of `"o":-1` in a file the layer downloads.
    if (operator >= 0) out.o = operator;
    if (route >= 0) out.n = route;
    if (stroke.u) out.u = 1;
    if (Number.isFinite(stroke.circuits)) out.circuits = stroke.circuits;
    strokes.push(out);
  }

  const substations = [];
  let droppedForeignSubstations = 0;
  for (const substation of projected.substations) {
    if (!inFrance(substation.lat, substation.lon)) { droppedForeignSubstations += 1; continue; }
    const out = { id: substation.id, lat: substation.lat, lon: substation.lon, vi: reVoltage(substation.vi) };
    const operator = substation.o >= 0 ? operators.intern(projected.operators[substation.o]) : -1;
    if (operator >= 0) out.o = operator;
    if (substation.name) out.name = substation.name;
    if (substation.ref) out.ref = substation.ref;
    if (substation.role) out.role = substation.role;
    substations.push(out);
  }

  const voltageValues = voltages.values.map((raw) => {
    const source = projected.voltages.find((entry) => entry.raw === raw);
    return { raw, v: source?.v ?? null, all: source?.all ?? [], tier: source?.tier ?? null };
  });
  const { tiers, stats } = powerGridRollup(strokes, substations, voltageValues);

  return {
    version: POWER_GRID_NATIONAL_VERSION,
    coverage: 'France métropolitaine et Corse',
    source: 'OpenStreetMap contributors (ODbL 1.0), via Overpass',
    builtAt,
    osmBase,
    toleranceM,
    minWayM,
    bbox: { ...POWER_GRID_NATIONAL_BBOX },
    operators: operators.values,
    routes: routes.values,
    voltages: voltageValues,
    tiers,
    stats: {
      ...stats,
      routes: routes.values.length,
      vertices,
      publishedVertices,
      dropped: {
        yardInternal,
        short: droppedShort,
        foreign: droppedForeign,
        foreignSubstations: droppedForeignSubstations,
      },
    },
    strokes,
    substations,
  };
}

// ---------------------------------------------------------------------------
// Client half — what the layer draws at which altitude
// ---------------------------------------------------------------------------

const ALL_TIER_IDS = Object.freeze(POWER_GRID_TIERS.map((tier) => tier.id));

/**
 * Camera altitude above which only the ≥ 180 kV network is drawn, in metres.
 *
 * At 600 km the whole of France is about 900 CSS pixels across, and the
 * 50 000 km of 63/90 kV route becomes a grey felt over the country that hides
 * the thing a national view is FOR: the 400/225 kV backbone RTE's own national
 * map shows, and nothing else. Below it the regional mesh comes in.
 */
export const POWER_GRID_NATIONAL_BACKBONE_ALTITUDE_M = 600_000;

/** Stroke widths the pack is drawn at, per band, in pixels — slimmer than a viewport answer's. */
export const POWER_GRID_NATIONAL_WIDTH_PX = Object.freeze({
  ehv: 3.2,
  'hv-high': 2.4,
  'hv-mid': 2,
  'hv-low': 1.6,
});
/**
 * What each band IS, for the key the pack shows — in French, like the rest of
 * that key, and naming France's own nominal voltages rather than the generic
 * thresholds the viewport key has to use abroad.
 */
export const POWER_GRID_NATIONAL_TIER_BLURBS = Object.freeze({
  ehv: 'La colonne vertébrale : le 400 kV sur lequel RTE fait tourner le pays',
  'hv-high': 'Le transport régional : le 225 kV',
  'hv-mid': 'Le 150 kV, un étage presque absent en France',
  'hv-low': 'Le dernier étage avant la distribution : le 63 et le 90 kV',
});
/** Extra casing width under a national stroke, in pixels. */
export const POWER_GRID_NATIONAL_CASING_PX = 2;
/**
 * How much smaller a yard dot is drawn from space than at a regional camera.
 * At 2 500 km the 239 dots of the 400 kV yards at full size sat ON the lines
 * they terminate and read as a rash over the backbone; at 60 % they read as
 * the nodes of it.
 */
export const POWER_GRID_NATIONAL_POINT_SCALE_FROM_SPACE = 0.6;
/** Substation dot size in the pack, per band, in pixels. */
export const POWER_GRID_NATIONAL_POINT_PX = Object.freeze({
  ehv: 7,
  'hv-high': 5,
  'hv-mid': 4,
  'hv-low': 4,
});

/**
 * What the pack draws at one camera altitude.
 *
 * Three bands, and the lowest is the handover: under `localCeilingM` the
 * per-viewport path owns the view, the pack keeps every route it did NOT bring
 * back, and its substation dots stand down — the viewport answer has the
 * yards, named and clickable, and two dots per yard is one too many.
 *
 * @param {number} altitudeM
 * @param {number} localCeilingM The per-viewport path's own altitude ceiling.
 * @returns {{id:string, strokeTiers:Array<string>, substationTiers:Array<string>}}
 */
export function powerGridNationalBand(altitudeM, localCeilingM) {
  if (Number.isFinite(altitudeM) && altitudeM > POWER_GRID_NATIONAL_BACKBONE_ALTITUDE_M) {
    return { id: 'national', strokeTiers: ['ehv', 'hv-high'], substationTiers: ['ehv'] };
  }
  if (Number.isFinite(altitudeM) && altitudeM > localCeilingM) {
    return { id: 'regional', strokeTiers: [...ALL_TIER_IDS], substationTiers: ['ehv', 'hv-high'] };
  }
  return { id: 'local', strokeTiers: [...ALL_TIER_IDS], substationTiers: [] };
}

/**
 * Validate a fetched pack and fill in what the file leaves implicit.
 *
 * The file omits `o`, `n` and `u` when absent to stay small; everything
 * downstream of it — the card, the batch builder — reads the viewport
 * document's convention, where absence is `-1` and a flag is `0`. Hydrating
 * here means one document shape everywhere after this line.
 *
 * @param {*} pack
 * @returns {object} The same object, hydrated.
 * @throws {Error} When the pack is not one this build can read.
 */
export function hydratePowerGridNationalPack(pack) {
  if (!pack || pack.version !== POWER_GRID_NATIONAL_VERSION) {
    throw new Error(`power-grid national pack version ${pack?.version ?? 'missing'} (expected ${POWER_GRID_NATIONAL_VERSION})`);
  }
  if (!Array.isArray(pack.strokes) || !Array.isArray(pack.substations) || !Array.isArray(pack.voltages)) {
    throw new Error('malformed power-grid national pack');
  }
  for (const stroke of pack.strokes) {
    if (!Number.isInteger(stroke.o)) stroke.o = -1;
    if (!Number.isInteger(stroke.n)) stroke.n = -1;
    stroke.u = stroke.u ? 1 : 0;
    if (!Number.isFinite(stroke.circuits)) stroke.circuits = null;
  }
  for (const substation of pack.substations) {
    if (!Number.isInteger(substation.o)) substation.o = -1;
    substation.role = substation.role || null;
    substation.roleLabel = substationRoleLabel(substation.role);
    substation.name = substation.name || null;
    substation.ref = substation.ref || null;
  }
  return pack;
}

/**
 * The OSM way ids a viewport answer draws itself — the ones the pack must
 * stand down for, so no route is on screen twice.
 * @param {?object} payload `/api/power-grid` document.
 * @returns {Set<string>}
 */
export function powerGridStrokeIds(payload) {
  const ids = new Set();
  for (const stroke of Array.isArray(payload?.strokes) ? payload.strokes : []) {
    if (stroke?.id) ids.add(String(stroke.id));
  }
  return ids;
}

/**
 * How old the pack's data is, in whole days, from the Overpass base it was
 * built on (falling back to the build time).
 * @param {?object} pack
 * @param {number} [now]
 * @returns {?number}
 */
export function powerGridNationalAgeDays(pack, now = Date.now()) {
  const stamp = Date.parse(pack?.osmBase || pack?.builtAt || '');
  if (!Number.isFinite(stamp)) return null;
  return Math.max(0, Math.floor((now - stamp) / 86_400_000));
}
