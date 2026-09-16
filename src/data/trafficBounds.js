/**
 * @file Pure geometry helpers for the traffic layer's viewport fetch bounds.
 *
 * C4 fix (2026-07-16): `camera.computeViewRectangle()` spans toward the horizon
 * at oblique pitch, and centering the fetch box on the RECTANGLE MIDPOINT put
 * road fetches tens of km from what the user is actually looking at. The fetch
 * center is now derived from the camera's look-at ground point
 * (`camera.pickEllipsoid` at canvas center — the globe is hidden under Google
 * 3D tiles, so `scene.globe.pick` is not reliable), falling back to the camera
 * nadir, and pulled back toward nadir when the look-at point is beyond a
 * horizon-gaze cap. Kept Cesium-free so it can be unit-tested with node:test.
 *
 * @module data/trafficBounds
 */

/** @const {number} Mean Earth radius in km (spherical approximation). */
const EARTH_RADIUS_KM = 6371;

/** Drivable classes fetched at street scale — the whole graph. */
const LOCAL_CLASSES = Object.freeze([
  'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified',
]);
/** The first pass at street scale: enough to paint motion while the rest loads. */
const MAJOR_CLASSES = Object.freeze(['motorway', 'trunk', 'primary', 'secondary']);
/** Metro scale: the arterials, which are the only roads legible from 20 km up. */
const ARTERIAL_CLASSES = Object.freeze(['motorway', 'trunk', 'primary']);

/**
 * Altitude bands the road layer fetches at, coarsest last.
 *
 * WHY THERE IS A SECOND BAND AT ALL. Until now the layer switched off above
 * 8 km and its fetch box was capped at 0.05° (~5.5 km) at every altitude. Both
 * limits together meant the animated-road view and the live-transit view could
 * never be the same view: Bordeaux Métropole is 23 × 26 km, so at the altitude
 * where cars moved you saw 252 of its 460 live transit vehicles, and at the
 * altitude that showed all 460 the cars were gone. A scene combining them did
 * not exist at any camera position.
 *
 * WHY THE COARSE BAND IS AFFORDABLE. Measured against Overpass over Bordeaux
 * on 2026-08-31, a 0.30° arterial-only query returns 1 929 ways / 14 105 nodes
 * / 1.8 MB — FEWER ways and nodes than the 0.05° full-graph query the street
 * band already runs (3 701 ways / 25 623 nodes / 3.2 MB). Widening the box by
 * 36× in area costs less than the detail it drops.
 *
 * `minShiftKm` scales with the band for the same reason the box does: 350 m of
 * pan is a new neighbourhood at street scale and a rounding error at 25 km.
 *
 * `flowZoom` is the TomTom flow-tile zoom the band asks for, and it exists
 * because the box span does. A 0.05° box is 2 tiles at z12; the SAME z12 over
 * the metro band's 0.30° box is 30 — thirty requests, against an edge rule
 * that allows 30 per ten seconds for the whole page, to colour arterials that
 * are a few pixels wide at 20 km up. z10 covers that box in 4.
 *
 * `snapDeg` is the lattice the box is finally put on, and it is the only field
 * here that exists for the CACHE rather than for the picture. See
 * {@link normalizeFetchBox}: without it the box carries the camera pose and
 * the reader's window size into the Overpass query, so no two readers and no
 * two moments ever ask the same question, and a proxy cache that answers a
 * repeat in 65 ms never gets a repeat to answer.
 *
 * A tenth of the band's span, and it is sized against the WORST-CASE INWARD
 * MOVE of the box's near edge, because the step bounds two errors at once: the
 * centre can move half a step, and the span can round down by half a step
 * (a quarter of a step per side). At street scale that is 278 + 139 = **417 m**
 * out of a ~1 500 m half-box. A coarser 0.01° step doubles it to 694 m, which
 * is 45 % of the radius the reader is guaranteed around the point they are
 * looking at — and the symptom of getting that wrong is "there is no traffic
 * at the edge of the screen", which nobody would ever trace back to a cache
 * key. It is also comfortably above `minShiftKm`, so a pan the refetch gate
 * would have honoured now costs nothing at all when it stays inside a cell.
 */
