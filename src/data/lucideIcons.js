/**
 * @module lucideIcons
 *
 * The Lucide INTERFACE icons the globe draws in its own chrome, vendored
 * element by element — the member tiles of a fused row in the map key
 * (`fusionTilesFor` in layerFusions.js), and the category rail of the Layers
 * panel with its drawer controls (`layerPanelRail.js`).
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
  // Three rising bars after a dot — the 4G coverage, a part of the antennas'
  // layer with a tile of its own.
  'signal-high': Object.freeze([
    '<path d="M2 20h.01"/>',
    '<path d="M7 20v-4"/>',
    '<path d="M12 20v-8"/>',
    '<path d="M17 20V8"/>',
  ]),

  // ── The Layers panel's category rail, one glyph per group ──────────────
  // `radio-tower` above heads « Réseaux & capteurs » too: the same antenna the
  // key draws for the ANFR masts is the subject most of that group is about.

  // « Ciel & mer ».
  plane: Object.freeze([
    '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
  ]),
  // « Bâti & territoire ».
  building: Object.freeze([
    '<path d="M12 10h.01"/>',
    '<path d="M12 14h.01"/>',
    '<path d="M12 6h.01"/>',
    '<path d="M16 10h.01"/>',
    '<path d="M16 14h.01"/>',
    '<path d="M16 6h.01"/>',
    '<path d="M8 10h.01"/>',
    '<path d="M8 14h.01"/>',
    '<path d="M8 6h.01"/>',
    '<path d="M9 22v-3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/>',
    '<rect x="4" y="2" width="16" height="20" rx="2"/>',
  ]),
  // « Mobilité terrestre ».
  car: Object.freeze([
    '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>',
    '<circle cx="7" cy="17" r="2"/>',
    '<path d="M9 17h6"/>',
    '<circle cx="17" cy="17" r="2"/>',
  ]),
  // « Énergie ».
  zap: Object.freeze([
    '<path d="M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z"/>',
  ]),
  // « Risques & environnement ».
  'triangle-alert': Object.freeze([
    '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/>',
    '<path d="M12 9v4"/>',
    '<path d="M12 17h.01"/>',
  ]),
  // « Jeux branchés » — what the reader plugged in.
  plug: Object.freeze([
    '<path d="M12 22v-5"/>',
    '<path d="M15 8V2"/>',
    '<path d="M17 8a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1z"/>',
    '<path d="M9 8V2"/>',
  ]),
  // The rail's search entry and the drawer's field.
  search: Object.freeze([
    '<path d="m21 21-4.34-4.34"/>',
    '<circle cx="11" cy="11" r="8"/>',
  ]),
  // The drawer's « keep open » toggle.
  pin: Object.freeze([
    '<path d="M12 17v5"/>',
    '<path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>',
  ]),
  // The drawer's close button.
  x: Object.freeze([
    '<path d="M18 6 6 18"/>',
    '<path d="m6 6 12 12"/>',
  ]),
  // The globe's top bar (src/globeShell.js): « Apparence »…
  'sliders-horizontal': Object.freeze([
    '<path d="M10 5H3"/>',
    '<path d="M12 19H3"/>',
    '<path d="M14 3v4"/>',
    '<path d="M16 17v4"/>',
    '<path d="M21 12h-9"/>',
    '<path d="M21 19h-5"/>',
    '<path d="M21 5h-7"/>',
    '<path d="M8 10v4"/>',
    '<path d="M8 12H3"/>',
  ]),
  // …« Plus d'actions »…
  ellipsis: Object.freeze([
    '<circle cx="12" cy="12" r="1"/>',
    '<circle cx="19" cy="12" r="1"/>',
    '<circle cx="5" cy="12" r="1"/>',
  ]),
  // …a recent place in the search menu…
  clock: Object.freeze([
    '<circle cx="12" cy="12" r="10"/>',
    '<path d="M12 6v6l4 2"/>',
  ]),
  // …a city in the same menu…
  'map-pin': Object.freeze([
    '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/>',
    '<circle cx="12" cy="10" r="3"/>',
  ]),
  // …the chosen style in the Appearance panel…
  check: Object.freeze([
    '<path d="M20 6 9 17l-5-5"/>',
  ]),
  // …and the « Réglages avancés » disclosure.
  'chevron-right': Object.freeze([
    '<path d="m9 18 6-6-6-6"/>',
  ]),
  // The navigation bar at the bottom (src/globeNav.js): « Vue précédente »…
  'chevron-left': Object.freeze([
    '<path d="m15 18-6-6 6-6"/>',
  ]),
  // …« Vue du dessus », a frame seen square-on…
  scan: Object.freeze([
    '<path d="M3 7V5a2 2 0 0 1 2-2h2"/>',
    '<path d="M17 3h2a2 2 0 0 1 2 2v2"/>',
    '<path d="M21 17v2a2 2 0 0 1-2 2h-2"/>',
    '<path d="M7 21H5a2 2 0 0 1-2-2v-2"/>',
  ]),
  // …zoom out and in…
  minus: Object.freeze([
    '<path d="M5 12h14"/>',
  ]),
  plus: Object.freeze([
    '<path d="M5 12h14"/>',
    '<path d="M12 5v14"/>',
  ]),
  // …and « Réinitialiser ».
  'rotate-ccw': Object.freeze([
    '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>',
    '<path d="M3 3v5h5"/>',
  ]),
  // A flame — the « Détections récentes » tile of « Incendies ».
  flame: Object.freeze([
    '<path d="M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4"/>',
  ]),
  // A clock turning back — the « Grands incendies » tile: fires replayed.
  // Lucide's former `history`, renamed upstream.
  'rotate-ccw-clock': Object.freeze([
    '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>',
    '<path d="M3 3v5h5"/>',
    '<path d="M12 7v5l4 2"/>',
  ]),
  // Bars of a sound level — the « Bruit & urbanisme » tile of « Aéroports »,
  // under the row. « Les aéroports » beside it reuses `plane`.
  'audio-lines': Object.freeze([
    '<path d="M2 10v3"/>',
    '<path d="M6 6v11"/>',
    '<path d="M10 3v18"/>',
    '<path d="M14 8v7"/>',
    '<path d="M18 5v13"/>',
    '<path d="M22 10v3"/>',
  ]),
  // Two footprints — « À pied », the first mode tile under « Zone de
  // chalandise ». « Voiture » beside it reuses `car`.
  footprints: Object.freeze([
    '<path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z"/>',
    '<path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z"/>',
    '<path d="M16 17h4"/>',
    '<path d="M4 13h4"/>',
  ]),
  // A bicycle — « Vélo ».
  bike: Object.freeze([
    '<circle cx="18.5" cy="17.5" r="3.5"/>',
    '<circle cx="5.5" cy="17.5" r="3.5"/>',
    '<circle cx="15" cy="5" r="1"/>',
    '<path d="M12 17.5V14l-3-3 4-3 2 3h2"/>',
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
