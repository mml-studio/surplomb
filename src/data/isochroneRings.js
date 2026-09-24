import * as Cesium from 'cesium';
import { createAddressScanLayer, renderedGroundM } from './addressScanLayer.js';
import {
  BIKE_ENVELOPE_BEARINGS,
  CENTRE_ADDRESS_MAX_M,
  ISOCHRONE_STEPS,
  centreTitle,
  equivalentRadiusM,
} from './isochroneFeed.js';
import { solveCatchmentFrame } from './isochroneFraming.js';
import { lucideIconMask } from './lucideIcons.js';
import { getOverlayPaintRect } from '../overlays/worldOverlay.js';
import { formatDate, formatNumber } from '../i18n/format.js';
import messages from './isochroneRings.i18n.js';

/**
 * Zone de chalandise — the ground you can actually reach, instead of a circle.
 *
 * WHY THIS LAYER EXISTS, AND WHY IT DID NOT UNTIL NOW. The `/api/isochrone`
 * proxy has been in this repository since 2026-09-01 and nothing has ever drawn
 * it: a service with no surface. The whole point of an isochrone is that it is
 * the one thing a circle cannot say — a circle at 800 m crosses railways,
 * rivers and motorways as if they were pavement, and the Géoplateforme runs
 * Valhalla over IGN's own BD TOPO network and answers the polygon actually
 * reachable. Measured over the Lyon Presqu'île on 2026-09-02: five minutes on
 * foot is 0.28 km², ten is 0.94, fifteen is 2.16.
 *
 * THE CYCLING RING COMES FROM SOMEWHERE ELSE, AND IT IS DRAWN DIFFERENTLY. IGN
 * has no cycling cost model at any resource — re-probed 2026-09-02, still
 * `value should be one of car,pedestrian` — so a cycling ring is measured on
 * the OSM cycling network through the FOSSGIS OSRM table, along 36 spokes. It
 * is an ENVELOPE, not a polygon: every vertex is a real routed duration, and
 * the straight line between two neighbouring vertices is not. It is therefore
 * drawn with a DASHED outline and its area is called a majorant rather than a
 * surface. `isochroneFeed.js` carries the measured divergence — up to +69 % of
 * area in sparse rural networks — and the card prints it.
 *
 * WHY THE CEILING IS PER MODE, AND WHY A PIN HAS NONE. A fifteen-minute walk is
 * 1.9 km across and a fifteen-minute drive is up to 16.5 km (measured over five
 * French communes on 2026-09-02, rural Cantal being the widest). One ceiling
 * for both meant the driving catchment the layer had just measured was cleared
 * off the screen the moment the reader pulled back far enough to see it — the
 * layer refusing to show its own answer. So the ceiling now follows the mode.
 * And a reader who clicks the map PINS the centre, which removes the ceiling
 * altogether: the ceiling exists to stop a camera-driven layer from firing a
 * request per nudge across a country, and a pinned centre fires nothing when
 * the camera moves.
 *
 * THE NUMBER THAT IS NOT ON ANY COMPETITOR'S MAP. In open ground a reachable
 * area grows with the SQUARE of time, so doubling the budget quadruples the
 * area. Every shortfall is the network — a river with one bridge, a railway, a
 * cul-de-sac. `ringExpansion()` reports the measured growth against that 4×,
 * per consecutive pair, and it needs no assumed walking speed and no model: it
 * is two measured areas divided by each other. A share of 84 % between 5 and
 * 10 minutes is a place fraying at its edges; a share above 100 % is a place
 * that opens up once you clear the first block.
 *
 * A CLICK NOW ALSO MOVES THE CAMERA, AND THE CARD OPENS ITSELF. Measuring the
 * ground a point reaches and then leaving it half under a panel, at whatever
 * altitude the reader happened to be at, is the layer refusing to show its own
 * answer in a second way. So a pinned centre is FRAMED: the catchment is fitted
 * to the part of the canvas the chrome is not sitting on, top-down, with a band
 * reserved at the bottom for the card — and the card is anchored on the shape's
 * lower edge rather than on its centre, so it is beside the wash instead of on
 * top of it. `isochroneFraming.js` holds that arithmetic and the reasons.
 *
 * AND THE CARD IS TITLED WITH THE ADDRESS. "Point fixé — à pied" named the
 * layer's internal state and not the reader's subject; the proxy reverse-
 * geocodes the pin through the BAN and the card is titled with the street, the
 * commune when the nearest address is too far to be the one clicked, and the
 * coordinate when there is neither.
 *
 * AND THE MOCK OF 2026-09-24 REDREW IT. The approved mock draws the layer the
 * way « Urbanisme » and « Aéroports » were redrawn: a short form under the row
 * (where the measure starts, how one travels, how long, how it was computed,
 * how it is drawn), a key that is a card (the mode and the ceiling, then one
 * area per duration), and on the globe glowing outlines tagged with their
 * duration, around a pin. Nothing opens by itself any more: the address is in
 * the panel and the areas are in the key, so the card that used to open under
 * the shape said twice what the screen already said. The pin and each tag
 * still open theirs on a click.
 *
 * WHY THE FILLS STACK. The three rings are nested, drawn far to near, each at a
 * low alpha, so the centre is the sum of three and the outer band is one. That
 * gradient IS the reachability, and it is deliberate rather than an accident of
 * overlap. Each ring carries a DISTINCT colour, which also keeps Cesium from
 * batching two of them into one ground-classification primitive — a batch
 * colours its instances by bounding rectangle, and three concentric rings share
 * a rectangle almost exactly.
 *
 * @module data/isochroneRings
 */

/** Layer id — share-link registry key and voice-tool enum value. */
export const ISOCHRONE_LAYER_ID = 'isochrone-fr';
// i18n-ignore-next-line — registry field, not copy: see src/data/layerTaxonomy.i18n.js.
export const ISOCHRONE_LAYER_NAME = 'Zone de chalandise (isochrone)';

/**
 * Refresh cadence. A road network does not change in an afternoon; this exists
 * so a session left open overnight is not holding a ring cut from a BD TOPO
 * edition that has since been replaced.
 */
const UPDATE_INTERVAL_MS = 900_000;

/**
 * The altitude a camera-following scan gives up at, PER MODE.
 *
 * Derived from the ground the ring actually covers, measured against the live
 * services on 2026-09-02 over Ustaritz, Paris 11e, Lyon, Bordeaux and rural
 * Cantal, at fifteen minutes — the widest ring the layer draws:
 *
 *   walking   1.8 × 1.9 km at the widest (Lyon)
 *   cycling   4.1 × 7.2 km (Ustaritz), 5.2 × 5.6 (Paris)
 *   driving  16.5 × 14.1 km (Cantal), 10.2 × 13.2 (Ustaritz)
 *
 * Cesium's default frustum shows about 0.65 × altitude of ground on the SHORT
 * screen axis at nadir, and less than that at the pitch anyone actually flies
 * at. So the driving ceiling has to sit near 25 km before the widest ring even
 * fits, and 45 km is that with room for the pitch. The walking ceiling is
 * unchanged at 8 km, which was never the complaint.
 */
export const ISOCHRONE_MAX_ALTITUDE_M = Object.freeze({
  foot: 8_000,
  bike: 20_000,
  car: 45_000,
});

