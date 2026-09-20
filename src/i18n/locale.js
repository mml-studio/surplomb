/**
 * Which language the page speaks, and the one place that decides it.
 *
 * ── ONE AUTHORITY: `<html lang>` ─────────────────────────────────────────────
 *
 * The inline `/* locale-gate *\/` script in `index.html` resolves the locale
 * before any stylesheet or module runs and writes it on `<html lang>`. Every
 * module then asks {@link getLocale}, which reads that attribute and nothing
 * else — never `navigator`, never storage. Two reasons:
 *
 *   - the locale is fixed for the life of a page. Changing it is "store the
 *     choice, reload" (src/i18n/switch.js), so no module ever has to repaint
 *     itself in another language, and a module that read the locale at a
 *     different moment could not disagree with one that read it earlier;
 *   - Node 24 has a global `navigator` whose `language` is the machine's. A
 *     module that consulted it would switch `npm test` to English on any CI
 *     runner set to en-US, and ~1,400 French assertions would fail for a reason
 *     that has nothing to do with the code under test. Under Node there is no
 *     `<html>`, so {@link getLocale} answers {@link DEFAULT_LOCALE} unless a test
 *     asks otherwise through src/i18n/testing.js.
 *
 * ── THE ORDER THE GATE FOLLOWS ───────────────────────────────────────────────
 *
 *   1. `window.__GEV_LOCALE__` — set by the QA fleet before any page script
 *      (scripts/lib/qa-first-run.mjs). Headless Chrome announces en-US, so
 *      without it every harness would silently switch to English.
 *   2. `?lang=fr|en` — an explicit request. It is remembered: the gate writes
 *      it to `localStorage` under {@link LOCALE_STORAGE_KEY}.
 *   3. `localStorage['gev:locale:v1']` — the reader's earlier choice.
 *   4. `navigator.languages` — French if the first French-or-English entry is
 *      French, English otherwise. ON since the FR/EN switch shipped
 *      ({@link LOCALE_AUTO_DETECT}): a reader who is guessed wrong has a
 *      control to say so, and their choice outranks the guess for good.
 *   5. {@link DEFAULT_LOCALE}.
 *
 * {@link resolveLocale} is that order as a pure function. The inline copy in
 * `index.html` exists so the first paint already has the right `lang`; it is
 * RUN against this module over a matrix of inputs by `locale.test.mjs`, the
 * arrangement `src/vitrine/gate.js` uses for the showcase gate.
 *
 * @module i18n/locale
 */

/** The language the product is written in, and the one tests run in. */
export const DEFAULT_LOCALE = 'fr';

/** Every locale a catalog must cover, default first. */
export const SUPPORTED_LOCALES = /* @__PURE__ */ Object.freeze(['fr', 'en']);

/**
 * The BCP 47 tag each locale formats with. US English, per docs/GLOSSARY.md.
 * @type {Readonly<Record<string, string>>}
 */
export const LOCALE_TAGS = /* @__PURE__ */ Object.freeze({ fr: 'fr-FR', en: 'en-US' });

/** Where a reader's choice is remembered. */
export const LOCALE_STORAGE_KEY = 'gev:locale:v1';

/** The query parameter that requests a locale (and is remembered). */
export const LOCALE_QUERY_PARAM = 'lang';

/** Set on `window` by the QA fleet before any page script runs. */
export const LOCALE_QA_GLOBAL = '__GEV_LOCALE__';

/**
 * Whether the gate may guess from `navigator.languages`. True since the FR/EN
 * switch reached the corner of the globe: the guess is now undoable in one
 * click, and the reader's answer is remembered and outranks it. The inline
 * copy in `index.html` carries the same value and `locale.test.mjs` fails if
 * the two differ.
 */
export const LOCALE_AUTO_DETECT = true;

/**
 * Put on `<html>` once the static markup has been translated. Until then an
 * English page hides the loading line rather than flash its French.
 */
export const I18N_READY_ATTRIBUTE = 'data-i18n-ready';

let override = null;

/**
 * A supported locale from any language tag, or null.
 *
 * `en-GB`, `EN`, `fr_CA` all map to their primary subtag. Anything that is
 * not a string, or not French or English, is null — never a guess.
 *
 * @param {unknown} value
 * @returns {'fr'|'en'|null}
 */