export const ROAD_FETCH_TIERS = Object.freeze([
  Object.freeze({
    id: 'street',
    maxAltitudeM: 4500,
    spanDeg: 0.05,
    pullKm: 12,
    minShiftKm: 0.35,
    snapDeg: 0.005,
    flowZoom: 12,
    ribbonMinClass: 0,
    classes: MAJOR_CLASSES,
    fullClasses: LOCAL_CLASSES,
  }),
  Object.freeze({
    id: 'district',
    maxAltitudeM: 8000,
    spanDeg: 0.05,
    pullKm: 12,
    minShiftKm: 0.35,
    snapDeg: 0.005,
    flowZoom: 12,
    ribbonMinClass: 0,
    classes: MAJOR_CLASSES,
    fullClasses: null,
  }),
  Object.freeze({
    id: 'metro',
    maxAltitudeM: 30000,
    spanDeg: 0.30,
    pullKm: 45,
    minShiftKm: 3,
    snapDeg: 0.025,
    flowZoom: 10,
    ribbonMinClass: 4,
    classes: ARTERIAL_CLASSES,
    fullClasses: null,
  }),
]);

/** Altitude (m) above which no road band applies and the layer clears. */
export const ROAD_ACTIVATION_ALTITUDE_M = ROAD_FETCH_TIERS[ROAD_FETCH_TIERS.length - 1].maxAltitudeM;

/**
 * The road-fetch band for a camera altitude.
 *
 * @param {number} altitudeM Camera altitude in metres.
 * @returns {?Object} The band, or null above the coarsest one — which is the
 *   layer's "clear everything" signal, not a band with nothing in it.
 */
export function roadFetchTier(altitudeM) {
  if (!Number.isFinite(altitudeM) || altitudeM < 0) return null;
  for (const tier of ROAD_FETCH_TIERS) {
    if (altitudeM <= tier.maxAltitudeM) return tier;
  }
  return null;
}

const toRad = (deg) => (deg * Math.PI) / 180;
const toDeg = (rad) => (rad * 180) / Math.PI;

/**
 * Great-circle distance between two lat/lon points (haversine).
 *
 * @param {number} lat1 - First point latitude (degrees).
 * @param {number} lon1 - First point longitude (degrees).
 * @param {number} lat2 - Second point latitude (degrees).
 * @param {number} lon2 - Second point longitude (degrees).
 * @returns {number} Distance in kilometres.
 */
