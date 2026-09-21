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
  overlayRectIntersectsAny,
  setOverlayEntries,
  setOverlaySourceVisible,
  worldOverlayUiOcclusionRects,
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
  dockFillLegend,
  mobilityDockFill,
  isMobilityOperatorId,
  curatedMobilityOperators,
  mobilityOperatorShortLabel,
  resolveMobilityOperator,
} from './mobilityOperators.js';
import operatorMessages from './mobilityOperators.i18n.js';
import { sharedMobilityPinGlyph } from './sharedMobilityIcons.js';
import { selectSharedMobilityPins, sharedMobilityPinRank } from './sharedMobilityPins.js';
import {
  onMobilityDocksChanged,
  readMobilityDocks,
  setMobilityDocksGrouped,
} from './mobilityDockBridge.js';
import {
  addDocksToSharedMobilityBubbles,
  foldSharedMobilityClusters,
  mergeSharedMobilityBubbles,
  sharedMobilityBubbleBar,
  sharedMobilityClusterCell,
} from './sharedMobilityClusters.js';
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
// THREE MARKS, THREE QUESTIONS. A viewport over Paris holds Lime, Dott and Voi
// in the same streets, publishing bikes, e-bikes, scooters and mopeds side by
// side — 2,175 vehicles on the landing's view alone. Since 2026-09-21 (the
// « Repères discrets » mock) they are drawn in two tiers:
//
//   DOT  — WHO, and HOW MANY. Every vehicle is a small dot in its operator's
//          hue (`mobilityOperators.js`), so the density of a street reads at
//          a glance and costs one point each.
//   PIN  — WHAT it is. A few vehicles, never two within 200 px of each other
//          on screen, wear a pin over their dot with their silhouette
//          (`sharedMobilityPins.js`, `sharedMobilityIcons.js`). Pins only come
//          in close to the street; from higher up the dots say it all.
//   GROUP — HOW MANY, from the city-wide view. Where the view is dense the
//          proxy counts the vehicles on its grid and each group is a bubble:
//          the proxy's count and a bar of its operators
//          (`sharedMobilityClusters.js`). Pressed, it zooms in.
//   RING — A STATION is a dot RINGED in its operator's hue and filled with
//          the same hue as far as it is full (`mobilityDockFill`): solid,
//          tinted, or an empty ring — the one number a rider acts on, and one
//          no vehicle has.
//
// The 20 px plate every vehicle wore until then — silhouette, operator hue
// and, up close, a monogram — was the right mark for ONE vehicle and a carpet
// for two thousand: over the landing's view it covered the street it stood on.
/** Vehicle dot, in CSS px before the distance ramp: 6 of colour inside a 1 px rim. */
const VEHICLE_DOT_PX = 6;
/** The dot's rim: dark, so a pale hue keeps its edge on a pale map. */
const VEHICLE_DOT_RIM_PX = 1;
const VEHICLE_DOT_RIM_COLOR = 'rgba(0,0,0,0.6)';
/**
 * Dot scale ramp: 8 px total up close, about 4.5 px at the gate altitude.
 *
 * Cesium does NOT interpolate this linearly: `czm_nearFarScalar` works on
 * SQUARED distance and then takes `pow(t, 0.2)`, so most of the fall happens
 * just past `near`. That is the shape wanted here — the dot is at full size
 * only where a pin can stand beside it.
 */
const VEHICLE_DOT_SCALE = Object.freeze({ near: 1_500, nearValue: 1, far: 45_000, farValue: 0.55 });
/** A selected vehicle's dot, under its cyan pin. */
const SELECTED_VEHICLE_DOT_PX = 9;
/**
 * Camera altitude (m) at or below which pins are drawn.
 *
 * The landing's Paris view sits at 1,300 m. At 3,500 m a pin already stands
 * for a whole neighbourhood of dots, and above it a silhouette names one
 * vehicle among hundreds — so the dots alone carry the view, which is what
 * the mock asks of a wide shot — and where the view is dense, the proxy
 * answers in groups instead (`sharedMobilityClusters.js`).
 */
const PIN_CEILING_M = 3_500;
/** Pin footprint, CSS px: the 96 × 124 artwork drawn 32 wide. */
const PIN_WIDTH_PX = 32;
const PIN_HEIGHT_PX = Math.round((32 * 124) / 96);
/** The pin's tip stops this far above the dot's centre: the dot stays visible. */
const PIN_TIP_GAP_PX = VEHICLE_DOT_PX / 2 + VEHICLE_DOT_RIM_PX + 1;
/**
 * Above the pins' ceiling, over a view holding at least 1,500 vehicles
 * (`GBFS_CLUSTER_ABOVE`), the fleets are drawn as GROUPS
 * (`sharedMobilityClusters.js`): a bubble per cell of the proxy's grid, its
 * count the proxy's own over every vehicle, and a bar of its operators. A
 * sparser view keeps its dots.
 * 46 × 28 CSS px — room for « 1,2 k » in 13 px over a 30 px bar.
 */
