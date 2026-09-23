/**
 * @module placeOutline
 *
 * The outline a place search draws around what it found, when what it found
 * is an area: a commune, a département, a région (2026-09-23).
 *
 * WHY. The owner asked for the search to behave like Google Maps: a pin on a
 * precise place, and the limits of the place when the answer is a town or a
 * region. The camera already framed the area; nothing on the ground said where
 * it stopped.
 *
 * WHERE EACH OUTLINE COMES FROM, in France — all three Licence Ouverte:
 *
 *   - a COMMUNE from `geo.api.gouv.fr/communes?lat=&lon=` with its contour,
 *     the commune that CONTAINS the geocoded point, so the answer does not
 *     depend on how the geocoder spelled the name. Decimated by
 *     `communeContours.js`, like every other commune in the app;
 *   - a DÉPARTEMENT from the bundled IGN outlines
 *     (`local_data/france_departements/departements.geojson`), the département
 *     containing the point;
 *   - a RÉGION as the union of its départements (`polygonDissolve.js`: the
 *     bundled file is a planar subdivision, so the union is exact), grouped by
 *     the mapping in `local_data/france_territoires/territoires.json`.
 *
 * A point outside every bundled département is not in metropolitan France:
 * the answer is `null` and the client falls back to OpenStreetMap boundaries
 * (src/annotations/annotationResolver.js). Nothing here guesses.
 *
 * Dependency-free (no Cesium, no DOM), so it runs in the Vite server and under
 * `node --test`.
 */

import { locateDepartement, nearestDepartementWithin } from './data/franceDepartements.js';
import { dissolveRings, geometryRings, ringArea } from './data/polygonDissolve.js';
import { GEO_API_ROOT, projectSingleCommuneContour } from './data/communeContours.js';

/** The levels this module can outline. */
export const PLACE_OUTLINE_LEVELS = Object.freeze(['municipality', 'department', 'region']);

/**
 * Vertices kept per commune ring. The shared commune decimation keeps 64 for
 * a national choropleth; one outline under a camera framed on that commune is
 * read at a few hundred pixels, where 64 visibly cuts corners, and one commune
 * of 256 vertices is a few kilobytes.
 */
export const OUTLINE_COMMUNE_MAX_VERTICES = 256;
/** Coordinate precision of a commune outline: 5 dp is ~1 m. */
export const OUTLINE_COMMUNE_DECIMALS = 5;
/** Separate pieces of one commune kept (Biarritz has rocks offshore). */
export const OUTLINE_COMMUNE_MAX_PARTS = 3;
/**
 * A ring under this many square degrees is dropped from a région or a
 * département outline: the Îles d'Hyères or Yeu at région scale are specks
 * the ground polyline would draw as a blob.
 */
export const OUTLINE_MIN_RING_AREA_DEG2 = 0.002;
/** Coastal snap for a point that fell a little outside the simplified outlines. */
export const OUTLINE_COAST_SNAP_KM = 2;

/**
 * The outline level a geocode's Google-shaped `types` ask for, or null for a
 * precise place (which gets a pin instead).
 *
 * Google tags a French région `administrative_area_level_1` and a département
 * `administrative_area_level_2`; `/api/geocode` maps OpenStreetMap's
 * `state`/`region` and `county` onto the same two (vite.config.js).
 *
 * @param {ReadonlyArray<string>|null|undefined} types
 * @returns {'country'|'region'|'department'|'municipality'|null}
 */
export function placeOutlineLevelForTypes(types) {
  const values = new Set((Array.isArray(types) ? types : []).map((type) => String(type).toLowerCase()));
  if (values.has('country')) return 'country';
  if (values.has('administrative_area_level_1')) return 'region';
  if (values.has('administrative_area_level_2')) return 'department';
  if (values.has('locality') || values.has('postal_town') || values.has('administrative_area_level_3')) {
    return 'municipality';
  }
  return null;
}

/**
 * Read `level`, `lat` and `lon` off a request, or say what is wrong.
 * @param {URLSearchParams} params
 * @returns {{level: string, lat: number, lon: number}|{error: string}}
 */
