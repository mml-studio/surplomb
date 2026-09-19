/**
 * Strings of src/data/megafireClock.js — see docs/i18n/CONVENTIONS.md.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  dayOf: {
    fr: (day, days) => `jour ${day} sur ${days}`,
    en: (day, days) => `day ${day} of ${days}`,
    note: 'Where the cursor stands in the ten-day window.',
    sample: [4, 10],
  },
  firstDetection: {
    fr: 'première détection',
    en: 'first detection',
    note: 'EFFIS FIREDATE: the first instant a satellite saw this ground burn. '
      + 'Not “start of the fire” — the fire was reported six hours later.',
  },
  lastDetection: {
    fr: 'dernière détection',
    en: 'last detection',
    note: 'EFFIS FINALDATE. Not “end of the fire”, which no dataset records.',
  },
});
