/**
 * Numbers, amounts, dates and plurals in the page's locale.
 *
 * ── THE CONTRACT ─────────────────────────────────────────────────────────────
 *
 * In French every function here prints EXACTLY what the module it replaces
 * printed, byte for byte, so that migrating a module changes nothing a French
 * reader or a French test can see:
 *
 *   formatNumber(x, o)       ≡ x.toLocaleString('fr-FR', o)
 *   formatInteger(x)         ≡ Math.round(x).toLocaleString('fr-FR')
 *   formatDecimal(x, d)      ≡ x.toLocaleString('fr-FR', { maximumFractionDigits: d })
 *   formatPercent(x, o)      ≡ `${x.toLocaleString('fr-FR', o)} %`        (x in points: 91.3)
 *   formatEuros(x, o)        ≡ `${x.toLocaleString('fr-FR', o)} €`
 *   formatEurosPerM2(x, o)   ≡ `${x.toLocaleString('fr-FR', o)} €/m²`
 *   formatQuantity(x, u, o)  ≡ `${x.toLocaleString('fr-FR', o)} ${u}`
 *   formatDate(d, o)         ≡ new Date(d).toLocaleDateString('fr-FR', o)
 *   formatTime(d, o)         ≡ new Date(d).toLocaleTimeString('fr-FR', o)
 *   formatDateTime(d, o)     ≡ new Date(d).toLocaleString('fr-FR', o)
 *   formatList(items, o)     ≡ new Intl.ListFormat('fr-FR', o).format(items)
 *
 * The space between a number and its unit is a plain ASCII space, because that
 * is what the modules typed; the space INSIDE a French number (`12 400`) is
 * whatever ICU prints, a narrow no-break space (U+202F) today.
 *
 * In English the same calls print US English per docs/GLOSSARY.md: `12,400`,
 * `91.3%`, `€3,200`, `€3,200/m²`, `Sep 19, 2026`.
 *
 * ── OPTIONS EVERY FUNCTION TAKES ─────────────────────────────────────────────
 *
 *   locale        'fr' | 'en' — defaults to the page's (src/i18n/locale.js).
 *   plainSpaces   true → every U+00A0 and U+202F becomes an ASCII space. For
 *                 the dozen modules that already flatten them (canvas labels,
 *                 fixed-width fields, strings compared in tests), and the only
 *                 way to get the same bytes out of Node's ICU and a browser's.
 *
 * Everything else is handed to `Intl` untouched. `Intl` objects are built once
 * per (locale, options) and cached: a hot loop over 9,524 detections builds one.
 *
 * @module i18n/format
 */

import words from './format.i18n.js';
import { getLocale, localeTag, normalizeLocale, DEFAULT_LOCALE } from './locale.js';

const cache = new Map();

/** A cached `Intl` object. */
function intl(kind, tag, options) {
  const key = `${kind}|${tag}|${options ? JSON.stringify(options) : ''}`;
  let formatter = cache.get(key);
  if (!formatter) {
    formatter = new Intl[kind](tag, options);
    cache.set(key, formatter);
  }
  return formatter;
}

const NBSP = /[\u00a0\u202f]/g;

/** Split our two options off the `Intl` ones. */
function split(options = {}) {
  const { locale, plainSpaces, ...rest } = options;
  const resolved = normalizeLocale(locale) || getLocale();
  return {
    locale: resolved,
    tag: localeTag(resolved),
    plain: plainSpaces === true,
    intlOptions: Object.keys(rest).length ? rest : undefined,
  };
}

function finish(text, plain) {
  return plain ? text.replace(NBSP, ' ') : text;
}

/**
 * A number, as `toLocaleString` would print it.
 * @param {number} value
 * @param {Intl.NumberFormatOptions & {locale?: string, plainSpaces?: boolean}} [options]
 * @returns {string}
 */
export function formatNumber(value, options) {
  const { tag, plain, intlOptions } = split(options);
  return finish(intl('NumberFormat', tag, intlOptions).format(Number(value)), plain);
}

/**
 * A number rounded to a whole, the way the modules did it: `Math.round` first
 * (half up), then the locale's grouping.
 * @param {number} value
 * @param {object} [options] As {@link formatNumber}.
 * @returns {string}
 */
