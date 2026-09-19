/**
 * The words src/i18n/format.js puts around numbers and dates.
 *
 * Month and weekday names are STATIC tables rather than `Intl` output: Node and
 * each browser ship their own ICU, and a label that changes with the engine
 * (`sept.` against `Sept`) is a flaky test and an inconsistent screen. The
 * French tables are byte-identical to `toLocaleDateString('fr-FR', …)` on
 * Node 24 and 26; `format.test.mjs` checks that.
 */
import { defineMessages } from './messages.js';

/** 1st, 2nd, 3rd, 4th, 11th, 12th, 13th, 21st… */
function englishOrdinalSuffix(n) {
  const tens = Math.abs(n) % 100;
  if (tens >= 11 && tens <= 13) return 'th';
  return { 1: 'st', 2: 'nd', 3: 'rd' }[Math.abs(n) % 10] || 'th';
}

export default defineMessages({
  months: {
    long: {
      fr: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
        'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
      en: ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'],
    },
    short: {
      fr: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
        'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
      en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    },
  },
  // Sunday first, like `Date#getDay()`.
  weekdays: {
    long: {
      fr: ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'],
      en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    },
    short: {
      fr: ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'],
      en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    },
  },
  age: {
    fr: (amount, unit) => `il y a ${amount} ${unit}`,
    en: (amount, unit) => `${amount} ${unit} ago`,
    note: 'How long ago a reading was taken. `amount` is already formatted.',
    sample: ['5', 'min'],
  },
  ageUnits: {
    s: { fr: 's', en: 's' },
    min: { fr: 'min', en: 'min' },
    h: { fr: 'h', en: 'h' },
    d: { fr: 'j', en: 'd' },
  },
  ordinal: {
    fr: (n, feminine) => (n === 1 ? (feminine ? '1ʳᵉ' : '1ᵉʳ') : `${n}ᵉ`),
    en: (n, feminine) => `${n}${englishOrdinalSuffix(n)}`,
    note: 'Arrondissements, deciles, centiles. French agrees 1 with the noun.',
    sample: [2, false],
  },
  euros: {
    fr: (amount) => `${amount} €`,
    en: (amount) => `€${amount}`,
    sample: ['3,200'],
  },
  eurosPerM2: {
    fr: (amount) => `${amount} €/m²`,
    en: (amount) => `€${amount}/m²`,
    sample: ['3,200'],
  },
  percent: {
    fr: (amount) => `${amount} %`,
    en: (amount) => `${amount}%`,
    sample: ['91.3'],
  },
});
