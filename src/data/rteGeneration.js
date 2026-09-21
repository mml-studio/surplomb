import * as Cesium from 'cesium';
import { governorRequestRender } from '../renderGovernor.js';
import { registerSpriteCollection, restoreSpriteOrder, unregisterSpriteCollection } from './spriteOrder.js';
import { registerPickOwner, unregisterPickOwner } from './pickRegistry.js';
import { askJoin, publishJoin, watchJoin } from './layerJoins.js';
import { PLANT_JOIN_KEYS, edfSiteIdForRteSite } from './plantIdentity.js';
import { cachedGroundFloor, warmGroundFloor } from './groundFloor.js';
import { horizonOccluder } from './iconOrientation.js';
import {
  clearOverlaySource,
  hitTestWorldOverlay,
  setOverlayEntries,
  setOverlaySourceVisible,
} from '../overlays/worldOverlay.js';
import { pickOverlayLabelId } from './overlayLabelPick.js';
import {
  RTE_CLASS_ORDER,
  RTE_GENERATION_CLASSES,
  generationSparkline,
  joinGenerationToRegistry,
  rteClassWords,
  rteGenerationClass,
} from './rteGenerationFeed.js';
import { pickAt } from './pickAt.js';
import { plantMarkGlyph } from './plantFiliereIcons.js';
import { formatDecimal, formatInteger, formatTime } from '../i18n/format.js';
import messages from './rteGeneration.i18n.js';

/**
 * Groupes de prod (FR) — every French power station of 100 MW or more, at the
 * output RTE last published for each of its units.
 *
 * This is the layer the Réseau gaz card points at when it says a station's live
 * output "is the Mix élec layer's `gaz` filière, a national figure that RTE
 * does not break down per station without an API account". This is that
 * account, and this is that breakdown: 171 units across 108 stations, 63.0 GW
 * of it in 57 reactors.
 *
 * ── Two halves, and only one of them needs a key ────────────────────────────
 *
 * The FLEET is a shipped file — `local_data/rte_production_units/units.json`,
 * built from ODRÉ's register by `scripts/build-rte-units-registry.mjs`. Names,
 * installed power, filière, commune, position: all of it draws on `git clone`
 * with no credential at all.
 *
 * The OUTPUT comes from `/api/rte-generation`, which needs a free RTE account.
 * Without one the layer is a complete map of French generating capacity that
 * says, on every card and in the readout, that nobody has told it what these
 * machines are doing. With one, the discs fill.
 *
 * ── The grammar of a station ────────────────────────────────────────────────
 *
 * Every station is a RING sized by its installed power, and the ring is the
 * only thing this layer is ever certain about. Inside it:
 *
 *   faint ring, empty     RTE published nothing for this station in the window
 *                         (or there is no key). NOT the same as "it is off".
 *   crisp ring, empty     measured, and producing zero. A station in outage —
 *                         which for a reactor is the most interesting state it
 *                         has, and the one a `value || 0` guard would erase.
 *   crisp ring + disc     measured and producing; the disc fills the ring at
 *                         full load, on a √ ramp so area tracks power.
 *   magenta disc          measured and DRAWING from the grid. Usually a unit
 *                         that is shut down and still running its own pumps and
 *                         instrumentation — a stopped 1 500 MW reactor is a
 *                         ~50 MW load — and sometimes pumped storage filling
 *                         its upper lake. Not a small amount of generation; the
 *                         opposite of generation.
 *
 * That distinction between "unknown" and "zero" is the whole reason the ring
 * and the disc are two primitives rather than one coloured point.
 *
 * ── In relief, at regional scale ────────────────────────────────────────────
 *
 * Between 70 and 800 km of camera altitude the same grammar stands up: the
 * ring becomes a CAGE, a translucent box as tall as the installed power, and
 * the disc becomes a solid COLUMN inside it, as tall as the output. Height
 * reads more exactly than area — 1 231 of 2 670 MW is a column filling 46 % of
 * its cage, where a disc of 68 % of the ring's diameter says the same thing to
 * nobody — and the scale is one fixed number, `RTE_RELIEF_M_PER_MW`, so every
 * station on screen is read against every other. Every state keeps its
 * meaning: a pale empty cage is unmeasured, a crisp empty cage is stopped, a
 * magenta column is a station drawing from the grid.
 *
 * On top of each cage sits the filière's mark from `plantFiliereIcons.js` —
 * for nuclear, Temaki's cooling tower with the trefoil punched through it,
 * never the bare trefoil, which is a hazard sign — and the station's label
 * hangs off that mark. Closer than 70 km a 36 km column is a wall across the
 * view, and past 800 km it is a needle: both ends fall back to the rings.
 *
 * ── What this layer refuses to do ───────────────────────────────────────────
 *
 * • **It never draws a reactor.** No open source publishes where an individual
 *   reactor building is — OpenStreetMap has zero `generator:source=nuclear`
 *   elements over France. So Gravelines is ONE ring with six groups on its
 *   card, not six discs in a row invented from a site outline.
 *
 * • **It never hides where the ring came from.** RTE publishes no coordinate,
 *   so every position is derived and every card names its own anchor: 69 of
 *   the 108 stations sit on EDF's own published coordinate for its own
 *   station, 11 on an OpenStreetMap `power=plant` outline, 13 on the RTE
 *   switchyard their register entry names, and 15 at the centre of their
 *   commune because nothing better is published — including four offshore wind
 *   farms whose rings are therefore on the beach.
 *
 * • **It never reconciles the two capacities.** RTE's `installed_capacity` and
 *   the register's `puismaxinstallee` are different administrative numbers for
 *   the same machine; when they disagree the card shows both.
 *
 * • **It never quietly drops a unit.** A unit RTE reports that the shipped
 *   register has never heard of is counted in the readout as unplaced, with
 *   its megawatts, because there is nowhere honest to draw it.
 *
 * The upstream traps live in `rteGenerationFeed.js` under test; this module is
 * the drawing.
 */

const LIVE_URL = '/api/rte-generation';
const REGISTRY_URL = new URL(
  './local_data/rte_production_units/units.json',
  import.meta.url,
).href;

/** Layer id — also the share-link registry key and the voice-tool enum value. */
export const RTE_GEN_LAYER_ID = 'rte-generation';
/**
 * Prefix for every render id this layer puts in the scene.
 *
 * A station's registry id is its RTE substation code — `GRAV5`, `BUGEY`,
 * `INSEE:2A004` — which is short, opaque and owned by nobody. Namespacing the
 * render id keeps a pick from ever crossing into another layer's ids, the rule
 * `power-grid:` and `gas-fr:` already follow.
 */
export const RTE_GEN_RENDER_PREFIX = 'rte-gen:';
/** Suffix marking the OUTPUT disc drawn inside a station's capacity ring. */
export const RTE_GEN_OUTPUT_SUFFIX = ':out';

/** Ambient labels: the biggest stations. */
export const RTE_GEN_OVERLAY_SOURCE_ID = 'rte-generation';
/** Selected-object card, on its own protected source. */
export const RTE_GEN_SELECTED_OVERLAY_SOURCE_ID = 'rte-generation-selected';
/** Ambient-label entry-id prefix — the click surface the station's NAME provides. */
export const RTE_GEN_LABEL_PREFIX = 'rte-gen-label:';
/** 108 stations; the label cohort is the handful worth naming at a glance. */
export const RTE_GEN_OVERLAY_COHORT_LIMIT = 14;
/** Shared ambient-label paint budget, matching the sibling French sources. */
export const RTE_GEN_OVERLAY_COLLISION_CAPACITY = 12;

export const RTE_GEN_SELECTED_OVERLAY_SOURCE_OPTIONS = Object.freeze({
  cohortLimit: 1,
  collisionCapacity: 1,
  moving: false,
});

/** The scene id for one station. */
export function rteRenderId(siteId) {
  return `${RTE_GEN_RENDER_PREFIX}${siteId}`;
}

/**
 * Idle refresh cadence.
 *
 * The resource publishes hourly and the proxy holds a 5-minute cache in front
 * of it, so three minutes is already faster than anything can change. It is
 * this short because the interesting event on this layer — a reactor coming
 * back or dropping out — is a step change, and a step change is worth seeing
 * within one poll.
 */
const UPDATE_INTERVAL_MS = 180_000;

const REQUEST_TIMEOUT_MS = 45_000;

/** Stations sit this far above the local ground floor. */
const POINT_LIFT_M = 2.5;

/** Capacity ring: 100 MW → ~12 px, Gravelines' 5 460 MW → 30 px, on a √ ramp. */
const RING_MIN_PX = 9;
const RING_MAX_PX = 30;
const RING_REFERENCE_MW = 5460;

/** A producing station always shows SOMETHING, even at 1% of nameplate. */
const DISC_MIN_PX = 3;

/** Ring outline opacity, measured vs unmeasured. The whole grammar in two numbers. */
const RING_ALPHA_MEASURED = 0.95;
const RING_ALPHA_UNMEASURED = 0.32;
/** Ring fill. Nearly transparent — it is a boundary, not a body. */
const RING_FILL_ALPHA = 0.1;

