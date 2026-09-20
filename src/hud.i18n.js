/**
 * Strings of src/hud.js — the tactical overlay's readouts.
 *
 * INHERITED ENGLISH, AND STILL ENGLISH IN FRENCH. This overlay came from
 * upstream and has always printed `ALT`, `SUN`, `COLL`, `ONA`, `MGRS` on the
 * French page too: they are instrument abbreviations, the same three or four
 * letters an aviation or imagery readout uses in either language, and nobody
 * asked for `ALT : 320 m  SOLEIL : 12° EL`. So every leaf below says the same
 * thing in both languages ON PURPOSE, and the French page prints exactly the
 * bytes it printed before.
 *
 * What this file buys is that the decision is now one file rather than
 * scattered through a template: the day the product wants a French HUD, it is
 * a column to fill, not a hunt.
 *
 * `Awaiting telemetry...` is the one that is prose rather than an
 * abbreviation, and it is the one to translate first.
 *
 * The observation bands (`STREET`, `CITY`, `METRO`…) and the coarse regions
 * (`EUROPE`, `NORTH AMERICA`…) are NOT here: they are classification values
 * the summary line is built from and the voice layer reads back, and their
 * language is a separate decision from their meaning.
 *
 * See docs/i18n/CONVENTIONS.md.
 */
import { defineMessages } from './i18n/messages.js';

export default defineMessages({
  /** The corner mode chip, before a style names itself. */
  mode: { fr: 'NORMAL', en: 'NORMAL' },
  /** The label over the one-line semantic summary. */
  summaryLabel: { fr: 'SUMMARY', en: 'SUMMARY' },
  /** What the summary says before the first camera reading arrives. */
  awaitingTelemetry: {
    fr: 'Awaiting telemetry...',
    en: 'Awaiting telemetry...',
    note: 'The one sentence of the HUD. Still English in French — see the file header.',
  },
  /** The readouts, empty, as the overlay is built. */
  placeholders: {
    altSun: { fr: 'ALT: --m   SUN: --° EL', en: 'ALT: --m   SUN: --° EL' },
    ais: { fr: 'AIS: --', en: 'AIS: --' },
    coll: { fr: 'COLL: --:--:--Z', en: 'COLL: --:--:--Z' },
    ona: { fr: 'ONA: --°', en: 'ONA: --°' },
    position: { fr: 'LAT: --  LON: --  MGRS: ---', en: 'LAT: --  LON: --  MGRS: ---' },
  },
  /** The same readouts, filled. Every value arrives already formatted. */
  readouts: {
    altSun: {
      fr: (altitudeM, sunElevationDeg) => `ALT: ${altitudeM}m   SUN: ${sunElevationDeg}° EL`,
      en: (altitudeM, sunElevationDeg) => `ALT: ${altitudeM}m   SUN: ${sunElevationDeg}° EL`,
      note: 'Altitude above mean sea level, and the sun’s elevation angle.',
      sample: ['320', '12.4'],
    },
    coll: {
      fr: (utcTime) => `COLL: ${utcTime}Z`,
      en: (utcTime) => `COLL: ${utcTime}Z`,
      note: 'Collection timestamp, UTC, as an imagery readout writes it.',
      sample: ['14:05:09'],
    },
    ona: {
      fr: (degrees) => `ONA: ${degrees}°`,
      en: (degrees) => `ONA: ${degrees}°`,
      note: 'Off-nadir angle: 0° looking straight down.',
      sample: ['60.0'],
    },
    position: {
      fr: (mgrs, lat, lon) => `MGRS: ${mgrs}  LAT: ${lat}  LON: ${lon}`,
      en: (mgrs, lat, lon) => `MGRS: ${mgrs}  LAT: ${lat}  LON: ${lon}`,
      sample: ['31U DQ 5075 1173', '48°51\'29.00"N', '002°17\'40.00"E'],
    },
  },
});
