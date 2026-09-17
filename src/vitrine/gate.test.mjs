// The showcase gate: which door each of the two addresses opens.
//
// Two copies of one decision, on purpose (see src/vitrine/gate.js): the inline
// head script in index.html paints the right surface first, this module
// answers the entry script. The copy is RUN here over the same matrix, so a
// clause that drifts fails `npm test` instead of a first visit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  APP_PATH,
  RETIRED_SEEN_KEY,
  VITRINE_SKIP_GLOBAL,
  applyVitrineDecision,
  decideVitrine,
  forgetVitrineSeen,
  isAppPath,
  isVitrineActive,
  readVitrineSignals,
} from './gate.js';

const INDEX_HTML = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

/** Every address shape the two doors meet, crossed with the QA flag. */
const PATHS = ['/', '/globe', '/globe/', '/globes'];
const SEARCHES = ['', '?q=Lyon', '?q=', '?waitlist=1', '?welcome=0', '?welcome=b', '?vitrine=1', '?vitrine=0', '?input=phone', '?perf=lite'];
const HASHES = ['', '#v=2&lat=48.8&lon=2.3', '#haut', '#contenu', '#lat=1&lon=2', '#'];

function* matrix() {
  for (const path of PATHS) {
    for (const search of SEARCHES) {
      for (const hash of HASHES) {
        for (const skip of [false, true]) yield { path, search, hash, skip };
      }
    }
  }
}

test('the rule, case by case', () => {
  const door = (signals) => {
    const { vitrine, reason } = decideVitrine(signals);
    return `${vitrine ? 'vitrine' : 'cockpit'}:${reason}`;
  };
  assert.equal(door({}), 'vitrine:home');
  assert.equal(door({ hash: '#v=2&lat=48.8&lon=2.3' }), 'cockpit:share');
  // In-page anchors are not share links: a reload after following one keeps
  // a first visitor on the showcase.
  assert.equal(door({ hash: '#haut' }), 'vitrine:home');
  assert.equal(door({ search: '?q=Lyon' }), 'cockpit:query');
  // An empty field is still the form: the initial view, in the cockpit.
  assert.equal(door({ search: '?q=' }), 'cockpit:query');
  assert.equal(door({ search: '?waitlist=1' }), 'cockpit:link');
  assert.equal(door({ search: '?welcome=b' }), 'cockpit:link');
  assert.equal(door({ skip: true }), 'cockpit:qa');
  // The two forcing values outrank everything, the QA flag included.
  assert.equal(door({ search: '?vitrine=1', hash: '#v=2&lat=1&lon=2', skip: true }), 'vitrine:forced');
  assert.equal(door({ search: '?vitrine=0' }), 'cockpit:forced');
  // Unrelated parameters change nothing.
  assert.equal(door({ search: '?input=phone' }), 'vitrine:home');

  // The globe's own address, the second of the two URLs. It outranks the
  // remembered fact and the QA flag, and a trailing slash is the same address.
  assert.equal(door({ path: APP_PATH }), 'cockpit:app-path');
  assert.equal(door({ path: '/globe/' }), 'cockpit:app-path');
  assert.equal(door({ path: APP_PATH, skip: true }), 'cockpit:app-path');
  assert.equal(door({ path: APP_PATH, hash: '#v=2&lat=1&lon=2' }), 'cockpit:app-path');
  // `?vitrine=1` still outranks it: a demo may show the brochure from there.
  assert.equal(door({ path: APP_PATH, search: '?vitrine=1' }), 'vitrine:forced');
  // Nothing else is the globe's address — the SPA fallback answers every path
  // with this document, and only `/globe` means the cockpit.
  assert.equal(door({ path: '/globes' }), 'vitrine:home');
  assert.equal(door({ path: '/mentions-legales' }), 'vitrine:home');
  assert.equal(isAppPath('/globe//'), true);
  assert.equal(isAppPath(''), false);
});

test('the home page is never lost — no storage can take `/` away', () => {
  // The bug #259 left behind: a browser that had opened the globe got the
  // cockpit at `/` forever, whatever it typed. The decision reads the ADDRESS
  // and one window flag, and nothing else, so no stored value can do that.
  const hostile = {
    getItem: () => '1',
    setItem() { throw new Error('denied'); },
    removeItem() { throw new Error('denied'); },
  };
  const signals = readVitrineSignals({
    location: { pathname: '/', search: '', hash: '' },
    windowRef: { localStorage: hostile },
  });
  assert.deepEqual(signals, { path: '/', search: '', hash: '', skip: false });
  assert.equal(decideVitrine(signals).vitrine, true);
  // A stored value is not even a signal any more: an extra key is ignored.
  assert.equal(decideVitrine({ ...signals, seen: true }).vitrine, true);
});

