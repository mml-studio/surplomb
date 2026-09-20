/**
 * Strings of src/phoneSelection.js — see docs/i18n/CONVENTIONS.md.
 *
 * The cards themselves carry a layer's own words (title, detail lines); only
 * the empty state and the dismiss button belong to this module.
 */
import { defineMessages } from './i18n/messages.js';

export default defineMessages({
  empty: {
    fr: 'Touchez un objet sur le globe pour le lire ici.',
    en: 'Tap something on the globe to read it here.',
    note: 'The Selection tab before anything is selected. One sentence, and it names the verb.',
  },
  dismiss: {
    fr: 'Replier le panneau',
    en: 'Collapse the panel',
    note: 'The × on the selection list. It lowers the sheet; it does not deselect.',
  },
});
