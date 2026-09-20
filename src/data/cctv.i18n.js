/**
 * The two legend rows of the Public cameras layer, in both languages.
 *
 * This layer is inherited from upstream and shipped English-only; what it
 * needed was FRENCH, and the English beside it is the original verbatim.
 *
 * THE DISTINCTION IS THE LAYER'S ONE HONEST CLAIM. A solid cone is a bearing
 * the source itself published; a dashed one is a placeholder, because nobody
 * surveyed that camera's direction. Drawing the two the same way would turn a
 * guess into a measurement, which is doctrine A1, and neither language may
 * blur it.
 *
 * See docs/i18n/CONVENTIONS.md.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  mapped: {
    label: { fr: 'Direction relevée', en: 'Direction mapped' },
    blurb: {
      fr: 'Cône plein — l’orientation vient du champ « direction » de la source.',
      en: 'Solid cone — the bearing comes from the source’s own direction tag.',
    },
  },
  unmapped: {
    label: { fr: 'Direction non relevée', en: 'Direction not mapped' },
    blurb: {
      fr: 'Cône pointillé — personne n’a relevé cette orientation ; l’azimut dessiné est un substitut.',
      en: 'Dashed cone — nobody surveyed this bearing; the azimuth drawn is a placeholder.',
    },
  },
});
