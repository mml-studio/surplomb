/**
 * Display strings of `src/data/idfmFrequencyFeed.js` — see docs/i18n/CONVENTIONS.md.
 *
 * The module itself runs on BOTH sides: `vite.config.js` imports its URL
 * builders and its projection, the browser imports the words below. Nothing
 * here is read by the server — the payload carries rates, not sentences — so
 * a catalog is safe in this pair (docs/i18n/CONVENTIONS.md, "Server-side
 * modules").
 *
 * The day keys (`lundi`, `mardi`…) are COLUMN NAMES of the published file and
 * stay in the module, untranslated; only their display labels are here.
 *
 * ── THE KEY NAMES THE WAIT, NOT THE RATE ────────────────────────────────────
 * The file publishes departures per hour. Nobody decides anything on
 * "8 à 16/h"; they decide on how long they stand at the pole, so the rungs
 * state the same number as a wait (30 / rate, the mean wait for a uniform
 * arrival). The English keeps that choice, and the units with it.
 */
import { defineMessages } from '../i18n/messages.js';

/** The seven days, keyed by the file's own column name. */
export const IDFM_FREQ_DAY_NAMES = defineMessages({
  lundi: { fr: 'Lundi', en: 'Monday' },
  mardi: { fr: 'Mardi', en: 'Tuesday' },
  mercredi: { fr: 'Mercredi', en: 'Wednesday' },
  jeudi: { fr: 'Jeudi', en: 'Thursday' },
  vendredi: { fr: 'Vendredi', en: 'Friday' },
  samedi: { fr: 'Samedi', en: 'Saturday' },
  dimanche: { fr: 'Dimanche', en: 'Sunday' },
});

/**
 * One- or two-character chips: seven day chips must fit one panel row, so the
 * English is cut to the same width rather than to the CLDR abbreviation.
 */
export const IDFM_FREQ_DAY_CHIP_LABELS = defineMessages({
  lundi: { fr: 'L', en: 'M' },
  mardi: { fr: 'Ma', en: 'Tu' },
  mercredi: { fr: 'Me', en: 'W' },
  jeudi: { fr: 'J', en: 'Th' },
  vendredi: { fr: 'V', en: 'F' },
  samedi: { fr: 'S', en: 'Sa', keep: ['Sa'] },
  dimanche: { fr: 'D', en: 'Su' },
});

/** The drawn mode families of the OFFER file, keyed by this app's mode id. */
export const IDFM_FREQ_MODE_NAMES = defineMessages({
  bus: { fr: 'Bus', en: 'Bus' },
  metro: { fr: 'Métro', en: 'Metro' },
  rail: {
    fr: 'Train — RER & Transilien',
    en: 'Train — RER & Transilien',
    note: 'RER and Transilien are the network\'s own names and stay.',
    keep: ['Transilien'],
  },
  tram: { fr: 'Tramway', en: 'Tram' },
  funicular: { fr: 'Funiculaire', en: 'Funicular' },
  unknown: { fr: 'Mode non publié', en: 'Mode not published' },
});

export default defineMessages({
  /** The six rungs of the ladder, in order. The label IS the wait. */
  levels: {
    fr: [
      'plus de 30 min d’attente',
      'un passage toutes les 15 à 30 min',
      'un passage toutes les 7 à 15 min',
      'un passage toutes les 4 à 7 min',
      'un passage toutes les 2 à 4 min',
      'un passage toutes les 2 min ou moins',
    ],
    en: [
      'over 30 min wait',
      'a departure every 15 to 30 min',
      'a departure every 7 to 15 min',
      'a departure every 4 to 7 min',
      'a departure every 2 to 4 min',
      'a departure every 2 min or less',
    ],
  },
  /** A stop with a published profile and no service in the selected band. */
  silent: {
    fr: 'aucun passage dans cette tranche',
    en: 'no departure in this band',
    note: 'Drawn in grey rather than omitted: "nothing stops here at this hour" is an answer.',
  },
});
