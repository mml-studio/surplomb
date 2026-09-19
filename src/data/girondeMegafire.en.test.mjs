// The Gironde megafire layer, end to end in both languages: the real module,
// the real pack from disk, a viewer double with no WebGL. The row's chips, its
// legend and its stats are read at CALL time, so one loaded layer answers in
// whichever language the page is in — the property the whole catalog design
// rests on (src/i18n/messages.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import layer from './girondeMegafire.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

// The pack is fetched by URL; Node's fetch has no file: scheme.
globalThis.fetch = async (url) => {
  const body = readFileSync(fileURLToPath(url), 'utf8');
  return { ok: true, status: 200, json: async () => JSON.parse(body) };
};

const viewer = {
  scene: {
    primitives: { add: (primitive) => primitive, contains: () => false, remove() {} },
    postRender: { addEventListener: () => () => {} },
    // No depth texture: ground polylines are declared unsupported, as on a
    // machine without them, and the layer draws the rest.
    frameState: { context: { depthTexture: false } },
  },
};

const warn = console.warn;
console.warn = () => {};
layer.init(viewer);
await layer.enable();
console.warn = warn;

/** Everything the reader can see on the row, the key and the stats line. */
const visible = () => {
  const { chips, legend } = layer.getRowControls();
  const { cursor, coverage, acquired } = layer.getStats();
  return { chips: chips.map(({ label, title }) => ({ label, title })), legend: legend.map(({ label, blurb }) => ({ label, blurb })), cursor, coverage, acquired };
};

// Satellite names are proper nouns, not French.
const SENSORS = ['Pléiades Neo'];

test('opened on the closing frame, in English', () => {
  const en = withLocale('en', visible);
  assertNoFrench(en, { allow: SENSORS });
  assert.equal(en.coverage, '■ Aug 1 12:44 UTC · last detection');
  assert.equal(en.chips[0].label, '↺ Replay');
  assert.equal(en.chips[0].title, 'Replay the 10 days in 24 s — ■ Aug 1 12:44 UTC · last detection');
  assert.deepEqual(en.chips.slice(1).map((chip) => chip.label),
    ['Jul 24 09:05', 'Jul 26 10:12', 'Jul 27 16:16', 'Jul 29 14:07', 'Aug 1 11:38']);
  assert.equal(en.chips[1].title, 'Pléiades Neo (Legion) · VHR2 — 5,775.4 ha burned in this image');
  assert.equal(en.legend[0].blurb, 'Last detection of the window. The last image dates from Aug 1 11:38: '
    + 'after it, nobody redrew this fire. ↺ replays it from the start.');
  assert.equal(en.legend[1].label, 'perimeter on Aug 1 11:38');
  assert.equal(en.legend.at(-1).label, 'final EFFIS perimeter');
  assert.match(en.legend.at(-1).blurb, /^37,191 ha — EFFIS’s automatic detection/);
  assert.match(en.legend.at(-1).blurb, /announces 47,910\.$/);
  assert.equal(en.acquired, 'Aug 1 11:38 UTC');
});

test('the same layer, a moment later, in French — byte for byte what it printed before', () => {
  const fr = withLocale('fr', visible);
  assert.equal(fr.coverage, '■ 1ᵉʳ août 12:44 UTC · dernière détection');
  assert.equal(fr.chips[0].label, '↺ Rejouer');
  assert.equal(fr.chips[0].title, 'Rejouer les 10 jours en 24 s — ■ 1ᵉʳ août 12:44 UTC · dernière détection');
  assert.equal(fr.chips[1].label, '24 juil. 09:05');
  assert.equal(fr.chips[1].title, 'Pléiades Neo (Legion) · VHR2 — 5\u202f775,4 ha brûlés à cette image');
  assert.equal(fr.legend[0].blurb, 'Dernière détection de la fenêtre. La dernière image, elle, date du 1ᵉʳ août 11:38 : '
    + 'après elle, plus personne n’a redessiné ce feu. ↺ pour rejouer depuis le départ.');
  assert.equal(fr.legend.at(-1).blurb, '37\u202f191 ha — la détection automatique d’EFFIS, sans zone d’intérêt ni '
    + 'échéance, continue après l’arrêt des cartographes. GDACS, qui note une ALERTE et non une surface, en annonce 47 910.');
});

test('play on the closing frame rewinds to the first detection', () => {
  layer.setParams({ play: true });
  layer.setParams({ play: false });
  const en = withLocale('en', visible);
  assertNoFrench(en, { allow: SENSORS });
  assert.equal(en.chips[0].label, '▶ Play');
  assert.equal(en.coverage, '▶ Jul 22 11:55 UTC · first detection');
  assert.equal(withLocale('fr', () => layer.getRowControls().chips[0].label), '▶ Jouer');
});

test('a step with fronts and flames, paused and playing, in English', (t) => {
  t.after(() => layer.destroy(viewer));
  layer.setParams({ step: 'del-product' });
  const paused = withLocale('en', visible);
  assertNoFrench(paused, { allow: SENSORS });
  assert.equal(paused.chips[0].label, '▶ Resume');
  assert.equal(paused.coverage, '❚❚ Jul 24 09:05 UTC · day 2 of 10');
  assert.deepEqual(paused.legend.slice(0, 4).map((line) => line.label), [
    '❚❚ Jul 24 09:05 UTC · day 2 of 10', 'perimeter on Jul 24 09:05', 'active fire front', 'visible flames',
  ]);
  assert.equal(paused.legend[0].blurb, 'Cursor stopped. ▶ resumes playing the 10 days in 24 s.');
  assert.equal(paused.legend[1].blurb, '5,775.4 ha burned, as mapped by Copernicus EMS on a Pléiades Neo (Legion) '
    + 'image of Jul 24 09:05 UTC. The figure is the publisher’s own, never recomputed from the drawing.');
  assert.ok(paused.legend.some((line) => line.label === 'hotspot < 10 MW'));
  // French, same state: the pinned strings of the harness.
  assert.equal(withLocale('fr', () => layer.getRowControls().legend[2].label), 'front de feu actif');

  layer.setParams({ play: true });
  const playing = withLocale('en', visible);
  assertNoFrench(playing, { allow: SENSORS });
  assert.match(playing.chips[0].label, /^❚❚ Jul 24 09:05 UTC$/);
  assert.equal(playing.chips[0].title, '▶ Jul 24 09:05 UTC · day 2 of 10 — click to pause');
  assert.equal(playing.legend[0].blurb, 'Playing the 10 days in 24 s. Nothing is interpolated between two satellite '
    + 'images: the map holds the last measurement, and the hotspots carry the gap.');
  layer.setParams({ play: false });
});

