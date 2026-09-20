/**
 * Strings of `src/data/loyersFeed.js` — the ministry's rent map.
 *
 * THIS MODULE RUNS ON THE SERVER, and nowhere else: `vite.config.js` imports
 * it for `/api/loyers-fr`, and a server has no locale by design
 * (docs/i18n/CONVENTIONS.md). So the payload keeps publishing the French
 * labels — read straight off this catalog's definition, so the two cannot
 * drift — and a browser drawing them calls `loyersSegmentLabel()` and
 * `loyersBasisLabel()` with the stable key beside each label.
 *
 * The Address X-ray (`adresseRadiographie.i18n.js`) carries the same two
 * tables for the rows it prints; its own test compares them against a
 * captured payload, so a rewording here fails there.
 */
import { defineMessages } from '../i18n/messages.js';

/**
 * The four segments the model publishes, keyed by `segment.key`. `T1-T2` is
 * the French room count of the published segment, spelled out in English.
 */
export const SEGMENTS = defineMessages({
  app: { fr: 'Appartement', en: 'Apartment' },
  app12: { fr: 'Appartement T1-T2', en: 'Apartment, 1–2 rooms' },
  app3: { fr: 'Appartement T3 et plus', en: 'Apartment, 3 rooms and over' },
  maison: { fr: 'Maison', en: 'House' },
});

/**
 * How the model arrived at a commune's figure, keyed by the file's `TYPPRED`.
 *
 * The wording matters more than the code: `maille` is the modal case, and a
 * reader who is not told will assume the number was computed where they are
 * standing.
 */
export const BASIS = defineMessages({
  commune: { fr: 'estimé sur la commune', en: 'estimated on the municipality' },
  maille: {
    fr: 'repris d’une maille de communes voisines',
    en: 'taken from a mesh of neighboring municipalities',
  },
  epci: {
    fr: 'repris de l’intercommunalité',
    en: 'taken from the intercommunality (EPCI)',
  },
});

export default defineMessages({
  /** A `TYPPRED` nobody has documented: counted as borrowed, and named. */
  undocumentedBasis: {
    fr: (code) => `base « ${code} » non documentée`,
    en: (code) => `undocumented basis “${code}”`,
    sample: ['xx'],
  },
  /** Where the model's observations come from — it changes the reading. */
  observationSource: {
    fr: 'annonces leboncoin et Groupe SeLoger, 2019-2025',
    en: 'leboncoin and Groupe SeLoger listings, 2019-2025',
    keep: ['leboncoin', 'Groupe SeLoger'],
  },
  /** The quarter the predicted dwelling is let in. */
  referencePeriod: {
    fr: '3ᵉ trimestre 2025',
    en: 'Q3 2025',
  },
});
