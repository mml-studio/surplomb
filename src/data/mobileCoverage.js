/**
 * @module data/mobileCoverage
 *
 * **Where each operator's 4G reaches, and where none of them does** — the
 * ARCEP's quarterly coverage maps, folded into one byte per pixel and drawn
 * under the `anfr-fr` masts.
 *
 * This file is the CONTRACT between the three programs that touch a coverage
 * tile: `scripts/build-mobile-coverage.mjs` writes it, the Vite middleware
 * serves it, and `mobileCoverageImagery.js` decodes and paints it. Nothing here
 * imports Cesium or Node, so all three read the same encoding.
 *
 * ── WHAT THE SOURCE IS, AND WHAT IT IS NOT ──────────────────────────────────
 * `data.arcep.fr/mobile/couvertures_theoriques/` — "Mon réseau mobile", Licence
 * Ouverte. Each operator SIMULATES its own coverage (relief, frequencies,
 * power, clutter) and hands the ARCEP one polygon set per quarter; the ARCEP
 * checks it in the field and publishes it. It is the propagation estimate this
 * layer would otherwise have had to invent, computed by the only people who
 * know each antenna's power, tilt and beamwidth — none of which ANFR publishes.
 *
 * It is a SIMULATION, and the card says so. It is not a measurement.
 *
 * ── MEASURED ON THE 2026 T1 EDITION (published 2026-06-18) ──────────────────
 * Four GeoPackages, one per operator, **4G data only**: 2025 T4 still shipped
 * 2G/3G voice and 5G, 2026 T1 ships 4G and nothing else. 1.35 GB of 7z. Each
 * file is 286–287 features — one per département and level — in Lambert-93.
 *
 * Levels are DISJOINT, not nested (measured on the Territoire de Belfort:
 * TBC ∩ BC = 1.5e-9 km², BC ∩ CL = 0), so a pixel carries exactly one level
 * per operator and the burn order does not matter.
 *
 * Orange's polygons sit on an exact 50 m Lambert-93 grid; SFR, Bouygues and
 * Free do not (SFR's vertices step by ~49.96 m on a skewed grid, the other two
 * are free-form). So the tiles are rasterised straight into the Web-Mercator
 * grid of zoom 12 — 38.2 m per pixel at the equator, 24–29 m on the ground in
 * metropolitan France — which is finer than every source.
 *
 * ── THE ENCODING ────────────────────────────────────────────────────────────
 * One grey+alpha PNG per tile, 256 × 256:
 *
 *   grey  = one CODE per pixel, two bits per operator:
 *             bits 0–1 Orange · 2–3 SFR · 4–5 Bouygues Telecom · 6–7 Free Mobile
 *           each 0 = not covered, 1 = limited, 2 = good, 3 = very good
 *   alpha = 255 on metropolitan land (IGN ADMIN EXPRESS regions), 0 elsewhere
 *
 * Alpha is not decoration: a pixel no operator covers is a ZONE BLANCHE, and a
 * pixel of sea is not. Without the land mask the whole Channel would read as
 * the largest dead zone in France. A tile with no land at all is not written.
 *
 * Zooms under 12 are built by a per-operator MODE of the four children (ties
 * go to the LOWER level: a coarse pixel never claims more coverage than half
 * its ground has), and a coarse pixel is land when at least two of its four
 * children are.
 *
 * @see scripts/build-mobile-coverage.mjs — the pipeline and its measurements
 */

import { formatDate, formatInteger } from '../i18n/format.js';
import messages from './mobileCoverage.i18n.js';

// --- The encoding -----------------------------------------------------------

/** Tile edge in pixels. */
export const COVERAGE_TILE_PX = 256;
/** The finest zoom the pipeline writes; Cesium magnifies past it. */
export const COVERAGE_MAX_ZOOM = 12;
/** The coarsest: metropolitan France is four tiles. */
export const COVERAGE_MIN_ZOOM = 5;
/** Version of the on-disk format. The client refuses any other. */
export const COVERAGE_FORMAT = 'gev-mobile-coverage/1';

/**
 * The four metropolitan operators, in BIT order.
 *
 * `arcep` is the code in the ARCEP file names, `mccMnc` the value of the
 * `operateur` field inside them. `id` is what travels in a share link — frozen
 * the moment the first link is copied. `short` is the chip, `name` the card.
 * Brand names: the same in both languages.
 */
