// The FR/EN button: what it asks for, what it says, and what it never does
// on its own.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { LOCALE_SWITCH_ID, initLocaleSwitch, otherLocale } from './localeSwitch.js';
import markupMessages from './i18n/markup.i18n.js';
import { useTestLocale } from './i18n/testing.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function fakeButton() {
  const attrs = new Map();
  const listeners = new Map();
  return {
    dataset: {},
    attrs,
    listeners,
    setAttribute: (name, value) => attrs.set(name, String(value)),
    getAttribute: (name) => (attrs.has(name) ? attrs.get(name) : null),
    addEventListener: (type, handler) => listeners.set(type, handler),
    removeEventListener: (type) => listeners.delete(type),
    click: () => listeners.get('click')?.(),
  };
}

function fakeDocument(button, lang = 'fr') {
  return {
    documentElement: { getAttribute: (name) => (name === 'lang' ? lang : null) },
    getElementById: (id) => (id === LOCALE_SWITCH_ID ? button : null),
  };
}

test('the button asks for the language the page is not in', () => {
  assert.equal(otherLocale('fr'), 'en');
  assert.equal(otherLocale('en'), 'fr');
});

test('a French page switches to English, through switchLocale and nothing else', () => {
  const button = fakeButton();
  const calls = [];
  const shareLink = { flushHash: () => {} };
  const wired = initLocaleSwitch({
    documentRef: fakeDocument(button, 'fr'),
    shareLink,
    switchImpl: (...args) => { calls.push(args); return true; },
  });
  assert.ok(wired);
  // The label is announced in the language it names, or a screen reader says
  // « Français » with an English voice.
  assert.equal(button.getAttribute('lang'), 'en');
  button.click();
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'en');
  assert.equal(calls[0][1].shareLink, shareLink, 'the share hash is flushed before the reload');
  // Wiring twice must not double the click.
  assert.equal(initLocaleSwitch({ documentRef: fakeDocument(button, 'fr') }), null);
  wired.destroy();
  button.click();
  assert.equal(calls.length, 1, 'destroy removes the listener');
});

test('an English page switches back to French', () => {
  const button = fakeButton();
  const calls = [];
  initLocaleSwitch({
    documentRef: fakeDocument(button, 'en'),
    switchImpl: (locale) => { calls.push(locale); return true; },
  });
  assert.equal(button.getAttribute('lang'), 'fr');
  button.click();
  assert.deepEqual(calls, ['fr']);
});

test('without the markup there is nothing to wire, and nothing throws', () => {
  assert.equal(initLocaleSwitch({ documentRef: { getElementById: () => null } }), null);
  assert.equal(initLocaleSwitch({ documentRef: null }), null);
});

test('the markup ships the French page’s face and the catalog holds the English one', () => {
  const match = html.match(/<button id="locale-switch"[\s\S]*?<\/button>/);
  assert.ok(match, 'the language button is missing from index.html');
  assert.match(match[0], /type="button"/, 'a button, so it is reachable by keyboard and by Enter');
  assert.match(match[0], /aria-label="English — passer en anglais"/);
  assert.match(match[0], />EN<\/button>/);
  assert.equal(markupMessages('fr').localeSwitch.label, 'EN');
  assert.equal(markupMessages('en').localeSwitch.label, 'FR');
  assert.equal(markupMessages('en').localeSwitch.action, 'Français — switch to French');
  // It sits in the one column both shells show.
  const nav = html.match(/<nav id="top-center-actions"[\s\S]*?<\/nav>/);
  assert.ok(nav && nav[0].includes('id="locale-switch"'), 'the switch must live in the corner actions');
});

test('under Node the page is French, so the button offers English', (t) => {
  assert.equal(otherLocale(), 'en');
  useTestLocale('en', t);
  assert.equal(otherLocale(), 'fr');
});
