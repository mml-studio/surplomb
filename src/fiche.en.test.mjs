// The Address X-ray in English: the page's static markup and the sentences
// `fiche.js` writes into it.
//
// `fiche.html` is the French catalog of its own shell, exactly as `index.html`
// is the globe's, so the first test here is the one `markup.test.mjs` runs on
// the globe: every `data-i18n*` key has an entry whose `fr` is the HTML's own
// text, and no entry outlives its element. The second is the harder one — no
// text in the sheet's body may be left untagged, which is what would ship a
// French line onto an English page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import messages, { markupMessages } from './fiche.i18n.js';
import { messageLeaves } from './i18n/messages.js';
import { assertNoFrench, withLocale } from './i18n/testing.js';
import { applyMarkup } from './i18n/markup.js';
import { walkHtml } from '../scripts/lib/i18nScan.mjs';

const FICHE_HTML = readFileSync(new URL('../fiche.html', import.meta.url), 'utf8');
/** Everything above `<body>` is metadata, plus the `<title>`, which is tagged. */
const BODY = FICHE_HTML.slice(FICHE_HTML.indexOf('<body>'));

test('every data-i18n key in fiche.html has a catalog entry whose French is the HTML', () => {
  const resolved = markupMessages('fr');
  const lookup = (key) => key.split('.').reduce((node, part) => node?.[part], resolved);
  const used = new Set();
  const problems = [];
  walkHtml(FICHE_HTML, (item) => {
    if (!item.key) return;
    used.add(item.key);
    const french = lookup(item.key);
    if (typeof french !== 'string') problems.push(`fiche.html:${item.line} “${item.key}” has no entry`);
    else if (french !== item.text) {
      problems.push(`fiche.html:${item.line} “${item.key}”: HTML says “${item.text}”, catalog says “${french}”`);
    }
  });
  assert.deepEqual(problems, []);
  const orphans = messageLeaves(markupMessages.definition).map(({ path }) => path)
    // `<title>` is in `<head>`, which `walkHtml` does not walk; it is applied
    // by the same applicator and asserted below.
    .filter((path) => !used.has(path) && path !== 'page.title');
  assert.deepEqual(orphans, [], 'keys no element uses');
});

test('nothing in the sheet’s body is left untagged', () => {
  const untagged = [];
  walkHtml(BODY, (item) => {
    if (item.covered) return;
    untagged.push(`${item.kind === 'attribute' ? `[${item.attribute}] ` : ''}${item.text}`);
  });
  assert.deepEqual(untagged, [], 'text or attribute with no data-i18n in fiche.html');
});

test('the `<title>` is tagged and translated, like the rest of the head’s words', () => {
  assert.match(FICHE_HTML, /<title data-i18n="page\.title">Radiographie d'adresse<\/title>/);
  assert.equal(markupMessages('en').page.title, 'Address X-ray');
});

// ── a DOM double, just what the applicator touches ─────────────────────────

class FakeText {
  constructor(value) { this.nodeType = 3; this.nodeValue = value; }
}

class FakeElement {
  constructor(tag, attrs = {}, children = []) {
    this.nodeType = 1;
    this.tagName = tag.toUpperCase();
    this.attrs = new Map(Object.entries(attrs));
    this.childNodes = children.map((child) => (typeof child === 'string' ? new FakeText(child) : child));
    this.classList = { contains: () => false };
    this.ownerDocument = { createTextNode: (value) => new FakeText(value) };
  }

  getAttribute(name) { return this.attrs.has(name) ? this.attrs.get(name) : null; }

  setAttribute(name, value) { this.attrs.set(name, String(value)); }

  get textContent() {
    return this.childNodes.map((node) => (node.nodeType === 3 ? node.nodeValue : node.textContent)).join('');
  }

  set textContent(value) { this.childNodes = [new FakeText(value)]; }

  *descendants() {
    for (const node of this.childNodes) {
      if (node.nodeType !== 1) continue;
      yield node;
      yield* node.descendants();
    }
  }

  querySelectorAll(selector) {
    const names = [...selector.matchAll(/\[([^\]]+)\]/g)].map((match) => match[1]);
    return [...this.descendants()].filter((node) => names.some((name) => node.attrs.has(name)));
  }
}