export const COVERAGE_OPERATORS = Object.freeze([
  Object.freeze({ id: 'orange', arcep: 'OF', mccMnc: 20801, shift: 0, name: 'Orange', short: 'Orange' }),
  Object.freeze({ id: 'sfr', arcep: 'SFR0', mccMnc: 20810, shift: 2, name: 'SFR', short: 'SFR' }),
  Object.freeze({ id: 'bouygues', arcep: 'BOUY', mccMnc: 20820, shift: 4, name: 'Bouygues Telecom', short: 'Bouygues' }),
  Object.freeze({ id: 'free', arcep: 'FREE', mccMnc: 20815, shift: 6, name: 'Free Mobile', short: 'Free' }),
]);

/** The ARCEP's three levels plus "not covered", as stored in two bits. */
export const COVERAGE_LEVELS = Object.freeze(['none', 'cl', 'bc', 'tbc']);
/** `niveau` values in the ARCEP files, mapped to their two-bit level. */
export const ARCEP_LEVEL_VALUES = Object.freeze({ CL: 1, BC: 2, TBC: 3 });

/**
 * The share-link values of the coverage switch.
 *
 * `gaps` counts operators; the four others draw one operator's levels. `off`
 * is the default and draws nothing — the masts alone, as before.
 */
export const COVERAGE_MODES = Object.freeze(['off', 'gaps', ...COVERAGE_OPERATORS.map((op) => op.id)]);

/** Two-bit level of one operator in a code. */
export function coverageLevel(code, operatorIndex) {
  const op = COVERAGE_OPERATORS[operatorIndex];
  if (!op) return 0;
  return (code >> op.shift) & 3;
}

/** Pack four two-bit levels, in operator order, into one code. */
export function encodeCoverage(levels) {
  let code = 0;
  for (let i = 0; i < COVERAGE_OPERATORS.length; i++) {
    const level = Math.max(0, Math.min(3, Math.trunc(Number(levels?.[i]) || 0)));
    code |= level << COVERAGE_OPERATORS[i].shift;
  }
  return code;
}

/** How many operators reach `minLevel` or better in a code. */
export function coverageOperatorCount(code, minLevel = 1) {
  let count = 0;
  for (let i = 0; i < COVERAGE_OPERATORS.length; i++) {
    if (coverageLevel(code, i) >= minLevel) count += 1;
  }
  return count;
}

/** Index of an operator id in bit order, or -1. */
export function coverageOperatorIndex(mode) {
  return COVERAGE_OPERATORS.findIndex((op) => op.id === mode);
}

/** A share-link value made safe: anything unknown is `off`. */
export function normalizeCoverageMode(mode) {
  return COVERAGE_MODES.includes(mode) ? mode : 'off';
}

// --- Tile arithmetic (spherical Web Mercator, XYZ rows from the north) -------

/**
 * The tile and the pixel inside it that hold a longitude/latitude.
 * @returns {?{x:number, y:number, px:number, py:number, z:number}}
 */
export function coverageTileAt(lon, lat, z) {
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || !Number.isInteger(z) || z < 0) return null;
  if (Math.abs(lat) > 85.05112878) return null;
  const n = 2 ** z;
  const rad = (lat * Math.PI) / 180;
  const fx = ((lon + 180) / 360) * n;
  const fy = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  const x = Math.floor(fx);
  const y = Math.floor(fy);
  if (x < 0 || y < 0 || x >= n || y >= n) return null;
  const px = Math.min(COVERAGE_TILE_PX - 1, Math.floor((fx - x) * COVERAGE_TILE_PX));
  const py = Math.min(COVERAGE_TILE_PX - 1, Math.floor((fy - y) * COVERAGE_TILE_PX));
  return { x, y, px, py, z };
}

/** Latitude, in degrees, of a fractional Web-Mercator row at zoom `z`. */
export function coverageRowLatitude(z, row) {
  const n = 2 ** z;
  return (Math.atan(Math.sinh(Math.PI * (1 - (2 * row) / n))) * 180) / Math.PI;
}

/**
 * Whether the pipeline wrote a tile, read from the meta's per-zoom bitset.
 *
 * The bitset is what keeps a view of the Atlantic from firing a few hundred
 * requests for tiles that were never written: a tile with no land is absent
 * by construction, and the client knows it before asking.
 */