export function parsePlaceOutlineRequest(params) {
  const level = String(params?.get?.('level') || '');
  if (!PLACE_OUTLINE_LEVELS.includes(level)) return { error: `level must be one of ${PLACE_OUTLINE_LEVELS.join(', ')}` };
  const lat = Number(params.get('lat'));
  const lon = Number(params.get('lon'));
  if (params.get('lat') === null || params.get('lon') === null
    || !Number.isFinite(lat) || !Number.isFinite(lon)
    || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return { error: 'lat and lon must be coordinates in degrees' };
  }
  return { level, lat, lon };
}

/**
 * The cache key of a request. A commune is keyed on the point rounded to
 * ~100 m — two searches of the same town land on the same geocoded centre —
 * and a département or région on the code it resolves to (see the service).
 * @param {{level: string, lat: number, lon: number}} request
 * @returns {string}
 */
export function placeOutlinePointKey({ level, lat, lon }) {
  return `${level}|${lat.toFixed(3)},${lon.toFixed(3)}`;
}

/**
 * `geo.api.gouv.fr` for the commune containing a point, with its contour.
 * @param {number} lat
 * @param {number} lon
 * @returns {string}
 */
export function communeAtPointUrl(lat, lon) {
  return `${GEO_API_ROOT}/communes?lat=${Number(lat).toFixed(6)}&lon=${Number(lon).toFixed(6)}`
    + '&fields=code,nom&format=geojson&geometry=contour';
}

/** Close a ring given as `[lon, lat]` pairs (first point repeated last). */
function closedRing(points) {
  if (points.length < 3) return null;
  const first = points[0];
  const last = points[points.length - 1];
  return first[0] === last[0] && first[1] === last[1] ? points : [...points, first];
}

/** Flat `[lon, lat, …]` → closed `[[lon, lat], …]`. */
function pairsFromFlat(flat) {
  const pairs = [];
  for (let i = 0; i + 1 < flat.length; i += 2) pairs.push([flat[i], flat[i + 1]]);
  return closedRing(pairs);
}

/**
 * The outline of the first commune in a `geo.api.gouv.fr` reply.
 * @param {object} geojson FeatureCollection from {@link communeAtPointUrl}.
 * @returns {?{level: 'municipality', code: string, name: string, rings: Array, simplified: boolean}}
 */
export function communeOutlineFromReply(geojson) {
  const feature = Array.isArray(geojson?.features) ? geojson.features[0] : null;
  const commune = projectSingleCommuneContour(feature, {
    maxVertices: OUTLINE_COMMUNE_MAX_VERTICES,
    decimals: OUTLINE_COMMUNE_DECIMALS,
    maxParts: OUTLINE_COMMUNE_MAX_PARTS,
  });
  if (!commune) return null;
  const rings = commune.parts.map(pairsFromFlat).filter(Boolean);
  if (!rings.length) return null;
  return { level: 'municipality', code: commune.code, name: commune.name, rings, simplified: commune.simplified };
}

/** Rings large enough to draw, largest first; the largest is always kept. */
function drawableRings(rings) {
  const sorted = [...rings]
    .filter((ring) => Array.isArray(ring) && ring.length >= 4)
    .sort((a, b) => Math.abs(ringArea(b)) - Math.abs(ringArea(a)));
  return sorted.filter((ring, index) => index === 0 || Math.abs(ringArea(ring)) >= OUTLINE_MIN_RING_AREA_DEG2);
}

/**
 * The département code containing a point, snapping a coastal near-miss.
 * @param {{list: Array<object>}} index From `buildDepartementIndex`.
 * @param {number} lat
 * @param {number} lon
 * @returns {?string}
 */
export function departementCodeAt(index, lat, lon) {
  const inside = locateDepartement(index, lat, lon);
  if (inside) return inside;
  return nearestDepartementWithin(index, lat, lon, OUTLINE_COAST_SNAP_KM)?.code ?? null;
}

