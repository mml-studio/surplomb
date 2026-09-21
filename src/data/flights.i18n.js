/**
 * Legend strings of `src/data/flights.js` — see docs/i18n/CONVENTIONS.md.
 *
 * The aircraft classes themselves are captioned once, for both air layers, in
 * `aircraftClass.i18n.js`. What is here is the rest of the key, written for a
 * reader who knows no aviation word (2026-09-21: « Plage OACI militaire » and
 * « À l'estime (sondages manqués) », each with a two-line blurb, read as
 * jargon). The two rows still claim no more than the layer sees:
 *
 *   · the amber row is an aircraft whose transponder sits in a military
 *     allocation block — who owns it, never what it is doing;
 *   · the washed-out row is an aircraft the feed has stopped reporting, drawn
 *     where it would be on its last heading, so the pale tint is age.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  unknownBlurb: {
    fr: 'Type encore non déclaré — la silhouette est un substitut, remplacé '
      + 'sur place dès que la réponse de type arrive.',
    en: 'Type not declared yet — the silhouette is a stand-in, replaced in '
      + 'place as soon as the type answer arrives.',
  },
  militaryBlock: {
    label: { fr: 'Avion militaire', en: 'Military aircraft' },
  },
  tracked: {
    label: { fr: 'Contact suivi', en: 'Tracked contact' },
    blurb: {
      fr: 'Le cyan et sa trace — le chemin parcouru, pas une prédiction.',
      en: 'The cyan one and its trail — the path flown, not a prediction.',
    },
  },
  coasting: {
    label: { fr: 'Signal perdu, position estimée', en: 'Signal lost, estimated position' },
  },
  unclassified: { fr: 'Non classé', en: 'Unclassified' },

  /** How much of the world this poll covered, as the chip states it. */
  coverage: {
    regional: {
      fr: (nauticalMiles) => `cercle régional de ${nauticalMiles} NM`,
      en: (nauticalMiles) => `${nauticalMiles} NM regional circle`,
      note: 'The proxy publishes the radius; the sentence is worded here.',
      sample: [250],
    },
    worldwide: { fr: 'couverture mondiale', en: 'worldwide coverage' },
  },
  /** The snapshot the source itself served stale. */
  staleSource: {
    fr: (minutes) => `Source snapshot ${minutes} min old`,
    en: (minutes) => `Source snapshot ${minutes} min old`,
    note: 'Ships in English on the French globe; it is a fault line, not a card.',
    sample: [4],
  },
});
