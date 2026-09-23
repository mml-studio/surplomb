// The mic panel in English — the last French sentence on the English globe.
//
// `Voice control — Cliquez le micro ou maintenez Espace pour parler` was the
// button's `aria-label`, which on a hover-only tray is the ONLY copy a screen
// reader ever hears. It was also the one string `qa:i18n-en` still reported
// against this batch.
import assert from 'node:assert/strict';
import test from 'node:test';

import { assertNoFrench, useTestLocale } from '../i18n/testing.js';
import {
  defaultVoiceErrorHint,
  resolveVoiceControlHint,
  resolveVoiceReadyPrompt,
  voiceControlAriaLabel,
  voicePhaseLabel,
} from './voiceControlDom.js';

test('the gesture is named in English, and named for the device holding it', (t) => {
  useTestLocale('en', t);
  // A cursor has a Space key; a phone does not, and the mic shuts itself
  // after one request there. Both facts survive the translation.
  assert.equal(resolveVoiceControlHint(false, false, false), 'Click the mic or hold Space to speak');
  assert.equal(resolveVoiceControlHint(true, true, false), 'Release Space to send');
  assert.equal(resolveVoiceControlHint(false, false, true), 'Tap the mic to speak · it closes itself');
  assert.equal(resolveVoiceReadyPrompt(false), 'Mic or Space to speak');
  assert.equal(resolveVoiceReadyPrompt(true), 'Tap the mic to speak');
});

test('the screen-reader name of the mic button is all English', (t) => {
  useTestLocale('en', t);
  const label = voiceControlAriaLabel(resolveVoiceControlHint(false, false, false));
  // It opens with the words the desktop button shows (WCAG 2.5.3).
  assert.equal(label, 'Talk to Surplomb — Click the mic or hold Space to speak');
  assertNoFrench(label);
});

test('the error tray’s fallback line is English too', (t) => {
  useTestLocale('en', t);
  assert.equal(defaultVoiceErrorHint(), 'Check microphone permission and network access, then try again.');
});

test('French is untouched: the same three sentences, byte for byte', () => {
  assert.equal(resolveVoiceControlHint(false, false, false), 'Cliquez le micro ou maintenez Espace pour parler');
  assert.equal(resolveVoiceControlHint(true, true, false), 'Relâchez Espace pour envoyer');
  assert.equal(resolveVoiceControlHint(false, false, true), 'Touchez le micro pour parler · il se referme seul');
  assert.equal(resolveVoiceReadyPrompt(false), 'Micro ou Espace pour parler');
  assert.equal(
    voiceControlAriaLabel(resolveVoiceControlHint(false, false, false)),
    'Parler à Surplomb — Cliquez le micro ou maintenez Espace pour parler',
  );
});

test('the desktop card says what the mic does in a sentence, in both languages', (t) => {
  assert.equal(voicePhaseLabel('listening'), 'Je vous écoute');
  assert.equal(voicePhaseLabel('answering'), 'Surplomb répond');
  assert.equal(voicePhaseLabel('ready'), 'À vous');
  assert.equal(voicePhaseLabel('error'), 'Voix indisponible');
  // At rest the button carries « Parler à Surplomb »: the card has no line.
  assert.equal(voicePhaseLabel('idle'), '');
  assert.equal(voicePhaseLabel('toString'), '', 'only the phases, never a prototype key');
  useTestLocale('en', t);
  for (const shown of ['connecting', 'listening', 'answering', 'ready', 'executing', 'error']) {
    const line = voicePhaseLabel(shown);
    assert.ok(line, shown);
    assertNoFrench(line);
  }
  assert.equal(voicePhaseLabel('listening'), 'Listening');
});
