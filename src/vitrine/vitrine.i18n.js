/**
 * Strings the showcase's scripts write — see docs/i18n/CONVENTIONS.md.
 *
 * Everything the page shows before a script runs is in `index.html`, with its
 * English under `vitrine.*` in src/i18n/markup.i18n.js. What is here is what
 * the scripts write afterwards: the two pause buttons once pressed, and the
 * dock's line while it works.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  pause: {
    fr: 'Mettre en pause',
    en: 'Pause',
    note: 'The examples’ rotation and the scene of views; the markup ships with the same words (vitrine.pause).',
  },
  resume: { fr: 'Reprendre', en: 'Resume' },
  locating: { fr: 'Recherche de votre position…', en: 'Finding your location…' },
  opening: {
    fr: 'Ouverture du globe…',
    en: 'Opening the globe…',
    note: 'Replaces « Open the globe » on the dock’s button while the globe loads.',
  },
});
