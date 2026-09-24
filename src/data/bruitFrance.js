import * as Cesium from 'cesium';
import { cameraPoseKey, createAddressScanLayer } from './addressScanLayer.js';
import {
  BRUIT_AREA_SCALE_DENOMINATOR,
  BRUIT_INDEX_SENTENCES,
  BRUIT_PROBE_SCALE_DENOMINATOR,
  BRUIT_SOURCE,
  PEB_ZONE_LABELS,
  PEB_ZONE_ORDER,
  bandText,
  bruitBandIsFine,
  bruitGroundResolutionText,
} from './bruitFeed.js';
import { formatDate, formatDecimal, formatNumber } from '../i18n/format.js';
import { DEFAULT_LOCALE, getLocale } from '../i18n/locale.js';
import messages from './bruitFrance.i18n.js';
import { INTER_CAPITALS, interOutlineMarkup } from './interCapitals.js';
import { sceneGroundPoint } from './groundPick.js';
import { hasJoin, watchJoin } from './layerJoins.js';
import { lucideIconMask } from './lucideIcons.js';
import { MAKI_PATHS } from './mapIcons.js';
import { mapKeyCarriesSelection } from './mapKeySelection.js';
import { governorRequestRender } from '../renderGovernor.js';
import {
  focusedPebAirport,
  pebAirportCamera,
  pebAirportCode,
  pebAirportLabel,
  pebAirportOptions,
  pebPlanUrl,
} from './pebAirports.js';
import { pointInPolygons, ringLabelAnchor } from './ringGeometry.js';
import { ZONE_FILL_MAX_ALPHA } from './urbanismeGpu.js';

/**
 * @module data/bruitFrance
 *
 * The aircraft-noise plans of France, drawn — and the one decision this layer
 * exists to make out loud: WHICH of the zones the service returns is the answer.
 *
 * ── WHAT THIS ADDS OVER `urbanismeGpu` ──────────────────────────────────────
 * The Géoportail de l'urbanisme already reaches the plan d'exposition au bruit.
 * `DATA_SOURCES.md` says so, and it arrives there as a servitude: a code, an
 * assiette outline and a PDF link, drawn as a dashed line at the address, with
 * NO zone letter, NO threshold and NO unit. Over the same ground at Roissy that
 * layer's whole answer is "servitude aéronautique". This layer's answer is
 * "gêne modérée : logements neufs limités, isolation imposée · de 56 à 65
 * dB(A) en moyenne sur 24 h · arrêté préfectoral du 03/04/2007 · LFPG". The
 * difference is the number, and the number is the reason anyone looks.
 *
 * ── THE DEFECT THIS LAYER WAS BUILT TO AVOID: `features[0]` ─────────────────
 * A WMS GetFeatureInfo is not a point-in-polygon test. GeoServer answers with
 * every feature within a buffer of the queried PIXEL, and the aircraft-noise
 * plans genuinely overlap. Measured on 2026-09-02, one probe at each of the 224
 * aerodromes in the arrêté register, at the scale `bruitFeed.js` pins:
 *
 *   features returned per probe   0 → 9   1 → 141   2 → 67   3 → 5   4 → 2
 *
 * So **74 of the 215 probes that answer at all — 34% — return more than one
 * polygon for one pixel**, and taking `features[0]` would be a coin toss on a
 * third of France. Three DISTINCT reasons sit behind that number, and they need
 * three different answers, not one:
 *
 *  1. THE SAME BAND, PUBLISHED TWICE. Measured at LFPZ, LFPV, LFXU and LFGQ:
 *     one zone comes back as two features with two `id_map` values, and at LFPZ
 *     the two copies even disagree about `producteur` (`DSAC N` against `ADP`)
 *     and `date_maj` (`null` against `2017-05-23Z`). `bruitFeed.js` merges them
 *     on the band's identity and counts the pieces. Nothing here has to know.
 *
 *  2. A BAND THE BUFFER FOUND, THAT THE POINT IS NOT IN. Measured at Les
 *     Mureaux (LFXU): 4 features come back, and the two zone-A polygons are
 *     BESIDE the probe, not under it. `bruitFeed.js` re-tests every ring, holes
 *     included, and flags `atPoint`. Those bands are drawn — "the louder zone
 *     starts thirty metres away" is worth seeing — but they are DASHED, drawn
 *     at the faintest wash, and can never be the answer.
 *
 *  3. TWO BANDS THAT REALLY DO BOTH COVER THE POINT. This is the one that needs
 *     a rule. Measured by probing each airport's whole plan and re-testing it on
 *     a 120 × 120 grid of its own bbox:
 *       · LFPZ (Saint-Cyr) — zones **A and B overlap**; at 48.80989, 2.07921
 *         all four returned polygons contain the point (A id 649, A id 652,
 *         B id 650, B id 653) and zone B has no hole cut where zone A sits.
 *       · LFMD (Cannes-Mandelieu) — zones **B and C overlap** at 43.53184,
 *         6.95601.
 *       · LFPB (Le Bourget) — **two different airports**: Le Bourget's own
 *         zone A and Roissy's zone D, two arrêtés twelve years apart.
 *
 * ── THE RULE, AND WHY IT IS THE STRICTEST ZONE ──────────────────────────────
 * {@link chooseBruitAnswer} ranks the eligible bands and the card NAMES the
 * clause that separated the winner from the runner-up. In order:
 *
 *   1. `atPoint` — a band the point is not inside is not a candidate at all.
 *   2. THE MOST EXPOSED ZONE WINS, A over B over C over D. This is not a tie-break dressed up as a rule: the PEB's restrictions are
 *      cumulative-strictest, so on ground covered by both A and B it is zone A
 *      that forbids housing. Answering "zone B" at Saint-Cyr because it came
 *      back first would understate the rule that actually applies there. The
 *      letters are also the ONE part of the document that is identical at every
 *      airport and under both indices, so ranking them compares like with like
 *      even where the thresholds do not.
 *   3. Tie on the letter → the NEWEST effective arrêté, because a revised plan
 *      supersedes the one it replaced. Never observed in the 224-airport sweep;
 *      written down because the day it happens the alternative is arbitrary.
 *   4. Still tied → the OACI code, alphabetically, then the feature id. Two
 *      clauses that decide nothing about physics and everything about
 *      determinism: the same ground must not answer differently because
 *      GeoServer shuffled its response.
 *
 * Everything the rule did NOT pick is still on the card. `{n} zones sous le
 * repère`, the runner-up spelled out with its own band, and the count of the
 * ones the buffer found beside the point. A layer that picks silently is a
 * layer that is wrong 34% of the time without saying so.
 *
 * ── THE UNIT IS NEVER GUESSED, AND THAT WORK IS ALREADY DONE ────────────────
 * `indldenext`/`indldenint` mix two incompatible scales — the *indice
 * psophique* abandoned in 2002 and Lden dB(A) — with nothing in the row to tell
 * them apart. Measured over the 298 zone rows the 224 probes returned:
 * 75 rows carry psophique values (78 … 96) and 223 carry Lden (50 … 70).
 * `bruitFeed.js` chooses from the LATER of `date_arret` and the date inside the
 * arrêté PDF, and suppresses the unit rather than guessing when the two
 * disagree. This module's contribution is narrower and just as load-bearing:
 * **it never renders a bare number.** Every threshold on screen arrives through
 * {@link bandText}, which returns null when the index is unsettled, and the
 * band then prints as "seuils 84 – 89 — indice non déterminé". A number with no
 * unit beside it is read as decibels by everyone.
 *
 * ── WHAT IS NOT DRAWN, AND WILL NOT BE ──────────────────────────────────────
 * THERE IS NO STRATEGIC NOISE MAP HERE. The EU directive's CBS isophones — the
 * thing most people mean by "the noise map" — are not on the Géoplateforme at
 * all: grepping all three capabilities documents for bruit/noise/classement
 * returns these four DGAC aviation layers and nothing else. They exist as ~76
 * per-DDT Géo-IDE ATOM shapefile zips, EPSG:2154, ISO-8859-1, no CORS header,
 * and one of them (Tarn) is MapInfo TAB with no shapefile inside at all. That
 * is a server-side harvest of several hundred archives, and it is deferred, not
 * forgotten. ROAD AND RAIL NOISE ARE THEREFORE ABSENT FROM THIS LAYER, and the
 * card says "avions seulement" rather than letting a reader infer that the
 * quiet ground beside a motorway is quiet.
 *
 * ── TWO MODES, BECAUSE A DEZOOMED CAMERA ASKS A DIFFERENT QUESTION ──────────
 * A PEB is a set of NESTED RINGS and a point probe returns the one the pixel
 * is in — normally zone A, at the aerodrome — because GetFeatureInfo answers
 * within a few pixels of the coordinate. That is the right answer to "what
 * applies to this address" and the wrong answer to "show me the noise around
 * this airport": zones B, C and D are donuts the point is not inside, so from
 * a dezoomed camera the layer drew one band out of four and then, above 12 km,
 * nothing at all. The plans themselves are up to 65.8 km across; the ceiling
 * was under a fifth of that, so the shape could never be on screen whole.
 *
 * So above {@link ADDRESS_SCAN_CEILING_M} the layer switches question:
 *
 *   POINT MODE, below 12 km — unchanged. One probe at the camera's coordinate,
 *     pinned at 1:{@link BRUIT_PROBE_SCALE_DENOMINATOR}, `atPoint` re-tested,
 *     the winner rule, the runner-up, the dashes, the marker. Everything the
 *     rest of this header is about.
 *   OVERVIEW MODE, 12 km to {@link BRUIT_OVERVIEW_CEILING_M} — one probe per
 *     AERODROME in view, at its own published reference point, at
 *     1:{@link BRUIT_AREA_SCALE_DENOMINATOR}, whose buffer is wide enough that
 *     the whole plan comes back — and then a second pass that re-fetches each
 *     band it found at the fine scale, so the shape is as wide as the overview
 *     needs and as detailed as the point probe's. No marker, so no winner, no
 *     runner-up and no dashes: `atPoint` is false on every band because nothing
 *     was tested against a point, and drawing that as "you are not standing in
 *     it" would be an answer to a question nobody asked.
 *
 * The overview then has two TEMPOS, and only the tempo differs — the question,
 * the probes and the bands are identical:
 *
 *   Below {@link BRUIT_FINE_OVERVIEW_CEILING_M} the second pass runs IN FRONT
 *     of the reader. `fine=1` goes out with the request and the payload comes
 *     back already at 1:{@link BRUIT_PROBE_SCALE_DENOMINATOR}, so the frame a
 *     reader dezooms to in order to see one airport's plan is sharp on its
 *     first paint instead of arriving faceted and redrawing under them.
 *   Above it, the pass stays in the BACKGROUND exactly as it was: coarse first,
 *     sharpened band by band, {@link scheduleBruitRefinePoll} coming back for
 *     it. Four seconds of wait buys nothing at 100 km, where the median band is
 *     1.9 km wide against a 140 km screen.
 *
 * NEITHER TEMPO IS A PROMISE. The foreground pass is bounded by a wall-clock
 * budget the proxy owns, so a cold Paris basin under 30 km can still answer
 * with some bands coarse and the rest queued — which is why every sentence
 * about sharpness on a card is read off the BAND (`bruitBandIsFine`) and never
 * off the altitude.
 *
 * ── DRAWN AT A STATED GENERALISATION, AND THE OVERVIEW EARNS THE FINE ONE ───
 * The outline the service returns is generalised to the requested rendering
 * scale — 1:39,757 for a point probe, 1:3,975,696 for an overview, a hundred
 * times coarser. That is one knob doing two jobs: the coarse scale is what
 * makes the GetFeatureInfo buffer wide enough to return zones B, C and D at
 * all, and it is also what flattens them. Measured, Roissy's zone D came back
 * with 37 vertices across 65.8 km — a ring with visible facets.
 *
 * The two jobs are separated by fetching TWICE. The coarse probe is demoted to
 * a discovery pass that names the bands; each named band is then re-fetched at
 * the PROBE scale, aimed at its own coarse outline, which works because the
 * service does not clip the geometry it returns to the box it was asked
 * through. Measured over the twelve aerodromes around Paris, 751 vertices
 * became 7,287. The proxy owns that pass and its measurements; see the second-
 * pass header beside `bruitAerodromeZones` in `vite.config.js`.
 *
 * IT IS A BACKGROUND PASS ABOVE {@link BRUIT_FINE_OVERVIEW_CEILING_M}, so the
 * overview is drawn coarse first and sharpens under the reader a few seconds
 * later — nine and a half seconds of refinement across the Paris basin is not a
 * camera settle. Under that altitude the same pass is played in front of the
 * reader instead, against a budget that keeps the wait a wait rather than a
 * hang. {@link scheduleBruitRefinePoll} is how this layer
 * comes back for it, and {@link bruitCardCaveat} is why a half-refined view
 * still cannot overclaim: every band carries the scale its own outline was
 * fetched at, the card prints the COARSEST of them, and it names how many are
 * already better. Nothing drawn here is a surveyed limit at either scale; the
 * arrêté the card names — `arrêté préfectoral du <date> · <OACI>` — is the
 * document that is.
 *
 * ── WHY IT SITS ON `createAddressScanLayer` ─────────────────────────────────
 * The upstream takes a coordinate, not a bounding box, exactly like the four
 * layers already on that shell. Reusing it buys the look-at derivation, the
 * altitude gate, the 450 ms camera settle, the single-flight scan, the terrain
 * seating and the click-to-card index — about eight hundred lines this layer
 * would otherwise own a second copy of. What is added on top is the row legend
 * and the zoom guidance the shell does not have.
 *
 * THE OVERVIEW NEEDED NO CHANGE TO THAT SHELL, and that is not a coincidence.
 * The shell already refetches whenever the QUERY changes rather than only when
 * the centre moves — written for the urbanism layer, which asks for a box close
 * in and a point higher up — so a mode that adds one `km=` parameter above an
 * altitude switches itself, and the proxy reads that parameter to decide which
 * of the two questions it is being asked.
 */

/** Layer id — matches LAYER_STATE_REGISTRY, LAYER_TAXONOMY and the proxy route. */
export const BRUIT_FR_LAYER_ID = 'bruit-fr';

/** Overlay source id. The shell keys its single selected card on the layer id. */
export const BRUIT_FR_OVERLAY_SOURCE_ID = BRUIT_FR_LAYER_ID;

/** Proxy route. */
export const BRUIT_FR_ENDPOINT = '/api/bruit-fr';

/**
 * Manager tick, 15 minutes.
 *
 * NOT because the register moves — measured from the 224 arrêté filenames, it
 * gained 8 documents in the whole of the 2020s and 3 in 2022 — but because a
 * scan that failed must eventually retry without the camera moving. The camera
 * settle drives every scan a reader actually notices. Same value as the four
 * sibling address layers, for the same reason.
 */
const UPDATE_INTERVAL_MS = 900_000;

