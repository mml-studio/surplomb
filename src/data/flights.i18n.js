/**
 * Legend strings of `src/data/flights.js` — see docs/i18n/CONVENTIONS.md.
 *
 * The aircraft classes themselves are captioned once, for both air layers, in
 * `aircraftClass.i18n.js`. What is here is the rest of the key, and two of
 * its rows are deliberate refusals to over-claim:
 *
 *   · the amber row marks the transponder's REGISTERED ALLOCATION BLOCK, not
 *     a mission — an airliner on a military block is still an airliner;
 *   · the washed-out row says the position is being held by dead reckoning
 *     and is not being reported, so the transparency is age, not opacity.
 *
 * Both survive in English word for word, because a key that softened either
 * would make the layer claim things it cannot see.
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
    label: { fr: 'Plage OACI militaire', en: 'Military ICAO block' },
    blurb: {
      fr: 'L’ambre marque le bloc d’allocation enregistré du transpondeur, pas la mission.',
      en: 'Amber marks the transponder’s registered allocation block, not the mission.',
    },
  },
  tracked: {
    label: { fr: 'Contact suivi', en: 'Tracked contact' },
    blurb: {
      fr: 'Le cyan et sa trace — le chemin parcouru, pas une prédiction.',
      en: 'The cyan one and its trail — the path flown, not a prediction.',
    },
  },
  coasting: {
    label: { fr: 'À l’estime (sondages manqués)', en: 'Dead reckoning (missed polls)' },
    blurb: {
      fr: 'Délavé, et non estompé : la position est tenue à l’estime depuis '
        + 'le dernier point, elle n’est pas rapportée. Ici la transparence dit l’ancienneté.',
      en: 'Washed out, not faded: the position is being carried by dead reckoning from '
        + 'the last fix, it is not being reported. Here transparency means age.',
    },
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
