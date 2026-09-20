/**
 * Strings of `src/data/comptagesRhythm.js` — see docs/i18n/CONVENTIONS.md.
 *
 * ── WHAT THE WORDS HAVE TO KEEP APART ───────────────────────────────────────
 *
 * This layer replays an ARCHIVED typical week, and three absences that look
 * alike must not read alike: an arc that never measures (`Aucune mesure`), an
 * arc that measures and published nothing for THIS hour (`Pas de mesure à
 * cette heure`), and an arc that publishes occupancy but no count
 * (`Occupation seule`). The English keeps the three apart word for word.
 *
 * The day types are `jour ouvré type` and `week-end type` — a mean over five
 * weekdays and over two weekend days. Neither is a Tuesday and neither is a
 * Sunday, and calling them one would name a day nobody measured.
 *
 * The rhythm cuts are written as INEQUALITIES rather than sentences: a cut is
 * a comparison, and the prose form wrapped five of the seven key rows.
 */
import { defineMessages } from '../i18n/messages.js';

/** The city's own occupancy bands, keyed by the `k` field's own ids. */
export const COMPTAGES_OCCUPANCY_NAMES = defineMessages({
  fluide: { fr: 'Fluide', en: 'Free-flowing' },
  presature: { fr: 'Pré-saturé', en: 'Near saturation' },
  sature: { fr: 'Saturé', en: 'Saturated' },
  bloque: { fr: 'Bloqué', en: 'Jammed' },
});

/** What the city says about the arc itself, keyed on `etat_barre`. */
export const COMPTAGES_BARRE_NAMES = defineMessages({
  o: { fr: 'déclaré ouvert', en: 'declared open' },
  b: { fr: 'déclaré barré', en: 'declared closed' },
  i: { fr: 'déclaré invalide', en: 'declared invalid' },
});

/** The seven rhythms the wheel paints. */
export const COMPTAGES_RHYTHM_NAMES = defineMessages({
  nocturne: { fr: 'Nocturne', en: 'Night' },
  weekend: { fr: 'Week-end', en: 'Weekend' },
  pendulaire: { fr: 'Pendulaire', en: 'Commuter' },
  matinal: { fr: 'Pointe du matin', en: 'Morning peak' },
  vesperal: { fr: 'Pointe du soir', en: 'Evening peak' },
  plateau: { fr: 'Continu', en: 'Steady' },
  indetermine: { fr: 'Rythme indéterminé', en: 'Rhythm undetermined' },
});

