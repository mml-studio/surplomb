/**
 * Strings of src/data/datasetFields.js — the two places a card line is words
 * rather than a column's own value.
 *
 * The weekday MATCH table is not here: `lundi`…`dimanche` are the spellings a
 * French register publishes, and matching them is reading data, not writing
 * prose. What a reader sees of that match — the compacted run `lun–ven` — is
 * here, because `Mon–Fri` is the same fact in English.
 *
 * See docs/i18n/CONVENTIONS.md.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  /**
   * The three-letter weekday, Monday first — the display half of
   * `FRENCH_WEEKDAYS`, index for index.
   */
  weekdaysShort: {
    fr: ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'],
    en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    note: 'Three letters, no period: the run `lun–ven` / `Mon–Fri` is drawn from these.',
  },
  /** One detail line of a card: the manifest's label, then the cell. */
  labeled: {
    fr: (label, value) => `${label} : ${value}`,
    en: (label, value) => `${label}: ${value}`,
    note: '`label` comes from the manifest and stays as its author wrote it; only the '
      + 'separator moves, French putting a space before the colon.',
    sample: ['Town', 'Lyon'],
  },
});