export function greatCircleKm(lat1, lon1, lat2, lon2) {
  const p1 = toRad(lat1);
  const p2 = toRad(lat2);
  const dp = toRad(lat2 - lat1);
  const dl = toRad(lon2 - lon1);
  const a = Math.sin(dp / 2) ** 2
    + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Initial bearing (radians) from point 1 toward point 2 along the great circle.
 *
 * @param {number} lat1 @param {number} lon1 @param {number} lat2 @param {number} lon2
 * @returns {number} Bearing in radians (0 = north, clockwise).
 */
function initialBearingRad(lat1, lon1, lat2, lon2) {
  const p1 = toRad(lat1);
  const p2 = toRad(lat2);
  const dl = toRad(lon2 - lon1);
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return Math.atan2(y, x);
}

/**
 * Destination point given a start, an initial bearing, and a distance
 * (spherical direct geodesic).
 *
 * @param {number} lat - Start latitude (degrees).
 * @param {number} lon - Start longitude (degrees).
 * @param {number} bearingRad - Initial bearing (radians, 0 = north).
 * @param {number} distKm - Distance to travel (km).
 * @returns {{lat:number, lon:number}} Destination in degrees.
 */
function destinationPoint(lat, lon, bearingRad, distKm) {
  const delta = distKm / EARTH_RADIUS_KM;
  const p1 = toRad(lat);
  const l1 = toRad(lon);
  const p2 = Math.asin(
    Math.sin(p1) * Math.cos(delta) + Math.cos(p1) * Math.sin(delta) * Math.cos(bearingRad)
  );
  const l2 = l1 + Math.atan2(
    Math.sin(bearingRad) * Math.sin(delta) * Math.cos(p1),
    Math.cos(delta) - Math.sin(p1) * Math.sin(p2)
  );
  // Normalize longitude to [-180, 180)
  const lonDeg = ((toDeg(l2) + 540) % 360) - 180;
  return { lat: toDeg(p2), lon: lonDeg };
}

/**
 * Derive the road-fetch center from the camera's look-at ground point.
 *
 * Rules:
 *  - No usable hit (pickEllipsoid returned undefined → non-finite hit coords):
 *    fall back to the camera nadir.
 *  - Hit within `maxPullKm` of nadir: use the hit verbatim (normal oblique view).
 *  - Hit farther than `maxPullKm` (horizon gaze): pull it back toward nadir to
 *    exactly `maxPullKm` along the nadir→hit great-circle bearing. The cap is
 *    per-band (see {@link ROAD_FETCH_TIERS}): 12 km at street scale, where a
 *    farther look-at point is horizon-gazing, and 45 km at metro scale, where
 *    it is simply the far side of the city.
 *
 * @param {Object} args
 * @param {number} args.nadirLat - Camera nadir latitude (degrees).
 * @param {number} args.nadirLon - Camera nadir longitude (degrees).
 * @param {number} [args.hitLat] - pickEllipsoid ground-hit latitude (degrees), if any.
 * @param {number} [args.hitLon] - pickEllipsoid ground-hit longitude (degrees), if any.
 * @param {number} [args.maxPullKm=12] - Max great-circle distance from nadir.
 * @returns {{lat:number, lon:number, source:'hit'|'nadir'|'pulled'}}
 *   The fetch center and which rule produced it.
 */
export function deriveFetchCenter({ nadirLat, nadirLon, hitLat, hitLon, maxPullKm = 12 }) {
  if (!Number.isFinite(hitLat) || !Number.isFinite(hitLon)) {
    return { lat: nadirLat, lon: nadirLon, source: 'nadir' };
  }
  const distKm = greatCircleKm(nadirLat, nadirLon, hitLat, hitLon);
  if (distKm <= maxPullKm) {
    return { lat: hitLat, lon: hitLon, source: 'hit' };
  }
  const bearing = initialBearingRad(nadirLat, nadirLon, hitLat, hitLon);
  const pulled = destinationPoint(nadirLat, nadirLon, bearing, maxPullKm);
  return { lat: pulled.lat, lon: pulled.lon, source: 'pulled' };
}

/**
 * Clamp a bounding box's spans to `maxSpanDeg` and recenter it on `center`.
 *
 * Preserves the pre-C4 span semantics (each axis capped at 0.05° ≈ 5.5 km)
 * but centers the box on the derived look-at point instead of the view
 * rectangle's midpoint. Idempotent when `center` is the box's own midpoint.
 *
 * @param {{south:number, west:number, north:number, east:number}} bounds
 *   Source bounds (span donor).
 * @param {{lat:number, lon:number}} center - Fetch center (degrees).
 * @param {number} [maxSpanDeg=0.05] - Max span per axis in degrees.
 * @returns {{south:number, west:number, north:number, east:number}} Clamped bounds.
 */
export function clampBoundsAroundCenter(bounds, center, maxSpanDeg = 0.05) {
  const latSpan = Math.min(bounds.north - bounds.south, maxSpanDeg);
  const lonSpan = Math.min(bounds.east - bounds.west, maxSpanDeg);
  return {
    south: center.lat - latSpan / 2,
    north: center.lat + latSpan / 2,
    west: center.lon - lonSpan / 2,
    east: center.lon + lonSpan / 2,
  };
}

/**
 * Put a fetch box on a repeatable footing: the band's full span, centred on a
 * lattice point.
 *
 * ── The cache this exists to make reachable ────────────────────────────────
 * The Overpass proxy caches a response under the QUERY BODY, and the query
 * body carries the box. Two things put a different number in it for every
 * reader, so the cache essentially never answered:
 *
 *   1. THE CENTRE. `clampBoundsAroundCenter` centres the box on the camera's
 *      look-at ground point — a different float for every camera pose that has
 *      ever existed.
 *   2. THE SPAN. That function keeps the VIEWPORT's span whenever it is
 *      smaller than the band's, so the reader's WINDOW SIZE is in the key:
 *      the same camera pose at 1440p and at 1080p asks two different
 *      questions.
 *
 * Measured 2026-09-16 against the hosted origin from the VPS: a cold road
 * fetch is **0.6 s to 46 s** (Paris arterials 17.8 s, Lyon 46.4 s, Marseille
 * 6.1 s, Bordeaux 2.7 s), and the same query repeated is **65 ms**. The whole
 * gap between those two numbers was unreachable, for everybody, always.
 *
 * ── What it costs, and why the span is a LADDER and not a constant ─────────
 * Snapping the centre costs up to half a lattice step of centring: at the
 * street band's 0.01° that is 555 m of a 2 750 m half-box, so the point being
 * looked at is never nearer than 2.2 km to an edge and the roads under it are
 * always inside.
 *
 * ── What it does ──────────────────────────────────────────────────────────
 * Both the centre and the span go to the NEAREST lattice point. Nearest, not
 * outward, and that is the whole design: rounding up is what makes this
 * expensive. Measured at the `qa-traffic-floor` view (Biarritz, 900 m, pitch
 * −35°, box 0.0304° × 0.0435°), rounding the span UP to the band's own span
 * lands on 0.05° × 0.05° — **1.9× the area, 421 roads became 1 003 and 1 843
 * dots became 3 774**. The seating grid grows with the road count, and at a
 * view where the 6 000-dot cap binds (Paris) the same dots spread over twice
 * the streets, so every street on screen is drawn half as busy: a visible
 * regression bought with a cache hit. Rounding to NEAREST at a 0.005° step
 * gives 0.030° × 0.045° instead — **+2 % of area**, inside the noise.
 *
 * Idempotent by construction: a centre and a span already on the lattice round
 * to themselves, which matters because `loadRoadsForBounds` re-normalises a
 * box `onCameraChanged` has already normalised.
 *
 * A pan smaller than the step produces the SAME box, which the layer's own
 * tile cache answers with no request at all — the refetch gate's `minShiftKm`
 * is 350 m at street scale, well under the step. And a warmer can now compute
 * the key a reader will ask for, which is what makes pre-warming possible.
 *
 * Coordinates are rounded to 5 decimals (~1.1 m) so the query string is stable
 * against floating-point drift: `48.835` and `48.83500000000001` are the same
 * box and must not be two cache entries.
 *
 * @param {{south:number, west:number, north:number, east:number}} box
 * @param {{spanDeg:number, snapDeg:number}} tier The band. With no `snapDeg`
 *   the box is returned untouched, so a caller that has no band keeps today's
 *   behaviour exactly.
 * @returns {{south:number, west:number, north:number, east:number}}
 */
export function normalizeFetchBox(box, tier) {
  const snapDeg = tier?.snapDeg;
  if (!Number.isFinite(snapDeg) || snapDeg <= 0) return box;
  const snapped = (v) => Math.round(v / snapDeg) * snapDeg;
  // A span is never rounded away to nothing: one step is the floor.
  const span = (v) => Math.max(snapDeg, snapped(v));
  const latSpan = span(box.north - box.south);
  const lonSpan = span(box.east - box.west);
  const lat = snapped((box.north + box.south) / 2);
  const lon = snapped((box.east + box.west) / 2);
  const r = (v) => Number(v.toFixed(5));
  return {
    south: r(lat - latSpan / 2),
    north: r(lat + latSpan / 2),
    west: r(lon - lonSpan / 2),
    east: r(lon + lonSpan / 2),
  };
}

/**
 * Flat-earth distance between two nearby points, in km.
 *
 * A degree of latitude is taken as 111 km and longitude is cosine-scaled. Over
 * the tens of kilometres this module compares, the error against a geodesic is
 * far below the thresholds it is compared to.
 *
 * @param {{lat:number, lon:number}} a
 * @param {{lat:number, lon:number}} b
 * @returns {number} Distance in kilometres.
 */
export function planarDistanceKm(a, b) {
  const dLat = (a.lat - b.lat) * 111;
  const avgLat = ((a.lat + b.lat) / 2) * (Math.PI / 180);
  const dLon = (a.lon - b.lon) * 111 * Math.cos(avgLat);
  return Math.sqrt((dLat * dLat) + (dLon * dLon));
}

/**
 * Whether two boxes overlap by at least a fraction of the FIRST box's area.
 *
 * The asymmetry matters and is the point: `a` is the box being requested, so
 * the question is "how much of what I am about to ask for do I already have",
 * not "how similar are these two rectangles".
 *
 * @param {{south:number, west:number, north:number, east:number}} a Requested bounds.
 * @param {{south:number, west:number, north:number, east:number}} b Held bounds.
 * @param {number} threshold Minimum overlap fraction (0-1) relative to `a`.
 * @returns {boolean}
 */
export function boundsOverlap(a, b, threshold) {
  const overlapS = Math.max(a.south, b.south);
  const overlapN = Math.min(a.north, b.north);
  const overlapW = Math.max(a.west, b.west);
  const overlapE = Math.min(a.east, b.east);
  if (overlapN <= overlapS || overlapE <= overlapW) return false;
  const overlapArea = (overlapN - overlapS) * (overlapE - overlapW);
  const aArea = (a.north - a.south) * (a.east - a.west);
  return aArea > 0 && (overlapArea / aArea) >= threshold;
}

/** Fraction of a requested box that must already be held to skip a re-fetch. */
export const ROAD_REFETCH_OVERLAP_THRESHOLD = 0.6;

/**
 * Whether a camera move has earned a new road fetch.
 *
 * Three reasons to refetch, and the FIRST is the one that only exists because
 * the layer has altitude bands:
 *
 *   1. THE BAND CHANGED. A finer band's box sits entirely inside a coarser
 *      band's, so descending from 22 km to 2 km over one point scores 100%
 *      overlap and zero centre shift — and the two rules below would skip the
 *      fetch and leave the user at street level looking at an arterial-only
 *      graph fetched for a view 36× wider. Comparing geometry alone cannot see
 *      this, because the geometry is not what changed.
 *   2. The requested box is no longer mostly covered by what is held.
 *   3. The centre moved more than the band tolerates.
 *
 * @param {Object} args
 * @param {Object} args.tier The band this fetch would run at.
 * @param {{south:number, west:number, north:number, east:number}} args.box Requested bounds.
 * @param {{lat:number, lon:number}} args.center Requested centre.
 * @param {?{tierId:string, bounds:Object, center:{lat:number, lon:number}}} args.last
 *   The last COMMITTED fetch, or null when there has not been one.
 * @returns {boolean}
 */
export function roadRefetchNeeded({ tier, box, center, last }) {
  if (!last?.bounds || !last?.center) return true;
  if (last.tierId !== tier.id) return true;
  if (!boundsOverlap(box, last.bounds, ROAD_REFETCH_OVERLAP_THRESHOLD)) return true;
  return planarDistanceKm(center, last.center) >= tier.minShiftKm;
}

/**
 * The band's box, at its FULL span, centred on a lattice point.
 *
 * ── Why the span stops following the window ───────────────────────────────
 * {@link normalizeFetchBox} took the camera POSE out of the Overpass cache
 * key. It could not take the WINDOW SIZE out, because the span it rounds is
 * the viewport's. Measured 2026-09-16 on the default Paris view
 * (`scripts/qa-span-par-viewport.mjs`, eleven window sizes, 22 captured
 * requests): the snapped centre was (48.865, 2.285) on all eleven — perfect —
 * and the span produced **five different keys**. 1920×1080 and 1920×993, the
 * same screen with and without a tab bar, landed in two of them. The band's
 * cap only bit in 2 cases out of 11, so the rest of the time the key was the
 * reader's chrome height.
 *
 * ── Why it is affordable now, and was not before ──────────────────────────
 * Fixing the span at the band's own was measured and REJECTED on 2026-09-16:
 * at the `qa-traffic-floor` view it takes the box from 0.0304° × 0.0435° to
 * 0.05° × 0.05°, and 421 roads became 1 003 while the 6 000-dot cap stayed
 * put — every street on screen drawn half as busy.
 *
 * That rejection was right about the DOTS and wrong about the BOX. The dots
 * are diluted because {@link module:data/traffic} allocated its budget over
 * the roads it FETCHED. Allocate over the roads that are in FRAME instead
 * (see `visibleRoadsForAltitude`) and the two numbers come apart: the box can
 * be as wide as the cache wants while the picture stays exactly as dense as
 * the reader's window earns. The extra roads are parsed once per cell and
 * then answer every pan, zoom and tilt that stays inside it.
 *
 * The span is a whole number of lattice steps in every band (0.05/0.005 = 10,
 * 0.30/0.025 = 12), so the normalisation below only ever moves the centre.
 *
 * @param {{lat:number, lon:number}} center Fetch centre in degrees.
 * @param {{spanDeg:number, snapDeg:number}} tier The band.
 * @returns {?{south:number, west:number, north:number, east:number}} The box,
 *   or null when the band carries no usable span.
 */
export function tierFetchBox(center, tier) {
  const span = tier?.spanDeg;
  if (!Number.isFinite(span) || span <= 0) return null;
  if (!Number.isFinite(center?.lat) || !Number.isFinite(center?.lon)) return null;
  return normalizeFetchBox({
    south: center.lat - span / 2,
    north: center.lat + span / 2,
    west: center.lon - span / 2,
    east: center.lon + span / 2,
  }, tier);
}

/**
 * Bounding box of an OSM way's `[lon, lat]` vertex list.
 *
 * @param {number[][]} coords Vertices as `[lon, lat]`.
 * @returns {?{south:number, west:number, north:number, east:number}} The box,
 *   or null for an empty list.
 */
export function coordsBounds(coords) {
  if (!Array.isArray(coords) || coords.length === 0) return null;
  let south = Infinity;
  let north = -Infinity;
  let west = Infinity;
  let east = -Infinity;
  for (const c of coords) {
    const lon = c[0];
    const lat = c[1];
    if (lat < south) south = lat;
    if (lat > north) north = lat;
    if (lon < west) west = lon;
    if (lon > east) east = lon;
  }
  return { south, west, north, east };
}

/**
 * Whether two boxes share any area — touching edges count.
 *
 * Touching counts on purpose: a road that runs exactly along the frame edge is
 * on screen, and the alternative is a one-pixel-wide class of streets that
 * vanish for no reason a reader could ever name.
 *
 * @param {?{south:number, west:number, north:number, east:number}} a
 * @param {?{south:number, west:number, north:number, east:number}} b
 * @returns {boolean}
 */
export function boxesIntersect(a, b) {
  if (!a || !b) return false;
  return a.south <= b.north && a.north >= b.south
    && a.west <= b.east && a.east >= b.west;
}

/**
 * The shared area of two boxes, or null when they are disjoint.
 *
 * Used to hold the render frame inside the fetch box: beyond that edge there
 * are no roads to draw, only a strip the reader would read as "the traffic
 * stops here".
 *
 * @param {{south:number, west:number, north:number, east:number}} a
 * @param {{south:number, west:number, north:number, east:number}} b
 * @returns {?{south:number, west:number, north:number, east:number}}
 */
export function intersectBoxes(a, b) {
  if (!a) return b ?? null;
  if (!b) return a;
  const south = Math.max(a.south, b.south);
  const north = Math.min(a.north, b.north);
  const west = Math.max(a.west, b.west);
  const east = Math.min(a.east, b.east);
  if (north < south || east < west) return null;
  return { south, west, north, east };
}
