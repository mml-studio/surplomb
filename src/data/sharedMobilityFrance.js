/**
 * @module sharedMobilityFrance
 *
 * French shared mobility — the bikes, e-bikes, scooters, mopeds and shared
 * cars waiting to be picked up, from the GBFS feeds published on the Point
 * d'Accès National (`transport.data.gouv.fr`).
 *
 * WHAT THIS IS, AND WHAT IT IS NOT. This is an INVENTORY, not a track. The
 * GBFS spec is explicit: *"Vehicles that are part of an active rental MUST NOT
 * appear in this feed."* A vehicle being ridden is invisible — it disappears
 * when unlocked and reappears wherever it is parked. So nothing here glides
 * the way a bus does in `transitFrance.js`; the fleet BLINKS, and pretending
 * otherwise by interpolating between two sightings would be inventing a
 * journey that the feed deliberately does not publish.
 *
 * HOW IT AVOIDS DRAWING THE SAME THING TWICE. Three separate redundancies are
 * resolved before a point reaches the screen, all of them measured rather than
 * assumed (see `gbfsFeeds.js` and `scripts/build-gbfs-fr-index.mjs`):
 *
 *   1. The catalog lists one system many times — 165 resources, 135 distinct
 *      systems. Duplicates are identified by the SET OF PLACES a system
 *      reports, which survives different URLs, hosts and GBFS versions.
 *   2. Four systems are already drawn by `bikeshare.js` (Vélib', Vélo'v,
 *      vélÔToulouse, Le Vélo TBM) and are excluded here rather than doubled.
 *   3. Free-floating operators republish the city's own parking bays as their
 *      "stations" — 26,259 rows over Paris alone, near-identical between
 *      operators. Those are not drawn per operator; the fleet is.
 *   4. An operator alone in its city escapes rule 3 and draws its whole bay
 *      map, most of it empty: Pony put 447 empty bays over Biarritz against 94
 *      holding a bike. A VIRTUAL bay with a published zero is not drawn — it
 *      is a polygon, not infrastructure — while an empty physical dock always
 *      is (`isEmptyVirtualBay`). Both counts are declared in the control row.
 *
 * NAMES ARE CHECKED AGAINST THEIR OWN KEY. Ten Pony systems publish
 * `station_id` in the `name` field — 4,959 rows nationwide — which filled a
 * whole city with `basque_country_parking` repeated. `gbfsFeeds.js` refuses
 * the echo, and a nameless dot is called by its operator instead.
 *
 * FRESHNESS IS UNEVEN AND SAID SO. Measured 2026-08-26: Lime republishes every
 * ~50 s, Dott's median fix is 8 minutes old with a tail past 2 hours. The card
 * prints the age of the vehicle's own last report, never the age of the poll.
 */
import * as Cesium from 'cesium';
import { claimCameraSensitivity, releaseCameraSensitivity } from './cameraSensitivity.js';
import { markViewportRead, releaseCameraSettle, watchCameraSettle } from './cameraSettle.js';
import { governorRequestRender } from '../renderGovernor.js';
import { registerSpriteCollection, restoreSpriteOrder, unregisterSpriteCollection } from './spriteOrder.js';
import { registerPickOwner, unregisterPickOwner } from './pickRegistry.js';
import { cachedGroundFloor, warmGroundFloor } from './groundFloor.js';
import {
  provisionalFloor,
  provisionalFloorRetryDelayMs,
  sampleProvisionalFloors,
} from './provisionalFloor.js';
import { horizonOccluder } from './iconOrientation.js';
import {
  clearOverlaySource,
  setOverlayEntries,
  setOverlaySourceVisible,
} from '../overlays/worldOverlay.js';
import {
  GBFS_MAX_BOX_DEG,
  GBFS_MAX_OBJECTS,
  gbfsBoxContains,
  VEHICLE_KINDS,
  gbfsPayloadLabel,
  gbfsVehicleKindLabel,
  gbfsVehicleKindPlural,
} from './gbfsFeeds.js';
import { formatDecimal, formatList, formatNumber } from '../i18n/format.js';
import messages from './sharedMobilityFrance.i18n.js';
import {
  MOBILITY_DOCK_FILL,
  dockFillLegend,
  isMobilityOperatorId,
  curatedMobilityOperators,
  mobilityOperatorShortLabel,
  resolveMobilityOperator,
} from './mobilityOperators.js';
import operatorMessages from './mobilityOperators.i18n.js';
import { sharedMobilityGlyph } from './sharedMobilityIcons.js';
import { pickAt } from './pickAt.js';
import { profileCountBudget } from '../perfProfile.js';

/** Layer id — also the share-link registry key and the voice-tool enum value. */
export const SHARED_MOBILITY_FR_LAYER_ID = 'shared-mobility-fr';
/** Protected selected-object card source on the shared world-overlay host. */
export const SHARED_MOBILITY_FR_OVERLAY_SOURCE_ID = 'shared-mobility-fr-selected';
export const SHARED_MOBILITY_FR_OVERLAY_SOURCE_OPTIONS = Object.freeze({
  cohortLimit: 1,
  collisionCapacity: 0,
  moving: false,
});

// --- Activation / load gating ----------------------------------------------
/**
 * Altitude (m) below which the layer loads. A parked scooter is a street-scale
 * object: above this it is a sub-pixel speck and the request would stop being
 * a viewport query.
 */
const ACTIVATION_ALTITUDE_M = 80_000;
const ACTIVATION_ENTER_ALTITUDE_M = ACTIVATION_ALTITUDE_M - 4_000;
const ACTIVATION_EXIT_ALTITUDE_M = ACTIVATION_ALTITUDE_M + 4_000;
/** Debounce (ms) on camera-driven viewport reloads. */
const CAMERA_DEBOUNCE_MS = 450;
/**
 * Poll cadence (ms). Slower than the transit layer on purpose: an inventory
 * changes when someone rents or returns something — measured at ~1% of a
 * 6,700-bike fleet per two minutes — and several operators publish data that
 * is already minutes old.
 */
const POLL_INTERVAL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 30_000;
/** Hard cap on rendered points, independent of what the proxy returns. */
const MAX_RENDERED_OBJECTS = 6_000;
/** Metres above the resolved ground floor a point sits. */
const POINT_LIFT_M = 2.5;
/**
 * Objects whose DEM floor is requested per reconcile.
 *
 * The DEM answers over the network and a Paris viewport holds 6,000 objects;
 * this is the courtesy budget on the terrain proxy, unchanged from the layer's
 * first cut. What it does not reach is NOT left on the ellipsoid — it keeps
 * the rendered-surface floor sampled below, which measured within ~1.3 m of
 * the DEM where both were read (`provisionalFloor.js`).
 */
const MAX_FLOOR_WARM = 600;
/**
 * How far a cell the probe budget did not reach may borrow a sampled floor
 * from, in km. Tighter than the fire layer's 25 km on purpose: a parked
 * scooter is a street-scale object and the view that holds one is a city, so
 * a borrowed floor stays inside one urban basin — where the relief is metres
 * and the ellipsoid is wrong by tens to hundreds. Wider would start borrowing
 * across a valley wall.
 */
const FLOOR_FILL_KM = 10;

// --- Presentation -----------------------------------------------------------
//
// TWO CHANNELS, TWO QUESTIONS. A viewport over Paris holds Lime, Dott and Voi
// in the same streets, publishing bikes, e-bikes, scooters and mopeds side by
// side. Those are independent facts, so they get independent channels:
//
//   SHAPE  — WHAT it is.  A vehicle wears its own silhouette
//            (`sharedMobilityIcons.js`); a station is a dot, because a place
//            is not a vehicle and should not be drawn as one.
//   COLOUR — WHO runs it. The operator's hue (`mobilityOperators.js`) is the
//            body of a vehicle and the RING of a station.
//
// A station keeps its FILL for availability, which is the reading someone acts
// on and which no vehicle has: how full it is. So the ring, not the fill,
// carries the operator there — the alternative was to spend the fill on the
// operator and lose the only actionable number the layer publishes.
/**
 * Vehicle plate footprint, in CSS px before the distance ramp.
 *
 * 17 until 2026-09-14, raised with the move to a plate: the mark now has to
 * carry a punched silhouette AND, up close, an operator monogram, and a capital
 * inside a badge inside a disc needs the room. The far end of the ramp is
 * unchanged in absolute terms — see {@link VEHICLE_GLYPH_SCALE}.
 */
const VEHICLE_GLYPH_PX = 20;
/**
 * Glyph scale ramp: recognisable up close, a coloured speck at gate altitude.
 *
 * Retuned with the plate, and `near` moved from 500 m to 1,200 m — which is
 * what actually gives the monogram somewhere to live.
 *
 * Cesium does NOT interpolate this linearly. `czm_nearFarScalar` works on
 * SQUARED distance and then takes `pow(t, 0.2)`, so the falloff is violently
 * front-loaded: on the old ramp a mark was already down to 15.9 px at 2 km and
 * to 19.5 px — its own maximum — only below ~600 m. Holding the plate at full
 * size across the whole street-level band costs nothing legible (it was already
 * at its maximum down there) and is what makes a badge band exist at all.
 *
 * The WIDE end is deliberately unchanged: 20 × 0.34 = 6.8 px is exactly what
 * 17 × 0.4 drew before. The layer renders up to 6,000 objects and the far end
 * is a budget, not a taste.
 */
const VEHICLE_GLYPH_SCALE = Object.freeze({ near: 1_200, nearValue: 1.2, far: 45_000, farValue: 0.34 });
/**
 * Drawn size (CSS px) below which the operator monogram is NOT asked for.
 *
 * Measured on the contact sheets rather than picked: a capital inside the badge
 * resolves from about 22 px of plate and is pure noise under it, where it eats
 * the silhouette without replacing it. Below this the layer draws the plain
 * plate and the operator is carried by colour alone — which is exactly what the
 * mark degrades to anyway as the ramp closes.
 */