const BUBBLE_WIDTH_PX = 46;
const BUBBLE_HEIGHT_PX = 28;
const BUBBLE_BAR_WIDTH_PX = 30;
const BUBBLE_BAR_HEIGHT_PX = 3;
/** The bar sits this far below the bubble's centre, the count this far above. */
const BUBBLE_BAR_OFFSET_PX = 8;
const BUBBLE_TEXT_OFFSET_PX = -3;
const BUBBLE_FONT = '600 13px "DM Sans", system-ui, sans-serif'; // i18n-ignore-line — a CSS font, not copy.
/**
 * The bubble: the cockpit's glass as a rounded rectangle with a hairline.
 * ONE image for every bubble — the count is a label and the bar is tinted
 * segments of one white image — so a session panning across France adds no
 * atlas entry per number, which a baked « 156 » per bubble would.
 */
const toBase64 = (text) => (typeof btoa === 'function' ? btoa(text) : Buffer.from(text, 'utf8').toString('base64'));
const BUBBLE_IMAGE = `data:image/svg+xml;base64,${toBase64(
  '<svg xmlns="http://www.w3.org/2000/svg" width="92" height="56" viewBox="0 0 92 56">'
  + '<rect x="1.5" y="1.5" width="89" height="53" rx="14" fill="rgba(20,32,28,0.92)"'
  + ' stroke="rgba(255,255,255,0.32)" stroke-width="2"/></svg>',
)}`;
/** A white square the bar segments tint and stretch: one atlas entry for all. */
const BAR_IMAGE = `data:image/svg+xml;base64,${toBase64(
  '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="#fff"/></svg>',
)}`;
/** Ids of bubble primitives, apart from any record id. */
const BUBBLE_ID_PREFIX = 'shared-mobility-fr-group:';
const STATION_POINT_MIN_PX = 7;
const STATION_POINT_MAX_PX = 15;
/** Operator ring on a station dot. Two pixels is the thinnest that reads. */
const STATION_RING_PX = 2;
const SELECTED_POINT_PX = 18;
/** Operators listed by name in the key before the tail is summarised. */
const MAX_OPERATOR_LEGEND_ROWS = 6;
/** Swatch of the tail line that stands for several operators at once. */
const TAIL_LEGEND_TINT = '#cbd5e1';

const SELECTED_COLOR = '#00ffff';


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
/** Every dot: stations (fill = availability, ring = operator), then vehicles
 *  (operator hue) — added in that order so a vehicle paints over the dock it
 *  is parked next to. */
let _points = null;
/** The few vehicle pins: silhouette = kind, ring and tail = operator. */
let _pins = null;
/** Ids pinned by the last pin pass, offered first to the next one. */
let _pinnedIds = new Set();
/** The group bubbles: backgrounds and operator bars, then the counts. */
let _bubbleSprites = null;
let _bubbleLabels = null;
/** Drawn bubbles by id: `{id, lat, lon, n, position, bg, label, bars}`. */
let _bubbles = new Map();
/** Vehicles the drawn bubbles stand for, after the filters. */
let _bubbleTotal = 0;
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

