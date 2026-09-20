/**
 * Strings of `src/data/mobilityOperators.js` — see docs/i18n/CONVENTIONS.md.
 *
 * One string. Everything else in that module is DATA: operator brands (Lime,
 * Vélib’, VélÔToulouse), the words a French system title leads with before it
 * says a brand, and the monograms their plates carry.
 *
 * The one string ships in English on the French globe too, and this wave does
 * not change what a French reader sees.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  unknownOperator: {
    fr: 'Unknown operator',
    en: 'Unknown operator',
    note: 'No title in the catalog, so no brand and no letter on the plate.',
  },
});
