/**
 * The consent button on the privacy page — see src/analyticsConsentPage.js.
 * Like src/firstRunOptOut.i18n.js, it renders inside the French
 * `confidentialite.html`; the English is there for the day it has a twin.
 */
import { defineMessages } from './i18n/messages.js';

export default defineMessages({
  withdraw: { fr: 'Retirer mon accord', en: 'Withdraw my consent' },
  grant: { fr: 'Accepter l’analyse détaillée', en: 'Accept the detailed analysis' },
  granted: {
    fr: 'Ce navigateur a accepté l’analyse détaillée de ses visites.',
    en: 'This browser accepted the detailed analysis of its visits.',
  },
  notGranted: {
    fr: 'L’analyse détaillée n’est pas active dans ce navigateur.',
    en: 'The detailed analysis is not active in this browser.',
  },
  notMeasured: { fr: 'Ce navigateur n’est pas mesuré.', en: 'This browser is not measured.' },
  notStored: { fr: 'Ce navigateur refuse d’enregistrer ce choix.', en: 'This browser refuses to store that choice.' },
});
