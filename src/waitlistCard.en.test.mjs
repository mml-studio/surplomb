// The waitlist card in English — the hosted product's words, so this reads
// them as a reader would rather than only checking that no French is left.
// Two claims are load-bearing and are pinned by hand: the globe stays free,
// and nothing here is for sale yet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WAITLIST_USAGE_CHOICES,
  renderWaitlistCard,
  waitlistCopy,
  waitlistIncludes,
} from './waitlistCard.js';
import { voicePremiumText } from './voicePremium.js';
import { assertNoFrench, useTestLocale, withLocale } from './i18n/testing.js';

useTestLocale('en');

const trial = {
  limit: 5,
  waitlist: { action: 'https://buttondown.com/api/emails/embed-subscribe/surplomb' },
};

test('each way into the card has its own English, and every one says the globe stays free', () => {
  const exhausted = waitlistCopy('exhausted', trial);
  assert.equal(exhausted.title, 'Trial over');
  assert.equal(exhausted.lede, 'Your 5 tries on this hosted demo are used up. The globe and its layers stay free.');

  const oneTry = waitlistCopy('exhausted', { limit: 1 });
  assert.match(oneTry.lede, /^Your 1 try /, 'the plural is chosen by rule, not by a “+ s”');

  const unknownCount = waitlistCopy('exhausted', {});
  assert.equal(unknownCount.lede, 'Your tries on this hosted demo are used up. The globe and its layers stay free.');

  const voice = waitlistCopy('voice', { limit: 5, voice: { limit: 3 } });
  assert.equal(voice.title, 'Voice is capped on this hosted demo');
  assert.equal(voice.lede, 'Your 3 free spoken requests are used up. The globe and its layers stay free.');
  assert.match(waitlistCopy('voice', { voice: { limit: 1 } }).lede, /^Your free spoken request is used up\./);
  assert.match(waitlistCopy('voice', {}).lede, /^It arrives at launch\./, 'a card opened before /api/trial answered');

  const direct = waitlistCopy('direct');
  assert.equal(direct.title, 'Waitlist');
  assert.match(direct.lede, /The globe and every layer stay free/);

  for (const reason of ['exhausted', 'voice', 'direct']) {
    assertNoFrench(waitlistCopy(reason, trial));
  }
});

test('the card promises no price, no plan and no payment page — only a waitlist', () => {
  for (const reason of ['exhausted', 'voice', 'direct']) {
    const html = renderWaitlistCard({ reason, trial });
    // "the price per m²" is a FEATURE the voice reads out, so the guard looks
    // for an amount and for the vocabulary of a checkout, not for the word.
    assert.doesNotMatch(html, /[€$£]\s?\d|\d\s?[€$£]|\bper month\b|\bmonthly\b|\bcheckout\b|\bpricing\b|\bbuy\b|\bupgrade\b/i,
      `${reason} must not price anything`);
    assert.match(html, /Join the waitlist/);
  }
});

test('the form reads in English, and its answer values stay the ones Buttondown stores', () => {
  const html = renderWaitlistCard({ reason: 'direct', trial });
  assert.match(html, /<span>Your email<\/span>/);
  assert.match(html, /placeholder="you@example\.com"/);
  assert.match(html, /<legend>What brings you here<\/legend>/);
  assert.match(html, /Two emails, nothing else\. Through Buttondown, one-click unsubscribe\./);
  assert.match(html, />Your data<\/a>/);
  assert.deepEqual(
    WAITLIST_USAGE_CHOICES.map((choice) => choice.label),
    ['I’m looking for a home', 'I work in real estate', 'Out of curiosity', 'Some other reason'],
  );
  // The values are data: they land on the subscriber and are read back there.
  assert.deepEqual(
    WAITLIST_USAGE_CHOICES.map((choice) => choice.value),
    ['logement', 'immobilier', 'curiosite', 'autre'],
  );
  assert.deepEqual(withLocale('fr', () => WAITLIST_USAGE_CHOICES.map((choice) => choice.value)),
    ['logement', 'immobilier', 'curiosite', 'autre']);
});

test('the premium list names only what works today, in both languages', () => {
  assert.deepEqual(waitlistIncludes(), [
    'Voice control',
    'The price per m² around here, in one question',
    'The walking or cycling route, drawn and timed',
  ]);
  assert.deepEqual(withLocale('fr', waitlistIncludes), [
    'La commande vocale',
    'Le prix au m² autour d’ici, en une question',
    'Le trajet à pied ou à vélo, tracé et minuté',
  ]);
});

test('a server with no waitlist says so in English, and a joined visitor is not asked twice', () => {
  const html = renderWaitlistCard({ reason: 'direct', trial: {} });
  assert.match(html, /Sign-ups are not open on this server yet\./);
  assert.doesNotMatch(html, /<form/);

  const joined = renderWaitlistCard({ reason: 'direct', trial, joined: true });
  assert.match(joined, /You’re on the list\. If you haven’t yet, confirm from the email you received\./);
  assert.match(joined, /Use another address/);
});

test('nothing a reader sees on the card reads as French', () => {
  for (const reason of ['exhausted', 'voice', 'direct']) {
    const html = renderWaitlistCard({ reason, trial })
      // The crown is an SVG path, and the answer VALUES are data.
      .replace(/<svg[\s\S]*?<\/svg>/g, '')
      .replace(/value="[^"]*"/g, '');
    assertNoFrench(html);
  }
});

test('the mic’s premium line counts its requests by rule', () => {
  assert.equal(voicePremiumText('trial', 3), 'Hosted demo · 3 free spoken requests');
  assert.equal(voicePremiumText('trial', 1), 'Hosted demo · 1 free spoken request');
  assert.equal(voicePremiumText('spent', 3), 'Hosted demo · free requests used up');
  assert.equal(voicePremiumText('closed'), 'Hosted demo · voice available at launch');
  assert.equal(voicePremiumText(null), '');
  for (const state of ['trial', 'spent', 'closed']) assertNoFrench(voicePremiumText(state, 3));
  // Same module, same call, the other language — the property the catalogs rest on.
  assert.equal(withLocale('fr', () => voicePremiumText('trial', 3)),
    'Fonction premium · 3 commandes vocales offertes');
});
