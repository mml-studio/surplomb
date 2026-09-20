// The X-ray panel in English: its head, and the language it hands the frame.
//
// The panel is three buttons around an iframe, so the thing worth pinning is
// not only the words: it is that the frame's URL carries `?lang=` when the
// globe is not French. Without it the sheet would read the browser's stored
// choice and could answer in the other language INSIDE an English globe.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ficheSheetUrl, mountFicheSheet } from './ficheSheet.js';
import messages from './ficheSheet.i18n.js';
import { assertNoFrench, useTestLocale, withLocale } from '../i18n/testing.js';

const POINT = { lat: 45.75, lon: 4.83 };

test('the frame inherits the globe’s language, and French adds nothing to the URL', () => {
  assert.equal(ficheSheetUrl(POINT), '/fiche.html?lat=45.750000&lon=4.830000&embed=1');
  assert.equal(ficheSheetUrl(POINT, { locale: 'fr' }), '/fiche.html?lat=45.750000&lon=4.830000&embed=1',
    'French is the default of both gates: the parameter would only lengthen the URL');
  assert.equal(ficheSheetUrl(POINT, { locale: 'en' }),
    '/fiche.html?lat=45.750000&lon=4.830000&embed=1&lang=en');
  // The tab link is the same sheet without `embed=1` — and in the same language.
  assert.equal(ficheSheetUrl(POINT, { embed: false, locale: 'en' }),
    '/fiche.html?lat=45.750000&lon=4.830000&lang=en');
});

/** The smallest DOM the panel touches. */
function makeElement() {
  return {
    children: [],
    className: '',
    id: '',
    hidden: false,
    style: { removeProperty() {} },
    dataset: {},
    attributes: {},
    listeners: new Map(),
    html: '',
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    appendChild(child) { this.children.push(child); return child; },
    addEventListener(type, handler) { this.listeners.set(type, handler); },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return this.attributes[name] ?? null; },
    removeAttribute(name) { delete this.attributes[name]; },
    remove() {},
    getBoundingClientRect() { return { width: 400, height: 600, left: 0, top: 0 }; },
    querySelector(selector) {
      const key = selector.replace(/[[\]]/g, '');
      if (!this._nodes) this._nodes = new Map();
      if (!this._nodes.has(key)) this._nodes.set(key, makeElement());
      return this._nodes.get(key);
    },
    set innerHTML(value) { this.html = String(value); },
    get innerHTML() { return this.html; },
  };
}

/** Mount the panel on a DOM double and hand back what a reader can see. */
function mountAndShow() {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  globalThis.document = { createElement: makeElement, getElementById: () => null, body: makeElement() };
  delete globalThis.window;
  try {
    const sheet = mountFicheSheet();
    sheet.show(POINT, 'Rue de la Ré');
    return {
      label: sheet.element.attributes['aria-label'],
      head: sheet.element.innerHTML,
      src: sheet.element.querySelector('[data-fiche-frame]').getAttribute('src'),
      href: sheet.element.querySelector('[data-fiche-open]').attributes.href,
    };
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
}

test('the head of an English panel is English, and its frame asks for English', () => {
  const en = withLocale('en', mountAndShow);
  assert.equal(en.label, 'Address X-ray');
  assert.match(en.head, /<span class="fiche-sheet-title">ADDRESS X-RAY<\/span>/);
  assert.match(en.head, />TAB<\/a>/);
  assert.match(en.head, /title="Open the whole sheet in a tab — with the lookup form and the print button"/);
  assert.match(en.head, /aria-label="Close the X-ray"/);
  assert.equal(en.src, '/fiche.html?lat=45.750000&lon=4.830000&embed=1&lang=en');
  assert.equal(en.href, '/fiche.html?lat=45.750000&lon=4.830000&lang=en');
  assertNoFrench(en.head.replace(/class="[^"]*"/g, ''), { allow: ['fiche'] });
});

test('the same panel in French, unchanged, and its frame asks for nothing', () => {
  const fr = withLocale('fr', mountAndShow);
  assert.equal(fr.label, 'Radiographie d’adresse');
  assert.match(fr.head, /<span class="fiche-sheet-title">RADIOGRAPHIE D’ADRESSE<\/span>/);
  assert.match(fr.head, />ONGLET<\/a>/);
  assert.match(fr.head, /aria-label="Fermer la radiographie"/);
  assert.equal(fr.src, '/fiche.html?lat=45.750000&lon=4.830000&embed=1');
});

test('the panel’s words come from the catalog at call time', (t) => {
  useTestLocale('en', t);
  assert.equal(messages().head.print, 'PDF', 'the same in both languages, and it is a file format');
  assert.equal(messages().head.title, 'ADDRESS X-RAY');
});