/**
 * How far the camera has to move before the same question is asked again, per
 * mode.
 *
 * The shared default of 250 m is right for a ring 1.8 km across and is noise
 * against one 16 km across — and at a 45 km ceiling a lazy pan clears 250 m
 * without the view meaningfully changing, which would spend a request per
 * nudge on exactly the upstream this layer is most careful with.
 */
export const ISOCHRONE_MIN_SHIFT_KM = Object.freeze({
  foot: 0.25,
  bike: 0.6,
  car: 1.5,
});

/**
 * The three rings, near to far, with the colour each is drawn in.
 *
 * Teal at five minutes, blue at ten, violet at fifteen — the approved mock's
 * ramp (2026-09-24). One cool ramp, so the nesting reads as one gradient
 * rather than three unrelated shapes, and ending in violet rather than the
 * indigo it replaced, which sank into dark imagery. Alphas are low because
 * they STACK — see the module header. `widthPx` is the outline's bright core,
 * `glowPx` the halo it sits in.
 */
export const ISOCHRONE_RING_STYLES = Object.freeze([
  // i18n-ignore-next-line — a CSS hex the detector reads as a French word.
  Object.freeze({ seconds: 300, color: '#3ce0c8', fillAlpha: 0.2, widthPx: 2, glowPx: 26 }),
  Object.freeze({ seconds: 600, color: '#4f8dff', fillAlpha: 0.13, widthPx: 2, glowPx: 26 }),
  Object.freeze({ seconds: 900, color: '#b46bff', fillAlpha: 0.1, widthPx: 2, glowPx: 26 }),
]);

/**
 * « Durée maximale »: the durations the drawing may stop at, in minutes. The
 * three rings are always measured — they come back in one answer — and the
 * choice only says how many of them are drawn, so switching costs no request.
 */
export const ISOCHRONE_MAX_MINUTES = Object.freeze(['5', '10', '15']);
export const ISOCHRONE_DEFAULT_MAX = '15';

/** « Vue »: the zones washed in their colour, or only their outlines. */
export const ISOCHRONE_VIEWS = Object.freeze(['zones', 'contours']);
export const ISOCHRONE_DEFAULT_VIEW = 'zones';

const STYLE_BY_SECONDS = new Map(ISOCHRONE_RING_STYLES.map((style) => [style.seconds, style]));
const FALLBACK_STYLE = ISOCHRONE_RING_STYLES[ISOCHRONE_RING_STYLES.length - 1];

/**
 * The travel modes offered, and which of them is a polygon and which an
 * envelope.
 *
 * `envelope` is not decoration: it changes the outline from solid to dashed,
 * changes "surface atteignable" to "majorant", and puts the divergence on the
 * card. Two rings drawn with the same confidence from two methods that do not
 * deserve the same confidence is the one way this layer could quietly mislead.
 */
const isochroneMode = (id, envelope, feed) => Object.freeze({
  id,
  available: true,
  envelope,
  // The feed is a service and a dataset name: proper nouns, not prose.
  feed,
  get label() { return messages().modes[id].label; },
  get blurb() { return messages().modes[id].blurb; },
});

// i18n-ignore-start — service and dataset names: proper nouns, not prose.
// In the mock's order: on foot, by bike, by car — slowest to fastest.
export const ISOCHRONE_MODES = Object.freeze([
  isochroneMode('foot', false, 'IGN Géoplateforme — Valhalla sur BD TOPO®'),
  isochroneMode('bike', true, 'OpenStreetMap — table OSRM cyclable (FOSSGIS)'),
  isochroneMode('car', false, 'IGN Géoplateforme — Valhalla sur BD TOPO®'),
]);

/** The Lucide glyph each mode's tile wears (`lucideIcons.js`). */
const MODE_ICONS = Object.freeze({ foot: 'footprints', bike: 'bike', car: 'car' });
// i18n-ignore-end

const MODE_BY_ID = new Map(ISOCHRONE_MODES.map((mode) => [mode.id, mode]));

/** The descriptor for a mode id, or the default one. */
export function modeSpec(id) {
  return MODE_BY_ID.get(id) || MODE_BY_ID.get('foot');
}

/** The mode the layer opens on, and the one every share link without a token means. */
export const ISOCHRONE_DEFAULT_MODE = 'foot';

/** @type {string} The mode currently drawn. */
let _mode = ISOCHRONE_DEFAULT_MODE;
/** @type {string} The longest duration drawn, in minutes (`ISOCHRONE_MAX_MINUTES`). */
let _max = ISOCHRONE_DEFAULT_MAX;
/** @type {string} `zones` or `contours`. */
let _view = ISOCHRONE_DEFAULT_VIEW;
/**
 * « Changer le point » was pressed and the next click on the map is awaited.
 * A click on the map moves the point either way; this is the state the button
 * and the hint under it show, and the crosshair the canvas wears meanwhile.
 */
let _picking = false;

/**
 * Resolve a requested mode to one that can actually be measured.
 *
 * An unavailable mode is REFUSED, not silently downgraded: `setParams` returns
 * false and the drawn rings stay what they were. Nothing is unavailable today —
 * cycling stopped being so on 2026-09-02 — but the gate stays, because the day
 * an upstream withdraws a profile the right behaviour is to keep drawing the
 * ring the reader already had rather than relabel a different one.
 *
 * @param {unknown} value
 * @returns {string|null} A supported mode id, or null.
 */
export function resolveMode(value) {
  const key = String(value ?? '').trim().toLowerCase();
  const mode = ISOCHRONE_MODES.find((entry) => entry.id === key);
  return mode?.available ? mode.id : null;
}

/**
 * Resolve a requested « Durée maximale » to one the layer draws, or null.
 * Minutes, as a string — the share link's enum (`layerState.js`) is one.
 * @param {unknown} value
 * @returns {string|null}
 */
export function resolveMax(value) {
  const key = String(value ?? '').trim();
  return ISOCHRONE_MAX_MINUTES.includes(key) ? key : null;
}

/**
 * Resolve a requested « Vue » to one the layer draws, or null.
 * @param {unknown} value
 * @returns {string|null}
 */
export function resolveView(value) {
  const key = String(value ?? '').trim().toLowerCase();
  return ISOCHRONE_VIEWS.includes(key) ? key : null;
}

/**
 * The rings the drawing keeps under a « Durée maximale ».
 * @param {Array<object>} rings
 * @param {string} max Minutes.
 * @returns {Array<object>}
 */
export function ringsWithin(rings, max) {
  const ceiling = Number(resolveMax(max) ?? ISOCHRONE_DEFAULT_MAX) * 60;
  return (Array.isArray(rings) ? rings : []).filter((ring) => Number(ring?.seconds) <= ceiling);
}

/** The style a duration is drawn in. */
export function ringStyle(seconds) {
  return STYLE_BY_SECONDS.get(seconds) || FALLBACK_STYLE;
}

/** Minutes, as a reader says them. */
export function minutesLabel(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  return messages().minutes(Math.round(seconds / 60));
}

/** The verb that goes with the mode, inside a sentence. */
export function modeVerb(mode) {
  const verbs = messages().verbs;
  if (mode === 'car') return verbs.car;
  if (mode === 'bike') return verbs.bike;
  return verbs.foot;
}

/**
 * The vertex a ring's label is written on.
 *
 * The northernmost, so three nested labels never stack: the rings share a
 * centre and grow outward, so their north edges are always distinct points, and
 * picking the same compass direction on each keeps the three reading as one
 * scale rather than as three scattered tags.
 *
 * @param {Array<number[]>} ring `[lon, lat]` pairs.
 * @returns {number[]|null}
 */