const MONOGRAM_MIN_DRAWN_PX = 22;
const STATION_POINT_MIN_PX = 7;
const STATION_POINT_MAX_PX = 15;
/** Operator ring on a station dot. Two pixels is the thinnest that reads. */
const STATION_RING_PX = 2;
const SELECTED_POINT_PX = 18;
const SELECTED_GLYPH_PX = 28;
/** Operators listed by name in the key before the tail is summarised. */
const MAX_OPERATOR_LEGEND_ROWS = 6;
/** Swatch of the tail line that stands for several operators at once. */
const TAIL_LEGEND_TINT = '#cbd5e1';

const SELECTED_COLOR = '#00ffff';

/** Station fill-rate palette — the one `bikeshare.js` reads too. */
const STATION_FULL = MOBILITY_DOCK_FILL.full;
const STATION_MID = MOBILITY_DOCK_FILL.half;
const STATION_LOW = MOBILITY_DOCK_FILL.low;
const STATION_UNKNOWN = MOBILITY_DOCK_FILL.unknown;
const STATION_CLOSED = MOBILITY_DOCK_FILL.closed;

// --- Filtering --------------------------------------------------------------
/**
 * THE FLEET BY FAMILY, AS A FILTER.
 *
 * A city viewport holds bikes, e-bikes, trottinettes, scooters and shared cars
 * in the same streets, and the reader who came for one of them reads the rest
 * as noise. The key's segmented control — « Tous · Vélos · Trottinettes ·
 * Scooters · Voitures » — is what lets them act on it.
 *
 * FAMILIES, NOT HALVES. Until 2026-09-21 this was a pair, « Vélos » and « Le
 * reste », which over Paris put 36 YEGO scooters and a handful of Clem' cars
 * under one word. A family is the silhouette the map already draws, so the
 * control and the marks agree. A VAE is still a bike: `vehicleKindFromType()`
 * splits `bicycle` by propulsion, and a « Vélos » that hid every e-bike would
 * be lying about its own name.
 *
 * `other` — a form factor GBFS declines to name — belongs to no family: it is
 * drawn under « Tous » and under nothing else, rather than filed wrong.
 *
 * The key shows a segment only for a family that has something on screen:
 * Paris has no trottinette since 2023, and a « Trottinettes » that blanks the
 * map is a control that looks broken.
 */
// i18n-ignore-start — family ids are param values, not copy.
export const SHARED_MOBILITY_KIND_FILTERS = Object.freeze([
  Object.freeze({
    id: 'velo',
    get label() { return messages().filters.velo; },
    kinds: Object.freeze(['bike', 'ebike']),
  }),
  Object.freeze({
    id: 'trottinette',
    get label() { return messages().filters.trottinette; },
    kinds: Object.freeze(['scooter']),
  }),
  Object.freeze({
    id: 'scooter',
    get label() { return messages().filters.scooter; },
    kinds: Object.freeze(['moped']),
  }),
  Object.freeze({
    id: 'voiture',
    get label() { return messages().filters.voiture; },
    kinds: Object.freeze(['car']),
  }),
]);
// i18n-ignore-end

/** The family a vehicle kind belongs to, or null for `other`. */
function familyOfKind(kind) {
  for (const filter of SHARED_MOBILITY_KIND_FILTERS) {
    if (filter.kinds.includes(kind)) return filter.id;
  }
  return null;
}

/**
 * The families a station holds.
 *
 * A dock publishes what is in it, and that is what files it — a car-share
 * station is under « Voitures », not « Vélos ». Two unknowns fall back to
 * BIKES, following the GBFS spec's own default: a system that publishes no
 * vehicle types "is assumed to operate non-motorized bicycles". One is a
 * station with no breakdown at all; the other a GBFS 3.0 station whose
 * `vehicle_type_id`s the proxy could not resolve against the system's own
 * `vehicle_types.json` (`resolveStationKinds`). A dock that turns out to hold
 * scooters then shows under « Vélos », which is the failure worth having — the
 * alternative hides half the docks in France from the control that names them.
 *
 * An empty dock is still a bike dock: `{bike: 0}` is a stand with nothing in
 * it, not a car park.
 *
 * @param {{byKind?: ?Object<string, number>}} station Wire station.
 * @returns {Set<string>}
 */
export function stationFamilies(station) {
  const families = new Set();
  for (const [key, count] of Object.entries(station?.byKind || {})) {
    if (!(Number(count) > 0)) continue;
    const family = familyOfKind(key);
    if (family) families.add(family);
  }
  if (!families.size) families.add('velo');
  return families;
}

/** Whether a station holds bicycles — see {@link stationFamilies}. */
export function stationHoldsBikes(station) {
  return stationFamilies(station).has('velo');
}

/**
 * Whether one wire object survives a family filter. A null filter keeps
 * everything, `other` included.
 * @param {?string} filterId One of {@link SHARED_MOBILITY_KIND_FILTERS}' ids.
 * @param {'station'|'vehicle'} type
 * @param {object} object Wire station or vehicle.
 * @returns {boolean}
 */
export function matchesKindFilter(filterId, type, object) {
  if (!filterId) return true;
  return type === 'station'
    ? stationFamilies(object).has(filterId)
    : familyOfKind(object?.kind) === filterId;
}

/**
 * A param value for the family filter: a family id, or null for all.
 * `undefined` means the value is refused.
 */
function parseKindParam(value) {
  if (value === null || value === 'all') return null;
  const id = String(value);
  return SHARED_MOBILITY_KIND_FILTERS.some((filter) => filter.id === id) ? id : undefined;
}

/** Same, for the operator focus. */
function parseOperatorParam(value) {
  if (value === null || value === 'all') return null;
  return isMobilityOperatorId(value) ? value : undefined;
}

/**
 * The focused operator's name. It may have nothing in this answer — the focus
 * can come from the Vélib' line of the same row — so the curated table and,
 * last, the id itself answer when the payload cannot.
 */
function focusedOperatorLabel() {
  if (!_operatorFilter) return '';
  for (const operator of _operatorsBySystem.values()) {
    if (operator.id === _operatorFilter) return operator.label;
  }
  const curated = curatedMobilityOperators().find((entry) => entry.id === _operatorFilter);
  return curated?.label || _operatorFilter.replace(/^derived:/, '');
}

const DEFAULT_OVERLAY_HOST = Object.freeze({
  setEntries: setOverlayEntries,
  setVisible: setOverlaySourceVisible,
  clearSource: clearOverlaySource,
});
let _overlayHost = DEFAULT_OVERLAY_HOST;

// --- Runtime state ----------------------------------------------------------
let _viewer = null;
/** Station dots: fill = availability, ring = operator. */
let _points = null;
/** Vehicle glyphs: silhouette = kind, tint = operator. */
let _billboards = null;
/** True while the camera is close enough for a monogram to resolve. */
let _monogramOn = false;
let _records = new Map();
let _enabled = false;
let _clickHandler = null;
let _cameraChangedAttached = false;
let _cameraDebounceTimer = null;
let _preRenderRemover = null;
let _selectedId = null;
let _inFlight = null;
let _requestGeneration = 0;
let _loading = false;
let _error = null;
let _status = 'idle';
let _count = 0;
let _lastUpdate = null;
let _systems = [];
let _systemsMatched = 0;
let _truncated = false;
let _altitudeGateOpen = false;
let _lastBox = null;
/** The last viewport answer, kept so a filter change repaints without a
 *  refetch — and so the chips can count the half they are hiding. */
let _lastPayload = null;
/** Active family filter id, or null for the whole fleet. */
let _kindFilter = null;
/** Focused operator id, or null for every operator. */
let _operatorFilter = null;
/** Memo of `legendTally()`: the payload, filters and screen it was counted on. */
let _tallyPayload = null;
let _tallyKey = '';
let _tally = null;
/** Operator per system id, resolved once per payload. */
let _operatorsPayload = null;
let _operatorsBySystem = new Map();
let _rowControlsListener = null;
/** Deferred floor pass: timer handle and retries already spent (see
 *  `scheduleFloorRetry`). */
let _floorRetryTimer = null;
let _floorRetries = 0;

/**
 * The operator behind a render record.
 *
 * Derived from the system title rather than stored on the wire object: the
 * proxy already sends one `systems` row per feed and duplicating the operator
 * onto every one of 6,000 vehicles would be the same string 6,000 times.
 * @param {Object} record Render record.
 * @returns {{id:string, label:string, color:string, curated:boolean}}
 */
export function sharedMobilityOperator(record) {
  return record?.operator || resolveMobilityOperator(record?.system?.name);
}

/** The single primitive a record draws — a glyph for a vehicle, a dot for a station. */
function recordPrimitive(record) {
  return record?.billboard || record?.point || null;
}

/** Display label for a vehicle kind. */
export function vehicleKindLabel(kind) {
  return gbfsVehicleKindLabel(kind) || (kind ? String(kind) : messages().fallbackVehicle);
}

/**
 * Display label for a vehicle kind, agreeing with a count.
 * @param {string} kind
 * @param {number} count
 * @returns {string}
 */
export function vehicleKindPlural(kind, count) {
  if (Math.abs(Number(count)) < 2) return vehicleKindLabel(kind);
  return gbfsVehicleKindPlural(kind) || vehicleKindLabel(kind);
}

/**
 * The pictogram that goes in front of a count.
 *
 * A bike badge over a car-share station would be a picture of the wrong
 * vehicle, so this reads the station's own inventory rather than assuming.
 * `other` is a form factor GBFS named and this layer has no word for — it gets
 * no badge at all rather than a plausible wrong one.
 */
