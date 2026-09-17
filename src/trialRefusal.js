/**
 * @module trialRefusal
 * @description How the page recognises the hosted trial's refusal, and how it
 * asks for the waitlist card.
 *
 * Kept apart from the card on purpose: the HUD, the nearby-places lookup and
 * both voice paths import this, and none of them should drag the card's markup
 * into their chunk. The card module is loaded by `main.js` on the first event.
 *
 * The server contract lives in `src/trialQuota.js`: a 429 whose body carries
 * `quota: 'exhausted' | 'reserved' | 'voice'`. A 429 without it is load — an
 * edge rule or a per-minute cap — and keeps its existing retry behaviour.
 * `reserved` only answers the HUD summary: the try left is the voice's, so the
 * HUD goes quiet and no card opens.
 */

export const WAITLIST_OPEN_EVENT = 'gev:waitlist-open';

const REASONS = new Set(['exhausted', 'reserved', 'voice']);

/**
 * @param {unknown} value
 * @returns {value is 'exhausted'|'reserved'|'voice'}
 */
export function isTrialRefusalReason(value) {
  return REASONS.has(value);
}

/**
 * @param {number} status
 * @param {unknown} body - The parsed JSON body, or null.
 * @returns {'exhausted'|'reserved'|'voice'|null}
 */
export function trialRefusalFrom(status, body) {
  if (status !== 429 || !body || typeof body !== 'object') return null;
  return isTrialRefusalReason(body.quota) ? body.quota : null;
}

/**
 * Ask for the waitlist card. `explicit` marks a gesture aimed at the paid
 * feature (a mic click): the card then opens every time and takes focus. An
 * automatic refusal (the HUD's periodic summary) opens it once per tab.
 *
 * @param {{reason: 'exhausted'|'voice'|'direct', explicit?: boolean}} detail
 * @param {EventTarget|undefined} [target]
 */
export function requestWaitlistCard(detail, target = globalThis.window) {
  if (!target?.dispatchEvent || typeof CustomEvent !== 'function') return;
  target.dispatchEvent(new CustomEvent(WAITLIST_OPEN_EVENT, { detail }));
}
