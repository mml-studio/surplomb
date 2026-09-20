/**
 * Strings of src/legalLinks.js — see docs/i18n/CONVENTIONS.md.
 *
 * THE LINKS ARE TRANSLATED; THE PAGES ARE NOT. `mentions-legales.html` and
 * `confidentialite.html` are French and the French text governs
 * (CONTRIBUTING.md, "Language") — a legal notice translated by a batch would
 * be a second version of a document that has exactly one. So an English
 * reader gets English labels on two links that still open the French pages,
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
});
