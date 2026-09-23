/**
 * Strings of src/globeShell.js — see docs/i18n/CONVENTIONS.md.
 *
 * The shell MOVES controls it did not build (the search form, the style
 * buttons, the base-map chips, the former DISPLAY panel), so most of what the
 * reader sees belongs to `index.html` (src/i18n/markup.i18n.js, `appearance.*`
 * and `placeSearch.*`). What is here is what this module writes itself.
 */
import { defineMessages } from './i18n/messages.js';

export default defineMessages({
  searchPlaceholder: {
    fr: 'Rechercher une adresse, une ville, un lieu…',
    en: 'Search for an address, a city, a place…',
    note: 'The place search at the top centre of the globe. The phone keeps its shorter placeholder.',
  },
  searchLabel: {
    fr: 'Rechercher une adresse, une ville ou un lieu',
    en: 'Search for an address, a city or a place',
    note: 'Accessible name of the same field.',
  },
  shortcutHint: {
    fr: (keys) => `Raccourci : ${keys} ou /`,
    en: (keys) => `Shortcut: ${keys} or /`,
    sample: ['⌘ K'],
    note: 'Tooltip of the key badge in the search field. The argument is « ⌘ K » on a Mac, « Ctrl K » elsewhere.',
  },
  recentFly: {
    fr: (place) => `Aller à ${place}`,
    en: (place) => `Go to ${place}`,
    sample: ['Lyon'],
    keep: ['Lyon'],
    note: 'Accessible name of a recent place in the search menu.',
  },
});
