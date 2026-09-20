/**
 * Strings of `src/data/vigicrues.js` — the river-reach flood warning.
 *
 * FOUR COLOUR WORDS AND FOUR SENTENCES, ALL OF THEM THE STATE'S.
 * The colours themselves are quoted from Vigicrues and must not be repainted
 * — the licence forbids distorting the signal, and the module header argues
 * it at length. The WORDS beside them are a different matter: the module
 * publishes the level in words on every surface precisely so that a reader who
 * cannot separate the colours still gets the signal, and a word that only
 * French readers can read would defeat that on the English globe.
 *
 * Level 1 keeps its two names, and they say different things on purpose:
 * `label` is the state's own colour word, carried to the analyst engine and to
 * every entity property, and `legendLabel` is what the key prints — *no
 * warning*, because that level is the ABSENCE of a signal and reads, on an
 * ordinary day, over all 337 monitored reaches.
 *
 * The four meanings are Vigicrues' own sentences. They are translated, not
 * paraphrased: each one names what the water is expected to do.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  levels: {
    green: {
      label: { fr: 'VERT', en: 'GREEN' },
      legendLabel: {
        fr: 'SANS VIGILANCE',
        en: 'NO WARNING',
        note: 'The key’s own row for level 1. Not “green”: what the reader is '
          + 'looking at then is the monitored river network, not a warning.',
      },
      meaning: {
        fr: 'Pas de vigilance particulière requise',
        en: 'No particular vigilance required',
      },
    },
    yellow: {
      label: { fr: 'JAUNE', en: 'YELLOW' },
      meaning: {
        fr: 'Risque de crue ou de montée rapide et dangereuse des eaux',
        en: 'Risk of flooding, or of a rapid and dangerous rise in water levels',
      },
    },
    orange: {
      label: {
        fr: 'ORANGE',
        en: 'ORANGE',
        note: 'The same word in both languages.',
      },
      meaning: {
        fr: 'Risque de crue génératrice de débordements importants',
        en: 'Risk of flooding that causes major overflow',
      },
    },
    red: {
      label: { fr: 'ROUGE', en: 'RED' },
      meaning: {
        fr: 'Risque de crue majeure — menace directe et généralisée',
        en: 'Risk of major flooding — a direct and widespread threat',
      },
    },
    unknown: {
      label: { fr: 'INCONNU', en: 'UNKNOWN' },
      meaning: {
        fr: 'Niveau non publié',
        en: 'Level not published',
        note: 'The feed supplied no assessment for this reach. Never drawn as '
          + 'green: inventing a reassuring colour is the one failure a flood '
          + 'warning must not have.',
      },
    },
  },
});
