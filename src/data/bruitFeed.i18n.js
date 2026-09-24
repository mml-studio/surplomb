/**
 * Strings of `src/data/bruitFeed.js` — the aircraft-noise plans, projected.
 *
 * NONE OF THIS RUNS ON THE SERVER. `vite.config.js` imports the projection
 * (`projectBruit`, `projectBruitArea`) and the URL builders from that module;
 * it imports none of the wording below. Every message here is read from
 * `bruitFrance.js`, in a browser, at draw time — so this catalog is an
 * ordinary one and the server keeps publishing raw thresholds and raw zone
 * letters, which is what it should publish anyway.
 *
 * ── THE SIXTY-CHARACTER BUDGET IS PART OF THE TRANSLATION ───────────────────
 *
 * `worldOverlayDraw` wraps a card line at about sixty characters, and the card
 * itself is six lines. So a sentence that runs long does not say more — it
 * costs a second row and pushes a fact off the bottom of the card. The French
 * zone sentences were written to that budget (`bruitFeed.js` says so above
 * each table) and the English is written to the same one. Where a word had to
 * go, it is the one the sentence beside it already carries.
 *
 * ── AND "70" IS NOT ALWAYS DECIBELS ─────────────────────────────────────────
 *
 * A pre-2002 plan publishes the *indice psophique*, whose numbers look exactly
 * like decibels and are not. `— pas des décibels` / `— not decibels` is
 * therefore not a gloss and is never dropped for length: both indices can
 * appear on one card, so the warning cannot lean on a fuller line above it.
 */
import { defineMessages } from '../i18n/messages.js';

/**
 * The unit a threshold is quoted in, by index.
 *
 * `dB(A)` is a symbol and identical everywhere. `ancien indice` names the
 * SCALE the number sits on rather than a unit, which is why it leads the
 * number instead of following it.
 */
export const BRUIT_INDEX_UNITS = defineMessages({
  lden: { fr: 'dB(A)', en: 'dB(A)', note: 'A unit symbol. The same in every language.' },
  psophique: { fr: 'ancien indice', en: 'old index' },
});

/**
 * What each PEB zone means for the ground under it.
 *
 * Written for somebody who has never read a plan d’exposition au bruit: the
 * register's own vocabulary (*constructions à usage d’habitation*, a zone D
 * named with the bare word *information*) is faithful and unreadable. What a
 * reader wants from a coloured polygon is whether a home can be built on it,
 * so that is the clause these lead with; the nuisance grade stays in front of
 * it because it is the only channel comparable between two airports on
 * different indices.
 */
export const PEB_ZONE_SENTENCES = defineMessages({
  A: {
    fr: 'gêne très forte : logements neufs interdits',
    en: 'very strong nuisance: no new housing',
  },
  B: {
    fr: 'gêne forte : logements neufs très limités, isolation imposée',
    en: 'strong nuisance: new housing tightly limited, soundproofed',
  },
  C: {
    fr: 'gêne modérée : logements neufs limités, isolation imposée',
    en: 'moderate nuisance: new housing limited, soundproofed',
  },
  D: {
    fr: 'construction libre, isolation imposée, acheteurs prévenus',
    en: 'building allowed, soundproofing required, buyers warned',
    note: 'Zone D is the one with no nuisance grade: the plan only obliges '
      + 'insulation and disclosure. Both sentences keep that shape.',
  },
});

export default defineMessages({
  /** How each index is explained on a card, once, in full. */
  index: {
    lden: {
      fr: 'indice Lden : la soirée et la nuit comptent plus fort',
      en: 'Lden index: evening and night count for more',
      note: 'Lden weights the evening by +5 dB and the night by +10. The '
        + 'sentence says the consequence, not the arithmetic.',
    },
    psophique: {
      fr: 'indice psophique, d’avant 2002 : pas convertible en dB(A)',
      en: 'psophic index, from before 2002: does not convert to dB(A)',
    },
    unknown: {
      fr: 'unité incertaine : l’arrêté et les seuils ne concordent pas',
      en: 'unit uncertain: the order and the thresholds disagree',
      note: '“arrêté” is the prefectoral order; the glossary words it “order”.',
    },
  },

  /** The threshold of one band, assembled around numbers already formatted. */
  band: {
    range: {
      fr: (low, high) => `de ${low} à ${high}`,
      en: (low, high) => `${low} to ${high}`,
      sample: [56, 65],
      note: 'The thresholds are published as whole numbers (and once as 56.5) '
        + 'and are printed exactly as published, never re-formatted.',
    },
    andAbove: {
      fr: (value) => `${value} et plus`,
      en: (value) => `${value} and above`,
      sample: [70],
      note: 'The innermost zone has no upper bound in the register.',
    },
    noUnit: {
      fr: (span) => `${span}, unité non déterminée`,
      en: (span) => `${span}, unit not determined`,
      sample: ['56 to 65'],
    },
    psophic: {
      fr: (unit, span) => `${unit} ${span} — pas des décibels`,
      en: (unit, span) => `${unit} ${span} — not decibels`,
      sample: ['old index', '89 to 96'],
      note: 'Never dropped for length: the reader is holding two digits that '
        + 'look exactly like decibels and are not.',
    },
    withUnit: {
      fr: (span, unit) => `${span} ${unit}`,
      en: (span, unit) => `${span} ${unit}`,
      sample: ['56 to 65', 'dB(A)'],
    },
    valueAndAbove: {
      fr: (value, unit) => `${value} ${unit} et plus`,
      en: (value, unit) => `${value} ${unit} and above`,
      sample: [70, 'dB(A)'],
      note: '`70 dB(A) et plus`, not `70 et plus dB(A)`: the unit belongs to '
        + 'the number, the open end to the band.',
    },
    dailyAverage: {
      fr: (threshold) => `${threshold} en moyenne sur 24 h`,
      en: (threshold) => `${threshold} averaged over 24 h`,
      sample: ['56 to 65 dB(A)'],
    },
  },
});
