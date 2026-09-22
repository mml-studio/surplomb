/**
 * Whether the map key is on screen to carry a selection card, so the globe can
 * keep only a tag over the object. Not on a phone — the key lives in a sheet
 * tab there, and the selection has a tab of its own — and not while the key is
 * folded away or hidden by the clean view: a reader must never click an
 * object and get its title alone. Written for the DVF sale card (#312); the
 * DPE site card and the mobile antennas ask the same question.
 *
 * THE CLEAN VIEW HIDES WITHOUT REMOVING. `body.ui-clean-view #map-legend` is
 * `opacity: 0; visibility: hidden`, and a node hidden that way KEEPS its
 * layout boxes: `getClientRects()` answered "on screen" through the clean
 * view, and a click on a mast printed its title over the globe and its card
 * in a panel nobody could see (measured 2026-09-22, `V` then a mast). The
 * computed `visibility` is what decides now, whatever hides the key;
 * `getClientRects` is kept for the display-less cases and for the element
 * doubles in the unit tests, which have neither.
 *
 * Its own module so a layer can ask without importing `addressScanLayer.js`,
 * which brings the address-scan shell with it.
 * @returns {boolean}
 */
export function mapKeyCarriesSelection() {
  if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return false;
  if (document.documentElement?.dataset?.shell === 'phone') return false;
  const key = document.getElementById('map-legend');
  if (!key || key.hidden || key.classList?.contains('collapsed')) return false;
  if (typeof getComputedStyle === 'function') {
    const style = getComputedStyle(key);
    if (style && (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0)) {
      return false;
    }
  }
  return typeof key.getClientRects !== 'function' || key.getClientRects().length > 0;
}
