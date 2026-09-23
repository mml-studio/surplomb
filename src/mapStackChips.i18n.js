/**
 * Strings of src/mapStackChips.js — the basemap tray's chips.
 *
 * The chip's own words come from the stack (`mapStackController.i18n.js`);
 * what is here is the sentence built AROUND them for a screen reader, the
 * two fallbacks a chip uses when the controller gave no reason, and what the
 * tray says while a data layer holds the globe on one stack (`basemapLock.js`).
 *
 * The fallbacks are inherited English in both languages, like the reasons
 * they stand in for — see the header of `mapStackController.i18n.js`. The lock
 * strings are not diagnostics: every reader who opens the tray with the layer
 * on reads them, so they are French on the French page.
 *
 * See docs/i18n/CONVENTIONS.md.
 */
import { defineMessages } from './i18n/messages.js';

export default defineMessages({
  unavailableAriaLabel: {
    fr: (stack, reason) => `${stack} unavailable: ${reason}`,
    en: (stack, reason) => `${stack} unavailable: ${reason}`,
    note: 'Read aloud instead of the chip’s own name when the stack cannot be picked.',
    sample: ['Bing Aerial', 'Cesium ion token required'],
  },
  coverageAriaLabel: {
    fr: (stack, note) => `${stack} — ${note}`,
    en: (stack, note) => `${stack} — ${note}`,
    note: 'A stack that IS selectable but only covers part of the world.',
    sample: ['Satellite', 'IGN 20 cm over France, world satellite beyond'],
  },
  ionRequired: { fr: 'Cesium ion token required', en: 'Cesium ion token required' },
  stackUnavailable: {
    fr: (stack) => `${stack} is unavailable`,
    en: (stack) => `${stack} is unavailable`,
    sample: ['Bing Aerial'],
  },
  thisStack: { fr: 'This map stack', en: 'This map stack' },

  /** While a data layer holds the globe on one stack (`basemapLock.js`). */
  lockedHint: {
    fr: (layer) => `Indisponible avec la couche ${layer}`,
    en: (layer) => `Not available with the ${layer} layer`,
    note: 'Tooltip of every other basemap chip while the layer is on.',
    sample: ['Digital infrastructure'],
  },
  lockedAriaLabel: {
    fr: (stack, layer) => `${stack} : indisponible avec la couche ${layer}`,
    en: (stack, layer) => `${stack}: not available with the ${layer} layer`,
    note: 'Read aloud instead of the chip’s own name while the layer is on.',
    sample: ['OSM', 'Digital infrastructure'],
  },
  lockNote: {
    fr: (stack, layer) => `${stack} imposé par ${layer} : les autres fonds de carte ne sont pas disponibles avec cette couche.`,
    en: (stack, layer) => `${stack} is set by ${layer}: the other map sources are not available with this layer.`,
    note: 'The line under the chips while the layer is on. The stack is the basemap it imposes.',
    sample: ['Satellite', 'Digital infrastructure'],
  },
});
