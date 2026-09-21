/**
 * Strings of `src/data/mobilityOperators.js` — see docs/i18n/CONVENTIONS.md.
 *
 * Everything else in that module is DATA: operator brands (Lime, Vélib’,
 * VélÔToulouse), the words a French system title leads with before it says a
 * brand, and the monograms their plates carry.
 *
 * `unknownOperator` ships in English on the French globe too, and this wave
 * does not change what a French reader sees.
 *
 * ── ONE KEY FOR TWO LAYERS ──────────────────────────────────────────────────
 *
 * `legend` is the vocabulary of the « Mobilités partagées » key, shared by
 * `bikeshare.js` (Vélib’ and the other docked networks) and
 * `sharedMobilityFrance.js` (the free-floating fleets). Over Paris both blocks
 * sit one above the other, and a reader must meet the same words for the same
 * things in both: operators are « Fournisseurs », a dock's fill is its
 * availability, and pressing an operator shows only that operator on both.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  unknownOperator: {
    fr: 'Unknown operator',
    en: 'Unknown operator',
    note: 'No title in the catalog, so no brand and no letter on the plate.',
  },

  legend: {
    operators: {
      fr: 'Fournisseurs',
      en: 'Operators',
      note: 'Channel name over the operator dots: the dot is the colour the map paints that operator.',
    },
    docks: {
      fr: 'Stations',
      en: 'Docks',
      note: 'Channel name over the fill-rate swatches of a dock.',
    },
    full: { fr: 'bien remplie', en: 'well stocked', note: 'More than 60 % of the dock holds a vehicle.' },
    half: { fr: 'à moitié', en: 'half full', note: 'Between 30 % and 60 %.' },
    low: { fr: 'presque vide', en: 'nearly empty', note: 'Under 30 %, or nothing to rent.' },
    showAll: {
      fr: 'Tout afficher',
      en: 'Show all',
      note: 'Releases the operator focus on every layer of the row.',
    },
    focus: {
      fr: (operator, count) => `Ne montrer que ${operator} — ${count} ici`,
      en: (operator, count) => `Show only ${operator} — ${count} here`,
      sample: ['Lime', '608'],
    },
    focused: {
      fr: (operator) => `${operator} seul à l’écran. Appuyer à nouveau pour tout revoir.`,
      en: (operator) => `Only ${operator} on screen. Press again to see everything.`,
      sample: ['Lime'],
    },
  },
});