/** A negative reading is consumption, and gets its own colour rather than a smaller disc. */
export const RTE_PUMPING_COLOR = '#ff4dd2';

const SELECTED_COLOR = '#00ffff';

/**
 * Relief scale: metres of column per megawatt. Fixed, never fitted to the view,
 * so the same station is the same height in every session and every share
 * link. Cruas's 3 660 MW stand 36.6 km tall; Gravelines, the largest, 54.6 km
 * — about a hundred pixels for Cruas from the 180 km the scene link opens at.
 */
export const RTE_RELIEF_M_PER_MW = 10;

/**
 * Camera altitudes between which stations stand as columns. Below 70 km a
 * 36 km column is a wall across the view; above 800 km it is a needle.
 */
export const RTE_RELIEF_MIN_ALT_M = 70_000;
export const RTE_RELIEF_MAX_ALT_M = 800_000;

/** Relative slack on both bounds, so a camera parked on one does not flicker. */
const RELIEF_HYSTERESIS = 0.1;

/** Footprint side of a cage, metres: ~22 px from the scene link's 180 km. */
const CAGE_SIDE_M = 3_600;
const COLUMN_SIDE_RATIO = 0.8;

/** A cage stands on the ground floor, sunk a little so relief never lifts it off. */
const COLUMN_SINK_M = 60;

/** Cage face opacity, measured vs unmeasured — the ring's fill, stood up. */
const CAGE_FACE_ALPHA_MEASURED = 0.14;
const CAGE_FACE_ALPHA_UNMEASURED = 0.04;

/** A mark on a cage is never drawn below the size its punched glyph survives. */
const RELIEF_ICON_MIN_PX = 20;
const RELIEF_ICON_MAX_PX = 34;

/** Suffixes of the relief primitives' pick ids, after the station's render id. */
export const RTE_GEN_COLUMN_SUFFIX = ':col';
export const RTE_GEN_CAGE_SUFFIX = ':cage';
export const RTE_GEN_EDGE_SUFFIX = ':edge';
export const RTE_GEN_ICON_SUFFIX = ':icon';
const RTE_PICK_SUFFIXES = Object.freeze([
  RTE_GEN_OUTPUT_SUFFIX,
  RTE_GEN_COLUMN_SUFFIX,
  RTE_GEN_CAGE_SUFFIX,
  RTE_GEN_EDGE_SUFFIX,
  RTE_GEN_ICON_SUFFIX,
]);

/**
 * The column's fragment shader: a key light fixed to the SCREEN (upper left,
 * towards the reader) instead of the sun, so a column is modelled the same way
 * at noon, at night and on the far side of the planet, and no face goes black.
 */
const COLUMN_FRAGMENT_SHADER = /* glsl */ `
  in vec3 v_positionEC;
  in vec3 v_normalEC;
  in vec4 v_color;

  void main() {
    vec3 normalEC = normalize(v_normalEC);
    vec3 keyLight = normalize(vec3(-0.55, 0.5, 0.67));
    float diffuse = max(dot(normalEC, keyLight), 0.0);
    vec4 color = czm_gammaCorrect(v_color);
    out_FragColor = vec4(color.rgb * (0.42 + 0.7 * diffuse), color.a);
  }
`;

/** Unit rows printed on a station card before the tail is summarised. */
const CARD_UNIT_ROWS = 8;

const DEFAULT_OVERLAY_HOST = Object.freeze({
  setEntries: setOverlayEntries,
  setVisible: setOverlaySourceVisible,
  clearSource: clearOverlaySource,
  hitTest: hitTestWorldOverlay,
});

/**
 * Human caption for each placement anchor, printed on every card.
 *
 * The FRENCH copy, read from the catalog's definition so the two can never
 * drift; what a card prints comes from {@link rtePlacementNote}, in the
 * page's language, when the card is built.
 */
export const RTE_PLACEMENT_NOTES = Object.freeze({
  'edf-published': messages.definition.placement['edf-published'].fr,
  'osm-plant': messages.definition.placement['osm-plant'].fr,
  'rte-switchyard': messages.definition.placement['rte-switchyard'].fr,
  'commune-centre': messages.definition.placement['commune-centre'].fr,
});

/**
 * That caption in the page's language.
 * @param {string|null|undefined} placement
 * @returns {?string} Null for an anchor this build does not know.
 */
export function rtePlacementNote(placement) {
  return messages().placement[String(placement ?? '')] || null;
}

/**
 * Ring diameter for an installed capacity.
 * A station with no published power still draws, at the floor size, so it is
 * present and visibly unquantified rather than absent.
 * @param {?number} mw
 * @returns {number}
 */
export function rteRingSize(mw) {
  if (!Number.isFinite(mw) || mw <= 0) return RING_MIN_PX;
  const ratio = Math.min(1, Math.sqrt(mw / RING_REFERENCE_MW));
  return Math.round(RING_MIN_PX + ratio * (RING_MAX_PX - RING_MIN_PX));
}

/**
 * Disc diameter inside a ring, for a load fraction.
 *
 * √ so the disc's AREA tracks the power, which is what the eye reads. The sign
 * is dropped here and carried by the colour instead: a station pumping at 80%
 * is as big an event as one generating at 80%, and drawing it small would say
 * the opposite.
 * @param {number} ringPx
 * @param {?number} load - Signed output ÷ installed capacity.
 * @returns {number} 0 when there is nothing to draw.
 */
export function rteDiscSize(ringPx, load) {
  if (!Number.isFinite(load) || load === 0) return 0;
  const ratio = Math.min(1, Math.sqrt(Math.abs(load)));
  return Math.max(DISC_MIN_PX, Math.round(ringPx * ratio));
}

/**
 * Whether stations stand as columns at this camera altitude.
 *
 * The band widens by {@link RELIEF_HYSTERESIS} on both sides once it is on,
 * and narrows by as much while it is off, so a camera parked on a bound does
 * not swap cages for rings on every frame of a slow zoom.
 * @param {number} altitudeM Camera height above the ellipsoid.
 * @param {boolean} [wasOn]
 * @returns {boolean}
 */
export function rteReliefWanted(altitudeM, wasOn = false) {
  if (!Number.isFinite(altitudeM)) return false;
  const slack = wasOn ? RELIEF_HYSTERESIS : -RELIEF_HYSTERESIS;
  return altitudeM >= RTE_RELIEF_MIN_ALT_M * (1 - slack)
    && altitudeM <= RTE_RELIEF_MAX_ALT_M * (1 + slack);
}

/**
 * How tall one station's cage and column stand. Pure.
 *
 * The cage is the installed power; a station that publishes none gets the
 * floor of a 100 MW cage, present and visibly unquantified, as its ring gets
 * the floor size. The column is the output's magnitude — the SIGN is carried
 * by the colour, as it is for the disc — and an output above the nameplate is
 * drawn above the cage rather than clipped into it, because the two numbers
 * come from two administrations and this layer never reconciles them.
 * @param {object} site Joined site.
 * @param {number} [mPerMw]
 * @returns {{cageM: number, columnM: number, topM: number, measured: boolean, pumping: boolean}}
 */
export function rteColumnHeights(site, mPerMw = RTE_RELIEF_M_PER_MW) {
  const installed = Number.isFinite(site?.installedMw) && site.installedMw > 0
    ? site.installedMw
    : 100;
  const measured = Number.isFinite(site?.mw);
  const cageM = installed * mPerMw;
  const columnM = measured ? Math.abs(site.mw) * mPerMw : 0;
  return {
    cageM,
    columnM,
    topM: Math.max(cageM, columnM),
    measured,
    pumping: measured && site.mw < 0,
  };
}

/** RTE generation class → the filière a mark in `plantFiliereIcons.js` pictures. */
const FILIERE_BY_CLASS = Object.freeze({
  nuclear: 'nucleaire',
  'hydro-reservoir': 'hydraulique',
  'hydro-run-of-river': 'hydraulique',
  'hydro-pumped': 'hydraulique',
  'fossil-gas': 'thermique',
  'fossil-coal': 'thermique',
  'fossil-oil': 'thermique',
});

/**
 * The filière whose silhouette marks a station of this class, or null for the
 * classes no vetted glyph pictures (wind, solar, marine, battery, biomass),
 * which draw the bare plate in their colour.
 * @param {?string} klass
 * @returns {?string}
 */
export function rteStationFiliere(klass) {
  return FILIERE_BY_CLASS[klass] || null;
}

/** Pixel side of a station's mark on its cage: the ring's ramp, with a floor. */
export function rteReliefIconSize(installedMw) {
  return Math.max(RELIEF_ICON_MIN_PX, Math.min(RELIEF_ICON_MAX_PX, rteRingSize(installedMw) + 4));
}

const STATION_KIND_PREFIX = /^(?:centrale\s+(?:nucl[ée]aire|thermique|hydraulique|hydro[ée]lectrique)|station\s+de\s+pompage|ferme\s+[ée]olienne|parc\s+[ée]olien)\s+/i;

