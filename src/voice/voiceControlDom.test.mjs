// Where the mic panel lands, and what the desktop card is built from.
//
// On a desktop src/globeShell.js moves the panel into `#voice-corner`, and the
// voice controller rebuilds it a few seconds later when its 360 kB arrive
// (lazyVoice.js). The rebuild used to go back to the bottom dock — under the
// navigation bar — so it now takes the old panel's place.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createVoiceControl } from './voiceControlDom.js';

/** A document with a dock, a corner and (optionally) a panel already built. */
function withPlacementDocument(t, { cornerHidden = false, existing = false } = {}) {
  const previous = globalThis.document;
  const calls = [];
  const node = (id) => ({
    id,
    dataset: {},
    innerHTML: '',
    querySelector: () => null,
    appendChild(child) { calls.push([id, 'appendChild', child]); },
    insertBefore(child) { calls.push([id, 'insertBefore', child]); },
  });
  const corner = { ...node('voice-corner'), hidden: cornerHidden };
  const dock = node('command-dock');
  const old = existing
    ? { ...node('gev-voice-control'), parentNode: corner, replaceWith(next) { calls.push(['old', 'replaceWith', next]); } }
    : null;
  const byId = { 'voice-corner': corner, 'command-dock': dock, 'gev-voice-control': old };
  globalThis.document = {
    documentElement: { dataset: {} },
    getElementById: (id) => byId[id] || null,
    createElement: () => node('new'),
    body: { appendChild: (child) => calls.push(['body', 'appendChild', child]) },
  };
  t.after(() => {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  });
  return calls;
}

test('a rebuild takes the old panel’s place, wherever that is', (t) => {
  const calls = withPlacementDocument(t, { existing: true });
  const { root } = createVoiceControl({ reset: true });
  assert.deepEqual(calls, [['old', 'replaceWith', root]]);
});

test('a panel built from nothing goes to the corner once the desktop shows it', (t) => {
  const calls = withPlacementDocument(t);
  const { root } = createVoiceControl();
  assert.deepEqual(calls, [['voice-corner', 'appendChild', root]]);
});

test('with the corner hidden — a phone, or before the shell ran — it goes to the dock', (t) => {
  const calls = withPlacementDocument(t, { cornerHidden: true });
  const { root } = createVoiceControl();
  assert.deepEqual(calls, [['command-dock', 'appendChild', root]]);
});

test('an existing panel is reused when nobody asks for a rebuild', (t) => {
  const calls = withPlacementDocument(t, { existing: true });
  const { root } = createVoiceControl();
  assert.equal(root.id, 'gev-voice-control');
  assert.deepEqual(calls, []);
});

test('the card’s parts are sentences from the catalog, and « Arrêter » names what it ends', (t) => {
  withPlacementDocument(t);
  const { root } = createVoiceControl();
  const html = root.innerHTML;
  const button = html.match(/<button id="gev-voice-button".*?<\/button>/s)?.[0] || '';
  assert.match(button, /<span class="gev-mic-caption">Parler à Surplomb<\/span>/);
  assert.match(html, /<span class="gev-voice-phase"><\/span>/);
  const stop = html.match(/<button class="gev-voice-stop"[^>]*>[^<]*<\/button>/)?.[0] || '';
  assert.match(stop, /aria-label="Arrêter la conversation avec Surplomb"/);
  assert.match(stop, />Arrêter<\/button>$/);
  assert.match(html, /data-role="heard">\s*<span class="gev-voice-transcript-kicker">HEARD<\/span>\s*<span class="gev-voice-transcript-who">Vous<\/span>/);
  assert.match(html, /data-role="said">\s*<span class="gev-voice-transcript-kicker">SAID<\/span>\s*<span class="gev-voice-transcript-who">Surplomb<\/span>/);
  // A tooltip only: the phone shows DISMISS, and a name must contain what is shown.
  assert.match(html, /<button class="gev-voice-error-dismiss" type="button" title="Fermer le message d’erreur">DISMISS<\/button>/);
});
