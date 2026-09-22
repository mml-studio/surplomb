/**
 * Strings of src/legalLinks.js — see docs/i18n/CONVENTIONS.md.
 *
 * THE LINKS ARE TRANSLATED; THE PAGES ARE NOT. `mentions-legales.html`,
 * `confidentialite.html` and `cgv.html` are French and the French text governs
 * (CONTRIBUTING.md, "Language") — a legal notice translated by a batch would
 * be a second version of a document that has exactly one. So an English
 * reader gets English labels on links that still open the French pages,
 * which is the honest arrangement: the label says what is behind the door,
 * the door is the document that binds.
 */
import { defineMessages } from './i18n/messages.js';

export default defineMessages({
  notice: {
    fr: 'Mentions légales',
    en: 'Legal notice',
    note: 'Opens /mentions-legales — in French, in both locales.',
  },
  privacy: {
    fr: 'Confidentialité',
    en: 'Privacy',
    note: 'Opens /confidentialite — in French, in both locales.',
  },
  terms: {
    fr: 'CGV',
    en: 'Terms of sale',
    note: 'Conditions générales de vente. Opens /cgv — in French, in both locales. The French keeps the abbreviation every French footer uses: the credit line has no room for the four words.',
  },
});
