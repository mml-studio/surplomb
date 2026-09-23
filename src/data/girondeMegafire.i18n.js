/**
 * Strings of src/data/girondeMegafire.js — see docs/i18n/CONVENTIONS.md.
 *
 * Every number arrives already formatted (`formatNumber`), every month already
 * named (`monthName`): a message only places words around them.
 *
 * The key is written for any reader (see the power grid's `plainLegend`): a
 * line is a date or a thing in everyday words, one short sentence at most, and
 * the fine print — pixel size, sensors, who measured what — belongs to the
 * source line and to DATA_SOURCES.md, not to the classes.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  // The three rings, by band id (`MEGAFIRE_BANDS`). Local days, Europe/Paris.
  bands: {
    'jul-22-23': {
      long: { fr: '22-23 juillet', en: 'July 22-23' },
      short: { fr: '22-23 juil.', en: 'Jul 22-23', note: 'Label pinned on the map beside the ring, and under its stop on the replay bar.' },
    },
    'jul-24-25': {
      long: { fr: '24-25 juillet', en: 'July 24-25' },
      short: { fr: '24-25 juil.', en: 'Jul 24-25' },
    },
    'jul-26-aug-01': {
      long: { fr: '26 juillet → 1ᵉʳ août', en: 'July 26 → August 1' },
      short: { fr: '26 juil. → 1ᵉʳ août', en: 'Jul 26 → Aug 1' },
    },
  },
  legend: {
    heading: {
      fr: 'Le feu, jour après jour',
      en: 'The fire, day by day',
      note: 'Caption over the three ring lines of the key.',
    },
    detections: { fr: 'Chaleur vue par satellite', en: 'Heat seen by satellite' },
    detectionsBlurb: {
      fr: 'Un point par détection, de la couleur de ses jours.',
      en: 'One dot per detection, in the colour of its days.',
    },
    effis: { fr: 'Surface finale estimée (EFFIS)', en: 'Estimated final area (EFFIS)' },
    effisBlurb: {
      fr: (hectares) => `${hectares} ha, mesurés après le dernier relevé.`,
      en: (hectares) => `${hectares} ha, measured after the last survey.`,
      sample: ['37,191'],
    },
    source: {
      fr: 'NASA FIRMS · Copernicus EMS · EFFIS',
      en: 'NASA FIRMS · Copernicus EMS · EFFIS',
      note: 'Publisher names, identical in both languages.',
    },
    note: {
      fr: 'Un anneau montre où les satellites ont vu la chaleur arriver, pas le front des flammes.',
      en: 'A ring shows where satellites saw the heat arrive, not the flame front.',
      note: 'The one caveat the key must carry: the rings are derived from thermal detections.',
    },
  },
  // The replay bar under the map (`megafireTimeline.js`).
  replay: {
    day: {
      fr: (day, month, year) => `${day === 1 ? '1ᵉʳ' : day} ${month} ${year}`,
      en: (day, month, year) => `${month} ${day}, ${year}`,
      note: 'A local calendar day (Europe/Paris). `month` is the long month name.',
      sample: [24, 'July', 2026],
    },
    start: {
      fr: 'Première détection satellite',
      en: 'First satellite detection',
      note: 'Not “start of the fire”: the fire was reported six hours later.',
    },
    running: {
      fr: (count) => `${count} détections satellite`,
      en: (count) => `${count} satellite detections`,
      note: '`count` is already formatted.',
      sample: ['3,812'],
    },
    end: {
      fr: (count) => `${count} détections · fin des relevés`,
      en: (count) => `${count} detections · end of the record`,
      note: 'Not “end of the fire”, which no dataset records.',
      sample: ['9,524'],
    },
  },
});
