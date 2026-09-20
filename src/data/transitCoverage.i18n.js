/**
 * Strings of `src/data/transitCoverage.js` — see docs/i18n/CONVENTIONS.md.
 *
 * Same shape, and the same caveat, as `roadStatusCoverage.i18n.js`: the
 * empty-view sentence has always printed in English on the French globe
 * ("Tisséo publishes trip updates and alerts, but no vehicle positions — try
 * Bordeaux (453 live)"), and the French tests pin those words. `fr` therefore
 * repeats the shipped English and `en` carries the same claim; the French
 * rewrite belongs to whoever polishes this layer's French.
 *
 * The networks, operators and cities around those sentences are data.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  /** Why one city is dark, keyed by its area id. Each is a different claim. */
  reasons: {
    idf: {
      fr: 'publishes no GTFS-Realtime resource at all',
      en: 'publishes no GTFS-Realtime resource at all',
    },
    lyon: {
      fr: 'has no vehicle-position feed in the national catalog',
      en: 'has no vehicle-position feed in the national catalog',
    },
    marseille: { fr: 'publishes service alerts only', en: 'publishes service alerts only' },
    lille: {
      fr: 'has no vehicle-position feed in the national catalog',
      en: 'has no vehicle-position feed in the national catalog',
    },
    strasbourg: {
      fr: 'has no vehicle-position feed in the national catalog',
      en: 'has no vehicle-position feed in the national catalog',
    },
    toulouse: {
      fr: 'publishes trip updates and alerts, but no vehicle positions',
      en: 'publishes trip updates and alerts, but no vehicle positions',
    },
  },
  darkNotice: {
    fr: (operator, reason, city, vehicles) => `${operator} ${reason} — try ${city} (${vehicles} live)`,
    en: (operator, reason, city, vehicles) => `${operator} ${reason} — try ${city} (${vehicles} live)`,
    note: 'Names the publisher that is silent, and a city where the layer works.',
    keep: ['Tisséo'],
    sample: ['Tisséo', 'publishes service alerts only', 'Bordeaux', 453],
  },
  noOperatorNotice: {
    fr: (city, vehicles) => `no operator publishes live positions here — try ${city} (${vehicles} live)`,
    en: (city, vehicles) => `no operator publishes live positions here — try ${city} (${vehicles} live)`,
    sample: ['Rouen', 379],
  },
});
