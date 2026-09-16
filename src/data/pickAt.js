/**
 * One place where a click becomes a pick, and the only place that knows a
 * finger is wider than a cursor.
 *
 * ── THE MEASUREMENT THAT MADE THIS NECESSARY ────────────────────────────────
 *
 * Every layer here calls `scene.pick(click.position)` with no size. Cesium's
 * default picking rectangle is **3 × 3 pixels of the DRAWING BUFFER**
 * (`computePickingDrawingBufferRectangle`), and `transformWindowToDrawingBuffer`
 * scales the CSS position by `drawingBufferWidth / canvas.clientWidth`. On a
 * phone that ratio is 1 (Cesium renders at 1× by design — see
 * `useBrowserRecommendedResolution`), so 3 buffer pixels ARE 3 CSS pixels, and
 * the governor's `resolutionScale` shrinks them further while the camera moves.
 * A fingertip covers 20 to 30 CSS pixels. The target is roughly one percent of
 * the contact patch: on a phone, a tap on a charging station, a buoy or a bike
 * dock misses, and — because {@link isWorldPick} reads a miss as "the reader
 * clicked the map" — it actively DESELECTS whatever was open.
 *
 * ── WHY NOT JUST `scene.pick(pos, w, h)` ────────────────────────────────────
 *
 * Because of the photorealistic surface. Over Paris at 700 m, six probes
 * across the screen returned six non-falsy picks whose `primitive` is the
 * tileset and whose id is `undefined` (measured 2026-09-10, see
 * `pickRegistry.js`). `pickObjectsFromPixels` reads the widened rectangle in a
 * SPIRAL FROM THE CENTRE and returns the first hit, so a widened `pick` under
 * a finger returns the tile directly under the centre pixel — never the point
 * eight pixels away that the reader was aiming at. The widened rectangle only
 * pays off with `drillPick`, which masks each hit and picks again: the tile
 * comes back first, the point comes back second, and {@link isWorldPick} is
 * exactly the test that tells them apart.
 *
 * ── WHY THE COARSE SIDE IS 24 CSS PIXELS AND NOT 44 ─────────────────────────
 *
 * 44 px is Apple's minimum TARGET size, which is a statement about the whole
 * target, not about how far a pick may reach from the centre. The rectangle
 * here is centred on the touch point, so 24 px of side means ±12 px of reach —
 * half a HIG target, which stays honest in a dense layer (bike docks in central
 * Paris sit closer than 24 px apart at street zoom, and a radius that spans two
 * of them would make the nearer one unselectable half the time).
 *
 * ── WHY THE FINE PATH IS UNTOUCHED ──────────────────────────────────────────
 *
 * A mouse already hits a 3 px target: that is what a cursor is for. Widening
 * the desktop pick would change which object every existing click resolves to,
 * across forty layers, for no reader who asked. So `fine` calls exactly what
 * the call site called before — one argument, no drill, no try/catch — and the
 * whole of this module is dead weight the optimiser can see through.
 *
 * @module data/pickAt
 */

import { isCoarseInput } from '../inputMode.js';
import { isWorldPick } from './pickRegistry.js';

/**
 * Side of the coarse picking square, in CSS pixels, centred on the touch.
 * Half of a 44 px HIG target — see the module header for why not the whole one.
 */
export const PICK_SIDE_COARSE_CSS_PX = 24;

/**
 * How deep a coarse single-object pick drills before giving up.
 *
 * Two would be enough for "tile, then object". Three buys one more layer of
 * ground-classified decoration (a commune wash, a parcel fill) between the
 * photoreal surface and the thing the reader is aiming at, which is the stack
 * that actually occurs over a French city with two layers lit.
 */
export const COARSE_DRILL_LIMIT = 3;

/**
 * Convert a CSS-pixel pick side into the drawing-buffer pixels Cesium wants.
 *
 * `scene.pick(position, width, height)` takes its size in DRAWING BUFFER
 * pixels while `position` is in CSS pixels — Cesium converts the position and
 * not the size. The ratio is `drawingBufferWidth / canvas.clientWidth`, which
 * folds in both the device pixel ratio and the detail governor's live
 * `resolutionScale`, so asking in CSS pixels here keeps the reach at 24 CSS
 * pixels while the governor halves the buffer mid-pan.
 *
 * Kept odd because Cesium centres the rectangle at `(width - 1) / 2`: an even
 * side is off-centre by half a pixel, biased away from the finger.
 *
 * @param {object} scene - Cesium scene (needs `drawingBufferWidth`, `canvas`).
 * @param {number} [cssPx] - Desired side in CSS pixels.
 * @returns {number} Odd side in drawing-buffer pixels, never below Cesium's 3.
 */