/**
 * The PEB ramp: how much noise the ground under it is exposed to.
 *
 * Warm-to-cool by SEVERITY, not by threshold value, because the threshold is
 * not comparable across the two indices — 96 is the top of the psophique scale
 * and 70 is the top of Lden, and a ramp keyed on the number would paint Cannes
 * darker than Roissy for being older. The letter is the comparable channel.
 *
 * Zone D is deliberately COOL and not a fourth warm step. It carries no
 * building restriction at all — it is the information-and-soundproofing zone —
 * and a fourth shade of amber would say it was the quiet end of the same rule
 * rather than a different kind of statement.
 *
 * Checked against the neighbours this layer will be stacked on. `urbanismeGpu`
 * spends orange on `U`, magenta on `AUc`, green on `A` and teal on `N`, and red
 * on its servitude dashes; `georisques` owns the hazard triangle. The crimson
 * here is darker and more saturated than the servitude red, and the pale blue
 * of zone D appears in neither palette.
 */
export const PEB_ZONE_COLORS = Object.freeze({
  A: '#ff2d55', // very strong nuisance — housing prohibited
  B: '#ff7a1f', // strong nuisance
  C: '#ffcc33', // moderate nuisance
  D: '#9fd0ff', // information only — no building restriction
});

/** A zone letter this grammar does not know. Neutral, and never ranked first. */
export const BRUIT_UNKNOWN_ZONE_COLOR = '#c9d4e0';

/**
 * How heavily each wash sits on the ground — BORROWED, NOT RE-MEASURED, and
 * that is stated because it decides what a reader sees.
 *
 * `urbanismeGpu.js` derived its ladder by repainting one polygon at five alphas
 * over the operator's own basemap and differencing the frames: 0.18 invisible,
 * 0.22 the floor, 0.28 readable, 0.33 clear, 0.40 strong, 0.45 the ceiling past
 * which the wash replaces the photograph. That measurement is of the app's
 * alpha attenuation and colour grading, not of the layer that made it, so it
 * transfers; it was not re-run here and this comment is the only honest way to
 * say so. {@link ZONE_FILL_MAX_ALPHA} is imported from that module rather than
 * copied, so its ceiling and this layer's cannot drift apart.
 *
 * THE STROKE CARRIES THE BAND; THE WASH ONLY MARKS THE ANSWER. The first
 * ladder washed every band between 0.22 and 0.42, and four nested plans at
 * that weight laid a tinted sheet over the whole airport — at Roissy zone D
 * alone is a 65.8 km ring — so the photograph a reader came to look at was the
 * thing the layer hid. A PEB is nested contours, and contours read from their
 * lines, so only the band the rule chose keeps a readable wash. Every other
 * band sits UNDER the measured 0.22 floor on purpose: its outline and its
 * badge name it, and what is left of the wash is a tint that says which side
 * of a line the band lies on — which a bare contour does not say, and a
 * hole-cut ring is exactly where it matters. Clicks do not depend on it: a
 * pick on bare ground reaches `bruitGroundCard` as well as a pick on a wash.
 *
 *   winner  0.28  the band the rule chose — the answer ("readable")
 *   inside  0.14  another band that also contains the point
 *   nearby  0.10  a band the buffer returned beside the point, dashed as well
 */
export const BRUIT_FILL_ALPHA = Object.freeze({
  winner: 0.28,
  inside: 0.14,
  nearby: 0.10,
});

/** The stroke on the boundary itself, over its own wash. */
const BRUIT_OUTLINE_ALPHA = 0.95;

/**
 * 3 px for a band under the marker, 2 px for one merely beside it.
 *
 * The same reasoning `urbanismeGpu.js` records: width is the only pick
 * tolerance a Cesium polyline has, and a clamped hairline over an orthophoto is
 * both hard to see and hard to hit. The thinner stroke on a nearby band is the
 * second channel — with the dash — saying it is context and not an answer.
 */
export const BRUIT_OUTLINE_WIDTH_PX = Object.freeze({ inside: 3, nearby: 2 });

/** Dash period in pixels, for the bands the point is NOT in. */
const BRUIT_DASH_LENGTH_PX = 18;

/**
 * Narrowest band that gets its letter written on the ground, in degrees.
 *
 * Measured over all 293 bands the 224 probes returned, the narrowest label
 * anchor is **0.000451°** and the median is 0.005288°, so this gate has never
 * fired on real data — every band in the register is wide enough to carry four
 * characters. It stays because the register is not a promise: a band published
 * as a sliver would otherwise get its letter written across a shape a few
 * metres wide, and 0.0004° is about 30 m of longitude at 45°N.
 */
export const BRUIT_LABEL_MIN_WIDTH_DEG = 0.0004;

/**
 * The badge a zone's code is written on, in CSS pixels.
 *
 * ON THE LINE, NOT IN THE BAND. Once the wash is only a tint (see
 * {@link BRUIT_FILL_ALPHA}) a letter floating between two contours names
 * neither of them: the reader cannot tell whether the `B` belongs to the line
 * above it or the one below. So the code sits ON its band's outer ring and
 * interrupts it, the way a contour label does on a topographic map. Holes are
 * not labelled: a hole's edge is the next zone's outer ring, which carries
 * that zone's own badge.
 */
export const BRUIT_BADGE_PX = 22;

/**
 * How far apart two badges must sit on the ground, in metres.
 *
 * Badges are pinned to the ground and the camera is not, so no single distance
 * keeps them apart at every altitude. Each number is chosen for the altitude
 * where its mode is READ: 30 px (the badge plus 8 px of air) at the top of the
 * mode, on a 1,440-px-wide window looking straight down, where the ground
 * spans 2·tan 30° ≈ 1.155 × the altitude.
 *
 *   point  300 m   30 px at 12 km, the ceiling of the point scan
 *   area   750 m   30 px at 30 km, the altitude below which the overview waits
 *                  for fine outlines — where a reader dezooms to see one plan
 *
 * Below those altitudes badges only draw further apart. Above them they can
 * touch, and the overview shrinks them with distance
 * ({@link BRUIT_AREA_LABEL_SCALE}) before fading them out.
 */
export const BRUIT_BADGE_SEPARATION_M = Object.freeze({ point: 300, area: 750 });

/**
 * A second piece of the same band gets its own badge only if it is at least
 * this share of the widest piece. Measured on the 2026-09-21 overview around
 * Roissy (18 aerodromes, 72 bands): Roissy's two zone-A lobes are 8.05 and
 * 8.00 km wide and both deserve a badge, while a band published as dozens of
 * pieces under 20 m wide is fragments, not lobes.
 */
const BRUIT_BADGE_SECONDARY_SHARE = 0.5;

/** `--glass-bg` from `style.css`, a little more opaque over a photograph. */
const BRUIT_BADGE_FILL = 'rgba(26,40,35,0.9)';
/** `--brand-ivory`. */
const BRUIT_BADGE_INK = '#f7f4ea';

const _badgeCache = new Map();

/**
 * The badge for one zone: the app's glass panel as a rounded square, framed in
 * the zone's colour, with the code in ivory Inter.
 *
 * FILL AND INK ARE BAKED IN and the billboard is drawn untinted. A tint cannot
 * do this job: `billboard.color` multiplies, so it could colour the frame only
 * by also colouring the ivory code and darkening the glass. The cost is one
 * atlas entry per zone colour — four, plus one for a letter the grammar does
 * not know.
 *
 * Returned as a data-URI STRING because Cesium shares an atlas entry between
 * billboards only when their image is a string; a canvas gets a fresh entry
 * per billboard.
 *
 * @param {?string} zone
 * @param {number} [px] Raster size: three times the drawn size, because the
 *   billboard atlas has no mipmaps and a 22 px mark must survive a 2× screen.
 * @returns {?string} `data:image/svg+xml;base64,…`, or null for a code with no
 *   vendored outline — the caller then writes it as text.
 */
export function bruitZoneBadge(zone, px = 72) {
  const code = typeof zone === 'string' ? zone.trim().toUpperCase() : '';
  const glyph = code.length === 1 ? INTER_CAPITALS[code] : null;
  if (!glyph) return null;
  const frame = bruitZoneColorCss(zone);
  const key = `${code}|${frame}|${px}`;
  const cached = _badgeCache.get(key);
  if (cached) return cached;
  // A 28-unit box: the frame's stroke centred 1.5 units in, and an 11-unit cap
  // height centred on the box (baseline = (28 + 11) / 2).
  const letter = interOutlineMarkup(glyph, { capPx: 11, cx: 14, baseline: 19.5 });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 28 28">`
    + `<rect x="1.5" y="1.5" width="25" height="25" rx="5" fill="${BRUIT_BADGE_FILL}"`
    + ` stroke="${frame}" stroke-width="2"/>`
    + `<g fill="${BRUIT_BADGE_INK}">${letter}</g>`
    + '</svg>';
  const uri = `data:image/svg+xml;base64,${_b64(svg)}`;
  _badgeCache.set(key, uri);
  return uri;
}

/** Ground distance in metres, flat-earth — exact enough at badge spacing. */
function groundDistanceM(a, b) {
  const kx = 111_320 * Math.cos(Cesium.Math.toRadians((a.lat + b.lat) / 2));
  return Math.hypot((b.lon - a.lon) * kx, (b.lat - a.lat) * 110_574);
}

/** Points along a ring, at least one every `stepM` metres, vertices included. */
function ringStations(ring, stepM) {
  const stations = [];
  for (let i = 0; i < ring.length; i += 1) {
    const [lon, lat] = ring[i];
    const [nextLon, nextLat] = ring[(i + 1) % ring.length];
    const here = { lon, lat };
    stations.push(here);
    const steps = Math.floor(groundDistanceM(here, { lon: nextLon, lat: nextLat }) / stepM);
    for (let s = 1; s <= steps; s += 1) {
      const t = s / (steps + 1);
      stations.push({ lon: lon + (nextLon - lon) * t, lat: lat + (nextLat - lat) * t });
    }
  }
  return stations;
}

/** True when no mark in `placed` is closer than `separationM`. */
function isClearOf(station, placed, separationM) {
  for (const other of placed) {
    // A latitude gap alone already clears it — no cosine needed.
    if (Math.abs(other.lat - station.lat) * 110_574 >= separationM) continue;
    if (groundDistanceM(station, other) < separationM) return false;
  }
  return true;
}

function ringBoundsCentre(ring) {
  let west = Infinity; let east = -Infinity; let south = Infinity; let north = -Infinity;
  for (const [lon, lat] of ring) {
    west = Math.min(west, lon); east = Math.max(east, lon);
    south = Math.min(south, lat); north = Math.max(north, lat);
  }
  return { lon: (west + east) / 2, lat: (south + north) / 2 };
}

/**
 * Where each band's badges go: ON its outer ring, as near as possible to the
 * point the reader is looking at, and clear of every badge placed before.
 *
 * NEAREST THE REFERENCE, because that is the part of a ring most likely to be
 * on screen: the aerodrome's own point in an overview — the camera is centred
 * on it when a reader looks at its plan — and the scan point under a point
 * scan, where the nearest stretch of each outline is the boundary the reader
 * is asking about. Measured at Roissy, the old in-band anchor put zone D's
 * letter 24 km from the aerodrome, off every frame that shows the airport.
 *
 * MOST EXPOSED FIRST, and the rest slide. Nested rings are nearest the
 * reference on the same flank, so a ladder of badges would stack there: zone A
 * takes the nearest spot, and each later badge walks along its own ring until
 * it is {@link BRUIT_BADGE_SEPARATION_M} clear of every badge already down.
 * That is what staggers them.
 *
 * A band's widest piece always gets a badge — pushed as far from the others as
 * its ring allows when nothing is clear — because a band with no name on
 * screen is worse than two badges touching. Further pieces get one only when
 * they are lobes rather than fragments ({@link BRUIT_BADGE_SECONDARY_SHARE}),
 * are not a duplicate of a piece already seen (the register publishes some
 * pieces twice), and find a clear spot.
 *
 * @param {Array<{id: string, parts: Array, reference: ?{lon: number, lat: number}}>} bands
 *   In the order badges claim their spot: most exposed first.
 * @param {number} separationM
 * @param {Array<{lon: number, lat: number}>} [obstacles] Marks already on the
 *   ground that a badge must keep clear of too — the aerodrome markers, or the
 *   scan marker. They sit at the reference, which is where every badge would
 *   otherwise head first.
 * @returns {Map<string, Array<{lon: number, lat: number}>>} Spots per band id.
 */
export function bruitBadgeSpots(bands, separationM, obstacles = []) {
  const placed = [...obstacles];
  const spots = new Map();
  const stepM = separationM / 4;
  for (const band of bands || []) {
    const pieces = (band?.parts || [])
      .filter((rings) => Array.isArray(rings?.[0]) && rings[0].length >= 3)
      .map((rings) => ({ ring: rings[0], width: ringLabelAnchor(rings)?.widthDeg ?? 0 }))
      .filter((piece) => piece.width >= BRUIT_LABEL_MIN_WIDTH_DEG)
      .sort((a, b) => b.width - a.width);
    const seen = new Set();
    const own = [];
    for (const [index, piece] of pieces.entries()) {
      if (index > 0 && piece.width < pieces[0].width * BRUIT_BADGE_SECONDARY_SHARE) break;
      const { ring } = piece;
      const signature = `${ring.length}:${ring[0]}:${ring[Math.floor(ring.length / 2)]}`;
      if (seen.has(signature)) continue;
      seen.add(signature);
      const reference = band.reference ?? ringBoundsCentre(ring);
      // Nearest first, and the first clear station wins: sorting once and
      // stopping early is what keeps this under the frame budget — scanning
      // every station against every badge cost 17–25 ms per redraw on the
      // real overview around Paris.
      const stations = ringStations(ring, stepM)
        .map((station) => ({ station, distance: groundDistanceM(station, reference) }))
        .sort((a, b) => a.distance - b.distance)
        .map(({ station }) => station);
      let spot = stations.find((station) => isClearOf(station, placed, separationM)) ?? null;
      if (!spot && index === 0) {
        let roomiest = -1;
        for (const station of stations) {
          let clearance = Infinity;
          for (const other of placed) clearance = Math.min(clearance, groundDistanceM(station, other));
          if (clearance > roomiest) { spot = station; roomiest = clearance; }
        }
      }
      if (!spot) continue;
      placed.push(spot);
      own.push(spot);
    }
    if (own.length) spots.set(band.id, own);
  }
  return spots;
}

/**
 * The badges' claim order: answers before context, most exposed first —
 * {@link bruitDrawOrder} read backwards, since paint goes quietest first for
 * the opposite reason.
 */
function bruitBadgeOrder(bands, referenceFor) {
  return bruitDrawOrder(bands).reverse()
    .filter((band) => band.anchor && band.anchor.widthDeg >= BRUIT_LABEL_MIN_WIDTH_DEG)
    .map((band) => ({ id: band.id, parts: band.parts, reference: referenceFor(band) }));
}

/**
 * Put one band's badges on the ground. Each opens the band's own card, exactly
 * as its outline does.
 *
 * A code with no vendored outline — a zone the grammar does not know — is
 * written as text at the same spot instead of being dropped.
 */
