/**
 * @module styles/styleNames
 *
 * The name a reader sees for each visual preset, in one place.
 *
 * Five surfaces print it — the ACTIVE STYLE corner, the collapsed presets
 * tray, the HUD's mode line, the cockpit's vision control and the key's
 * "this pass recolours the map" note — and each used to carry its own table
 * or fall back to `styleName.toUpperCase()`. That fallback is how the night
 * atlas read NOIR on an English page: the preset's id was printed as its name.
 *
 * The id stays `noir`. It is what the post-process stages, the cockpit's vision
 * cycle, the voice tool's enum and the share link's parameter registry call the
 * preset, and a reader never sees it. What the reader sees is « Nuit » /
 * "Night", and the share link writes `style=night` (`sharelink.js`).
 */

import { DUSK_STYLE } from './dusk.js';
import { NIGHT_ATLAS_STYLE } from './nightAtlas.js';
import messages from './styleNames.i18n.js';

/** Presets whose name is the same word in both languages. */
const SAME_IN_BOTH_LANGUAGES = Object.freeze({
  normal: 'NORMAL',
  retro: 'CRT',
  surveillance: 'NVG',
  thermal: 'FLIR',
  anime: 'ANIME',
});

/**
 * @param {?string} styleName A preset id.
 * @returns {string} The preset's name in capitals, as the corner prints it.
 */
export function styleDisplayName(styleName) {
  if (styleName === NIGHT_ATLAS_STYLE) return messages().night;
  if (styleName === DUSK_STYLE) return messages().dusk;
  return SAME_IN_BOTH_LANGUAGES[styleName] || String(styleName || 'normal').toUpperCase();
}

/**
 * The name spelled out, for a sentence or a screen reader. Only the night
 * atlas and dusk differ from {@link styleDisplayName}; an acronym has no spelled form
 * this module could honestly invent.
 * @param {?string} styleName A preset id.
 * @returns {string}
 */
export function styleSpelledName(styleName) {
  if (styleName === NIGHT_ATLAS_STYLE) return messages().nightSpelled;
  if (styleName === DUSK_STYLE) return messages().duskSpelled;
  return styleDisplayName(styleName);
}
