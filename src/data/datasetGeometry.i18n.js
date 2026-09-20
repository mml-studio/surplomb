/**
 * Strings of src/data/datasetGeometry.js — why the box thinks it knows where a
 * row is.
 *
 * Each of these is the `reason` of a GUESS, printed in the draft next to the
 * columns it would use, before anything is drawn (doctrine A1: a guessed
 * position never gets the sign of a published one). So the reason must say
 * what was read — the column names — and how much of a leap it was.
 *
 * The column names inside are the file's own and are never translated.
 *
 * See docs/i18n/CONVENTIONS.md.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  lonLat: {
    fr: (lon, lat) => `colonnes ${lon} / ${lat}`,
    en: (lon, lat) => `columns ${lon} / ${lat}`,
    note: 'A named longitude and latitude pair — the strongest guess there is.',
    sample: ['Longitude', 'Latitude'],
  },
  point: {
    fr: (column) => `colonne ${column} (un point par cellule)`,
    en: (column) => `column ${column} (one point per cell)`,
    sample: ['coordonneesXY'],
  },
  wkt: {
    fr: (column) => `colonne ${column} (WKT POINT)`,
    en: (column) => `column ${column} (WKT POINT)`,
    sample: ['geom'],
  },
  lambert: {
    fr: (x, y) => `colonnes ${x} / ${y} en mètres Lambert-93 (valeurs dans la boîte métropolitaine)`,
    en: (x, y) => `columns ${x} / ${y} in Lambert-93 meters (values inside the mainland box)`,
    note: 'Bare x/y accepted only because the SAMPLE VALUES fall in the metropolitan metre box.',
    sample: ['x', 'y'],
  },
  degrees: {
    fr: (x, y) => `colonnes ${x} / ${y} en degrés`,
    en: (x, y) => `columns ${x} / ${y} in degrees`,
    sample: ['x', 'y'],
  },
  resemblance: {
    fr: (lon, lat) => `colonnes ${lon} / ${lat} (par ressemblance de nom, valeurs en degrés)`,
    en: (lon, lat) => `columns ${lon} / ${lat} (by name resemblance, values in degrees)`,
    note: 'The weakest guess the module makes, and it says so.',
    sample: ['c_long_coor1', 'c_lat_coor1'],
  },
});
