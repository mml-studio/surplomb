/**
 * What a reader is told the visual presets are called — see
 * docs/i18n/CONVENTIONS.md.
 *
 * Only TWO presets have a name that changes with the language, the night atlas
 * and its lighter half, dusk. The others are
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
  dusk: {
    fr: 'CRÉPUSCULE',
    en: 'DUSK',
    note: 'The night atlas half-way: the basemap dimmed less than at night, data in full colour. Brought by the digital infrastructure row. Shown in capitals, like NIGHT.',
  },
  duskSpelled: {
    fr: 'Crépuscule',
    en: 'Dusk',
    note: 'The same preset, spelled out for a screen reader.',
  },
});