/** The dot a record draws — every station and every vehicle has one. */
function recordPrimitive(record) {
  return record?.point || null;
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
 * How full a station is: `full`, `half`, `low` — or `unknown` and `closed`,
 * which are not levels.
 *
 * A station with no availability data is NOT read as empty — it is `unknown`,
 * because "we do not know" and "there are no bikes" are different facts and
 * the second one is actionable.
 *
 * @param {{available:?number, capacity:?number, docks:?number, renting:?boolean}} station
 * @returns {'full'|'half'|'low'|'unknown'|'closed'}
 */
export function stationFillLevel(station) {
  if (station?.renting === false) return 'closed';
  // `Number(null)` is 0, not NaN — so a plain Number() coercion here would
  // paint every station whose feed omits availability as EMPTY, which is the
  // one reading a person acts on. The absence has to be checked first.
  const raw = station?.available;
  if (raw === null || raw === undefined || raw === '') return 'unknown';
  const available = Number(raw);
  if (!Number.isFinite(available)) return 'unknown';
  const capacity = Number(station?.capacity)
    || (Number.isFinite(Number(station?.docks)) ? available + Number(station.docks) : NaN);
  if (!Number.isFinite(capacity) || capacity <= 0) {
    return available > 0 ? 'full' : 'low';
  }
  const ratio = available / capacity;
  if (ratio > 0.6) return 'full';
  if (ratio >= 0.3) return 'half';
  return 'low';
}

/**
 * A station's fill, as CSS: its operator's hue poured in as far as it is full
 * (`mobilityDockFill`), so the level never borrows another operator's hue.
 * @param {Object} station Wire station.
 * @param {string} [operatorColor] The ring's hue.
 * @returns {string} `rgba(…)`.
 */
export function stationColor(station, operatorColor) {
  return mobilityDockFill(stationFillLevel(station), operatorColor);
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
  if (!record?.point) return;
  record.point.color = Cesium.Color.fromCssColorString(record.baseColor || SELECTED_COLOR);
  record.point.pixelSize = record.baseSize;
}

function clearSelection({ repin = true } = {}) {
  const had = _selectedId;
  if (had) {
    restoreRecordStyle(_records.get(had));
  }
  _selectedId = null;
  _overlayHost.clearSource(SHARED_MOBILITY_FR_OVERLAY_SOURCE_ID);
  // The cyan pin goes back to being an ordinary one — or makes room again.
  if (had && repin) refreshPins();
}

function selectObject(id) {
  clearSelection({ repin: false });
  const record = _records.get(id);
  if (!record || !_viewer) {
    refreshPins();
    return;
  }
  _selectedId = id;
  // The ring is left alone on a station: losing the operator colour at the
  // moment someone asks "whose is this?" would be exactly backwards. A vehicle
  // says it with its pin, which the pass below forces and draws in cyan.
  record.point.color = Cesium.Color.fromCssColorString(SELECTED_COLOR);
  record.point.pixelSize = record.type === 'vehicle' ? SELECTED_VEHICLE_DOT_PX : SELECTED_POINT_PX;
  refreshPins();
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
    const bubble = pickedBubble(picked);
    if (bubble) {
      flyToBubble(bubble);
      return;
    }
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
  if (!_enabled || (!_records.size && !_bubbles.size)) return;
  const camera = _viewer?.camera;
  if (!camera) return;
  const occluder = horizonOccluder(camera);
  for (const record of _records.values()) {
    const primitive = recordPrimitive(record);
    if (!primitive) continue;
    const visible = occluder.isPointVisible(record.position);
    primitive.show = visible;
    if (record.pin) record.pin.show = visible;
  }
  for (const entry of _bubbles.values()) {
    const visible = occluder.isPointVisible(entry.position);
    entry.bg.show = visible;
    entry.label.show = visible;
    for (const bar of entry.bars) bar.show = visible;
  }
}

// --- Pins -------------------------------------------------------------------

const _scratchWindow = new Cesium.Cartesian2();
/** World → CSS px. A seam for the unit tests, which have no WebGL scene. */
const projectToWindow = (scene, position, result) => (
  Cesium.SceneTransforms.worldToWindowCoordinates(scene, position, result)
);
let _projectToWindow = projectToWindow;
/** The chrome the pins keep clear of — the overlay host's own inventory. */
let _readChrome = worldOverlayUiOcclusionRects;

const _scratchPinRect = { x: 0, y: 0, w: PIN_WIDTH_PX, h: PIN_HEIGHT_PX };

/**
 * The vehicles whose pin would be SEEN, in CSS px, ready for
 * `selectSharedMobilityPins`.
 *
 * Runs once per arrival, never per frame. The view box is tested first — a
 * latitude and longitude compare — so the proxy's prefetch margin, a third of
 * a Paris answer, is never projected at all. A pin that would stand off the
 * edge, or under the chrome the overlay host measures (the phone's search bar,
 * its chips, its bottom sheet, the side rails), is not offered: on the phone
 * that was five of the eight pins the rule placed.
 * @returns {Array<{id: string, x: number, y: number, rank: number}>}
 */
function pinCandidates() {
  const scene = _viewer?.scene;
  const canvas = scene?.canvas;
  const width = canvas?.clientWidth || 0;
  const height = canvas?.clientHeight || 0;
  if (!scene || !width || !height) return [];
  const box = cameraSharedMobilityBox(_viewer);
  const occluder = horizonOccluder(_viewer.camera);
  const chrome = _readChrome();
  const half = PIN_WIDTH_PX / 2;
  const rise = PIN_TIP_GAP_PX + PIN_HEIGHT_PX;
  const out = [];
  for (const record of _records.values()) {
    if (record.type !== 'vehicle') continue;
    const selected = record.id === _selectedId;
    const { lat, lon } = record.object;
    if (box && !gbfsBoxContains(box, lat, lon) && !selected) continue;
    if (!occluder.isPointVisible(record.position)) continue;
    const screen = _projectToWindow(scene, record.position, _scratchWindow);
    if (!screen || !Number.isFinite(screen.x) || !Number.isFinite(screen.y)) continue;
    // The selected vehicle is pinned wherever it is: its card points at it.
    if (!selected) {
      if (screen.x < half || screen.x > width - half || screen.y < rise || screen.y > height) continue;
      _scratchPinRect.x = screen.x - half;
      _scratchPinRect.y = screen.y - rise;
      if (chrome.length && overlayRectIntersectsAny(_scratchPinRect, chrome)) continue;
    }
    out.push({ id: record.id, x: screen.x, y: screen.y, rank: record.pinRank });
  }
  return out;
}

/** The image a pinned record wears: its kind, its operator, and whether it is selected. */
function pinImageFor(record) {
  return sharedMobilityPinGlyph(record.object?.kind, {
    color: record.operator?.color,
    selected: record.id === _selectedId,
  });
}

/**
 * Re-choose the pinned vehicles for the view the camera is showing.
 *
 * A DIFF, not a rebuild: a pin that survives keeps its billboard, so a pan
 * redraws only the pins that changed, and a surviving pin never blinks while
 * the atlas resolves an image it already holds. Above {@link PIN_CEILING_M}
 * every pin comes off except the selected one, which is the mark its card
 * points at.
 * @returns {number} How many pins are drawn after the pass.
 */
function refreshPins() {
  if (!_pins) return 0;
  const close = cameraAltitudeM(_viewer) <= PIN_CEILING_M;
  let wanted;
  if (close) {
    wanted = selectSharedMobilityPins(pinCandidates(), {
      incumbents: _pinnedIds,
      forced: _selectedId,
    });
  } else {
    wanted = _selectedId && _records.get(_selectedId)?.type === 'vehicle' ? [_selectedId] : [];
  }
  const next = new Set(wanted);
  let changed = false;
  for (const id of _pinnedIds) {
    if (next.has(id)) continue;
    const record = _records.get(id);
    if (record?.pin) {
      _pins.remove(record.pin);
      record.pin = null;
    }
    changed = true;
  }
  for (const id of next) {
    const record = _records.get(id);
    if (!record) continue;
    const image = pinImageFor(record);
    if (record.pin) {
      if (record.pin.image !== image) {
        record.pin.image = image;
        changed = true;
      }
      continue;
    }
    record.pin = _pins.add({
      id,
      position: record.position,
      image,
      width: PIN_WIDTH_PX,
      height: PIN_HEIGHT_PX,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: new Cesium.Cartesian2(0, -PIN_TIP_GAP_PX),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      show: record.point?.show !== false,
    });
    changed = true;
  }
  _pinnedIds = next;
  if (changed) governorRequestRender('shared-mobility-fr-pins');
  return next.size;
}

/** Take every pin off, without choosing new ones. */
function clearPins() {
  if (_pins) _pins.removeAll();
  for (const id of _pinnedIds) {
    const record = _records.get(id);
    if (record) record.pin = null;
  }
  _pinnedIds = new Set();
}

// --- Groups -----------------------------------------------------------------

/**
 * Ground metres per CSS px at the screen centre: the distance along the view
 * ray to the ground, from altitude and pitch, over the frustum's own angle.
 * An estimate, and a coarse one is enough — the grid it picks only doubles.
 * @returns {?number}
 */
function metresPerPixel(viewer) {
  const camera = viewer?.camera;
  const height = viewer?.scene?.canvas?.clientHeight || 0;
  const fovy = camera?.frustum?.fovy;
  const altitude = cameraAltitudeM(viewer);
  if (!height || !Number.isFinite(fovy) || !Number.isFinite(altitude)) return null;
  // Past 70° off the vertical the ray skims the ground; hold it there.
  const sinPitch = Math.max(Math.sin(Math.PI * 20 / 180), Math.abs(Math.sin(camera.pitch ?? -Math.PI / 2)));
  return (2 * (altitude / sinPitch) * Math.tan(fovy / 2)) / height;
}

/** The grid step to ask the proxy for, or null for the dots-and-pins view. */
function clusterCellForView() {
  if (cameraAltitudeM(_viewer) <= PIN_CEILING_M) return null;
  return sharedMobilityClusterCell(metresPerPixel(_viewer));
}

/** A count as the bubble prints it: « 156 », « 1,2 k ». */
function bubbleCount(n) {
  return n < 1000 ? fr(n) : messages().bubble.thousands(formatDecimal(n / 1000, n < 10_000 ? 1 : 0));
}

/** Put one bubble on screen, or rewrite the one already there. */
function drawBubble(bubble, existing) {
  const position = objectPosition(bubble);
  const text = bubbleCount(bubble.n);
  const segments = sharedMobilityBubbleBar(bubble.operators, BUBBLE_BAR_WIDTH_PX);
  const id = `${BUBBLE_ID_PREFIX}${bubble.id}`;
  const entry = existing || { id: bubble.id, bg: null, label: null, bars: [] };
  entry.lat = bubble.lat;
  entry.lon = bubble.lon;
  entry.n = bubble.n;
  entry.position = position;
  if (!entry.bg) {
    entry.bg = _bubbleSprites.add({
      id,
      position,
      image: BUBBLE_IMAGE,
      width: BUBBLE_WIDTH_PX,
      height: BUBBLE_HEIGHT_PX,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    });
    entry.label = _bubbleLabels.add({
      id,
      position,
      text,
      font: BUBBLE_FONT,
      fillColor: Cesium.Color.WHITE,
      horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
      verticalOrigin: Cesium.VerticalOrigin.CENTER,
      pixelOffset: new Cesium.Cartesian2(0, BUBBLE_TEXT_OFFSET_PX),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    });
  } else {
    entry.bg.position = position;
    entry.label.position = position;
    if (entry.label.text !== text) entry.label.text = text;
  }
  // Segments are few (five at most) and cheap: rewritten whole.
  for (const bar of entry.bars) _bubbleSprites.remove(bar);
  entry.bars = segments.map((segment) => _bubbleSprites.add({
    id,
    position,
    image: BAR_IMAGE,
    width: Math.max(1, segment.w),
    height: BUBBLE_BAR_HEIGHT_PX,
    color: Cesium.Color.fromCssColorString(segment.color),
    horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
    verticalOrigin: Cesium.VerticalOrigin.CENTER,
    pixelOffset: new Cesium.Cartesian2(segment.x - BUBBLE_BAR_WIDTH_PX / 2, BUBBLE_BAR_OFFSET_PX),
    disableDepthTestDistance: Number.POSITIVE_INFINITY,
  }));
  return entry;
}

function removeBubble(entry) {
  if (entry.bg) _bubbleSprites?.remove(entry.bg);
  if (entry.label) _bubbleLabels?.remove(entry.label);
  for (const bar of entry.bars) _bubbleSprites?.remove(bar);
}

/**
 * Re-draw the groups for the view the camera is showing.
 *
 * The groups of the answer are folded through the row's filters, projected,
 * and merged where two would touch — so it runs on every arrival, since a zoom
 * inside one grid step moves the groups closer or apart without a request. A
 * DIFF by id, like the pins: a group that survives keeps its primitives and
 * only rewrites what changed.
 * @returns {number} Bubbles drawn.
 */
function refreshBubbles() {
  const clusters = _lastPayload?.clusters;
  if (!_bubbleSprites || !_bubbleLabels || !Array.isArray(clusters)) {
    clearBubbles();
    return 0;
  }
  const payload = _lastPayload;
  const fleets = foldSharedMobilityClusters(clusters, {
    keep: (system, kind) => (!_kindFilter || familyOfKind(kind) === _kindFilter)
      && (!_operatorFilter || payloadOperator(payload, system).id === _operatorFilter),
    operatorOf: (system) => payloadOperator(payload, system),
  });
  // The docks of the row's other layer join the groups of their cells, and
  // stop drawing themselves — see `mobilityDockBridge.js`. They arrive already
  // under the row's filters, which `bikeshare.js` holds too.
  const box = _viewer ? cameraSharedMobilityBox(_viewer) : null;
  const folded = addDocksToSharedMobilityBubbles(fleets, readMobilityDocks(), payload.clusterDeg, box);
  const scene = _viewer?.scene;
  const projected = [];
  for (const bubble of folded) {
    const screen = scene
      ? _projectToWindow(scene, Cesium.Cartesian3.fromDegrees(bubble.lon, bubble.lat, 0), _scratchWindow)
      : null;
    // Without a screen (a test, a torn-down scene) nothing merges.
    projected.push({ ...bubble, x: screen ? screen.x : bubble.lon * 1e7, y: screen ? screen.y : bubble.lat * 1e7 });
  }
  const merged = mergeSharedMobilityBubbles(projected);
  const next = new Map();
  let total = 0;
  for (const bubble of merged) {
    next.set(bubble.id, drawBubble(bubble, _bubbles.get(bubble.id)));
    total += bubble.n;
  }
  for (const [id, entry] of _bubbles) {
    if (!next.has(id)) removeBubble(entry);
  }
  const appeared = next.size > 0 && _bubbles.size === 0;
  _bubbles = next;
  _bubbleTotal = total;
  // Only now, with the bubbles drawn: the key the signal refreshes reads them.
  setMobilityDocksGrouped(true);
  // The key's note is there only while bubbles are.
  if (appeared) _rowControlsListener?.();
  governorRequestRender('shared-mobility-fr-groups');
  return next.size;
}

function clearBubbles() {
  const had = _bubbles.size > 0;
  _bubbleSprites?.removeAll();
  _bubbleLabels?.removeAll();
  _bubbles = new Map();
  _bubbleTotal = 0;
  // No group counts the docks any more: they draw themselves again.
  setMobilityDocksGrouped(false);
  if (had) _rowControlsListener?.();
}

/** Unsubscribe from the docks' « count again » signal. */
let _unsubscribeDocks = null;

/** The answer's groups, the biggest first — the proxy already sorts them. */
function groupedAnalystClusters() {
  return Array.isArray(_lastPayload?.clusters) ? _lastPayload.clusters : [];
}

/** The bubble a pick landed on, or null. */
function pickedBubble(picked) {
  const id = typeof picked?.id === 'string' ? picked.id : picked?.primitive?.id;
  if (typeof id !== 'string' || !id.startsWith(BUBBLE_ID_PREFIX)) return null;
  return _bubbles.get(id.slice(BUBBLE_ID_PREFIX.length)) || null;
}

/**
 * « Zoomer sur le groupe »: fly to the group, close enough for its cell to
 * split — into finer groups, or into dots and pins below the ceiling — and
 * keep the heading, with the pitch held off the horizon.
 */
function flyToBubble(entry) {
  const camera = _viewer?.camera;
  if (!camera || !entry?.position) return;
  const cellM = (_lastPayload?.clusterDeg || 0.004) * 111_320;
  const range = Math.min(40_000, Math.max(1_500, cellM * 1.5));
  const pitch = Math.min(camera.pitch ?? -Math.PI / 2, Cesium.Math.toRadians(-40));
  camera.flyToBoundingSphere(new Cesium.BoundingSphere(entry.position, 1), {
    offset: new Cesium.HeadingPitchRange(camera.heading, pitch, range),
    duration: 1.2,
  });
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

  clearSelection({ repin: false });
  _points.removeAll();
  if (_pins) _pins.removeAll();
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
      const color = stationColor(object, operator.color);
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
    // Stations are all added above, so every vehicle dot paints over them.
    const point = _points.add({
      id,
      position,
      color: Cesium.Color.fromCssColorString(operator.color),
      pixelSize: VEHICLE_DOT_PX,
      outlineColor: Cesium.Color.fromCssColorString(VEHICLE_DOT_RIM_COLOR),
      outlineWidth: VEHICLE_DOT_RIM_PX,
      scaleByDistance: new Cesium.NearFarScalar(
        VEHICLE_DOT_SCALE.near, VEHICLE_DOT_SCALE.nearValue,
        VEHICLE_DOT_SCALE.far, VEHICLE_DOT_SCALE.farValue,
      ),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      translucencyByDistance: new Cesium.NearFarScalar(500, 1.0, 90_000, 0.3),
    });
    _records.set(id, {
      id, type: 'vehicle', object, system: systemsById.get(object.system) || {},
      operator, point, pin: null, pinRank: sharedMobilityPinRank(id),
      position, baseColor: operator.color, baseSize: VEHICLE_DOT_PX,
    });
  }

  // The groups stand on the ground like the dots, and are grounded with them.
  const groundedClusters = Array.isArray(payload.clusters) ? payload.clusters : [];
  if (groundedClusters.length) {
    const probed = sampleProvisionalFloors(_viewer?.scene, groundedClusters, { fillKm: FLOOR_FILL_KM });
    if (probed.pending) scheduleFloorRetry();
  }
  refreshBubbles();
  _count = _records.size + _bubbleTotal;
  warmGroundFloor([...groundedClusters, ...objects].slice(0, MAX_FLOOR_WARM));
  // Two reasons to come back, and neither of them produces a frame on its own:
  // the tiles under a cell may not have streamed yet, and the DEM warm above
  // is fire-and-forget — nothing repositions what it resolves.
  if (pending || hasColdFloor(objects)) scheduleFloorRetry();
  // `_pinnedIds` still names the last pass's pins, and they are offered
  // first: a poll that brought the same fleet back keeps the same landmarks.
  refreshPins();
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
    // A pin stands on its dot; one left behind would point at the ellipsoid.
    if (record.pin) record.pin.position = next;
    moved += 1;
  }
  for (const entry of _bubbles.values()) {
    const next = objectPosition(entry);
    if (Cesium.Cartesian3.equalsEpsilon(entry.position, next, 0, 0.05)) continue;
    entry.position = next;
    entry.bg.position = next;
    entry.label.position = next;
    for (const bar of entry.bars) bar.position = next;
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
  if (!_enabled || !_viewer || (!_records.size && !_bubbles.size)) return;
  const objects = [];
  for (const record of _records.values()) objects.push(record.object);
  for (const entry of _bubbles.values()) objects.push(entry);
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
  clearSelection({ repin: false });
  resetFloorRetries();
  clearPins();
  clearBubbles();
  if (_points) _points.removeAll();
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
    if (_records.size || _bubbles.size) clearFleet();
    return;
  }
  const box = cameraSharedMobilityBox(_viewer);
  if (!box) {
    _status = 'zoom-in';
    _error = null;
    _loading = false;
    _lastPayload = null;
    if (_records.size || _bubbles.size) clearFleet();
    return;
  }

  // Above the pins' ceiling the proxy is asked for GROUPS on its grid instead
  // of objects — the numbers are then its own, over every vehicle it holds.
  const cluster = clusterCellForView();
  const boxKey = [box.south, box.west, box.north, box.east].map((v) => v.toFixed(3)).join(',')
    + (cluster ? `@${cluster}` : '');
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
    if (cluster) params.set('cluster', String(cluster));
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
  // A zoom or a pan that stays inside the view already read reloads nothing —
  // and it is exactly what moves the vehicles across the screen. So the pins
  // are chosen again here, on arrival, and not only on the load path.
  refreshPins();
  refreshBubbles();
  void loadViewport();
}

