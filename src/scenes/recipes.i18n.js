/**
 * The seven built-in scene titles — see docs/i18n/CONVENTIONS.md.
 *
 * They came from upstream in English, so here the ENGLISH is the original,
 * kept verbatim, and the French is what is new. A title is the name of a
 * short clip a reader can record, so both languages read like the name of a
 * shot list, not like a sentence.
 *
 * Place names stay as they are: *Bordeaux* is *Bordeaux*, *France* is
 * *France*.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  flightsRadar: { fr: 'Radar des vols mondiaux', en: 'Global Flights Radar' },
  orbitalWatch: { fr: 'Veille orbitale', en: 'Orbital Watch' },
  thermalThreats: { fr: 'Tableau thermique des menaces', en: 'Thermal Threat Board' },
  cityOverload: { fr: 'Surcharge urbaine', en: 'City Overload' },
  omnisciencePullback: { fr: 'Recul omniscient', en: 'Omniscience Pullback' },
  bordeauxPulse: {
    fr: 'Pouls des transports bordelais',
    en: 'Bordeaux Transport Pulse',
    note: 'Set in Bordeaux because that is where the live vehicles are: '
      + '453 there on 2026-08-31 against zero in Paris, Lyon and Marseille.',
    keep: ['Bordeaux'],
  },
  franceTransit: { fr: 'Vitrine des transports français', en: 'France Transit Showcase' },
});