const KIND_EMOJI = Object.freeze({
  bike: '🚲',
  ebike: '🚲',
  scooter: '🛴',
  moped: '🛵',
  car: '🚗',
});

/** Lowercase a label for mid-sentence use, leaving acronyms like VAE alone. */
function lowerLabel(label) {
  return label === label.toUpperCase() ? label : label.toLowerCase();
}

/** Join a short enumeration in the page's language: `a, b et c` / `a, b, and c`. */
function joinFr(parts) {
  if (parts.length < 2) return parts[0] || '';
  return formatList(parts);
}

/**
 * What a station holds: the badge to draw, and the kinds worth naming.
 *
 * A bike badge over a car-share station would be a picture of the wrong
 * vehicle, so the badge is read off the published inventory. When there is no
 * inventory the fallback is BIKES — the same GBFS default `stationHoldsBikes`
 * already follows, where a system naming no vehicle type "is assumed to
 * operate non-motorized bicycles".
 *
 * @param {?Object<string, number>} byKind
 * @returns {{emoji: string, kinds: Array<[string, number]>, bikesOnly: boolean}}
 */
function stationInventory(byKind) {
  const kinds = Object.entries(byKind || {})
    .map(([kind, count]) => [kind, Number(count)])
    .filter(([, count]) => Number.isFinite(count) && count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const names = kinds.map(([kind]) => kind);
  const bikesOnly = !names.length || names.every((kind) => kind === 'bike' || kind === 'ebike');
  if (bikesOnly) return { emoji: KIND_EMOJI.bike, kinds, bikesOnly: true };
  return { emoji: names.length === 1 ? (KIND_EMOJI[names[0]] || '') : '', kinds, bikesOnly: false };
}

/**
 * What to call a station whose feed published no name.
 *
 * Ten Pony systems publish `station_id` in the `name` field, so `gbfsFeeds.js`
 * drops the echo and the dot arrives here nameless. The fallback says the two
 * things that ARE known — who runs it, and whether it is a painted bay or a
 * dock — rather than repeating an identifier the reader cannot use. A place
 * without a name is not a place without an owner.
 *
 * @param {Object} record Render record.
 * @returns {string}
 */
export function stationTitle(record) {
  const name = record?.object?.name;
  if (name) return String(name);
  const kind = record?.object?.virtual ? 'Aire' : 'Station';
  const operator = sharedMobilityOperator(record);
  return operator.id === 'unknown' ? kind : `${kind} ${operator.label}`;
}

/**
 * Colour for a station, by how full it is.
 *
 * A station with no availability data is NOT drawn as empty — it takes the
 * neutral tint, because "we do not know" and "there are no bikes" are
 * different facts and the second one is actionable.
 *
 * @param {{available:?number, capacity:?number, docks:?number, renting:?boolean}} station
 * @returns {string}
 */
export function stationColor(station) {
  if (station?.renting === false) return STATION_CLOSED;
  // `Number(null)` is 0, not NaN — so a plain Number() coercion here would
  // paint every station whose feed omits availability as EMPTY, which is the
  // one reading a person acts on. The absence has to be checked first.
  const raw = station?.available;
  if (raw === null || raw === undefined || raw === '') return STATION_UNKNOWN;
  const available = Number(raw);
  if (!Number.isFinite(available)) return STATION_UNKNOWN;
  const capacity = Number(station?.capacity)
    || (Number.isFinite(Number(station?.docks)) ? available + Number(station.docks) : NaN);
  if (!Number.isFinite(capacity) || capacity <= 0) {
    return available > 0 ? STATION_FULL : STATION_LOW;
  }
  const ratio = available / capacity;
  if (ratio > 0.6) return STATION_FULL;
  if (ratio >= 0.3) return STATION_MID;
  return STATION_LOW;
}

/** Rendered size for a station, scaled by capacity. */
export function stationPointSize(station) {
  const capacity = station?.capacity === null || station?.capacity === undefined
    ? Number.NaN
    : Number(station.capacity);
  if (!Number.isFinite(capacity) || capacity <= 0) return STATION_POINT_MIN_PX + 2;
  const scaled = STATION_POINT_MIN_PX + Math.sqrt(Math.min(capacity, 60)) * 1.1;
  return Math.min(STATION_POINT_MAX_PX, scaled);
}

/**
 * Camera view box, clamped to the proxy's ceiling.
 * A wider view returns null and the layer reports zoom-in guidance instead of
 * a quietly cropped answer.
 * @param {Cesium.Viewer} viewer
 * @returns {?{south:number, west:number, north:number, east:number}}
 */
export function cameraSharedMobilityBox(viewer) {
  const rectangle = viewer?.camera?.computeViewRectangle?.();
  if (!rectangle) return null;
  const south = Cesium.Math.toDegrees(rectangle.south);
  const north = Cesium.Math.toDegrees(rectangle.north);
  const west = Cesium.Math.toDegrees(rectangle.west);
  const east = Cesium.Math.toDegrees(rectangle.east);
  if (![south, west, north, east].every(Number.isFinite)) return null;
  if (west >= east || south >= north) return null;
  if (north - south > GBFS_MAX_BOX_DEG || east - west > GBFS_MAX_BOX_DEG) return null;
  return { south, west, north, east };
}

function cameraAltitudeM(viewer) {
  const carto = viewer?.camera?.positionCartographic;
  return Number.isFinite(carto?.height) ? carto.height : Infinity;
}

/**
 * The scale Cesium will actually apply to a billboard at `distance`.
 *
 * NOT a linear interpolation, which is the trap this started out in. Cesium's
 * `czm_nearFarScalar` (built into the vertex shader, see
 * `Build/Cesium/Cesium.js`) interpolates on SQUARED distance and then raises
 * the parameter to the 0.2 power:
 *
 *     t = ((d² − near²) / (far² − near²))^0.2   clamped to [0, 1]
 *     scale = mix(nearValue, farValue, t)
 *
 * Assuming a straight line between the two ends puts the switch altitude out by
 * an order of magnitude — it read 5,800 m where the mark is really 22 px only
 * below ~550 m. Reimplemented here rather than guessed, so the layer and the
 * GPU agree about how big anything is.
 *
 * @param {number} distance Metres from the camera.
 * @returns {number} Multiplier applied to {@link VEHICLE_GLYPH_PX}.
 */
function rampScaleAt(distance) {
  const { near, nearValue, far, farValue } = VEHICLE_GLYPH_SCALE;
  const span = far * far - near * near;
  const raw = span <= 0 ? 0 : (distance * distance - near * near) / span;
  const t = Math.min(1, Math.max(0, raw)) ** 0.2;
  return nearValue + t * (farValue - nearValue);
}

/**
 * Camera altitude (m) at or below which a plate is drawn at least
 * {@link MONOGRAM_MIN_DRAWN_PX} wide, and so may carry its monogram.
 *
 * DERIVED from the ramp rather than written down beside it: the size the layer
 * draws and the altitude it switches at are the same equation, and a second
 * hard-coded number would drift the moment the ramp is retuned.
 * {@link rampScaleAt} inverted.
 *
 * Distance is read as altitude, which holds for the near-nadir views this layer
 * is gated to and errs on the safe side otherwise — an oblique camera is
 * FURTHER from the object than its altitude, so the badge comes on slightly
 * late rather than on a mark too small to carry it.
 *
 * It lands just past `near` (1,218 m against 1,200 m) and that is not a
 * coincidence to tidy away: `pow(t, 0.2)` is near-vertical the moment it leaves
 * the clamp, so "at least 22 px" and "still at full size" are the same band on
 * this ramp. The rule the reader gets is therefore the simple one — the plate
 * carries its letter exactly while it is drawn at full size.
 *
 * @returns {number} Metres.
 */
function monogramAltitudeCeilingM() {
  const { near, nearValue, far, farValue } = VEHICLE_GLYPH_SCALE;
  const wanted = MONOGRAM_MIN_DRAWN_PX / VEHICLE_GLYPH_PX;
  if (wanted >= nearValue) return near;
  if (wanted <= farValue) return far;
  const t = (wanted - nearValue) / (farValue - nearValue);
  return Math.sqrt(near * near + (t ** 5) * (far * far - near * near));
}

/**
 * Whether the plates currently on screen should carry their monogram, and
 * whether that answer just changed.
 *
 * @param {Object} viewer
 * @returns {boolean} True when the answer flipped and the set needs rewriting.
 */
function updateMonogramGate(viewer) {
  const next = cameraAltitudeM(viewer) <= monogramAltitudeCeilingM();
  if (next === _monogramOn) return false;
  _monogramOn = next;
  return true;
}

/** The image one vehicle record should be drawing right now. */
function vehicleGlyphFor(record) {
  return sharedMobilityGlyph(record.object?.kind, {
    initial: _monogramOn ? (record.operator?.initial || null) : null,
  });
}

/**
 * Re-point every vehicle plate at the image the current zoom calls for.
 *
 * Cheap by construction: the whole layer draws at most seven distinct kinds
 * times the handful of operators in view, so every assignment here resolves to
 * an atlas entry Cesium already holds. It walks the set only when
 * {@link updateMonogramGate} says the answer changed.
 *
 * @returns {number} How many plates were rewritten.
 */
function syncMonograms() {
  let changed = 0;
  for (const record of _records.values()) {
    if (!record.billboard) continue;
    const image = vehicleGlyphFor(record);
    if (record.billboard.image === image) continue;
    record.billboard.image = image;
    changed += 1;
  }
  if (changed) governorRequestRender('shared-mobility-fr-monogram');
  return changed;
}

function updateAltitudeGate(viewer) {
  const altitude = cameraAltitudeM(viewer);
  if (_altitudeGateOpen) {
    if (altitude > ACTIVATION_EXIT_ALTITUDE_M) _altitudeGateOpen = false;
  } else if (altitude < ACTIVATION_ENTER_ALTITUDE_M) {
    _altitudeGateOpen = true;
  }
  return _altitudeGateOpen;
}

/**
 * The floor one object stands on: the shared DEM/mesh cell when it is warm,
 * the PROVISIONAL rendered-surface read when it is not, and null when neither
 * has an answer.
 *
 * WHY THE SECOND SOURCE EXISTS. The DEM answers over the network. Until it
 * does, this returned 0 — the WGS84 ellipsoid, which under a French city is
 * tens to hundreds of metres below the street. The points draw with
 * `disableDepthTestDistance: Infinity` so a scooter is not swallowed by the
 * kerb it sits on, so a buried point is painted anyway, and its screen
 * position then follows the CAMERA POSE: drag the map and the whole fleet
 * slides across the rooftops before snapping back. That is the reported
 * "the points move with the map instead of being fixed to it", and it
 * recurred on every viewport the session had not visited — which, on a layer
 * that refetches on every camera move, is most of them.
 * @param {{lat: number, lon: number}} object
 * @returns {?number} Ellipsoidal floor in metres, or null.
 */
function objectFloor(object) {
  const floor = cachedGroundFloor(object.lat, object.lon);
  if (Number.isFinite(floor)) return floor;
  const provisional = provisionalFloor(object.lat, object.lon);
  return Number.isFinite(provisional) ? provisional : null;
}

function objectPosition(object) {
  const floor = objectFloor(object);
  const height = (floor ?? 0) + POINT_LIFT_M;
  return Cesium.Cartesian3.fromDegrees(object.lon, object.lat, height);
}

/**
 * One shared-mobility object — a docking station or a parked vehicle — in the
 * words a spoken answer uses.
 *
 * Mirrors `buildSharedMobilitySelectionLabel` field for field, so the card the
 * operator reads and the payload the brain reads cannot disagree about the same
 * dot. The card formats; this one names.
 *
 * A parked vehicle is exactly that: GBFS free-floating feeds publish AVAILABLE
 * vehicles only, never a track. `moving` is therefore absent rather than false —
 * a field the feed does not answer must not be answered here.
 *
 * @param {object|null} record Render record.
 * @returns {object|null}
 */
export function sharedMobilityReadout(record) {
  const object = record?.object;
  if (!object) return null;
  const num = (value) => (Number.isFinite(value) ? value : null);
  const operator = sharedMobilityOperator(record);
  const base = {
    id: record.id,
    lat: num(object.lat),
    lon: num(object.lon),
    operator: operator?.id === 'unknown' ? null : (operator?.label || null),
    system: record.system?.name || null,
    source: 'GBFS (transport.data.gouv.fr)',
  };
  if (record.type === 'station') {
    return {
      ...base,
      kind: 'shared-mobility-station',
      // A feed that published an identifier instead of a name leaves this
      // null. The card can fall back on the operator; a spoken answer must
      // not, or it would report a brand as a toponym.
      name: object.name || null,
      virtual: object.virtual === true,
      vehiclesAvailable: num(object.available),
      docksAvailable: num(object.docks),
      capacity: num(object.capacity),
      byKind: object.byKind && Object.keys(object.byKind).length ? { ...object.byKind } : null,
      renting: object.renting !== false,
    };
  }
  return {
    ...base,
    kind: 'shared-mobility-vehicle',
    vehicleKind: vehicleKindLabel(object.kind),
    rangeKm: Number.isFinite(object.rangeMeters) ? Math.round(object.rangeMeters / 100) / 10 : null,
    // GBFS `last_reported` is epoch SECONDS; the readout speaks milliseconds
    // like every other timestamp the voice payload carries.
    lastReportedMs: Number.isFinite(object.lastReported) && object.lastReported > 0
      ? object.lastReported * 1000
      : null,
  };
}

/**
 * Build the card copy for a selected object. Every line is a published value.
 * @param {Object} record Render record.
 * @param {number} [nowMs]
 * @returns {string} Newline-separated card copy.
 */
export function buildSharedMobilitySelectionLabel(record, nowMs = Date.now()) {
  const card = messages().card;
  const object = record?.object || {};
  const system = record?.system || {};
  const operator = sharedMobilityOperator(record);
  const details = [];

  let title;
  if (record.type === 'station') {
    title = stationTitle(record);
    const available = Number.isFinite(object.available) ? object.available : null;
    const inventory = stationInventory(object.byKind);
    if (available === null) {
      // Stated, for the same reason `stationColor` paints this case neutral:
      // « on ne sait pas » and « il n'y a rien » are different facts, and only
      // the second one is worth walking to.
      details.push(card.noInventory);
    } else {
      // A single kind that accounts for the whole count names itself here, and
      // the breakdown line below disappears — « 1 VAE » printed twice was the
      // card spending two lines on one fact.
      const single = inventory.kinds.length === 1 && inventory.kinds[0][1] === available
        ? inventory.kinds[0][0]
        : null;
      const noun = lowerLabel(vehicleKindPlural(single || (inventory.bikesOnly ? 'bike' : 'other'), available));
      const counts = [card.available(fr(available), noun)];
      if (Number.isFinite(object.capacity) && object.capacity > 0) {
        counts[0] += card.ofPlaces(fr(object.capacity));
      }
      if (Number.isFinite(object.docks)) {
        // A painted bay has no dock to lock into: what is free there is a
        // place on the ground, not a borne.
        const many = object.docks > 1 ? 's' : '';
        counts.push(object.virtual === true
          ? card.freeSpaces(fr(object.docks), many)
          : card.freeDocks(fr(object.docks), many));
      }
      details.push(`${inventory.emoji ? `${inventory.emoji} ` : ''}${counts.join(' · ')}`);
      if (!single && inventory.kinds.length > 1) {
        const split = inventory.kinds.map(([kind, count]) => {
          // Inside a bikes-only station the split IS the power source, and
          // « 5 vélos » under « 7 vélos disponibles » would not say which five.
          const label = inventory.bikesOnly && kind === 'bike'
            ? card.mechanical(count)
            : lowerLabel(vehicleKindPlural(kind, count));
          return `${fr(count)} ${label}`;
        });
        details.push(card.ofWhich(joinFr(split)));
      }
    }
    if (object.renting === false) details.push(card.rentingSuspended);
  } else {
    // « Trottinette Dott », not « Trottinette »: the operator is half of what
    // the glyph on screen is saying, and the card is where that colour gets a
    // name.
    const kind = vehicleKindLabel(object.kind);
    title = operator.id === 'unknown' ? kind : card.vehicleWithOperator(kind, operator.label);
    if (Number.isFinite(object.rangeMeters)) {
      const km = formatDecimal(object.rangeMeters / 1000, 1, { minimumFractionDigits: 1 });
      details.push(card.range(km));
    }
    // Age of the vehicle's OWN last report — several operators publish fixes
    // that are minutes to hours old, and the poll time would hide that.
    if (Number.isFinite(object.lastReported)) {
      const seconds = Math.max(0, Math.round(nowMs / 1000 - object.lastReported));
      details.push(seconds < 90
        ? card.fixSeconds(seconds)
        : card.fixMinutes(fr(Math.round(seconds / 60))));
    }
  }

  // The network that publishes this dot. Dropped when it only echoes the title
  // or the operator already inside it — « Pony » under « Aire Pony » is a line
  // spent saying nothing.
  // « Système sans nom » is a stand-in the index wrote, not a name: it is
  // translated on the way out, while a real operator name passes through.
  const network = system.name ? gbfsPayloadLabel(String(system.name)) : '';
  const echo = network.toLowerCase();
  if (network && echo !== title.toLowerCase() && echo !== String(operator?.label || '').toLowerCase()) {
    details.push(`🅿️ ${network}`);
  }
  return [title, ...details].join('\n');
}

/**
 * Protected selected-object entry for the shared overlay host.
 * @param {Object} record
 * @param {number} [nowMs]
 * @returns {?Object}
 */
export function createSharedMobilitySelectedOverlayEntry(record, nowMs = Date.now()) {
  const position = record?.position;
  if (!record?.id || !position) return null;
  const [title, ...details] = buildSharedMobilitySelectionLabel(record, nowMs).split('\n');
  return {
    id: String(record.id),
    position,
    variant: 'selected',
    selected: true,
    protected: true,
    paintLane: 'selected',
    collisionGroup: 'ambient-card',
    priority: Number.MAX_SAFE_INTEGER,
    title,
    details,
    accent: SELECTED_COLOR,
    interactive: false,
    anchorRadiusPx: 9,
    minAnchorGapPx: 11,
    verticalOnly: true,
    placement: 'above',
    edgeFade: 'keyhole',
    horizonCull: true,
    terrainOcclusion: false,
  };
}

function restoreRecordStyle(record) {
  const color = Cesium.Color.fromCssColorString(record?.baseColor || SELECTED_COLOR);
  if (record?.billboard) {
    record.billboard.color = color;
    record.billboard.width = record.baseSize;
    record.billboard.height = record.baseSize;
    return;
  }
  if (!record?.point) return;
  record.point.color = color;
  record.point.pixelSize = record.baseSize;
}

function clearSelection() {
  if (_selectedId) {
    restoreRecordStyle(_records.get(_selectedId));
  }
  _selectedId = null;
  _overlayHost.clearSource(SHARED_MOBILITY_FR_OVERLAY_SOURCE_ID);
}

function selectObject(id) {
  clearSelection();
  const record = _records.get(id);
  if (!record || !_viewer) return;
  _selectedId = id;
  const selected = Cesium.Color.fromCssColorString(SELECTED_COLOR);
  if (record.billboard) {
    record.billboard.color = selected;
    record.billboard.width = SELECTED_GLYPH_PX;
    record.billboard.height = SELECTED_GLYPH_PX;
  } else if (record.point) {
    // The ring is left alone: losing the operator colour at the moment someone
    // asks "whose is this?" would be exactly backwards.
    record.point.color = selected;
    record.point.pixelSize = SELECTED_POINT_PX;
  }
  const entry = createSharedMobilitySelectedOverlayEntry(record);
  if (entry) {
    _overlayHost.setEntries(
      SHARED_MOBILITY_FR_OVERLAY_SOURCE_ID,
      [entry],
      SHARED_MOBILITY_FR_OVERLAY_SOURCE_OPTIONS,
    );
  }
  governorRequestRender('shared-mobility-fr-select');
}

function onKeyDown(event) {
  if (event.key === 'Escape' && _selectedId) clearSelection();
}

function installClickHandler(viewer) {
  if (_clickHandler) return;
  _clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  _clickHandler.setInputAction((click) => {
    const picked = pickAt(viewer.scene, click.position);
    if (picked) {
      const primitiveId = picked.primitive?.id;
      if (typeof primitiveId === 'string' && _records.has(primitiveId)) {
        selectObject(primitiveId);
        return;
      }
      if (typeof picked.id === 'string' && _records.has(picked.id)) {
        selectObject(picked.id);
        return;
      }
    }
    if (_selectedId) clearSelection();
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  document.addEventListener('keydown', onKeyDown);
}

/**
 * Per-frame horizon pass.
 *
 * Points draw with depth testing disabled so a scooter is not swallowed by the
 * kerb it sits on, which also means one on the far side of the planet would
 * paint straight through the globe. Nothing here animates — an inventory does
 * not move — so this is the layer's only per-frame work.
 */
function onPreRender() {
  if (!_enabled || !_records.size) return;
  const camera = _viewer?.camera;
  if (!camera) return;
  const occluder = horizonOccluder(camera);
  for (const record of _records.values()) {
    const primitive = recordPrimitive(record);
    if (!primitive) continue;
    primitive.show = occluder.isPointVisible(record.position);
  }
}

/**
 * Replace the rendered set with a viewport answer.
 *
 * Order matters twice here. The FILTER runs before the render cap, so a chip
 * means "draw only bikes" and not "draw fewer bikes" — spending a 6,000-object
 * budget on vehicles the reader just asked to hide would be the second. And
 * the FLOOR pass runs before any position is computed, because a position is
 * written into a primitive once and nothing recomputes it per frame.
 */
/**
 * The operator behind a system of this payload.
 *
 * One resolve per system, not per object — a Paris viewport holds thousands
 * of vehicles across a handful of operators — and memoised on the payload, so
 * the key and the reconcile share the answer.
 */
function payloadOperator(payload, systemId) {
  if (_operatorsPayload !== payload) {
    _operatorsPayload = payload;
    _operatorsBySystem = new Map();
  }
  let operator = _operatorsBySystem.get(systemId);
  if (!operator) {
    const system = (payload?.systems || []).find((entry) => entry.id === systemId);
    operator = resolveMobilityOperator(system?.name);
    _operatorsBySystem.set(systemId, operator);
  }
  return operator;
}

/** Whether a wire object belongs to the focused operator, or no focus is set. */
function matchesOperatorFilter(payload, object) {
  return !_operatorFilter || payloadOperator(payload, object?.system).id === _operatorFilter;
}

function reconcile(payload) {
  const stations = Array.isArray(payload.stations) ? payload.stations : [];
  const vehicles = Array.isArray(payload.vehicles) ? payload.vehicles : [];
  const systemsById = new Map((payload.systems || []).map((system) => [system.id, system]));

  clearSelection();
  _points.removeAll();
  _billboards.removeAll();
  _records.clear();
  // A new set is a new situation: the deferred floor pass gets its budget back.
  resetFloorRetries();

  const drawn = [];
  const seen = new Set();
  for (const station of stations) {
    if (drawn.length >= MAX_RENDERED_OBJECTS) break;
    const id = station.id;
    if (!id || seen.has(id)) continue;
    if (!matchesKindFilter(_kindFilter, 'station', station)) continue;
    if (!matchesOperatorFilter(payload, station)) continue;
    seen.add(id);
    drawn.push({ type: 'station', id, object: station });
  }
  for (const vehicle of vehicles) {
    if (drawn.length >= MAX_RENDERED_OBJECTS) break;
    const id = vehicle.id || `${vehicle.system}:${vehicle.lat},${vehicle.lon}`;
    if (seen.has(id)) continue;
    if (!matchesKindFilter(_kindFilter, 'vehicle', vehicle)) continue;
    // A focused operator's rivals are not drawn at all — not hidden, not
    // dimmed: on a phone the plates that are not asked for are the cheapest.
    if (!matchesOperatorFilter(payload, vehicle)) continue;
    seen.add(id);
    drawn.push({ type: 'vehicle', id, object: vehicle });
  }

  // Answered BEFORE the plates are built, so a reconcile that follows a zoom
  // writes the right image once instead of writing it and then rewriting it.
  updateMonogramGate(_viewer);

  const objects = drawn.map((entry) => entry.object);
  // Ground the cold cells against the surface actually being DRAWN before the
  // positions below are taken. Synchronous, no network of ours, ≤40 probes and
  // nothing at all above 25 km of camera (`provisionalFloor.js`).
  const { pending } = sampleProvisionalFloors(_viewer?.scene, objects, { fillKm: FLOOR_FILL_KM });

  const operatorFor = (systemId) => payloadOperator(payload, systemId);

  for (const entry of drawn) {
    const { id, object } = entry;
    const position = objectPosition(object);
    const operator = operatorFor(object.system);
    if (entry.type === 'station') {
      const color = stationColor(object);
      const size = stationPointSize(object);
      const point = _points.add({
        id,
        position,
        color: Cesium.Color.fromCssColorString(color),
        pixelSize: size,
        // Fill answers "how full", ring answers "whose".
        outlineColor: Cesium.Color.fromCssColorString(operator.color),
        outlineWidth: STATION_RING_PX,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        translucencyByDistance: new Cesium.NearFarScalar(500, 1.0, 90_000, 0.35),
      });
      _records.set(id, {
        id, type: 'station', object, system: systemsById.get(object.system) || {},
        operator, point, position, baseColor: color, baseSize: size,
      });
      continue;
    }
    const billboard = _billboards.add({
      id,
      position,
      image: sharedMobilityGlyph(object.kind, {
        initial: _monogramOn ? (operator.initial || null) : null,
      }),
      width: VEHICLE_GLYPH_PX,
      height: VEHICLE_GLYPH_PX,
      color: Cesium.Color.fromCssColorString(operator.color),
      // A glyph big enough to read at street level is a blanket over a whole
      // city, so it rides a distance ramp down to roughly the speck the layer
      // drew before it had shapes.
      scaleByDistance: new Cesium.NearFarScalar(
        VEHICLE_GLYPH_SCALE.near, VEHICLE_GLYPH_SCALE.nearValue,
        VEHICLE_GLYPH_SCALE.far, VEHICLE_GLYPH_SCALE.farValue,
      ),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      translucencyByDistance: new Cesium.NearFarScalar(500, 1.0, 90_000, 0.3),
    });
    _records.set(id, {
      id, type: 'vehicle', object, system: systemsById.get(object.system) || {},
      operator, billboard, position, baseColor: operator.color, baseSize: VEHICLE_GLYPH_PX,
    });
  }

  _count = _records.size;
  warmGroundFloor(objects.slice(0, MAX_FLOOR_WARM));
  // Two reasons to come back, and neither of them produces a frame on its own:
  // the tiles under a cell may not have streamed yet, and the DEM warm above
  // is fire-and-forget — nothing repositions what it resolves.
  if (pending || hasColdFloor(objects)) scheduleFloorRetry();
  governorRequestRender('shared-mobility-fr-reconcile');
}

/** True when any object is still standing on no measured floor at all. */
function hasColdFloor(objects) {
  for (const object of objects) {
    if (objectFloor(object) == null) return true;
  }
  return false;
}

/**
 * Re-place every rendered object on the best floor now known for its cell.
 *
 * A position is baked into a primitive once, so a floor that lands after the
 * reconcile changes nothing until something walks the set — which is what this
 * is. Cheap: no network, no allocation beyond the new Cartesians, and it exits
 * on the first pass where nothing moved.
 * @returns {number} How many objects actually moved.
 */
function reanchor() {
  let moved = 0;
  for (const record of _records.values()) {
    const next = objectPosition(record.object);
    // 5 cm: below this the move is not a pixel anywhere, and rewriting the
    // primitive would only cost the collection a dirty flag.
    if (Cesium.Cartesian3.equalsEpsilon(record.position, next, 0, 0.05)) continue;
    record.position = next;
    const primitive = recordPrimitive(record);
    if (primitive) primitive.position = next;
    moved += 1;
  }
  // The selected card is anchored on the record's position, so it has to be
  // told too — otherwise the card stays where the buried point used to be.
  if (moved && _selectedId) {
    const entry = createSharedMobilitySelectedOverlayEntry(_records.get(_selectedId));
    if (entry) {
      _overlayHost.setEntries(
        SHARED_MOBILITY_FR_OVERLAY_SOURCE_ID,
        [entry],
        SHARED_MOBILITY_FR_OVERLAY_SOURCE_OPTIONS,
      );
    }
  }
  return moved;
}

/** One deferred floor pass: sample again, re-place, and decide whether to
 *  come back. Never fetches — the DEM warm runs on its own underneath. */
function refreshFloors() {
  if (!_enabled || !_viewer || !_records.size) return;
  const objects = [];
  for (const record of _records.values()) objects.push(record.object);
  const { pending } = sampleProvisionalFloors(_viewer.scene, objects, { fillKm: FLOOR_FILL_KM });
  if (reanchor()) governorRequestRender('shared-mobility-fr-reanchor');
  if (pending || hasColdFloor(objects)) scheduleFloorRetry();
}

/**
 * Come back for the objects the surface could not place yet.
 *
 * A probe misses when the tiles under a vehicle have not streamed — the
 * ordinary state for the second or two after arriving somewhere — and a parked
 * camera produces no rebuild, so nothing would ask again. Bounded on purpose:
 * five doubling wakeups (~37 s in total, `provisionalFloor.js`), refilled
 * whenever the situation is new, so ground with no photoreal coverage cannot
 * undo the render governor's idle parking.
 */
function scheduleFloorRetry() {
  if (_floorRetryTimer != null) return;
  const delay = provisionalFloorRetryDelayMs(_floorRetries);
  if (delay == null) return; // budget spent — wait for the camera to move
  _floorRetries += 1;
  _floorRetryTimer = setTimeout(() => {
    _floorRetryTimer = null;
    refreshFloors();
  }, delay);
}

/** Drops a pending pass and refills its budget (a new situation gets a new one). */
function resetFloorRetries() {
  if (_floorRetryTimer != null) {
    clearTimeout(_floorRetryTimer);
    _floorRetryTimer = null;
  }
  _floorRetries = 0;
}

function clearFleet() {
  clearSelection();
  resetFloorRetries();
  if (_points) _points.removeAll();
  if (_billboards) _billboards.removeAll();
  _records.clear();
  _count = 0;
}

async function loadViewport({ force = false } = {}) {
  if (!_enabled || !_viewer) return;
  // Whatever this call concludes — a fleet, a zoom-in verdict or a failure —
  // it concludes it about the view the camera is showing right now. See
  // `cameraSettle.js`: an arrival on any other view has to be read afresh.
  markViewportRead(_viewer, SHARED_MOBILITY_FR_LAYER_ID);

  if (!updateAltitudeGate(_viewer)) {
    _status = 'zoom-in';
    _error = null;
    _loading = false;
    _lastPayload = null;
    if (_records.size) clearFleet();
    return;
  }
  const box = cameraSharedMobilityBox(_viewer);
  if (!box) {
    _status = 'zoom-in';
    _error = null;
    _loading = false;
    _lastPayload = null;
    if (_records.size) clearFleet();
    return;
  }

  const boxKey = [box.south, box.west, box.north, box.east].map((v) => v.toFixed(3)).join(',');
  if (!force && boxKey === _lastBox && _inFlight) return;
  _lastBox = boxKey;

  const generation = ++_requestGeneration;
  _inFlight?.abort?.();
  const controller = new AbortController();
  _inFlight = controller;
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  _loading = true;

  try {
    const params = new URLSearchParams({
      south: box.south.toFixed(5),
      west: box.west.toFixed(5),
      north: box.north.toFixed(5),
      east: box.east.toFixed(5),
      // § 3.5 — see `profileCountBudget`. The proxy serves the screen first,
      // so a light device loses margin and even thinning, not the view.
      limit: String(profileCountBudget(GBFS_MAX_OBJECTS)),
    });
    const response = await fetch(`/api/shared-mobility-fr/objects?${params}`, { signal: controller.signal });
    if (generation !== _requestGeneration) return;
    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const body = await response.json();
        if (body?.error) detail = body.missingIndex ? 'system index missing' : String(body.error);
      } catch { /* keep the status-code detail */ }
      throw new Error(detail);
    }
    const payload = await response.json();
    if (generation !== _requestGeneration || !_enabled) return;

    _lastPayload = payload;
    reconcile(payload);
    _systems = payload.systems || [];
    _systemsMatched = Number(payload.systemsMatched) || 0;
    _truncated = payload.objectsTruncated === true || payload.systemsTruncated === true;
    _lastUpdate = Date.now();
    _error = null;
    _status = _count > 0 ? 'ready' : 'empty';
  } catch (error) {
    if (error?.name === 'AbortError') return;
    if (generation !== _requestGeneration) return;
    console.warn('[Data:SharedMobilityFR] viewport load failed:', error?.message || error);
    _error = error?.message || 'shared-mobility feed unavailable';
    _status = 'error';
  } finally {
    clearTimeout(timer);
    if (generation === _requestGeneration) {
      _loading = false;
      _inFlight = null;
    }
  }
}

function onCameraChanged() {
  if (!_enabled) return;
  // A camera that moved is a NEW situation for the floor pass: closer tiles
  // read finer, and a load that turns out to be a no-op (same box, request
  // already in flight) would otherwise leave the fleet on whatever floor the
  // last view could see.
  resetFloorRetries();
  clearTimeout(_cameraDebounceTimer);
  _cameraDebounceTimer = setTimeout(() => {
    scheduleFloorRetry();
    void loadViewport();
  }, CAMERA_DEBOUNCE_MS);
}

/**
 * The camera has come to REST — read the view it stopped on.
 *
 * `camera.changed` goes quiet before an eased flight lands (measured Paris →
 * Rouen: last `changed` t=2.5 s, `moveEnd` t=3.3 s), so the load a flight
 * triggers describes a camera still in the air. See `cameraSettle.js`, which
 * also holds the "did we already read this view" short-circuit that keeps an
 * ordinary pan down to one load.
 *
 * It SUPERSEDES the pending debounce rather than racing it: on a hand pan
 * `moveEnd` arrives while that timer is still armed, and letting both run
 * would ask the proxy the same question twice.
 */
function onCameraSettled() {
  if (!_enabled) return;
  clearTimeout(_cameraDebounceTimer);
  _cameraDebounceTimer = null;
  resetFloorRetries();
  scheduleFloorRetry();
  // A zoom that stays inside the view already read reloads nothing — and a zoom
  // is exactly what decides whether a monogram can be resolved. So the gate is
  // answered here, on arrival, and not only on the load path.
  if (updateMonogramGate(_viewer)) syncMonograms();
  void loadViewport();
}

/** Deterministic subsample of rendered objects for the detection overlay. */
function collectDetectableObjects(options = {}) {
  if (!_enabled || !(_points?.show || _billboards?.show) || !_records.size) return [];
  const records = [];
  for (const record of _records.values()) {
    if (!recordPrimitive(record)?.show && record.id !== _selectedId) continue;
    records.push(record);
  }
  if (!records.length) return [];

  const maxCount = Number.isFinite(options.maxCount)
    ? Math.max(1, Math.floor(options.maxCount))
    : records.length;
  const seed = Number.isFinite(options.seed) ? Math.floor(options.seed) : 0;
  const stride = Math.max(1, Math.ceil(records.length / maxCount));
  const start = ((seed % stride) + stride) % stride;

  const result = [];
  for (let i = start; i < records.length; i += stride) {
    const record = records[i];
    result.push({
      position: record.position,
      sourceId: record.id,
      id: record.type === 'station'
        ? stationTitle(record).toUpperCase().slice(0, 22)
        : `${mobilityOperatorShortLabel(record.system?.name, 10)} ${vehicleKindLabel(record.object.kind)}`
          .toUpperCase().slice(0, 22),
      type: 'VEH',
      skipLabel: record.id === _selectedId,
    });
    if (result.length >= maxCount) break;
  }
  return result;
}

/**
 * What the key counts: the objects ON SCREEN, per family and per operator —
 * INCLUDING what a filter is hiding. A control that says what it costs is the
 * difference between a filter and a disappearance.
 *
 * FACETED, the way a shop's filters are. Families are counted under the
 * operator focus and operators under the family filter, so « Scooters » with
 * Lime focused says how many Lime scooters there are, and a segment or a dot
 * that would blank the map shows as empty rather than looking broken.
 *
 * ON SCREEN, NOT IN THE ANSWER. The proxy adds a margin around the view so a
 * short pan lands on objects already drawn (`capGbfsObjects`); a key that
 * counted it said « 3 673 ici » over a screen holding 2,175. No viewer (the
 * unit tests) means no screen, and everything is counted.
 *
 * Memoised on payload, filters and screen: the panel asks about once a second
 * and this walks up to 6,000 objects.
 * @returns {{families: Object<string, number>, familiesAll: Object<string, number>,
 *   operators: Map<string, {operator: object, count: number}>, stations: number, shown: number}}
 */
function legendTally() {
  const payload = _lastPayload;
  const box = _viewer ? cameraSharedMobilityBox(_viewer) : null;
  const key = [_kindFilter, _operatorFilter, box ? [box.south, box.west, box.north, box.east].map((v) => v.toFixed(4)).join(',') : '']
    .join('|');
  if (_tally && _tallyPayload === payload && _tallyKey === key) return _tally;

  const families = Object.fromEntries(SHARED_MOBILITY_KIND_FILTERS.map((filter) => [filter.id, 0]));
  // The same, blind to the operator focus: which segments EXIST. A control
  // that lost two of its three segments the moment « Lime » was pressed would
  // move under the reader's hand; a segment Lime has nothing in greys instead.
  const familiesAll = { ...families };
  const operators = new Map();
  let stations = 0;
  let shown = 0;
  const visit = (type, object) => {
    if (box && !gbfsBoxContains(box, object?.lat, object?.lon)) return;
    const operator = payloadOperator(payload, object?.system);
    const ownFocus = !_operatorFilter || operator.id === _operatorFilter;
    const ownFamily = matchesKindFilter(_kindFilter, type, object);
    const objectFamilies = type === 'station'
      ? [...stationFamilies(object)]
      : [familyOfKind(object?.kind)].filter(Boolean);
    for (const family of objectFamilies) {
      familiesAll[family] += 1;
      if (ownFocus) families[family] += 1;
    }
    if (ownFamily) {
      const seen = operators.get(operator.id);
      if (seen) seen.count += 1;
      else operators.set(operator.id, { operator, count: 1 });
    }
    if (ownFocus && ownFamily) {
      shown += 1;
      if (type === 'station') stations += 1;
    }
  };
  for (const station of Array.isArray(payload?.stations) ? payload.stations : []) visit('station', station);
  for (const vehicle of Array.isArray(payload?.vehicles) ? payload.vehicles : []) visit('vehicle', vehicle);

  _tallyPayload = payload;
  _tallyKey = key;
  _tally = { families, familiesAll, operators, stations, shown };
  return _tally;
}

const fr = (value) => formatNumber(Number(value));

function buildLoadingLabel() {
  const m = messages().row;
  if (_status === 'zoom-in') return m.zoomIn;
  if (_loading) return _records.size ? m.refreshing : m.searching;
  if (_status === 'empty') {
    // A filter that hides everything has to own it: « aucun véhicule ne se
    // signale ici » would blame the feed for the reader's own choice.
    const held = (_lastPayload?.stations?.length || 0) + (_lastPayload?.vehicles?.length || 0);
    if ((_kindFilter || _operatorFilter) && held > 0) return m.filteredOut;
    return _systemsMatched > 0 ? m.nothingReporting : m.noSystem;
  }
  const active = _systems.filter((s) => s.stationsInView > 0 || s.vehiclesInView > 0).length;
  const parts = [m.operators(fr(active), active === 1)];
  if (_kindFilter) {
    parts.push(m.familyOnly(SHARED_MOBILITY_KIND_FILTERS.find((filter) => filter.id === _kindFilter)?.label || _kindFilter));
  }
  if (_operatorFilter) parts.push(m.operatorOnly(focusedOperatorLabel()));
  if (_truncated) parts.push(m.capped);
  const suppressed = _systems.reduce((sum, s) => sum + (s.stationsSuppressed || 0), 0);
  if (suppressed) parts.push(m.mergedStations(fr(suppressed), suppressed > 1 ? 's' : ''));
  // The empty painted bays the proxy dropped. Said out loud for the same
  // reason as the line above: a count that changed silently is a count the
  // reader cannot trust.
  const emptyBays = _systems.reduce((sum, s) => sum + (s.baysHidden || 0), 0);
  if (emptyBays) parts.push(m.hiddenBays(fr(emptyBays), emptyBays > 1 ? 's' : ''));
  const stale = _systems.filter((s) => s.stale).length;
  if (stale) parts.push(m.staleFeeds(fr(stale), stale > 1 ? 's' : ''));
  return parts.join(' · ');
}

/**
 * French shared-mobility layer.
 * @type {Object}
 */
const sharedMobilityFranceLayer = {
  id: SHARED_MOBILITY_FR_LAYER_ID,
  // i18n-ignore-start — registry fields, not copy: see src/data/layerTaxonomy.i18n.js.
  name: 'Véhicules partagés (FR)',
  icon: '🛴',
  source: 'transport.data.gouv.fr',
  // i18n-ignore-end
  updateInterval: POLL_INTERVAL_MS,

  init(viewer) {
    _viewer = viewer;
    _points = new Cesium.PointPrimitiveCollection({ blendOption: Cesium.BlendOption.TRANSLUCENT });
    _points.show = false;
    viewer.scene.primitives.add(_points);
    _billboards = new Cesium.BillboardCollection({ scene: viewer.scene });
    _billboards.show = false;
    viewer.scene.primitives.add(_billboards);
    // Registered in this order so a vehicle glyph paints OVER the dock dot it
    // is parked next to, and both stay inside this layer's sprite slot.
    registerSpriteCollection(SHARED_MOBILITY_FR_LAYER_ID, _points);
    registerSpriteCollection(SHARED_MOBILITY_FR_LAYER_ID, _billboards);

    _enabled = false;
    _records = new Map();
    _selectedId = null;
    _count = 0;
    _lastUpdate = null;
    _loading = false;
    _error = null;
    _status = 'idle';
    _systems = [];
    _systemsMatched = 0;
    _truncated = false;
    _altitudeGateOpen = false;
    _lastBox = null;
    _lastPayload = null;
    resetFloorRetries();

    _overlayHost.setVisible(SHARED_MOBILITY_FR_OVERLAY_SOURCE_ID, false);
    restoreSpriteOrder(viewer);
  },

  enable(viewer) {
    _enabled = true;
    _error = null;
    _points.show = true;
    _billboards.show = true;
    _overlayHost.setVisible(SHARED_MOBILITY_FR_OVERLAY_SOURCE_ID, true);
    installClickHandler(viewer);
    registerPickOwner(SHARED_MOBILITY_FR_LAYER_ID, (pickedId) => _records.has(pickedId));

    if (!_cameraChangedAttached) {
      viewer.camera.changed.addEventListener(onCameraChanged);
      claimCameraSensitivity(viewer, SHARED_MOBILITY_FR_LAYER_ID);
      // Arrival, as opposed to motion — see `onCameraSettled`.
      watchCameraSettle(viewer, SHARED_MOBILITY_FR_LAYER_ID, onCameraSettled);
      _cameraChangedAttached = true;
    }
    if (!_preRenderRemover) {
      _preRenderRemover = viewer.scene.preRender.addEventListener(onPreRender);
    }
    void loadViewport({ force: true });
    restoreSpriteOrder(viewer);
  },

  disable(viewer) {
    _enabled = false;
    _requestGeneration += 1;
    _altitudeGateOpen = false;
    clearTimeout(_cameraDebounceTimer);
    _cameraDebounceTimer = null;
    _inFlight?.abort?.();
    _inFlight = null;

    clearFleet();
    _overlayHost.setVisible(SHARED_MOBILITY_FR_OVERLAY_SOURCE_ID, false);

    if (_clickHandler) {
      _clickHandler.destroy();
      _clickHandler = null;
    }
    document.removeEventListener('keydown', onKeyDown);
    unregisterPickOwner(SHARED_MOBILITY_FR_LAYER_ID);

    if (_cameraChangedAttached) {
      viewer.camera.changed.removeEventListener(onCameraChanged);
      releaseCameraSensitivity(viewer, SHARED_MOBILITY_FR_LAYER_ID);
      releaseCameraSettle(viewer, SHARED_MOBILITY_FR_LAYER_ID);
      _cameraChangedAttached = false;
    }
    if (_preRenderRemover) {
      _preRenderRemover();
      _preRenderRemover = null;
    }

    _points.show = false;
    _billboards.show = false;
    _loading = false;
    _status = 'idle';
    _systems = [];
    _lastBox = null;
    _lastPayload = null;
  },

  async update() {
    if (!_enabled) return;
    await loadViewport({ force: true });
  },

  /**
   * Runtime params, both DRAW-ONLY: the viewport answer is kept whole, so the
   * key keeps counting what a filter hides and releasing it costs no request.
   *
   *   `kinds`    — a family id (`velo`, `trottinette`, `scooter`, `voiture`)
   *                or `all`/null.
   *   `operator` — an operator id (`lime`, `derived:velo modalis`) or
   *                `all`/null. The key FANS IT OUT to the other layers of the
   *                row, so pressing « Lime » over Paris also takes the Vélib'
   *                docks off the map (`bikeshare.js` takes the same param).
   *
   * DECLARATIVE, NOT A TOGGLE. `velo` always means "show bikes" and never
   * "show bikes unless you already were" — the lit control publishes `all` as
   * its own params, so the release is a value and not a repeat. A parameter
   * that inverted on re-application would flip the filter off the moment
   * anything replayed it (`lazyLayer`'s buffered calls, a params intent
   * re-applied on enable), and nothing about that would look like a bug.
   *
   * All or nothing: one refused value leaves both filters as they were.
   * @param {{kinds?: ?string, operator?: ?string}} [params]
   * @returns {boolean} Whether anything changed.
   */
  setParams(params = {}) {
    const kinds = params.kinds === undefined ? _kindFilter : parseKindParam(params.kinds);
    const operator = params.operator === undefined ? _operatorFilter : parseOperatorParam(params.operator);
    if (kinds === undefined || operator === undefined) return false;
    if (kinds === _kindFilter && operator === _operatorFilter) return false;
    _kindFilter = kinds;
    _operatorFilter = operator;
    // Repaint from the answer already in hand. A filter is a view of what
    // arrived, not a different question to ask the proxy.
    if (_lastPayload) {
      reconcile(_lastPayload);
      _status = _count > 0 ? 'ready' : 'empty';
    } else {
      clearFleet();
    }
    _rowControlsListener?.();
    return true;
  },

  /**
   * Whether a fanned-out param is one this layer takes. Asked, not attempted:
   * declining is the normal answer for a neighbour's key, and a refused
   * `setParams` would be logged as a failure.
   * @param {object} params
   * @returns {boolean}
   */
  acceptsParams(params = {}) {
    const keys = Object.keys(params || {});
    if (!keys.length || keys.some((key) => key !== 'kinds' && key !== 'operator')) return false;
    if (params.kinds !== undefined && parseKindParam(params.kinds) === undefined) return false;
    if (params.operator !== undefined && parseOperatorParam(params.operator) === undefined) return false;
    return true;
  },

  /** @returns {{kinds: ?string, operator: ?string}} */
  getParams() {
    return { kinds: _kindFilter, operator: _operatorFilter };
  },

  setRowControlsListener(listener) {
    _rowControlsListener = typeof listener === 'function' ? listener : null;
  },

  getDetectableObjects(options = {}) {
    return collectDetectableObjects(options);
  },

  /** The station or vehicle the operator clicked, ready to be spoken. */
  getSelectedInfo() {
    if (!_enabled || !_selectedId) return null;
    return sharedMobilityReadout(_records.get(_selectedId) || null);
  },

  /**
   * Loaded stations and vehicles as plain records for the analyst engine.
   * @param {number} [maxCount=2000]
   * @returns {Array<object>}
   */
  getAnalystRecords(maxCount = 2000) {
    if (!_enabled) return [];
    const limit = Number.isFinite(maxCount) ? Math.max(1, Math.floor(maxCount)) : 2000;
    const out = [];
    for (const record of _records.values()) {
      if (out.length >= limit) break;
      const readout = sharedMobilityReadout(record);
      if (readout && Number.isFinite(readout.lat) && Number.isFinite(readout.lon)) out.push(readout);
    }
    return out;
  },

  getStats() {
    const stats = {
      count: _count,
      lastUpdate: _lastUpdate,
      loading: _loading,
      status: _status === 'ready' ? 'ok' : _status,
    };
    const label = buildLoadingLabel();
    if (label) stats.loadingLabel = label;
    if (_systems.some((system) => system.stale)) stats.stale = true;
    if (_error) stats.error = _error;
    return stats;
  },

  /** Operator provenance for the attribution popover and analyst surfaces. */
  getSystemSummaries() {
    return _systems.map((system) => ({ ...system }));
  },

  /**
   * The key: « Mobilités partagées », as Memel adopted it on 2026-09-21.
   *
   * THREE THINGS, IN READING ORDER.
   *
   *   A segmented control — « Tous · Vélos · Trottinettes · Scooters ·
   *     Voitures » — with a segment only for a family on screen, and none at
   *     all while a single family is. It replaces the two row chips (« Vélos »,
   *     « Le reste »): one control for one question, where the reader looks.
   *   « Fournisseurs » — a dot in the operator's hue and its NAME. The dot
   *     alone was the ChatGPT mock's; 84 operators share 17 hues, and a key
   *     that makes the reader guess is not a key. Each line is its own switch:
   *     pressing it shows that operator only, on this layer and — fanned out —
   *     on the Vélib' docks of the same row; pressing it again brings
   *     everything back, and « Tout afficher » does when the focus came from
   *     the other block. No request: the filter is drawn from the answer in
   *     hand.
   *   « Stations » — the fill of a dock, only when a dock is on screen.
   *
   * WHAT WENT. The SHAPE rows (« VAE 5.2K · Scooter 797 ») — a silhouette is
   * read without a key, and the segments now name the families; the channel
   * captions « forme = quoi » / « couleur + lettre = qui »; and the note « Le
   * même ensemble, compté deux fois », which only existed because the key
   * printed the same population twice.
   *
   * @returns {{chips: Array, legend: Array<object>, legendSegments: Array<object>, legendScope: object}}
   */
  getRowControls() {
    const tally = legendTally();
    const om = operatorMessages().legend;
    const legend = [];

    const ranked = [...tally.operators.values()]
      .filter(({ operator, count }) => count > 0 || operator.id === _operatorFilter)
      .sort((a, b) => b.count - a.count || a.operator.label.localeCompare(b.operator.label));
    let listed = ranked.slice(0, MAX_OPERATOR_LEGEND_ROWS);
    // The focused operator is always named: its line is the way back.
    const focused = ranked.find(({ operator }) => operator.id === _operatorFilter);
    if (focused && !listed.includes(focused)) {
      listed = [...listed.slice(0, MAX_OPERATOR_LEGEND_ROWS - 1), focused];
    }
    for (const { operator, count } of listed) {
      const active = operator.id === _operatorFilter;
      legend.push({
        label: operator.label,
        color: operator.color,
        count,
        channel: om.operators,
        toggle: { param: 'operator', value: active ? 'all' : operator.id, fanOut: true },
        off: Boolean(_operatorFilter) && !active,
        // Side by side there is no column for a sentence: the manager hangs
        // this on the line's tooltip.
        blurb: active ? om.focused(operator.label) : om.focus(operator.label, fr(count)),
      });
    }
    // Never silently truncate: say how many operators the key is not naming.
    const hidden = ranked.filter((entry) => !listed.includes(entry));
    if (hidden.length) {
      legend.push({
        label: messages().legend.moreOperators(hidden.length),
        color: TAIL_LEGEND_TINT,
        count: hidden.reduce((sum, entry) => sum + entry.count, 0),
        channel: om.operators,
        blurb: messages().legend.alsoInView(hidden.map((entry) => entry.operator.label).join(', ')),
      });
    }
    // « Tout afficher » only when the focus has no line here to press again —
    // a focus on Vélib', set from the block above — so the card never prints
    // two ways back.
    if (_operatorFilter && !focused) {
      legend.push({
        label: om.showAll,
        action: true,
        channel: om.operators,
        toggle: { param: 'operator', value: 'all', fanOut: true },
      });
    }
    if (tally.stations > 0) legend.push(...dockFillLegend());

    const present = SHARED_MOBILITY_KIND_FILTERS
      .filter((filter) => tally.familiesAll[filter.id] > 0 || filter.id === _kindFilter);
    const legendSegments = present.length > 1 || _kindFilter
      ? [
        {
          id: 'all',
          label: messages().filters.all,
          active: !_kindFilter,
          // « Tous » while nothing is filtered is where the reader already is.
          toggle: _kindFilter ? { param: 'kinds', value: 'all', fanOut: true } : null,
        },
        ...present.map((filter) => {
          const active = filter.id === _kindFilter;
          return {
            id: filter.id,
            label: filter.label,
            active,
            // Refused rather than allowed to blank the map — never the lit one.
            disabled: !active && tally.families[filter.id] === 0,
            title: messages().legend.familyTitle(fr(tally.families[filter.id])),
            toggle: { param: 'kinds', value: active ? 'all' : filter.id, fanOut: true },
          };
        }),
      ]
      : [];

    return {
      chips: [],
      legend,
      legendSegments,
      legendSegmentsLabel: messages().legend.segmentsLabel,
      // A block a filter emptied is not « hors de cette vue »: its objects are
      // here, the reader asked not to see them. No extent claim then — which
      // also keeps it in place instead of sinking below its neighbour.
      legendScope: tally.shown > 0 || !(_kindFilter || _operatorFilter)
        ? { inView: tally.shown, where: null }
        : null,
    };
  },

  destroy(viewer) {
    if (_enabled) this.disable(viewer);
    else {
      clearSelection();
      _overlayHost.setVisible(SHARED_MOBILITY_FR_OVERLAY_SOURCE_ID, false);
      if (_clickHandler) {
        _clickHandler.destroy();
        _clickHandler = null;
      }
      document.removeEventListener('keydown', onKeyDown);
      unregisterPickOwner(SHARED_MOBILITY_FR_LAYER_ID);
    }
    if (_preRenderRemover) {
      _preRenderRemover();
      _preRenderRemover = null;
    }
    if (_points) {
      unregisterSpriteCollection(SHARED_MOBILITY_FR_LAYER_ID, _points);
      viewer.scene.primitives.remove(_points);
      _points = null;
    }
    if (_billboards) {
      unregisterSpriteCollection(SHARED_MOBILITY_FR_LAYER_ID, _billboards);
      viewer.scene.primitives.remove(_billboards);
      _billboards = null;
    }
    resetFloorRetries();
    _records.clear();
    _lastPayload = null;
    _rowControlsListener = null;
    _viewer = null;
  },
};

/** Seed rendered records so selection/card/legend paths run without WebGL. */
export function _setSharedMobilityStateForTest({ viewer, records, overlayHost }) {
  _viewer = viewer || null;
  _records = new Map((records || []).map((record) => [record.id, record]));
  _selectedId = null;
  _monogramOn = false;
  _overlayHost = overlayHost || DEFAULT_OVERLAY_HOST;
}

/**
 * Drive the production zoom gate at a given camera altitude.
 * @param {number} altitudeM
 * @returns {{on: boolean, flipped: boolean, rewritten: number}}
 */
export function _setSharedMobilityAltitudeForTest(altitudeM) {
  const viewer = { camera: { positionCartographic: { height: altitudeM } } };
  const flipped = updateMonogramGate(viewer);
  return { on: _monogramOn, flipped, rewritten: flipped ? syncMonograms() : 0 };
}

/** The altitude the monogram switches at, derived from the ramp. */
export function _sharedMobilityMonogramCeilingForTest() {
  return {
    ceilingM: monogramAltitudeCeilingM(),
    glyphPx: VEHICLE_GLYPH_PX,
    scale: VEHICLE_GLYPH_SCALE,
    minDrawnPx: MONOGRAM_MIN_DRAWN_PX,
    drawnPxAt: (distance) => VEHICLE_GLYPH_PX * rampScaleAt(distance),
  };
}

/** Exercise the production selection path in focused runtime tests. */
export function _selectSharedMobilityObjectForTest(id) {
  selectObject(id);
}

/** Exercise the production clear path and restore the production host seam. */
export function _clearSharedMobilitySelectionForTest() {
  clearSelection();
  _overlayHost = DEFAULT_OVERLAY_HOST;
}

/** Drive the production re-anchor pass over the seeded records. */
export function _reanchorSharedMobilityForTest() {
  return reanchor();
}

/** Seed the viewport answer the chips count and a filter repaints from. */
export function _setSharedMobilityPayloadForTest(payload) {
  _lastPayload = payload;
}

/** Row-control legend, for tests that do not construct a viewer. */
export function _sharedMobilityRowControlsForTest() {
  return sharedMobilityFranceLayer.getRowControls();
}

export default sharedMobilityFranceLayer;
