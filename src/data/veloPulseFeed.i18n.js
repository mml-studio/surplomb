/**
 * Strings of `src/data/veloPulseFeed.js` — the typical cycling week.
 * See docs/i18n/CONVENTIONS.md.
 *
 * ── THE ONE DISTINCTION THIS FILE MUST NOT LOSE ─────────────────────────────
 *
 * Two instruments are drawn on one map. A Vélo’v dock measures a STOCK — how
 * many bikes are parked there — so its weekly MAXIMUM is the middle of the
 * night; a Paris counter measures a FLUX and its maximum is the rush hour.
 * Every sentence here is written so the two cannot be read as the same thing:
 * the bands are a share of the site's own maximum, never "peak", and the card
 * says in that instrument's own words what a high share means.
 *
 * The day keys (`lundi`…) are the pack's, and the hours are Paris wall-clock
 * hours: `slotLabel` prints a weekday plus an hour, on the 24-hour clock in
 * both languages.
 */
import { defineMessages } from '../i18n/messages.js';
import { plural } from '../i18n/format.js';

/** The seven days of the week cursor, keyed by the pack's own day name. */
export const PULSE_DAY_NAMES = defineMessages({
  lundi: { fr: 'lundi', en: 'Monday' },
  mardi: { fr: 'mardi', en: 'Tuesday' },
  mercredi: { fr: 'mercredi', en: 'Wednesday' },
  jeudi: { fr: 'jeudi', en: 'Thursday' },
  vendredi: { fr: 'vendredi', en: 'Friday' },
  samedi: { fr: 'samedi', en: 'Saturday' },
  dimanche: { fr: 'dimanche', en: 'Sunday' },
});

export default defineMessages({
  /** `mardi 08h` / `Tuesday 08:00` — the hour of the week on screen. */
  slot: {
    fr: (day, hour) => `${day} ${hour}h`,
    en: (day, hour) => `${day} ${hour}:00`,
    note: 'The pack is written in Paris wall-clock hours; 24-hour clock in both languages.',
    sample: ['Tuesday', '08'],
  },

  /** The five bands, as a share of the site's OWN weekly maximum. */
  bands: {
    under20: { fr: '< 20 %', en: '< 20%' },
    to40: { fr: '20 – 40 %', en: '20 – 40%' },
    to60: { fr: '40 – 60 %', en: '40 – 60%' },
    to80: { fr: '60 – 80 %', en: '60 – 80%' },
    over80: { fr: '≥ 80 %', en: '≥ 80%' },
  },

  /** What the network is doing at one hour, in four words. */
  phrase: {
    weekend: { fr: 'week-end', en: 'weekend' },
    unsampled: { fr: 'heure non relevée', en: 'hour not sampled' },
    weekendPeak: { fr: 'pointe du week-end', en: 'weekend peak' },
    peak: { fr: 'pointe', en: 'peak' },
    busyMorning: { fr: 'matinée chargée', en: 'busy morning' },
    busyEvening: { fr: 'fin de journée chargée', en: 'busy end of day' },
    weekendAverage: { fr: 'week-end, rythme moyen', en: 'weekend, average pace' },
    average: { fr: 'rythme moyen', en: 'average pace' },
    emptying: { fr: 'la ville se vide', en: 'the city is emptying' },
    quiet: { fr: 'réseau calme', en: 'quiet network' },
    night: { fr: 'la nuit — presque personne ne roule', en: 'night — almost nobody riding' },
  },

  /** The number a card prints, with its unit attached. */
  reading: {
    unsampled: { fr: 'non échantillonné à cette heure', en: 'not sampled at this hour' },
    percentFull: {
      fr: (percent) => `${percent} % pleine`,
      en: (percent) => `${percent}% full`,
      sample: [42],
    },
    percentFullWithBikes: {
      fr: (percent, bikes, capacity) => `${percent} % pleine — environ ${bikes} vélo${bikes > 1 ? 's' : ''} sur ${capacity}`,
      en: (percent, bikes, capacity) => `${percent}% full — about ${bikes} ${plural(bikes, 'bike', 'bikes', { locale: 'en' })} of ${capacity}`,
      note: 'A 19-stand dock at 7% holds ONE bike; "1 bikes" would read as a bug in the number.',
      sample: [42, 8, 19],
    },
    cyclistsPerHour: {
      fr: (count) => `${count} cyclistes par heure`,
      en: (count) => `${count} cyclists an hour`,
      sample: [340],
    },
  },

  /** The site card, line by line. */
  details: {
    reading: {
      fr: (slot, reading) => `${slot} — ${reading}`,
      en: (slot, reading) => `${slot} — ${reading}`,
      sample: ['Tuesday 08:00', '340 cyclists an hour'],
    },
    measuresStock: {
      fr: 'Mesure un STOCK : combien de vélos sont garés là',
      en: 'Measures a STOCK: how many bikes are parked there',
    },
    measuresFlow: {
      fr: 'Mesure un FLUX : combien de cyclistes passent là',
      en: 'Measures a FLOW: how many cyclists ride past',
    },
    weeklyMaximum: {
      fr: (slot, reading) => `Maximum de la semaine ${slot} — ${reading}`,
      en: (slot, reading) => `Weekly maximum ${slot} — ${reading}`,
      note: 'MAXIMUM, not "peak": a dock is at its maximum when it is fullest, in the middle of the night.',
      sample: ['Sunday 04:00', '96% full'],
    },
    stockMeaning: {
      fr: 'Une station pleine = des vélos garés ; une station vide = des vélos sur la route',
      en: 'A full dock = bikes parked; an empty dock = bikes out on the road',
    },
    flowMeaning: {
      fr: 'Un compteur élevé = des cyclistes qui passent en ce moment',
      en: 'A high counter = cyclists riding past right now',
    },
    averageOf: {
      fr: (weeks) => `Moyenne de ${weeks} semaine${weeks > 1 ? 's' : ''} sur les 4 relevées`,
      en: (weeks) => `Average of ${weeks} ${plural(weeks, 'week', 'weeks', { locale: 'en' })} out of the 4 sampled`,
      sample: [3],
    },
    noSample: {
      fr: 'Aucun relevé à cette heure de la semaine',
      en: 'No reading at this hour of the week',
    },
    direction: {
      fr: (direction) => `Sens ${direction}`,
      en: (direction) => `Direction ${direction}`,
      note: 'The direction of travel the counter watches, as the city publishes it.',
      sample: ['NE-SO'],
    },
    installedOn: {
      fr: (date) => `Compteur installé le ${date}`,
      en: (date) => `Counter installed on ${date}`,
      note: '`date` is published by the city as a plain string.',
      sample: ['2019-06-14'],
    },
    stands: {
      fr: (count) => `${count} bornettes`,
      en: (count) => `${count} stands`,
      sample: [19],
    },
    window: {
      fr: (start, end) => `Semaine type ${start} → ${end}`,
      en: (start, end) => `Typical week ${start} → ${end}`,
      note: 'The four weeks the average was taken over, as published dates.',
      sample: ['2026-06-01', '2026-06-28'],
    },
  },
});
