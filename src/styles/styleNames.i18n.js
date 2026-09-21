/**
 * What a reader is told the visual presets are called — see
 * docs/i18n/CONVENTIONS.md.
 *
 * Only ONE preset has a name that changes with the language. The others are
 * the same word in French and English — sensor acronyms (CRT, NVG, FLIR) and
 * upstream's own names (NORMAL, ANIME, SNOW) — and live in `styleNames.js`
 * rather than here, where they would only echo themselves.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  night: {
    fr: 'NUIT',
    en: 'NIGHT',
    note: 'The night-atlas preset: a dark basemap under data in full colour. Shown in capitals, like CRT and NVG beside it.',
  },
  nightSpelled: {
    fr: 'Nuit',
    en: 'Night',
    note: 'The same preset, spelled out for a screen reader and for the cockpit’s vision control.',
  },
});
