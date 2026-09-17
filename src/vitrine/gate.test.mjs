// The showcase gate: which door the bare root opens.
//
// Two copies of one decision, on purpose (see src/vitrine/gate.js): the inline
// head script in index.html paints the right surface first, this module
// answers the entry script. The copy is RUN here over the same matrix, so a
// clause that drifts fails `npm test` instead of a first visit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  VITRINE_SEEN_KEY,
  VITRINE_SKIP_GLOBAL,
  applyVitrineDecision,
  arrivalMarksSeen,
  decideVitrine,
  isVitrineActive,
  markVitrineSeen,
  readVitrineSignals,
} from './gate.js';

const INDEX_HTML = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

/** Every address shape the root meets, crossed with the two remembered facts. */
const SEARCHES = ['', '?q=Lyon', '?q=', '?waitlist=1', '?welcome=0', '?welcome=b', '?vitrine=1', '?vitrine=0', '?input=phone', '?perf=lite'];
const HASHES = ['', '#v=2&lat=48.8&lon=2.3', '#haut', '#contenu', '#lat=1&lon=2', '#'];

function* matrix() {
  for (const search of SEARCHES) {
    for (const hash of HASHES) {
      for (const seen of [false, true]) {
        for (const skip of [false, true]) yield { search, hash, seen, skip };
      }
    }
  }
}

test('the rule, case by case', () => {
  const door = (signals) => {
    const { vitrine, reason } = decideVitrine(signals);
    return `${vitrine ? 'vitrine' : 'cockpit'}:${reason}`;
  };
  assert.equal(door({}), 'vitrine:first-visit');
  assert.equal(door({ hash: '#v=2&lat=48.8&lon=2.3' }), 'cockpit:share');
  // In-page anchors are not share links: a reload after following one keeps
  // a first visitor on the showcase.
  assert.equal(door({ hash: '#haut' }), 'vitrine:first-visit');
  assert.equal(door({ search: '?q=Lyon' }), 'cockpit:query');
  // An empty field is still the form: the initial view, in the cockpit.
  assert.equal(door({ search: '?q=' }), 'cockpit:query');
  assert.equal(door({ search: '?waitlist=1' }), 'cockpit:link');
  assert.equal(door({ search: '?welcome=b' }), 'cockpit:link');
  assert.equal(door({ seen: true }), 'cockpit:seen');
  assert.equal(door({ skip: true }), 'cockpit:qa');
  // The two forcing values outrank everything, the QA flag included.
  assert.equal(door({ search: '?vitrine=1', hash: '#v=2&lat=1&lon=2', seen: true, skip: true }), 'vitrine:forced');
  assert.equal(door({ search: '?vitrine=0' }), 'cockpit:forced');
  // Unrelated parameters change nothing.
  assert.equal(door({ search: '?input=phone' }), 'vitrine:first-visit');
});

test('only a real arrival marks the browser as having met the globe', () => {
  assert.equal(arrivalMarksSeen(decideVitrine({ hash: '#v=2&lat=1&lon=2' })), true);
  assert.equal(arrivalMarksSeen(decideVitrine({ search: '?q=Lyon' })), true);
  assert.equal(arrivalMarksSeen(decideVitrine({ search: '?waitlist=1' })), true);
  // A QA run, a forced demo and a returning reader leave nothing behind.
  assert.equal(arrivalMarksSeen(decideVitrine({ skip: true })), false);
  assert.equal(arrivalMarksSeen(decideVitrine({ search: '?vitrine=0' })), false);
  assert.equal(arrivalMarksSeen(decideVitrine({ seen: true })), false);
  assert.equal(arrivalMarksSeen(decideVitrine({})), false);
});

test('the memory is read and written best-effort', () => {
  const map = new Map();
  const store = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) };
  assert.equal(readVitrineSignals({ location: { search: '', hash: '' }, storage: store, windowRef: {} }).seen, false);
  assert.equal(markVitrineSeen(store), true);
  assert.equal(map.get(VITRINE_SEEN_KEY), '1');
  assert.equal(readVitrineSignals({ location: {}, storage: store, windowRef: {} }).seen, true);
  // Safari private mode throws on access: a first visit, not a crash.
  const hostile = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.equal(readVitrineSignals({ location: {}, storage: hostile, windowRef: {} }).seen, false);
  assert.equal(markVitrineSeen(hostile), false);
  assert.equal(readVitrineSignals({ location: {}, storage: null, windowRef: { [VITRINE_SKIP_GLOBAL]: true } }).skip, true);
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
    const local = new Map(signals.seen ? [[VITRINE_SEEN_KEY, '1']] : []);
    const windowRef = {
      localStorage: { getItem: (k) => local.get(k) ?? null },
      ...(signals.skip ? { [VITRINE_SKIP_GLOBAL]: true } : {}),
    };
    run(
      { search: signals.search, hash: signals.hash },
      windowRef,
      { documentElement: { setAttribute: (k, v) => attrs.set(k, v), removeAttribute: (k) => attrs.delete(k) } },
    );
    const expected = decideVitrine(signals).vitrine;
    assert.equal(attrs.has('data-vitrine'), expected, `inline gate disagrees for ${JSON.stringify(signals)}`);
    // The module's reader, fed the same globals, sees the same signals.
    assert.deepEqual(
      readVitrineSignals({ location: { search: signals.search, hash: signals.hash }, windowRef }),
      signals,
    );
    cases += 1;
  }
  assert.equal(cases, SEARCHES.length * HASHES.length * 4);
});

test('the inline copy uses the module constants, not look-alikes', () => {
  const body = inlineGateScript();
  assert.ok(body.includes(`'${VITRINE_SEEN_KEY}'`), 'storage key drifted');
  assert.ok(body.includes(`window.${VITRINE_SKIP_GLOBAL}`), 'QA flag drifted');
});

test('the gate runs before the stylesheets that read it, and a thrown storage is a first visit', () => {
  const gate = INDEX_HTML.indexOf('/* vitrine-gate */');
  const stylesheet = INDEX_HTML.indexOf('<link rel="stylesheet" href="/style.css"');
  assert.ok(gate > 0 && stylesheet > 0 && gate < stylesheet);
  const run = new Function('location', 'window', 'document', inlineGateScript());
  const attrs = new Map();
  run(
    { search: '', hash: '' },
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