/**
 * The article a register name keeps once its kind is dropped: `de la Coche` →
 * `La Coche`. French because the NAMES are French: they are the register's
 * data, printed as published on a page in either language.
 */
const STATION_ARTICLES = Object.freeze([
  [/^de\s+la\s+/i, 'La '], // i18n-ignore-line — part of a French place name (data).
  [/^de\s+l[’']/i, 'L’'],
  [/^des\s+/i, 'Les '], // i18n-ignore-line — part of a French place name (data).
  [/^du\s+/i, ''],
  [/^de\s+/i, ''],
  [/^d[’']/i, ''],
]);

/**
 * A station's name without the kind of plant it is — `Centrale nucléaire de
 * St-Alban-St-Maurice` → `St-Alban-St-Maurice`, `Station de pompage de la
 * Coche` → `La Coche`.
 *
 * Used where the mark beside the name already says the kind: in relief, the
 * cooling tower on the cage IS « centrale nucléaire », and a label that
 * repeats it pushes the number the reader came for off the end of the line.
 * The card keeps the register's full name.
 * @param {?string} name
 * @returns {string}
 */
export function rteShortName(name) {
  const full = String(name ?? '').trim();
  if (!STATION_KIND_PREFIX.test(full)) return full;
  let rest = full.replace(STATION_KIND_PREFIX, '');
  for (const [pattern, article] of STATION_ARTICLES) {
    if (pattern.test(rest)) {
      rest = article + rest.replace(pattern, '');
      break;
    }
  }
  return rest.trim() || full;
}

/**
 * Format a megawatt figure the way a FRENCH control room writes it.
 *
 * The grouping separator was a COMMA, from `toLocaleString('en-US')`, and on a
 * French card that is not a cosmetic difference: `5,460 MW` reads as five and
 * a half megawatts to the reader this layer is for, off a station that carries
 * five thousand four hundred and sixty. Grouped with a plain space, like
 * `edfPowerPlants.formatMegawatts`, and the decimal of a gigawatt figure is a
 * comma because that is what a decimal separator is here.
 *
 * The minus is U+2212, not a hyphen: this layer prints negative megawatts
 * beside negative percentages and the two have to look like the same sign.
 */
export function formatGenMw(mw) {
  if (!Number.isFinite(mw)) return '—';
  const abs = Math.abs(mw);
  const sign = mw < 0 ? '−' : '';
  if (abs >= 10_000) return `${sign}${formatDecimal(abs / 1000, 1, { minimumFractionDigits: 1 })} GW`;
  // `plainSpaces`: French ICU groups with U+202F on modern versions and U+00A0
  // on older ones, and the overlay measures and wraps a plain space predictably.
  return `${sign}${formatInteger(abs, { plainSpaces: true })} MW`;
}

/** Format a load fraction as a percentage, keeping its sign. */
export function formatLoad(load) {
  if (!Number.isFinite(load)) return '—';
  // French typography puts a no-break space before its `%` and English puts
  // nothing; the catalog carries that difference.
  return `${load < 0 ? '−' : ''}${messages().loadPercent(formatInteger(Math.abs(load) * 100))}`;
}

/**
 * How long ago a published step was, in words.
 * @param {?number} at - Epoch ms of the step's start.
 * @param {number} now
 * @returns {?string}
 */
export function formatPublishedAge(at, now = Date.now()) {
  if (!Number.isFinite(at)) return null;
  const m = messages().age;
  const minutes = Math.round((now - at) / 60_000);
  if (minutes < 0) return m.ahead;
  if (minutes < 90) return m.minutes(formatInteger(minutes));
  const hours = Math.round(minutes / 60);
  if (hours < 36) return m.hours(formatInteger(hours));
  return m.days(formatInteger(Math.round(hours / 24)));
}

/**
 * The clock hour a published step belongs to, in the viewer's own timezone.
 *
 * The TIMEZONE is the reader's — the step happened at one instant and they
 * should see it on their own clock — but the FORMAT is French, because the
 * sentence around it is. Left to the browser's locale it rendered `10:00 AM`
 * in the middle of « mesure de l'heure de… », which is a reader's first clue
 * that a card was assembled out of two languages.
 */
function formatStepClock(at) {
  if (!Number.isFinite(at)) return null;
  try {
    // 24-hour in both languages: a grid timestamp is read against a schedule,
    // and the glossary keeps the 24-hour clock in English for exactly that.
    return formatTime(at, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  } catch {
    return null;
  }
}

/**
 * Card copy for a selected station. Every line is a published value or a
 * statement about where a published value came from.
 *
 * ── IN FRENCH, AND IN WORDS ─────────────────────────────────────────────────
 * This card shipped entirely in English — `69% of nameplate`, `3 of 4 groups
 * reporting`, `drawing from the grid`, `hour of 14:00 · published 25 min ago` —
 * over a globe whose every other French source speaks French, and over a
 * dataset whose subject is French power stations. Half of it was also
 * industry shorthand a reader outside the sector cannot decode: `nameplate` is
 * the maximum a machine is built for, a `group` is one turbine or one reactor,
 * and a NEGATIVE megawatt is the single most surprising thing on this layer.
 *
 * The negative reading gets a sentence rather than a sign, for the same reason
 * `bruitFrance.js` spells out what a zone letter means: a reader who does not
 * already know that a stopped reactor still draws ~50 MW for its own pumps
 * will read a magenta disc as production.
 *
 * @param {object} site - Joined site record.
 * @param {number} [now]
 * @returns {string} Newline-separated card copy.
 */
export function buildRteSelectionLabel(site, now = Date.now()) {
  const m = messages();
  const details = [];
  const installed = Number.isFinite(site?.installedMw) ? site.installedMw : null;

  if (Number.isFinite(site?.mw)) {
    const load = Number.isFinite(site.load) ? m.card.load(formatLoad(site.load)) : '';
    details.push(
      `${site.mw < 0 ? '🔌' : '⚡'} ${formatGenMw(site.mw)}`
      + `${installed ? m.card.installedOf(formatGenMw(installed)) : ''}${load}`,
    );
    if (site.mw < 0) details.push(m.card.pumping);
    const clock = formatStepClock(site.latestAt);
    const age = formatPublishedAge(site.latestAt, now);
    if (clock || age) {
      details.push(m.card.measuredAt(clock || '—', age ? m.card.published(age) : ''));
    }
    if (site.reporting < site.units.length) {
      details.push(m.card.reporting(site.reporting, site.units.length));
    }
    // Where RTE publishes the turbine groups inside a plant the register only
    // carries whole, those groups reached this station by NAME, not by code.
    // That is weaker evidence and the card says so rather than blending it in.
    const byName = site.units.filter((unit) => unit.matchedBy === 'name').length;
    if (byName) details.push(m.card.matchedByName(byName));
  } else {
    details.push(`◌ ${installed
      ? m.card.installedOnly(formatGenMw(installed))
      : m.card.installedUnpublished}`);
    details.push(m.card.noReading);
  }

  details.push(`◈ ${rteClassWords(site?.class).label}`);
  if (site?.commune) {
    details.push(`📍 ${site.commune}${site.departement ? ` · ${site.departement}` : ''}`);
  }
  const note = rtePlacementNote(site?.placement);
  if (note) {
    const km = Number.isFinite(site.anchorKm) && site.anchorKm > 0
      ? m.placementDistance(formatDecimal(site.anchorKm, 1, { minimumFractionDigits: 1 }))
      : '';
    details.push(`◎ ${note}${km}`);
  }

  const units = Array.isArray(site?.units) ? site.units : [];
  if (units.length) {
    details.push(m.card.unitsHeader(units.length));
    for (const unit of units.slice(0, CARD_UNIT_ROWS)) {
      details.push(buildUnitRow(unit));
    }
    if (units.length > CARD_UNIT_ROWS) {
      details.push(m.card.moreUnits(units.length - CARD_UNIT_ROWS));
    }
  }
  return [site?.name || m.card.fallbackName, ...details].join('\n');
}

/**
 * One unit's card row: what it is doing, against what it can do, over the last
 * published day.
 * @param {object} unit
 * @returns {string}
 */
export function buildUnitRow(unit) {
  const m = messages();
  const name = unit?.name || unit?.code || unit?.eic || m.unit.fallbackName;
  const capacity = Number.isFinite(unit?.installedMw) ? unit.installedMw : null;
  if (!Number.isFinite(unit?.mw)) {
    return `${name} · ${capacity ? `${Math.round(capacity)} MW` : '—'} · ${m.unit.noReading}`;
  }
  const spark = generationSparkline(unit.history, capacity);
  const value = `${Math.round(unit.mw)}${capacity ? `/${Math.round(capacity)}` : ''} MW`;
  // Trap 7 surfaced where it matters: RTE and the register disagree about this
  // machine's nameplate, so the card shows both rather than picking one.
  // One whole megawatt is the threshold, not a percentage: the register
  // publishes tenths (a plant split across two groups as 180.4 + 225.6), so
  // anything below a megawatt is the rounding this layer did itself, and
  // anything above it is the two administrations genuinely disagreeing.
  const registry = Number.isFinite(unit?.registryMw)
    && Number.isFinite(capacity)
    && Math.abs(unit.registryMw - capacity) >= 1
      ? m.unit.registry(formatInteger(unit.registryMw))
      : '';
  return `${name} · ${value}${registry}${spark ? `  ${spark}` : ''}`;
}

/**
 * Protected selected-object entry for the shared overlay host.
 * @param {object} record
 * @param {number} [now]
 * @returns {?object}
 */
export function createRteSelectedOverlayEntry(record, now = Date.now()) {
  const position = record?.position;
  if (!record?.id || !position) return null;
  const [title, ...details] = buildRteSelectionLabel(record.site, now).split('\n');
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

/**
 * Ambient label for one station.
 * @param {object} site
 * @param {Cesium.Cartesian3} position
 * @returns {object}
 */
export function createRteStationOverlayEntry(site, position, { relief = false, iconPx = 0 } = {}) {
  const klass = rteGenerationClass(site.class);
  const value = Number.isFinite(site.mw)
    ? `${formatGenMw(site.mw)} / ${formatGenMw(site.installedMw)}`
    : messages().ambient.installed(formatGenMw(site.installedMw));
  return {
    id: `${RTE_GEN_LABEL_PREFIX}${site.id}`,
    position,
    variant: 'label',
    // In relief the mark on the cage names the kind of plant; see `rteShortName`.
    title: `${relief ? rteShortName(site.name) : site.name} · ${value}`,
    accent: Number.isFinite(site.mw) && site.mw < 0 ? RTE_PUMPING_COLOR : klass.color,
    // The biggest machine wins the collision; ties break on id in the selector.
    priority: Math.round(Number.isFinite(site.installedMw) ? site.installedMw : 0),
    collisionGroup: 'ambient-label',
    paintLane: 'ambient-label',
    // The station's name is a click surface, not a caption — see
    // `overlayLabelPick.js` for the mechanism and the pick-ordering rule.
    interactive: true,
    edgeFade: 'keyhole',
    horizonCull: true,
    terrainOcclusion: false,
    // Clear of the station's mark when one stands at the anchor.
    gapPx: relief ? Math.round(iconPx / 2) + 8 : 15,
    verticalOnly: true,
    placement: 'above',
  };
}

/** Keep the largest stations, with stable identity as the tie-break. */
export function selectRteOverlayCohort(entries, limit = RTE_GEN_OVERLAY_COHORT_LIMIT) {
  const cap = Math.max(0, Math.min(
    RTE_GEN_OVERLAY_COHORT_LIMIT,
    Math.floor(Number(limit) || 0),
  ));
  if (!Array.isArray(entries) || cap === 0) return [];
  return entries.slice().sort((a, b) => (
    b.priority - a.priority || String(a.id).localeCompare(String(b.id))
  )).slice(0, cap);
}

/**
 * Map one station to a JSON-safe analyst record. Pure — no Cesium types.
 * @param {object|null|undefined} site
 * @param {number} [index=0]
 * @returns {object}
 */
export function mapRteAnalystRecord(site, index = 0) {
  const str = (value) => {
    const trimmed = String(value ?? '').trim();
    return trimmed || null;
  };
  const num = (value) => (Number.isFinite(value) ? value : null);
  return {
    id: str(site?.id) || `GEN-${String(index).padStart(4, '0')}`,
    name: str(site?.name),
    kind: 'power-station',
    generationClass: str(site?.class),
    lat: num(site?.lat),
    lon: num(site?.lon),
    installedMw: num(site?.installedMw),
    outputMw: num(site?.mw),
    loadFactor: num(site?.load),
    units: Array.isArray(site?.units) ? site.units.length : null,
    unitsReporting: num(site?.reporting),
    commune: str(site?.commune),
    departement: str(site?.departement),
    region: str(site?.region),
    placement: str(site?.placement),
  };
}

/**
 * One filière's sentence: what it makes now against what it could, or — when
 * the filière as a whole is DRAWING from the grid, which is what pumped
 * storage does while it refills its upper lake — what it consumes. A reader
 * with no word for a negative megawatt reads « −644 MW produits » as nonsense.
 * @param {{mw: number, installedMw: number, reporting: number}} bucket
 * @param {object} m The `legend` catalog.
 * @returns {string}
 */
function legendReading(bucket, m) {
  const installed = formatGenMw(bucket.installedMw);
  if (!bucket.reporting) return m.installedOnly(installed);
  if (bucket.mw < 0) return m.consuming(formatGenMw(-bucket.mw), installed);
  return m.measured(formatGenMw(bucket.mw), installed);
}

/**
 * Per-class legend rows for whatever is on screen.
 * @param {Array<object>} sites - Joined sites.
 * @returns {Array<object>}
 */
export function buildRteLegend(sites) {
  const buckets = new Map();
  for (const site of Array.isArray(sites) ? sites : []) {
    const id = site?.class || 'other';
    const bucket = buckets.get(id) || { sites: 0, installedMw: 0, mw: 0, reporting: 0 };
    bucket.sites += 1;
    if (Number.isFinite(site.installedMw)) bucket.installedMw += site.installedMw;
    if (Number.isFinite(site.mw)) { bucket.mw += site.mw; bucket.reporting += 1; }
    buckets.set(id, bucket);
  }
  const legend = [];
  for (const id of RTE_CLASS_ORDER) {
    const bucket = buckets.get(id);
    if (!bucket) continue;
    const klass = RTE_GENERATION_CLASSES[id];
    const words = rteClassWords(id);
    const m = messages().legend;
    // Plain words: what this filière is making now, against what it could. The
    // filière's own paragraph and the station count are the card's business.
    legend.push({
      label: words.label,
      color: klass.color,
      blurb: legendReading(bucket, m),
    });
  }
  return legend;
}

// --- Module state -----------------------------------------------------------

let _viewer = null;
let _rings = null;
let _discs = null;
/** The marks that stand on the cages in relief. */
let _icons = null;
/** @type {?{cages: ?Cesium.Primitive, edges: ?Cesium.Primitive, columns: ?Cesium.Primitive}} */
let _relief = null;
/** Whether stations stand as columns right now — see `rteReliefWanted`. */
let _reliefOn = false;
let _overlayHost = DEFAULT_OVERLAY_HOST;
let _enabled = false;
let _clickHandler = null;
let _preRenderRemover = null;

/** @type {Map<string, object>} render id → record. */
let _records = new Map();
/** @type {?string} */
let _selectedId = null;

/** @type {?object} Shipped registry document. */
let _registry = null;
/** @type {?Promise<?object>} */
let _registryPromise = null;
/** @type {Array<object>} Joined stations, most installed power first. */
let _sites = [];
/** Take-down for the per-EIC offer. Null while nothing is offered. */
let _unpublishFleet = null;
/** Take-down for the reverse (EDF site → this station) offer. */
let _unpublishRteByEdf = null;
/** Stop following EDF's own offer. Null while this layer is off. */
let _unwatchEdf = null;
/** @type {Array<object>} Live units RTE reports that the registry cannot place. */
let _unplaced = [];

let _loading = false;
let _error = null;
let _status = 'idle';
let _auth = 'unknown';
let _authDetail = null;
let _lastUpdate = null;
let _liveStats = null;
let _joinStats = null;
let _window = null;
let _source = null;

function sitePosition(site) {
  const floor = cachedGroundFloor(site.lat, site.lon);
  const height = (Number.isFinite(floor) ? floor : 0) + POINT_LIFT_M;
  return Cesium.Cartesian3.fromDegrees(site.lon, site.lat, height);
}

/** Ring and disc colours for one joined station. */
function stationStyle(site) {
  const klass = rteGenerationClass(site.class);
  const base = Cesium.Color.fromCssColorString(klass.color);
  const measured = Number.isFinite(site.mw);
  return {
    ringOutline: base.withAlpha(measured ? RING_ALPHA_MEASURED : RING_ALPHA_UNMEASURED),
    ringFill: base.withAlpha(measured ? RING_FILL_ALPHA : RING_FILL_ALPHA * 0.5),
    disc: site.mw < 0 ? Cesium.Color.fromCssColorString(RTE_PUMPING_COLOR) : base,
  };
}

/**
 * Replace the drawn stations with a freshly joined fleet.
 *
 * The registry never changes within a session, so the collections are rebuilt
 * rather than diffed: 108 stations is two `removeAll` calls and 216 adds, far
 * below the cost of tracking which reactor changed.
 */
/**
 * Offer this fleet's sites by EIC, and stand down where EDF already draws one.
 *
 * TWO DIRECTIONS AT ONCE, because this register is the middle of the chain.
 * It ASKS `plants/edf` — 69 of its 108 sites were placed on an EDF coordinate
 * and record which one — and it OFFERS `plants/eic`, which is how the hydro
 * register finds out that a plant it holds is one of these stations, and
 * through `edfSiteId` that it is an EDF site too. `plantIdentity.js` holds
 * both keys and the reason neither is a distance test.
 */
function publishFleetJoin() {
  if (!_enabled || !_sites.length) {
    _unpublishFleet?.();
    _unpublishFleet = null;
    _unpublishRteByEdf?.();
    _unpublishRteByEdf = null;
    return;
  }
  const byEic = new Map();
  const byEdfSite = new Map();
  for (const site of _sites) {
    const edfSiteId = edfSiteIdForRteSite(site);
    if (edfSiteId) {
      byEdfSite.set(edfSiteId, {
        name: site.name, mw: site.mw, units: (site.units || []).length,
      });
    }
    for (const unit of site.units || []) {
      const eic = String(unit?.eic ?? unit ?? '').trim();
      if (!eic) continue;
      byEic.set(eic, {
        siteId: site.id, name: site.name, mw: site.mw, edfSiteId,
      });
    }
  }
  _unpublishFleet?.();
  _unpublishRteByEdf?.();
  _unpublishFleet = publishJoin(PLANT_JOIN_KEYS.eic, (eic) => byEic.get(String(eic || '').trim()) || null);
  _unpublishRteByEdf = publishJoin(
    PLANT_JOIN_KEYS.rteByEdf,
    (edfSiteId) => byEdfSite.get(String(edfSiteId || '').trim()) || null,
  );
}

/**
 * The EDF site this station is, when EDF is drawing it.
 *
 * `null` for the 39 stations EDF's fleet does not contain, and `null` for all
 * 108 while that row is off — which is what makes the withdrawal reversible
 * without this layer holding any state about it.
 *
 * @param {object} site An RTE pack site.
 * @returns {?{name: string, mw: number}}
 */
function edfDrawingThisSite(site) {
  const edfSiteId = edfSiteIdForRteSite(site);
  return edfSiteId ? askJoin(PLANT_JOIN_KEYS.edf, edfSiteId) : null;
}

function buildStations(sites) {
  if (!_rings || !_discs) return;
  const previouslySelected = _selectedId;
  clearSelection();
  _rings.removeAll();
  _discs.removeAll();
  _records.clear();

  const warm = [];
  for (const site of sites) {
    if (!Number.isFinite(site?.lat) || !Number.isFinite(site?.lon)) continue;
    // ONE MARK PER SITE. 69 of these 108 stations were placed on an EDF
    // coordinate and EDF is the row's primary, so while that row is drawing
    // them this one does not — the record stays in `_sites`, the counts stay
    // true, and the mark comes back the moment EDF goes off.
    if (edfDrawingThisSite(site)) continue;
    const position = sitePosition(site);
    const style = stationStyle(site);
    const ringPx = rteRingSize(site.installedMw);
    const renderId = rteRenderId(site.id);
    const ring = _rings.add({
      id: renderId,
      position,
      color: style.ringFill,
      pixelSize: ringPx,
      outlineColor: style.ringOutline,
      outlineWidth: 1.6,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    });
    const discPx = rteDiscSize(ringPx, site.load);
    // A station with nothing to draw inside its ring gets NO disc primitive at
    // all rather than a zero-sized one: a 0 px point still costs a draw slot,
    // and half the fleet is idle most of the time.
    const disc = discPx > 0
      ? _discs.add({
        id: `${renderId}${RTE_GEN_OUTPUT_SUFFIX}`,
        position,
        color: style.disc,
        pixelSize: discPx,
        outlineWidth: 0,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      })
      : null;
    _records.set(renderId, {
      id: renderId,
      siteId: site.id,
      site,
      position,
      ring,
      disc,
      baseRingColor: style.ringFill,
      baseRingOutline: style.ringOutline,
      baseRingSize: ringPx,
    });
    warm.push({ lat: site.lat, lon: site.lon });
  }
  _sites = sites;
  buildRelief();
  publishFleetJoin();
  warmGroundFloor(warm.slice(0, 300));
  if (previouslySelected && _records.has(previouslySelected)) selectObject(previouslySelected);
  publishOverlay();
}

function removeRelief() {
  for (const primitive of Object.values(_relief || {})) {
    if (primitive) _viewer?.scene?.primitives?.remove?.(primitive);
  }
  _relief = null;
  _icons?.removeAll();
  for (const record of _records.values()) {
    record.icon = null;
    record.top = null;
  }
}

/**
 * Stand every drawn station up as a cage and a column, with its mark on top.
 *
 * Three batched primitives for the whole fleet — translucent cage faces, cage
 * edges, solid columns — built SYNCHRONOUSLY: a hundred boxes are a few
 * milliseconds of main-thread work, and a synchronous build swaps in on the
 * frame it is asked for, where a worker build would leave a poll's worth of
 * frames with no relief at all. Rebuilt with the stations, never per frame.
 */
function buildRelief() {
  removeRelief();
  const scene = _viewer?.scene;
  if (!scene?.primitives || !_records.size) return;
  const cages = [];
  const edges = [];
  const columns = [];
  const side = CAGE_SIDE_M;
  for (const record of _records.values()) {
    const site = record.site;
    const heights = rteColumnHeights(site);
    const base = Cesium.Color.fromCssColorString(rteGenerationClass(site.class).color);
    const floor = cachedGroundFloor(site.lat, site.lon);
    const ground = Cesium.Cartesian3.fromDegrees(
      site.lon,
      site.lat,
      (Number.isFinite(floor) ? floor : 0) - COLUMN_SINK_M,
    );
    const frame = Cesium.Transforms.eastNorthUpToFixedFrame(ground);
    const standing = (heightM) => Cesium.Matrix4.multiplyByTranslation(
      frame,
      new Cesium.Cartesian3(0, 0, heightM / 2),
      new Cesium.Matrix4(),
    );
    const cageHeight = heights.cageM + COLUMN_SINK_M;
    const edgeColor = base.withAlpha(heights.measured ? RING_ALPHA_MEASURED : RING_ALPHA_UNMEASURED);
    cages.push(new Cesium.GeometryInstance({
      id: `${record.id}${RTE_GEN_CAGE_SUFFIX}`,
      geometry: Cesium.BoxGeometry.fromDimensions({
        dimensions: new Cesium.Cartesian3(side, side, cageHeight),
        vertexFormat: Cesium.PerInstanceColorAppearance.FLAT_VERTEX_FORMAT,
      }),
      modelMatrix: standing(cageHeight),
      attributes: {
        color: Cesium.ColorGeometryInstanceAttribute.fromColor(base.withAlpha(
          heights.measured ? CAGE_FACE_ALPHA_MEASURED : CAGE_FACE_ALPHA_UNMEASURED,
        )),
      },
    }));
    edges.push(new Cesium.GeometryInstance({
      id: `${record.id}${RTE_GEN_EDGE_SUFFIX}`,
      geometry: Cesium.BoxOutlineGeometry.fromDimensions({
        dimensions: new Cesium.Cartesian3(side, side, cageHeight),
      }),
      modelMatrix: standing(cageHeight),
      attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(edgeColor) },
    }));
    // No output, no column — not a zero-height one: the empty cage IS the
    // reading, crisp when measured at zero, pale when never measured.
    if (heights.columnM > 0) {
      const columnHeight = heights.columnM + COLUMN_SINK_M;
      const color = heights.pumping ? Cesium.Color.fromCssColorString(RTE_PUMPING_COLOR) : base;
      columns.push(new Cesium.GeometryInstance({
        id: `${record.id}${RTE_GEN_COLUMN_SUFFIX}`,
        geometry: Cesium.BoxGeometry.fromDimensions({
          dimensions: new Cesium.Cartesian3(side * COLUMN_SIDE_RATIO, side * COLUMN_SIDE_RATIO, columnHeight),
          vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
        }),
        modelMatrix: standing(columnHeight),
        attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(color) },
      }));
    }
    record.top = Cesium.Matrix4.multiplyByPoint(
      frame,
      new Cesium.Cartesian3(0, 0, heights.topM + COLUMN_SINK_M),
      new Cesium.Cartesian3(),
    );
    record.heights = heights;
    record.baseEdgeColor = edgeColor;
    const iconPx = rteReliefIconSize(site.installedMw);
    record.iconPx = iconPx;
    record.icon = _icons?.add({
      id: `${record.id}${RTE_GEN_ICON_SUFFIX}`,
      position: record.top,
      image: plantMarkGlyph(rteStationFiliere(site.class), iconPx),
      width: iconPx,
      height: iconPx,
      // The plate is white, so it takes the class colour exactly; the punched
      // silhouette shows the black ring behind it — see `plantFiliereIcons.js`.
      color: base,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    }) || null;
  }
  const add = (instances, appearance) => (instances.length
    ? scene.primitives.add(new Cesium.Primitive({
      geometryInstances: instances,
      appearance,
      asynchronous: false,
      show: false,
    }))
    : null);
  _relief = {
    columns: add(columns, new Cesium.PerInstanceColorAppearance({
      closed: true,
      translucent: false,
      fragmentShaderSource: COLUMN_FRAGMENT_SHADER,
    })),
    cages: add(cages, new Cesium.PerInstanceColorAppearance({ flat: true, translucent: true, closed: true })),
    edges: add(edges, new Cesium.PerInstanceColorAppearance({ flat: true, translucent: true })),
  };
  syncReliefVisibility();
}

/**
 * The stations whose mark is on screen now, for the key.
 *
 * The key names the filières the reader can SEE: over the Rhône valley that is
 * nuclear and hydro, and a list of nine national rows — coal, oil, biomass —
 * was a key to a map somewhere else. The shell repaints the key on every
 * camera stop, so the list follows the view. With no scene to project into (a
 * unit test, a layer not yet drawn) every station counts, as before.
 * @returns {Array<object>}
 */
function sitesOnScreen() {
  const scene = _viewer?.scene;
  const canvas = scene?.canvas;
  const camera = _viewer?.camera;
  if (!scene || !canvas || !camera || !_records.size) return _sites;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!(width > 0) || !(height > 0)) return _sites;
  const occluder = horizonOccluder(camera);
  const onScreen = [];
  for (const record of _records.values()) {
    const anchor = anchorOf(record);
    if (!anchor || !occluder.isPointVisible(anchor)) continue;
    const at = Cesium.SceneTransforms.worldToWindowCoordinates(scene, anchor, SCRATCH_WINDOW);
    if (!at || at.x < 0 || at.y < 0 || at.x > width || at.y > height) continue;
    onScreen.push(record.site);
  }
  return onScreen;
}

const SCRATCH_WINDOW = new Cesium.Cartesian2();

/**
 * Ask the shell to repaint the key: its first row reads « disc » or « column »
 * after the shape on screen, and this layer's own repaint is its three-minute
 * poll away. The event name is the literal `addressScanLayer.js` exports as
 * `LAYER_DRAW_CHANGED_EVENT`; importing it would pull that module in for a
 * string, and `rteGenerationRelief.test.mjs` fails if the two drift apart.
 */
function announceDrawChanged() {
  if (typeof window === 'undefined' || typeof CustomEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent('gev:layer-draw-changed', {
    detail: { layerId: RTE_GEN_LAYER_ID, relief: _reliefOn },
  }));
}

/** Rings or columns, whichever the camera's altitude calls for. */
function syncReliefVisibility() {
  const rings = _enabled && !_reliefOn;
  const relief = _enabled && _reliefOn;
  if (_rings) _rings.show = rings;
  if (_discs) _discs.show = rings;
  if (_icons) _icons.show = relief;
  for (const primitive of Object.values(_relief || {})) {
    if (primitive) primitive.show = relief;
  }
}

/** Where a station's label and card hang: the top of its cage in relief. */
function anchorOf(record) {
  return (_reliefOn && record?.top) || record?.position || null;
}

/** Recolour one cage's edges without rebuilding the batch. */
function setEdgeColor(record, color) {
  const edges = _relief?.edges;
  if (!edges || !record || !color) return;
  try {
    const attributes = edges.getGeometryInstanceAttributes(`${record.id}${RTE_GEN_EDGE_SUFFIX}`);
    if (attributes) attributes.color = Cesium.ColorGeometryInstanceAttribute.toValue(color, attributes.color);
  } catch {
    // Not yet updated once: the next build carries the base colour anyway.
  }
}

/** Ambient labels: the biggest stations. 108 labels is not a map. */
function publishOverlay() {
  if (!_enabled) {
    _overlayHost.clearSource(RTE_GEN_OVERLAY_SOURCE_ID);
    return;
  }
  const entries = [];
  for (const site of _sites) {
    const record = _records.get(rteRenderId(site.id));
    const anchor = anchorOf(record);
    if (!anchor) continue;
    entries.push(createRteStationOverlayEntry(site, anchor, {
      relief: _reliefOn,
      iconPx: _reliefOn ? record.iconPx || 0 : 0,
    }));
  }
  _overlayHost.setEntries(
    RTE_GEN_OVERLAY_SOURCE_ID,
    selectRteOverlayCohort(entries),
    {
      cohortLimit: RTE_GEN_OVERLAY_COHORT_LIMIT,
      collisionCapacity: RTE_GEN_OVERLAY_COLLISION_CAPACITY,
      moving: false,
    },
  );
}

function restoreRecordStyle(record) {
  if (!record) return;
  setEdgeColor(record, record.baseEdgeColor);
  if (record.icon) {
    record.icon.width = record.iconPx;
    record.icon.height = record.iconPx;
  }
  if (!record.ring) return;
  record.ring.color = record.baseRingColor;
  record.ring.outlineColor = record.baseRingOutline;
  record.ring.pixelSize = record.baseRingSize;
}

function clearSelection() {
  if (_selectedId) restoreRecordStyle(_records.get(_selectedId));
  _selectedId = null;
  _overlayHost.clearSource(RTE_GEN_SELECTED_OVERLAY_SOURCE_ID);
}

function selectObject(id) {
  clearSelection();
  const record = _records.get(id);
  if (!record) return;
  _selectedId = id;
  const selected = Cesium.Color.fromCssColorString(SELECTED_COLOR);
  if (record.ring) {
    record.ring.outlineColor = selected;
    record.ring.color = selected.withAlpha(RING_FILL_ALPHA);
    record.ring.pixelSize = record.baseRingSize + 6;
  }
  setEdgeColor(record, selected);
  if (record.icon) {
    record.icon.width = record.iconPx + 6;
    record.icon.height = record.iconPx + 6;
  }
  const entry = createRteSelectedOverlayEntry({ ...record, position: anchorOf(record) });
  if (entry) {
    _overlayHost.setEntries(
      RTE_GEN_SELECTED_OVERLAY_SOURCE_ID,
      [entry],
      RTE_GEN_SELECTED_OVERLAY_SOURCE_OPTIONS,
    );
  }
  governorRequestRender('rte-generation-select');
}

function onKeyDown(event) {
  if (event.key === 'Escape' && _selectedId) clearSelection();
}

/**
 * Resolve a Cesium pick into one of this layer's station ids.
 *
 * The output disc carries the station id with an `:out` suffix so it can be
 * told apart in the collection; clicking it selects the STATION, because the
 * disc is not a separate object, it is the same station's reading.
 */
export function resolveRtePickId(picked, has = (id) => _records.has(id)) {
  const candidate = (value) => {
    if (typeof value !== 'string' || !value.startsWith(RTE_GEN_RENDER_PREFIX)) return null;
    if (has(value)) return value;
    const suffix = RTE_PICK_SUFFIXES.find((candidateSuffix) => value.endsWith(candidateSuffix));
    const station = suffix ? value.slice(0, -suffix.length) : null;
    return station && has(station) ? station : null;
  };
  if (!picked) return null;
  return candidate(picked.primitive?.id)
    || candidate(picked.id)
    || candidate(picked.id?.id)
    || null;
}

function installClickHandler(viewer) {
  if (_clickHandler) return;
  _clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  _clickHandler.setInputAction((click) => {
    const id = resolveRtePickId(pickAt(viewer.scene, click.position));
    if (id) { selectObject(id); return; }
    // The label plane the depth buffer knows nothing about, resolved after the
    // native pick so a name drawn across a neighbouring site cannot steal it.
    const labelled = pickOverlayLabelId(click.position, {
      sourceId: RTE_GEN_OVERLAY_SOURCE_ID,
      prefix: RTE_GEN_LABEL_PREFIX,
      has: (recordId) => _records.has(recordId),
      hitTest: _overlayHost.hitTest,
    });
    if (labelled) { selectObject(labelled); return; }
    if (_selectedId) clearSelection();
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  if (typeof document !== 'undefined') document.addEventListener('keydown', onKeyDown);
}

/**
 * Per-frame horizon pass.
 *
 * Points draw with depth testing disabled so a station is not swallowed by the
 * terrain it sits on, which also means one on the far side of the planet would
 * paint straight through the globe. Nothing here animates between polls, so
 * this is the layer's only per-frame work.
 */
function onPreRender() {
  if (!_enabled || !_records.size) return;
  const camera = _viewer?.camera;
  if (!camera) return;
  const relief = rteReliefWanted(camera.positionCartographic?.height, _reliefOn);
  if (relief !== _reliefOn) {
    _reliefOn = relief;
    syncReliefVisibility();
    // The labels and the card move between the ground and the cage tops.
    publishOverlay();
    if (_selectedId) selectObject(_selectedId);
    announceDrawChanged();
  }
  const occluder = horizonOccluder(camera);
  for (const record of _records.values()) {
    const visible = occluder.isPointVisible(record.position);
    if (record.ring) record.ring.show = visible;
    if (record.disc) record.disc.show = visible;
    if (record.icon) record.icon.show = visible;
  }
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Load the shipped fleet once per session.
 *
 * A failed load nulls the promise so the next refresh retries rather than
 * leaving the layer permanently empty — and without this file there is nothing
 * to draw at all, because RTE publishes no coordinates.
 */
function ensureRegistry() {
  if (_registryPromise) return _registryPromise;
  _registryPromise = fetchJson(REGISTRY_URL)
    .then((payload) => {
      if (!Array.isArray(payload?.sites) || !Array.isArray(payload?.units)) {
        throw new Error('malformed unit registry');
      }
      _registry = payload;
      return payload;
    })
    .catch((error) => {
      _registryPromise = null;
      throw error;
    });
  return _registryPromise;
}

async function load() {
  _loading = true;
  try {
    const [registry, live] = await Promise.allSettled([
      ensureRegistry(),
      fetchJson(LIVE_URL),
    ]);
    if (registry.status === 'rejected') {
      console.warn('[Data:RTE Gen] unit registry unavailable:', registry.reason?.message || registry.reason);
      _error = 'unit registry unavailable';
      _status = 'error';
      return false;
    }

    // The fleet draws with or without RTE. A rejected live half is a missing
    // NUMBER, not a missing map, and must not blank 93.5 GW of stations.
    let units = [];
    if (live.status === 'fulfilled') {
      _auth = live.value?.auth || 'unknown';
      _authDetail = live.value?.authDetail || null;
      _liveStats = live.value?.stats || null;
      _window = live.value?.window || null;
      _source = live.value?.source || _source;
      units = Array.isArray(live.value?.units) ? live.value.units : [];
    } else {
      console.warn('[Data:RTE Gen] live output unavailable:', live.reason?.message || live.reason);
      _auth = 'failed';
      _authDetail = live.reason?.message || String(live.reason);
      _liveStats = null;
    }

    const joined = joinGenerationToRegistry(registry.value, units);
    _joinStats = joined.stats;
    _unplaced = joined.unplaced;
    buildStations(joined.sites.slice().sort((a, b) => (
      (b.installedMw || 0) - (a.installedMw || 0) || a.id.localeCompare(b.id)
    )));

    _error = generationErrorFor(_auth);
    _status = 'ready';
    _lastUpdate = Date.now();
    governorRequestRender('rte-generation-load');
    console.log(
      `[Data:RTE Gen] ${_sites.length} stations, `
      + `${joined.stats.placedUnits}/${registry.value.units.length} units reporting, `
      + `${formatGenMw(joined.stats.placedMw)}`
      + (joined.stats.unplacedUnits
        ? `, ${joined.stats.unplacedUnits} unplaced (${formatGenMw(joined.stats.unplacedMw)})`
        : ''),
    );
    return true;
  } catch (error) {
    console.warn('[Data:RTE Gen] load error:', error);
    _error = 'RTE generation error';
    _status = 'error';
    return false;
  } finally {
    _loading = false;
  }
}

/** Deterministic subsample of drawn stations for the detection overlay. */
function collectDetectableObjects(options = {}) {
  if (!_enabled) return [];
  const stations = [];
  for (const record of _records.values()) {
    const shown = _reliefOn ? record.icon?.show : record.ring?.show;
    if (!shown && record.id !== _selectedId) continue;
    stations.push(record);
  }
  if (!stations.length) return [];

  const maxCount = Number.isFinite(options.maxCount)
    ? Math.max(1, Math.floor(options.maxCount))
    : stations.length;
  const seed = Number.isFinite(options.seed) ? Math.floor(options.seed) : 0;
  const stride = Math.max(1, Math.ceil(stations.length / maxCount));
  const start = ((seed % stride) + stride) % stride;

  const result = [];
  for (let i = start; i < stations.length; i += stride) {
    const record = stations[i];
    result.push({
      position: anchorOf(record),
      sourceId: record.id,
      // i18n-ignore-next-line — a synthetic id for the detection rail, not a label.
      id: String(record.site?.name || 'CENTRALE').toUpperCase().slice(0, 24),
      type: detectionTypeFor(record.site?.class),
      skipLabel: record.id === _selectedId,
    });
    if (result.length >= maxCount) break;
  }
  return result;
}

/**
 * The error string for one auth outcome, or null.
 *
 * Having no RTE credential is a documented MODE, not an error: it is the state
 * every reader who has not made an account is in, and the layer is complete in
 * it — 108 stations, 93.5 GW, every name and filière. Reporting it as an error
 * would put a red readout in front of someone whose globe is working. Only a
 * credential that exists and does not work, or an upstream that refused, is a
 * failure.
 * @param {string} auth - `ok`, `missing`, `failed` or `unknown`.
 * @returns {?string}
 */
export function generationErrorFor(auth) {
  if (auth === 'ok' || auth === 'missing') return null;
  return messages().row.error;
}

/** Three-letter detection tag per class. */
export function detectionTypeFor(klass) {
  if (klass === 'nuclear') return 'NUC';
  if (typeof klass === 'string' && klass.startsWith('hydro')) return 'HYD';
  if (klass === 'fossil-gas') return 'GAZ';
  if (klass === 'fossil-coal') return 'CHA';
  if (klass === 'fossil-oil') return 'FIO';
  if (klass === 'wind') return 'EOL';
  if (klass === 'solar') return 'PV';
  if (klass === 'battery') return 'BAT';
  if (klass === 'marine') return 'MAR';
  if (klass === 'biomass') return 'BIO';
  return 'GEN';
}

function buildLoadingLabel() {
  const m = messages().row;
  if (_loading && !_registry) return m.loadingRegistry;
  if (_loading) return m.refreshing;
  if (_status === 'error') return _error || m.unavailable;
  const parts = [];
  // WHAT IS DRAWN, and what stood down. `_sites.length` is what the register
  // holds; while EDF is drawing 69 of these stations the map shows fewer, and
  // a row that printed the register count would describe a map that is not on
  // screen. See `plantIdentity.js`.
  const deferred = Math.max(0, _sites.length - _records.size);
  if (_records.size) parts.push(m.plants(_records.size));
  if (deferred) parts.push(m.deferred(deferred));
  if (_joinStats?.placedUnits) {
    parts.push(m.units(_joinStats.placedUnits, formatGenMw(_joinStats.placedMw)));
  } else if (_auth === 'missing') {
    parts.push(m.keyless);
  }
  if (_joinStats?.unplacedUnits) parts.push(m.unplaced(_joinStats.unplacedUnits));
  return parts.join(' · ');
}

/** Groupes de prod (FR) layer. @type {Object} */
const rteGenerationLayer = {
  id: RTE_GEN_LAYER_ID,
  // i18n-ignore-start — registry fields, not copy: see src/data/layerTaxonomy.i18n.js.
  name: 'Groupes de prod (FR)',
  icon: '☢',
  source: 'RTE · ODRÉ · EDF · OpenStreetMap',
  // i18n-ignore-end
  updateInterval: UPDATE_INTERVAL_MS,

  init(viewer) {
    _viewer = viewer;
    _rings = new Cesium.PointPrimitiveCollection({ blendOption: Cesium.BlendOption.TRANSLUCENT });
    _rings.show = false;
    viewer.scene.primitives.add(_rings);
    registerSpriteCollection(RTE_GEN_LAYER_ID, _rings);

    // Registered second so the output disc always paints ABOVE its own ring.
    _discs = new Cesium.PointPrimitiveCollection({ blendOption: Cesium.BlendOption.TRANSLUCENT });
    _discs.show = false;
    viewer.scene.primitives.add(_discs);
    registerSpriteCollection(RTE_GEN_LAYER_ID, _discs);

    _icons = new Cesium.BillboardCollection({ scene: viewer.scene });
    _icons.show = false;
    viewer.scene.primitives.add(_icons);
    registerSpriteCollection(RTE_GEN_LAYER_ID, _icons);
    _relief = null;
    _reliefOn = false;

    _enabled = false;
    _records = new Map();
    _sites = [];
    _unplaced = [];
    _selectedId = null;
    _registry = null;
    _registryPromise = null;
    _loading = false;
    _error = null;
    _status = 'idle';
    _auth = 'unknown';
    _authDetail = null;
    _lastUpdate = null;
    _liveStats = null;
    _joinStats = null;
    _window = null;
    _source = null;

    _overlayHost.setVisible(RTE_GEN_OVERLAY_SOURCE_ID, false);
    _overlayHost.setVisible(RTE_GEN_SELECTED_OVERLAY_SOURCE_ID, false);
    restoreSpriteOrder(viewer);
    console.log('[Data:RTE Gen] Initialized');
  },

  enable(viewer) {
    _enabled = true;
    _error = null;
    _reliefOn = rteReliefWanted(viewer?.camera?.positionCartographic?.height, false);
    syncReliefVisibility();
    _overlayHost.setVisible(RTE_GEN_OVERLAY_SOURCE_ID, true);
    _overlayHost.setVisible(RTE_GEN_SELECTED_OVERLAY_SOURCE_ID, true);
    installClickHandler(viewer);
    registerPickOwner(RTE_GEN_LAYER_ID, (pickedId) => (
      resolveRtePickId({ primitive: { id: pickedId } }) !== null
    ));
    if (!_preRenderRemover) {
      _preRenderRemover = viewer.scene.preRender.addEventListener(onPreRender);
    }
    // EDF coming on or going off changes which of these stations are drawn,
    // and waiting out this layer's own poll would leave the duplicate on
    // screen. Same push `amenities-fr` uses for the médecin family.
    _unwatchEdf?.();
    _unwatchEdf = watchJoin(PLANT_JOIN_KEYS.edf, () => {
      if (_enabled && _sites.length) buildStations(_sites);
    });
    publishOverlay();
    // Same reason as `sitadelFrance`: a row switched off and on again may get
    // no fresh answer, and the offer must not stay down under a fleet already
    // in memory.
    publishFleetJoin();
    void load();
    restoreSpriteOrder(viewer);
  },

  disable() {
    _enabled = false;
    _unwatchEdf?.();
    _unwatchEdf = null;
    publishFleetJoin();
    clearSelection();
    syncReliefVisibility();
    _overlayHost.clearSource(RTE_GEN_OVERLAY_SOURCE_ID);
    _overlayHost.setVisible(RTE_GEN_OVERLAY_SOURCE_ID, false);
    _overlayHost.setVisible(RTE_GEN_SELECTED_OVERLAY_SOURCE_ID, false);
    if (_clickHandler) {
      _clickHandler.destroy();
      _clickHandler = null;
    }
    if (typeof document !== 'undefined') document.removeEventListener('keydown', onKeyDown);
    unregisterPickOwner(RTE_GEN_LAYER_ID);
    if (_preRenderRemover) {
      _preRenderRemover();
      _preRenderRemover = null;
    }
    _loading = false;
    _status = 'idle';
  },

  async update() {
    if (!_enabled) return false;
    return load();
  },

  getDetectableObjects(options = {}) {
    return collectDetectableObjects(options);
  },

  /**
   * What the scene actually holds, for the browser harness.
   *
   * The ring-and-disc grammar is a claim about PIXELS, and the only way to
   * check a claim about pixels is to read them back off the primitives that
   * were built rather than off the model that asked for them. Sizes and
   * opacities come from the live primitive; the presence or absence of a disc
   * is the assertion that matters most, because that is the difference between
   * "unmeasured" and "producing nothing".
   * @returns {Array<object>}
   */
  getRenderDiagnostics() {
    const hex = (color) => (color
      ? `#${[color.red, color.green, color.blue]
        .map((channel) => Math.round(channel * 255).toString(16).padStart(2, '0')).join('')}`
      : null);
    const rows = [];
    for (const record of _records.values()) {
      rows.push({
        id: record.id,
        siteId: record.siteId,
        name: record.site?.name || null,
        class: record.site?.class || null,
        installedMw: record.site?.installedMw ?? null,
        mw: record.site?.mw ?? null,
        load: record.site?.load ?? null,
        measured: Number.isFinite(record.site?.mw),
        ringPx: record.ring?.pixelSize ?? null,
        ringOutlineAlpha: record.ring?.outlineColor?.alpha ?? null,
        ringOutline: hex(record.ring?.outlineColor),
        hasDisc: Boolean(record.disc),
        discPx: record.disc?.pixelSize ?? null,
        discColor: hex(record.disc?.color),
        shown: record.ring?.show !== false,
        collectionShown: _rings?.show !== false,
        relief: _reliefOn,
        cageM: record.heights?.cageM ?? null,
        columnM: record.heights?.columnM ?? null,
        iconPx: record.icon ? record.iconPx : null,
        iconShown: Boolean(record.icon?.show && _icons?.show),
      });
    }
    return rows;
  },

  /**
   * Snapshot the stations for the analyst query engine. On-demand only.
   * @param {number} [maxCount=200]
   * @returns {Array<Object>}
   */
  getAnalystRecords(maxCount = 200) {
    if (!_enabled) return [];
    const limit = Number.isFinite(maxCount) ? Math.max(1, Math.floor(maxCount)) : 200;
    const result = [];
    for (const site of _sites) {
      if (result.length >= limit) break;
      result.push(mapRteAnalystRecord(site, result.length));
    }
    return result;
  },

  /**
   * The key to what is on screen.
   *
   * The first row is not a filière: it says how to READ a station, because a
   * reader who does not know that a faint empty ring means "unmeasured" and a
   * crisp empty ring means "stopped" will read half this map backwards. In
   * plain words since 2026-09-21, and in the shape on screen: the column and
   * its cage in relief, the disc and its ring otherwise.
   * @returns {{chips: Array<object>, legend: Array<object>}}
   */
  getRowControls() {
    const legend = [];
    const m = messages().legend;
    const measured = _joinStats?.placedUnits || 0;
    let label = m.readCapacity;
    let blurb = m.keyless;
    if (measured) {
      label = _reliefOn ? m.readColumn : m.readDisc;
      blurb = _reliefOn ? m.readColumnHow : m.readDiscHow;
    }
    legend.push({ label, color: '#dfe7ef', blurb });
    legend.push(...buildRteLegend(sitesOnScreen()));
    return { chips: [], legend };
  },

  getStats() {
    const stats = {
      // The DRAWN count, because that is what a row's number means everywhere
      // else in this panel. `stations` below still says what the register
      // holds, and `deferredToEdf` is the difference, named.
      count: _records.size,
      lastUpdate: _lastUpdate,
      loading: _loading,
      status: _status === 'ready' ? 'ok' : _status,
      stations: _sites.length,
      deferredToEdf: Math.max(0, _sites.length - _records.size),
      units: _registry?.units?.length ?? null,
      unitsReporting: _joinStats?.placedUnits ?? 0,
      outputMw: _joinStats?.placedMw ?? null,
      installedMw: _registry?.stats?.installedMw ?? null,
      unplacedUnits: _joinStats?.unplacedUnits ?? 0,
      unplacedMw: _joinStats?.unplacedMw ?? 0,
      silentUnits: _joinStats?.silentUnits ?? null,
      latestAt: _liveStats?.latestAt ?? null,
      stepMinutes: _liveStats?.stepMinutes ?? null,
      pumpingUnits: _liveStats?.pumping ?? 0,
      auth: _auth,
      windowMode: _window?.mode || null,
      // Licence Ouverte 2.0 obliges the producer AND the data's update date;
      // the register's own edition IS that date.
      registryEdition: _registry?.registre?.edition ?? null,
      feedSource: _source,
    };
    const label = buildLoadingLabel();
    if (label) stats.loadingLabel = label;
    if (_authDetail && _auth !== 'ok') stats.authDetail = _authDetail;
    if (_error) stats.error = _error;
    return stats;
  },

  destroy(viewer) {
    if (_enabled) this.disable(viewer);
    else {
      clearSelection();
      if (_clickHandler) {
        _clickHandler.destroy();
        _clickHandler = null;
      }
      if (typeof document !== 'undefined') document.removeEventListener('keydown', onKeyDown);
      unregisterPickOwner(RTE_GEN_LAYER_ID);
    }
    if (_preRenderRemover) {
      _preRenderRemover();
      _preRenderRemover = null;
    }
    removeRelief();
    for (const collection of [_rings, _discs, _icons]) {
      if (!collection) continue;
      unregisterSpriteCollection(RTE_GEN_LAYER_ID, collection);
      viewer?.scene?.primitives?.remove?.(collection);
    }
    _rings = null;
    _discs = null;
    _icons = null;
    _records.clear();
    _sites = [];
    _unplaced = [];
    _registry = null;
    _registryPromise = null;
    _viewer = null;
  },
};

/** Seed rendered records so selection/card/legend paths run without WebGL. */
export function _setRteStateForTest({
  viewer, records, sites, unplaced, overlayHost, registry, joinStats, liveStats, auth,
  enabled = true,
} = {}) {
  _viewer = viewer || null;
  if (records) _records = records instanceof Map ? records : new Map(Object.entries(records));
  if (sites) _sites = sites;
  if (unplaced) _unplaced = unplaced;
  if (registry !== undefined) _registry = registry;
  if (joinStats !== undefined) _joinStats = joinStats;
  if (liveStats !== undefined) _liveStats = liveStats;
  if (auth !== undefined) _auth = auth;
  _overlayHost = overlayHost || DEFAULT_OVERLAY_HOST;
  _enabled = enabled;
  _selectedId = null;
}

/** @returns {?string} */
export function _rteSelectedIdForTest() {
  return _selectedId;
}

export function _selectRteObjectForTest(id) {
  selectObject(id);
}

export function _clearRteSelectionForTest() {
  clearSelection();
}

export function _rteRowControlsForTest() {
  return rteGenerationLayer.getRowControls();
}

export function _rteStatsForTest() {
  return rteGenerationLayer.getStats();
}

export function _rteDetectablesForTest(options) {
  return collectDetectableObjects(options);
}

export default rteGenerationLayer;
