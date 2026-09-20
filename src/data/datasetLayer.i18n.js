/**
 * Strings of src/data/datasetLayer.js — what a plugged row says about itself.
 *
 * THE COVERAGE LINE IS THE DOCTRINE, WRITTEN OUT. Rule H1 asks a layer to
 * state the edge of its data and rule A5 asks it to declare every cap, so this
 * is the one sentence a plugged dataset owes whatever it drew: how many marks,
 * out of what, cut by which ceiling, how many rows had no position, and
 * whether the answer came through the relay. `docs/DATASETS.md` prints the
 * same line in English; these are its words.
 *
 * THE PROGRESS LINE SAYS ONLY WHAT IT CAN PROVE. The fraction is exact from
 * the first page (the platform sends the total with it); the time left is
 * offered past five requests and a fifth of the work, rounded to five seconds,
 * because the measurement behind those thresholds (#113) found a two-page rate
 * wrong by 45%.
 *
 * See docs/i18n/CONVENTIONS.md.
 */
import { defineMessages } from '../i18n/messages.js';
import { countNoun } from '../i18n/format.js';

export default defineMessages({
  coverage: {
    gated: {
      fr: (span) => `au-delà de ${span}° de vue, rien n'est demandé`,
      en: (span) => `beyond a ${span}° view, nothing is requested`,
      note: 'Rule F6: no layer at every altitude. An instruction, not a failure.',
      sample: ['1.5'],
    },
    cappedOfTotal: {
      fr: (shown, total, cap) => `${shown} affichés sur ${total} — plafond ${cap}, premières lignes`,
      en: (shown, total, cap) => `${shown} shown of ${total} — cap ${cap}, first rows`,
      sample: ['4,000', '186,137', '4,000'],
    },
    inView: {
      fr: (count) => `${count} dans la vue`,
      en: (count) => `${count} in view`,
      sample: ['1,176'],
    },
    capped: {
      fr: (shown, cap) => `${shown} affichés — plafond ${cap}`,
      en: (shown, cap) => `${shown} shown — cap ${cap}`,
      sample: ['5,000', '5,000'],
    },
    whole: {
      fr: (count) => `${count} objets, jeu entier`,
      en: (count) => `${count} features, whole dataset`,
      sample: ['888'],
    },
    unplaced: {
      fr: (count) => `${count} sans position`,
      en: (count) => `${count} without position`,
      note: 'Rows the register published with no usable coordinates.',
      sample: ['12'],
    },
    viaRelay: { fr: 'via relais', en: 'via relay' },
  },

  progress: {
    seconds: {
      fr: (n) => `environ ${countNoun(n, 'seconde', 'secondes')}`,
      en: (n) => `about ${countNoun(n, 'second', 'seconds')}`,
      note: 'Rounded to five seconds: coarser than the ±10% the extrapolation carries.',
      sample: [25],
    },
    minutes: {
      fr: (minutes) => `environ ${minutes} minutes`,
      en: (minutes) => `about ${minutes} minutes`,
      note: '`minutes` is already written (`2` or `2,5` in French, `2.5` in English).',
      sample: ['2.5'],
    },
    receivedOf: {
      fr: (received, total) => `${received} sur ${total}`,
      en: (received, total) => `${received} of ${total}`,
      sample: ['2,400', '16,474'],
    },
    received: {
      fr: (received) => `${received} lignes reçues`,
      en: (received) => `${received} rows received`,
      note: 'No total published: the count is all there is to say.',
      sample: ['2,400'],
    },
    withRemaining: {
      fr: (head, remaining) => `${head} — ${remaining}`,
      en: (head, remaining) => `${head} — ${remaining}`,
      sample: ['2,400 of 16,474', 'about 25 seconds'],
    },
  },

  chip: {
    titled: {
      fr: (title, kept, loaded) => `${title} — ${kept} sur ${loaded}`,
      en: (title, kept, loaded) => `${title} — ${kept} of ${loaded}`,
      note: 'How much of the map the chip keeps, against everything loaded.',
      sample: ['Accessible 24 h/24', '41', '888'],
    },
    plain: {
      fr: (kept, loaded) => `${kept} sur ${loaded} dans la vue`,
      en: (kept, loaded) => `${kept} of ${loaded} in view`,
      sample: ['584', '888'],
    },
  },

  zoomIn: {
    fr: (span) => `Zoome : la source se charge pour une vue de moins de ${span}°`,
    en: (span) => `Zoom in: the source loads for a view narrower than ${span}°`,
    note: 'The row’s own loading label while rule F6 holds the fetch back.',
    sample: ['1.5'],
  },
});