function addBruitBadges(dataSource, band, spots, style) {
  const image = bruitZoneBadge(band.zone);
  for (const [index, spot] of (spots || []).entries()) {
    const mark = image
      ? {
        billboard: {
          image,
          width: BRUIT_BADGE_PX,
          height: BRUIT_BADGE_PX,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scaleByDistance: style.scaleByDistance,
          translucencyByDistance: style.translucencyByDistance,
        },
      }
      : {
        label: {
          text: String(band.zone ?? '?'),
          font: 'bold 15px "Roboto Mono", monospace',
          fillColor: Cesium.Color.fromCssColorString(bruitZoneColorCss(band.zone)),
          outlineColor: Cesium.Color.BLACK.withAlpha(0.85),
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scaleByDistance: style.scaleByDistance,
          translucencyByDistance: style.translucencyByDistance,
        },
      };
    dataSource.entities.add({
      // i18n-ignore-next-line — an entity id, not a word.
      id: `bruit:${band.id}:badge:${index}`,
      position: Cesium.Cartesian3.fromDegrees(spot.lon, spot.lat),
      name: style.name,
      description: style.description,
      properties: style.properties,
      ...mark,
    });
  }
}

/**
 * Which clause of {@link chooseBruitAnswer} actually separated the winner from
 * the runner-up, in the words that go on the card.
 *
 * Not a debug string. The whole failure this layer exists to avoid is a silent
 * pick, and a reader who sees two zones painted under one marker is owed the
 * reason one of them is the headline.
 */
export const BRUIT_WINNER_RULES = Object.freeze({
  get only() { return messages().winnerRules.only; },
  get zone() { return messages().winnerRules.zone; },
  get arrete() { return messages().winnerRules.arrete; },
  get oaci() { return messages().winnerRules.oaci; },
  get id() { return messages().winnerRules.id; },
});

/** Colour a band by its zone letter. */
export function bruitZoneColorCss(zone) {
  // Object.hasOwn and not `PEB_ZONE_COLORS[zone] || fallback`: `zone` arrives
  // as a string or as null, and a lookup that falls through on a falsy VALUE
  // would be a different bug the day a colour is ever the empty string.
  const key = typeof zone === 'string' ? zone.trim().toUpperCase() : '';
  return Object.hasOwn(PEB_ZONE_COLORS, key) ? PEB_ZONE_COLORS[key] : BRUIT_UNKNOWN_ZONE_COLOR;
}

/**
 * Severity rank of a zone — LOWER IS MORE EXPOSED.
 *
 * A zone the register spells in a way this grammar does not know ranks LAST,
 * never first. That is deliberate and it is the coercion trap in miniature:
 * `PEB_ZONE_ORDER.indexOf(null)` is -1, and -1 sorts ahead of zone A, so an
 * unlabelled polygon would become the answer at every airport that published
 * one.
 */
export function bruitZoneRank(zone) {
  const key = typeof zone === 'string' ? zone.trim().toUpperCase() : '';
  const index = PEB_ZONE_ORDER.indexOf(key);
  return index === -1 ? PEB_ZONE_ORDER.length : index;
}

/** What each zone means for the ground under it, or null for an unknown letter. */
export function bruitZoneSentence(zone) {
  const key = typeof zone === 'string' ? zone.trim().toUpperCase() : '';
  return Object.hasOwn(PEB_ZONE_LABELS, key) ? PEB_ZONE_LABELS[key] : null;
}

/**
 * Which wash a band gets: the answer, another band under the marker, or context.
 * @param {object} band
 * @param {?object} winner The band {@link chooseBruitAnswer} chose.
 * @returns {'winner'|'inside'|'nearby'}
 */
export function bruitEmphasis(band, winner) {
  if (band?.atPoint !== true) return 'nearby';
  return winner && band.id === winner.id ? 'winner' : 'inside';
}

/**
 * Which wash an OVERVIEW band gets — and there is no 'nearby' here.
 *
 * The point-mode ladder has three rungs because a probe answers about a marker:
 * the band the rule chose, another band under it, and a band the buffer found
 * beside it. An overview has no marker, so the third rung has nothing to mean
 * and the dash — which says "you are not standing in this one" — would be a
 * claim about a reader who is not standing anywhere.
 *
 * What is left is the one distinction the plan itself makes: the most exposed
 * band of each aerodrome, and the rest. That is `top` from `foldAerodromes`,
 * which is a fact about the document rather than a verdict about ground.
 *
 * @param {object} band
 * @param {?object} aerodrome The folded entry this band belongs to.
 * @returns {'winner'|'inside'}
 */
export function bruitAreaEmphasis(band, aerodrome) {
  return aerodrome?.top && band?.id === aerodrome.top.id ? 'winner' : 'inside';
}

/**
 * Rank two eligible bands. Exported so the ordering itself can be tested
 * without going through the whole selection.
 *
 * @returns {(a: object, b: object) => number}
 */
export function bruitBandComparator() {
  return (a, b) => (
    bruitZoneRank(a?.zone) - bruitZoneRank(b?.zone)
    // Newest effective arrêté first. Dates are `YYYY-MM-DD` strings, which sort
    // correctly as strings; a band with no date at all sorts last rather than
    // winning on an empty string comparing low.
    || String(b?.effectiveDate ?? '').localeCompare(String(a?.effectiveDate ?? ''))
    || String(a?.oaci ?? '￿').localeCompare(String(b?.oaci ?? '￿'))
    || String(a?.id ?? '').localeCompare(String(b?.id ?? ''))
  );
}

/**
 * Pick ONE band as the answer, and say which clause decided it.
 *
 * See the module header for why the strictest zone wins and why every clause
 * below it exists. Nothing is discarded: `inside` is the other bands the point
 * is genuinely in, `nearby` is what the buffer found beside it.
 *
 * @param {Array<object>} bands Output of `projectBruitZones`.
 * @returns {{winner: ?object, inside: Array<object>, nearby: Array<object>,
 *   rule: ?string, ruleLabel: ?string, eligible: number, overlapping: boolean}}
 */
export function chooseBruitAnswer(bands) {
  const rows = Array.isArray(bands) ? bands : [];
  const eligible = rows.filter((band) => band?.atPoint === true);
  const nearby = rows.filter((band) => band?.atPoint !== true);
  if (!eligible.length) {
    return {
      winner: null, inside: [], nearby, rule: null, ruleLabel: null,
      eligible: 0, overlapping: false,
    };
  }
  const ranked = [...eligible].sort(bruitBandComparator());
  const [winner, runnerUp] = ranked;
  let rule = 'only';
  if (runnerUp) {
    if (bruitZoneRank(winner.zone) !== bruitZoneRank(runnerUp.zone)) rule = 'zone';
    else if (String(winner.effectiveDate ?? '') !== String(runnerUp.effectiveDate ?? '')) rule = 'arrete';
    else if (String(winner.oaci ?? '') !== String(runnerUp.oaci ?? '')) rule = 'oaci';
    else rule = 'id';
  }
  return {
    winner,
    inside: ranked.slice(1),
    nearby,
    rule,
    ruleLabel: BRUIT_WINNER_RULES[rule],
    eligible: eligible.length,
    // Two bands of ONE airport over one point: the register's own rings
    // overlapping, measured at LFPZ (A over B) and LFMD (B over C). Reported
    // apart from "two airports here", which is a different fact.
    overlapping: ranked.slice(1).some((band) => band.oaci === winner.oaci),
  };
}

/**
 * One band, in one line: its letter and its thresholds in the unit they are
 * actually in.
 *
 * `bandText` returns null when there are no thresholds at all and says "unité
 * non déterminée" when the index could not be settled. Both are passed through
 * unchanged. Nothing in this module formats a threshold by hand, which is what
 * keeps a bare number off the globe.
 *
 * `short`, because every caller of this is a SECONDARY mention — a band beside
 * the one the card is about, or one of four in a list — where the card has
 * already spelled the index out once at full length. Measured on the Roissy
 * ground card, the long form of a secondary mention ran to 75 characters and
 * wrapped it onto a second row.
 */
export function bruitBandLabel(band) {
  const zone = typeof band?.zone === 'string' && band.zone.trim() ? band.zone.trim() : '?';
  const m = messages().band;
  const prefix = m.zone(zone);
  const text = bandText(band, { short: true });
  return text ? m.withThreshold(prefix, text) : prefix;
}

/**
 * A register date as the reader's own language writes it.
 *
 * `03/04/2007` in French — the register's own ISO day, reordered by hand, the
 * way this module always printed it — and `Apr 3, 2007` in English, because
 * `03/04/2007` in English says the fourth of March. The month is spelled so
 * the ambiguity cannot arise at all, which matters on a card whose whole job
 * is to identify one prefectoral order among several.
 *
 * Built from the STRING and not from a `Date` in French, so no time zone can
 * move a day; the English branch pins `timeZone: 'UTC'` for the same reason.
 */
export function bruitDayText(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
  if (!match) return null;
  const [, year, month, day] = match;
  if (getLocale() === DEFAULT_LOCALE) return `${day}/${month}/${year}`;
  return formatDate(Date.UTC(Number(year), Number(month) - 1, Number(day)), {
    timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric',
  });
}

/**
 * The card for ONE band — shared by its wash, every one of its rings, and the
 * letter written on it, because they are the same band and must not tell a
 * reader three different things.
 *
 * Opens on what the zone MEANS and not on its threshold, same order as
 * {@link bruitGroundCard}: these two are read by the same click, one on the
 * outline and one on the fill, and an outline that led with a number while the
 * fill led with a rule would look like two different answers.
 */
export function bruitBandDescription(band, answer = null, { area = false } = {}) {
  const m = messages().bandCard;
  const isWinner = Boolean(answer?.winner && answer.winner.id === band?.id);
  const arrete = bruitDayText(band?.effectiveDate);
  return [
    bruitZoneSentence(band?.zone),
    bandText(band),
    BRUIT_INDEX_SENTENCES[band?.index ?? 'unknown'],
    // `atPoint` is false on EVERY overview band, because nothing was tested
    // against a point. Printing the point-mode sentence there would invent a
    // marker the reader does not have and then tell them they are outside it.
    area || band?.atPoint === true ? null : m.nearby,
    isWinner && answer?.ruleLabel ? m.chosen(answer.ruleLabel) : null,
    arrete ? m.order(arrete) : null,
    // The register keeping a 1985 date on a plan reissued in Lden. Said on the
    // band because it is the field a reader would check, and because it is what
    // moved this band's unit.
    band?.revisedDocument && bruitDayText(band?.arreteDate)
      ? m.registerStillShows(bruitDayText(band.arreteDate))
      : null,
    band?.inverted ? m.inverted : null,
    band?.pieces > 1 ? m.pieces(band.pieces) : null,
    band?.holes ? m.holes(band.holes) : null,
    band?.oaci ? (band.airport ? m.airport(band.oaci, band.airport) : band.oaci) : null,
    band?.producer ? m.producer(band.producer) : null,
  ].filter(Boolean).join(' · ');
}

/**
 * Below this, the "nearest aerodrome" is the one under the marker.
 *
 * 0.5 km. The register publishes an aerodrome REFERENCE POINT, not a site
 * outline, and `nearestArrete` already rounds its distance to 0.1 km — so
 * anything under half a kilometre is "here" at the resolution the register
 * itself has, and printing "à 0 km" would spend a sentence saying nothing.
 */
export const BRUIT_ARRETE_UNDER_MARKER_KM = 0.5;

/**
 * The nearest aerodrome that HAS a plan, as the sentence that replaces a blank
 * answer.
 *
 * The coordinate behind the distance is the arrêté register's own published
 * point — never a commune centroid, never a guess. Null when nothing is within
 * the register module's reach, because "the nearest PEB is 300 km away" says
 * nothing about the ground under the camera.
 */
export function bruitNearestSentence(nearest) {
  if (!nearest || !Number.isFinite(nearest.distanceKm)) return null;
  // The aerodrome's NAME leads and its OACI code closes, same as every headline
  // in this module: the code identifies the document, not the place.
  const m = messages().nearest;
  const name = [nearest.name, nearest.oaci ? `(${nearest.oaci})` : ''].filter(Boolean).join(' ');
  const day = bruitDayText(nearest.arreteDate);
  const arrete = day ? m.orderSuffix(day) : '';
  // STANDING ON IT, and the service still returned nothing. That is the most
  // informative empty answer this layer can give, and "à 0 km" would be the
  // least: measured, 9 of the 224 aerodromes answer an empty FeatureCollection
  // at their own published reference point, and three of them — LFPN, LFPK,
  // LFPT — answer nothing at any scale. The arrêté exists; the polygon does
  // not, or does not reach this point.
  if (nearest.distanceKm <= BRUIT_ARRETE_UNDER_MARKER_KM) {
    return m.standingOnIt(`${name || m.unnamed}${arrete}`);
  }
  const km = formatDecimal(nearest.distanceKm, 1);
  return m.away(name || m.unnamedShort, km, arrete);
}

/**
 * The headline over ONE band, wherever that band is the answer.
 *
 * SHARED BY THE MARKER AND BY A CLICK ON THE GROUND, deliberately. They are the
 * same answer arrived at two ways — `bruitMarkerTitle` from a scan, and
 * `bruitGroundCard` from a pick inside a wash — and before this they wrote it
 * two different ways, so the same zone A could be "Zone A · LFBD — B. MERIGNAC"
 * under a marker and something else under a click.
 *
 * WHAT IT SAYS FIRST IS THE SUBJECT. "Zone A" is a letter of the Code de
 * l'urbanisme; on a coloured polygon with nothing else on screen it does not
 * tell a reader they are looking at aircraft noise at all. The document leads,
 * the ring follows, the aerodrome closes.
 *
 * THE OACI CODE IS NOT HERE. It is four letters no reader outside aviation can
 * decode, and it is already on the arrêté line of every card this titles, where
 * it belongs — beside the document it identifies.
 */
export function bruitBandHeadline(band) {
  const zone = typeof band?.zone === 'string' && band.zone.trim() ? band.zone.trim() : '?';
  const m = messages().headline;
  const head = m.line(m.peb, zone);
  return band?.airport ? m.withAirport(head, band.airport) : head;
}

/**
 * The headline over the scan marker.
 *
 * Four states, and the difference between the last two is the whole of this
 * layer's honesty: an empty FeatureCollection and a service that did not answer
 * are the same 0 features downstream, and only `available` tells them apart.
 */
export function bruitMarkerTitle(payload, peb) {
  if (payload?.available?.peb === false) return messages().headline.serviceDown;
  if (peb?.winner) return bruitBandHeadline(peb.winner);
  return messages().headline.nothingHere;
}

/**
 * Everything the marker says, in the order a reader needs it.
 *
 * The first line is the answer. The lines that follow are, in order: what the
 * rule rejected, what the register contradicted itself about, what is NOT in
 * this layer at all, and how the shapes on screen were made. A reader who stops
 * after the first line is not misled; a reader who reads to the end knows
 * exactly how much of France this covers.
 *
 * ── THE ORDER IS A BUDGET, NOT A PREFERENCE ─────────────────────────────────
 * This card goes through {@link bruitCardDetails} like the other three, so what
 * is below the fifth line does not reach a screen. The rank is therefore the
 * layer's own priority, made to cost something:
 *
 *   1. the rule for this ground, and the threshold that is its evidence
 *   2. WHICH zone was chosen and what it beat — the whole reason this module
 *      exists, and the one thing a reader cannot re-derive from the picture
 *   3. the register contradicting itself: two rings with no cut, two plans
 *   4. the document, then the index, then what is merely beside the marker
 *
 * The arrêté's date used to sit at 4 and the ambiguity below it, which meant a
 * point covered by two overlapping zones printed its provenance and dropped the
 * fact that there had been a choice at all.
 */
