import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  FIRST_RUN_OPTOUT_KEY,
  firstRunMeasureRefused,
  setFirstRunMeasureRefused,
  wireFirstRunOptOut,
} from './firstRunOptOut.js';

function memoryStorage() {
  const values = new Map();
  return {
    values,
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function fakePage() {
  const listeners = [];
  const button = {
    textContent: '',
    hidden: false,
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(type, handler) { listeners.push(handler); },
    click() { for (const handler of listeners) handler(); },
  };
  const status = { textContent: '' };
  const doc = {
    querySelector: (selector) => ({
      '[data-first-run-optout]': button,
      '[data-first-run-optout-status]': status,
    })[selector] || null,
  };
  return { doc, button, status };
}

test('a refusal is one stored key, and it can be withdrawn', () => {
  const storage = memoryStorage();
  const nav = {};
  assert.equal(firstRunMeasureRefused({ storage, nav }), false);
  assert.equal(setFirstRunMeasureRefused(true, storage), true);
  assert.equal(storage.values.get(FIRST_RUN_OPTOUT_KEY), 'refused');
  assert.equal(firstRunMeasureRefused({ storage, nav }), true);
  assert.equal(setFirstRunMeasureRefused(false, storage), true);
  assert.equal(firstRunMeasureRefused({ storage, nav }), false);
});

test('Global Privacy Control refuses without a click', () => {
  assert.equal(firstRunMeasureRefused({ storage: memoryStorage(), nav: { globalPrivacyControl: true } }), true);
  assert.equal(firstRunMeasureRefused({ storage: memoryStorage(), nav: { globalPrivacyControl: false } }), false);
});

test('blocked storage never throws, and a refused write is reported', () => {
  const blocked = {
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('blocked'); },
    removeItem: () => { throw new Error('blocked'); },
  };
  assert.equal(firstRunMeasureRefused({ storage: blocked, nav: {} }), false);
  assert.equal(setFirstRunMeasureRefused(true, blocked), false);
  assert.equal(setFirstRunMeasureRefused(true, null), false);
});

test('the privacy page button says where the browser stands, and flips it', () => {
  const storage = memoryStorage();
  const { doc, button, status } = fakePage();
  assert.equal(wireFirstRunOptOut(doc, { storage, nav: {} }), true);
  assert.equal(button.textContent, 'Ne pas être mesuré');
  assert.equal(button.attributes['aria-pressed'], 'false');
  assert.equal(status.textContent, 'Ce navigateur peut être mesuré.');
  button.click();
  assert.equal(storage.values.get(FIRST_RUN_OPTOUT_KEY), 'refused');
  assert.equal(button.textContent, 'Accepter d’être mesuré');
  assert.equal(status.textContent, 'Ce navigateur n’est pas mesuré.');
  button.click();
  assert.equal(storage.values.has(FIRST_RUN_OPTOUT_KEY), false);

  const gpc = fakePage();
  wireFirstRunOptOut(gpc.doc, { storage: memoryStorage(), nav: { globalPrivacyControl: true } });
  assert.equal(gpc.button.hidden, true, 'nothing to click: the signal already refuses');
  assert.match(gpc.status.textContent, /Global Privacy Control/);

  assert.equal(wireFirstRunOptOut({ querySelector: () => null }, { storage, nav: {} }), false);
});

test('the privacy page loads the opt-out, and only the A/B sections offer it', () => {
  const html = fs.readFileSync(new URL('../confidentialite.html', import.meta.url), 'utf8');
  assert.match(html, /<script type="module" src="\/src\/firstRunOptOutPage\.js"><\/script>/);
  const button = html.indexOf('data-first-run-optout');
  const open = html.lastIndexOf('<!--gev:if:abtest-->', button);
  const close = html.indexOf('<!--/gev:if:abtest-->', open);
  assert.ok(open > 0 && button < close, 'the button lives inside an abtest section');
  // The page entry imports nothing of the globe.
  const entry = fs.readFileSync(new URL('./firstRunOptOutPage.js', import.meta.url), 'utf8');
  assert.deepEqual([...entry.matchAll(/from '([^']+)'/g)].map((m) => m[1]), ['./firstRunOptOut.js']);
  const module = fs.readFileSync(new URL('./firstRunOptOut.js', import.meta.url), 'utf8');
  // The module may reach for its own catalog and nothing else: the privacy
  // page must never pull a byte of the globe, and a catalog costs the two
  // files of the i18n layer.
  assert.deepEqual([...module.matchAll(/from '([^']+)'/g)].map((m) => m[1]), ['./firstRunOptOut.i18n.js']);
  const catalog = fs.readFileSync(new URL('./firstRunOptOut.i18n.js', import.meta.url), 'utf8');
  assert.deepEqual([...catalog.matchAll(/from '([^']+)'/g)].map((m) => m[1]), ['./i18n/messages.js']);
});
