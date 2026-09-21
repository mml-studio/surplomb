/**
 * @module styles/nightAtlas
 *
 * Which visual preset is the NIGHT ATLAS, and how a data layer hears about it.
 *
 * The Noir preset used to be a film look: the whole composed frame was
 * desaturated, pushed through an S-curve and tinted sepia. On a map whose
 * value is its colour ramps that was a preset that erased the data — the
 * voltage bands of the grid, the filières of the power stations, all of it
 * read as the same grey, and `ui.js` had to tell the reader that the key no
 * longer decoded the map.
 *
 * It is now the opposite. The BASEMAP goes dark and loses most of its colour
 * (see `nightBasemap.js`, which does it inside the scene, on the imagery and
 * the photorealistic tiles only), and every layer drawn over it keeps its own
 * colour. The post-process pass that remains only adds a bloom around bright
 * pixels and a vignette — see `noir.js` — so on a dark ground the brightest
 * data glows and nothing changes hue.
 *
 * A layer may also re-dress itself for a dark ground: the power grid swaps its
 * daylight palette (red, orange, yellow, green, chosen to survive an
 * orthophoto) for one chosen to glow on black. That is a PRESET decision, not
 * a scene decision, so it lives here: the scene link of « Le réseau électrique
 * et ce qu'il produit » asks for `style=noir`, and a reader who picks Noir by
 * hand over the grid gets the same dress.
 *
 * Cesium-free and DOM-guarded so the layers that import it stay testable
 * under `node --test`.
 */

/** The preset id — the name the style buttons, the share link and `ui.js` use. */
export const NIGHT_ATLAS_STYLE = 'noir';

/** Window event `ui.js` dispatches after every preset change. */
export const STYLE_CHANGE_EVENT = 'gev:style-change';

/**
 * @param {?string} style A preset id.
 * @returns {boolean} True for the preset that darkens the basemap.
 */
export function isNightAtlasStyle(style) {
  return style === NIGHT_ATLAS_STYLE;
}

/**
 * The preset the page is showing now, read where `ui.js` writes it.
 * @returns {string} `'normal'` outside a browser.
 */
export function currentStyle() {
  if (typeof document === 'undefined') return 'normal';
  return document.documentElement?.dataset?.gevStyle || 'normal';
}

/** @returns {boolean} Whether the night atlas is on right now. */
export function nightAtlasActive() {
  return isNightAtlasStyle(currentStyle());
}

/**
 * Follow the night atlas on and off.
 *
 * Only a CHANGE of night-ness reaches the callback: going from CRT to NVG says
 * nothing to a layer that only cares whether the ground is dark.
 *
 * @param {(night: boolean) => void} callback
 * @returns {() => void} Stop following.
 */
export function watchNightAtlas(callback) {
  if (typeof window === 'undefined' || typeof callback !== 'function') return () => {};
  let night = nightAtlasActive();
  const onChange = (event) => {
    const next = isNightAtlasStyle(event?.detail?.style ?? currentStyle());
    if (next === night) return;
    night = next;
    callback(night);
  };
  window.addEventListener(STYLE_CHANGE_EVENT, onChange);
  return () => window.removeEventListener(STYLE_CHANGE_EVENT, onChange);
}
