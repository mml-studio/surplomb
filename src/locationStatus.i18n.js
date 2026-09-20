/**
 * The two lines of the collapsed LOCATION tray — see src/locationStatus.js.
 *
 * `index.html` ships the same two strings (`location.miniCity`,
 * `location.miniPoi` in src/i18n/markup.i18n.js): they are what the tray reads
 * before any flight, and these are what it falls back to afterwards.
 */
import { defineMessages } from './i18n/messages.js';

export default defineMessages({
  city: { fr: '📍 Lieu : --', en: '📍 Location: --', note: 'No city resolved: the camera is over open ground or the sea.' },
  poi: { fr: 'Point de repère : --', en: 'Landmark: --' },
  searched: {
    fr: 'Lieu recherché',
    en: 'Searched location',
    note: 'Line two when the geocoder answered with one segment only (“Japan”), so there is no context to show.',
  },
});
