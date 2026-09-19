import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOCALE_STORAGE_KEY } from './locale.js';
import { localeReloadHref, rememberLocale, switchLocale } from './switch.js';

function memoryStorage({ refuse = false } = {}) {
  const map = new Map();
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      if (refuse) throw new Error('QuotaExceededError');
      map.set(key, String(value));
    },
  };
}

/** A page double that records the order things happen in. */
function pageDouble(href, lang = 'fr') {
  const events = [];
  const location = {
    href,
    reload: () => events.push(['reload', location.href]),
  };
  const history = {
    state: { kept: true },
    replaceState: (state, _title, url) => {
      events.push(['replaceState', url, state]);
      location.href = url;
    },
  };
  const shareLink = {
    flushHash: () => {
      events.push(['flushHash']);
      const url = new URL(location.href);
      url.hash = 'v=2&lat=48.85&lon=2.35';
      location.href = url.href;
    },
  };
  const root = { getAttribute: () => lang };
  return { events, location, history, shareLink, root };
}

test('the choice is stored under gev:locale:v1, and a refusal is reported, not thrown', () => {
  const storage = memoryStorage();
  assert.equal(rememberLocale('EN-gb', storage), true);
  assert.equal(storage.map.get(LOCALE_STORAGE_KEY), 'en');
  assert.equal(rememberLocale('de', storage), false);
  assert.equal(rememberLocale('en', memoryStorage({ refuse: true })), false);
  assert.equal(rememberLocale('en', null), false);
});

test('?lang= leaves the address when storage holds the choice, and carries it when storage cannot', () => {
  assert.equal(localeReloadHref('https://surplomb.app/globe?lang=en&q=Lyon#v=2', 'fr', true),
    'https://surplomb.app/globe?q=Lyon#v=2');
  assert.equal(localeReloadHref('https://surplomb.app/globe#v=2', 'en', false),
    'https://surplomb.app/globe?lang=en#v=2');
  assert.equal(localeReloadHref('https://surplomb.app/globe?lang=fr#v=2', 'en', false),
    'https://surplomb.app/globe?lang=en#v=2');
});

test('switching stores, flushes the share hash, rewrites the address, then reloads — in that order', () => {
  const storage = memoryStorage();
  const page = pageDouble('https://surplomb.app/globe?lang=en#v=2&lat=1', 'en');
  assert.equal(switchLocale('fr', { storage, ...page }), true);
  assert.equal(storage.map.get(LOCALE_STORAGE_KEY), 'fr');
  assert.deepEqual(page.events.map(([name]) => name), ['flushHash', 'replaceState', 'reload']);
  // The reload lands on the FLUSHED hash, without the ?lang= that would undo the switch.
  assert.equal(page.events[2][1], 'https://surplomb.app/globe#v=2&lat=48.85&lon=2.35');
  assert.deepEqual(page.events[1][2], { kept: true }, 'history state is carried over');
});

test('private mode: the choice rides in ?lang= so this tab still switches', () => {
  const page = pageDouble('https://surplomb.app/globe#v=2', 'fr');
  assert.equal(switchLocale('en', { storage: memoryStorage({ refuse: true }), ...page }), true);
  assert.equal(page.events.at(-1)[1], 'https://surplomb.app/globe?lang=en#v=2&lat=48.85&lon=2.35');
});

test('nothing happens for the current locale or an unknown one', () => {
  const page = pageDouble('https://surplomb.app/globe', 'fr');
  assert.equal(switchLocale('fr', { storage: memoryStorage(), ...page }), false);
  assert.equal(switchLocale('de', { storage: memoryStorage(), ...page }), false);
  assert.deepEqual(page.events, []);
});

test('no share-link manager (the showcase) still switches', () => {
  const page = pageDouble('https://surplomb.app/', 'fr');
  assert.equal(switchLocale('en', { storage: memoryStorage(), ...page, shareLink: null }), true);
  assert.deepEqual(page.events.map(([name]) => name), ['reload']);
});