/** Deterministic subsample of rendered objects for the detection overlay. */
function collectDetectableObjects(options = {}) {
  if (!_enabled || !_points?.show || !_records.size) return [];
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
  // `weight` is how many vehicles the object stands for: one, or a group's
  // share of one system and kind.
  const visit = (type, object, weight = 1) => {
    if (box && !gbfsBoxContains(box, object?.lat, object?.lon)) return;
    const operator = payloadOperator(payload, object?.system);
    const ownFocus = !_operatorFilter || operator.id === _operatorFilter;
    const ownFamily = matchesKindFilter(_kindFilter, type, object);
    const objectFamilies = type === 'station'
      ? [...stationFamilies(object)]
      : [familyOfKind(object?.kind)].filter(Boolean);
    for (const family of objectFamilies) {
      familiesAll[family] += weight;
      if (ownFocus) families[family] += weight;
    }
    if (ownFamily) {
      const seen = operators.get(operator.id);
      if (seen) seen.count += weight;
      else operators.set(operator.id, { operator, count: weight });
    }
    if (ownFocus && ownFamily) {
      shown += weight;
      if (type === 'station') stations += weight;
    }
  };
  for (const station of Array.isArray(payload?.stations) ? payload.stations : []) visit('station', station);
  for (const vehicle of Array.isArray(payload?.vehicles) ? payload.vehicles : []) visit('vehicle', vehicle);
  // Groups count by their centroid: a group straddling the screen edge is
  // counted whole or not at all, as it is drawn.
  for (const cluster of Array.isArray(payload?.clusters) ? payload.clusters : []) {
    for (const [tag, count] of Object.entries(cluster.by || {})) {
      const cut = tag.lastIndexOf('|');
      visit('vehicle', { lat: cluster.lat, lon: cluster.lon, system: tag.slice(0, cut), kind: tag.slice(cut + 1) }, count);
    }
  }

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
    _pins = new Cesium.BillboardCollection({ scene: viewer.scene });
    _pins.show = false;
    viewer.scene.primitives.add(_pins);
    _bubbleSprites = new Cesium.BillboardCollection({ scene: viewer.scene });
    _bubbleSprites.show = false;
    viewer.scene.primitives.add(_bubbleSprites);
    _bubbleLabels = new Cesium.LabelCollection({ scene: viewer.scene });
    _bubbleLabels.show = false;
    viewer.scene.primitives.add(_bubbleLabels);
    // Registered in this order so a pin paints OVER the dots it stands among,
    // a group's count over its bubble, and all stay inside this layer's slot.
    registerSpriteCollection(SHARED_MOBILITY_FR_LAYER_ID, _points);
    registerSpriteCollection(SHARED_MOBILITY_FR_LAYER_ID, _pins);
    registerSpriteCollection(SHARED_MOBILITY_FR_LAYER_ID, _bubbleSprites);
    registerSpriteCollection(SHARED_MOBILITY_FR_LAYER_ID, _bubbleLabels);
    _pinnedIds = new Set();
    _bubbles = new Map();

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
    _pins.show = true;
    _bubbleSprites.show = true;
    _bubbleLabels.show = true;
    _overlayHost.setVisible(SHARED_MOBILITY_FR_OVERLAY_SOURCE_ID, true);
    installClickHandler(viewer);
    registerPickOwner(SHARED_MOBILITY_FR_LAYER_ID, (pickedId) => _records.has(pickedId)
      || (typeof pickedId === 'string' && pickedId.startsWith(BUBBLE_ID_PREFIX)));
    _unsubscribeDocks?.();
    // New availability or a filter on the docks: the groups count again,
    // from the answer in hand.
    _unsubscribeDocks = onMobilityDocksChanged(() => {
      if (!_enabled || !Array.isArray(_lastPayload?.clusters)) return;
      refreshBubbles();
      _count = _records.size + _bubbleTotal;
    });

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
    _unsubscribeDocks?.();
    _unsubscribeDocks = null;
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
    _pins.show = false;
    _bubbleSprites.show = false;
    _bubbleLabels.show = false;
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
    // While the groups are drawn the answer carries numbers, not vehicles, and
    // the engine counts ROWS: without these it would have said « 20 » over a
    // view of 14,000. One row per counted vehicle, placed at its group's
    // centroid and SAYING so (`grouped`), so a count is right up to the cap and
    // a « nearest » is never read as a parking spot.
    for (const cluster of groupedAnalystClusters()) {
      for (const [tag, count] of Object.entries(cluster.by || {})) {
        const cut = tag.lastIndexOf('|');
        const system = tag.slice(0, cut);
        const kind = tag.slice(cut + 1);
        if (_kindFilter && familyOfKind(kind) !== _kindFilter) continue;
        const operator = payloadOperator(_lastPayload, system);
        if (_operatorFilter && operator.id !== _operatorFilter) continue;
        const systemName = (_lastPayload?.systems || []).find((entry) => entry.id === system)?.name || null;
        for (let i = 0; i < count && out.length < limit; i++) {
          out.push({
            id: `group:${cluster.id}:${tag}:${i}`,
            lat: cluster.lat,
            lon: cluster.lon,
            operator: operator.id === 'unknown' ? null : operator.label,
            system: systemName,
            source: 'GBFS (transport.data.gouv.fr)',
            kind: 'shared-mobility-vehicle',
            vehicleKind: vehicleKindLabel(kind),
            grouped: true,
          });
        }
      }
      if (out.length >= limit) break;
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
      // Only while the groups are drawn: a bubble is the one mark here that
      // does not say what it is, and « 156 » alone could be anything.
      note: _bubbles.size ? messages().legend.groupsNote : undefined,
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
    if (_pins) {
      unregisterSpriteCollection(SHARED_MOBILITY_FR_LAYER_ID, _pins);
      viewer.scene.primitives.remove(_pins);
      _pins = null;
    }
    _pinnedIds = new Set();
    for (const collection of [_bubbleSprites, _bubbleLabels]) {
      if (!collection) continue;
      unregisterSpriteCollection(SHARED_MOBILITY_FR_LAYER_ID, collection);
      viewer.scene.primitives.remove(collection);
    }
    _bubbleSprites = null;
    _bubbleLabels = null;
    _bubbles = new Map();
    _bubbleTotal = 0;
    resetFloorRetries();
    _records.clear();
    _lastPayload = null;
    _rowControlsListener = null;
    _viewer = null;
  },
};