export function formatInteger(value, options) {
  return formatNumber(Math.round(Number(value)), options);
}

/**
 * A number with at most `digits` decimals (`5,6` / `5.6`).
 * @param {number} value
 * @param {number} [digits]
 * @param {object} [options] As {@link formatNumber}; `minimumFractionDigits`
 *   pads (`5,60`).
 * @returns {string}
 */
export function formatDecimal(value, digits = 1, options = {}) {
  return formatNumber(value, { maximumFractionDigits: digits, ...options });
}

/** Put the minus sign in front of a currency symbol that leads (`-€3`). */
function withLeadingSymbol(formatted, wrap) {
  const match = /^([-\u2212])(.*)$/.exec(formatted);
  return match ? `${match[1]}${wrap(match[2])}` : wrap(formatted);
}

/** Wrap a formatted amount in a unit message, sign first in English. */
function amount(value, options, messageKey) {
  const { locale, plain } = split(options);
  const number = formatNumber(value, options);
  const wrap = words(locale)[messageKey];
  const text = locale === DEFAULT_LOCALE ? wrap(number) : withLeadingSymbol(number, wrap);
  return finish(text, plain);
}

/**
 * A percentage, from POINTS (91.3), not from a ratio — the modules hold points.
 * `91,3 %` / `91.3%`.
 * @param {number} points
 * @param {object} [options] As {@link formatNumber}.
 * @returns {string}
 */
export function formatPercent(points, options) {
  const { locale, plain } = split(options);
  return finish(words(locale).percent(formatNumber(points, options)), plain);
}

/**
 * Euros. `245 000 €` / `€245,000`. Round first if the module rounded.
 * @param {number} value
 * @param {object} [options] As {@link formatNumber}.
 * @returns {string}
 */
export function formatEuros(value, options) {
  return amount(value, options, 'euros');
}

/**
 * Euros per square metre. `3 200 €/m²` / `€3,200/m²`.
 * @param {number} value
 * @param {object} [options] As {@link formatNumber}.
 * @returns {string}
 */
export function formatEurosPerM2(value, options) {
  return amount(value, options, 'eurosPerM2');
}

/**
 * A number and a unit SYMBOL (`km`, `ha`, `MW`, `m²`) — the same symbol in
 * both languages, separated by an ASCII space. A unit that is a word (`jours`,
 * `ventes`) is a message, or {@link countNoun}.
 * @param {number} value
 * @param {string} unit
 * @param {object} [options] As {@link formatNumber}.
 * @returns {string}
 */
export function formatQuantity(value, unit, options) {
  return `${formatNumber(value, options)} ${unit}`;
}

/**
 * `a, b et c` / `a, b, and c`.
 * @param {Iterable<unknown>} items
 * @param {Intl.ListFormatOptions & {locale?: string, plainSpaces?: boolean}} [options]
 * @returns {string}
 */
export function formatList(items, options) {
  const { tag, plain, intlOptions } = split(options);
  return finish(intl('ListFormat', tag, intlOptions).format([...items].map(String)), plain);
}

const DATE_FIELDS = ['weekday', 'year', 'month', 'day'];
const TIME_FIELDS = ['dayPeriod', 'hour', 'minute', 'second', 'fractionalSecondDigits'];

/**
 * The defaults `toLocaleDateString` / `toLocaleTimeString` / `toLocaleString`
 * add when the options name no component (ECMA-402 ToDateTimeOptions), so the
 * cached `Intl.DateTimeFormat` prints what those methods print.
 */
function withDateDefaults(options, required, defaults) {
  const given = options || {};
  if (given.dateStyle !== undefined || given.timeStyle !== undefined) return options;
  const needsDate = required !== 'time';
  const needsTime = required !== 'date';
  const has = (fields) => fields.some((field) => given[field] !== undefined);
  if ((needsDate && has(DATE_FIELDS)) || (needsTime && has(TIME_FIELDS))) return options;
  const out = { ...given };
  if (defaults !== 'time') Object.assign(out, { year: 'numeric', month: 'numeric', day: 'numeric' });
  if (defaults !== 'date') Object.assign(out, { hour: 'numeric', minute: 'numeric', second: 'numeric' });
  return out;
}

