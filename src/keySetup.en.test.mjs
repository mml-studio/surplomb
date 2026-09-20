// The provider-key dialog in English, through the real DOM path: one row of
// the registry, rendered by the module itself, then read back.
import test from 'node:test';
import assert from 'node:assert/strict';

import { keySetupChipLabel } from './keySetup.js';
import messages, { KEY_UNLOCKS } from './keySetup.i18n.js';
import { labelFor } from './i18n/messages.js';
import { assertNoFrench, useTestLocale, withLocale } from './i18n/testing.js';

test('the chip says what is waiting, in English', (t) => {
  useTestLocale('en', t);
  assert.equal(keySetupChipLabel({ setCount: 6, total: 8 }), 'POWER UP · 2 KEYS WAITING');
  assert.equal(keySetupChipLabel({ setCount: 8, total: 8 }), 'POWERED UP');
  assertNoFrench([keySetupChipLabel({ setCount: 6, total: 8 }), keySetupChipLabel({ setCount: 8, total: 8 })]);
});

test('every sentence of the dialog has an English that makes the same claim', (t) => {
  useTestLocale('en', t);
  const m = messages();
  assert.equal(m.tierMetered, 'Metered — a billing-enabled account');
  assert.equal(m.browserSide, 'browser-side');
  assert.equal(m.getKey, 'GET KEY ↗');
  assert.equal(m.pastePlaceholder('TOMTOM_API_KEY'), 'paste TOMTOM_API_KEY');
  assert.equal(m.savedTo(m.storeEnv), 'Saved to your local .env. Restarting — this page reloads itself.');
  assert.equal(m.removedFrom(m.storeEnv), 'Removed from your local .env. Restarting — this page reloads itself.');
  assert.equal(m.pasteFirst, 'Paste at least one key first.');
  assertNoFrench(m, { allow: ['SECURITY.md'] });
});

test('what a key unlocks is relabelled from the server’s English, and stays raw when unknown', () => {
  // The registry runs in Node (vite.config.js imports it), so the payload is
  // always English; the browser is what makes it French.
  assert.equal(withLocale('fr', () => labelFor(KEY_UNLOCKS, 'tomtom')),
    'Le vrai trafic en direct (sans clé, c’est une simulation)');
  assert.equal(withLocale('en', () => labelFor(KEY_UNLOCKS, 'tomtom')), 'Real live traffic (keyless runs a simulation)');
  assert.equal(withLocale('en', () => labelFor(KEY_UNLOCKS, 'a-key-shipped-after-this-table')),
    'a-key-shipped-after-this-table', 'an unknown id is not an empty line');
});

test('and the French is what a French reader still gets', () => {
  assert.equal(keySetupChipLabel({ setCount: 7, total: 8 }), 'PUISSANCE · 1 CLÉ EN ATTENTE');
  assert.equal(messages('fr').saving, 'Enregistrement…');
});
