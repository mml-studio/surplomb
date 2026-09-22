// The five i18n ratchet rules, each pinned on a fixture, so a change to the
// scanner that moves a count is a decision rather than an accident.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RULE_IDS,
  compareToBaseline,
  hasInterfaceText,
  ignoredLines,
  isCssClassList,
  isResourceLocator,
  renderBaseline,
  rulesFor,
  scanHtml,
  scanModule,
  tightenBaseline,
  walkHtml,
} from './i18nScan.mjs';

const count = (source, rule) => scanModule(source).counts[rule];

test('R1 counts French literals — not keys, specifiers, directives or console output', () => {
  const source = `
    'use strict';
    import x from './données.js';
    export { y } from './réseau.js';
    const a = 'Aucun résultat';
    const b = \`jour \${n} sur \${m}\`;
    const c = { 'clé française': 1, label: 'No results' };
    console.warn('[Data:Mégafeu FR] échec du chargement');
    const d = 'périmètre'; // i18n-ignore-line
    // i18n-ignore-next-line
    const e = 'première détection';
    // i18n-ignore-start
    const f = ['Appartement', 'Dépendance'];
    // i18n-ignore-end
    const g = 'Replay';
    const h = await import('./dépôt.js');
  `;
  assert.equal(count(source, 'R1'), 2);
  const findings = scanModule(source).findings.filter((f) => f.rule === 'R1').map((f) => f.text);
  assert.deepEqual(findings, ['Aucun résultat', 'jour sur']);
});

test('R2 counts literals written into the interface, in any language', () => {
  const source = `
    el.textContent = 'Loading…';
    el.title = ok ? 'Partager' : 'Share' + ' view';
    el.innerHTML = \`<div class="row">\${name}</div>\`;
    el.innerHTML = \`<b>Total</b> \${n}\`;
    el.setAttribute('aria-label', 'Close panel');
    el.setAttribute('data-id', 'not text');
    el.append('Hello', node);
    const row = { label: 'Mégafeu', blurb: \`\${n} ha\`, sourceLabel: 'IGN', id: 'megafire', color: '#fff' };
    const unit = { label: 'MW' };
    const call = { label: format('not counted: behind a call') };
    alert('Oops');
  `;
  const findings = scanModule(source).findings.filter((f) => f.rule === 'R2').map((f) => f.text);
  assert.deepEqual(findings, ['Loading…', 'Partager', 'Share', 'view', '<b>Total</b>', 'Close panel', 'Hello', 'Mégafeu', 'IGN', 'Oops']);
});

test('what counts as interface text', () => {
  assert.equal(hasInterfaceText('Replay'), true);
  assert.equal(hasInterfaceText('—'), false);
  assert.equal(hasInterfaceText('12 MW'), false);
  assert.equal(hasInterfaceText('< 10 MW'), false);
  assert.equal(hasInterfaceText('<div class="x"></div>'), false);
  assert.equal(hasInterfaceText('https://example.org/path'), false);
  assert.equal(hasInterfaceText('ON'), true);
  // A CSS class interpolated into a row's markup is not copy.
  assert.equal(hasInterfaceText(' has-glyph'), false);
  assert.equal(hasInterfaceText('data-icon has-glyph'), false);
  assert.equal(isCssClassList('has-glyph'), true);
  assert.equal(isCssClassList('material-symbols-outlined'), true);
  // One lowercase word on its own is copy, not a class: nothing hides here.
  assert.equal(isCssClassList('erreur'), false);
  assert.equal(isCssClassList('Aucun résultat'), false);
  assert.equal(isCssClassList('has-glyph and more'), false);
});

test('an address is never text — no rule reads a URL or an asset path', () => {
  assert.equal(isResourceLocator('https://overpass-api.de/api/interpreter'), true);
  assert.equal(isResourceLocator('/landing/view-02-480-h264.1ce878e0.mp4'), true);
  assert.equal(isResourceLocator('./local_data/velo_pulse/pulse.json'), true);
  assert.equal(isResourceLocator('Ouverture du globe…'), false);
  const source = `
    const relay = 'https://overpass-api.de/api/interpreter';
    const clip = '/landing/view-02-480-h264.1ce878e0.mp4';
    el.src = 'https://tiles.example.de/x.png';
    const real = 'Aucun résultat';
  `;
  // Only the sentence counts: `.de`, like `ce` in a content hash, is an
  // accident of the address.
  assert.deepEqual(
    scanModule(source).findings.filter((f) => f.rule === 'R1').map((f) => f.text),
    ['Aucun résultat'],
  );
});

