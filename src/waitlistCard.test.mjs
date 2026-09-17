// The waitlist card. What matters is what Buttondown receives — the answer to
// the use question, the embed flag, the tag — that no price leaks onto the
// card, and that an automatic refusal does not reopen it on every HUD tick.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WAITLIST_AUTO_SHOWN_KEY,
  WAITLIST_USAGE_CHOICES,
  initWaitlistCard,
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

test('the card is headed premium, with the same crown as the mic', () => {
  const html = renderWaitlistCard({ reason: 'voice', trial });
  assert.match(html, /<span class="waitlist-kicker"><svg class="premium-crown"[^>]*aria-hidden="true"/);
});

test('no price on the card: it belongs on the payment page (decision of 2026-09-17)', () => {
  for (const reason of ['exhausted', 'voice', 'direct']) {
    const html = renderWaitlistCard({ reason, trial });
    // « Le prix au m² » in the list is the property's, not the subscription's.
    assert.doesNotMatch(html, /€|TTC|par mois|\/\s*mois|waitlist-price|tarif|prix (de|du|à) l’abonnement/i, reason);
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
  assert.match(waitlistCopy('exhausted', { limit: 5 }).lede, /^Vos 5 essais premium sont utilisés\./, 'the voice trial is one of the tries');
  // Voice is premium whichever way the visitor met the refusal.
  const used = waitlistCopy('voice', { limit: 5, voice: { limit: 3, used: 3, remaining: 0 } });
  assert.equal(used.title, 'La voix est une fonction premium');
  assert.equal(used.lede, 'Vos 3 commandes vocales offertes sont utilisées. Le globe et ses couches restent gratuits.');
  assert.match(waitlistCopy('voice', { voice: { limit: 1 } }).lede, /^Votre commande vocale offerte est utilisée\./);
  const never = waitlistCopy('voice', { limit: 5, voice: { limit: 0 } });
  assert.equal(never.title, 'La voix est une fonction premium');
  assert.match(never.lede, /^Elle arrive à l’ouverture\./, 'no subscription exists yet to arrive with');
  assert.match(waitlistCopy('voice').lede, /^Elle arrive/, 'a card opened before /api/trial answered');
  assert.equal(waitlistCopy('direct').title, 'Liste d’attente');
  for (const reason of ['exhausted', 'voice']) {
    const { lede } = waitlistCopy(reason, { limit: 5, voice: { limit: 3 } });
    assert.match(lede, /Le globe et ses couches restent gratuits\.$/);
    // Rewritten short on 2026-09-17, and without the word the owner dropped.
    assert.ok(lede.length <= 100, `${reason}: ${lede.length} characters`);
    assert.doesNotMatch(lede, /demande/);
  }
});

test('the premium list names only what works today', () => {
  const html = renderWaitlistCard({ reason: 'voice', trial });
  assert.match(html, /<li>La commande vocale<\/li>/);
  // The Météo-France network needs a contract that is not signed.
  assert.doesNotMatch(html, /Météo-France|2 144/);
  assert.match(html, /Deux emails, rien d’autre\. Via Buttondown, désinscription en un clic\./);
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
  assert.equal(trialRefusalFrom(429, { quota: 'reserved' }), 'reserved');
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

function cardDocument() {
  const body = [];
  const element = () => ({
    dataset: {},
    attributes: {},
    innerHTML: '',
    setAttribute(name, value) { this.attributes[name] = value; },
    querySelector: () => null,
    remove() { body.splice(body.indexOf(this), 1); },
  });
  const doc = new EventTarget();
  Object.assign(doc, {
    activeElement: null,
    body: { appendChild: (node) => body.push(node) },
    createElement: element,
  });
  return { doc, body };
}

test('a click is never answered with the card an automatic refusal was still loading', async () => {
  const { doc, body } = cardDocument();
  let release;
  const slowTrial = new Promise((resolve) => { release = resolve; });
  const store = new Map();
  const session = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  const card = initWaitlistCard({
    documentRef: doc,
    windowRef: null,
    fetchImpl: () => slowTrial,
    localStore: null,
    sessionStore: session,
  });
  // The HUD's refusal starts loading the card; the voice trial ends meanwhile.
  const automatic = card.open({ reason: 'exhausted' });
  const clicked = card.open({ reason: 'voice', explicit: true });
  release({ ok: true, json: async () => ({ limit: 5, voice: { limit: 3 } }) });
  await Promise.all([automatic, clicked]);
  assert.equal(body.length, 1, 'one card on screen');
  assert.equal(body[0].dataset.reason, 'voice');

  // The other way round, the refusal does not replace the card asked for.
  await card.open({ reason: 'exhausted', explicit: false });
  assert.equal(body[0].dataset.reason, 'voice');
});

test('once the visitor has seen the card, an automatic refusal does not open it again', async () => {
  const { doc, body } = cardDocument();
  const store = new Map();
  const session = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  const card = initWaitlistCard({
    documentRef: doc,
    windowRef: null,
    fetchImpl: async () => ({ ok: true, json: async () => ({ limit: 5, voice: { limit: 3 } }) }),
    localStore: null,
    sessionStore: session,
  });
  // The voice trial ends: its card opens, and the visitor closes it.
  assert.equal(await card.open({ reason: 'voice', explicit: true }), true);
  card.close();
  assert.equal(body.length, 0);
  // The HUD then runs out of the tries the voice left it.
  assert.equal(await card.open({ reason: 'exhausted' }), false);
  assert.equal(body.length, 0, 'no « Essai terminé » on top of the voice card');
});
