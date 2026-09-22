/**
 * @module lucideIcons
 *
 * The Lucide INTERFACE icons the globe draws in its own chrome, vendored
 * element by element — today the member tiles of a fused row in the map key
 * (`fusionTilesFor` in layerFusions.js).
 *
 * WHY LUCIDE HERE AND NOT THE MAP SETS. `mapIcons.js` carries Maki and Temaki,
 * which are authored for a label laid over imagery at 15-29 px. A tile in the
 * key is a control in a panel, read straight on against flat glass: that is
 * the band an interface set is drawn for. The landing page already vendors
 * Lucide for the same job (its scene tab bar), and the approved mock of the
 * « Infrastructure numérique » key (2026-09-22) draws exactly these glyphs.
 *
 * WHAT WAS TAKEN. The child elements of each icon (`<path>`, `<ellipse>`,
 * `<circle>`), copied verbatim from `icons/<name>.svg` at the commit recorded
 * in `licenses/lucide/NOTICE`. No coordinate is touched; the stroke attributes
 * Lucide sets on its root `<svg>` are carried on ours.
 *
 * Drawn as a CSS MASK, like the row glyph the panel already uses: the element's
 * own `background` paints through the strokes, so a tile tints its icon with
 * the colour its layer draws on the map and dims it with the tile's state,
 * without a second copy of the artwork per colour.
 *
 * @see licenses/lucide/NOTICE
 */

/** Lucide's authoring box. */
const VIEW_BOX = '0 0 24 24';

/**
 * Vendored child elements, per icon name as Lucide publishes it.
 * @type {Readonly<Record<string, ReadonlyArray<string>>>}
 */
export const LUCIDE_ICONS = Object.freeze({
  // A plug at each end of a looping cable — the submarine cables.
  cable: Object.freeze([
    '<path d="M17 19a1 1 0 0 1-1-1v-2a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2a1 1 0 0 1-1 1z"/>',
    '<path d="M17 21v-2"/>',
    '<path d="M19 14V6.5a1 1 0 0 0-7 0v11a1 1 0 0 1-7 0V10"/>',
    '<path d="M21 21v-2"/>',
    '<path d="M3 5V3"/>',
    '<path d="M4 10a2 2 0 0 1-2-2V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2a2 2 0 0 1-2 2z"/>',
    '<path d="M7 5V3"/>',
  ]),
  // A stack of disks — the data centres.
  database: Object.freeze([
    '<ellipse cx="12" cy="5" rx="9" ry="3"/>',
    '<path d="M3 5V19A9 3 0 0 0 21 19V5"/>',
    '<path d="M3 12A9 3 0 0 0 21 12"/>',
  ]),
  // A lattice mast between two pairs of waves — the ANFR antennas.
  'radio-tower': Object.freeze([
    '<path d="M4.9 16.1C1 12.2 1 5.8 4.9 1.9"/>',
    '<path d="M7.8 4.7a6.14 6.14 0 0 0-.8 7.5"/>',
    '<circle cx="12" cy="9" r="2"/>',
    '<path d="M16.2 4.8c2 2 2.26 5.11.8 7.47"/>',
    '<path d="M19.1 1.9a9.96 9.96 0 0 1 0 14.1"/>',
    '<path d="M9.5 18h5"/>',
    '<path d="m8 22 4-11 4 11"/>',
  ]),
});

const _cache = new Map();

const _b64 = (text) => (typeof btoa === 'function'
  ? btoa(text)
  : Buffer.from(text, 'utf8').toString('base64'));

/**
 * One vendored icon as a CSS mask: `data:image/svg+xml;base64,…`.
 *
 * Black strokes on nothing — a mask reads alpha, so the colour is irrelevant
 * and the element's background decides what shows through.
 *
 * @param {string} name Icon name, as Lucide publishes it.
 * @returns {?string} Data URI, or null for an icon this module does not carry.
 */
export function lucideIconMask(name) {
  const cached = _cache.get(name);
  if (cached) return cached;
  const elements = Object.hasOwn(LUCIDE_ICONS, name) ? LUCIDE_ICONS[name] : null;
  if (!elements) return null;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW_BOX}" fill="none" stroke="#000000"`
    + ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
    + `${elements.join('')}</svg>`;
  const uri = `data:image/svg+xml;base64,${_b64(svg)}`;
  _cache.set(name, uri);
  return uri;
}
