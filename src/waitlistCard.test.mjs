// The waitlist card. What matters is what Buttondown receives — the answer to
// the use question, the embed flag, the tag — that no price leaks onto the
// card, and that an automatic refusal does not reopen it on every HUD tick.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WAITLIST_AUTO_SHOWN_KEY,
  WAITLIST_USAGE_CHOICES,
  renderWaitlistCard,
  shouldOpenWaitlist,
  waitlistCopy,
} from './waitlistCard.js';
import { isTrialRefusalReason, requestWaitlistCard, trialRefusalFrom, WAITLIST_OPEN_EVENT } from './trialRefusal.js';

const trial = {
  limit: 5,
  waitlist: {
    action: 'https://buttondown.com/api/emails/embed-subscribe/surplomb',
  },
};

const attr = (html, name) => [...html.matchAll(new RegExp(`name="${name}" value="([^"]*)"`, 'g'))].map((m) => m[1]);

test('the form posts to Buttondown in a new tab, with the fields its embed endpoint reads', () => {
  const html = renderWaitlistCard({ reason: 'exhausted', trial });
  assert.match(html, /<form class="waitlist-form" action="https:\/\/buttondown\.com\/api\/emails\/embed-subscribe\/surplomb" method="post" target="_blank" rel="noopener">/);
  assert.match(html, /type="email" name="email" required/);
  assert.deepEqual(attr(html, 'embed'), ['1']);
  assert.deepEqual(attr(html, 'tag'), ['liste-attente']);
  assert.deepEqual(attr(html, 'metadata__declencheur'), ['exhausted']);
});

test('no price on the card: it belongs on the payment page (decision of 2026-09-17)', () => {
  for (const reason of ['exhausted', 'voice', 'direct']) {
    const html = renderWaitlistCard({ reason, trial });
    assert.doesNotMatch(html, /€|prix|waitlist-price/i, reason);
  }
});

test('the use question offers four answers and one of them is required', () => {
  const html = renderWaitlistCard({ reason: 'direct', trial });
  assert.deepEqual(attr(html, 'metadata__usage'), WAITLIST_USAGE_CHOICES.map((c) => c.value));
  assert.equal(WAITLIST_USAGE_CHOICES.length, 4);
  assert.equal((html.match(/name="metadata__usage"[^>]* required/g) || []).length, 1,
    'one required radio makes the whole group required');
});

test('without a configured waitlist the card explains itself and shows no form', () => {
  for (const waitlist of [null, { action: 'https://evil.example/collect' }]) {
    const html = renderWaitlistCard({ reason: 'exhausted', trial: { limit: 5, waitlist } });
    assert.doesNotMatch(html, /<form/);
    assert.match(html, /pas encore ouvertes/);
  }
});

test('a visitor who already joined sees the confirmation, not the form', () => {
  const html = renderWaitlistCard({ reason: 'exhausted', trial, joined: true });
  assert.match(html, /<form [^>]* hidden>/);
  assert.match(html, /<div class="waitlist-joined" role="status">/);
});

test('server-provided text is escaped', () => {
  const html = renderWaitlistCard({
    reason: 'exhausted',
    trial: { waitlist: { action: 'https://buttondown.com/x"><img src=x onerror=alert(1)>' } },
  });
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /x&quot;&gt;&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('each way in has its own title, and none promises a closed globe', () => {
  assert.equal(waitlistCopy('exhausted', { limit: 5 }).title, 'Essai terminé');
  assert.match(waitlistCopy('exhausted', { limit: 5 }).lede, /^Vos 5 essais/);
  assert.match(waitlistCopy('exhausted', {}).lede, /^Vos essais/);
  assert.equal(waitlistCopy('voice').title, 'La voix arrive à l’ouverture');
  assert.equal(waitlistCopy('direct').title, 'Liste d’attente');
  for (const reason of ['exhausted', 'voice']) {
    assert.match(waitlistCopy(reason, { limit: 5 }).lede, /restent ouverts, sans limite/);
  }
});

test('an automatic refusal opens the card once per tab; a click always does', () => {
  const store = new Map();
  const session = { getItem: (key) => store.get(key) ?? null };
  assert.equal(shouldOpenWaitlist({ reason: 'exhausted' }, session), true);
  store.set(WAITLIST_AUTO_SHOWN_KEY, '1');
  assert.equal(shouldOpenWaitlist({ reason: 'exhausted' }, session), false);
  assert.equal(shouldOpenWaitlist({ reason: 'voice', explicit: true }, session), true);
  assert.equal(shouldOpenWaitlist({}, session), false);
  const blocked = { getItem() { throw new Error('SecurityError'); } };
  assert.equal(shouldOpenWaitlist({ reason: 'exhausted' }, blocked), true);
});

test('only a 429 carrying a known quota reason is the trial; any other 429 is load', () => {
  assert.equal(trialRefusalFrom(429, { quota: 'exhausted' }), 'exhausted');
  assert.equal(trialRefusalFrom(429, { quota: 'voice', places: [] }), 'voice');
  assert.equal(trialRefusalFrom(429, { error: 'Rate limit exceeded' }), null);
  assert.equal(trialRefusalFrom(429, null), null);
  assert.equal(trialRefusalFrom(200, { quota: 'exhausted' }), null);
  assert.equal(trialRefusalFrom(429, { quota: 'something-else' }), null);
  assert.equal(isTrialRefusalReason('voice'), true);
  assert.equal(isTrialRefusalReason(undefined), false);
});

test('asking for the card is an event on the window, and a no-op without one', () => {
  const seen = [];
  const target = new EventTarget();
  target.addEventListener(WAITLIST_OPEN_EVENT, (event) => seen.push(event.detail));
  requestWaitlistCard({ reason: 'voice', explicit: true }, target);
  assert.deepEqual(seen, [{ reason: 'voice', explicit: true }]);
  assert.doesNotThrow(() => requestWaitlistCard({ reason: 'voice' }, undefined));
});
