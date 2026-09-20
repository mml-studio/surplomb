/**
 * Strings of src/zoomPrompt.js — the card that appears in the middle of the
 * globe when a switched-on layer is waiting for a closer camera.
 *
 * The card mostly prints the LAYER's own sentence (`stats.loadingLabel`), which
 * belongs to that layer's catalog; what is here is the frame around it — the
 * heading, the fallback for a layer that published no sentence, the button that
 * flies there, and the count of the layers it did not have room for.
 *
 * See docs/i18n/CONVENTIONS.md.
 */
import { defineMessages } from './i18n/messages.js';

export default defineMessages({
  /** What a waiting layer that published no sentence of its own is given. */
  fallbackMessage: {
    fr: 'Zoome pour charger cette couche',
    en: 'Zoom in to load this layer',
    note: 'No ceiling is named: the layer did not publish one, and inventing a number would be a guess.',
  },
  title: {
    fr: 'Zoome pour voir cette couche',
    en: 'Zoom in to see this layer',
  },
  titleMany: {
    fr: (count) => `${count} couches attendent un zoom`,
    en: (count) => `${count} layers are waiting for a closer view`,
    sample: [3],
  },
  close: { fr: 'Fermer', en: 'Close', note: 'The ✕ on the card. Dismisses this situation, not for ever.' },
  fly: {
    fr: 'Zoomer ici',
    en: 'Zoom here',
    note: 'Flies to the view that fits under the layer’s own ceiling.',
  },
  more: {
    fr: (count) => `+${count} autres couches`,
    en: (count) => `+${count} more layers`,
    sample: [4],
  },
  moreOne: { fr: '+1 autre couche', en: '+1 more layer' },
});
