/**
 * Strings of `src/data/roadStatusCoverage.js` — see docs/i18n/CONVENTIONS.md.
 *
 * ── WHY THE FRENCH SIDE IS IN ENGLISH ───────────────────────────────────────
 *
 * This module's empty-state sentence has always printed in English, on the
 * French globe: "DIRIF publishes neither counting stations nor a
 * traffic-status feed — try Rouen (63 segments)". Translating it into French
 * would change what a French reader sees, which this wave does not do
 * (docs/i18n/CONVENTIONS.md: French output stays byte-identical, and
 * `roadStatusCoverage.test.mjs` pins these words). So `fr` repeats the
 * sentence exactly as it ships today and `en` carries the same claim, and the
 * French rewrite is left to whoever polishes this layer's French next.
 *
 * The names either side of those sentences are DATA and stay in the module:
 * operators (DIRIF, DIR Est), cities, traffic-management centres.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  /** Why one dark area is dark — keyed by the area id, and its own claim. */
  reasons: {
    idf: {
      fr: 'publishes neither counting stations nor a traffic-status feed',
      en: 'publishes neither counting stations nor a traffic-status feed',
      note: 'Île-de-France: the state is not measured at all. Ships in English on the French globe.',
    },
    lille: {
      fr: 'publishes 357 live road states under site ids that are neither a referential row nor an address',
      en: 'publishes 357 live road states under site ids that are neither a referential row nor an address',
      note: 'Measured, published, unlocatable. The count is a measurement (2026-09-01).',
    },
    'nancy-metz': {
      fr: 'publishes 74 live road states, and 70 of its 72 stations carry neither a coordinate nor a point repère',
      en: 'publishes 74 live road states, and 70 of its 72 stations carry neither a coordinate nor a point repère',
      note: 'point repère = the kilometer post of the national network; kept as published.',
      keep: ['repère'],
    },
  },
  /** A viewport inside a dark area: who is silent, why, and where to look. */
  darkNotice: {
    fr: (operator, reason, city, segments) => `${operator} ${reason} — try ${city} (${segments} segments)`,
    en: (operator, reason, city, segments) => `${operator} ${reason} — try ${city} (${segments} segments)`,
    note: '`reason` is one of the sentences above. Ships in English on the French globe.',
    sample: ['DIRIF', 'publishes neither counting stations nor a traffic-status feed', 'Rouen', 63],
  },
  /** The ordinary case: not a failure, simply not this dataset\'s network. */
  offNetworkNotice: {
    fr: (city, segments) => `outside the State-operated national road network — try ${city} (${segments} segments)`,
    en: (city, segments) => `outside the State-operated national road network — try ${city} (${segments} segments)`,
    note: 'Most of France is not a State-operated motorway; the sentence blames no publisher.',
    sample: ['Limoges', 53],
  },
});