function formatDateWith(value, options, required, defaults) {
  const date = value instanceof Date ? value : new Date(value);
  // `toLocale*String` answer "Invalid Date"; `Intl` throws. Keep the former.
  if (Number.isNaN(date.getTime())) return 'Invalid Date';
  const { tag, plain, intlOptions } = split(options);
  const resolved = withDateDefaults(intlOptions, required, defaults);
  return finish(intl('DateTimeFormat', tag, resolved).format(date), plain);
}

/**
 * A date, as `toLocaleDateString` would print it. Pass `timeZone` when the
 * instant must read in a zone other than the reader's (`'Europe/Paris'`,
 * `'UTC'`), exactly as before.
 * @param {Date|number|string} value
 * @param {Intl.DateTimeFormatOptions & {locale?: string, plainSpaces?: boolean}} [options]
 * @returns {string}
 */
export function formatDate(value, options) {
  return formatDateWith(value, options, 'date', 'date');
}

/**
 * A time, as `toLocaleTimeString` would print it.
 * @param {Date|number|string} value
 * @param {object} [options] As {@link formatDate}.
 * @returns {string}
 */
export function formatTime(value, options) {
  return formatDateWith(value, options, 'time', 'time');
}

/**
 * A date and time, as `toLocaleString` would print it.
 * @param {Date|number|string} value
 * @param {object} [options] As {@link formatDate}.
 * @returns {string}
 */
export function formatDateTime(value, options) {
  return formatDateWith(value, options, 'any', 'all');
}

/**
 * How long ago: `il y a 5 min` / `5 min ago`.
 *
 * The module keeps its own thresholds (when minutes become hours differs from
 * layer to layer, on purpose); this only phrases the answer.
 *
 * @param {number} value Already rounded to the unit.
 * @param {'s'|'min'|'h'|'d'} unit
 * @param {object} [options] As {@link formatNumber}.
 * @returns {string}
 */
export function formatAge(value, unit, options) {
  const { locale, plain } = split(options);
  const m = words(locale);
  return finish(m.age(formatNumber(value, options), m.ageUnits[unit] ?? unit), plain);
}

/**
 * A month's name from its index (0 = January), from a static table.
 * @param {number} index
 * @param {{style?: 'long'|'short', locale?: string}} [options]
 * @returns {string} `''` for an index out of range.
 */
export function monthName(index, { style = 'long', locale } = {}) {
  return words(locale).months[style === 'short' ? 'short' : 'long'][index] ?? '';
}

/**
 * A weekday's name from its index (0 = Sunday, like `Date#getDay()`).
 * @param {number} index
 * @param {{style?: 'long'|'short', locale?: string}} [options]
 * @returns {string} `''` for an index out of range.
 */
export function weekdayName(index, { style = 'long', locale } = {}) {
  return words(locale).weekdays[style === 'short' ? 'short' : 'long'][index] ?? '';
}

/**
 * Pick the singular or the plural by the locale's plural rules.
 *
 * French CLDR puts 0 AND 1 in the singular (`0 vente`, `1 vente`); English puts
 * only 1 there (`0 sales`). A module that printed `0 ventes` was not following
 * French rules and must keep its own test to stay byte-identical.
 *
 * @param {number} count
 * @param {string} one
 * @param {string} other
 * @param {{locale?: string}} [options]
 * @returns {string}
 */
export function plural(count, one, other, options) {
  const { tag } = split(options);
  return intl('PluralRules', tag).select(Number(count)) === 'one' ? one : other;
}

/**
 * A count and its noun: `12 400 ventes` / `12,400 sales`.
 * @param {number} count
 * @param {string} one
 * @param {string} other
 * @param {object} [options] As {@link formatNumber}.
 * @returns {string}
 */
export function countNoun(count, one, other, options) {
  return `${formatNumber(count, options)} ${plural(count, one, other, options)}`;
}

/**
 * An ordinal: `1ᵉʳ`, `1ʳᵉ` (feminine), `2ᵉ` / `1st`, `2nd`, `11th`.
 * @param {number} n
 * @param {{feminine?: boolean, locale?: string}} [options]
 * @returns {string}
 */
export function ordinal(n, { feminine = false, locale } = {}) {
  return words(locale).ordinal(Number(n), feminine);
}
