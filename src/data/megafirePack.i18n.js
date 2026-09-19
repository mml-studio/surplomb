/**
 * Strings of src/data/megafirePack.js — see docs/i18n/CONVENTIONS.md.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  stamp: {
    fr: (day, month, time) => `${day === 1 ? '1ᵉʳ' : day} ${month} ${time}`,
    en: (day, month, time) => `${month} ${day} ${time}`,
    note: 'A satellite acquisition instant, in UTC, without the zone: a step chip '
      + '(`24 juil. 09:05`, `Jul 24 09:05`). `month` is the short month name, '
      + '`time` is HH:MM. French writes the first of the month `1ᵉʳ`.',
    sample: [24, 'Jul', '09:05'],
  },
});