export function ringLabelAnchor(ring) {
  if (!Array.isArray(ring) || !ring.length) return null;
  let best = null;
  for (const point of ring) {
    if (!Array.isArray(point) || point.length < 2) continue;
    if (!best || point[1] > best[1]) best = point;
  }
  return best;
}

/**
 * The expansion sentence for one ring, or null when there is nothing to say.
 *
 * Written out rather than printed as a bare percentage, because "84 %" alone
 * invites the reader to invent what it is 84 % OF.
 *
 * @param {object|null} step One entry of `expansion`.
 * @returns {string|null}
 */
export function expansionSentence(step) {
  if (!step || !Number.isFinite(step.share)) return null;
  const m = messages().expansion;
  const from = minutesLabel(step.fromSeconds);
  const to = minutesLabel(step.toSeconds);
  if (step.share >= 100) return m.opens(from, to, step.share);
  return m.brakes(from, to, step.share, step.ratio, step.freeSpaceRatio);
}

/**
 * Both expansion readings on ONE line, for the card that has six.
 *
 * The centre card now opens by itself over the shape it describes, so every
 * line it spends is a line of catchment it covers or a metre of altitude it
 * costs. The two full sentences — which the RING cards still carry, because a
 * reader who clicked one ring is asking about that pair — become one: the
 * shares in order, and the verdict of the LAST pair, which is the one
 * describing the outermost band and the only one the reader can see the edge of.
 *
 * @param {Array<object>} expansion
 * @returns {string|null}
 */
export function expansionDigest(expansion) {
  const steps = (Array.isArray(expansion) ? expansion : [])
    .filter((step) => Number.isFinite(step?.share));
  if (!steps.length) return null;
  const m = messages().expansion;
  const shares = steps.map((step) => m.share(Math.round(step.share))).join(m.shareSeparator);
  const last = steps[steps.length - 1];
  return m.digest(shares, last.share >= 100 ? m.opensVerdict : m.brakesVerdict);
}

/**
 * The card the centre marker opens, and the one a click puts up by itself.
 *
 * WRITTEN SHORT ON PURPOSE. These cards are not wrapped — the overlay host
 * sizes a card to its longest line — and this one is painted beside a catchment
 * whose frame it is reserved out of, so every character is width the shape does
 * not get. The long form of each reading survives on the ring labels, which a
 * reader reaches by asking for one ring in particular.
 *
 * The order is the order things get DROPPED in, at six lines: what the shape is
 * first, then how big, then the circle it refuses to be, then anything that
 * would make the numbers mean less than they look, then the reading, then the
 * state of the centre — which the LIBÉRER chip also says, and is the only line
 * here said twice.
 *
 * @param {object} input
 * @param {object} input.payload
 * @param {string} input.mode
 * @param {{lon: number, lat: number, pinned?: boolean}} input.point
 * @returns {{title: string, details: string[]}}
 */
export function centreCardText({ payload = {}, mode, point }) {
  const rings = Array.isArray(payload.rings) ? payload.rings : [];
  const outer = rings[rings.length - 1] || null;
  const address = payload.address || null;
  const distanceM = address?.distanceM;
  const warnings = [];
  // Said only when the title is a COMMUNE standing in for an address, which is
  // the one case where the title could be read as more precise than it is.
  const m = messages().centre;
  if (Number.isFinite(distanceM) && distanceM > CENTRE_ADDRESS_MAX_M && address?.city) {
    warnings.push(m.farAddress(fr(distanceM, 0)));
  }
  if (payload.missing) warnings.push(m.missingRings(payload.missing));
  if (payload.envelope) {
    warnings.push(m.envelopeWarning(outer?.bearings || BIKE_ENVELOPE_BEARINGS));
  }
  const details = [
    m.title(modeVerb(mode)),
    rings.length
      // Commas, not the middle dot every other line here uses: the card's
      // details travel through the entity `description` as ONE string split on
      // ` · `, so a line that contains the separator comes back as three.
      ? rings.map((ring) => m.ring(minutesLabel(ring.seconds), fr(ring.areaKm2))).join(', ')
      : m.noRings,
    outer ? m.equivalentCircle(equivalentRadiusM(outer.areaKm2)) : null,
    ...warnings,
    expansionDigest(payload.expansion),
    point?.pinned ? m.pinned : m.following,
  ].filter(Boolean);
  return { title: centreTitle(address, point), details };
}

/** A number as the page's language writes it. */
function fr(value, digits = 2) {
  return formatNumber(Number(value), { maximumFractionDigits: digits });
}

/**
 * What an ENVELOPE ring has to say about itself. Empty for an IGN polygon.
 *
 * Four sentences and every one of them is a caveat, because an envelope drawn
 * beside two exact polygons is the one thing on this layer a reader could take
 * for more than it is. The spoke count says how coarse it is, the reach spread
 * says how uneven, the clip count says when the drawn edge is a floor rather
 * than an edge, and the last line names the network — because a cycling ring
 * compared against a walking one is a comparison of two networks as well as two
 * speeds.
 *
 * @param {object|null} ring
 * @returns {string[]}
 */
export function envelopeSentences(ring) {
  if (!ring?.envelope) return [];
  const m = messages().envelope;
  const out = [];
  out.push(m.bearings(ring.bearings || BIKE_ENVELOPE_BEARINGS));
  if (ring.reachKm && Number.isFinite(ring.reachKm.min)) {
    out.push(m.reach(fr(ring.reachKm.min), fr(ring.reachKm.max), fr(ring.reachKm.median)));
  }
  if (ring.clippedBearings) out.push(m.clipped(ring.clippedBearings));
  out.push(m.network);
  return out;
}

/**
 * Draw one ring: a clamped fill, a clamped outline, and a pickable label.
 *
 * The label is the ONLY pickable thing a ring has. A clamped polyline is
 * ground-classification geometry and `scene.pick` returns null on it — the
 * urbanism layer measured that at every one of 62 vertices of a ring on screen
 * — so a layer whose subject is an outline has to plant something with a
 * position on it, or its cards are unreachable.
 *
 * @param {object} dataSource
 * @param {object} ring Projected ring.
 * @param {object} context
 * @returns {number} Entities that carry a card.
 */
/**
 * The unreachable pockets inside the shape, as a sentence — or nothing.
 * @param {Array<{holes: Array<Array<number[]>>}>} parts
 * @returns {string|null}
 */
export function holesSentence(parts) {
  const holes = (parts || []).reduce((total, part) => total + (part.holes?.length || 0), 0);
  if (!holes) return null;
  const m = messages().holes;
  return holes > 1 ? m.several(holes) : m.one;
}

/**
 * A catchment in several disconnected pieces, as a sentence — or nothing.
 * @param {Array<object>} parts
 * @returns {string|null}
 */
export function partsSentence(parts) {
  const count = (parts || []).length;
  return count > 1 ? messages().parts(count) : null;
}

/** One ring of `[lon, lat]` as Cesium positions, bad vertices dropped. */
function cartesianRing(ring) {
  return (Array.isArray(ring) ? ring : [])
    .filter((point) => Number.isFinite(point?.[0]) && Number.isFinite(point?.[1]))
    .map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat));
}

/**
 * The panels' night green, the plate every tag sits on. OPAQUE: the tag is
 * centred on its own outline, and at 90 % the bright core showed through the
 * plate as a line struck across the duration.
 */
