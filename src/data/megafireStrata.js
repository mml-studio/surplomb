/**
 * @module megafireStrata
 *
 * « Temps en 3D » — the geometry of the Gironde replay's second view, where
 * each stage of the fire floats above the ground at its own height.
 *
 * WHAT THE HEIGHT MEANS, AND WHAT IT DOES NOT. Height is the ORDER of the
 * stages: the first group of days sits lowest, the last one highest, at equal
 * steps. It is not the date to scale — the three stages end 1.4, 3.4 and 10
 * days after the first detection, and a stack spaced by date would open a gap
 * three times wider under the last stage, the one where the fire barely moved
 * — and it is never the flames' height, the heat, or the relief. The key says
 * « Plus haut = plus tard » and nothing more precise, because nothing more
 * precise is true.
 *
 * WHAT SITS ON A STRATUM. Its stage's own zone (the ground first reached
 * during those days) filled, and the outline of everything reached by the end
 * of it. The stack is therefore an exploded view of the ground map: look down
 * through it and the fills tile the scar exactly once.
 *
 * WHAT TIES IT TO THE GROUND. A few dashed verticals drop from the outline of
 * the highest stratum shown to the same spot on the ground, at the extremes of
 * its silhouette, and a time axis stands beside the stack with one tick per
 * stratum. Neither is data: they are the chart's rulers.
 *
 * WHY THE AXIS STANDS ON THE LEFT, OVER THE SEA. The approved mock puts it on
 * the right. Here the right is where the last stage's tail runs 12 km east
 * towards Bordeaux, and an axis beyond it landed under the map key (capture of
 * 2026-09-23). The scar's west edge follows the dunes instead — straight, and
 * with the Atlantic beyond it: a dark, empty ground for the ticks' labels.
 *
 * Everything here is pure — no Cesium — so the tests pin it without WebGL.
 * Distances go through the pack's flat projection (`megafireToMetres`), the
 * one the rings were built in.
 */

import { megafireToDegrees, megafireToMetres } from './megafirePack.js';

/** @constant {'ground'} The replay's first view: the zones lie on the map. */
export const MEGAFIRE_VIEW_GROUND = 'ground';
/** @constant {'strata'} « Temps en 3D »: each stage at its own height. */
export const MEGAFIRE_VIEW_STRATA = 'strata';
/** @constant {ReadonlyArray<string>} The views `setParams({view})` takes. */
export const MEGAFIRE_VIEWS = Object.freeze([MEGAFIRE_VIEW_GROUND, MEGAFIRE_VIEW_STRATA]);

/**
 * @constant {{baseM: number, stepM: number}}
 * The lowest stratum's height above the ellipsoid, and the step between two.
 * The scar is 35 km by 29 km; at 4.5 km a step, the stack stands 13.5 km tall
 * — high enough that three sheets read apart from a low oblique camera, low
 * enough that the ground they stand on stays in the same frame.
 */
export const MEGAFIRE_STRATA = Object.freeze({ baseM: 6000, stepM: 6000 });

/**
 * @constant {number} How far the time axis stands from the stack's silhouette,
 * metres, to the side the camera sees as its left.
 */
export const MEGAFIRE_AXIS_MARGIN_M = 4500;

/**
 * @constant {number} Directions the silhouette is sampled in for the ground
 * verticals: one line per compass eighth, fewer where two share a vertex.
 */
export const MEGAFIRE_GUIDE_DIRECTIONS = 8;

/**
 * Height of stratum `index`, metres above the ellipsoid.
 * @param {number} index - 0 for the first stage.
 * @param {{baseM: number, stepM: number}} [strata]
 * @returns {number}
 */
export function megafireStratumHeight(index, strata = MEGAFIRE_STRATA) {
  const i = Number.isFinite(index) && index > 0 ? Math.floor(index) : 0;
  return strata.baseM + i * strata.stepM;
}

/**
 * Every OUTER ring vertex of a region, in metres of the flat projection.
 * @param {ReadonlyArray<ReadonlyArray<ArrayLike<number>>>} region - Polygons, each
 *   `[outer, ...holes]`, rings flat `[lon, lat, ...]`.
 * @returns {Array<[number, number]>}
 */
function outerVertices(region) {
  const out = [];
  for (const polygon of region || []) {
    const outer = polygon?.[0] || [];
    for (let i = 0; i + 1 < outer.length; i += 2) {
      out.push(megafireToMetres(outer[i], outer[i + 1]));
    }
  }
  return out;
}

/**
 * The silhouette's extreme vertices, one per direction, where the verticals
 * drop to the ground. Two directions that land on the same vertex give one
 * line, so a compact region gets fewer than `directions`.
 *
 * @param {ReadonlyArray<ReadonlyArray<ArrayLike<number>>>} region
 * @param {number} [directions]
 * @returns {Array<{lon: number, lat: number}>} In compass order from north.
 */
