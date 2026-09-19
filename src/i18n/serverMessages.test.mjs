import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serverMessage } from './serverMessages.js';
import { defineMessages } from './messages.js';
import serverMessages from './serverMessages.i18n.js';
import { useTestLocale } from './testing.js';

const catalog = defineMessages({
  'rate-limited': { fr: 'Trop de demandes. Réessayez dans une minute.', en: 'Too many requests. Try again in a minute.' },
  'upstream-status': {
    fr: ({ status }) => `La source a répondu ${status}.`,
    en: ({ status }) => `The source answered ${status}.`,
    sample: [{ status: 502 }],
  },
});

test('a known code is spoken in the page’s language', (t) => {
  assert.equal(serverMessage({ code: 'rate-limited', error: 'x' }, { catalog }), 'Trop de demandes. Réessayez dans une minute.');
  useTestLocale('en', t);
  assert.equal(serverMessage({ code: 'rate-limited', error: 'x' }, { catalog }), 'Too many requests. Try again in a minute.');
  assert.equal(serverMessage({ code: 'upstream-status', params: { status: 502 } }, { catalog }), 'The source answered 502.');
  // Without `params`, a function message receives the payload itself.
  assert.equal(serverMessage({ code: 'upstream-status', status: 504 }, { catalog }), 'The source answered 504.');
});

test('an unknown code, or none, shows what the server wrote', () => {
  assert.equal(serverMessage({ code: 'brand-new', error: 'Erreur du serveur' }, { catalog }), 'Erreur du serveur');
  assert.equal(serverMessage({ error: 'Erreur du serveur' }, { catalog }), 'Erreur du serveur');
  assert.equal(serverMessage({ message: 'Message' }, { catalog }), 'Message');
  assert.equal(serverMessage({ code: 'toString', error: 'e' }, { catalog }), 'e', 'no prototype lookups');
});

test('nothing usable falls back to the caller’s line, never to “undefined”', () => {
  assert.equal(serverMessage(null, { catalog, fallback: 'Échec' }), 'Échec');
  assert.equal(serverMessage(undefined), '');
  assert.equal(serverMessage({ code: 42, error: '' }, { fallback: 'Échec' }), 'Échec');
});

test('the shipped catalog starts empty: the server gains codes in its own batch', () => {
  assert.deepEqual(Object.keys(serverMessages.definition), []);
  assert.equal(serverMessage({ code: 'rate-limited', error: 'Trop de demandes' }), 'Trop de demandes');
});
