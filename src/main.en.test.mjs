// The loading veil, in English: the eight lines a boot can print, through the
// real catalog rather than through a copy of it.
import test from 'node:test';
import assert from 'node:assert/strict';

import mainMessages from './main.i18n.js';
import bootMessages from './boot.i18n.js';
import { assertNoFrench, useTestLocale } from './i18n/testing.js';

test('an English boot reads its progress in English', (t) => {
  useTestLocale('en', t);
  const m = mainMessages();
  assert.equal(m.configuring, 'Configuring viewer…');
  assert.equal(m.systems, 'Initializing systems…');
  assert.equal(m.flyingTo('Paris'), 'Flying to Paris…');
  assert.equal(m.restoringShared, 'Restoring shared view…');
  assert.equal(m.error('WebGL is not available'), 'Error: WebGL is not available');
  assertNoFrench([m.configuring, m.photorealOff, m.keyless, m.photoreal, m.photorealViaIon,
    m.systems, m.flyingTo('Paris'), m.restoringShared, m.error('WebGL is not available')]);
});

test('and a French boot reads it in French — one module, two languages', () => {
  const m = mainMessages('fr');
  assert.equal(m.configuring, 'Configuration du globe…');
  assert.equal(m.flyingTo('Paris'), 'Vol vers Paris…');
});

test('the entry chunk says in both languages that the globe did not load', (t) => {
  assert.equal(bootMessages('fr').failure, 'Le globe n’a pas pu se charger. Rechargez la page.');
  useTestLocale('en', t);
  assert.equal(bootMessages().failure, 'The globe could not load. Reload the page.');
  assertNoFrench(bootMessages().failure);
});
