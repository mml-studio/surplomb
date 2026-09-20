import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serverFailureMessage, serverMessage } from './serverMessages.js';
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

test('the shipped catalog carries the codes the server actually sends', (t) => {
  // Filled by the voice-and-server batch, which is the one that gave
  // `vite.config.js` and `trialQuota.js` their codes. The French is the
  // server's own bytes where the server writes French, so a page that
  // resolves a code prints exactly what it printed when it read `error`.
  assert.equal(
    serverMessage({ code: 'filosofi-grid-unavailable', error: 'Le carroyage INSEE est temporairement indisponible' }),
    'Le carroyage INSEE est temporairement indisponible',
  );
  assert.equal(
    serverMessage({ code: 'peb-copy-stale', params: { days: 12 }, error: 'ignored' }),
    'La copie locale du registre des arrêtés PEB a 12 jours et l’amont ne répond pas.',
  );
  useTestLocale('en', t);
  assert.equal(
    serverMessage({ code: 'filosofi-grid-unavailable', error: 'Le carroyage INSEE est temporairement indisponible' }),
    'The INSEE income grid is temporarily unavailable',
  );
  assert.equal(
    serverMessage({ code: 'trial-exhausted', error: 'Essai terminé' }),
    'Trial over',
  );
  // A code nobody has catalogued still shows what the server wrote, which is
  // what lets a server ship a new code before a client knows it.
  assert.equal(serverMessage({ code: 'rate-limited', error: 'Trop de demandes' }), 'Trop de demandes');
  // Every key is a code some route really sends; `serverMessages.i18n.js`
  // says which, and why the rest of the server's ~250 errors have none.
  assert.ok(Object.keys(serverMessages.definition).length >= 20);
});

test('a failed response is read for its code before its status is quoted', async (t) => {
  const failed = (body, status = 503) => ({
    ok: false,
    status,
    json: async () => body,
  });
  assert.equal(
    await serverFailureMessage(failed({ code: 'filosofi-grid-unavailable', error: 'x' })),
    'Le carroyage INSEE est temporairement indisponible',
  );
  useTestLocale('en', t);
  assert.equal(
    await serverFailureMessage(failed({ code: 'filosofi-grid-unavailable', error: 'x' })),
    'The INSEE income grid is temporarily unavailable',
  );
  assert.equal(
    await serverFailureMessage(failed({ code: 'peb-copy-stale', params: { days: 12 } })),
    'The local copy of the PEB order register is 12 days old, and the source is not answering.',
  );
});

test('a failed response with nothing to read still says what happened', async () => {
  // The two shapes every outage test in this repository uses: a double with
  // no `json` at all, and a body that is not JSON. Both keep the HTTP line
  // these call sites printed before they were wired.
  assert.equal(await serverFailureMessage({ ok: false, status: 503 }), 'HTTP 503');
  assert.equal(
    await serverFailureMessage({ ok: false, status: 502, json: async () => { throw new Error('not json'); } }),
    'HTTP 502',
  );
  assert.equal(
    await serverFailureMessage({ ok: false, status: 500 }, { fallback: 'carroyage HTTP 500' }),
    'carroyage HTTP 500',
  );
  assert.equal(await serverFailureMessage(null), 'HTTP ???');
  // An uncatalogued code still shows the server's own words.
  assert.equal(
    await serverFailureMessage({ ok: false, status: 429, json: async () => ({ error: 'Trop de demandes' }) }),
    'Trop de demandes',
  );
});