/**
 * The outline of one bundled département.
 * @param {{byCode: Map<string, object>}} index
 * @param {string} code
 * @returns {?{level: 'department', code: string, name: string, rings: Array, simplified: boolean}}
 */
export function departementOutline(index, code) {
  const entry = index?.byCode?.get(code);
  if (!entry) return null;
  // Outer rings only: the bundled file has no holes, and a hole would be one
  // more line on the ground the reader could not tell from a boundary.
  const rings = drawableRings(entry.parts.map((part) => part.rings[0]));
  if (!rings.length) return null;
  return { level: 'department', code, name: entry.name, rings, simplified: true };
}

/**
 * The outline of a région: the union of its bundled départements.
 * @param {{byCode: Map<string, object>}} index
 * @param {{departements: Array<{code: string, region?: string}>, regions: Array<{code: string, nom: string}>}} territoires
 * @param {string} departementCode Any département of the région.
 * @returns {?{level: 'region', code: string, name: string, rings: Array, simplified: boolean}}
 */
export function regionOutline(index, territoires, departementCode) {
  const departements = Array.isArray(territoires?.departements) ? territoires.departements : [];
  const region = departements.find((entry) => entry?.code === departementCode)?.region;
  if (!region) return null;
  const members = departements.filter((entry) => entry?.region === region).map((entry) => entry.code);
  const rings = [];
  for (const code of members) {
    for (const part of index?.byCode?.get(code)?.parts || []) rings.push(part.rings[0]);
  }
  const dissolved = drawableRings(dissolveRings(rings));
  if (!dissolved.length) return null;
  const name = (territoires.regions || []).find((entry) => entry?.code === region)?.nom || region;
  return { level: 'region', code: region, name, rings: dissolved, simplified: true };
}

/**
 * The outline service behind `/api/place-outline`: resolves a request, and
 * keeps what it resolved. Every dependency is injected, so the whole thing is
 * tested without a network or a disk.
 *
 * @param {object} deps
 * @param {() => Promise<{byCode: Map, list: Array}>} deps.loadDepartementIndex
 * @param {() => Promise<object>} deps.loadTerritoires
 * @param {(url: string) => Promise<object>} deps.fetchJson Resolves the parsed
 *   reply, or throws on a network or HTTP failure.
 * @param {number} [deps.maxEntries]
 * @returns {{resolve: (request: {level: string, lat: number, lon: number}) => Promise<object|null>}}
 */
export function createPlaceOutlineService({ loadDepartementIndex, loadTerritoires, fetchJson, maxEntries = 200 }) {
  /** Outlines by `level|code` — a département or région is resolved once. */
  const byCode = new Map();
  /** Commune outlines (or a definitive miss, `null`) by rounded point. */
  const byPoint = new Map();
  const remember = (map, key, value) => {
    map.set(key, value);
    if (map.size > maxEntries) map.delete(map.keys().next().value);
    return value;
  };

  async function resolve(request) {
    const { level, lat, lon } = request;
    if (level === 'municipality') {
      const key = placeOutlinePointKey(request);
      if (byPoint.has(key)) return byPoint.get(key);
      const reply = await fetchJson(communeAtPointUrl(lat, lon));
      // An empty reply is definitive: the point is in no French commune.
      return remember(byPoint, key, communeOutlineFromReply(reply));
    }
    const index = await loadDepartementIndex();
    const departement = departementCodeAt(index, lat, lon);
    if (!departement) return null;
    if (level === 'department') {
      const key = `department|${departement}`;
      if (byCode.has(key)) return byCode.get(key);
      return remember(byCode, key, departementOutline(index, departement));
    }
    const territoires = await loadTerritoires();
    const region = (territoires?.departements || []).find((entry) => entry?.code === departement)?.region;
    const key = `region|${region}`;
    if (region && byCode.has(key)) return byCode.get(key);
    const outline = regionOutline(index, territoires, departement);
    return region ? remember(byCode, key, outline) : outline;
  }

  return { resolve };
}