const TAG_PLATE = 'rgb(14, 24, 21)';
/** Ivory, the chrome's ink. */
const TAG_INK = '#f7f4ea';
/** The chrome's face (`--font-ui`). */
const TAG_FONT = '600 13px "DM Sans", system-ui, sans-serif'; // i18n-ignore-line — a CSS font, not prose

/** @type {Map<string, {image: string, width: number, height: number}>} */
const _tagCache = new Map();

/**
 * A ring's tag on the globe: its duration on a dark plate ringed in the
 * ring's colour, with a faint glow of it — the pill the approved mock sets on
 * the northern edge of each outline.
 *
 * Painted on a canvas at twice its size, and handed to Cesium as a data-URI
 * STRING: Cesium shares a billboard atlas entry only between string images,
 * and a canvas would take a fresh entry on every redraw of a layer that
 * redraws each time the camera settles. Cached once the chrome's face has
 * loaded, so a tag drawn in the fallback face is not kept.
 *
 * @param {string} text « 15 min ».
 * @param {string} color The ring's CSS colour.
 * @returns {?{image: string, width: number, height: number}} CSS size; null
 *   without a DOM (the tests), where the caller writes a plain label.
 */
export function ringTagImage(text, color) {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
  const key = `${text}|${color}`;
  const cached = _tagCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext?.('2d');
  if (!ctx || typeof canvas.toDataURL !== 'function') return null;
  const scale = 2;
  const font = TAG_FONT.replace('13px', `${13 * scale}px`);
  ctx.font = font;
  const textWidth = ctx.measureText(text).width;
  // Room around the plate for its glow, which a canvas edge would cut.
  const margin = 5 * scale;
  const plateW = Math.ceil(textWidth + 20 * scale);
  const plateH = 24 * scale;
  canvas.width = plateW + margin * 2;
  canvas.height = plateH + margin * 2;
  ctx.font = font;
  const plate = () => {
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') ctx.roundRect(margin, margin, plateW, plateH, 7 * scale);
    else ctx.rect(margin, margin, plateW, plateH);
  };
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 6 * scale;
  plate();
  ctx.fillStyle = TAG_PLATE;
  ctx.fill();
  ctx.restore();
  plate();
  ctx.lineWidth = 1.5 * scale;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.fillStyle = TAG_INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + scale / 2);
  const tag = { image: canvas.toDataURL('image/png'), width: canvas.width / scale, height: canvas.height / scale };
  const faceReady = typeof document.fonts?.check !== 'function' || document.fonts.check(TAG_FONT);
  if (faceReady) _tagCache.set(key, tag);
  return tag;
}

/** The origin pin's body: the interface's apricot, the colour of a pressed control. */
export const ORIGIN_PIN_FILL = '#f7ab7c';
/** Its rim, dark enough to part it from a red roof. */
const ORIGIN_PIN_RIM = '#5a2c12';
/** Its core, the panels' night green. */
const ORIGIN_PIN_CORE = '#1d3029';

/**
 * The point the measure starts from, as a PIN: a filled drop in apricot with
 * a dark core ringed in ivory — the approved mock's marker, the shape of the
 * place search's pin in the colour of the panel's pressed controls, so the two
 * never read as one another. Drawn at twice its screen size.
 * @returns {string} `data:image/svg+xml;…`
 */
