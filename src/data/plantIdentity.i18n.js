/**
 * The one line src/data/plantIdentity.js draws: another register's figure for
 * the same power plant, when the two disagree by more than five per cent.
 *
 * The register's name (`RTE`, `EDF`) is a proper noun and arrives as data.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  crossRegister: {
    fr: (register, power, why) => `⌁ ${register} : ${power} MW${why ? ` — ${why}` : ''}`,
    en: (register, power, why) => `⌁ ${register}: ${power} MW${why ? ` — ${why}` : ''}`,
    note: 'French puts a space before its colon; English does not. `why` is one clause, or empty.',
    sample: ['RTE', '4,280', 'only counts its 2 generating units of 100 MW and above'],
  },
});
