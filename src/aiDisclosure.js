/**
 * @module aiDisclosure
 * @description The « IA » mark on the surfaces a model speaks through.
 *
 * WHY. EU AI Act article 50(1), applicable since 2026-08-02: whoever puts an
 * AI system in front of people tells them they are dealing with one, at the
 * latest at the first interaction, clearly and distinguishably. Two surfaces
 * of the globe qualify:
 *
 *   - the voice assistant — a model hears the request, acts on the map and
 *     answers in a synthetic voice;
 *   - the HUD summary line — five words written by an OpenAI model about
 *     what the camera sees.
 *
 * The audit of 2026-09-22 found one disclosure for both: the voice dock's
 * `AI AGENT` kicker. English on the French globe, 7 px type, measured 0 px
 * wide at 1440 × 900, hidden on phones (`phone.css`) and whenever a dock
 * panel opens. The summary said only `SUMMARY`.
 *
 * WHY A BADGE ON THE MIC'S RING. The ring is the one shape every layout keeps
 * — which is why the premium crown already rides it (src/voicePremium.js).
 * The mark takes the ring's other upper corner, in the crown's visual
 * language (a small pill with the same dark keyline), in cream rather than
 * gold so that the two never read as one sign. It is always drawn: every
 * instance's mic is an AI assistant, sold or not.
 *
 * WHY THE SUMMARY'S MARK COMES AND GOES. The summary line is not always a
 * model's. Before the first gesture, during a voice session, without a key or
 * once the trial is spent, the HUD prints the local telemetry line composed in
 * the browser. Calling that AI would be wrong the other way round, so the mark
 * follows the text: the HUD sets `data-ai-generated` on `#hud-summary` only
 * while a model's words are on it, and the CSS shows the badge from there.
 *
 * MACHINE-READABLE TOO. Every container holding generated text carries
 * `data-ai-generated="true"` while it does (the summary line, the voice
 * transcript's `SAID` row) — the labelling article 50 asks for, at no cost.
 */

import messages from './aiDisclosure.i18n.js';

/** @typedef {'voice'|'summary'} AiSurface */

/**
 * The markup is interpolated into template literals, so its text has to
 * survive being read as HTML.
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * What the mark says in full, for its tooltip and for a screen reader.
 *
 * @param {AiSurface} surface
 * @returns {string}
 */
export function aiDisclosureText(surface) {
  const m = messages();
  return surface === 'summary' ? m.summary : m.voice;
}

/**
 * The mark as markup: « IA » (« AI » in English) on a pill.
 *
 * `role="img"` with an `aria-label`, so a screen reader announces the full
 * sentence instead of spelling two letters; the same sentence is its `title`,
 * so pointing at it says it too. `id` lets a control name the mark in its
 * `aria-describedby`.
 *
 * @param {AiSurface} surface
 * @param {{id?: string}} [options]
 * @returns {string}
 */
export function aiBadgeHtml(surface, { id } = {}) {
  const label = escapeHtml(aiDisclosureText(surface));
  const idAttribute = id ? ` id="${escapeHtml(id)}"` : '';
  return `<span class="gev-ai-badge" data-ai-surface="${surface === 'summary' ? 'summary' : 'voice'}"${idAttribute} role="img" aria-label="${label}" title="${label}">${escapeHtml(messages().badge)}</span>`;
}

/**
 * Say, on the element itself, whether the text it holds was written by a
 * model: `data-ai-generated="true"`, or no attribute at all.
 *
 * @param {{dataset?: DOMStringMap}|null|undefined} node
 * @param {boolean} generated
 */
export function markAiGenerated(node, generated) {
  if (!node?.dataset) return;
  if (generated) node.dataset.aiGenerated = 'true';
  else delete node.dataset.aiGenerated;
}