export function bruitScanDescription(payload, peb) {
  const m = messages().scan;
  const winner = peb?.winner || null;
  const lines = [];
  // The outage leads, because it is the line that stops a blank answer from
  // being read as "nothing here".
  if (payload?.available?.peb === false) {
    lines.push(m.pebDown);
  }
  if (winner) {
    // Rule, then threshold — the same order as the two cards a click produces,
    // because the answer to "what does this mean for this ground" is the rule
    // and the threshold is its evidence.
    lines.push(bruitZoneSentence(winner.zone));
    lines.push(bandText(winner));
  } else if (payload?.available?.peb !== false) {
    lines.push(m.noPlan);
    lines.push(bruitNearestSentence(payload?.nearest));
  }
  // THE LINE THIS LAYER EXISTS FOR. Never omitted when there was a choice.
  if (peb?.eligible > 1) {
    lines.push(m.chosenFrom(peb.eligible, peb.ruleLabel));
    const runnerUp = peb.inside[0];
    if (runnerUp) lines.push(m.alsoUnderMarker(bruitBandLabel(runnerUp)));
  }
  if (peb?.overlapping) {
    lines.push(m.overlapping);
  }
  const airports = new Set([...(payload?.peb || [])]
    .filter((band) => band.atPoint === true).map((band) => band.oaci).filter(Boolean));
  if (airports.size > 1) {
    lines.push(m.twoAirports([...airports].sort().join(', ')));
  }
  if (winner) {
    const day = bruitDayText(winner.effectiveDate);
    if (day) {
      lines.push(winner.revisedDocument
        ? messages().bandCard.orderRevised(day)
        : messages().bandCard.order(day));
    }
    lines.push(BRUIT_INDEX_SENTENCES[winner.index ?? 'unknown']);
  }
  const nearby = peb?.nearby?.length || 0;
  if (nearby) {
    lines.push(m.drawnDashed(nearby));
  }
  if (payload?.mixedIndex) {
    lines.push(m.mixedIndex);
  }
  if (payload?.disputed) {
    lines.push(m.disputed);
  }
  if (payload?.register?.short === true) {
    lines.push(m.registerShort);
  }
  // THROUGH THE SAME BUDGET AS THE OTHER THREE CARDS, and it was not before.
  // The shell splits this string on ' · ' and slices the result to six, so
  // pushing the caveats onto the end made them the first thing dropped — the
  // exact failure `bruitCardDetails` was written to prevent, still live on the
  // one card that did not go through it. Measured at Roissy: eight lines out,
  // six painted, and the two that fell were "avions seulement" and the scale.
  return bruitCardDetails(lines, payload).join(' · ');
}

/**
 * The scale the outlines on screen were generalised at — READ, never assumed.
 *
 * The two modes differ by a factor of a hundred, so a card that reached for a
 * module constant instead of the payload's own number would print a point
 * scan's precision over an overview's outline exactly once, in the case where
 * the payload happens to be missing the field. One function, so the several
 * places that print it cannot drift apart.
 *
 * @param {object} payload
 * @returns {number}
 */
export function bruitScaleDenominator(payload) {
  return payload?.scaleDenominator
    ?? (payload?.area === true ? BRUIT_AREA_SCALE_DENOMINATOR : BRUIT_PROBE_SCALE_DENOMINATOR);
}

// WHAT IS NOT IN THIS LAYER is `caveat.aircraftOnly` in `bruitFrance.i18n.js`,
// and it fits on one row. It used to run to 103 characters and name the
// document it is missing — "la carte de bruit stratégique n'est pas publiée
// ici". True, and two rendered rows out of six on a card whose whole job is to
// be read at a glance. The reason survives in full where a reader can dwell on
// it: the data credits, and the `nuisances` notes of the address fiche.

/**
 * The one caveat every card in this module ends on, in both modes.
 *
 * TWO SENTENCES BECAME ONE, and the merge is what let the marker card keep
 * them at all. `bruitCardDetails` spends one line of six on the tail, so a
 * two-line tail costs a fact — and the pair was "avions seulement" plus a
 * scale, which is one clause each.
 *
 * THE SCALE IS READ FROM THE PAYLOAD and never assumed: the two modes differ by
 * a factor of a hundred. It is stated as ground metres rather than as an OGC
 * denominator, because "1:39 757" is not something a reader can act on and
 * "~11 m" is — see {@link bruitGroundResolutionText}.
 *
 * A MIXED DRAW MUST NOT PRINT ONE NUMBER. The overview serves coarse outlines
 * and sharpens them band by band, so a view legitimately holds thirty at the
 * probe scale and four at the overview's. {@link bruitScaleDenominator} returns
 * the COARSEST, which is the only number true of every shape on screen — but on
 * its own it understates thirty of them, so the mixture is named. (That clause
 * had been written before and reached no screen: it lived in a helper only the
 * point-mode card called, and `area` is false there by construction.)
 *
 * @param {object} payload
 * @returns {string}
 */
export function bruitCardCaveat(payload) {
  const m = messages().caveat;
  const scale = bruitGroundResolutionText(bruitScaleDenominator(payload));
  const coarse = Number(payload?.coarseBands) || 0;
  const refined = Number(payload?.refinedBands) || 0;
  if (payload?.area === true && coarse > 0 && refined > 0) {
    return m.mixedScale(scale, refined, bruitGroundResolutionText(BRUIT_PROBE_SCALE_DENOMINATOR));
  }
  return m.drawnAt(scale);
}

/**
 * The card the world overlay actually paints, and it is SIX LINES.
 *
 * `createAddressScanOverlayEntry` slices a card's details to six — a shell
 * constant, shared by five layers, and not this layer's to widen. So a card
 * built by pushing every true sentence onto a list does not "say more", it
 * silently DROPS its tail, and what a description like this one puts at the end
 * is its caveats: the generalisation, and the fact that road and rail noise are
 * not in this layer at all. Measured on the aerodrome card at Roissy, the two
 * lines that fell off the bottom were exactly those.
 *
 * So the tail is not a tail. Five lines of answer, then the caveat, always —
 * and the caveat is {@link bruitCardCaveat}, which is two sentences condensed
 * into one, because at six lines the cost of a second one is the fifth fact.
 *
 * ── AND SIX LINES OF DATA IS NOT SIX LINES OF SCREEN ────────────────────────
 * `worldOverlayDraw` wraps a card line at about sixty characters, so a long
 * sentence costs a second row and the budget above stops describing what a
 * reader sees. Measured on the ground card at Bordeaux-Mérignac (LFBD, zone A),
 * six details painted EIGHT rows: the arrêté's URL took two and the caveat two.
 *
 * That URL is why none of the three cards in this module prints one any more.
 * The overlay is a CANVAS — `createAddressScanOverlayEntry` sets
 * `interactive: false` and the draw path is `ctx.fillText` — so a link there is
 * not a link, it is eighty characters of unselectable text spending a quarter
 * of the card to be unusable. The document is still identified, by the pair a
 * reader can act on: `arrêté préfectoral du <date> · <OACI>`, which is exactly
 * what names the file, `PEB_<OACI>_<DD>_<MM>_<YYYY>.pdf`.
 *
 * @param {Array<?string>} lines Most load-bearing first.
 * @param {object} payload
 * @returns {string[]}
 */
export function bruitCardDetails(lines, payload) {
  return [
    ...lines.filter(Boolean).slice(0, BRUIT_CARD_MAX_LINES - 1),
    bruitCardCaveat(payload),
  ];
}

/** What `createAddressScanOverlayEntry` paints. Restated so the two cannot drift. */
export const BRUIT_CARD_MAX_LINES = 6;

/** The headline over one aerodrome's plan in the overview. */
export function bruitAerodromeTitle(aerodrome) {
  const who = [aerodrome?.oaci, aerodrome?.name].filter(Boolean).join(' — ');
  return who || messages().aerodrome.untitled;
}

/**
 * One aerodrome's whole plan, on one card.
 *
 * NO WINNER SENTENCE, and the omission is the point. `top` is the most exposed
 * band the document publishes, not the band that applies to any particular
 * ground, and the overview has no ground under a marker to apply it to. The
 * card lists the bands in order and says how many there are; deciding which one
 * governs an address is what descending under 12 km is for, and the last line
 * says so.
 *
 * @param {object} aerodrome A `foldAerodromes` entry.
 * @param {object} payload
 * @returns {string}
 */
export function bruitAerodromeDescription(aerodrome, payload) {
  const m = messages().aerodrome;
  const count = aerodrome?.zones ?? 0;
  const arrete = bruitDayText(aerodrome?.top?.effectiveDate);
  return bruitCardDetails([
    // The whole plan on ONE line, thresholds and units included, because the
    // plan is what this card is for and the budget is six.
    // JOINED WITH A SEMICOLON, NOT ' · '. The shell splits a description on
    // ' · ' to make the card's lines, so a band list joined that way is not one
    // line carrying four bands — it is four lines, and four lines out of a
    // budget of six is the caveat pushed off the bottom.
    m.zonesPublished(count, (aerodrome?.bands || [])
      .map((band) => bruitBandLabel(band)).join(' ; ')),
    arrete
      ? (aerodrome?.top?.revisedDocument
        ? messages().bandCard.orderRevised(arrete)
        : messages().bandCard.order(arrete))
      : BRUIT_INDEX_SENTENCES[aerodrome?.top?.index ?? 'unknown'],
    // An aerodrome nobody aimed at. Its plan is whatever fell inside a
    // neighbour's buffer, which is not a promise that the plan is complete.
    aerodrome?.probed === false ? m.notProbed : null,
    m.zoomForAnswer,
  ], payload).join(' · ');
}

/**
 * What the overview says about itself, as the row's own sentence.
 *
 * Three numbers and never fewer: how many aerodromes were drawn, how many were
 * in reach and left out by the request budget, and how many were asked and did
 * not answer. A map that quietly stops at twelve and a map that is complete
 * look identical, and only the second one is a statement about France.
 *
 * @param {object} payload
 * @returns {string}
 */
export function bruitAreaSummary(payload) {
  const m = messages().area;
  const drawn = payload?.aerodromes?.length || 0;
  const lines = [];
  if (payload?.available?.peb === false) {
    lines.push(m.silent(payload.missing));
  }
  lines.push(drawn > 0 ? m.drawn(drawn, payload?.radiusKm) : m.empty);
  if (!drawn) lines.push(bruitNearestSentence(payload?.nearest));
  if (payload?.dropped > 0) {
    lines.push(m.dropped(payload.dropped));
  }
  // Normal here, unlike at a point: a region spans several arrêtés by
  // construction, and the two scales are still not comparable to each other.
  if (payload?.mixedIndex) {
    lines.push(m.mixedIndex);
  }
  // Through the same six-line budget as the other two overview cards: this one
  // is painted on an entity too, and its tail is its caveat.
  return bruitCardDetails(lines, payload).join(' · ');
}

/**
 * What this layer has to say about an arbitrary point of ground.
 *
 * WITHOUT THIS, THE INSIDE OF A ZONE IS NOT CLICKABLE — and that is not a
 * nicety, it is most of the layer. The wash is a ground-classification POLYGON,
 * and a polygon entity carries no `position`, so `cardFromEntity` cannot build
 * a card for it and `scene.pick` at any pixel inside a band returns an entity
 * the click index has never heard of. Measured in the running app at 60 km over
 * Roissy: a pick on the aerodrome marker's own pixel returns
 * `bruit:peb:566:fill:0`, with the marker only SECOND in the drill list. So the
 * bands' outlines answered a click and their interiors — the whole coloured
 * surface a reader is looking at — answered nothing at all.
 *
 * THE ANSWER IS RE-DERIVED, NOT LOOKED UP. `atPoint` on a band is about the
 * coordinate the SCAN was aimed at, which is not where this click landed, and
 * in the overview it is false on every band because there was no scan point at
 * all. So every band is re-tested against the clicked coordinate with the same
 * `pointInPolygons` the feed uses, holes included — an enclave cut out of zone C
 * is ground where zone C does NOT apply, and answering "zone C" there would be
 * exactly the error the holes exist to prevent.
 *
 * AND IT SAYS WHAT IT WAS MEASURED AGAINST. This is a test against the drawn
 * outline, which is generalised — to 1:39,757 under a point scan and to
 * 1:3,975,696 in an overview, where a hundred metres of boundary is well under
 * a vertex. Near an edge that is a guess, and the card says so rather than
 * letting a coloured pixel pass for a legal limit.
 *
 * Returns null when no band contains the point, which the shell reads as
 * "declined": the click then falls through to dismissing whatever card is open,
 * because "there is no zone here" is not worth taking over the screen for.
 *
 * @param {{lon: number, lat: number, payload: object}} context
 * @returns {?{title: string, details: string[]}}
 */
