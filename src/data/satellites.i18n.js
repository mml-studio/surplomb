/**
 * Strings of `src/data/satellites.js` — Satellites.
 *
 * INHERITED IN ENGLISH, AND NOW FRENCH TOO. This layer came from the upstream
 * project with English strings, so the French globe has been keying its
 * orbits in English. The English below is the shipped wording, word for word;
 * the French is what was missing.
 *
 * `ISS` and `STARLINK` are not translated: one is the station's own
 * international abbreviation and the other a brand. The `···` and `✕` the
 * chip carries while it loads or after a failure are symbols, not words, and
 * ride with the label in both languages.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  /** The one object this layer names individually. */
  iss: {
    fr: 'ISS',
    en: 'ISS',
    note: 'The station’s own abbreviation, and the reason most people open '
      + 'this layer. Identical in both languages.',
  },

  /** The STARLINK chip: one button, four states. */
  chip: {
    idle: { fr: 'STARLINK', en: 'STARLINK' },
    loading: { fr: 'STARLINK ···', en: 'STARLINK ···' },
    failed: { fr: 'STARLINK ✕', en: 'STARLINK ✕' },
    addTitle: {
      fr: 'Ajouter la constellation Starlink complète (des milliers de points en plus)',
      en: 'Add the full Starlink broadband shell (thousands of extra points)',
    },
    loadingTitle: {
      fr: 'Chargement de la constellation Starlink…',
      en: 'Loading the Starlink shell…',
    },
    failedTitle: {
      fr: (reason) => `Starlink ${reason} — cliquer pour réessayer`,
      en: (reason) => `Starlink ${reason} — click to retry`,
      sample: ['load failed'],
      note: 'The reason is the fetch’s own message, passed through as it came.',
    },
    activeTitle: {
      fr: 'Constellation Starlink affichée — cliquer pour revenir au catalogue de base',
      en: 'Showing the full Starlink shell — click for the core catalog only',
    },
    loadFailed: {
      fr: 'échec du chargement',
      en: 'load failed',
      note: 'The fallback reason when the fetch gave none.',
    },
  },

  /** The one line on this map that runs FORWARD in time. */
  orbit: {
    label: {
      fr: 'Orbite à venir (prédiction)',
      en: 'Orbit ahead (prediction)',
    },
    blurb: {
      fr: 'Une période orbitale complète propagée EN AVANT depuis le TLE courant — '
        + 'où le satellite va, pas où il est passé. '
        + 'Les traces des avions et des navires sont l’inverse : le passé.',
      en: 'One full orbital period propagated FORWARD from the current '
        + 'TLE — where the satellite is going, not where it has been. '
        + 'Aircraft and vessel trails are the opposite: past track.',
      keep: ['TLE'],
      note: 'Without this row a reader has no way to know that two graphically '
        + 'identical lines point in opposite temporal directions.',
    },
  },
});