test('the masthead and the form read in English, and the code span survives', () => {
  const eyebrow = new FakeElement('p', { 'data-i18n': 'masthead.eyebrow' }, ['Radiographie d’adresse']);
  const code = new FakeElement('code', { translate: 'no' }, ['?lat=&lon=']);
  const sentence = new FakeElement('span', { 'data-i18n': 'masthead.subline' },
    ['Entrez une adresse française, ou ouvrez cette page avec']);
  const subline = new FakeElement('p', {}, [sentence, ' ', code, '.']);
  const input = new FakeElement('input', {
    'data-i18n-aria-label': 'lookup.addressLabel',
    'data-i18n-placeholder': 'lookup.example',
    'aria-label': 'Adresse',
    placeholder: '13 rue du Chevaleret, Paris',
  });
  const scan = new FakeElement('button', { 'data-i18n': 'lookup.scan' }, ['Scanner']);
  const root = new FakeElement('main', {}, [eyebrow, subline, input, scan]);

  const result = applyMarkup(root, { locale: 'en', catalog: markupMessages });
  assert.deepEqual(result.missing, []);
  assert.equal(eyebrow.textContent, 'Address X-ray');
  assert.equal(subline.textContent, 'Enter a French address, or open this page with ?lat=&lon=.',
    'the code span and the full stop stay put');
  assert.equal(input.getAttribute('aria-label'), 'Address');
  assert.equal(input.getAttribute('placeholder'), '13 rue du Chevaleret, Paris',
    'the example address is a French address in both languages');
  assert.equal(scan.textContent, 'Scan');

  // And in French the applicator is a no-op: the HTML is already the catalog.
  const frenchRoot = new FakeElement('main', {}, [
    new FakeElement('p', { 'data-i18n': 'masthead.eyebrow' }, ['Radiographie d’adresse']),
  ]);
  assert.deepEqual(applyMarkup(frenchRoot, { locale: 'fr', catalog: markupMessages }),
    { applied: 0, missing: [] });
});

// ── what fiche.js writes ───────────────────────────────────────────────────

test('the sheet’s own sentences, in English', () => {
  const en = withLocale('en', () => {
    const m = messages();
    return {
      statusLine: m.statusLine(8, 1, 1, 'Sep 8, 2026, 12:45:00'),
      silent: m.silentSources('atmo, gpu'),
      distance: m.addressDistance('180'),
      scanning: m.scanning,
      geocoding: m.geocoding,
      notFound: m.notFound,
      colophon: m.colophon,
      status: m.status,
    };
  });
  assert.equal(en.statusLine, '8 themes complete, 1 partial, 1 with no answer — Sep 8, 2026, 12:45:00');
  assert.equal(en.silent, 'Silent sources: atmo, gpu.');
  assert.equal(en.distance, 'point 180 m from the nearest address');
  assert.equal(en.scanning, 'Querying the seventeen sources…');
  assert.equal(en.notFound, 'Address not found in the national address database (BAN).');
  assert.deepEqual(en.status, { ok: 'complete', partial: 'partial', absent: 'no answer' });
  assert.match(en.colophon, /^French public sources — property sales \(DVF, DGFiP\)/);
  assert.match(en.colophon, /DATA_SOURCES\.md\.$/);
  assertNoFrench(en, { allow: ['Ma connexion internet', 'Atmo France', 'atmo, gpu'] });
});

test('the same sentences in French, byte for byte what the sheet printed before', () => {
  const fr = withLocale('fr', () => {
    const m = messages();
    return {
      statusLine: m.statusLine(8, 1, 1, '08/09/2026 12:45:00'),
      silent: m.silentSources('atmo, gpu'),
      distance: m.addressDistance(180),
      scanning: m.scanning,
      geocoding: m.geocoding,
      notFound: m.notFound,
      status: m.status,
      colophon: m.colophon,
    };
  });
  assert.equal(fr.statusLine, '8 thématiques complètes, 1 partielles, 1 sans réponse — 08/09/2026 12:45:00');
  assert.equal(fr.silent, 'Sources muettes : atmo, gpu.');
  assert.equal(fr.distance, 'point à 180 m de l’adresse la plus proche');
  assert.equal(fr.scanning, 'Interrogation des dix-sept sources…');
  assert.equal(fr.geocoding, 'Géocodage…');
  assert.equal(fr.notFound, 'Adresse introuvable dans la Base Adresse Nationale.');
  assert.deepEqual(fr.status, { ok: 'complet', partial: 'partiel', absent: 'sans réponse' });
  assert.match(fr.colophon, /^Sources publiques françaises — DVF \(DGFiP\)/);
});