export function coverageTileExists(meta, z, x, y) {
  const index = meta?.tiles?.[z];
  if (!index) return false;
  const col = x - index.x0;
  const row = y - index.y0;
  if (col < 0 || row < 0 || col >= index.cols || row >= index.rows) return false;
  const bits = index.bytes || (index.bytes = decodeBase64(index.bits || ''));
  const bit = row * index.cols + col;
  return ((bits[bit >> 3] >> (bit & 7)) & 1) === 1;
}

function decodeBase64(text) {
  if (typeof atob === 'function') {
    const raw = atob(text);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(text, 'base64'));
}

/**
 * Same-origin tile URL. Outside `/api` on purpose: see vite.config.js.
 *
 * The tiles are served IMMUTABLE, so the edition alone is not a safe cache
 * key: a rebuild of the same quarter (a pipeline fix) would stay invisible for
 * a year behind every browser and edge cache. `stamp` — the meta's `builtAt` —
 * makes each build its own URL; the server ignores the query.
 */
export function coverageTileUrl(edition, z, x, y, stamp = '') {
  const query = stamp ? `?b=${encodeURIComponent(String(stamp).replace(/[^0-9A-Za-z]/g, ''))}` : '';
  return `/tiles/mobile-coverage/${encodeURIComponent(edition)}/${z}/${x}/${y}.png${query}`;
}

// --- What the colour says ----------------------------------------------------

/**
 * ONE RAMP FOR BOTH MODES, and it paints the GAPS.
 *
 * The story the reader asked for is where the network is missing, so the ink
 * goes there: the darkest rung is "nobody" (or "not this operator"), each
 * lighter rung is one step closer to fully served, and fully served is left
 * unpainted — which in France is most of the land, so the map stays light and
 * the dead zones jump out. The same rung means the same distance from served
 * in both modes: rung 0 is a dead zone in `gaps` and "no coverage" for one
 * operator.
 *
 * One magenta hue, ordered by LIGHTNESS (CARTOGRAPHY B4), spent in the light
 * half so the darkest rung still reads on a dark orthophoto (B4 amendment):
 *
 *   rung 0  #f0287a  L* 53.4
 *   rung 1  #ff6aa5  L* 65.2
 *   rung 2  #ffa3c8  L* 77.1
 *   rung 3  #ffd6e7  L* 89.5
 *
 * One ALPHA for every rung, so compositing over any background keeps the order
 * (B3): an alpha that varied with the class would let a pale rung over forest
 * read darker than a dark rung over a roof. Magenta is unused by the mast dots
 * above it (amber 5G, steel older generations, cyan selection).
 */
export const COVERAGE_RAMP = Object.freeze(['#f0287a', '#ff6aa5', '#ffa3c8', '#ffd6e7']);
export const COVERAGE_ALPHA = 0.6;
/**
 * The same ramp draped on Google's mesh, where Cesium blends imagery in LINEAR
 * light rather than in sRGB as the globe does — which weighs a light colour
 * over a dark surface more. At 0.6 the rungs read at 0.64–0.68 on the Mont-
 * Blanc mesh against 0.60 on the globe (fitted from on/off screenshots of the
 * same view); 0.52 brings them back. Still one alpha for every rung (B3).
 */
export const COVERAGE_DRAPE_ALPHA = 0.52;

/**
 * The rung a code is painted in, or -1 for "not painted".
 *
 * `gaps`: the number of operators reaching at least LIMITED coverage — a dead
 * zone is where not even that exists, which is the ARCEP's and everybody's
 * meaning of *zone blanche*. Four operators: not painted.
 * An operator id: that operator's level — none, limited, good; very good is
 * not painted.
 */
export function coverageRung(code, mode) {
  if (mode === 'gaps') {
    const count = coverageOperatorCount(code, 1);
    return count >= COVERAGE_OPERATORS.length ? -1 : count;
  }
  const index = coverageOperatorIndex(mode);
  if (index < 0) return -1;
  const level = coverageLevel(code, index);
  return level >= 3 ? -1 : level;
}