export function normalizeLocale(value) {
  const tag = typeof value === 'string' ? value.toLowerCase().split(/[-_]/)[0] : '';
  return tag === 'fr' || tag === 'en' ? tag : null;
}

/**
 * The locale a browser's language list asks for: the first French or English
 * entry decides, and a list with neither gets English — a reader who does not
 * read French is better served by the second language than by the first.
 * @param {ReadonlyArray<string>|undefined} languages
 * @returns {'fr'|'en'}
 */
export function localeFromLanguages(languages) {
  for (const language of languages || []) {
    const locale = normalizeLocale(language);
    if (locale) return locale;
  }
  return 'en';
}

/**
 * The gate's decision, as a pure function of its signals.
 *
 * @param {{qa?: unknown, query?: unknown, stored?: unknown,
 *   languages?: ReadonlyArray<string>, autoDetect?: boolean}} [signals]
 * @returns {{locale: 'fr'|'en', source: 'qa'|'query'|'stored'|'navigator'|'default',
 *   persist: boolean}} `persist` says the gate writes the locale to storage.
 */
export function resolveLocale({
  qa, query, stored, languages, autoDetect = LOCALE_AUTO_DETECT,
} = {}) {
  const fromQa = normalizeLocale(qa);
  if (fromQa) return { locale: fromQa, source: 'qa', persist: false };
  const fromQuery = normalizeLocale(query);
  if (fromQuery) return { locale: fromQuery, source: 'query', persist: true };
  const fromStorage = normalizeLocale(stored);
  if (fromStorage) return { locale: fromStorage, source: 'stored', persist: false };
  if (autoDetect) return { locale: localeFromLanguages(languages), source: 'navigator', persist: false };
  return { locale: DEFAULT_LOCALE, source: 'default', persist: false };
}

/**
 * Read the gate's signals from injectable globals.
 *
 * Called by tests and diagnostics, never at import: it touches `navigator`,
 * which is exactly what no module may read on load (see the module header).
 *
 * @param {object} [options]
 * @returns {{qa: unknown, query: string|null, stored: string|null, languages: string[]}}
 */
export function readLocaleSignals({
  windowRef = globalThis,
  location = globalThis.location,
  navigatorRef = globalThis.navigator,
} = {}) {
  let stored = null;
  try {
    stored = windowRef?.localStorage?.getItem?.(LOCALE_STORAGE_KEY) ?? null;
  } catch {
    stored = null;
  }
  const listed = navigatorRef?.languages;
  return {
    qa: windowRef?.[LOCALE_QA_GLOBAL],
    query: new URLSearchParams(String(location?.search || '')).get(LOCALE_QUERY_PARAM),
    stored,
    languages: listed?.length ? [...listed] : [navigatorRef?.language],
  };
}

/**
 * The page's locale: what the gate wrote on `<html lang>`.
 *
 * Read at CALL time by every catalog and formatter; cheap enough for a hot
 * loop (one attribute read). Under Node, with no document, it is
 * {@link DEFAULT_LOCALE} unless a test set an override.
 *
 * @param {{getAttribute?: Function, lang?: string}|null} [root] `<html>`.
 * @returns {'fr'|'en'}
 */
export function getLocale(root = globalThis.document?.documentElement) {
  if (override) return override;
  const attribute = root?.getAttribute?.('lang') ?? root?.lang;
  return normalizeLocale(attribute) || DEFAULT_LOCALE;
}

/**
 * The BCP 47 tag to hand `Intl` for a locale.
 * @param {string} [locale] Defaults to {@link getLocale}.
 * @returns {string}
 */
export function localeTag(locale = getLocale()) {
  return LOCALE_TAGS[normalizeLocale(locale) || DEFAULT_LOCALE];
}

/**
 * Force the locale {@link getLocale} answers, or clear the force with null.
 * For src/i18n/testing.js; the page never calls it.
 * @param {string|null} locale
 */
export function setLocaleOverride(locale) {
  override = locale == null ? null : (normalizeLocale(locale) || DEFAULT_LOCALE);
}

/** @returns {'fr'|'en'|null} the current test override. */
export function getLocaleOverride() {
  return override;
}
