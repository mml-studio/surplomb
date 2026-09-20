/**
 * Strings of `src/data/meteoFranceVigilance.js` — the weather-warning map.
 *
 * THE COLOUR WORD IS THE SIGNAL, AND IT IS TRANSLATED.
 * A raised département is labelled with its level in WORDS precisely because
 * the colour cannot always be read — a bright globe washes out `#f9ff00`, and
 * orange against red is a common colour-vision collision (see the module's own
 * `vigilanceLabelText`). A word that carries the signal only to French readers
 * would leave the English globe with the colour alone, which is the failure the
 * word exists to prevent. So `VERT / JAUNE / ORANGE / ROUGE` read `GREEN /
 * YELLOW / ORANGE / RED`, and the four meanings are Météo-France's own
 * instructions, in the register a public warning uses.
 *
 * The hex values, the four levels and the nine phenomenon IDS stay untouched:
 * those are the state's signal, quoted from the technical spec.
 */
import { defineMessages } from '../i18n/messages.js';

/**
 * The nine phenomena Météo-France assesses, keyed by its own id.
 *
 * DUPLICATED ON PURPOSE from `meteoFranceVigilanceFeed.js`, with the French
 * beside it so a drift is a test failure: that module belongs to another batch
 * and is not bilingual yet. When it is, this table goes and the labels come
 * from there. Same arrangement `adresseRadiographie.i18n.js` records for the
 * amenity families.
 */
export const VIGILANCE_PHENOMENON_NAMES = defineMessages({
  1: { fr: 'Vent violent', en: 'High wind' },
  2: { fr: 'Pluie-inondation', en: 'Rain and flooding' },
  3: { fr: 'Orages', en: 'Thunderstorms' },
  4: { fr: 'Crues', en: 'River flooding' },
  5: { fr: 'Neige-verglas', en: 'Snow and ice' },
  6: { fr: 'Canicule', en: 'Heatwave' },
  7: { fr: 'Grand froid', en: 'Extreme cold' },
  8: { fr: 'Avalanches', en: 'Avalanches' },
  9: { fr: 'Vagues-submersion', en: 'Waves and marine flooding' },
});

export default defineMessages({
  /** The four levels and the one for a département the bulletin skipped. */
  levels: {
    green: {
      label: { fr: 'VERT', en: 'GREEN' },
      meaning: { fr: 'Pas de vigilance particulière', en: 'No particular vigilance' },
    },
    yellow: {
      label: { fr: 'JAUNE', en: 'YELLOW' },
      meaning: { fr: 'Soyez attentif', en: 'Be alert' },
    },
    orange: {
      label: {
        fr: 'ORANGE',
        en: 'ORANGE',
        note: 'The same word in both languages, and the one everyone knows.',
      },
      meaning: { fr: 'Soyez très vigilant', en: 'Be very vigilant' },
    },
    red: {
      label: { fr: 'ROUGE', en: 'RED' },
      meaning: {
        fr: 'Une vigilance absolue s’impose',
        en: 'Absolute vigilance is required',
        note: 'Météo-France’s own wording for level 4. Impersonal in both '
          + 'languages: the bulletin does not address a person.',
      },
    },
    unknown: {
      label: { fr: 'INCONNU', en: 'UNKNOWN' },
      meaning: {
        fr: 'Niveau non publié',
        en: 'Level not published',
        note: 'The bulletin did not assess this département. Not “green”.',
      },
    },
  },

  /** A phenomenon id the nine-row table does not know. */
  unknownPhenomenon: {
    fr: (id) => `Phénomène ${id}`,
    en: (id) => `Phenomenon ${id}`,
    sample: ['11'],
    note: 'Météo-France adding a tenth phenomenon must show as a numbered row, '
      + 'never as a blank one.',
  },

  errors: {
    shapes: {
      fr: 'Département polygons unavailable',
      en: 'Department outlines unavailable',
      note: 'The French is UNCHANGED: this layer’s fault strings have always '
        + 'been English on both globes, like every other layer’s. It is in the '
        + 'catalog only because “Département” makes the ratchet read it as '
        + 'French prose. Wording them all is one pass, not this batch’s.',
    },
  },
});
