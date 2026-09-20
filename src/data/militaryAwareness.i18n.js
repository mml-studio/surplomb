/**
 * The four cohort names and the compass readout of the Context panel, in both
 * languages.
 *
 * This surface is inherited from upstream and shipped English-only; what it
 * needed was FRENCH, and the English beside it is the original verbatim.
 *
 * A COHORT NAME IS SHOWN TWICE. `src/ui.js` prints it upper-cased beside the
 * nearest contact and again as the row's own caption, so the two must read as
 * one word in either case — which is why none of them is a sentence.
 *
 * `HDG` stays `HDG`: it is the aviation abbreviation for heading, written the
 * same way in a French cockpit as in an English one.
 *
 * See docs/i18n/CONVENTIONS.md.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  cohorts: {
    flights: { fr: 'Vols', en: 'Flights' },
    military: { fr: 'Vols militaires', en: 'Military flights' },
    vessels: { fr: 'Navires AIS', en: 'AIS vessels' },
    installations: { fr: 'Sites cartographiés', en: 'Mapped installations' },
  },

  /**
   * The installations row's hedge: its count is what the CAMERA can see, not
   * everything inside the 250 km radius the other three cohorts cover. The
   * scope readout (`src/cockpitMath.js`) frames it and the panel row repeats
   * it, so it is one string read in two places.
   */
  installationCoverage: { fr: 'VUE ACTUELLE UNIQUEMENT', en: 'CURRENT VIEWPORT ONLY' },
  heading: {
    fr: (degrees) => `HDG ${degrees}°`,
    en: (degrees) => `HDG ${degrees}°`,
    note: 'HDG is the aviation abbreviation for heading and is the same in both.',
    sample: ['045'],
  },
});