export function bruitGroundCard({ lon, lat, payload }) {
  if (!payload || !Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  const [lead, ...others] = (payload.peb || [])
    .filter((band) => pointInPolygons(band.parts, lon, lat))
    .sort(bruitBandComparator());
  if (!lead) return null;
  const m = messages().ground;
  const area = payload.area === true;
  const arrete = bruitDayText(lead.effectiveDate);
  return {
    title: bruitBandHeadline(lead),
    // THE CONSEQUENCE LEADS, NOT THE NUMBER. What a reader wants from a
    // coloured polygon is whether a home can be built on it; the threshold is
    // the evidence for that answer, not the answer. This used to open on
    // "70 Lden dB(A)" and put the rule third.
    details: bruitCardDetails([
      bruitZoneSentence(lead.zone),
      bandText(lead),
      // The OACI code rides with the arrêté because that is what it identifies:
      // the PDF is named `PEB_<OACI>_<date>.pdf`, so the two together are what
      // a reader needs to find the document. The URL itself is NOT here — see
      // the note below.
      // eslint-disable-next-line no-nested-ternary
      arrete
        ? (lead.oaci
          ? messages().bandCard.orderWithCode(arrete, lead.oaci)
          : messages().bandCard.order(arrete))
        : BRUIT_INDEX_SENTENCES[lead.index ?? 'unknown'],
      // Two bands over one piece of ground is a real state of the register —
      // measured at Saint-Cyr and at Cannes — and the strictest is the headline.
      others.length
        ? m.alsoHere(others.map((band) => bruitBandLabel(band)).join(' ; '))
        : null,
      // The sentence that stops a coloured pixel from passing for a legal
      // limit. At the overview scale a hundred metres of boundary is well under
      // one vertex, so near an edge this answer is a guess.
      //
      // READ OFF THE BAND THAT WAS CLICKED, not off the mode. An overview under
      // {@link BRUIT_FINE_OVERVIEW_CEILING_M} arrives already refined, and
      // printing "descendez pour la version fine" over a shape that IS the fine
      // version would send a reader down for something they already have. The
      // band carries the scale its own outline was fetched at — that is what
      // `refineBruitCollection` stamps — so the card asks the shape rather than
      // the camera. The `fine` flag then only chooses the WORDING of the
      // remaining case: a coarse band inside a foreground pass is one the
      // budget did not reach and the background is still working on, which is a
      // wait, while a coarse band above the ceiling is a descent.
      //
      // BOTH WORDINGS FIT ON ONE ROW. They ran to 83 and 90 characters, and the
      // overlay wraps at about sixty — so the line that says "this outline is a
      // guess" was itself taking two of the card's six rows to say it.
      area && !bruitBandIsFine(lead)
        ? (payload?.fine === true
          ? m.refining
          : m.descend(BRUIT_FINE_OVERVIEW_CEILING_M / 1000))
        : null,
    ], payload),
  };
}

/**
 * The airport's tag on the globe: an airliner, its name, its code — the chip the
 * approved mock of « Aéroports » (2026-09-24) draws over each field whose plan
 * is on screen, in place of the loudspeaker this layer used to plant there.
 *
 * Painted on a canvas in the interface's own face (DM Sans, `--font-ui`), at
 * twice its size so the billboard stays sharp. The glyph is Maki's `airport`,
 * as everything this app draws ON the globe is a cartographic glyph (Maki,
 * Temaki), never an interface one. Null without a DOM — the tests
 * — and the caller falls back to {@link bruitMarkerGlyph}.
 *
 * @param {string} label « Paris-Charles-de-Gaulle ».
 * @param {?string} code « CDG ».
 * @returns {?{image: HTMLCanvasElement, width: number, height: number}} CSS size.
 */
export function bruitAirportChip(label, code) {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
  const key = `${label}|${code ?? ''}`;
  const cached = _chipCache.get(key);
  if (cached) return cached;
  const scale = 2;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext?.('2d');
  if (!ctx || typeof Path2D !== 'function') return null;
  const nameFont = `600 ${12.5 * scale}px "DM Sans", system-ui, sans-serif`; // i18n-ignore-line — a CSS font.
  const codeFont = `500 ${11 * scale}px "DM Sans", system-ui, sans-serif`; // i18n-ignore-line — a CSS font.
  const text = code ? `${label} · ` : label;
  ctx.font = nameFont;
  const nameWidth = ctx.measureText(text).width;
  ctx.font = codeFont;
  const codeWidth = code ? ctx.measureText(code).width : 0;
  const pad = 9 * scale;
  const icon = 14 * scale;
  const gap = 7 * scale;
  const height = 26 * scale;
  const width = Math.ceil(pad + icon + gap + nameWidth + codeWidth + pad);
  canvas.width = width;
  canvas.height = height;
  // The panels' night green, and the hairline they are drawn with.
  const radius = 7 * scale;
  ctx.beginPath();
  ctx.roundRect?.(scale / 2, scale / 2, width - scale, height - scale, radius);
  ctx.fillStyle = 'rgba(20, 32, 28, 0.9)';
  ctx.fill();
  ctx.lineWidth = scale;
  ctx.strokeStyle = 'rgba(247, 244, 234, 0.28)';
  ctx.stroke();
  // Maki's airliner, filled in ivory, in its own 15-unit box.
  ctx.save();
  ctx.translate(pad, (height - icon) / 2);
  ctx.scale(icon / 15, icon / 15);
  ctx.fillStyle = '#f7f4ea';
  ctx.fill(new Path2D(MAKI_PATHS.airport));
  ctx.restore();
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f7f4ea';
  ctx.font = nameFont;
  const x = pad + icon + gap;
  ctx.fillText(text, x, height / 2 + scale / 2);
  if (code) {
    ctx.font = codeFont;
    ctx.fillStyle = 'rgba(247, 244, 234, 0.78)';
    ctx.fillText(code, x + nameWidth, height / 2 + scale / 2);
  }
  const chip = { image: canvas, width: width / scale, height: height / scale };
  _chipCache.set(key, chip);
  return chip;
}

/** @type {Map<string, {image: HTMLCanvasElement, width: number, height: number}>} */
const _chipCache = new Map();

/**
 * How far off an airport's tag is drawn: a field with scheduled flights up to
 * 150 km of camera distance, any other up to 50 km. From a hundred kilometres
 * over Paris the basin holds sixteen plans, and sixteen names are a cloud over
 * shapes a few pixels wide; the airports a reader flies from are the ones
 * worth a word at that height.
 */
export const BRUIT_CHIP_RANGE_M = Object.freeze({ scheduled: 150_000, other: 50_000 });

/** The tags drawn by the last overview, shown or hidden as a whole. */
const _chipEntities = [];

/**
 * Whether the tags step aside: « Les aéroports » is on and already names every
 * field (`airports/labels`, published by `localLayers.js`).
 * @returns {boolean}
 */
function airportsNamedElsewhere() {
  return hasJoin('airports/labels');
}

watchJoin('airports/labels', (present) => {
  for (const entity of _chipEntities) entity.show = !present;
  governorRequestRender('bruit-fr-airport-tags');
});

/** @type {Map<number, string>} raster size → data URI. */
const _glyphCache = new Map();
const _b64 = (text) => (typeof btoa === 'function'
  ? btoa(text)
  : Buffer.from(text, 'utf8').toString('base64'));

/**
 * The marker glyph: a source and three radiating arcs.
 *
 * DRAWN HERE AND NOT IN `addressMarkerIcons.js`, deliberately. That pack is a
 * shared module owned by the five address layers and its `ADDRESS_GLYPH_KINDS`
 * export is asserted exhaustively by its own test; adding a sixth body to it
 * from this branch would be an edit to a file this layer does not own. The
 * technique is copied exactly, because it is the part that matters: white
 * line-art over a wide dark halo, no hue of its own, so Cesium's
 * `billboard.color` multiply takes the zone colour cleanly (white × c = c)
 * while the halo survives it (0 × c = 0) and keeps the glyph readable over a
 * pale orthophoto.
 *
 * @param {number} [px] Raster size. 88 matches the shared pack's reasoning:
 *   Cesium's billboard atlas has no mipmaps, and these draw at 15–32 CSS px.
 * @returns {string} `data:image/svg+xml;base64,…`
 */
export function bruitMarkerGlyph(px = 88) {
  const cached = _glyphCache.get(px);
  if (cached) return cached;
  const strokes = 'M30,38 L30,58 L44,58 L62,74 L62,22 L44,38 Z'
    + ' M72,36 A22,22 0 0 1 72,60'
    + ' M80,26 A34,34 0 0 1 80,70';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 96 96">`
    + `<g fill="none" stroke="rgba(0,0,0,0.62)" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"><path d="${strokes}"/></g>`
    + `<g fill="none" stroke="#ffffff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"><path d="${strokes}"/></g>`
    + '</svg>';
  const uri = `data:image/svg+xml;base64,${_b64(svg)}`;
  _glyphCache.set(px, uri);
  return uri;
}


/**
 * Ground classification for one map stack.
 *
 * The wash is classification geometry, which is what makes it drape on IGN
 * ortho, on Bing and on the Google photoreal tileset alike. With the globe
 * hidden there is no terrain to classify and only the tileset can receive it;
 * asking for TERRAIN there draws nothing at all. Same call, same reasoning and
 * same `redrawOnMapStack: true` as `urbanismeGpu.js`.
 */
export function bruitClassificationTypeForScene(scene) {
  if (!scene?.globe) return Cesium.ClassificationType.BOTH;
  return scene.globe.show === false
    ? Cesium.ClassificationType.CESIUM_3D_TILE
    : Cesium.ClassificationType.TERRAIN;
}

/** Positions for one ring, or null when it is not a shape. */
function ringPositions(ring) {
  if (!Array.isArray(ring) || ring.length < 3) return null;
  return Cesium.Cartesian3.fromDegreesArray(ring.flat());
}

/**
 * Draw one band: a washed, hole-cut fill per part, and a stroke on EVERY ring.
 *
 * THE HOLES ARE THE WHOLE POINT, and this is not the same argument the zoning
 * layer makes. A PEB zone is a RING — the ground between two thresholds — so
 * its interior rings are exactly where the LOUDER zone begins. Filled without
 * them, zone C is painted over zone B and zone A and the map shows the QUIET
 * number on the loudest ground. Measured at the pinned scale: Roissy's zone C
 * arrives as one polygon with two interior rings, Les Mureaux's zone B with six
 * per piece, and one band at Saint-Denis de la Réunion with thirteen.
 *
 * The interior rings are stroked too. An enclave has a boundary, and it is the
 * boundary that says the rule changes here.
 *
 * @returns {number} Parts drawn.
 */
export function drawBruitParts(dataSource, idPrefix, parts, style) {
  let drawn = 0;
  const stroke = Cesium.Color.fromCssColorString(style.css).withAlpha(BRUIT_OUTLINE_ALPHA);
  for (const [index, rings] of (parts || []).entries()) {
    const outer = ringPositions(rings?.[0]);
    if (!outer) continue;
    if (style.fillAlpha > 0) {
      const holes = [];
      for (let h = 1; h < rings.length; h += 1) {
        const hole = ringPositions(rings[h]);
        if (hole) holes.push(new Cesium.PolygonHierarchy(hole));
      }
      dataSource.entities.add({
        id: `${idPrefix}:fill:${index}`,
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(outer, holes),
          material: Cesium.Color.fromCssColorString(style.css)
            .withAlpha(Math.min(style.fillAlpha, ZONE_FILL_MAX_ALPHA)),
          classificationType: style.classificationType,
          outline: false,
        },
      });
    }
    for (const [ringIndex, ring] of rings.entries()) {
      const positions = ringPositions(ring);
      if (!positions) continue;
      dataSource.entities.add({
        id: `${idPrefix}:${index}:${ringIndex}`,
        name: style.name,
        description: style.description,
        properties: style.properties,
        polyline: {
          positions: [...positions, positions[0]],
          width: style.width,
          material: style.dashed
            ? new Cesium.PolylineDashMaterialProperty({ color: stroke, dashLength: BRUIT_DASH_LENGTH_PX })
            : new Cesium.ColorMaterialProperty(stroke),
          clampToGround: true,
          classificationType: style.classificationType,
        },
      });
    }
    drawn += 1;
  }
  return drawn;
}

/**
 * Every band on screen, quietest first.
 *
 * DRAW ORDER IS LOAD-BEARING HERE in a way it is not for zoning. Two Cesium
 * ground-classification polygons over the same ground blend, and the register
 * genuinely publishes overlapping bands — measured at LFPZ, where zone B has no
 * hole cut where zone A sits. Painting the loudest LAST is what keeps the
 * strictest zone legible on the ground the rule actually applies to.
 *
 * @param {Array<object>} bands
 * @returns {Array<object>}
 */
export function bruitDrawOrder(bands) {
  return [...(bands || [])].sort((a, b) => (
    // Context under answers, then quietest to loudest.
    Number(a?.atPoint === true) - Number(b?.atPoint === true)
    || bruitZoneRank(b?.zone) - bruitZoneRank(a?.zone)
  ));
}

/**
 * The legend swatch for one zone: the zone's code cut out of a rounded tile.
 *
 * The same letter the map writes on its badges, so the key and the map are
 * matched by eye. A MASK, because that is the legend's `glyph` contract: the
 * manager tints the opaque pixels with the entry's colour, so the tile takes
 * the zone's colour and the code shows the glass of the panel through it.
 *
 * @param {?string} zone
 * @returns {?string} `data:image/svg+xml;base64,…`, or null for a code with no
 *   vendored outline — that entry keeps the plain colour dot.
 */
export function bruitZoneLegendGlyph(zone) {
  const code = typeof zone === 'string' ? zone.trim().toUpperCase() : '';
  const glyph = code.length === 1 ? INTER_CAPITALS[code] : null;
  if (!glyph) return null;
  const key = `legend|${code}`;
  const cached = _badgeCache.get(key);
  if (cached) return cached;
  // A 28-unit box drawn at 14 CSS px: a 15-unit cap height keeps the code at
  // the size of the legend's own text.
  const letter = interOutlineMarkup(glyph, { capPx: 15, cx: 14, baseline: 21.5 });
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">'
    + '<mask id="m"><rect x="1" y="1" width="26" height="26" rx="6" fill="#fff"/>'
    + `<g fill="#000">${letter}</g></mask>`
    + '<rect x="1" y="1" width="26" height="26" rx="6" fill="#000" mask="url(#m)"/>'
    + '</svg>';
  const uri = `data:image/svg+xml;base64,${_b64(svg)}`;
  _badgeCache.set(key, uri);
  return uri;
}

/**
 * The map key: one entry per zone actually on screen.
 *
 * WRITTEN FOR A READER WHO KNOWS NO ACRONYM. The first key led every line with
 * « PEB zone A 14 » — two acronyms and a count of drawn bands nobody could
 * place. Each zone is named by how loud it is, its swatch carrying the same
 * code the map writes on its badges.
 *
 * THE RULE IS ONE CLICK AWAY, NOT ON THE LINE (2026-09-24). The approved mock
 * of « Aéroports » prints the key as a card — the airport, « Bruit &
 * urbanisme », the four zones by loudness — and sends the reader to the zone
 * for what it means: « Cliquez sur une zone pour les comprendre ». The rule
 * each line used to carry (« pas de nouveaux logements ») opens the zone's
 * card instead, where it is the headline (`bruitZoneSentence`). The card's
 * head, sentences and link are in `bruitKeyCard`.
 *
 * Built from what was DRAWN, not from the vocabulary, so a line never claims a
 * band the reader cannot see.
 */
export function bruitLegend(payload) {
  if (!payload) return [];
  const m = messages().legend;
  const bands = payload.peb || [];
  const entries = [];
  for (const zone of PEB_ZONE_ORDER) {
    const rows = bands.filter((band) => String(band?.zone ?? '').trim().toUpperCase() === zone);
    if (!rows.length) continue;
    const here = rows.filter((band) => band.atPoint === true).length;
    // `atPoint` is false on every overview band by construction, so the
    // point-mode line would report all of them as "beside the marker" — an
    // explanation of dashes that are not on screen.
    const aside = payload.area === true ? 0 : rows.length - here;
    entries.push({
      label: m.loudness[zone],
      color: bruitZoneColorCss(zone),
      glyph: bruitZoneLegendGlyph(zone),
      ...(aside === 0 ? {} : { blurb: m.aside(aside) }),
    });
  }
  if (bands.some((band) => bruitZoneRank(band?.zone) === PEB_ZONE_ORDER.length)) {
    entries.push({ label: m.unknown, color: BRUIT_UNKNOWN_ZONE_COLOR, blurb: m.unknownBlurb });
  }
  return entries;
}

/**
 * The airports whose plan a payload DRAWS, each with a coordinate when one is
 * known: the overview's aerodromes, or the airports of a point scan's bands,
 * placed by the register.
 * @param {?object} payload
 * @param {?Map<string, object>} register `/api/bruit-fr/index` rows by ICAO code.
 * @returns {Array<{oaci: string, lat: ?number, lon: ?number}>}
 */
