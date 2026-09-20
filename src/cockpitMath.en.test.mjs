// The cockpit's Context scope readout in English. Its French is pinned,
// untouched, by `cockpitMath.test.mjs`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCockpitContextScope } from './cockpitMath.js';
import awarenessMessages from './data/militaryAwareness.i18n.js';
import { assertNoFrench, useTestLocale, withLocale } from './i18n/testing.js';

useTestLocale('en');

test('the scope names the subject, the radius and the air/sea window', () => {
  assert.equal(
    formatCockpitContextScope('TEST123', 250000),
    'TEST123 · 250 KM AIR/SEA WINDOW',
  );
  // English puts the measurement before the noun and French after it, which is
  // why the whole line is one message rather than three fragments.
  assert.equal(
    withLocale('fr', () => formatCockpitContextScope('TEST123', 250000)),
    'TEST123 · FENÊTRE AIR/MER 250 KM',
  );
});

test('the installations hedge reads in the reader’s language, both halves of it', () => {
  // Half a translated sentence — an English hedge inside a French line — is
  // why B4b left this alone. The frame and the coverage move together.
  const coverage = awarenessMessages().installationCoverage;
  assert.equal(coverage, 'CURRENT VIEWPORT ONLY');
  assert.equal(
    formatCockpitContextScope('TEST123', 250000, coverage),
    'TEST123 · 250 KM AIR/SEA WINDOW · INSTALLATIONS CURRENT VIEWPORT ONLY',
  );
  assert.equal(
    withLocale('fr', () => formatCockpitContextScope(
      'TEST123', 250000, awarenessMessages('fr').installationCoverage,
    )),
    'TEST123 · FENÊTRE AIR/MER 250 KM · INSTALLATIONS VUE ACTUELLE UNIQUEMENT',
  );
});

test('a missing subject or radius still reads as English', () => {
  assert.equal(formatCockpitContextScope('', 0), '— · 0 KM AIR/SEA WINDOW');
  assert.equal(
    formatCockpitContextScope(undefined, Number.NaN, {}),
    '— · — KM AIR/SEA WINDOW',
  );
  assertNoFrench(formatCockpitContextScope('TEST123', 250000, 'CURRENT VIEWPORT ONLY'));
});
