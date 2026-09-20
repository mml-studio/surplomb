// A lost 3D context, in English: the notice and the two buttons, through the
// module's own copy function.
import test from 'node:test';
import assert from 'node:assert/strict';

import { contextLossNotice } from './contextLoss.js';
import messages from './contextLoss.i18n.js';
import { staleBuildNotice } from './staleBuildRecovery.js';
import { assertNoFrench, useTestLocale } from './i18n/testing.js';

test('the English notice names the cause, then the cure', (t) => {
  useTestLocale('en', t);
  assert.equal(contextLossNotice({ plan: 'countdown', secondsLeft: 8 }),
    'The system interrupted the 3D view — reloading in 8 s.');
  assert.equal(contextLossNotice({ plan: 'manual' }),
    'The system interrupted the 3D view. Reload to bring it back.');
  assert.equal(messages().reload, 'RELOAD');
  assert.equal(messages().cancel, 'CANCEL');
  assertNoFrench([contextLossNotice({ plan: 'countdown', secondsLeft: 8 }), contextLossNotice({ plan: 'manual' }),
    messages().reload, messages().cancel]);
});

test('a layer whose code never arrived says so in English too', (t) => {
  useTestLocale('en', t);
  assert.equal(staleBuildNotice({ label: 'Public cameras', mode: 'manual' }),
    'Public cameras: code not loaded — reload the page');
  assert.equal(staleBuildNotice({ label: 'Public cameras', mode: 'auto', secondsLeft: 5 }),
    'Public cameras: code not loaded — reloading in 5 s');
  assert.equal(staleBuildNotice({ mode: 'auto', secondsLeft: 0 }), 'This layer: code not loaded — reloading…');
  assertNoFrench(staleBuildNotice({ label: 'Public cameras', mode: 'manual' }));
});

test('and the French is byte-for-byte the sentence the fork shipped', () => {
  assert.equal(contextLossNotice({ plan: 'countdown', secondsLeft: 8 }),
    'Le rendu 3D a été interrompu par le système — rechargement dans 8 s.');
  assert.equal(staleBuildNotice({ mode: 'manual' }), 'Cette couche : code non chargé — recharge la page');
});
