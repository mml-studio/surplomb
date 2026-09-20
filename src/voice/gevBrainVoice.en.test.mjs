// The keyless mic's diagnoses, in English.
//
// Every one of these is a failure explained to the person it just happened to,
// and until this batch they were English on the French globe and English on
// the English one — which looked right by accident on one page and wrong on
// the other the moment the rest of the interface was translated. The French is
// now the product's own; these assertions hold the English side.
import assert from 'node:assert/strict';
import test from 'node:test';

import { assertNoFrench, useTestLocale } from '../i18n/testing.js';
import {
  GevBrainVoiceSession,
  describeRecognitionError,
  describeUnreachableConfig,
  describeVoiceUpgradeHint,
  fetchVoiceConfig,
} from './gevBrainVoice.js';

const MAC_SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15';

test('a refused microphone says what to do, in English', (t) => {
  useTestLocale('en', t);
  const denied = describeRecognitionError('not-allowed');
  assert.equal(denied.message, 'Microphone permission was denied');
  assert.equal(denied.hint, 'Allow the microphone for this site, then click the mic again.');
  assert.equal(denied.fatal, true);
  assertNoFrench([denied.message, denied.hint]);
});

test('the Chromium-fork diagnosis keeps its claim in English', (t) => {
  useTestLocale('en', t);
  const network = describeRecognitionError('network');
  assert.doesNotMatch(network.message, /permission/i);
  // The claim this message exists to make: it is not the connection and not
  // the server. The browser names are names in both languages.
  assert.match(network.hint, /Not your connection and not this server/);
  assert.match(network.hint, /Arc/);
  assert.match(network.hint, /Chrome, Edge or Safari/);
  assertNoFrench([network.message, network.hint], { allow: ['Arc'] });
});

test('an unknown code still shows the code, and says it in English', (t) => {
  useTestLocale('en', t);
  const unknown = describeRecognitionError('some-new-code');
  assert.equal(unknown.message, 'Speech recognition failed: some-new-code');
  assert.equal(unknown.fatal, false);
  // A browser that sent no code at all still gets a sentence.
  assert.equal(describeRecognitionError(undefined).message, 'Speech recognition failed: unknown error');
});

test('the four unreachable-server lines all start by ruling out the mic', (t) => {
  useTestLocale('en', t);
  for (const status of [429, 401, 404, null]) {
    const hint = describeUnreachableConfig(status);
    assert.match(hint, /^Not the microphone/, `status ${status}`);
    assertNoFrench(hint);
  }
  assert.match(describeUnreachableConfig(429), /docs\/DEPLOY\.md/);
});

test('the macOS voice walk names the English menu path on an English page', (t) => {
  useTestLocale('en', t);
  const hint = describeVoiceUpgradeHint([{ name: 'Thomas', lang: 'fr-FR' }], 'fr-FR', { userAgent: MAC_SAFARI });
  assert.match(hint, /System Settings/);
  assert.match(hint, /Spoken Content/);
  assert.match(hint, /download Audrey or Amélie/);
});

test('French keeps its own words: the same failures, the reader’s language', () => {
  assert.equal(describeRecognitionError('not-allowed').message, 'L’autorisation du micro a été refusée');
  assert.match(describeUnreachableConfig(404), /^Pas le micro/);
  // And the menu path is the one a French macOS prints.
  assert.match(
    String(describeVoiceUpgradeHint([{ name: 'Thomas', lang: 'fr-FR' }], 'fr-FR', { userAgent: MAC_SAFARI })),
    /Réglages Système → Accessibilité → Contenu énoncé/,
  );
});

test('the page’s language travels with every request the mic makes', async (t) => {
  useTestLocale('en', t);
  // The server has no locale — no cookie, no Accept-Language, by design — so
  // the only way an English page gets an English voice is by saying so.
  const urls = [];
  await fetchVoiceConfig(async (url) => {
    urls.push(url);
    return { ok: true, json: async () => ({ provider: 'openrouter', language: 'en-US' }) };
  });
  assert.deepEqual(urls, ['/api/voice/config?lang=en']);

  let posted = null;
  const session = new GevBrainVoiceSession({
    host: { ui: {}, setStatus() {}, setVoiceSpeaker() {} },
    runner: async () => ({ ok: true }),
    config: { language: 'en-US', maxRounds: 1 },
    scope: { speechSynthesis: null },
    fetchImpl: async (url, init) => {
      posted = { url, body: JSON.parse(init.body) };
      return { ok: true, json: async () => ({ message: { content: 'ok' }, usage: { cost: 0 } }) };
    },
  });
  session.active = true;
  session.messages = [{ role: 'user', content: 'take me to Lyon' }];
  await session.relay();
  assert.equal(posted.url, '/api/voice/brain');
  assert.equal(posted.body.locale, 'en');
});