/**
 * Seed rendered records so selection/card/legend/pin paths run without WebGL.
 * `pins` stands in for the billboard collection, `project` for Cesium's
 * world-to-window transform and `chrome` for the overlay host's UI rectangles.
 */
export function _setSharedMobilityStateForTest({ viewer, records, overlayHost, pins, project, chrome, groups, enabled = false }) {
  _viewer = viewer || null;
  _enabled = enabled === true;
  _records = new Map((records || []).map((record) => [record.id, record]));
  _selectedId = null;
  _pinnedIds = new Set();
  _pins = pins || null;
  _bubbleSprites = groups?.sprites || null;
  _bubbleLabels = groups?.labels || null;
  _bubbles = new Map();
  _bubbleTotal = 0;
  _projectToWindow = project || projectToWindow;
  _readChrome = chrome ? () => chrome : worldOverlayUiOcclusionRects;
  _overlayHost = overlayHost || DEFAULT_OVERLAY_HOST;
}

/** Drive the production group pass over the seeded answer. */
export function _refreshSharedMobilityBubblesForTest() {
  refreshBubbles();
  return [..._bubbles.values()].map((entry) => ({ id: entry.id, n: entry.n, text: entry.label.text, bars: entry.bars.length }));
}

/** Drive the production pin pass over the seeded records. */
export function _refreshSharedMobilityPinsForTest() {
  return { drawn: refreshPins(), pinned: [..._pinnedIds] };
}

/** The pin gate and footprint, for tests that pin the mock's rules. */
export function _sharedMobilityPinGeometryForTest() {
  return { ceilingM: PIN_CEILING_M, widthPx: PIN_WIDTH_PX, heightPx: PIN_HEIGHT_PX, tipGapPx: PIN_TIP_GAP_PX };
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
