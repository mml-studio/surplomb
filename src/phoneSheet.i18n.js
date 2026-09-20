/**
 * Strings of src/phoneSheet.js — see docs/i18n/CONVENTIONS.md.
 *
 * The sheet ADOPTS panels it did not build, so most of what a phone reader
 * reads belongs to `index.html` (src/i18n/markup.i18n.js, `phone.*`) or to the
 * layer in the panel. What is here is what this module writes itself: the two
 * badges, and the search field it turns into the top bar.
 */
import { defineMessages } from './i18n/messages.js';

export default defineMessages({
  clearLayers: {
    fr: 'TOUT ÉTEINDRE',
    en: 'TURN EVERYTHING OFF',
    note: 'The first row of the Layers tab. Same button as the desktop’s '
      + '`#clear-selected-layers`, moved out of the top-right corner — the '
      + 'worst place on a phone for a thumb.',
  },
  heavy: {
    fr: 'LOURD',
    en: 'HEAVY',
    note: 'Badge on a layer row that costs a handset noticeably more than the others.',
  },
  heavyTitle: {
    fr: 'Couche lourde : beaucoup d’objets à dessiner. Sur un téléphone, '
      + 'attendez-vous à un chargement plus long et à une carte moins fluide.',
    en: 'Heavy layer: a great many objects to draw. On a phone, expect a '
      + 'longer load and a less fluid map.',
  },
  searchPlaceholder: {
    fr: 'Rechercher une adresse',
    en: 'Search an address',
    note: 'Short enough to fit the bar whole at 360 px: a placeholder cut in '
      + 'the middle of a word reads as a broken field.',
  },
  searchLabel: { fr: 'Rechercher un lieu ou une adresse', en: 'Search a place or an address' },
});
