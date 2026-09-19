// The static-markup applicator, on a small DOM double, and the one rule that
// ties src/i18n/markup.i18n.js to index.html: `fr` is the HTML's own text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ICON_LIGATURE_CLASS, MARKUP_ATTRIBUTES, applyMarkup, markMarkupReady, setElementText } from './markup.js';
import markupMessages from './markup.i18n.js';
import { defineMessages, messageLeaves } from './messages.js';
import { I18N_READY_ATTRIBUTE } from './locale.js';
import { walkHtml } from '../../scripts/lib/i18nScan.mjs';

// ── a DOM double: just what the applicator touches ─────────────────────────

class FakeText {
  constructor(value) { this.nodeType = 3; this.nodeValue = value; }
}

class FakeElement {
  constructor(tag, attrs = {}, children = []) {
    this.nodeType = 1;
    this.tagName = tag.toUpperCase();
    this.attrs = new Map(Object.entries(attrs));
    this.childNodes = children.map((child) => (typeof child === 'string' ? new FakeText(child) : child));
    const classes = String(attrs.class || '').split(/\s+/).filter(Boolean);
    this.classList = { contains: (name) => classes.includes(name) };
    this.ownerDocument = { createTextNode: (value) => new FakeText(value) };
    this.content = null;
  }

  getAttribute(name) { return this.attrs.has(name) ? this.attrs.get(name) : null; }

  setAttribute(name, value) { this.attrs.set(name, String(value)); }

  appendChild(node) { this.childNodes.push(node); return node; }

  get textContent() {
    return this.childNodes.map((node) => (node.nodeType === 3 ? node.nodeValue : node.textContent)).join('');
  }

  set textContent(value) { this.childNodes = [new FakeText(value)]; }

  /** Descendants only, like the DOM; a template's content is NOT entered. */
  *descendants() {
    for (const node of this.childNodes) {
      if (node.nodeType !== 1) continue;
      yield node;
      if (node.tagName !== 'TEMPLATE') yield* node.descendants();
    }
  }

  querySelectorAll(selector) {
    const all = [...this.descendants()];
    if (selector === 'template') return all.filter((node) => node.tagName === 'TEMPLATE');
    const names = [...selector.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]);
    return all.filter((node) => names.some((name) => node.attrs.has(name)));
  }
}

const el = (tag, attrs, children) => new FakeElement(tag, attrs, children);

const catalog = defineMessages({
  share: {
    button: { fr: 'Partager', en: 'Share' },
    title: { fr: 'Partager la vue', en: 'Share this view' },
  },
  search: { placeholder: { fr: 'Rechercher une adresse', en: 'Search an address' } },
  card: { heading: { fr: 'Bienvenue', en: 'Welcome' } },
});

function page() {
  const icon = el('span', { class: ICON_LIGATURE_CLASS }, ['share']);
  const button = el('button', { 'data-i18n': 'share.button', 'data-i18n-title': 'share.title', title: 'Partager la vue' },
    [icon, ' Partager ']);
  const input = el('input', { 'data-i18n-placeholder': 'search.placeholder', placeholder: 'Rechercher une adresse' });
  const cardHeading = el('h2', { 'data-i18n': 'card.heading' }, ['Bienvenue']);
  const template = el('template');
  template.content = el('#fragment', {}, [cardHeading]);
  const unknown = el('p', { 'data-i18n': 'nowhere.to.be.found' }, ['Texte']);
  const lonelyIcon = el('span', { class: ICON_LIGATURE_CLASS, 'data-i18n': 'share.button' }, ['share']);
  const root = el('#document', {}, [el('main', {}, [button, input, template, unknown, lonelyIcon])]);
  return { root, button, icon, input, cardHeading, unknown, lonelyIcon };
}

test('in French nothing is touched and nothing is reported', () => {
  const { root, button } = page();
  assert.deepEqual(applyMarkup(root, { locale: 'fr', catalog }), { applied: 0, missing: [] });
  assert.equal(button.textContent, 'share Partager ');
});

test('in English text, attributes and template contents are translated; icons are not', () => {
  const { root, button, icon, input, cardHeading, unknown, lonelyIcon } = page();
  const result = applyMarkup(root, { locale: 'en', catalog });
  assert.equal(icon.textContent, 'share', 'the ligature survives');
  assert.equal(button.childNodes[0], icon, 'and stays first');
  assert.equal(button.textContent, 'share Share ', 'the text node keeps its spacing');
  assert.equal(button.getAttribute('title'), 'Share this view');
  assert.equal(input.getAttribute('placeholder'), 'Search an address');
  assert.equal(cardHeading.textContent, 'Welcome', 'template content is walked');
  assert.equal(unknown.textContent, 'Texte', 'an unknown key stays French');
  assert.equal(lonelyIcon.textContent, 'share', 'an icon span is never rewritten, even when tagged');
  assert.deepEqual(result.missing, ['nowhere.to.be.found']);
  assert.equal(result.applied, 4);
});

test('setElementText replaces direct text and keeps element children', () => {
  const badge = el('span', {}, ['3']);
  const target = el('button', {}, ['  Ancien  ', badge, ' reste ']);
  setElementText(target, 'New');
  assert.equal(target.textContent, '  New  3', 'the first text node takes the text, the others are emptied');
  const bare = el('p', {}, ['Ancien']);
  setElementText(bare, 'New');
  assert.equal(bare.textContent, 'New');
  const iconOnly = el('button', {}, [el('span', { class: ICON_LIGATURE_CLASS }, ['close'])]);
  setElementText(iconOnly, 'Close');
  assert.equal(iconOnly.textContent, 'close Close');
});

test('the ready mark is what lifts the no-flash rule', () => {
  const html = el('html');
  markMarkupReady(html);
  assert.equal(html.getAttribute(I18N_READY_ATTRIBUTE), '');
  assert.doesNotThrow(() => markMarkupReady(null));
});

test('the attribute set is the documented one', () => {
  assert.deepEqual(MARKUP_ATTRIBUTES, {
    'data-i18n': null,
    'data-i18n-aria-label': 'aria-label',
    'data-i18n-title': 'title',
    'data-i18n-placeholder': 'placeholder',
    'data-i18n-alt': 'alt',
  });
});

// ── index.html ⇄ markup.i18n.js ─────────────────────────────────────────────

test('every data-i18n key in index.html has a catalog entry whose French is the HTML', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const resolved = markupMessages('fr');
  const lookup = (key) => key.split('.').reduce((node, part) => node?.[part], resolved);
  const used = new Set();
  const problems = [];
  walkHtml(html, (item) => {
    if (!item.key) return;
    used.add(item.key);
    const french = lookup(item.key);
    if (typeof french !== 'string') problems.push(`index.html:${item.line} “${item.key}” has no entry in markup.i18n.js`);
    else if (french !== item.text) {
      problems.push(`index.html:${item.line} “${item.key}”: HTML says “${item.text}”, catalog says “${french}”`);
    }
  });
  assert.deepEqual(problems, []);
  // And no entry outlives its element.
  const orphans = messageLeaves(markupMessages.definition).map(({ path }) => path).filter((path) => !used.has(path));
  assert.deepEqual(orphans, [], 'markup.i18n.js keys no element uses');
});
