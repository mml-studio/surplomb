// "Around me", when there is no fix. Every message has to name the next move
// in English too, because the failure it explains most often — a denied
// permission on Safari — is one the reader cannot undo from this page.
import test from 'node:test';
import assert from 'node:assert/strict';
import { geolocateErrorMessage } from './geolocate.js';
import { assertNoFrench, useTestLocale, withLocale } from './i18n/testing.js';

useTestLocale('en');

test('each refusal says what happened and where to go next', () => {
  assert.equal(geolocateErrorMessage(null, false), 'Locating needs a secure connection (https)');
  assert.equal(geolocateErrorMessage({ code: 1 }), 'Location denied — allow it in your browser settings');
  assert.equal(geolocateErrorMessage({ code: 2 }), 'Location unavailable right now');
  assert.equal(geolocateErrorMessage({ code: 3 }), 'The fix is taking too long to arrive');
  assert.equal(geolocateErrorMessage({}), 'Location unavailable right now', 'an unrecognized code');
  for (const error of [null, { code: 1 }, { code: 2 }, { code: 3 }, {}]) {
    assertNoFrench(geolocateErrorMessage(error));
  }
});

test('the French is the one the button has always shown', () => {
  assert.equal(withLocale('fr', () => geolocateErrorMessage({ code: 1 })),
    'Position refusée — autorisez la localisation dans les réglages du navigateur');
  assert.equal(withLocale('fr', () => geolocateErrorMessage(null, false)),
    'La localisation nécessite une connexion sécurisée (https)');
});
