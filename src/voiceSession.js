/**
 * @module voiceSession
 * @description Whether a voice session is open, for the parts of the page that
 * must stay quiet while it is.
 *
 * WHY. On the hosted trial (src/trialQuota.js) the voice session IS the try:
 * minting it spends one of the five, with its three spoken commands. The HUD's
 * AI summary spends a try per summary, and a spoken command moves the camera,
 * which is exactly what asks the HUD for a new one. Seen on surplomb.app on
 * 2026-09-17: three commands, and the « 5 essais utilisés » card opened before
 * the voice card — the HUD had spent the other four during the session.
 *
 * A summary still in flight when the session opens is a second hazard: the
 * server signs its cookie from the counts it READ, so an answer landing after
 * the voice mint writes the voice trial back to unopened. The HUD aborts it on
 * the open event, before the mint is sent.
 *
 * Kept free of the voice stack: the HUD is in the boot bundle, and the 360 kB
 * the voice chunk weighs is loaded on demand (src/voice/lazyVoice.js).
 */

export const VOICE_SESSION_EVENT = 'gev:voice-session';

/**
 * Record the session's state on `<html>` and tell the page when it changes.
 *
 * @param {boolean} open
 * @param {Document|undefined} [doc]
 */
export function announceVoiceSession(open, doc = globalThis.document) {
  const root = doc?.documentElement;
  if (!root) return;
  const next = Boolean(open);
  if (isVoiceSessionOpen(doc) === next) return;
  if (next) root.dataset.voiceSession = 'open';
  else delete root.dataset.voiceSession;
  if (typeof CustomEvent !== 'function' || !doc.dispatchEvent) return;
  doc.dispatchEvent(new CustomEvent(VOICE_SESSION_EVENT, { detail: { open: next } }));
}

/**
 * @param {Document|undefined} [doc]
 * @returns {boolean}
 */
export function isVoiceSessionOpen(doc = globalThis.document) {
  return doc?.documentElement?.dataset?.voiceSession === 'open';
}