function packRgba(hex, alpha) {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  const a = Math.round(alpha * 255);
  // `ImageData` bytes are R, G, B, A; read as a little-endian Uint32 that is ABGR.
  return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

/** 256 packed colours, one per code, for `paintCoverageTile` (mobileCoverageTile.js). */
export function coverageLut(mode, alpha = COVERAGE_ALPHA) {
  const lut = new Uint32Array(256);
  const rungs = COVERAGE_RAMP.map((hex) => packRgba(hex, alpha));
  for (let code = 0; code < 256; code++) {
    const rung = coverageRung(code, mode);
    lut[code] = rung < 0 ? 0 : rungs[rung];
  }
  return lut;
}

/**
 * RUNG 0 IS HATCHED: diagonal stripes of its own colour, near-opaque, over its
 * usual translucent fill.
 *
 * Rung 0 is the answer the layer exists for — nobody has 4G here, or not this
 * operator — and in the ramp it sits one lightness step from rung 1 (L* 53.4
 * against 65.2), which over a busy orthophoto is a step a reader has to hunt
 * for. Texture separates it from every other rung by a second channel that
 * survives colour-vision deficiencies and the sensor styles, and the key draws
 * the same stripes (`pattern: 'hatch'` in `coverageLegend`), as the approved
 * mock of 2026-09-22 did.
 *
 * The stripes ADD ink and never take any away, so the order the ramp is built
 * on still holds (CARTOGRAPHY B3): the hatched class is darker than its plain
 * fill, never lighter than rung 1.
 *
 * Counted in the tile's own pixels, along `x + y`, so the stripes run from
 * lower left to upper right on a north-up map. `period` divides the tile edge,
 * so a stripe leaving one tile enters the next exactly where it should.
 */
export const COVERAGE_HATCH = Object.freeze({ period: 8, width: 3, alpha: 0.95 });

/** The colours of the stripe pixels: rung 0 at the hatch alpha, every other code as `lut` paints it. */
export function coverageHatchLut(mode, alpha = COVERAGE_ALPHA) {
  const lut = coverageLut(mode, alpha);
  const ink = packRgba(COVERAGE_RAMP[0], Math.max(alpha, COVERAGE_HATCH.alpha));
  for (let code = 0; code < 256; code++) {
    if (coverageRung(code, mode) === 0) lut[code] = ink;
  }
  return lut;
}

// --- What the reader is told --------------------------------------------------

/** `2026-03-31` → `mars 2026` / `March 2026`: the month the map describes. */
export function coverageMonthLabel(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return String(iso || '');
  return formatDate(new Date(`${iso}T12:00:00Z`), { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/**
 * Legend entries for a mode: a caption, one plain name per painted colour,
 * and the unpainted class as a colourless line — "sans teinte" is a class
 * too, and the reader has to be told which one.
 *
 * Every class is keyed by a PATCH (`swatch: 'area'`), because it paints the
 * ground rather than a mark on it, and rung 0 is keyed HATCHED because the map
 * hatches it — see `COVERAGE_HATCH`.
 */
export function coverageLegend(meta, mode) {
  if (!meta || mode === 'off') return [];
  const m = messages().legend;
  const rungEntry = (label, rung) => ({
    label,
    color: COVERAGE_RAMP[rung],
    swatch: 'area',
    ...(rung === 0 ? { pattern: 'hatch' } : {}),
  });
  if (mode === 'gaps') {
    return [
      { heading: true, label: m.headingGaps },
      ...COVERAGE_RAMP.map((_, rung) => rungEntry(m.gaps[rung], rung)),
      { label: m.gaps[4], color: null, swatch: 'area' },
    ];
  }
  const op = COVERAGE_OPERATORS[coverageOperatorIndex(mode)];
  if (!op) return [];
  return [
    { heading: true, label: m.headingOperator(op.short) },
    ...COVERAGE_LEVELS.slice(0, 3).map((level, rung) => rungEntry(m.operator[level], rung)),
    { label: m.operator.tbc, color: null, swatch: 'area' },
  ];
}

/**
 * The card for one clicked spot: the answer as the title — who has signal
 * here — then one short line per operator, then whose estimate it is.
 * @param {?{inside:boolean, code?:number}} reading
 * @returns {string} Title and details separated by newlines.
 */
export function coverageCardText(meta, reading) {
  const m = messages().card;
  if (!reading?.inside) return [m.outsideTitle, m.outside].join('\n');
  const reached = COVERAGE_OPERATORS.filter((_, i) => coverageLevel(reading.code, i) >= 1);
  let title;
  if (!reached.length) title = m.deadZone;
  else if (reached.length === 1) title = m.one(reached[0].short);
  else if (reached.length === COVERAGE_OPERATORS.length) title = m.all;
  else title = m.some(formatInteger(reached.length));
  const levels = messages().level;
  const lines = COVERAGE_OPERATORS.map((op, i) => m.operatorLine(op.short, levels[COVERAGE_LEVELS[coverageLevel(reading.code, i)]]));
  return [title, ...lines, m.source(coverageMonthLabel(meta?.quarterEnd))].join('\n');
}
