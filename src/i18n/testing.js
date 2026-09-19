/**
 * Test helpers for the two languages. Node-only in practice, but written
 * without `node:` imports so it can sit under `src/` next to what it tests.
 *
 *     import { useTestLocale, withLocale, assertNoFrench } from '../i18n/testing.js';
 *
 *     useTestLocale('en');                       // the whole file speaks English
 *     test('…', (t) => { useTestLocale('en', t); … });  // one test, restored after
 *     const label = withLocale('en', () => chipLabel(state));
 *     assertNoFrench(layer.getRowControls(), { allow: ['Pléiades Neo'] });
 *
 * Every test file runs in its own process (`node --test`), so a file-level
 * `useTestLocale('en')` cannot leak into another file.
 *
 * @module i18n/testing
 */

import { getLocaleOverride, setLocaleOverride } from './locale.js';
import { findFrench } from './frenchDetector.js';

/**
 * Make {@link import('./locale.js').getLocale} answer `locale`.
 * @param {'fr'|'en'} locale
 * @param {{after?: Function}} [t] A `node:test` context: restores after it.
 * @returns {() => void} restore.
 */
export function useTestLocale(locale, t) {
  const previous = getLocaleOverride();
  setLocaleOverride(locale);
  const restore = () => setLocaleOverride(previous);
  if (typeof t?.after === 'function') t.after(restore);
  return restore;
}

/**
 * Run `fn` with the locale forced, then restore — also when `fn` throws or
 * its promise rejects.
 * @template T
 * @param {'fr'|'en'} locale
 * @param {() => T} fn
 * @returns {T}
 */
export function withLocale(locale, fn) {
  const restore = useTestLocale(locale);
  let result;
  try {
    result = fn();
  } catch (error) {
    restore();
    throw error;
  }
  if (result && typeof result.then === 'function') {
    return result.then(
      (value) => { restore(); return value; },
      (error) => { restore(); throw error; },
    );
  }
  restore();
  return result;
}

/** Every string inside a value, with where it was found. */
function collectStrings(value, path = '', out = []) {
  if (typeof value === 'string') out.push({ path, text: value });
  else if (Array.isArray(value)) value.forEach((item, index) => collectStrings(item, `${path}[${index}]`, out));
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) collectStrings(item, path ? `${path}.${key}` : key, out);
  }
  return out;
}

/**
 * Fail when English output carries French: words, elisions, accents, or
 * French number typography (`5,6`, `91,3 %`, `3 200 €`).
 *
 * @param {unknown} value A string, or any object/array — every string inside
 *   is checked (keys are not).
 * @param {{allow?: string[], message?: string}} [options] `allow`: proper nouns
 *   beyond docs/GLOSSARY.md (place names, sensors) that stay French.
 */
export function assertNoFrench(value, { allow = [], message = 'French in English output' } = {}) {
  const problems = [];
  for (const { path, text } of collectStrings(value)) {
    const found = findFrench(text, { allow });
    if (found.length) {
      problems.push(`  ${path || '(string)'}: ${found.map((f) => `${f.kind} “${f.match}”`).join(', ')}\n    ${text}`);
    }
  }
  if (problems.length) {
    const error = new Error(`${message}:\n${problems.join('\n')}`);
    error.name = 'AssertionError';
    throw error;
  }
}