export function bruitDrawnAirports(payload, register = null) {
  if (!payload) return [];
  if (payload.area === true) {
    return (payload.aerodromes || [])
      .filter((entry) => typeof entry?.oaci === 'string' && entry.oaci)
      .map((entry) => ({ oaci: entry.oaci, lat: entry.lat, lon: entry.lon }));
  }
  const codes = [...new Set((payload.peb || []).map((band) => band?.oaci).filter(Boolean))];
  return codes.map((oaci) => {
    const row = register?.get(oaci) || null;
    return { oaci, lat: row?.lat ?? null, lon: row?.lon ?? null };
  });
}

/**
 * The key drawn as a card, around the classes of {@link bruitLegend}: the
 * airport it is about over its name, the two sentences under the zones, and
 * the plan's own document as a button.
 *
 * The kicker and the link need an airport; with none on screen — a point scan
 * that found no plan — the card keeps its subtitle and its sentences only.
 * « Cliquez sur une zone » goes once a zone is open: it has been done.
 * @param {?{oaci: string, label: string, documentUrl?: ?string}} airport
 * @param {{selected?: boolean}} [options]
 * @returns {{legendHead: object, note: string, legendLink: ?object}}
 */
export function bruitKeyCard(airport, { selected = false } = {}) {
  const m = messages().legend;
  const href = pebPlanUrl(airport?.documentUrl);
  return {
    legendHead: { kicker: airport?.label || null, subtitle: m.cardSubtitle },
    note: selected ? m.notLive : `${m.clickHint} ${m.notLive}`,
    legendLink: href ? { href, label: m.planLink } : null,
  };
}

/**
 * The band a card is about: the one its entity was drawn for (`bruit:<band
 * id>:…`), or — for a click on the bare wash — the strictest band under the
 * point, the one `bruitGroundCard` headlines. Null for an airport's tag.
 * @param {?{id?: string, lon?: number, lat?: number}} card
 * @param {?object} payload
 * @returns {?object}
 */
export function bruitCardBand(card, payload) {
  const bands = payload?.peb || [];
  const drawn = /^bruit:(peb:[^:]+)/.exec(String(card?.id ?? ''));
  if (drawn) return bands.find((band) => band.id === drawn[1]) || null;
  if (!String(card?.id ?? '').endsWith(':ground')) return null;
  if (!Number.isFinite(card?.lon) || !Number.isFinite(card?.lat)) return null;
  return bands
    .filter((band) => pointInPolygons(band.parts, card.lon, card.lat))
    .sort(bruitBandComparator())[0] || null;
}

/**
 * A zone named for a reader: « Zone B · Bruit fort ». The airport is not in
 * it — the key card's kicker says which one.
 * @param {?object} band
 * @returns {?string}
 */
export function bruitZoneTitle(band) {
  const zone = typeof band?.zone === 'string' ? band.zone.trim().toUpperCase() : '';
  if (!zone) return null;
  const m = messages().legend;
  return m.loudness[zone] ? m.zoneTitle(zone, m.loudness[zone]) : m.unknown;
}

/**
 * The card of the zone the reader clicked, as the key prints it — TWO LINES
 * under its name (2026-09-24, « simplifie encore »): what the zone means for a
 * new home, then how loud it is on average. The globe card's other lines stay
 * on the globe card, which is what a phone or a folded key still shows: the
 * arrêté is one press away on « Consulter le plan officiel » right above, and
 * « avions seulement … tracé à ~11 m près » answers questions a reader of this
 * card did not ask.
 *
 * The level is printed in Lden only. A pre-2002 plan's « ancien indice 89 à
 * 96 » is a number on a scale nobody reads, and a number of unsettled unit is
 * never printed at all (`bandText`).
 *
 * The airport is named over the zone only when it is not the one the card
 * above is about — Le Bourget's zone A inside Roissy's zone D.
 * @param {{id: string, title: string, details?: string[]}} card The shell's card.
 * @param {?{label: string}} airport The zone's airport, when the card above
 *   names another one.
 * @param {?object} [band] From {@link bruitCardBand}.
 * @returns {object} A `legendSelection`.
 */
export function bruitZoneSelection(card, airport, band = null) {
  const zone = typeof band?.zone === 'string' ? band.zone.trim().toUpperCase() : '';
  const lines = band
    ? [
      messages().legend.zoneRule[zone] || null,
      band.index === 'lden' ? bandText(band) : null,
    ].filter(Boolean)
    : (Array.isArray(card?.details) ? card.details : []);
  return {
    key: String(card?.id ?? ''),
    kicker: airport?.label || null,
    title: bruitZoneTitle(band) || card?.title || '',
    lines,
  };
}

/**
 * The card of an airport's tag, clicked, as the key prints it: its name and
 * how many zones its plan has.
 * @param {{id: string}} card
 * @param {{oaci?: string, zones?: number}} aerodrome A `foldAerodromes` entry.
 * @param {string} label From `pebAirportLabel`.
 * @returns {object} A `legendSelection`.
 */
export function bruitAirportSelection(card, aerodrome, label) {
  const count = Number.isFinite(aerodrome?.zones) ? aerodrome.zones : (aerodrome?.bands?.length ?? 0);
  return {
    key: String(card?.id ?? ''),
    title: label,
    lines: count > 0 ? [messages().legend.airportZones(count)] : [],
  };
}

/**
 * The airport menu at the head of the row: every airport with a plan, the
 * one the view is about chosen.
 * @param {ReadonlyArray<object>} airports `/api/bruit-fr/index` rows.
 * @param {?string} value ICAO code shown as chosen.
 * @returns {?object} A `picker` for the Layers panel, or null before the
 *   register has arrived.
 */
export function bruitAirportPicker(airports, value) {
  const options = pebAirportOptions(airports, getLocale());
  if (!options.length) return null;
  const m = messages().picker;
  return {
    id: 'airport',
    label: m.label,
    title: m.title,
    icon: lucideIconMask('plane'),
    placeholder: m.placeholder,
    value: value || '',
    options,
  };
}

/**
 * The status the manager reads, and it is GUIDANCE and not a fault.
 *
 * `zoom-in` and `empty` are in the manager's `GUIDANCE_STATUSES`, so they paint
 * a green ON chip rather than DEGRADED. Putting the zoom prompt in
 * `stats.error` instead — which is the easy mistake — would report a working
 * layer as broken every time the camera is above its ceiling, which is most of
 * the time on a globe.
 */
export function bruitStatus(stats) {
  if (!stats) return 'idle';
  if (stats.dormant === true) return 'zoom-in';
  if (stats.available?.peb === false) return 'unavailable';
  if (!stats.lastUpdate) return 'idle';
  // `zonesHere` counts the bands under a MARKER, and the overview has none —
  // reading it there would report every dezoomed view as empty while a dozen
  // plans are on screen.
  if (stats.area === true) return stats.zonesDrawn > 0 ? 'ok' : 'empty';
  return stats.zonesHere > 0 ? 'ok' : 'empty';
}

/**
 * The scan altitude ceiling, restated here so the guidance line and the shell
 * cannot drift apart.
 *
 * 12 000 m, the shared address-scan value, KEPT rather than raised — and the
 * measurement says it is the right order. Over the 293 bands the 224 probes
 * returned, the widest side of a band is 0.27 km at the smallest, 1.9 km at the
 * median and 4.74 km at the 90th percentile, so at 12 km of altitude the zone
 * under the crosshair is a shape on screen rather than a speck. The two
 * national outliers — Roissy's zone C at 41.5 km and Le Bourget's zone D at
 * 65.8 km — are drawn WHOLE anyway, because the service does not clip the
 * geometry it returns to the box it was asked through.
 */
export const ADDRESS_SCAN_CEILING_M = 12_000;

/**
 * Where the OVERVIEW stops, and the number is the widest plan in France.
 *
 * 250 km. Le Bourget's zone D is 65.8 km across — the national outlier, and
 * precisely the shape a reader dezooms to see. Cesium's default frustum spends
 * 60° on the wider screen dimension, so the ground half-width under the camera
 * is `altitude × tan 30°` and the view is about 1.15 × 250 km tall: that band
 * spans roughly a quarter of the screen at this ceiling, which is a shape, and
 * a twentieth at a thousand kilometres, which is a smudge. Above it the layer
 * goes dormant exactly as it did before — but at twenty times the altitude, and
 * for the honest reason that there is nothing left to see rather than because
 * the probe stopped meaning anything.
 */
export const BRUIT_OVERVIEW_CEILING_M = 250_000;

/**
 * Where the overview stops WAITING for the fine outline and starts sharpening
 * behind the reader.
 *
 * 30 km, and it is a third boundary rather than a move of the first one. The
 * obvious way to put a fine outline under a camera at 20 km is to raise
 * {@link ADDRESS_SCAN_CEILING_M}, and it is the wrong way: the point scan owes
 * its sharpness to a probe pinned at 1e-4°/px, whose buffer is 11 m of ground,
 * and that buffer is exactly what makes it return ONE ring of a plan that has
 * four. Measured over a 25-aerodrome sample on 2026-09-02, distinct bands
 * returned: 37 at the probe scale against 88 at the overview's, and nine
 * aerodromes — Toussus, Chavenay and Le Plessis among them — answer NOTHING at
 * the fine scale at all. Extending the point mode to 30 km would buy a sharp
 * outline by dropping zones B, C and D on the way up.
 *
 * So the question stays the overview's — one probe per aerodrome, every band —
 * and what changes below this altitude is WHEN the second pass runs. Under
 * 30 km the proxy plays it in front of the reader and the payload arrives
 * already at 1:{@link BRUIT_PROBE_SCALE_DENOMINATOR}; above it the pass stays
 * in the background, exactly as before, and the outline sharpens a few seconds
 * later. Both are bounded: see `BRUIT_FINE_FOREGROUND_BUDGET_MS` in
 * `vite.config.js`, which is what stops a cold Paris basin from turning a
 * camera settle into a nine-second hang.
 *
 * 30 km is where the WAIT stops paying. The ground half-diagonal under a
 * default Cesium frustum is 0.7 × the altitude, so the view is about 42 km
 * across here — one aerodrome's plan and its neighbours, which is the frame a
 * reader dezooms to. At 60 km it is 84 km across, the median band (1.9 km
 * wide) is under a fiftieth of it, and the difference between 37 vertices and
 * 381 is no longer a difference anybody can see — while the pass costs the
 * same four seconds.
 */
export const BRUIT_FINE_OVERVIEW_CEILING_M = 30_000;

/**
 * Radius the overview asks for, in km, from the camera's altitude.
 *
 * `tan 30° = 0.577` is the ground half-width under a default Cesium frustum;
 * the half-DIAGONAL of a 16:9 canvas is 1.147 × that, so 0.7 × the altitude
 * covers the corners of the screen rather than the middle of its edges. The
 * proxy then reaches another 35 km past whatever is asked for, because a plan
 * is drawn around its aerodrome and the aerodrome can be off-screen while its
 * zone D is not.
 *
 * ROUNDED UP TO A 25 KM LADDER, and that is a cache decision, not a geometric
 * one. The radius is part of the proxy's cache key, so a continuously varying
 * one would mint a fresh entry on every scroll of the wheel; twelve possible
 * values means a reader who flies up and back down is answered from memory.
 *
 * @param {number} altitudeM
 * @returns {number}
 */
export const BRUIT_AREA_RADIUS_STEP_KM = 25;
export function bruitAreaRadiusKm(altitudeM) {
  const km = (Number(altitudeM) || 0) / 1000 * 0.7;
  const stepped = Math.ceil(km / BRUIT_AREA_RADIUS_STEP_KM) * BRUIT_AREA_RADIUS_STEP_KM;
  return Math.max(BRUIT_AREA_RADIUS_STEP_KM, stepped);
}

/**
 * The extra query parameters that choose the mode.
 *
 * `km` present is the overview; absent is the point scan. `fine` on top of it
 * asks the proxy to run the second pass BEFORE it answers rather than behind
 * the answer. Nothing else changes — same route, same shell — and because the
 * shared shell rescans whenever the query string changes, crossing
 * {@link ADDRESS_SCAN_CEILING_M} or {@link BRUIT_FINE_OVERVIEW_CEILING_M} in
 * either direction re-asks the question by itself.
 *
 * `fine` is a REQUEST AND NOT AN INSTRUCTION: the proxy honours it only at the
 * first rung of the radius ladder and only within its own budget, so an answer
 * that carries it can still hold a coarse band. That is why the card reads each
 * band's own `scaleDenominator` rather than this flag.
 *
 * @param {{altitudeM: number}} point
 * @returns {Record<string, string>}
 */
export function bruitScanParams(point) {
  const altitudeM = Number(point?.altitudeM);
  if (!Number.isFinite(altitudeM) || altitudeM <= ADDRESS_SCAN_CEILING_M) return {};
  const params = { km: String(bruitAreaRadiusKm(altitudeM)) };
  if (altitudeM <= BRUIT_FINE_OVERVIEW_CEILING_M) params.fine = '1';
  return params;
}

/**
 * The loading / guidance line the panel shows beside the row.
 * @param {object} stats
 * @returns {?string}
 */
export function bruitGuidanceLabel(stats) {
  const m = messages().guidance;
  if (stats?.dormant === true) {
    return m.zoomIn(formatNumber(BRUIT_OVERVIEW_CEILING_M / 1000));
  }
  if (stats?.available?.peb === false) {
    return stats?.area === true ? m.serviceDownArea(stats.missing) : m.serviceDown;
  }
  if (stats?.area === true) {
    if (!stats.lastUpdate) return null;
    if (!(stats.aerodromes > 0)) {
      return stats.nearestKm != null
        ? m.noneInFrame(formatDecimal(Number(stats.nearestKm), 1))
        : m.emptyFrame;
    }
    // The line that keeps a capped map from reading as a complete one.
    if (stats.dropped > 0) {
      return m.drawnAndDropped(stats.aerodromes, stats.dropped);
    }
    // SAID OUT LOUD, because the shape is about to change under the reader.
    // A coarse overview is complete — every band is drawn — but its outlines
    // are visibly faceted, and a reader who sees them redraw finer a few
    // seconds later is owed the reason rather than left wondering what moved.
    if (stats.refining > 0) {
      return m.refining(stats.refining);
    }
    return null;
  }
  if (stats?.lastUpdate && !(stats.zonesHere > 0)) {
    return stats.nearestKm != null
      ? m.nonePoint(formatDecimal(Number(stats.nearestKm), 1))
      : m.emptyPoint;
  }
  return null;
}


/**
 * How long to wait before asking again while the overview is still sharpening.
 *
 * 5 s. The poll costs no upstream call — the proxy rebuilds the whole overview
 * from its per-aerodrome zone cache — so the only budget it spends is the
 * layer's own rate limit, 40 a minute, against which twelve polls a minute is
 * comfortable. Long enough that a refinement has usually landed at least one
 * more aerodrome between two of them, so the shape sharpens in visible steps
 * rather than flickering.
 */