export function originPinImage() {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="84" viewBox="0 0 30 42">'
    + '<path d="M15 1.2C7.4 1.2 1.2 7.3 1.2 14.9c0 9.9 11.2 21.5 13 25.3.3.6 1.3.6 1.6 0 1.8-3.8 13-15.4 13-25.3C28.8 7.3 22.6 1.2 15 1.2z" '
    + `fill="${ORIGIN_PIN_FILL}" stroke="${ORIGIN_PIN_RIM}" stroke-width="1.6"/>`
    + `<circle cx="15" cy="14.8" r="5.6" fill="${ORIGIN_PIN_CORE}" stroke="${TAG_INK}" stroke-width="1.8"/>`
    + '</svg>';
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function drawRing(dataSource, ring, {
  mode, expansion = [], classificationType, index = 0, view = ISOCHRONE_DEFAULT_VIEW,
}) {
  const positions = cartesianRing(ring.ring);
  if (positions.length < 3) return 0;
  const style = ringStyle(ring.seconds);
  const css = Cesium.Color.fromCssColorString(style.color);
  // The outline's core: the ring's colour a third of the way to white.
  const core = Cesium.Color.lerp(css, Cesium.Color.WHITE, 0.35, new Cesium.Color());
  const label = minutesLabel(ring.seconds);
  const radiusM = equivalentRadiusM(ring.areaKm2);
  const step = expansion.find((entry) => entry.toSeconds === ring.seconds) || null;

  // Every piece of the shape, holes and all. `parts` is present whenever the
  // service answered a MultiPolygon; a plain Polygon is one part, which is the
  // ordinary case and the loop's own default. Drawing only `ring` here while
  // the card printed an area computed over the whole thing would put a number
  // on screen that the picture contradicts.
  const parts = Array.isArray(ring.parts) && ring.parts.length
    ? ring.parts
    : [{ ring: ring.ring, holes: ring.holes || [] }];
  parts.forEach((part, partIndex) => {
    const outer = partIndex === 0 ? positions : cartesianRing(part.ring);
    if (outer.length < 3) return;
    const holes = (part.holes || [])
      .map((hole) => cartesianRing(hole))
      .filter((hole) => hole.length >= 3)
      .map((hole) => new Cesium.PolygonHierarchy(hole));
    const suffix = partIndex === 0 ? '' : `:${partIndex}`;
    // « Vue : Contours » leaves the ground unwashed, so the map under the
    // shape reads as it is; the outlines and their tags are the same.
    if (view !== 'contours') {
      dataSource.entities.add({
        id: `isochrone:${ring.seconds}:fill${suffix}`,
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(outer, holes),
          material: css.withAlpha(style.fillAlpha),
          classificationType,
          outline: false,
        },
      });
    }
    const loop = [...outer, outer[0]];
    // A GLOWING OUTLINE, the mock's neon edge: a wide halo fading out from
    // the line — Cesium's glow material — under a thin core lifted toward
    // white, which is what makes the edge read as lit rather than painted.
    dataSource.entities.add({
      id: `isochrone:${ring.seconds}:glow${suffix}`,
      polyline: {
        positions: loop,
        width: style.glowPx,
        material: new Cesium.PolylineGlowMaterialProperty({ color: css.withAlpha(0.9), glowPower: 0.07 }),
        clampToGround: true,
        classificationType,
      },
    });
    dataSource.entities.add({
      id: `isochrone:${ring.seconds}:outline${suffix}`,
      polyline: {
        positions: loop,
        width: style.widthPx,
        // DASHED FOR AN ENVELOPE. The one visual difference that survives being
        // looked at from across the room, and the reason it is a line style
        // rather than a colour: the three colours are already carrying the
        // duration ramp, and overloading them would cost the gradient.
        material: ring.envelope
          ? new Cesium.PolylineDashMaterialProperty({ color: core, dashLength: 18 })
          : new Cesium.ColorMaterialProperty(core),
        clampToGround: true,
        classificationType,
      },
    });
    // A hole gets its own outline, thinner: an unfilled patch inside a fill
    // reads as a rendering glitch unless something draws its edge.
    (part.holes || []).forEach((hole, holeIndex) => {
      const edge = cartesianRing(hole);
      if (edge.length < 3) return;
      dataSource.entities.add({
        id: `isochrone:${ring.seconds}:hole${suffix}:${holeIndex}`,
        polyline: {
          positions: [...edge, edge[0]],
          width: Math.max(1, style.widthPx - 1),
          material: new Cesium.ColorMaterialProperty(css.withAlpha(0.6)),
          clampToGround: true,
          classificationType,
        },
      });
    });
  });

  const anchor = ringLabelAnchor(ring.ring);
  if (!anchor) return 0;
  // The tag sits ON the outline, centred on its northernmost vertex, as the
  // mock sets it. Without a DOM to paint it on, a plain label says the same.
  const tag = ringTagImage(label, style.color);
  dataSource.entities.add({
    id: `isochrone:${ring.seconds}:label`,
    position: Cesium.Cartesian3.fromDegrees(anchor[0], anchor[1]),
    ...(tag
      ? {
        billboard: {
          image: tag.image,
          width: tag.width,
          height: tag.height,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      }
      : {
        label: {
          text: label,
          font: TAG_FONT,
          fillColor: css,
          // Black outline, not a lighter one: it survives over both a pale
          // orthophoto and the dark end of a stacked fill, and it is the same
          // discipline the urbanism zone codes use.
          outlineColor: Cesium.Color.BLACK.withAlpha(0.85),
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          pixelOffset: new Cesium.Cartesian2(0, -6 - index * 2),
        },
      }),
    properties: { kind: 'isochrone-ring', seconds: ring.seconds },
    name: messages().ring.name(label, modeVerb(mode)),
    description: [
      ring.envelope
        ? messages().ring.envelopeArea(fr(ring.areaKm2))
        : messages().ring.exactArea(fr(ring.areaKm2)),
      // The circle this layer exists to refuse, printed beside the shape that
      // refutes it. A reader who only remembers one number remembers a radius,
      // so give them the honest one — the radius of the circle with the SAME
      // AREA — rather than letting them keep the straight-line one.
      messages().ring.equivalentCircle(radiusM),
      expansionSentence(step),
      ...envelopeSentences(ring),
      // Said out loud, because a hole is the one part of the shape a reader
      // cannot infer from the outline, and it is ground the area has ALREADY
      // been reduced by. Same for a shape in several pieces.
      holesSentence(parts),
      partsSentence(parts),
      ring.resourceVersion ? `BD TOPO ${ring.resourceVersion}` : null,
      Number.isFinite(ring.snapM) && ring.snapM > 25
        ? messages().ring.snapped(ring.snapM)
        : null,
    ].filter(Boolean).join(' · '),
  });
  return 1;
}

/** Seconds the framing flight takes. Long enough to read as a move, not a cut. */
export const ISOCHRONE_FRAME_FLIGHT_SEC = 1.5;

/**
 * The solved frame for the catchment currently drawn, or null.
 *
 * Two consumers: the flight, once; and `cardAnchor`, on every repaint of the
 * card — which is why it is held rather than recomputed. The anchor is a WORLD
 * point on the shape's lower edge, so it stays off the wash at every altitude
 * the reader then chooses; only turning the map invalidates it, and turning the
 * map is a gesture that moves the card back over the shape by design, not a
 * state to defend against.
 * @type {?object}
 */
let _frame = null;
/** The catchment `_frame` was solved for: pin and mode. Null while unpinned. */
let _framedFor = null;

/** A pooled overlay rectangle, detached from the pool. */
function copyRect(rect) {
  return rect ? { x: rect.x, y: rect.y, w: rect.w, h: rect.h } : null;
}

/**
 * Is anything else already driving the camera?
 *
 * The same two owners the CCTV focus refuses to fight. A layer that flies while
 * an entity is tracked loses the flight one frame later and leaves the reader
 * with a camera that twitched; cockpit owns the view outright.
 */
function cameraIsOwnedElsewhere(viewer) {
  if (viewer?.trackedEntity) return true;
  return typeof document !== 'undefined'
    && document.body?.classList?.contains('cockpit-mode') === true;
}

/**
 * Fly to the solved frame: top-down, heading kept, the catchment in the box.
 *
 * PITCH IS FORCED TO NADIR and heading is not. The framing arithmetic is
 * flat-ground trigonometry, which is only true looking straight down — at 20°
 * off, the top of the screen is half again as far away as the bottom and a
 * catchment fitted on the flat formula overshoots the frame. Heading survives
 * because a reader who turned the map to face a valley is still facing it, and
 * the offsets are computed on the screen axes for exactly that reason.
 *
 * @param {object} viewer
 * @param {object} frame Output of `solveCatchmentFrame`.
 * @returns {boolean} True when a flight was started.
 */
export function flyToCatchmentFrame(viewer, frame) {
  const camera = viewer?.camera;
  if (!camera?.flyTo || !frame?.camera) return false;
  if (cameraIsOwnedElsewhere(viewer)) return false;
  const { lon, lat, altitudeM } = frame.camera;
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || !(altitudeM > 0)) return false;
  // Above the GROUND, not above the ellipsoid: 26 km over the Cantal and 26 km
  // over the Camargue are not the same view, and the frame was solved in
  // metres of ground per pixel.
  const groundM = renderedGroundM(
    viewer.scene, Cesium.Math.toRadians(lon), Cesium.Math.toRadians(lat),
  ) ?? 0;
  camera.cancelFlight?.();
  camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(lon, lat, groundM + altitudeM),
    orientation: {
      heading: frame.headingRad ?? 0,
      pitch: -Cesium.Math.PI_OVER_TWO,
      roll: 0,
    },
    duration: ISOCHRONE_FRAME_FLIGHT_SEC,
    easingFunction: Cesium.EasingFunction.CUBIC_IN_OUT,
  });
  return true;
}