export default defineMessages({
  states: {
    counted: { fr: 'Véhicules comptés', en: 'Vehicles counted' },
    occupancy: { fr: 'Occupation seule', en: 'Occupancy only' },
    silent: { fr: 'Aucune mesure', en: 'No measurement' },
  },
  hourGap: {
    fr: 'Pas de mesure à cette heure',
    en: 'No measurement at this hour',
    note: 'The THIRD absence: a measured street, an unmeasured hour. Never the bottom of the width scale.',
  },

  flow: {
    under: {
      fr: (top) => `< ${top} véh/h`,
      en: (top) => `< ${top} veh/h`,
      sample: [100],
    },
    over: {
      fr: (top) => `≥ ${top} véh/h`,
      en: (top) => `≥ ${top} veh/h`,
      sample: ['1,000'],
    },
    between: {
      fr: (low, high) => `${low}–${high} véh/h`,
      en: (low, high) => `${low}–${high} veh/h`,
      sample: [250, '500'],
    },
    domain: {
      fr: (low, high) => `de moins de ${low} à plus de ${high}`,
      en: (low, high) => `from under ${low} to over ${high}`,
      note: 'The domain of the width scale, in the unit the loops count.',
      sample: [100, '1,000'],
    },
  },

  dayTypes: {
    weekday: { fr: 'jour ouvré type', en: 'typical weekday' },
    weekend: { fr: 'week-end type', en: 'typical weekend' },
  },
  moments: {
    mean: { fr: 'Moyenne ouvrée', en: 'Weekday average' },
    clock: { fr: 'À cette heure', en: 'At this hour' },
    // Abbreviated to the French chips' width: seven of them share one row.
    w04: { fr: 'Sem. 04 h', en: 'Wk 04:00' },
    w08: { fr: 'Sem. 08 h', en: 'Wk 08:00' },
    w18: { fr: 'Sem. 18 h', en: 'Wk 18:00' },
    e04: { fr: 'W-E 04 h', en: 'WE 04:00' },
    e18: { fr: 'W-E 18 h', en: 'WE 18:00' },
  },
  /** One hour of the archived week: `18 h` / `18:00`. */
  hour: {
    fr: (hour) => `${hour} h`,
    en: (hour) => `${hour}:00`,
    note: '`hour` is the two-digit hour. 24-hour clock in both languages (glossary).',
    sample: ['18'],
  },
  slot: {
    mean: { fr: 'moyenne de l’heure ouvrée', en: 'average weekday hour' },
    dayHour: {
      fr: (day, hour) => `${day} · ${hour}`,
      en: (day, hour) => `${day} · ${hour}`,
      sample: ['typical weekday', '18:00'],
    },
  },

  /** The seven cuts, as inequalities. A cut is a comparison. */
  cuts: {
    nocturne: {
      fr: (window, share) => `${window} ≥ ${share} % du jour ouvré`,
      en: (window, share) => `${window} ≥ ${share}% of the weekday`,
      sample: ['00–04 h', 30],
    },
    weekend: {
      fr: (ratio) => `week-end ≥ ${ratio} × semaine`,
      en: (ratio) => `weekend ≥ ${ratio} × weekday`,
      sample: ['1.2'],
    },
    pendulaire: {
      fr: (morning, evening, shoulder) => `${morning} et ${evening} ${shoulder}`,
      en: (morning, evening, shoulder) => `${morning} and ${evening} ${shoulder}`,
      sample: ['06–09 h', '16–19 h', '≥ 1.2 × the 10–15 h trough'],
    },
    matinal: {
      fr: (morning, shoulder) => `${morning} seule ${shoulder}`,
      en: (morning, shoulder) => `${morning} alone ${shoulder}`,
      sample: ['06–09 h', '≥ 1.2 × the 10–15 h trough'],
    },
    vesperal: {
      fr: (evening, shoulder) => `${evening} seule ${shoulder}`,
      en: (evening, shoulder) => `${evening} alone ${shoulder}`,
      sample: ['16–19 h', '≥ 1.2 × the 10–15 h trough'],
    },
    plateau: {
      fr: (shoulder) => `aucune pointe ${shoulder}`,
      en: (shoulder) => `no peak ${shoulder}`,
      sample: ['≥ 1.2 × the 10–15 h trough'],
    },
    indetermine: {
      fr: (hours, total) => `moins de ${hours} h publiées sur ${total}`,
      en: (hours, total) => `fewer than ${hours} h published of ${total}`,
      sample: [12, 24],
    },
    shoulder: {
      fr: (ratio, midday) => `≥ ${ratio} × le creux ${midday}`,
      en: (ratio, midday) => `≥ ${ratio} × the ${midday} trough`,
      sample: ['1.2', '10–15 h'],
    },
  },

  /** One day of a card: the sparkline, its peak, its trough, its coverage. */
  day: {
    noHours: {
      fr: (label) => `${label} — aucune heure comptée sur 24`,
      en: (label) => `${label} — no hour counted out of 24`,
      sample: ['typical weekend'],
    },
    bars: {
      fr: (label, bars) => `${label} ${bars}`,
      en: (label, bars) => `${label} ${bars}`,
      sample: ['typical weekday', '▁▂▅█▆▃▁'],
    },
    peak: {
      fr: (hour, value) => `pointe ${hour} · ${value} véh/h`,
      en: (hour, value) => `peak ${hour} · ${value} veh/h`,
      sample: ['18:00', '1,240'],
    },
    trough: {
      fr: (hour, value) => `creux ${hour} · ${value}`,
      en: (hour, value) => `trough ${hour} · ${value}`,
      sample: ['04:00', '120'],
    },
    measured: {
      fr: (hours) => `${hours}/24 h mesurées`,
      en: (hours) => `${hours}/24 h measured`,
      sample: [19],
    },
  },
});
