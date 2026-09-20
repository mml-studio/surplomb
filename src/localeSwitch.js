/**
 * The FR/EN button in the corner of the globe.
 *
 * ONE BUTTON, NOT TWO. The page has a language; the button names the other
 * one, in that other language — « English » on a French page, « Français » on
 * an English one — because that is the word a reader who cannot read this page
 * will recognize. Its label and its accessible name live in `index.html` and
 * `src/i18n/markup.i18n.js` (`localeSwitch.*`), whose two languages are
 * deliberately swapped: the applicator that translates the markup is what
 * flips the button, so no JavaScript here has to decide what it says.
 *
 * WHAT THE CLICK DOES is entirely `switchLocale()` (src/i18n/switch.js): store
 * the choice, flush the share hash, drop `?lang=`, reload. A reload is what
 * makes one language possible at all — about 170 modules draw text into Cesium
 * primitives and cached DOM, and none of them has a second rendering path.
 *
 * WHY IT LIVES IN `#top-center-actions`. That column is the only chrome both
 * shells show: on a phone, `src/phoneSheet.js` already pushes the basemap
 * button into it, so the language lands beside it without the bottom sheet
 * having to know this control exists.
 *
 * @module localeSwitch
 */

import { DEFAULT_LOCALE, getLocale } from './i18n/locale.js';
import { switchLocale } from './i18n/switch.js';

/** The element id the markup uses. */
export const LOCALE_SWITCH_ID = 'locale-switch';

/**
 * The language a press of the button asks for: the one the page is not in.
 * @param {string} [locale] The page's locale.
 * @returns {'fr'|'en'}
 */
export function otherLocale(locale = getLocale()) {
  return locale === DEFAULT_LOCALE ? 'en' : DEFAULT_LOCALE;
}

/**
 * Wire the button. Safe to call twice and safe to call without the markup
 * (the showcase never has it).
 *
 * @param {object} [options]
 * @param {Document} [options.documentRef]
 * @param {{flushHash?: Function}|null} [options.shareLink] `ui.shareLinkManager`,
 *   so the address is up to date before the reload restores from it.
 * @param {(locale: string, options?: object) => boolean} [options.switchImpl]
 *   Injected in tests; the page never passes it.
 * @returns {{button: HTMLElement, destroy: () => void}|null}
 */
export function initLocaleSwitch({
  documentRef = globalThis.document,
  shareLink = null,
  switchImpl = switchLocale,
} = {}) {
  const button = documentRef?.getElementById?.(LOCALE_SWITCH_ID);
  if (!button || button.dataset.localeSwitchReady === 'true') return null;
  button.dataset.localeSwitchReady = 'true';
  const target = otherLocale(getLocale(documentRef?.documentElement));
  // The label is a word of the OTHER language, so it must be announced in it:
  // « Français » read by an English screen reader, or the reverse, is noise.
  button.setAttribute('lang', target);
  const onClick = () => { switchImpl(target, { shareLink }); };
  button.addEventListener('click', onClick);
  return {
    button,
    destroy: () => {
      button.removeEventListener('click', onClick);
      delete button.dataset.localeSwitchReady;
    },
  };
}