const base = createAddressScanLayer({
  id: ISOCHRONE_LAYER_ID,
  // i18n-ignore-start — registry fields, not copy: see src/data/layerTaxonomy.i18n.js.
  name: ISOCHRONE_LAYER_NAME,
  icon: '◎',
  source: 'IGN Géoplateforme (BD TOPO®) · OpenStreetMap / OSRM pour le vélo',
  // i18n-ignore-end
  endpoint: '/api/isochrone',
  updateInterval: UPDATE_INTERVAL_MS,
  // Functions, not constants: both depend on the mode, and the mode is a
  // runtime choice. See `ISOCHRONE_MAX_ALTITUDE_M`.
  maxAltitudeM: () => ISOCHRONE_MAX_ALTITUDE_M[_mode] ?? ISOCHRONE_MAX_ALTITUDE_M.foot,
  minShiftKm: () => ISOCHRONE_MIN_SHIFT_KM[_mode] ?? ISOCHRONE_MIN_SHIFT_KM.foot,
  // A click on bare globe, or on this layer's own wash, MOVES THE CENTRE. The
  // layer answers a question about one point and until now that point was
  // wherever the camera happened to look — which is fine for reading a street
  // and useless for "what does THIS door reach", the question the layer is for.
  groundClick: ({ lon, lat }) => {
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return false;
    // The point awaited by « Changer le point » has arrived.
    setPicking(false);
    isochroneRingsLayer.setParams({ centre: `${lon},${lat}` });
    // Consumed whether or not the pin MOVED. A second click on the same spot
    // changes nothing and must still not fall through to the dismissal path,
    // or clicking the map twice would close the card the first click opened.
    return true;
  },
  params: () => ({ profile: _mode, seconds: ISOCHRONE_STEPS.join(',') }),

  /**
   * Frame the catchment, once it is drawn and indexed.
   *
   * ONLY FOR A PINNED CENTRE. A camera-following scan is the reader driving,
   * and a layer that re-aimed the camera after every scan would take the map
   * away from them — the request was for a click to show its answer, not for
   * the map to keep re-centring itself.
   *
   * The flight is spent once per catchment, keyed on the pin, the mode AND
   * the « Durée maximale »: a driving ring is an order of magnitude wider than
   * the walking one it replaces, and five minutes a ninth of fifteen, so
   * either change over a fixed pin has to reframe. A redraw for the same
   * catchment — a basemap change — stays put.
   *
   * No card is opened any more (the mock of 2026-09-24): the panel names the
   * point and the key prints the areas, so the frame reserves no band for one.
   */
  afterDraw({ payload, point, viewer }) {
    if (!point?.pinned) {
      _frame = null;
      _framedFor = null;
      return;
    }
    const signature = `${point.lon},${point.lat}|${payload?.profile ?? _mode}|${_max}`;
    if (signature === _framedFor) return;
    _framedFor = signature;
    _frame = solveCatchmentFrame({
      viewer,
      rings: ringsWithin(payload?.rings, _max),
      centre: point,
      card: null,
    });
    flyToCatchmentFrame(viewer, _frame);
  },

  /**
   * Hang the card off the catchment's lower edge instead of its centre.
   *
   * The centre marker sits in the middle of a wash up to 16 km across; a card
   * anchored there is painted over the one thing the layer exists to show. The
   * anchor `solveCatchmentFrame` returns is the point the frame reserved a band
   * under, so the card lands in that band.
   */
  cardAnchor(card) {
    if (card?.id !== 'isochrone:centre' || !_frame?.anchor) return null;
    return { ..._frame.anchor, placement: _frame.side };
  },
  // The rings are ground-classification geometry and a classification type is
  // read once, when the primitive is built. Switching to the Google photoreal
  // tileset hides the globe and a wash built for TERRAIN then draws nothing —
  // the layer looks switched off. Same reason the urbanism layer opts in.
  redrawOnMapStack: true,

  render({ payload, dataSource, point, viewer }) {
    const classificationType = viewer?.scene?.globe?.show === false
      ? Cesium.ClassificationType.CESIUM_3D_TILE
      : Cesium.ClassificationType.TERRAIN;
    // Only the rings under the « Durée maximale »: all three were measured,
    // in one answer, and the choice is what the reader asked to SEE.
    const rings = ringsWithin(payload.rings, _max);
    const mode = resolveMode(payload.profile) || _mode;
    let drawn = 0;

    // FAR TO NEAR. The fills stack, and the nearest ring has to land on top —
    // both so the gradient runs the right way and so the 5-minute outline is
    // not buried under two washes drawn after it.
    const ordered = [...rings].sort((a, b) => b.seconds - a.seconds);
    for (const [index, ring] of ordered.entries()) {
      drawn += drawRing(dataSource, ring, {
        mode, expansion: payload.expansion || [], classificationType, index, view: _view,
      });
    }

    if (point) {
      const card = centreCardText({ payload, mode, point });
      dataSource.entities.add({
        id: 'isochrone:centre',
        position: Cesium.Cartesian3.fromDegrees(point.lon, point.lat),
        billboard: {
          // A PIN, the mock's: the one mark on this layer that stands for the
          // reader's own choice, and the shape they already know for « here ».
          // Apricot, where the place search pins in red, so a searched
          // address and the point measured from never read as one another.
          image: originPinImage(),
          width: 30,
          height: 42,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        properties: { kind: 'isochrone-centre' },
        // The SAME text the layer puts up by itself after a click. One card,
        // reachable two ways, rather than a marker that says something else
        // from what opened over it a second ago.
        name: card.title,
        description: card.details.join(' · '),
      });
      drawn += 1;
    }
    return drawn;
  },

  summarize(payload) {
    const rings = Array.isArray(payload.rings) ? payload.rings : [];
    const outer = rings[rings.length - 1] || null;
    return {
      profile: payload.profile ?? null,
      ringsDrawn: rings.length,
      ringsMissing: payload.missing ?? 0,
      areasKm2: rings.map((ring) => ring.areaKm2),
      // Keyed by duration, for the key: a ring the service did not return
      // must not shift the next one's area onto its line.
      ringAreas: rings.map((ring) => ({ seconds: ring.seconds, areaKm2: ring.areaKm2 })),
      // Every pair's reading, for « Sources et calcul », which prints the one
      // ending at the « Durée maximale ».
      expansion: (payload.expansion || [])
        .filter((step) => Number.isFinite(step?.share))
        .map((step) => ({ fromSeconds: step.fromSeconds, toSeconds: step.toSeconds, share: step.share })),
      outerAreaKm2: outer?.areaKm2 ?? null,
      outerRadiusM: outer ? equivalentRadiusM(outer.areaKm2) : null,
      // The obstruction reading, as a single number a row can carry: the
      // expansion share of the LAST pair, which is the one describing the
      // outermost band.
      expansionShare: (payload.expansion || []).at(-1)?.share ?? null,
      resourceVersion: payload.resourceVersion ?? null,
      // What the centre is CALLED, and how far the nearest address really was.
      // Reported apart from the title so a reader of the row — or of the QA
      // harness — can tell a street the pin is on from a commune it is merely in.
      address: payload.address?.label ?? null,
      // The street line on its own (« 5 Rue Pierre Moussempès »), which the
      // panel prints over the commune as the mock does.
      addressStreet: [payload.address?.housenumber, payload.address?.street].filter(Boolean).join(' ') || null,
      addressCity: payload.address?.city ?? null,
      addressDistanceM: Number.isFinite(payload.address?.distanceM)
        ? payload.address.distanceM
        : null,
      // Which of the two upstreams answered, and whether what is drawn is a
      // polygon or an envelope. Both are read by the row and by the QA harness,
      // and neither is derivable from the ring count.
      feed: payload.feed ?? null,
      envelope: payload.envelope === true,
      snapM: Number.isFinite(payload.snapM) ? payload.snapM : null,
    };
  },
});

/**
 * Parse the `centre` runtime parameter.
 *
 * Two spellings and nothing else. `camera` releases the pin; `lon,lat` sets it.
 * A malformed value is REFUSED rather than snapped to anything, for the same
 * reason an unknown mode is: the layer keeps answering the question it was
 * already answering instead of silently answering a different one.
 *
 * @param {unknown} value
 * @returns {{lat: number, lon: number}|'camera'|null} Null when unusable.
 */
export function resolveCentre(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return null;
  // Share-link tokens, French spelling included: data, never translated.
  // i18n-ignore-next-line
  if (text === 'camera' || text === 'caméra' || text === 'auto') return 'camera';
  const parts = text.split(',');
  if (parts.length !== 2) return null;
  const lon = Number(parts[0]);
  const lat = Number(parts[1]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  // Five decimals, matching every other coordinate this layer relays: two
  // clicks a metre apart must produce the same query, or the proxy cache never
  // hits for the one workload it exists for.
  return { lon: Math.round(lon * 1e5) / 1e5, lat: Math.round(lat * 1e5) / 1e5 };
}

/** The viewer the layer was last enabled on — whose canvas wears the crosshair. */
let _pickViewer = null;

/**
 * Arm or disarm « Changer le point ». The crosshair is the one sign on the
 * map itself that a click there is awaited.
 * @param {boolean} on
 */
function setPicking(on) {
  _picking = Boolean(on);
  const style = _pickViewer?.scene?.canvas?.style;
  if (style) style.cursor = _picking ? 'crosshair' : '';
}

/**
 * The point the measure starts from, as the panel prints it: the street over
 * the commune when the nearest address is the one clicked (« 5 Rue Pierre
 * Moussempès » / « Biarritz »), the commune alone when it is too far to be,
 * the coordinate when there is neither — the same three answers the pin's
 * card is titled with (`centreTitle`).
 * @param {object} stats The layer's stats (summary of the answer in hand).
 * @param {?{lon: number, lat: number}} point
 * @returns {string[]}
 */
export function centreLines(stats, point) {
  const distance = stats?.addressDistanceM;
  const near = !Number.isFinite(distance) || distance <= CENTRE_ADDRESS_MAX_M;
  if (near && stats?.addressStreet && stats?.addressCity) return [stats.addressStreet, stats.addressCity];
  if (near && stats?.address) return [stats.address];
  if (stats?.addressCity) return [stats.addressCity];
  if (point && Number.isFinite(point.lon) && Number.isFinite(point.lat)) {
    return [centreTitle(null, point)];
  }
  return [];
}

/**
 * The BD TOPO® edition as a reader writes a date (« 19 septembre 2026 »). An
 * ISO day is read in UTC, so no time zone moves it to the day before; anything
 * else is printed as the service wrote it.
 * @param {string} version
 * @returns {string}
 */
function editionLabel(version) {
  const text = String(version);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return formatDate(`${text}T00:00:00Z`, {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
}

/**
 * « Sources et calcul »: what computed the rings, how big the drawn outer one
 * is against a circle, how the network holds it back, and where the measure
 * really starts. Plain sentences, read by whoever opens the disclosure.
 * @param {object} stats
 * @returns {string[]}
 */
export function aboutLines(stats) {
  const m = messages().panel.about;
  const spec = modeSpec(_mode);
  const lines = [spec.envelope ? m.bike : m.ign];
  const ceiling = Number(_max) * 60;
  const outer = (Array.isArray(stats?.ringAreas) ? stats.ringAreas : [])
    .filter((ring) => ring.seconds <= ceiling && Number.isFinite(ring.areaKm2))
    .at(-1);
  if (outer) {
    lines.push(m.circle(minutesLabel(outer.seconds), modeVerb(_mode), equivalentRadiusM(outer.areaKm2)));
  }
  const step = (Array.isArray(stats?.expansion) ? stats.expansion : [])
    .find((entry) => entry.toSeconds === ceiling);
  if (step) {
    lines.push(step.share >= 100 ? m.opens(minutesLabel(step.fromSeconds)) : m.brakes(minutesLabel(step.fromSeconds)));
  }
  if (Number.isFinite(stats?.snapM) && stats.snapM > 25) lines.push(messages().ring.snapped(stats.snapM));
  if (!spec.envelope && stats?.resourceVersion) lines.push(m.edition(editionLabel(stats.resourceVersion)));
  return lines;
}

/**
 * The row's form (`rowSections` — see `rowSectionsOf` in manager.js), in the
 * mock's order: where the measure starts, how one travels, how long, how it
 * was computed, how it is drawn.
 * @param {{stats: object, pin: ?{lon: number, lat: number}}} input
 * @returns {Array<object>}
 */
export function isochroneRowSections({ stats, pin }) {
  const m = messages().panel;
  const point = pin || stats?.scanCentre || null;
  return [
    {
      key: 'origin',
      kind: 'place',
      caption: pin ? m.place.pinned : m.place.following,
      lines: stats?.dormant && !pin ? [] : centreLines(stats, point),
      action: {
        id: 'pick',
        label: pin ? m.place.change : m.place.choose,
        title: m.place.pickTitle,
        pressed: _picking,
      },
      // The release, which the LIBÉRER chip used to be: only while a pin is
      // held, since offering to release nothing teaches the wrong thing.
      secondary: pin
        ? {
          id: 'follow',
          label: m.place.follow,
          title: messages().release.title(fr(pin.lat, 5), fr(pin.lon, 5)),
          params: { centre: 'camera' },
        }
        : null,
      hint: _picking ? m.place.hint : '',
    },
    {
      key: 'mode',
      kind: 'choices',
      ruled: true,
      caption: m.modeCaption,
      options: ISOCHRONE_MODES.filter((mode) => mode.available).map((mode) => ({
        id: mode.id,
        label: mode.label,
        title: mode.blurb,
        icon: lucideIconMask(MODE_ICONS[mode.id]),
        active: _mode === mode.id,
        params: { profile: mode.id },
      })),
    },
    {
      key: 'max',
      kind: 'choices',
      caption: m.maxCaption,
      options: ISOCHRONE_MAX_MINUTES.map((minutes) => ({
        id: minutes,
        label: messages().minutes(Number(minutes)),
        active: _max === minutes,
        params: { max: minutes },
      })),
    },
    { key: 'about', kind: 'details', ruled: true, caption: m.about.caption, lines: aboutLines(stats) },
    {
      key: 'view',
      kind: 'select',
      ruled: true,
      caption: m.view.caption,
      param: 'view',
      value: _view,
      options: ISOCHRONE_VIEWS.map((view) => ({ value: view, label: m.view[view] })),
    },
  ];
}

/**
 * The key, drawn as the mock's card: « À pied · jusqu'à 15 min », « Surface
 * cumulée », then one line per drawn duration with its area at the right
 * edge, and « Temps de trajet estimés » under them. The areas are nested — the
 * fifteen-minute zone contains the five — which is what « cumulée » says.
 * @param {{stats: object}} input
 * @returns {{legend: Array<object>, legendHead: object, note: string}}
 */
export function isochroneKey({ stats }) {
  const m = messages().key;
  const envelope = modeSpec(_mode).envelope;
  const areas = new Map((Array.isArray(stats?.ringAreas) ? stats.ringAreas : [])
    .map((ring) => [ring.seconds, ring.areaKm2]));
  const legend = ISOCHRONE_RING_STYLES
    .filter((style) => style.seconds <= Number(_max) * 60)
    .map((style) => {
      const area = areas.get(style.seconds);
      return {
        label: minutesLabel(style.seconds),
        color: style.color,
        value: Number.isFinite(area) ? m.area(fr(area)) : '—',
      };
    });
  return {
    legend,
    legendHead: {
      title: m.title(modeSpec(_mode).label, messages().minutes(Number(_max))),
      subtitle: envelope ? m.cumulativeAtMost : m.cumulative,
    },
    note: envelope ? m.noteBike : m.note,
  };
}

/**
 * The layer, wrapping the shared address-scan factory with a mode control.
 *
 * Spread rather than subclassed: every method the factory returns is a closure
 * over its own state and none of them read `this`, so copying the references
 * onto a new object is exact. What is added is what the factory has no
 * opinion about — which travel mode is drawn, where the centre is, how far and
 * how the rings are drawn, how those reach a share link, and the form and the
 * key that let a reader change and read them.
 */
const isochroneRingsLayer = {
  ...base,

  /**
   * Runtime params.
   *
   * `profile` CHANGES THE QUESTION, so unlike the carroyage's indicator it has
   * to refetch: a driving ring is not a recolouring of a walking ring. `centre`
   * changes WHERE the question is asked, which the shell refetches for. `max`
   * and `view` change only the DRAWING of the answer in hand, so they redraw
   * it and ask nothing.
   *
   * All are handled in one call and independently: a control sends one key,
   * and a caller that sends several gets them all, with the return value true
   * when any moved.
   *
   * @param {{profile?: string, centre?: string, max?: string, view?: string}} [params]
   * @returns {boolean}
   */
  setParams(params = {}) {
    let changed = false;
    let redraw = false;
    if (params.profile !== undefined) {
      const next = resolveMode(params.profile);
      // An unsupported mode is refused rather than downgraded — see `resolveMode`.
      if (!next) return false;
      if (next !== _mode) {
        _mode = next;
        changed = true;
      }
    }
    for (const [key, resolve, read, write] of [
      ['max', resolveMax, () => _max, (value) => { _max = value; }],
      ['view', resolveView, () => _view, (value) => { _view = value; }],
    ]) {
      if (params[key] === undefined) continue;
      const next = resolve(params[key]);
      if (!next) return false;
      if (next === read()) continue;
      write(next);
      changed = true;
      redraw = true;
    }
    if (params.centre !== undefined) {
      const centre = resolveCentre(params.centre);
      if (!centre) return false;
      // Dropped BEFORE the rescan, not after it: releasing the pin can leave
      // the layer dormant, which draws nothing and so never reaches the hook
      // that would otherwise clear the frame — and a stale anchor would hang
      // the next card off a catchment that is no longer on screen.
      if (centre === 'camera') {
        _frame = null;
        _framedFor = null;
      }
      if (base.setScanPin(centre === 'camera' ? null : centre)) changed = true;
    }
    if (!changed) return false;
    // `setScanPin` already rescans when it moved the pin; a mode change has to
    // ask for one, because nothing else in the shell knows the query changed.
    if (params.profile !== undefined) void base.update();
    // A drawing choice rebuilds from the answer in hand — and a pinned
    // catchment is reframed on its new outer ring by `afterDraw`.
    else if (redraw) base.redraw('isochrone-drawing');
    return true;
  },

  /**
   * What a share link, and the panel, have to carry.
   *
   * `profile`, `max` and `view` are encoded (see `layerState.js`). `centre` is
   * NOT — the option encoders are enums and a coordinate is not one — so a
   * shared link reopens following the camera, which lands on the same view the
   * sender was looking at. Reported here anyway, because the panel reads it to
   * say where the measure starts.
   *
   * @returns {{profile: string, centre: string, max: string, view: string}}
   */
  getParams() {
    const pin = base.getScanPin();
    return {
      profile: _mode,
      centre: pin ? `${pin.lon},${pin.lat}` : 'camera',
      max: _max,
      view: _view,
    };
  },

  /**
   * An action from the panel's form — one the layer PERFORMS rather than a
   * param a share link could replay.
   *
   * `pick` arms « Changer le point »: the button shows pressed, a hint says to
   * touch the map, and the canvas wears a crosshair until the click lands (or
   * the button is pressed again). The click itself is the one this layer has
   * always taken — see `groundClick`.
   * @param {string} id
   * @returns {boolean} True when the action was known.
   */
  rowAction(id) {
    if (id !== 'pick') return false;
    setPicking(!_picking);
    return true;
  },

  /**
   * The row's form and the key's card — the approved mock of 2026-09-24.
   *
   * No chip any more: the modes are tiles in « Se déplacer », the release is
   * « Suivre la vue » under the point, and the durations are « Durée
   * maximale ». The key prints the mode and the ceiling as its title, then
   * one area per drawn duration at the right edge of its line.
   */
  getRowControls() {
    const stats = base.getStats();
    const pin = base.getScanPin();
    return {
      chips: [],
      rowSections: isochroneRowSections({ stats, pin }),
      ...isochroneKey({ stats }),
    };
  },

  /**
   * Turning the layer back on reframes, even over the pin it already had.
   *
   * The reader may have flown a continent away while it was off, and the
   * signature that stops a redraw from spending a second flight would also stop
   * the one draw that has to spend one.
   */
  enable(viewer) {
    _frame = null;
    _framedFor = null;
    _pickViewer = viewer;
    base.enable(viewer);
  },

  /** A layer switched off awaits no click. */
  disable() {
    setPicking(false);
    return base.disable();
  },

  getStats() {
    const stats = base.getStats();
    const spec = modeSpec(_mode);
    const ceilingM = ISOCHRONE_MAX_ALTITUDE_M[_mode] ?? ISOCHRONE_MAX_ALTITUDE_M.foot;
    const result = {
      ...stats,
      mode: _mode,
      // Where the catchment was framed, and where the card actually landed.
      // Both are reported because the promise this layer now makes — the card
      // is beside the wash, never on it — is a promise about pixels, and a
      // promise about pixels that nothing outside can read is a promise nobody
      // can hold it to.
      framing: _frame
        ? {
          side: _frame.side,
          altitudeM: Math.round(_frame.camera.altitudeM),
          box: _frame.box,
          bounds: _frame.bounds,
          anchor: _frame.anchor,
        }
        : null,
      // COPIED, not handed out: the host pools its paint rectangles and
      // rewrites them next frame, so a reference would silently become a
      // different card's box.
      cardRectPx: stats.selectedId ? copyRect(getOverlayPaintRect(
        ISOCHRONE_LAYER_ID, stats.selectedId,
      )) : null,
      // What the drawn shape IS, at the top level, so a reader of the row or of
      // the QA harness never has to open a ring to find out.
      envelope: spec.envelope,
      pinned: Boolean(stats.scanPin),
      picking: _picking,
      max: _max,
      view: _view,
      maxAltitudeM: ceilingM,
      feedSource: spec.envelope
        ? 'OpenStreetMap via OSRM (FOSSGIS) — ODbL'
        : 'IGN Géoplateforme (Valhalla / BD TOPO®) — Licence Ouverte 2.0',
    };
    if (stats.dormant) {
      result.status = 'ok';
      // Both ways out, because there are now two and the second one is the
      // answer for a driving catchment too wide to fit under any ceiling.
      result.loadingLabel = messages().row.dormant(Math.round(ceilingM / 1000));
    } else if (stats.ringsMissing) {
      result.degraded = true;
      result.loadingLabel = messages().row.ringsMissing(stats.ringsMissing);
    }
    return result;
  },
};

/** @returns {string} The mode currently drawn. Test seam. */
export function _isochroneModeForTest() {
  return _mode;
}

/** Force the drawn mode without going through the manager. Test seam. */
export function _setIsochroneModeForTest(mode) {
  _mode = resolveMode(mode) || ISOCHRONE_DEFAULT_MODE;
}

/** Put the drawing choices, the armed pick and the frame back to their defaults. Test seam. */
export function _resetIsochroneDrawingForTest() {
  _max = ISOCHRONE_DEFAULT_MAX;
  _view = ISOCHRONE_DEFAULT_VIEW;
  _picking = false;
  _frame = null;
  _framedFor = null;
}

/** @returns {object} The wrapped factory layer. Test seam. */
export function _isochroneBaseForTest() {
  return base;
}

export default isochroneRingsLayer;
