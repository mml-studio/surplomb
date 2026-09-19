/**
 * How sharp a phone draws the ground.
 *
 * ── WHAT WAS WRONG, MEASURED ────────────────────────────────────────────────
 *
 * Owner field report, 2026-09-19, iPhone, IGN orthophoto and Plan IGN alike:
 * « la résolution des différentes couches est très mauvaise ». It was, and it
 * was two settings stacking, neither of them a layer's fault:
 *
 *   1. THE TILE LEVEL. A phone runs the `lite` profile, and `lite` settles the
 *      globe at a screen-space error of 3 (`LITE_GLOBE_SSE`). Cesium maps an
 *      imagery level onto each terrain tile, and at Paris's latitude that puts
 *      one imagery texel on 2 to 4 CSS pixels at rest. Google Maps draws one
 *      texel per half CSS pixel.
 *   2. THE BUFFER. Cesium renders at CSS resolution by default
 *      (`useBrowserRecommendedResolution`), so an iPhone at DPR 3 draws 390 ×
 *      844 pixels and the compositor stretches each one over nine physical
 *      pixels. Every pin, every road line, every letter the globe paints.
 *
 * Together: one imagery texel on 6 to 12 physical pixels.
 *
 * Measured headless on an emulated iPhone 13 over Montparnasse at 1 200 m,
 * straight down: the buffer alone at 2× changes nothing visible — the texels
 * are the bottleneck — and the error at 1 alone would be sampled back down by a
 * 1× buffer. Only the two together give a satellite picture where a bus
 * reads as a bus.
 *
 * ── WHY 2 AND NOT THE DEVICE RATIO ──────────────────────────────────────────
 *
 * A DPR-3 phone at 3× shades 2.25 times the pixels of 2× for a difference an
 * arm's length cannot see, on the one device class whose constraint is memory.
 * 2 is where every retina phone gets its sharpness and no phone pays for more.
 *
 * ── WHAT DOES NOT CHANGE SIZE ───────────────────────────────────────────────
 *
 * Cesium sizes billboards, labels, points and polylines in CSS pixels
 * (`czm_metersPerPixel` and `PolylineCommon` both fold in `czm_pixelRatio`),
 * and its tile error is divided by the same ratio. So the pins stay the size
 * every layer tuned them to, and the buffer alone never asks for a tile —
 * the error below is the only tile lever.
 *
 * ── WHAT IT COSTS ───────────────────────────────────────────────────────────
 *
 * The tile count for a view goes as the square of the error, so 1 asks for up
 * to nine times the tiles of 3 — which on a 390 × 844 viewport is the tile
 * count a desktop window pays at Cesium's default of 2. The detail governor
 * still doubles the error and drops the buffer to 0.8 of itself while the
 * camera moves, so a pan or a pinch costs what it did.
 *
 * @module phoneRender
 */

/**
 * Screen-space error the globe settles at on a phone, in CSS pixels.
 * Replaces `LITE_GLOBE_SSE` there; every other `lite` lever is kept.
 */
export const PHONE_GLOBE_SSE = 1;

/** The highest drawing-buffer-to-CSS ratio a phone renders at. */
export const PHONE_MAX_PIXEL_RATIO = 2;

/**
 * The `Viewer.resolutionScale` a phone renders at.
 *
 * Cesium's `useBrowserRecommendedResolution` stays on, so this scale multiplies
 * CSS pixels directly: 2 is a buffer twice the canvas's CSS size on each axis.
 *
 * @param {number} devicePixelRatio - `window.devicePixelRatio`.
 * @returns {number} Between 1 and {@link PHONE_MAX_PIXEL_RATIO}.
 */
export function phoneResolutionScale(devicePixelRatio) {
  const ratio = Number(devicePixelRatio);
  if (!Number.isFinite(ratio) || ratio <= 1) return 1;
  return Math.min(ratio, PHONE_MAX_PIXEL_RATIO);
}

/**
 * Apply both levers to a viewer. Call BEFORE `installGlobeDetailGovernor`:
 * the governor captures the error it finds as the settled one, and set
 * afterwards this value would be undone at the first `moveEnd`.
 *
 * @param {object} viewer - Cesium Viewer (needs `resolutionScale` and a globe).
 * @param {{devicePixelRatio?: number}} [options]
 * @returns {{resolutionScale: number, sse: number}|null} What was applied.
 */
export function applyPhoneRenderDetail(viewer, { devicePixelRatio = globalThis.devicePixelRatio } = {}) {
  const globe = viewer?.scene?.globe;
  if (!viewer || !globe) return null;
  const resolutionScale = phoneResolutionScale(devicePixelRatio);
  viewer.resolutionScale = resolutionScale;
  globe.maximumScreenSpaceError = PHONE_GLOBE_SSE;
  return { resolutionScale, sse: PHONE_GLOBE_SSE };
}