test('R4 counts pinned French display formatting, not case mapping or sorting', () => {
  const source = `
    a.toLocaleString('fr-FR');
    b.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
    c.toLocaleDateString('fr-FR', { month: 'long' });
    d.toLocaleTimeString('fr');
    const f = new Intl.NumberFormat('fr-FR');
    const g = Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris' });
    e.toLocaleLowerCase('fr-FR');
    names.sort((x, y) => x.localeCompare(y, 'fr'));
    h.toLocaleString('en-US');
    i.toLocaleString();
    j.toLocaleString('fr-FR'); // i18n-ignore-line
  `;
  assert.equal(count(source, 'R4'), 6);
});

test('R5 counts message reads while the module loads, and nothing inside functions', () => {
  const source = `
    import messages from './thing.i18n.js';
    import * as fmt from '../i18n/format.js';
    import { formatNumber as n, monthName } from '../i18n/format.js';
    import { labelFor, defineMessages } from '../i18n/messages.js';
    import { getLocale, LOCALE_TAGS } from '../i18n/locale.js';
    const BAD_1 = messages().title;
    const BAD_2 = n(3);
    const BAD_3 = fmt.formatEuros(3);
    const BAD_4 = labelFor(T, 'x');
    const BAD_5 = { name: messages().name };
    class Layer {
      static label = messages().label;
      title = messages().title;
      get name() { return messages().name; }
      method() { return getLocale(); }
    }
    const OK_1 = defineMessages({});
    const OK_2 = LOCALE_TAGS.fr;
    const OK_3 = () => messages().title;
    function ok4(value = monthName(1)) { return n(value); }
    export default { get label() { return messages().label; } };
  `;
  assert.equal(count(source, 'R5'), 6);
});

test('catalogs and the i18n layer are exempt from R1, R2 and R4 — never from R5', () => {
  assert.deepEqual(rulesFor('src/data/foo.i18n.js'), { R1: false, R2: false, R4: true, R5: true });
  assert.deepEqual(rulesFor('src/i18n/format.js'), { R1: false, R2: false, R4: false, R5: true });
  assert.deepEqual(rulesFor('src/data/foo.js'), { R1: true, R2: true, R4: true, R5: true });
  // The showcase at `/` speaks both languages: it is counted like the globe.
  assert.deepEqual(rulesFor('src/vitrine/vitrine.js'), { R1: true, R2: true, R4: true, R5: true });
  assert.deepEqual(rulesFor('src/vitrine/counters.js'), { R1: true, R2: true, R4: true, R5: true });
});

test('the escape hatch covers single lines, next lines and blocks', () => {
  const lines = ignoredLines('a\nb // i18n-ignore-line\n// i18n-ignore-next-line\nc\n// i18n-ignore-start\nd\n// i18n-ignore-end\ne');
  assert.deepEqual([...lines].sort((x, y) => x - y), [2, 4, 5, 6, 7]);
});

test('a marker reaches past its own reason and over the statement it names', () => {
  // The hatch asks for a reason, the reason wraps, and the declaration it
  // points at wraps too. `src/data/anfrFrance.js`, verbatim: before this the
  // exemption landed on the comment's second line and `de` stayed counted.
  const source = [
    '    // i18n-ignore-next-line — the French elision, written onto the',
    '    // register’s own noun; the English adds its own preposition.',
    '    const of = french',
    '      ? (/^[aeiou]/i.test(lower) ? `d’${lower}` : `de ${lower}`)',
    '      : shownLower;',
    '    const counted = "Aucun résultat";',
  ].join('\n');
  assert.deepEqual([...ignoredLines(source)].sort((a, b) => a - b), [3]);
  assert.deepEqual(
    scanModule(source).findings.filter((f) => f.rule === 'R1').map((f) => f.text),
    ['Aucun résultat'],
  );
});

