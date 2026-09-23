/**
 * Edge shade — a faint darkening toward the corners of the globe view.
 *
 * WHY IT EXISTS (2026-09-23). The circular scope mask (src/scopeMask.js) is
 * sized from the viewport HEIGHT, so on a 16:9 screen it blacks out both
 * sides: at 1600 × 900 the clear circle is 945 px wide and the 655 px around
 * it are 94-100 % black. The globe looked like a view through a porthole, and
 * the owner asked for the scene to run to the edges of the screen with only a
 * light falloff. The scope stays available (Appearance › Advanced settings);
 * this is what a first run draws instead.
 *
 * WHAT IT IS. One `<div>` over the WebGL canvas with a CSS radial gradient
 * shaped like the VIEWPORT, not a circle: transparent over the middle
 * {@link EDGE_SHADE_CLEAR_RATIO} of each axis, reaching the chosen opacity in
 * the corners. The browser composites it; there is no canvas, no per-frame
 * work and no camera sampling. The strength is one CSS custom property.
 */

/** Page black the scope mask also fades into (`SCOPE_OUTSIDE_COLOR`). */
const EDGE_SHADE_RGB = '5, 5, 8';

/**
 * Corner opacity, as a percent, on a first run. Low on purpose: the reader
 * should notice the scene, not the frame. Mirrors the `#edge-shade-slider`
 * markup value and readout in index.html and `_edgeShadePct` in sharelink.js.
 */
export const EDGE_SHADE_DEFAULT_PCT = 30;

/**
 * Fraction of the gradient's radius (centre to farthest corner) that stays
 * fully clear. The falloff runs from here to the corner.
 */
export const EDGE_SHADE_CLEAR_RATIO = 0.55;

let _element = null;
let _pct = EDGE_SHADE_DEFAULT_PCT;

/**
 * Clamp any input to a whole percent in 0..100; non-numbers fall back.
 * @param {unknown} value
 * @param {number} [fallback=EDGE_SHADE_DEFAULT_PCT]
 * @returns {number}
 */
export function clampEdgeShadePct(value, fallback = EDGE_SHADE_DEFAULT_PCT) {
  const n = Number(value);
  if (value === null || value === '' || !Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * The CSS background for a given strength. Pure — unit-tested directly.
 * @param {number} pct Corner opacity, 0..100.
 * @returns {string}
 */
export function edgeShadeBackground(pct) {
  const alpha = clampEdgeShadePct(pct) / 100;
  const clear = Math.round(EDGE_SHADE_CLEAR_RATIO * 100);
  return `radial-gradient(ellipse farthest-corner at 50% 50%, rgba(${EDGE_SHADE_RGB}, 0) ${clear}%, rgba(${EDGE_SHADE_RGB}, ${alpha}) 100%)`;
}

function paint() {
  if (!_element) return;
  _element.style.background = edgeShadeBackground(_pct);
  // Nothing to composite at 0: take the layer out rather than blend a
  // transparent gradient over every frame.
  _element.hidden = _pct === 0;
}

/**
 * Install the shade into the viewer container. Idempotent.
 * @param {{container?: HTMLElement}} viewer
 * @returns {void}
 */
export function installEdgeShade(viewer) {
  if (_element || !viewer?.container) return;
  _element = document.createElement('div');
  _element.id = 'edge-shade';
  _element.setAttribute('aria-hidden', 'true');
  viewer.container.appendChild(_element);
  paint();
}

/**
 * @param {number} pct Corner opacity, 0..100.
 * @returns {number} The value applied.
 */
export function setEdgeShadePct(pct) {
  _pct = clampEdgeShadePct(pct, _pct);
  paint();
  return _pct;
}

/** @returns {number} */
export function getEdgeShadePct() {
  return _pct;
}
