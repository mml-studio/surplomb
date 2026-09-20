/**
 * Strings of src/data/hubeauHydrometry.js — the Hub'Eau stations layer: the
 * card of one gauging station, the seasonal block that puts today's flow
 * against the month's own average, and the line that says why a view is
 * empty.
 *
 * TWO UNITS THAT ARE NOT THE SAME THING, and the English keeps them apart as
 * the French does: a DISCHARGE (m³/s) means the same at every station, and a
 * STAGE is a staff-gauge reading against that station's own local zero — not
 * a depth, not an altitude. The stage keeps its prefix for exactly that
 * reason.
 *
 * Station names, river names, communes and departments are data.
 */
import { defineMessages } from '../i18n/messages.js';
import { monthName } from '../i18n/format.js';

export default defineMessages({
  /** The reading itself. */
  reading: {
    stage: {
      fr: (metres) => `échelle ${metres} m`,
      en: (metres) => `gauge height ${metres} m`,
      note: 'A staff-gauge reading against the station’s own zero — never a depth.',
      sample: ['1.42'],
    },
    kindStage: { fr: 'hauteur', en: 'stage' },
    kindDischarge: { fr: 'débit', en: 'discharge' },
    stale: { fr: ' · relevé ancien', en: ' · old reading' },
  },

  /** How long ago the kept map was read. Coarse on purpose. */
  age: {
    minutes: { fr: (n) => `il y a ${n} min`, en: (n) => `${n} min ago`, sample: ['25'] },
    hours: { fr: (n) => `il y a ${n} h`, en: (n) => `${n} h ago`, sample: ['4'] },
    days: { fr: (n) => `il y a ${n} j`, en: (n) => `${n} d ago`, sample: ['2'] },
  },

  /** The card of one station. */
  card: {
    fallbackTitle: { fr: 'Station', en: 'Station' },
    reading: {
      fr: (value, measured, stale) => `◈ ${value} · ${measured}${stale}`,
      en: (value, measured, stale) => `◈ ${value} · ${measured}${stale}`,
      sample: ['12.4 m³/s', 'discharge', ''],
    },
    history: {
      fr: (spark) => `↻ 24 h ${spark}`,
      en: (spark) => `↻ 24 h ${spark}`,
      sample: ['▁▂▄▆█'],
    },
    historyPending: { fr: '↻ 24 h …', en: '↻ 24 h …' },
    historyFailed: {
      fr: '↻ historique 24 h indisponible',
      en: '↻ 24 h history unavailable',
    },
    flat: {
      fr: (mark, value) => `${mark}${value} sur 24 h`,
      en: (mark, value) => `${mark}${value} over 24 h`,
      sample: ['   ', '12.4 m³/s'],
    },
    range: {
      fr: (mark, min, max) => `${mark}de ${min} à ${max} sur 24 h`,
      en: (mark, min, max) => `${mark}from ${min} to ${max} over 24 h`,
      sample: ['   ', '11.8 m³/s', '13.1 m³/s'],
    },
    opened: {
      fr: (year) => `🕐 station ouverte en ${year}`,
      en: (year) => `🕐 station opened in ${year}`,
      sample: ['1967'],
    },
    gaugeZero: {
      fr: (metres) => `↧ zéro de l'échelle à ${metres} m`,
      en: (metres) => `↧ gauge zero at ${metres} m`,
      note: 'NOT added to the stage: the two are counted from different places.',
      sample: ['148.2'],
    },
    doubtful: {
      fr: '⚠ relevé signalé douteux par le producteur',
      en: '⚠ reading flagged as doubtful by the producer',
    },
  },

  /** Today's flow against this month's own average, over N years of record. */
  seasonal: {
    pending: { fr: '◑ moyenne du mois …', en: '◑ monthly average …' },
    mean: {
      fr: (month, flow, period) => `◑ ${month} : ${flow} en moyenne ${period}`,
      en: (month, flow, period) => `◑ ${month}: ${flow} on average ${period}`,
      sample: ['September', '12.4 m³/s', 'over the last 30 years'],
    },
    spread: {
      fr: (min, max) => `   entre ${min} et ${max}`,
      en: (min, max) => `   between ${min} and ${max}`,
      sample: ['4.1 m³/s', '38.0 m³/s'],
    },
    today: {
      fr: (percent, gauge) => `   aujourd'hui ${percent} % ${gauge}`,
      en: (percent, gauge) => `   today ${percent}% ${gauge}`,
      sample: ['86', '▌▌▌▌░░░'],
    },
    lastYears: {
      fr: (span) => `sur les ${span} dernières années`,
      en: (span) => `over the last ${span} years`,
      sample: ['30'],
    },
    between: {
      fr: (from, to) => `entre ${from} et ${to}`,
      en: (from, to) => `between ${from} and ${to}`,
      sample: ['1967', '1998'],
    },
  },

  /** A month's name, for the seasonal block. */
  month: {
    fr: (index) => monthName(index, { locale: 'fr' }),
    en: (index) => monthName(index, { locale: 'en' }),
    note: 'Index is 0-based, as `Date#getMonth()` counts.',
    sample: [8],
  },

  /** The line that says why the view holds what it holds. */
  guidance: {
    tooWide: {
      fr: (kept) => `vue trop large pour mesurer — ${kept} stations conservées`,
      en: (kept) => `view too wide to measure — ${kept} stations kept`,
      sample: ['1,204'],
    },
    zoomIn: {
      fr: (degrees) => `Zoome sous ${degrees}° pour charger les stations`,
      en: (degrees) => `Zoom below ${degrees}° to load the stations`,
      sample: ['3'],
    },
    noneHere: {
      fr: (kept) => `aucune station dans cette vue — ${kept} stations conservées`,
      en: (kept) => `no station in this view — ${kept} stations kept`,
      sample: ['1,204'],
    },
    noneAtAll: { fr: 'aucune station dans cette vue', en: 'no station in this view' },
    noNewReading: {
      fr: (hours, kept, age) => `aucun nouveau relevé depuis ${hours} h — ${kept} stations conservées${age}`,
      en: (hours, kept, age) => `no new reading for ${hours} h — ${kept} stations kept${age}`,
      sample: ['24', '1,204', ' (last reading 4 h ago)'],
    },
    lastReading: {
      fr: (age) => ` (dernier relevé ${age})`,
      en: (age) => ` (last reading ${age})`,
      sample: ['4 h ago'],
    },
    silentHere: {
      fr: (count, hours) => `${count} stations ici, aucun relevé publié depuis ${hours} h`,
      en: (count, hours) => `${count} stations here, no reading published for ${hours} h`,
      sample: ['18', '24'],
    },
  },
});
