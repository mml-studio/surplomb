/**
 * Strings of src/data/irveLive.js — the one live line a charging site's card
 * carries: how many plugs are free, of how many actually answered.
 *
 * THE CLAIM THIS LINE MAKES, and the English must make it too: the
 * denominator is what QualiCharge SPOKE FOR, never what is installed. A site
 * with nine plugs where four answered reads "3 free of 4"; "3 free of 9"
 * would report five plugs as busy that nobody asked about.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  /** Every plug at the site has been silent for over a day. */
  allMute: {
    fr: (count) => `${count} borne${count > 1 ? 's' : ''} sans état publié depuis plus de 24 h`,
    en: (count) => `${count} charge point${count > 1 ? 's' : ''} with no published state for over 24 h`,
    sample: [4],
  },
  free: {
    fr: (free, answered) => `${free} libre${free > 1 ? 's' : ''} sur ${answered}`,
    en: (free, answered) => `${free} free of ${answered}`,
    note: '`answered` is how many plugs QualiCharge spoke for, not how many are installed.',
    sample: [3, 4],
  },
  down: {
    fr: (count) => `${count} hors service`,
    en: (count) => `${count} out of service`,
    sample: [1],
  },
  mute: {
    fr: (count) => `${count} muette${count > 1 ? 's' : ''}`,
    en: (count) => `${count} silent`,
    sample: [2],
  },
  /** When the reading was taken — an age, never a clock time. */
  reading: {
    fr: (age) => ` · relevé ${age}`,
    en: (age) => ` · read ${age}`,
    sample: ['25 min ago'],
  },
  age: {
    now: { fr: "à l'instant", en: 'just now' },
    minutes: {
      fr: (n) => `il y a ${n} min`,
      en: (n) => `${n} min ago`,
      sample: ['25'],
    },
    hours: {
      fr: (n) => `il y a ${n} h`,
      en: (n) => `${n} h ago`,
      sample: ['3'],
    },
    days: {
      fr: (n) => `il y a ${n} j`,
      en: (n) => `${n} d ago`,
      sample: ['2'],
    },
  },
});