export const BRUIT_REFINE_POLL_MS = 5_000;

/**
 * Polls with NO PROGRESS before the layer stops asking.
 *
 * Six, so about thirty seconds. The give-up is not a failure state and nothing
 * on screen changes when it fires: a coarse overview is a complete and correct
 * overview — every band of every aerodrome is drawn, the letters, the colours
 * and the cards are the same — it is only the outline that is generalised, and
 * the card says so. What this guards against is a layer that polls forever
 * because the service is refusing the fine probes, which would be a request
 * every five seconds for as long as the tab is open.
 *
 * Counted on PROGRESS and not on attempts: an overview of twenty aerodromes
 * legitimately takes minutes to sharpen, and each one that lands resets the
 * count. Only a run of six polls that moved nothing stops it.
 */
export const BRUIT_REFINE_POLL_STRIKES = 6;

/** Poll state — the layer draws one overview at a time, so one of each. */
let _refineTimer = null;
let _refineRemaining = null;
let _refineStrikes = 0;

/** Stop polling and forget where we were. Called on every draw. */
function stopBruitRefinePoll() {
  if (_refineTimer) clearTimeout(_refineTimer);
  _refineTimer = null;
}

/**
 * Come back for the sharpened outline, and know when to stop.
 *
 * THE PROBLEM THIS SOLVES. The overview's outlines are generalised a hundred
 * times coarser than a point scan's, because the scale that makes the buffer
 * wide enough to return zones B, C and D is the same scale GeoServer
 * generalises to — see the proxy's second-pass header. The proxy therefore
 * serves the coarse answer at once and re-fetches each band at the fine scale
 * behind it. Nothing about the QUESTION changes when that lands, so the shell's
 * two refetch triggers — the camera moved, the query string changed — are both
 * blind to it, and a reader who settles the camera and stops would keep the
 * facets forever. This is the third trigger, and it is the layer's own because
 * the layer is the only thing that knows the answer can improve.
 *
 * Exported for the test, which drives it with a fake clock rather than waiting
 * thirty seconds to watch it give up.
 *
 * @param {{payload: object, rescan: () => void}} context
 * @param {{setTimer?: Function, clearTimer?: Function}} [clock]
 */
export function scheduleBruitRefinePoll({ payload, rescan }, clock = {}) {
  const setTimer = clock.setTimer || ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = clock.clearTimer || ((handle) => clearTimeout(handle));
  if (_refineTimer) clearTimer(_refineTimer);
  _refineTimer = null;
  const remaining = Number(payload?.refining);
  if (payload?.area !== true || !(remaining > 0) || typeof rescan !== 'function') {
    _refineRemaining = null;
    _refineStrikes = 0;
    return false;
  }
  // Progress resets the budget; a poll that moved nothing spends one. `null` is
  // the first sight of this overview, which is progress by definition.
  if (_refineRemaining === null || remaining < _refineRemaining) _refineStrikes = 0;
  else _refineStrikes += 1;
  _refineRemaining = remaining;
  if (_refineStrikes >= BRUIT_REFINE_POLL_STRIKES) return false;
  _refineTimer = setTimer(() => {
    _refineTimer = null;
    rescan();
  }, BRUIT_REFINE_POLL_MS);
  return true;
}

/** Last payload drawn, for the row legend the shell has no hook for. */
let _payload = null;
let _peb = null;

/**
 * The arrêté register, by ICAO code, once `/api/bruit-fr/index` has answered:
 * the airport menu's lines, the key's kicker and the plan's link.
 * @type {?Map<string, object>}
 */
let _register = null;
let _registerRequested = false;
/** The airport the reader picked in the menu, while its flight is not over. */
let _picked = null;
let _pickPending = false;
/** The zone card the key carries (`onSelectionChange`), or null. */
let _selectedCard = null;
let _viewer = null;
let _rowControlsListener = null;

/** Ask the Layers panel to repaint this row. */
function repaintRow() {
  try { _rowControlsListener?.(); } catch { /* the panel repaints on its own tick anyway */ }
}

/**
 * Fetch the register once per session. A refusal is retried on the next
 * enable: the menu and the kicker wait for it, the plan is drawn without it.
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<void>}
 */
export async function loadBruitRegister(fetchImpl = (...args) => fetch(...args)) {
  if (_register || _registerRequested) return;
  _registerRequested = true;
  try {
    const response = await fetchImpl(`${BRUIT_FR_ENDPOINT}/index`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    const rows = (Array.isArray(body?.airports) ? body.airports : [])
      .filter((row) => typeof row?.oaci === 'string' && row.oaci);
    _register = new Map(rows.map((row) => [row.oaci.toUpperCase(), row]));
    renameAirportChips();
    repaintRow();
  } catch (error) {
    _registerRequested = false;
    console.warn('[Data:bruit-fr] airport register', error?.message || error);
  }
}

/**
 * Rename the tags an overview drew before the register arrived: they carry the
 * register's abbreviation until then (« P. Ch. De-Gaulle »).
 */
function renameAirportChips() {
  for (const entity of _chipEntities) {
    const oaci = String(entity.properties?.oaci?.getValue?.() ?? '').toUpperCase();
    const row = _register?.get(oaci);
    const chip = row ? bruitAirportChip(pebAirportLabel(row), pebAirportCode(row)) : null;
    if (!chip || !entity.billboard) continue;
    entity.billboard.image = chip.image;
    entity.billboard.width = chip.width;
    entity.billboard.height = chip.height;
  }
  governorRequestRender('bruit-fr-airport-tags');
}

/**
 * The airport the key and the menu are about right now, with its label, or
 * null. See `focusedPebAirport` for the rule.
 * @returns {?{oaci: string, label: string, code: ?string, documentUrl: ?string}}
 */
function bruitFocusAirport() {
  const drawn = bruitDrawnAirports(_payload, _register);
  // WHAT THE READER LOOKS AT, NOT WHAT WAS ASKED ABOUT. The scan centre is
  // pulled at most 6 km from the camera's nadir (`cameraScanPoint`), then the
  // overview snaps it to a 5.5 km grid: from the mock's framing of Roissy —
  // 22 km up, 50° down — it lands 12 km south of the runways, and the nearest
  // airport to it was Chelles-le-Pin. The ground at the centre of the screen
  // is the airport the reader framed.
  const centre = bruitScreenCentre()
    || (_payload?.area === true ? _payload?.centre : _payload?.point);
  const oaci = focusedPebAirport(drawn, centre, _picked);
  if (!oaci) return null;
  const row = _register?.get(oaci)
    || (_payload?.aerodromes || []).find((entry) => entry?.oaci === oaci)
    || { oaci };
  return {
    oaci,
    label: pebAirportLabel(row),
    code: pebAirportCode(row),
    documentUrl: row.documentUrl ?? null,
  };
}

/** The last screen-centre reading, by camera pose. */
let _screenCentre = { pose: null, centre: null };

/**
 * The ground at the centre of the screen, or null without a viewer.
 *
 * Read ONCE PER CAMERA POSE. The panel asks on every refresh, about once a
 * second while the row is lit, and on the photoreal stack the reading is a
 * depth-buffer pick — a render pass of its own. A camera that has not moved
 * is looking at the same ground.
 * @returns {?{lat: number, lon: number}}
 */
function bruitScreenCentre() {
  const pose = cameraPoseKey(_viewer?.camera);
  if (pose && pose === _screenCentre.pose) return _screenCentre.centre;
  const canvas = _viewer?.scene?.canvas;
  const width = canvas?.clientWidth || canvas?.width || 0;
  const height = canvas?.clientHeight || canvas?.height || 0;
  if (!(width > 0 && height > 0)) return null;
  let centre = null;
  try {
    const hit = sceneGroundPoint(_viewer, new Cesium.Cartesian2(width / 2, height / 2));
    centre = hit && Number.isFinite(hit.lat) && Number.isFinite(hit.lon) ? { lat: hit.lat, lon: hit.lon } : null;
  } catch { /* nothing under the centre */ }
  _screenCentre = { pose, centre };
  return centre;
}

/**
 * The key's card for the open selection: over a zone, the airport THAT zone
 * belongs to — which is not always the one the view is about (Le Bourget's
 * zone A sits inside Roissy's zone D); over an airport's tag, no kicker, since
 * the tag's title names it.
 * @param {object} card
 * @returns {object}
 */
function bruitSelectedZone(card) {
  const aerodrome = bruitCardAerodrome(card);
  if (aerodrome) return bruitAirportSelection(card, aerodrome, bruitAerodromeLabel(aerodrome));
  const band = bruitCardBand(card, _payload);
  const oaci = String(band?.oaci ?? '').toUpperCase();
  const row = oaci ? (_register?.get(oaci) || { oaci, name: band.airport }) : null;
  // Named only when the card above names another airport.
  const other = row && oaci !== bruitFocusAirport()?.oaci;
  return bruitZoneSelection(card, other ? { label: pebAirportLabel(row) } : null, band);
}

/**
 * The overview aerodrome an airport tag's card belongs to, or null.
 * @param {?{id?: string}} card
 * @returns {?object}
 */
function bruitCardAerodrome(card) {
  const match = /^bruit:aerodrome:(.+)$/.exec(String(card?.id ?? ''));
  if (!match) return null;
  return (_payload?.aerodromes || []).find((entry) => String(entry?.oaci) === match[1]) || null;
}

/**
 * An overview aerodrome's name, from the register when it has arrived.
 * @param {object} aerodrome
 * @returns {string}
 */
function bruitAerodromeLabel(aerodrome) {
  return pebAirportLabel({
    ...aerodrome,
    ...(_register?.get(String(aerodrome.oaci ?? '').toUpperCase()) || {}),
  });
}

/**
 * Fly to the airport picked in the menu, framed the way `pebAirportCamera`
 * says. The menu shows the pick while the camera travels; once it has landed,
 * the view decides again.
 * @param {string} oaci
 * @returns {boolean} Whether a flight started.
 */
function flyToBruitAirport(oaci) {
  const row = _register?.get(String(oaci).toUpperCase()) || null;
  const view = row ? pebAirportCamera(row) : null;
  const camera = _viewer?.camera;
  if (!view || !camera) return false;
  _picked = row.oaci.toUpperCase();
  _pickPending = true;
  const settle = () => {
    _pickPending = false;
    repaintRow();
  };
  try { camera.cancelFlight?.(); } catch { /* no flight in progress */ }
  camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(view.lon, view.lat, view.height),
    orientation: {
      heading: Cesium.Math.toRadians(view.headingDeg),
      pitch: Cesium.Math.toRadians(view.pitchDeg),
      roll: 0,
    },
    duration: 2.4,
    complete: settle,
    cancel: settle,
  });
  repaintRow();
  return true;
}

/**
 * Draw one scan. Exported so a test can drive the production path against a
 * plain `CustomDataSource` with no WebGL context anywhere.
 *
 * @param {{payload: object, dataSource: object, point: object, viewer: ?object}} context
 * @returns {number} Entities created.
 */
