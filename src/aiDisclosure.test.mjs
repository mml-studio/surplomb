// The « IA » mark (src/aiDisclosure.js): EU AI Act article 50(1) asks that a
// person talking to an AI system be told so, clearly, by the first exchange.
//
// Before this mark the globe's only disclosure was the voice dock's
// `AI AGENT` kicker — English, 7 px, measured 0 px wide at 1440 × 900 and
// hidden on phones — and the HUD's model-written summary said `SUMMARY`.
// These pins hold the three promises the mark makes: it names what it
// stands for, it sits on the mic in every build of the panel, and on the HUD
// it follows the AUTHOR of the line, not the line.
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { aiBadgeHtml, aiDisclosureText, markAiGenerated } from './aiDisclosure.js';
import { VOICE_AI_BADGE_ID, createVoiceControl } from './voice/voiceControlDom.js';

// `hud.js` names an export of `mgrs` that only its ESM build has; the grid
// readout is not under test here (same stub as src/voiceSession.test.mjs).
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'mgrs') {
      return { url: 'data:text/javascript,export function forward() { return ""; }', shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
const { IntelHUD } = await import('./hud.js');

test('the mark says « IA », and its full sentence to a pointer and to a screen reader', () => {
  const html = aiBadgeHtml('voice');
  assert.match(html, /^<span class="gev-ai-badge" data-ai-surface="voice" role="img" /);
  assert.match(html, />IA<\/span>$/);
  const sentence = 'Assistant d’intelligence artificielle — voix de synthèse';
  assert.equal(aiDisclosureText('voice'), sentence);
  assert.ok(html.includes(`aria-label="${sentence}"`), html);
  assert.ok(html.includes(`title="${sentence}"`), html);
  assert.equal(html.includes(' id="'), false, 'no id unless a control asks to name it');
});

test('the summary’s mark names the maker the endpoint always calls', () => {
  // `/api/openai/hud-summary` has no other provider; the voice has two, so
  // its sentence names none (src/aiDisclosure.i18n.js).
  assert.equal(aiDisclosureText('summary'), 'Résumé rédigé par une intelligence artificielle (OpenAI)');
  assert.match(aiBadgeHtml('summary'), /data-ai-surface="summary"/);
  assert.doesNotMatch(aiDisclosureText('voice'), /OpenAI|OpenRouter|Mistral/);
});

test('an id is escaped like any attribute, and an unknown surface reads as the voice', () => {
  assert.match(aiBadgeHtml('voice', { id: 'a"b' }), / id="a&quot;b" /);
  assert.match(aiBadgeHtml('other'), /data-ai-surface="voice"/);
});

test('the machine-readable mark is set, and taken off, on the element itself', () => {
  const node = { dataset: {} };
  markAiGenerated(node, true);
  assert.equal(node.dataset.aiGenerated, 'true');
  markAiGenerated(node, false);
  assert.equal('aiGenerated' in node.dataset, false);
  // A missing node, or a text sink with no dataset (a test double): nothing thrown.
  markAiGenerated(null, true);
  markAiGenerated({ textContent: '' }, true);
});

/** Just enough document for `createVoiceControl` to write its markup into. */
function withMarkupDocument(t) {
  const previous = globalThis.document;
  const appended = [];
  globalThis.document = {
    documentElement: { dataset: {} },
    getElementById: () => null,
    createElement: () => ({ dataset: {}, innerHTML: '', querySelector: () => null }),
    body: { appendChild: (node) => appended.push(node) },
  };
  t.after(() => {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  });
  return appended;
}

test('the mic wears the mark on its ring, and names it first in its description', (t) => {
  const appended = withMarkupDocument(t);
  const { root } = createVoiceControl();
  assert.equal(appended[0], root);
  const html = root.innerHTML;
  const button = html.match(/<button id="gev-voice-button"[^>]*>/)?.[0] || '';
  assert.match(button, new RegExp(`aria-describedby="${VOICE_AI_BADGE_ID} gev-voice-help"`));
  // Inside the ring, beside the crown: the one shape every layout keeps.
  const orbit = html.match(/<span class="gev-mic-orbit">.*?<span class="gev-premium-badge">/s)?.[0] || '';
  assert.ok(orbit.includes(`id="${VOICE_AI_BADGE_ID}"`), orbit);
  assert.ok(orbit.includes('>IA</span>'), orbit);
});

test('the assistant’s words are marked as generated; the visitor’s are not', (t) => {
  withMarkupDocument(t);
  const { root } = createVoiceControl();
  const row = (role) => root.innerHTML.match(new RegExp(`data-role="${role}">.*?</div>`, 's'))?.[0] || '';
  assert.match(row('said'), /class="gev-voice-transcript-text" data-ai-generated="true"/);
  assert.doesNotMatch(row('heard'), /data-ai-generated/);
});

/** The HUD's summary sink, and the badge the CSS shows from its mark. */
function withSummaryDocument(t) {
  const previous = globalThis.document;
  const summary = { textContent: '', dataset: {} };
  globalThis.document = { getElementById: (id) => (id === 'hud-summary' ? summary : null) };
  t.after(() => {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  });
  return summary;
}

test('the HUD marks the summary line while a model wrote it, and only then', (t) => {
  const summary = withSummaryDocument(t);
  const hud = Object.create(IntelHUD.prototype);
  hud._summaryText = null;
  hud._summaryTypingInterval = null;

  hud._setSummaryText('NORMAL CITY NEAR LYON', false);
  assert.equal(summary.textContent, 'NORMAL CITY NEAR LYON');
  assert.equal('aiGenerated' in summary.dataset, false, 'the local line is not a model’s');

  hud._setSummaryText('OLD TOWN BY THE SAÔNE', false, true);
  assert.equal(summary.dataset.aiGenerated, 'true');

  // Same words, other author: the mark follows the author.
  hud._setSummaryText('OLD TOWN BY THE SAÔNE', true, false);
  assert.equal('aiGenerated' in summary.dataset, false);
});

test('a line set outright stops a model’s line still being typed over it', (t) => {
  const summary = withSummaryDocument(t);
  const hud = Object.create(IntelHUD.prototype);
  hud._summaryText = null;
  hud._summaryTypingInterval = null;
  hud._setSummaryText('OLD TOWN BY THE SAÔNE RIVER', true, true);
  assert.ok(hud._summaryTypingInterval, 'typing');
  hud._setSummaryText('NORMAL CITY NEAR LYON', false);
  assert.equal(hud._summaryTypingInterval, null);
  assert.equal(summary.textContent, 'NORMAL CITY NEAR LYON');
  assert.equal('aiGenerated' in summary.dataset, false);
});

test('only the endpoint’s answer is handed over as a model’s line', async (t) => {
  withSummaryDocument(t);
  const hud = Object.create(IntelHUD.prototype);
  Object.assign(hud, {
    _userEngaged: true,
    _summaryDisabled: false,
    _latestMetrics: { lat: 45.76, lon: 4.83 },
    _summaryDirty: true,
    _summaryRequest: null,
    _summaryRevision: 0,
    _lastSummarySignature: '',
  });
  const shown = [];
  hud._composeSummary = () => 'LYON · LOCAL';
  hud._setSummaryText = (text, animate, aiGenerated = false) => shown.push([text, aiGenerated]);
  hud._summaryContext = async () => ({ place: 'Lyon' });
  const previousFetch = globalThis.fetch;
  const previousWindow = globalThis.window;
  globalThis.window = Object.assign(new EventTarget(), { setTimeout, clearTimeout });
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ summary: 'OLD TOWN BY THE SAÔNE' }) });
  t.after(() => {
    globalThis.fetch = previousFetch;
    globalThis.window = previousWindow;
  });

  await hud._updateSummary(true, true);
  assert.deepEqual(shown, [['LYON · LOCAL', false], ['OLD TOWN BY THE SAÔNE', true]]);

  // A failed request falls back to the local line, unmarked.
  t.mock.method(console, 'warn', () => {});
  shown.length = 0;
  globalThis.fetch = async () => ({ ok: false, status: 502, json: async () => ({ error: 'upstream' }) });
  await hud._updateSummary(true, true);
  assert.deepEqual(shown.at(-1), ['LYON · LOCAL', false]);
});
