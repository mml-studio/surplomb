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
 * those are the state's signal, quoted from the technical spec. So are the
 * nine French phenomenon names, which are READ from the feed rather than
 * copied here — see `PHENOMENON_EN` below.
 */
import { defineMessages } from '../i18n/messages.js';
import { VIGILANCE_PHENOMENA } from './meteoFranceVigilanceFeed.js';

/**
 * The English of the nine phenomena, keyed by Météo-France's own id.
 *
 * Only the English. B7 typed the French here too and held the two copies
 * together with a drift test — a test that can only fail AFTER a wrong name
 * has shipped, and only if someone edits the copy rather than the original.
 * The feed quotes the spec (`VIGILANCE_PHENOMENA`) and is now the one source:
 * the French below is read from it, never retyped, so the two cannot drift.
 *
 * A tenth phenomenon, or a renumbering, arrives here with NO English rather
 * than with the wrong one — `messagesParity.test.mjs` fails on a leaf without
 * an `en`, which is the loudest place this can break.
 */
const PHENOMENON_EN = Object.freeze({
  1: 'High wind',
  2: 'Rain and flooding',
  3: 'Thunderstorms',
  4: 'River flooding',
  5: 'Snow and ice',
  6: 'Heatwave',
  7: 'Extreme cold',
  8: 'Avalanches',
  9: 'Waves and marine flooding',
});

/** The nine phenomena, the feed's French beside this file's English. */
export const VIGILANCE_PHENOMENON_NAMES = defineMessages(Object.fromEntries(
  Object.entries(VIGILANCE_PHENOMENA).map(([id, fr]) => [id, { fr, en: PHENOMENON_EN[id] }]),
));

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
