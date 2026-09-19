/**
 * Change the page's language: remember the choice, reload.
 *
 * WHY A RELOAD AND NOT A REPAINT. About 170 modules draw visible text, most of
 * it into Cesium primitives, canvases and cached DOM that no module could be
 * asked to redraw in another language without a second rendering path each.
 * A reload redraws all of it through the one path that already exists, and the
 * share hash brings the reader back where they were: camera, layers, panels.
 * That is also why every catalog is read at call time — a module only ever
 * speaks the language the page was loaded in.
 *
 * THE ORDER MATTERS, AND IT IS THE ONE `src/staleBuildRecovery.js` FOLLOWS:
 *
 *   1. write the choice to `localStorage`;
 *   2. `shareLink.flushHash()` — the address trails the screen by up to the
 *      share debounce, and it is the only thing a reload restores from;
 *   3. drop `?lang=` from the address, because it OUTRANKS storage in the
 *      gate: a page opened as `?lang=en` would otherwise come back English
 *      after the reader chose French. When storage refused the write (private
 *      mode), `?lang=` carries the choice instead, so the switch still works
 *      for this tab;
 *   4. `location.reload()`.
 *
 * @module i18n/switch
 */

import { LOCALE_QUERY_PARAM, LOCALE_STORAGE_KEY, getLocale, normalizeLocale } from './locale.js';

/**
 * Remember a locale. Storage failures are reported, never thrown.
 * @param {string} locale
 * @param {{setItem: Function, getItem?: Function}|null} [storage]
 * @returns {boolean} whether the choice is now stored.
 */
export function rememberLocale(locale, storage = globalThis.localStorage) {
  const next = normalizeLocale(locale);
  if (!next) return false;
  try {
    storage?.setItem?.(LOCALE_STORAGE_KEY, next);
    return typeof storage?.getItem === 'function' ? storage.getItem(LOCALE_STORAGE_KEY) === next : Boolean(storage);
  } catch {
    return false;
  }
}

/**
 * The address to reload: `?lang=` removed when storage holds the choice, set
 * to it when storage could not.
 * @param {string} href
 * @param {string} locale
 * @param {boolean} stored
 * @returns {string}
 */
export function localeReloadHref(href, locale, stored) {
  const url = new URL(href);
  if (stored) url.searchParams.delete(LOCALE_QUERY_PARAM);
  else url.searchParams.set(LOCALE_QUERY_PARAM, locale);
  return url.href;
}

/**
 * Switch the page to `locale`.
 *
 * @param {string} locale 'fr' | 'en'.
 * @param {object} [options] Everything injectable, for tests and for callers
 *   that hold their own share-link manager.
 * @param {{flushHash?: Function}|null} [options.shareLink] `ui.shareLinkManager`.
 * @param {Storage|null} [options.storage]
 * @param {Location} [options.location]
 * @param {History} [options.history]
 * @param {Element} [options.root] `<html>`, to read the current locale.
 * @returns {boolean} false when there was nothing to do (unknown locale, or
 *   already the page's); true when a reload was asked for.
 */
export function switchLocale(locale, {
  shareLink = null,
  storage = globalThis.localStorage,
  location = globalThis.location,
  history = globalThis.history,
  root = globalThis.document?.documentElement,
} = {}) {
  const next = normalizeLocale(locale);
  if (!next || next === getLocale(root)) return false;
  const stored = rememberLocale(next, storage);
  shareLink?.flushHash?.();
  const href = localeReloadHref(location.href, next, stored);
  if (href !== location.href) history?.replaceState?.(history.state ?? null, '', href);
  location.reload();
  return true;
}
