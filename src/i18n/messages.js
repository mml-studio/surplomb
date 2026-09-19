/**
 * Catalogs: French and English side by side, one file per module.
 *
 * A module `foo.js` keeps its visible strings in `foo.i18n.js`, next to it:
 *
 *     export default defineMessages({
 *       replay: { fr: '↺ Rejouer', en: '↺ Replay' },
 *       dayOf: {
 *         fr: (day, days) => `jour ${day} sur ${days}`,
 *         en: (day, days) => `day ${day} of ${days}`,
 *         sample: [4, 10],
 *       },
 *     });
 *
 * and reads them when it draws, never when it loads:
 *
 *     import messages from './foo.i18n.js';
 *     const m = messages();          // the current locale, resolved once
 *     chip.label = m.replay;
 *     line = m.dayOf(state.day, state.days);
 *
 * A LEAF is an object with an own `fr` key. Next to `fr` and `en` it may carry
 * `note` (context for the translator), `sample` (arguments the parity test
 * renders a function with) and `keep` (French proper nouns this message keeps
 * in English, e.g. a place name). Anything else is a GROUP of leaves, nested as
 * deep as the module likes. Values are strings, functions (plurals, agreement,
 * interpolation — same arity in both languages) or arrays of strings (static
 * tables such as month names).
 *
 * Why co-located catalogs and not one central file or gettext: parallel
 * translation batches would all edit one file, a central catalog would pull
 * every lazy layer's strings into the entry chunk, and a French-keyed gettext
 * would orphan English silently every time the French is rewritten — which in
 * this repository is weekly. See docs/i18n/CONVENTIONS.md.
 *
 * @module i18n/messages
 */

import { DEFAULT_LOCALE, SUPPORTED_LOCALES, getLocale, normalizeLocale } from './locale.js';

/** The keys a leaf may carry. */
export const MESSAGE_LEAF_KEYS = Object.freeze(['fr', 'en', 'note', 'sample', 'keep']);

const CATALOG = Symbol.for('surplomb.i18n.catalog');

/**
 * @param {unknown} node
 * @returns {boolean} whether `node` is a message leaf (`{ fr, en, … }`).
 */
export function isMessageLeaf(node) {
  return Boolean(node) && typeof node === 'object' && !Array.isArray(node)
    && Object.prototype.hasOwnProperty.call(node, 'fr');
}

/** One locale's view of a definition: leaves replaced by their value. */
function resolveDefinition(definition, locale) {
  const out = {};
  for (const [key, node] of Object.entries(definition)) {
    if (isMessageLeaf(node)) {
      // A missing translation falls back to French rather than to nothing:
      // a half-translated catalog must still render. The parity test is what
      // keeps a missing `en` from shipping.
      out[key] = node[locale] ?? node[DEFAULT_LOCALE];
    } else if (node && typeof node === 'object' && !Array.isArray(node)) {
      out[key] = resolveDefinition(node, locale);
    } else {
      out[key] = node;
    }
  }
  return Object.freeze(out);
}

/**
 * Declare a catalog.
 *
 * Returns an ACCESSOR: call it (no argument) to get the current locale's
 * messages, resolved once per locale and cached. Declaring is free — nothing
 * is resolved until the first call — so a catalog can be imported by a module
 * that never draws.
 *
 * @template {Record<string, unknown>} T
 * @param {T} definition
 * @returns {((locale?: string) => any) & {definition: T}}
 */
export function defineMessages(definition) {
  const cache = new Map();
  const accessor = (locale = getLocale()) => {
    const key = normalizeLocale(locale) || DEFAULT_LOCALE;
    let resolved = cache.get(key);
    if (!resolved) {
      resolved = resolveDefinition(definition, key);
      cache.set(key, resolved);
    }
    return resolved;
  };
  Object.defineProperty(accessor, 'definition', { value: definition, enumerable: true });
  Object.defineProperty(accessor, CATALOG, { value: true });
  return accessor;
}

/**
 * @param {unknown} value
 * @returns {boolean} whether `value` came from {@link defineMessages}.
 */
export function isCatalog(value) {
  return typeof value === 'function' && value[CATALOG] === true;
}

/** Walk a dotted path through a resolved catalog. */
function lookup(resolved, path) {
  if (Object.prototype.hasOwnProperty.call(resolved, path)) return resolved[path];
  let node = resolved;
  for (const part of String(path).split('.')) {
    if (!node || typeof node !== 'object' || !Object.prototype.hasOwnProperty.call(node, part)) {
      return undefined;
    }
    node = node[part];
  }
  return node;
}

/**
 * The display label of a DATA value.
 *
 * Data stays data: a DVF `type_local` is `Appartement` in the file, in the
 * cache and in the share link, in both languages. Only what the reader sees is
 * translated, through a catalog keyed by the raw value:
 *
 *     const TYPE_LOCAL = defineMessages({
 *       Appartement: { fr: 'Appartement', en: 'Apartment' },
 *     });
 *     labelFor(TYPE_LOCAL, row.type_local); // 'Apartment' in English
 *
 * A value the table does not know is shown as it came — a new category in the
 * source must never render as an empty cell.
 *
 * @param {ReturnType<typeof defineMessages>} table
 * @param {unknown} raw
 * @param {{locale?: string}} [options]
 * @returns {string}
 */
export function labelFor(table, raw, { locale } = {}) {
  if (raw == null) return '';
  const key = String(raw);
  const resolved = table(locale);
  const value = Object.prototype.hasOwnProperty.call(resolved, key) ? resolved[key] : undefined;
  return typeof value === 'string' ? value : key;
}

/**
 * One message in every supported locale, for code that must RECOGNISE a
 * string whatever language drew it: a harness reading a chip, a parser meeting
 * a label typed in either language, a test asserting on both.
 *
 * @param {ReturnType<typeof defineMessages>} table
 * @param {string} path Key, dotted for nested groups.
 * @param {...unknown} args Arguments for a function message.
 * @returns {string[]} one value per locale, duplicates removed, default first.
 */
export function inAllLocales(table, path, ...args) {
  const values = [];
  for (const locale of SUPPORTED_LOCALES) {
    let value = lookup(table(locale), path);
    if (typeof value === 'function') value = value(...args);
    if (value !== undefined && !values.includes(value)) values.push(value);
  }
  return values;
}

/**
 * Every leaf of a definition with its dotted path — what the parity test and
 * the translation report iterate.
 * @param {Record<string, unknown>} definition
 * @param {string} [prefix]
 * @returns {Array<{path: string, leaf: Record<string, unknown>}>}
 */
export function messageLeaves(definition, prefix = '') {
  const leaves = [];
  for (const [key, node] of Object.entries(definition)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isMessageLeaf(node)) leaves.push({ path, leaf: node });
    else if (node && typeof node === 'object' && !Array.isArray(node)) {
      leaves.push(...messageLeaves(node, path));
    } else leaves.push({ path, leaf: null });
  }
  return leaves;
}
