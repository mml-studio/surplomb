/**
 * Strings of src/data/datasetSearch.js — the four facts under a candidate, and
 * the one phrase that says why another was set aside.
 *
 * FRESHNESS IS DELIBERATELY COARSE. The exact day of a quarterly register is
 * noise; “6 years ago” is the fact that decides. The thresholds live in the
 * module and are the same in both languages — only the words move.
 *
 * A BLOCKER IS A REASON, NOT AN APOLOGY. The raw fault stays on the row’s
 * `title` attribute; these are the few words that let a reader decide whether
 * to try another candidate or another subject.
 *
 * See docs/i18n/CONVENTIONS.md.
 */
import { defineMessages } from '../i18n/messages.js';
import { countNoun } from '../i18n/format.js';

export default defineMessages({
  /** How many features the platform says the dataset holds. */
  objects: {
    fr: (count) => `${count} objets`,
    en: (count) => `${count} features`,
    note: 'Already grouped by the formatter: 186 118 / 186,118.',
    sample: ['186,118'],
  },

  fresh: {
    // A straight apostrophe, as the module typed it: French output does not move.
    today: { fr: "à jour aujourd'hui", en: 'updated today' },
    yesterday: { fr: 'à jour hier', en: 'updated yesterday' },
    days: {
      fr: (n) => `à jour il y a ${countNoun(n, 'jour', 'jours')}`,
      en: (n) => `updated ${countNoun(n, 'day', 'days')} ago`,
      sample: [3],
    },
    weeks: {
      fr: (n) => `à jour il y a ${countNoun(n, 'semaine', 'semaines')}`,
      en: (n) => `updated ${countNoun(n, 'week', 'weeks')} ago`,
      sample: [5],
    },
    months: {
      fr: (n) => `à jour il y a ${countNoun(n, 'mois', 'mois')}`,
      en: (n) => `updated ${countNoun(n, 'month', 'months')} ago`,
      sample: [7],
    },
    frozen: {
      fr: (n) => `figé depuis ${countNoun(n, 'an', 'ans')}`,
      en: (n) => `frozen for ${countNoun(n, 'year', 'years')}`,
      note: 'Past two years the register is not late, it is abandoned.',
      sample: [6],
    },
  },

  blocked: {
    filesUnavailable: {
      fr: 'fichiers indisponibles — data.gouv.fr le signale aussi',
      en: 'files unavailable — data.gouv.fr says so too',
      note: 'The platform’s own link check agrees, so the 404 is corroborated, not guessed.',
    },
    filesNotFound: { fr: 'fichiers introuvables', en: 'files not found' },
    noPositionColumn: { fr: 'aucune colonne de position', en: 'no position column' },
    insecureAddress: { fr: 'adresse non sécurisée', en: 'address is not https' },
    hostNotAllowed: { fr: 'hébergeur non autorisé', en: 'host not allowed' },
    noReadableFile: { fr: 'aucun fichier lisible', en: 'no readable file' },
    fileTooHeavy: { fr: 'fichier trop lourd', en: 'file too heavy' },
    noPublisherOrLicence: {
      fr: 'éditeur ou licence manquants',
      en: 'publisher or license missing',
    },
    platformSilent: { fr: 'la plateforme ne répond pas', en: 'the platform is not answering' },
    unreadable: { fr: 'illisible', en: 'unreadable' },
  },

  searchUnreadable: {
    fr: 'réponse illisible de data.gouv.fr',
    en: 'unreadable answer from data.gouv.fr',
  },
});
