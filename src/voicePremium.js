/**
 * @module voicePremium
 * @description The mark that says the voice agent is a premium feature, on an
 * instance that runs the hosted trial (src/trialQuota.js).
 *
 * WHY A MARK BEFORE THE CLICK. The trial gives a browser three spoken
 * requests, once (decision of 2026-09-17). Without a sign on the mic, the
 * session closing after the third answer reads as a fault. Interface software
 * says « premium » with a small tinted badge on the tool itself, before anyone
 * reaches for it, and the help tray says what the trial holds.
 *
 * WHY ON `<html>`. The mic panel is built at boot and rebuilt by the voice
 * controller when its chunk lands (`createVoiceControl({ reset: true })`). A
 * flag on the panel would die with the first build; one on the root survives
 * both, and the CSS reads it from there.
 *
 * OFF BY DEFAULT. `/api/trial` reports `enabled: false` on a clone running its
 * own keys, and nothing is marked: its voice is not for sale.
 *
 * Kept free of the voice stack so `main.js` can load it at boot without pulling
 * the 360 kB that `lazyVoice.js` defers.
 */

/**
 * Material Symbols Outlined `crown`, filled, weight 400 — the path verbatim,
 * in Google's own `0 -960 960 960` box. See licenses/material-symbols/NOTICE.
 */
const CROWN_PATH = 'M200-160v-80h560v80H200Zm0-140-51-321q-2 0-4.5.5t-4.5.5q-25 0-42.5-17.5T80-680q0-25 17.5-42.5T140-740q25 0 42.5 17.5T200-680q0 7-1.5 13t-3.5 11l125 56 125-171q-11-8-18-21t-7-28q0-25 17.5-42.5T480-880q25 0 42.5 17.5T540-820q0 15-7 28t-18 21l125 171 125-56q-2-5-3.5-11t-1.5-13q0-25 17.5-42.5T820-740q25 0 42.5 17.5T880-680q0 25-17.5 42.5T820-620q-2 0-4.5-.5t-4.5-.5l-51 321H200Z';

/** The crown as inline SVG. Decorative: the words live in the help tray. */
export const PREMIUM_CROWN_SVG = `<svg class="premium-crown" viewBox="0 -960 960 960" aria-hidden="true" focusable="false"><path d="${CROWN_PATH}"/></svg>`;

/** @typedef {'trial'|'spent'|'closed'} VoicePremiumState */

/**
 * What the mic's help tray says, or '' when voice is not premium here.
 *
 * @param {VoicePremiumState|null|undefined} state
 * @param {number} [turns] - Spoken requests in the trial.
 * @returns {string}
 */
export function voicePremiumText(state, turns = 0) {
  if (state === 'trial') {
    const count = Number(turns) > 0 ? Number(turns) : 3;
    return `Fonction premium · essai gratuit de ${count} demande${count > 1 ? 's' : ''}`;
  }
  if (state === 'spent') return 'Fonction premium · essai utilisé';
  if (state === 'closed') return 'Fonction premium · réservée à l’abonnement';
  return '';
}

/**
 * Read `/api/trial` into a mark.
 *
 * - `trial`: the voice trial can still open (its requests are left, and so is
 *   a try — or it is already open).
 * - `spent`: its requests are gone, or every try went elsewhere first.
 * - `closed`: this instance keeps voice out of the trial (`GEV_TRIAL_VOICE=0`).
 *
 * @param {unknown} trial - The `/api/trial` body.
 * @returns {{state: VoicePremiumState, turns: number}|null}
 */
export function voicePremiumFromTrial(trial) {
  if (!trial || typeof trial !== 'object' || trial.enabled !== true) return null;
  const voice = trial.voice;
  if (!voice || typeof voice !== 'object') return null;
  const turns = Number(voice.limit) || 0;
  if (turns <= 0) return { state: 'closed', turns: 0 };
  const open = Number(voice.remaining) > 0 && (Number(voice.used) > 0 || Number(trial.remaining) > 0);
  return { state: open ? 'trial' : 'spent', turns };
}

/**
 * Put the mark on the page, or take it off with `null`.
 *
 * @param {{state: VoicePremiumState, turns?: number}|null} mark
 * @param {Document} [doc]
 */
export function applyVoicePremium(mark, doc = globalThis.document) {
  const root = doc?.documentElement;
  if (!root) return;
  if (!mark?.state) {
    delete root.dataset.voicePremium;
    delete root.dataset.voicePremiumTurns;
  } else {
    root.dataset.voicePremium = mark.state;
    if (Number(mark.turns) > 0) root.dataset.voicePremiumTurns = String(mark.turns);
  }
  const line = doc.querySelector?.('.gev-voice-help-premium');
  if (line) line.textContent = voicePremiumText(mark?.state, mark?.turns);
}

/**
 * The mark currently on the page, for a panel being (re)built.
 *
 * @param {Document} [doc]
 * @returns {{state: VoicePremiumState, turns: number}|null}
 */
export function currentVoicePremium(doc = globalThis.document) {
  const data = doc?.documentElement?.dataset;
  if (!data?.voicePremium) return null;
  return { state: /** @type {VoicePremiumState} */ (data.voicePremium), turns: Number(data.voicePremiumTurns) || 0 };
}

/**
 * The trial is spent for this browser: keep the crown, change the words.
 * A no-op where voice was never marked (a clone, or before `/api/trial`).
 *
 * @param {Document} [doc]
 */
export function markVoicePremiumSpent(doc = globalThis.document) {
  const mark = currentVoicePremium(doc);
  if (!mark || mark.state !== 'trial') return;
  applyVoicePremium({ ...mark, state: 'spent' }, doc);
}

/**
 * Ask the server once, at boot, and mark the mic. Silent on any failure: a
 * missing crown costs nothing, a thrown error at boot would.
 *
 * @param {{fetchImpl?: typeof fetch, doc?: Document}} [options]
 * @returns {Promise<{state: VoicePremiumState, turns: number}|null>}
 */
export async function loadVoicePremium({
  fetchImpl = globalThis.fetch?.bind(globalThis),
  doc = globalThis.document,
} = {}) {
  try {
    const response = await fetchImpl('/api/trial', { cache: 'no-store', headers: { Accept: 'application/json' } });
    if (!response.ok) return null;
    const mark = voicePremiumFromTrial(await response.json());
    // A session that already spent the trial in the meantime wins.
    if (mark && currentVoicePremium(doc)?.state === 'spent') return currentVoicePremium(doc);
    applyVoicePremium(mark, doc);
    return mark;
  } catch {
    return null;
  }
}
