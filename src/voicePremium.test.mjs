// The premium mark on the mic. It must appear only where voice is sold, say
// what the trial holds, survive the panel being rebuilt, and never throw at
// boot — a missing crown costs nothing, a broken boot costs the visit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PREMIUM_CROWN_SVG,
  applyVoicePremium,
  currentVoicePremium,
  loadVoicePremium,
  markVoicePremiumSpent,
  voicePremiumFromTrial,
  voicePremiumText,
} from './voicePremium.js';

function fakeDocument() {
  const line = { textContent: '' };
  return {
    line,
    documentElement: { dataset: {} },
    querySelector: (selector) => (selector === '.gev-voice-help-premium' ? line : null),
  };
}

const trialBody = (overrides = {}) => ({
  enabled: true,
  limit: 5,
  used: 0,
  remaining: 5,
  voice: { limit: 3, used: 0, remaining: 3 },
  waitlist: null,
  ...overrides,
});

test('the crown is Google’s path in Google’s box, and hidden from assistive tech', () => {
  assert.match(PREMIUM_CROWN_SVG, /viewBox="0 -960 960 960"/);
  assert.match(PREMIUM_CROWN_SVG, /aria-hidden="true"/);
  assert.match(PREMIUM_CROWN_SVG, /<path d="M200-160v-80h560v80H200Z/);
});

test('no mark where the voice is not sold', () => {
  for (const body of [null, 'x', {}, { enabled: false, voice: null }, trialBody({ voice: null })]) {
    assert.equal(voicePremiumFromTrial(body), null, JSON.stringify(body));
  }
});

test('the mark follows the trial: open, spent, or never offered', () => {
  assert.deepEqual(voicePremiumFromTrial(trialBody()), { state: 'trial', turns: 3 });
  assert.deepEqual(voicePremiumFromTrial(trialBody({ voice: { limit: 3, used: 3, remaining: 0 } })),
    { state: 'spent', turns: 3 });
  // Every try went on summaries: the voice trial can no longer open.
  assert.deepEqual(voicePremiumFromTrial(trialBody({ used: 5, remaining: 0 })), { state: 'spent', turns: 3 });
  // Already open on the text brain, which counts one request at a time.
  assert.deepEqual(voicePremiumFromTrial(trialBody({ remaining: 0, voice: { limit: 3, used: 1, remaining: 2 } })),
    { state: 'trial', turns: 3 });
  assert.deepEqual(voicePremiumFromTrial(trialBody({ voice: { limit: 0, used: 0, remaining: 0 } })),
    { state: 'closed', turns: 0 });
});

test('the help tray says what the trial holds', () => {
  assert.equal(voicePremiumText('trial', 3), 'Fonction premium · 3 commandes vocales offertes');
  assert.equal(voicePremiumText('trial', 1), 'Fonction premium · 1 commande vocale offerte');
  assert.equal(voicePremiumText('spent', 3), 'Fonction premium · commandes offertes utilisées');
  assert.equal(voicePremiumText('closed'), 'Fonction premium · disponible à l’ouverture');
  for (const state of ['trial', 'spent', 'closed']) {
    assert.doesNotMatch(voicePremiumText(state, 3), /demande/, 'the word the owner asked to drop (2026-09-17)');
  }
  assert.equal(voicePremiumText(null), '');
});

test('the mark lives on <html>, so a rebuilt panel reads it back', () => {
  const doc = fakeDocument();
  applyVoicePremium({ state: 'trial', turns: 3 }, doc);
  assert.deepEqual(doc.documentElement.dataset, { voicePremium: 'trial', voicePremiumTurns: '3' });
  assert.equal(doc.line.textContent, 'Fonction premium · 3 commandes vocales offertes');
  assert.deepEqual(currentVoicePremium(doc), { state: 'trial', turns: 3 });

  markVoicePremiumSpent(doc);
  assert.equal(doc.documentElement.dataset.voicePremium, 'spent');
  assert.equal(doc.line.textContent, 'Fonction premium · commandes offertes utilisées');

  applyVoicePremium(null, doc);
  assert.deepEqual(doc.documentElement.dataset, {});
  assert.equal(doc.line.textContent, '');
  assert.equal(currentVoicePremium(doc), null);
});

test('spending the trial on a clone marks nothing', () => {
  const doc = fakeDocument();
  markVoicePremiumSpent(doc);
  assert.deepEqual(doc.documentElement.dataset, {});
  const closed = fakeDocument();
  applyVoicePremium({ state: 'closed', turns: 0 }, closed);
  markVoicePremiumSpent(closed);
  assert.equal(closed.documentElement.dataset.voicePremium, 'closed', 'never offered is not spent');
});

test('the boot lookup marks the mic, and swallows every failure', async () => {
  const doc = fakeDocument();
  const ok = async (url) => {
    assert.equal(url, '/api/trial');
    return new Response(JSON.stringify(trialBody()), { status: 200 });
  };
  assert.deepEqual(await loadVoicePremium({ fetchImpl: ok, doc }), { state: 'trial', turns: 3 });
  assert.equal(doc.documentElement.dataset.voicePremium, 'trial');

  for (const fetchImpl of [
    async () => { throw new TypeError('offline'); },
    async () => new Response('nope', { status: 404 }),
    async () => new Response('not json', { status: 200 }),
  ]) {
    const quiet = fakeDocument();
    assert.equal(await loadVoicePremium({ fetchImpl, doc: quiet }), null);
    assert.deepEqual(quiet.documentElement.dataset, {});
  }
});

test('a trial spent before the lookup answered is not re-opened by it', async () => {
  const doc = fakeDocument();
  applyVoicePremium({ state: 'spent', turns: 3 }, doc);
  const stale = async () => new Response(JSON.stringify(trialBody()), { status: 200 });
  await loadVoicePremium({ fetchImpl: stale, doc });
  assert.equal(doc.documentElement.dataset.voicePremium, 'spent');
});
