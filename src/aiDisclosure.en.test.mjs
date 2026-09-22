// The « IA » mark in English: « AI », and sentences with no French left in
// them. A disclosure is only a disclosure in the reader's language — which is
// why the mark is not one of the cockpit's English instrument words.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { assertNoFrench, useTestLocale } from './i18n/testing.js';
import { aiBadgeHtml, aiDisclosureText } from './aiDisclosure.js';

test('the mark reads « AI », and says what it stands for in English', (t) => {
  useTestLocale('en', t);
  assert.equal(aiDisclosureText('voice'), 'Artificial intelligence assistant — synthetic voice');
  assert.equal(aiDisclosureText('summary'), 'Summary written by artificial intelligence (OpenAI)');
  const html = aiBadgeHtml('voice', { id: 'gev-voice-ai-badge' });
  assert.match(html, />AI<\/span>$/);
  assert.ok(html.includes('aria-label="Artificial intelligence assistant — synthetic voice"'), html);
  for (const surface of ['voice', 'summary']) assertNoFrench(aiDisclosureText(surface));
});

test('French keeps « IA »: the two languages differ on purpose', () => {
  assert.match(aiBadgeHtml('summary'), />IA<\/span>$/);
  assert.equal(aiDisclosureText('voice'), 'Assistant d’intelligence artificielle — voix de synthèse');
});