test('the address is read, and a missing one is the root', () => {
  assert.equal(readVitrineSignals({ location: { pathname: APP_PATH }, windowRef: {} }).path, APP_PATH);
  assert.equal(readVitrineSignals({ location: {}, windowRef: {} }).path, '/');
  assert.equal(readVitrineSignals({ location: {}, windowRef: { [VITRINE_SKIP_GLOBAL]: true } }).skip, true);
});

test('the retired key is dropped, best-effort', () => {
  const map = new Map([[RETIRED_SEEN_KEY, '1'], ['gev:perf-profile', 'lite']]);
  const store = { removeItem: (k) => map.delete(k) };
  assert.equal(forgetVitrineSeen(store), true);
  assert.equal(map.has(RETIRED_SEEN_KEY), false);
  // And only that key.
  assert.equal(map.get('gev:perf-profile'), 'lite');
  assert.equal(forgetVitrineSeen({ removeItem() { throw new Error('denied'); } }), false);
  assert.equal(forgetVitrineSeen(null), false);
});

test('the attribute is present or absent, never empty-for-false', () => {
  const attrs = new Map();
  const root = {
    setAttribute: (k, v) => attrs.set(k, v),
    removeAttribute: (k) => attrs.delete(k),
    hasAttribute: (k) => attrs.has(k),
  };
  applyVitrineDecision({ vitrine: true }, root);
  assert.equal(isVitrineActive(root), true);
  applyVitrineDecision({ vitrine: false }, root);
  assert.equal(isVitrineActive(root), false);
});

/** The inline copy, extracted from index.html as it ships. */
function inlineGateScript() {
  const match = INDEX_HTML.match(/<script>\s*\/\* vitrine-gate \*\/\s*\(function \(\) \{([\s\S]*?)\}\)\(\);\s*<\/script>/);
  assert.ok(match, 'the inline vitrine gate is gone from index.html');
  return match[1];
}

test('the inline head script answers exactly what the module answers', () => {
  const run = new Function('location', 'window', 'document', inlineGateScript());
  let cases = 0;
  for (const signals of matrix()) {
    const attrs = new Map();
    // A poisoned store: the inline copy must not read it either.
    const windowRef = {
      localStorage: { getItem: () => '1' },
      ...(signals.skip ? { [VITRINE_SKIP_GLOBAL]: true } : {}),
    };
    run(
      { pathname: signals.path, search: signals.search, hash: signals.hash },
      windowRef,
      { documentElement: { setAttribute: (k, v) => attrs.set(k, v), removeAttribute: (k) => attrs.delete(k) } },
    );
    const expected = decideVitrine(signals).vitrine;
    assert.equal(attrs.has('data-vitrine'), expected, `inline gate disagrees for ${JSON.stringify(signals)}`);
    // The module's reader, fed the same globals, sees the same signals.
    assert.deepEqual(
      readVitrineSignals({
        location: { pathname: signals.path, search: signals.search, hash: signals.hash },
        windowRef,
      }),
      signals,
    );
    cases += 1;
  }
  assert.equal(cases, PATHS.length * SEARCHES.length * HASHES.length * 2);
});

test('the inline copy uses the module constants, not look-alikes', () => {
  const body = inlineGateScript();
  assert.ok(body.includes(`window.${VITRINE_SKIP_GLOBAL}`), 'QA flag drifted');
  assert.ok(body.includes(`'${APP_PATH}'`), 'the app path drifted');
  // And it reads NO storage: that is what made `/` unreachable before #260.
  assert.doesNotMatch(body, /localStorage|sessionStorage/, 'the inline gate reads storage again');
});

test('the gate runs before the stylesheets that read it, and a hostile storage is nothing to it', () => {
  const gate = INDEX_HTML.indexOf('/* vitrine-gate */');
  const stylesheet = INDEX_HTML.indexOf('<link rel="stylesheet" href="/style.css"');
  assert.ok(gate > 0 && stylesheet > 0 && gate < stylesheet);
  const run = new Function('location', 'window', 'document', inlineGateScript());
  const attrs = new Map();
  run(
    { pathname: '/', search: '', hash: '' },
    { get localStorage() { throw new Error('SecurityError'); } },
    { documentElement: { setAttribute: (k, v) => attrs.set(k, v), removeAttribute: (k) => attrs.delete(k) } },
  );
  assert.equal(attrs.has('data-vitrine'), true);
});

test('the page enters through the switch, not through the cockpit', () => {
  assert.match(INDEX_HTML, /<script type="module" src="\/src\/boot\.js"><\/script>/);
  assert.doesNotMatch(INDEX_HTML, /<script type="module" src="\/src\/main\.js">/);
  const boot = readFileSync(new URL('../boot.js', import.meta.url), 'utf8');
  // No static import of the cockpit or of Cesium from the entry.
  assert.doesNotMatch(boot, /^import .*(main\.js|cesium)/m);
  assert.match(boot, /import\('\.\/main\.js'\)/);
  const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
  assert.doesNotMatch(main, /^init\(\);?$/m, 'main.js must not start itself on import any more');
  assert.match(main, /export function startCockpit\(/);
});
