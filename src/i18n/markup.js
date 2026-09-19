/**
 * Translate the static markup of `index.html` into the page's locale.
 *
 * `index.html` IS the French catalog of the shell: its text stays in the file,
 * where people edit it. An element that has an English version names it:
 *
 *     <button data-i18n="panel.close" data-i18n-title="panel.closeTitle" title="Fermer le panneau">
 *       <span class="material-symbols-outlined">close</span> Fermer
 *     </button>
 *
 * and the English lives in `src/i18n/markup.i18n.js` under the same key,
 * `{ fr: 'Fermer', en: 'Close' }`. `fr` repeats the HTML on purpose:
 * `markup.test.mjs` compares the two, so a French edit in the HTML that
 * forgets the catalog fails `npm test` instead of leaving a stale English line.
 *
 * Attributes: `data-i18n` (the element's text), `data-i18n-aria-label`,
 * `data-i18n-title`, `data-i18n-placeholder`, `data-i18n-alt`.
 *
 * WHAT IT NEVER TOUCHES. A `.material-symbols-outlined` span: its text is an
 * icon ligature (`close`, `layers_clear`), and translating it would print the word
 * instead of the icon. When a tagged element holds such a child, only its own
 * text nodes are rewritten and the icon stays where it was.
 *
 * TEMPLATES. `querySelectorAll` does not enter a `<template>`'s content (the
 * first-run card lives in one), so each template is walked as its own root —
 * every clone the app makes afterwards is born translated.
 *
 * COST IN FRENCH: zero. `src/boot.js` imports this module only when the locale
 * is not French, and {@link applyMarkup} returns at once in French.
 *
 * @module i18n/markup
 */

import markupMessages from './markup.i18n.js';
import { DEFAULT_LOCALE, I18N_READY_ATTRIBUTE, getLocale } from './locale.js';

/** Element attribute → the attribute it translates (`null` = the text). */
export const MARKUP_ATTRIBUTES = Object.freeze({
  'data-i18n': null,
  'data-i18n-aria-label': 'aria-label',
  'data-i18n-title': 'title',
  'data-i18n-placeholder': 'placeholder',
  'data-i18n-alt': 'alt',
});

/** Icon-ligature spans whose text must never be translated. */
export const ICON_LIGATURE_CLASS = 'material-symbols-outlined';

const SELECTOR = Object.keys(MARKUP_ATTRIBUTES).map((name) => `[${name}]`).join(',');
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

/** Walk a dotted key through a resolved catalog. */
function lookup(resolved, key) {
  if (Object.prototype.hasOwnProperty.call(resolved, key)) return resolved[key];
  let node = resolved;
  for (const part of key.split('.')) {
    if (!node || typeof node !== 'object' || !Object.prototype.hasOwnProperty.call(node, part)) return undefined;
    node = node[part];
  }
  return node;
}

function isIcon(element) {
  return Boolean(element?.classList?.contains?.(ICON_LIGATURE_CLASS));
}

/**
 * Replace an element's visible text, keeping its element children (icons,
 * badges) in place. The first non-blank direct text node takes the new text,
 * with its surrounding whitespace; any other direct text is emptied.
 * @returns {boolean} whether anything was written.
 */
export function setElementText(element, text) {
  if (isIcon(element)) return false;
  const children = [...(element.childNodes || [])];
  if (!children.some((node) => node.nodeType === ELEMENT_NODE)) {
    element.textContent = text;
    return true;
  }
  const texts = children.filter((node) => node.nodeType === TEXT_NODE && node.nodeValue.trim());
  if (!texts.length) {
    element.appendChild(element.ownerDocument.createTextNode(` ${text}`));
    return true;
  }
  const [first, ...rest] = texts;
  const lead = /^\s*/.exec(first.nodeValue)[0];
  const trail = /\s*$/.exec(first.nodeValue)[0];
  first.nodeValue = `${lead}${text}${trail}`;
  for (const node of rest) node.nodeValue = '';
  return true;
}

/** Every root to walk: the root itself and each template's content, nested. */
function roots(root) {
  const out = [root];
  for (const template of root.querySelectorAll?.('template') || []) {
    if (template.content) out.push(...roots(template.content));
  }
  return out;
}

/**
 * Translate every tagged element under `root`.
 *
 * @param {Document|DocumentFragment|Element} [root]
 * @param {{locale?: string, catalog?: Function}} [options]
 * @returns {{applied: number, missing: string[]}} what was written, and the
 *   keys the catalog does not know (left in French, reported once).
 */
export function applyMarkup(root = globalThis.document, { locale = getLocale(), catalog = markupMessages } = {}) {
  const result = { applied: 0, missing: [] };
  if (!root || locale === DEFAULT_LOCALE) return result;
  const resolved = catalog(locale);
  for (const scope of roots(root)) {
    for (const element of scope.querySelectorAll?.(SELECTOR) || []) {
      for (const [marker, target] of Object.entries(MARKUP_ATTRIBUTES)) {
        const key = element.getAttribute(marker);
        if (!key) continue;
        const value = lookup(resolved, key);
        if (typeof value !== 'string') {
          if (!result.missing.includes(key)) result.missing.push(key);
          continue;
        }
        if (target === null) {
          if (setElementText(element, value)) result.applied += 1;
        } else {
          element.setAttribute(target, value);
          result.applied += 1;
        }
      }
    }
  }
  return result;
}

/**
 * Say the markup is ready: lifts the no-flash rule in `style.css`
 * (`html[lang="en"]:not([data-i18n-ready]) #loading-screen .loader-status`).
 * @param {Element} [rootElement] `<html>`.
 */
export function markMarkupReady(rootElement = globalThis.document?.documentElement) {
  rootElement?.setAttribute?.(I18N_READY_ATTRIBUTE, '');
}