export function megafireGuidePoints(region, directions = MEGAFIRE_GUIDE_DIRECTIONS) {
  const vertices = outerVertices(region);
  if (!vertices.length || !(directions > 0)) return [];
  const picked = [];
  const seen = new Set();
  for (let d = 0; d < directions; d += 1) {
    const bearing = (2 * Math.PI * d) / directions;
    const ux = Math.sin(bearing);
    const uy = Math.cos(bearing);
    let best = -Infinity;
    let bestIndex = -1;
    for (let i = 0; i < vertices.length; i += 1) {
      const along = vertices[i][0] * ux + vertices[i][1] * uy;
      if (along > best) {
        best = along;
        bestIndex = i;
      }
    }
    if (bestIndex < 0 || seen.has(bestIndex)) continue;
    seen.add(bestIndex);
    const [lon, lat] = megafireToDegrees(vertices[bestIndex][0], vertices[bestIndex][1]);
    picked.push({ lon, lat });
  }
  return picked;
}

/**
 * Where the time axis stands: beside the stack, on the side a camera looking
 * along `headingDeg` sees as its left, level with the middle of the stack's
 * depth — so from the arrival angle it rises just left of the sculpture.
 *
 * @param {ReadonlyArray<ReadonlyArray<ArrayLike<number>>>} region - The widest region.
 * @param {number} headingDeg - Camera heading, degrees clockwise from north.
 * @param {number} [marginM]
 * @returns {?{lon: number, lat: number}}
 */
export function megafireAxisAnchor(region, headingDeg, marginM = MEGAFIRE_AXIS_MARGIN_M) {
  const vertices = outerVertices(region);
  if (!vertices.length) return null;
  const heading = (Number(headingDeg) || 0) * Math.PI / 180;
  // Forward along the heading, and the camera's left: 90° anticlockwise of it.
  const fx = Math.sin(heading);
  const fy = Math.cos(heading);
  const lx = -Math.cos(heading);
  const ly = Math.sin(heading);
  let minF = Infinity;
  let maxF = -Infinity;
  let maxL = -Infinity;
  for (const [x, y] of vertices) {
    const f = x * fx + y * fy;
    const l = x * lx + y * ly;
    if (f < minF) minF = f;
    if (f > maxF) maxF = f;
    if (l > maxL) maxL = l;
  }
  const f = (minF + maxF) / 2;
  const l = maxL + marginM;
  const [lon, lat] = megafireToDegrees(f * fx + l * lx, f * fy + l * ly);
  return { lon, lat };
}

/**
 * A sphere around a region lifted to `heightM`, as a centre in degrees and a
 * radius in metres — what the camera frames the stack by: the widest region
 * lifted to mid-height, with the half-height folded into the radius.
 *
 * @param {ReadonlyArray<ReadonlyArray<ArrayLike<number>>>} region
 * @param {number} heightM - Height of the sphere's centre.
 * @param {number} [halfTallM] - Vertical half-extent to hold, metres.
 * @returns {?{lon: number, lat: number, heightM: number, radiusM: number}}
 */
export function megafireRegionFrame(region, heightM, halfTallM = 0) {
  const vertices = outerVertices(region);
  if (!vertices.length) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of vertices) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  let flat = 0;
  for (const [x, y] of vertices) flat = Math.max(flat, Math.hypot(x - cx, y - cy));
  const [lon, lat] = megafireToDegrees(cx, cy);
  return {
    lon,
    lat,
    heightM: Number(heightM) || 0,
    radiusM: Math.hypot(flat, Math.max(0, Number(halfTallM) || 0)),
  };
}

/**
 * @constant {{referencePx: number, chromePx: number, maxScale: number, maxPortraitScale: number}}
 * The window the arrival was tuned in, and the width the desktop chrome takes
 * out of it — the map key (330 px, 52 px off the right edge) and the layer
 * launchers on the left (176 px, 52 px in) with their margins.
 */
export const MEGAFIRE_FRAMING = Object.freeze({
  referencePx: 1672,
  chromePx: 640,
  maxScale: 1.6,
  maxPortraitScale: 2.4,
});

/**
 * How much farther the camera should stand than at the reference window.
 *
 * Cesium's field of view spans the window's LONGER side. In landscape it keeps
 * the horizontal angle whatever the width, so a stack framed at 1 672 px fills
 * the same SHARE of a 1 280 px window — but the key does not shrink with it,
 * and at 1 280 px the stack's east tail went under it (capture of 2026-09-23).
 * Backing off by the ratio of the map left free at each width keeps the stack
 * where nothing covers it; never closer than the tuned framing, never more
 * than `maxScale` farther. In portrait the angle turns vertical and the
 * horizontal one shrinks by width / height — a phone showed a third of the
 * stack — so the camera backs off by height / width instead.
 *
 * @param {number} widthPx - The canvas's CSS width.
 * @param {number} [heightPx] - Its CSS height.
 * @param {typeof MEGAFIRE_FRAMING} [framing]
 * @returns {number} ≥ 1.
 */
export function megafireFramingScale(widthPx, heightPx = 0, framing = MEGAFIRE_FRAMING) {
  const { referencePx, chromePx, maxScale, maxPortraitScale } = framing;
  if (!(widthPx > 0)) return 1;
  if (heightPx > widthPx) return Math.min(maxPortraitScale, heightPx / widthPx);
  if (!(widthPx > chromePx)) return 1;
  const reference = (referencePx - chromePx) / referencePx;
  const now = (widthPx - chromePx) / widthPx;
  return Math.min(maxScale, Math.max(1, reference / now));
}
