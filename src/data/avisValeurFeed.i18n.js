/**
 * Strings of `src/data/avisValeurFeed.js` — the widening ladder of the
 * property valuation.
 *
 * THIS MODULE RUNS ON THE SERVER. `vite.config.js` imports it for
 * `/api/avis-valeur`, and a server has no locale by design
 * (docs/i18n/CONVENTIONS.md). So {@link AVIS_RUNGS} keeps publishing the
 * French label — read straight off this catalog's definition, so the two
 * cannot drift — and the browser that draws the card calls
 * `avisRungLabel(rung)` with the rung's stable id.
 */
import { defineMessages } from '../i18n/messages.js';

/**
 * The subject the layer values, keyed by the DVF `type_local` it is asked
 * for — the same two values `dvfSales.js` filters the map with, which is what
 * lets one chip steer both layers.
 */
export const SUBJECT_TYPES = defineMessages({
  Appartement: { fr: 'Appartement', en: 'Apartment' },
  Maison: { fr: 'Maison', en: 'House' },
});

/**
 * One rung of the ladder: how far the search reached, and how wide a surface
 * band it accepted. Keyed by the rung's own id, which is what the payload,
 * the stats and the share link carry.
 */
export default defineMessages({
  block: { fr: '300 m, ±20 % de surface', en: '300 m, ±20% on surface' },
  quarter: { fr: '600 m, ±20 % de surface', en: '600 m, ±20% on surface' },
  district: { fr: '1,5 km, ±20 % de surface', en: '1.5 km, ±20% on surface' },
  commune: {
    fr: 'toute la commune, ±20 % de surface',
    en: 'the whole municipality, ±20% on surface',
  },
  'commune-wide-band': {
    fr: 'toute la commune, ±35 % de surface',
    en: 'the whole municipality, ±35% on surface',
  },
});
