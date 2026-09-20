// The two legal links, in English — and the one thing that must NOT change
// with the language: where they point.
//
// The pages are French and the French text governs (CONTRIBUTING.md,
// "Language"), so an English reader gets English labels on the same two
// French documents. A future batch that "finished the job" by translating the
// hrefs would break that, and this test is the guard.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LEGAL_LINKS, legalLinksMarkup } from './legalLinks.js';
import { assertNoFrench, useTestLocale, withLocale } from './i18n/testing.js';

useTestLocale('en');

test('the labels are English, and the pages behind them are the French ones', () => {
  assert.deepEqual(LEGAL_LINKS.map(({ label }) => label), ['Legal notice', 'Privacy']);
  assertNoFrench(LEGAL_LINKS.map(({ label }) => label));
  assert.deepEqual(LEGAL_LINKS.map(({ href }) => href), ['/mentions-legales', '/confidentialite']);
  assert.deepEqual(
    withLocale('fr', () => LEGAL_LINKS.map(({ href }) => href)),
    ['/mentions-legales', '/confidentialite'],
    'the same two documents in both languages',
  );
});

test('the credit line carries them in the reader’s language', () => {
  const english = legalLinksMarkup();
  assert.match(english, /<a href="\/mentions-legales" target="_blank" rel="noopener">Legal notice<\/a>/);
  assert.match(english, /<a href="\/confidentialite" target="_blank" rel="noopener">Privacy<\/a>/);
  assert.match(english, / • /, 'the separator the credit line has always used');

  const french = withLocale('fr', legalLinksMarkup);
  assert.match(french, />Mentions légales</);
  assert.match(french, />Confidentialité</);
});
