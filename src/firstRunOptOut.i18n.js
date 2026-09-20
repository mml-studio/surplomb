/**
 * The measurement button on the privacy page — see src/firstRunOptOut.js.
 *
 * It renders inside `confidentialite.html`, a French page: `getLocale()` reads
 * that document's `lang="fr"`, so a French reader sees French there whatever
 * the globe is set to. The English exists for the day the privacy page has an
 * English twin, and because a string a reader sees has an English (D1).
 */
import { defineMessages } from './i18n/messages.js';

export default defineMessages({
  accept: { fr: 'Accepter d’être mesuré', en: 'Accept being measured' },
  refuse: { fr: 'Ne pas être mesuré', en: 'Do not measure me' },
  gpc: {
    fr: 'Votre navigateur envoie le signal Global Privacy Control : il n’est pas mesuré.',
    en: 'Your browser sends the Global Privacy Control signal: it is not measured.',
  },
  refused: { fr: 'Ce navigateur n’est pas mesuré.', en: 'This browser is not measured.' },
  measured: { fr: 'Ce navigateur peut être mesuré.', en: 'This browser may be measured.' },
  notStored: { fr: 'Ce navigateur refuse d’enregistrer ce choix.', en: 'This browser refuses to store that choice.' },
});
