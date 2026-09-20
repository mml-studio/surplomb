/**
 * Strings of src/mapStackChips.js — the basemap tray's chips.
 *
 * The chip's own words come from the stack (`mapStackController.i18n.js`);
 * what is here is the sentence built AROUND them for a screen reader, and the
 * two fallbacks a chip uses when the controller gave no reason.
 *
 * Those fallbacks are inherited English in both languages, like the reasons
 * they stand in for — see the header of `mapStackController.i18n.js`.
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
});