export function pickSideDrawingBufferPx(scene, cssPx = PICK_SIDE_COARSE_CSS_PX) {
  const css = Number(cssPx);
  if (!Number.isFinite(css) || css <= 0) return 3;
  const buffer = Number(scene?.drawingBufferWidth);
  const client = Number(scene?.canvas?.clientWidth);
  const ratio = Number.isFinite(buffer) && Number.isFinite(client) && client > 0 && buffer > 0
    ? buffer / client
    : 1;
  return Math.max(3, Math.round(css * ratio)) | 1;
}

/**
 * Drill the widened rectangle, or null when the scene refuses.
 * @param {object} scene
 * @param {object} position
 * @param {number} limit
 * @param {number} cssPx
 * @returns {?Array<object>} Hits front-to-back, or null when picking threw.
 */
function coarseDrill(scene, position, limit, cssPx) {
  if (typeof scene?.drillPick !== 'function') return null;
  const side = pickSideDrawingBufferPx(scene, cssPx);
  try {
    return scene.drillPick(position, limit, side, side) || [];
  } catch {
    // A pick that throws mid-teardown must not take the click handler with it.
    return null;
  }
}

/**
 * Resolve what the reader is pointing at.
 *
 * Drop-in for `scene.pick(position)`: same return shape, same `undefined` for
 * nothing. Under a coarse pointer it drills a 24 CSS-pixel square and returns
 * the first hit that somebody could own, falling back to the frontmost hit so
 * "the reader touched the map" still reads as the world and still dismisses a
 * card — the behaviour forty layers depend on.
 *
 * @param {object} scene - Cesium scene.
 * @param {object} position - Click position in CSS pixels (`click.position`).
 * @param {object} [options]
 * @param {boolean} [options.coarse] - Override the session's input mode.
 * @param {number} [options.limit=1] - Above 1, returns the drill array instead.
 * @param {number} [options.cssPx] - Coarse reach, in CSS pixels.
 * @returns {object|undefined|Array<object>} A pick, `undefined`, or — when
 *   `limit > 1` — the array {@link drillPickAt} would return.
 */
export function pickAt(scene, position, options = {}) {
  const limit = Number.isFinite(options.limit) ? Math.floor(options.limit) : 1;
  const coarse = options.coarse === undefined ? isCoarseInput() : !!options.coarse;
  if (limit > 1) return drillPickAt(scene, position, limit, { coarse, cssPx: options.cssPx });
  if (typeof scene?.pick !== 'function' || !position) return undefined;
  if (!coarse) return scene.pick(position);
  const hits = coarseDrill(scene, position, COARSE_DRILL_LIMIT, options.cssPx ?? PICK_SIDE_COARSE_CSS_PX);
  if (!hits) return undefined;
  for (let i = 0; i < hits.length; i++) {
    if (!isWorldPick(hits[i])) return hits[i];
  }
  return hits[0];
}

/**
 * Drop-in for `scene.drillPick(position, limit) || []`.
 *
 * Coarse sessions get the same widened square as {@link pickAt}, and at least
 * {@link COARSE_DRILL_LIMIT} hits, because a drilling caller is already looking
 * past whatever is in front — widening without deepening would just hand it
 * three more tiles.
 *
 * @param {object} scene - Cesium scene.
 * @param {object} position - Click position in CSS pixels.
 * @param {number} [limit] - Requested depth.
 * @param {object} [options]
 * @param {boolean} [options.coarse] - Override the session's input mode.
 * @param {number} [options.cssPx] - Coarse reach, in CSS pixels.
 * @returns {Array<object>} Hits front-to-back; empty rather than null.
 */
export function drillPickAt(scene, position, limit = COARSE_DRILL_LIMIT, options = {}) {
  const coarse = options.coarse === undefined ? isCoarseInput() : !!options.coarse;
  const want = Number.isFinite(limit) && limit >= 1 ? Math.floor(limit) : COARSE_DRILL_LIMIT;
  if (typeof scene?.drillPick !== 'function' || !position) return [];
  if (!coarse) return scene.drillPick(position, want) || [];
  return coarseDrill(scene, position, Math.max(want, COARSE_DRILL_LIMIT), options.cssPx ?? PICK_SIDE_COARSE_CSS_PX) || [];
}

/**
 * What this session's next pick will actually ask the scene for.
 *
 * On the harness facade because no harness can otherwise tell a widened pick
 * from a narrow one: `scene.pick` answers nothing for the bare globe in
 * SwiftShader, and no Cesium entity paints in headless Chromium at all, so
 * "did the tap select the thing" is unprovable there. The numbers are.
 *
 * @param {object} scene - Cesium scene.
 * @returns {{coarse: boolean, cssPx: number, sidePx: number, drillLimit: number}}
 */
export function getPickDiagnostics(scene) {
  const coarse = isCoarseInput();
  return {
    coarse,
    cssPx: coarse ? PICK_SIDE_COARSE_CSS_PX : 0,
    sidePx: coarse ? pickSideDrawingBufferPx(scene) : 3,
    drillLimit: coarse ? COARSE_DRILL_LIMIT : 1,
  };
}
