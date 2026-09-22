/**
 * Whether the map key is on screen to carry a selection card, so the globe can
 * keep only a tag over the object. Not on a phone — the key lives in a sheet
 * tab there, and the selection has a tab of its own — and not while the key is
 * folded away or hidden by the clean view: a reader must never click an
 * object and get its title alone. Written for the DVF sale card (#312); the
 * DPE site card and the mobile antennas ask the same question.
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
  return typeof key.getClientRects !== 'function' || key.getClientRects().length > 0;
}
