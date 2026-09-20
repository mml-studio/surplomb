/**
 * Strings of src/coverageBriefing.js — the card a territorial layer shows
 * before it starts.
 *
 * Almost all of the card is in `index.html` (the shell's catalog): the
 * heading, the two buttons and the checkbox. What is here is the ONE label
 * this module rewrites, the primary button's, because it names the place the
 * flight goes to and that place is only known when the card opens.
 *
 * See docs/i18n/CONVENTIONS.md.
 */
import { defineMessages } from './i18n/messages.js';

export default defineMessages({
  gotoNamed: {
    fr: (place) => `Aller à ${place}`,
    en: (place) => `Go to ${place}`,
    note: 'The place is a preset city name — data, printed as it is stored.',
    sample: ['Paris'],
  },
  gotoDefault: {
    fr: 'Aller à la zone couverte',
    en: 'Go to the covered area',
    note: 'When the layer offers a flight but the preset has no name to give. '
      + 'The same sentence is the static fallback in index.html.',
  },
});