export function renderBruit({ payload, dataSource, point, viewer }) {
  const classificationType = bruitClassificationTypeForScene(viewer?.scene);
  _payload = payload;
  // A point scan, or a dormant clear, ends any poll the overview left running:
  // `afterDraw` reinstates it on the next overview, and a timer that outlives
  // the draw it belongs to would rescan a question the reader has left.
  stopBruitRefinePoll();
  if (payload?.area === true) {
    _peb = null;
    return renderBruitArea({ payload, dataSource, classificationType });
  }
  const peb = chooseBruitAnswer(payload?.peb);
  _peb = peb;
  // A point scan draws no airport tag.
  _chipEntities.length = 0;
  let drawn = 0;
  const reference = point && Number.isFinite(point.lon) && Number.isFinite(point.lat)
    ? { lon: point.lon, lat: point.lat } : null;
  const spots = bruitBadgeSpots(
    bruitBadgeOrder(payload?.peb, () => reference),
    BRUIT_BADGE_SEPARATION_M.point,
    reference ? [reference] : [],
  );

  for (const band of bruitDrawOrder(payload?.peb)) {
    const emphasis = bruitEmphasis(band, peb.winner);
    const css = bruitZoneColorCss(band.zone);
    const description = bruitBandDescription(band, peb);
    const name = bruitBandLabel(band);
    addBruitBadges(dataSource, band, spots.get(band.id), {
      name,
      description,
      properties: { kind: 'peb-zone-badge', zone: band.zone, atPoint: band.atPoint },
      scaleByDistance: new Cesium.NearFarScalar(800, 1.0, 14_000, 0.6),
      translucencyByDistance: new Cesium.NearFarScalar(9000, 1.0, 20_000, 0.0),
    });
    // i18n-ignore-next-line — an entity id prefix, not a word.
    drawn += drawBruitParts(dataSource, `bruit:${band.id}`, band.parts, {
      css,
      fillAlpha: BRUIT_FILL_ALPHA[emphasis],
      width: emphasis === 'nearby' ? BRUIT_OUTLINE_WIDTH_PX.nearby : BRUIT_OUTLINE_WIDTH_PX.inside,
      // The dash is the second channel, beside the wash, saying "the service
      // found this near your pixel, you are not standing in it".
      dashed: emphasis === 'nearby',
      classificationType,
      name,
      description,
      properties: { kind: 'peb-zone', zone: band.zone, atPoint: band.atPoint, emphasis },
    });
  }

  // ALWAYS, when there is a point — unlike the zoning layer, which plants no
  // marker on an address with nothing on it. Here the empty answer IS an
  // answer: "no noise plan covers this ground, the nearest aerodrome that has
  // one is 12.4 km away" is the sentence a reader came for, and there is
  // nothing else on screen to hang it on.
  if (point) {
    dataSource.entities.add({
      // i18n-ignore-next-line — an entity id, not a word.
      id: 'bruit:scan-point',
      position: Cesium.Cartesian3.fromDegrees(point.lon, point.lat),
      billboard: {
        image: bruitMarkerGlyph(),
        width: 26,
        height: 26,
        color: Cesium.Color.fromCssColorString(
          peb.winner ? bruitZoneColorCss(peb.winner.zone) : BRUIT_UNKNOWN_ZONE_COLOR,
        ),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      properties: { kind: 'bruit-scan-point' },
      name: bruitMarkerTitle(payload, peb),
      description: bruitScanDescription(payload, peb),
    });
    drawn += 1;
  }
  return drawn;
}

/**
 * Where a zone letter is legible in the overview, and where it is litter.
 *
 * Visible from 10 km — just under the mode boundary, so the letters are already
 * on screen as a reader climbs through it — and gone by 200 km, where a dozen
 * plans' worth of letters would be a cloud of characters over shapes a few
 * pixels across. The aerodrome markers do NOT fade with them: past that
 * distance the marker is the only thing left that names what is on screen.
 */
export const BRUIT_AREA_LABEL_SCALE = Object.freeze({ near: 10_000, far: 150_000 });
export const BRUIT_AREA_LABEL_FADE = Object.freeze({ near: 100_000, far: 200_000 });

/**
 * Draw an overview: every band of every aerodrome in view, plus one marker per
 * aerodrome.
 *
 * DRAW ORDER IS THE SAME ARGUMENT AS POINT MODE and it matters more here. Two
 * ground-classification polygons over the same ground blend, and an overview
 * puts every band of every plan on screen at once — including, at Saint-Cyr and
 * Cannes, the two the register publishes overlapping with no hole cut between
 * them. Quietest first, so the strictest zone stays legible on the ground its
 * rule applies to.
 *
 * @returns {number} Entities created.
 */
export function renderBruitArea({ payload, dataSource, classificationType }) {
  let drawn = 0;
  const byBand = new Map();
  for (const aerodrome of payload?.aerodromes || []) {
    for (const band of aerodrome.bands || []) byBand.set(band.id, aerodrome);
  }
  const aerodromePoint = (band) => {
    const aerodrome = byBand.get(band.id);
    return aerodrome && Number.isFinite(aerodrome.lon) && Number.isFinite(aerodrome.lat)
      ? { lon: aerodrome.lon, lat: aerodrome.lat } : null;
  };
  const spots = bruitBadgeSpots(
    bruitBadgeOrder(payload?.peb, aerodromePoint),
    BRUIT_BADGE_SEPARATION_M.area,
    (payload?.aerodromes || [])
      .filter((entry) => Number.isFinite(entry.lon) && Number.isFinite(entry.lat))
      .map((entry) => ({ lon: entry.lon, lat: entry.lat })),
  );
  for (const band of bruitDrawOrder(payload?.peb)) {
    const aerodrome = byBand.get(band.id) || null;
    const emphasis = bruitAreaEmphasis(band, aerodrome);
    const css = bruitZoneColorCss(band.zone);
    const description = bruitBandDescription(band, null, { area: true });
    const name = bruitBandLabel(band);
    addBruitBadges(dataSource, band, spots.get(band.id), {
      name,
      description,
      properties: { kind: 'peb-zone-badge', zone: band.zone, area: true },
      scaleByDistance: new Cesium.NearFarScalar(
        BRUIT_AREA_LABEL_SCALE.near, 1.0, BRUIT_AREA_LABEL_SCALE.far, 0.65,
      ),
      translucencyByDistance: new Cesium.NearFarScalar(
        BRUIT_AREA_LABEL_FADE.near, 1.0, BRUIT_AREA_LABEL_FADE.far, 0.0,
      ),
    });
    // i18n-ignore-next-line — an entity id prefix, not a word.
    drawn += drawBruitParts(dataSource, `bruit:${band.id}`, band.parts, {
      css,
      fillAlpha: BRUIT_FILL_ALPHA[emphasis],
      // Never `nearby`: there is no marker to be beside. See
      // `bruitAreaEmphasis`.
      width: BRUIT_OUTLINE_WIDTH_PX.inside,
      dashed: false,
      classificationType,
      name,
      description,
      properties: { kind: 'peb-zone', zone: band.zone, area: true, emphasis },
    });
  }

  _chipEntities.length = 0;
  const hidden = airportsNamedElsewhere();
  for (const aerodrome of payload?.aerodromes || []) {
    if (!Number.isFinite(aerodrome.lat) || !Number.isFinite(aerodrome.lon)) continue;
    // The register's row names the field the way a reader does (`pebAirports.js`);
    // the aerodrome's own record only has the register's abbreviation.
    const row = { ...aerodrome, ...(_register?.get(String(aerodrome.oaci ?? '').toUpperCase()) || {}) };
    const label = pebAirportLabel(row);
    const code = pebAirportCode(row);
    const chip = bruitAirportChip(label, code);
    const scheduled = typeof row.iata === 'string' && /^[A-Z]{3}$/.test(row.iata);
    const entity = dataSource.entities.add({
      // i18n-ignore-next-line — an entity id, not a word.
      id: `bruit:aerodrome:${aerodrome.oaci ?? aerodrome.bands?.[0]?.id ?? drawn}`,
      position: Cesium.Cartesian3.fromDegrees(aerodrome.lon, aerodrome.lat),
      show: !hidden,
      billboard: chip
        ? {
          image: chip.image,
          width: chip.width,
          height: chip.height,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scaleByDistance: new Cesium.NearFarScalar(20_000, 1, 150_000, 0.8),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(
            0, scheduled ? BRUIT_CHIP_RANGE_M.scheduled : BRUIT_CHIP_RANGE_M.other,
          ),
        }
        : {
          image: bruitMarkerGlyph(),
          width: 24,
          height: 24,
          color: Cesium.Color.fromCssColorString(bruitZoneColorCss(aerodrome.top?.zone)),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      properties: { kind: 'bruit-aerodrome', oaci: aerodrome.oaci, area: true },
      name: bruitAerodromeTitle({ ...aerodrome, name: label }),
      description: bruitAerodromeDescription(aerodrome, payload),
    });
    _chipEntities.push(entity);
    drawn += 1;
  }

  // THE EMPTY OVERVIEW STILL NEEDS SOMEWHERE TO SAY SO. With no aerodrome in
  // reach there is no marker, no band and nothing to click, and the sentence a
  // reader came for — "the nearest plan is 84 km away" — would have nothing to
  // hang on. It goes on the centre of the view, which is the only point the
  // overview has.
  if (!(payload?.aerodromes?.length) && payload?.centre) {
    dataSource.entities.add({
      // i18n-ignore-next-line — an entity id, not a word.
      id: 'bruit:area-centre',
      position: Cesium.Cartesian3.fromDegrees(payload.centre.lon, payload.centre.lat),
      billboard: {
        image: bruitMarkerGlyph(),
        width: 22,
        height: 22,
        color: Cesium.Color.fromCssColorString(BRUIT_UNKNOWN_ZONE_COLOR),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      properties: { kind: 'bruit-area-centre', area: true },
      // The capitalised form, as a title: the same sentence the panel's
      // guidance line prints, and not the lower-case clause the area summary
      // opens with.
      name: messages().guidance.emptyFrame,
      description: bruitAreaSummary(payload),
    });
    drawn += 1;
  }
  return drawn;
}

/**
 * Extra fields merged into `getStats()`.
 *
 * `zonesHere` and `zonesDrawn` are deliberately two numbers. Under a probe that
 * returned four polygons, one number cannot tell "you are in one zone" from
 * "four zones are on screen", and the row would claim the ground under the
 * marker carries four rules.
 */
export function summarizeBruit(payload) {
  if (payload?.area === true) {
    return {
      area: true,
      // How many aerodromes are DRAWN, how many were left out by the request
      // budget, and how many were asked and did not answer. `bruitStatus` reads
      // `zonesDrawn` here rather than `zonesHere`, which counts bands under a
      // marker the overview does not have.
      aerodromes: payload.aerodromes?.length || 0,
      zonesHere: 0,
      zonesDrawn: payload.peb?.length || 0,
      dropped: payload.dropped ?? 0,
      missing: payload.missing ?? 0,
      radiusKm: payload.radiusKm ?? null,
      nearbyCount: 0,
      mixedIndex: payload.mixedIndex === true,
      disputed: payload.disputed === true,
      revised: payload.revised === true,
      nearestKm: Number.isFinite(payload?.nearest?.distanceKm) ? payload.nearest.distanceKm : null,
      nearestOaci: payload?.nearest?.oaci ?? null,
      register: payload?.register ?? null,
      scaleDenominator: payload?.scaleDenominator ?? BRUIT_AREA_SCALE_DENOMINATOR,
      // How much of what is on screen is still the coarse outline. Three
      // numbers rather than a flag, because "4 of 34 bands" and "34 of 34" are
      // the difference between a shape that is nearly right and one that has
      // not been refined at all, and the guidance line words them differently.
      refining: payload?.refining ?? 0,
      refinedBands: payload?.refinedBands ?? 0,
      coarseBands: payload?.coarseBands ?? 0,
      // WHICH TEMPO produced this answer, and it is the only way to tell the
      // two overviews apart from the outside: they draw the same bands from the
      // same probes, and differ in whether the second pass ran before the
      // payload or behind it. Not a claim that every band is fine — that is
      // `coarseBands` — which is why `qa-bruit-overview.mjs` reads both.
      fine: payload?.fine === true,
      available: payload?.available ?? null,
    };
  }
  const peb = chooseBruitAnswer(payload?.peb);
  const airports = new Set((payload?.peb || [])
    .filter((band) => band.atPoint === true).map((band) => band.oaci).filter(Boolean));
  return {
    zonesHere: peb.eligible,
    zonesDrawn: payload?.peb?.length || 0,
    nearbyCount: payload?.nearbyCount ?? 0,
    winnerZone: peb.winner?.zone ?? null,
    winnerRule: peb.rule,
    winnerOaci: peb.winner?.oaci ?? null,
    // The band, in its own unit, or null. Never a bare number.
    winnerBand: peb.winner ? bandText(peb.winner) : null,
    index: peb.winner?.index ?? null,
    mixedIndex: payload?.mixedIndex === true,
    disputed: payload?.disputed === true,
    revised: payload?.revised === true,
    overlapping: peb.overlapping,
    airportsHere: airports.size,
    nearestKm: Number.isFinite(payload?.nearest?.distanceKm) ? payload.nearest.distanceKm : null,
    nearestOaci: payload?.nearest?.oaci ?? null,
    register: payload?.register ?? null,
    scaleDenominator: payload?.scaleDenominator ?? BRUIT_PROBE_SCALE_DENOMINATOR,
    available: payload?.available ?? null,
  };
}

const bruitScanLayer = createAddressScanLayer({
  id: BRUIT_FR_LAYER_ID,
  // i18n-ignore-start — registry fields, not copy: see src/data/layerTaxonomy.i18n.js.
  name: 'Bruit des aéroports (PEB)',
  icon: '🔊',
  source: BRUIT_SOURCE,
  // i18n-ignore-end
  endpoint: BRUIT_FR_ENDPOINT,
  updateInterval: UPDATE_INTERVAL_MS,
  // The OVERVIEW ceiling, not the point one. Below `ADDRESS_SCAN_CEILING_M`
  // `bruitScanParams` sends no `km` and the proxy answers a point scan; above
  // it, the same route answers about the aerodromes in view. Only past 250 km
  // does the shell go dormant and clear the draw.
  maxAltitudeM: BRUIT_OVERVIEW_CEILING_M,
  params: bruitScanParams,
  // The wash is ground-classification geometry and a classification type is
  // read once, when the primitive is built. Switching to the Google photoreal
  // tileset hides the globe, and a wash addressed to terrain then draws
  // nothing — the layer looks switched off. Same reasoning as `urbanismeGpu`.
  redrawOnMapStack: true,
  render: renderBruit,
  summarize: summarizeBruit,
  // The wash is a polygon, and a polygon entity has no position to hang a card
  // on. Without this hook the interior of every band is inert — see
  // `bruitGroundCard`.
  groundCard: bruitGroundCard,
  // The ONLY layer on this shell that uses `rescan`, and the reason is in
  // `scheduleBruitRefinePoll`: its upstream improves an answer it has already
  // sent, which neither of the shell's own refetch triggers can see.
  afterDraw: scheduleBruitRefinePoll,
  // THE ZONE'S CARD IS IN THE KEY, ITS NAME ON THE GLOBE (2026-09-24), as the
  // antennas' and the permits' are: the key already holds the zones by
  // loudness, and the card of the one clicked lands under them; the globe
  // keeps only the zone's headline over the ground it names.
  // Asked BEFORE `onSelectionChange` on a click on the wash, so it reads the
  // card it is handed and not the selection state.
  onSelectionChange: (card) => { _selectedCard = card || null; },
  compactCard: (card) => {
    if (!mapKeyCarriesSelection()) return false;
    const aerodrome = bruitCardAerodrome(card);
    if (aerodrome) return bruitAerodromeLabel(aerodrome);
    return bruitZoneTitle(bruitCardBand(card, _payload)) || true;
  },
});

/**
 * The layer module.
 *
 * The scan shell is wrapped rather than returned directly, for two things it
 * does not have: a colour legend for the toggle row, and a `status` the manager
 * can read as GUIDANCE. Every lifecycle method is the shell's own closure,
 * spread through unchanged.
 */
const bruitFranceLayer = {
  ...bruitScanLayer,

  getStats() {
    const stats = bruitScanLayer.getStats();
    return {
      ...stats,
      status: bruitStatus(stats),
      loadingLabel: bruitGuidanceLabel(stats),
    };
  },

  async enable(viewer, options) {
    _viewer = viewer || null;
    loadBruitRegister();
    return bruitScanLayer.enable(viewer, options);
  },

  /**
   * The row's airport menu, and the key drawn as a card — only the zones
   * actually on screen.
   * @returns {object}
   */
  getRowControls() {
    const airports = _register ? [..._register.values()] : [];
    // Read back through the shell's own stats rather than a private flag: the
    // shell clears its draw when the camera climbs above the ceiling and does
    // NOT call `render`, so a legend built from the last payload alone would
    // keep describing a scan that is no longer on screen.
    if (bruitScanLayer.getStats().dormant === true) {
      return { chips: [], legend: [], picker: bruitAirportPicker(airports, _pickPending ? _picked : null) };
    }
    const focus = bruitFocusAirport();
    const legend = bruitLegend(_payload);
    return {
      chips: [],
      picker: bruitAirportPicker(airports, _pickPending ? _picked : focus?.oaci),
      legend,
      ...(legend.length ? bruitKeyCard(focus, { selected: Boolean(_selectedCard) }) : {}),
      legendSelection: _selectedCard ? bruitSelectedZone(_selectedCard) : null,
      // Ground-classified area fill — see surfaceFillNotice.js.
      surfaceFill: true,
    };
  },

  /** The Layers panel hands over its repaint (`_installRowControlsListener`). */
  setRowControlsListener(listener) {
    _rowControlsListener = typeof listener === 'function' ? listener : null;
  },

  /**
   * The row's airport menu was used (`picker` in `getRowControls`).
   * @param {string} id
   * @param {string} value ICAO code.
   * @returns {boolean}
   */
  pickRowOption(id, value) {
    return id === 'airport' ? flyToBruitAirport(value) : false;
  },
};

/** Seed the drawn state, for tests that do not construct a viewer. */
export function _setBruitStateForTest(payload) {
  _payload = payload;
  _peb = chooseBruitAnswer(payload?.peb);
  return { peb: _peb };
}

/** The chosen answer for the last drawn payload. */
export function _bruitAnswersForTest() {
  return { peb: _peb };
}

/** Row controls, for tests that do not construct a viewer. */
export function _bruitRowControlsForTest() {
  return bruitFranceLayer.getRowControls();
}

/** Stats, for tests that do not construct a viewer. */
export function _bruitStatsForTest() {
  return bruitFranceLayer.getStats();
}

/**
 * Draw a payload into a fresh data source, exactly the way `enable()` does.
 * @returns {{dataSource: object, drawn: number}}
 */
export function _drawBruitForTest(payload, point, viewer = null) {
  const dataSource = new Cesium.CustomDataSource(BRUIT_FR_LAYER_ID);
  const drawn = renderBruit({ payload, dataSource, point, viewer });
  return { dataSource, drawn };
}

export default bruitFranceLayer;