test('a marker never reaches into a function body', () => {
  // Otherwise one comment at the top of a 200-line registration would exempt
  // everything written into it afterwards. `i18n-ignore-start`/`end` is where
  // an extent gets typed out and reviewed.
  const source = [
    '    // i18n-ignore-next-line — the id is a share-link token.',
    "    const layer = { id: 'poste',",
    '      render() {',
    "        el.textContent = 'Aucun résultat';",
    '      },',
    '    };',
  ].join('\n');
  assert.equal(scanModule(source).counts.R1, 1);
});

test('R3 counts index.html text and attributes without data-i18n', () => {
  const html = `<!doctype html>
<html lang="fr"><head><title>Surplomb — La France au rayon X.</title>
<script>var x = '<b>not text</b>';</script><style>.a::after { content: 'Texte'; }</style></head>
<body>
  <div id="vitrine"><h1 data-i18n="hero.title">La France <br />au rayon X.</h1><p>Aucun <br />angle mort.</p></div>
  <a data-locale-only="fr" href="/globe?waitlist=1">Liste d’attente</a>
  <!-- <p>commented out</p> -->
  <button data-i18n="share.button" data-i18n-title="share.title" title="Partager la vue">
    <span class="material-symbols-outlined">share</span> Partager
  </button>
  <button title="Fermer" aria-label="Fermer le panneau"><span class="material-symbols-outlined">close</span></button>
  <p>Chargement du globe… <strong>patience</strong></p>
  <input placeholder="Rechercher une adresse" data-i18n-placeholder="search.placeholder">
  <img src="x.png" alt="Logo Surplomb">
  <span translate="no">Surplomb</span>
  <p>—</p>
  <template data-first-run-variant="A"><h2>Bienvenue</h2></template>
</body></html>`;
  const { count: n, findings } = scanHtml(html);
  assert.deepEqual(findings.map((f) => f.text), [
    'Aucun angle mort.',
    '[title] Fermer',
    '[aria-label] Fermer le panneau',
    'Chargement du globe…',
    'patience',
    '[alt] Logo Surplomb',
    'Bienvenue',
  ]);
  assert.equal(n, 7);
  assert.equal(findings[1].line, 11, 'comments keep their lines');
});

test('a <br> does not split a message, and a one-language element has nothing to translate', () => {
  const items = [];
  walkHtml(`<h1 data-i18n="hero.title">La France <br />au rayon X.</h1>
<p data-locale-only="en" lang="en">Built on <a href="#">God’s Eye View</a>.</p>`, (item) => items.push(item));
  assert.deepEqual(items.map((item) => [item.text, item.key]), [['La France au rayon X.', 'hero.title']]);
});

test('the baseline only ever goes down', () => {
  const baseline = { R1: { 'a.js': 3, 'b.js': 1 }, R2: {}, R3: { 'index.html': 5 }, R4: {}, R5: {} };
  const lower = { R1: { 'a.js': 2 }, R2: {}, R3: { 'index.html': 5 }, R4: {}, R5: {} };
  const higher = { R1: { 'a.js': 3, 'c.js': 1 }, R2: {}, R3: { 'index.html': 5 }, R4: {}, R5: {} };
  assert.deepEqual(compareToBaseline(lower, baseline).increases, []);
  assert.deepEqual(compareToBaseline(lower, baseline).decreases.map((d) => `${d.rule} ${d.file}`), ['R1 a.js', 'R1 b.js']);
  assert.deepEqual(compareToBaseline(higher, baseline).increases, [{ rule: 'R1', file: 'c.js', baseline: 0, now: 1 }]);
  assert.deepEqual(tightenBaseline(lower, baseline).R1, { 'a.js': 2 });
  assert.throws(() => tightenBaseline(higher, baseline), /went UP[\s\S]*R1 c\.js: 0 → 1/);
  const rendered = JSON.parse(renderBaseline(lower));
  assert.deepEqual(Object.keys(rendered), ['about', 'totals', ...RULE_IDS]);
  assert.deepEqual(rendered.totals, { R1: 2, R2: 0, R3: 5, R4: 0, R5: 0 });
});
