/**
 * The one sentence src/boot.js can still say when the cockpit never arrives.
 *
 * It is written on the loading veil, which at that moment is the only surface
 * left on the page. Kept in its own catalog rather than in main.i18n.js
 * because `src/boot.js` is the entry chunk: it must not pull the cockpit's
 * module graph in to print one line.
 */
import { defineMessages } from './i18n/messages.js';

export default defineMessages({
  failure: {
    fr: 'Le globe n’a pas pu se charger. Rechargez la page.',
    en: 'The globe could not load. Reload the page.',
    note: 'The cockpit chunk failed to fetch or to evaluate; a reload is the only cure the reader has.',
  },
});
