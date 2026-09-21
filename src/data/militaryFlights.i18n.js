/**
 * Legend strings of `src/data/militaryFlights.js` — see docs/i18n/CONVENTIONS.md.
 *
 * The classes are captioned in `aircraftClass.i18n.js`, and the tracked and
 * dead-reckoning rows say exactly what their civil twins say
 * (`flights.i18n.js`): one wording for one idea across the two air layers.
 *
 * The one row that belongs to this layer alone names its source, because a
 * silhouette this feed could not type is a stand-in and the key says so
 * rather than letting a drawing pass for a reading.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  unknownBlurb: {
    fr: 'Type non déclaré par adsb.lol — la silhouette est un substitut.',
    en: 'Type not declared by adsb.lol — the silhouette is a stand-in.',
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
});
