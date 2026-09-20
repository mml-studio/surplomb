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
  assert.equal(label, 'Voice control — Click the mic or hold Space to speak');
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
    'Contrôle vocal — Cliquez le micro ou maintenez Espace pour parler',
  );
});
