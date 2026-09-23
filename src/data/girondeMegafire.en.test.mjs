// « Grands incendies » (the Gironde replay), end to end in both languages: the
// real module, the real pack from disk, a viewer double with no WebGL. The key
// and the stats are read at CALL time, so one loaded layer answers in whichever
// language the page is in — the property the whole catalog design rests on
// (src/i18n/messages.js).
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

const bands = JSON.parse(readFileSync(new URL('./local_data/gironde_megafire_2026/bands.json', import.meta.url), 'utf8'));
const hotspots = JSON.parse(readFileSync(new URL('./local_data/gironde_megafire_2026/hotspots.json', import.meta.url), 'utf8'));

const viewer = {
  scene: {
    primitives: { add: (primitive) => primitive, contains: () => false, remove() {} },
    postRender: { addEventListener: () => () => {} },
    // No depth texture and no ground collection: the layer draws its points
    // and nothing else, as on a machine without ground primitives.
    frameState: { context: { depthTexture: false } },
  },
};

const warn = console.warn;
console.warn = () => {};
layer.init(viewer);
await layer.enable();
console.warn = warn;

/** Everything the reader can read in the key. */
const key = () => {
  const { legend, legendNote, note } = layer.getRowControls();
  return { legend: legend.map(({ label, blurb }) => ({ label, blurb })), legendNote, note };
};

test('opened on the finished fire: three rings, every detection, in English', () => {
  const en = withLocale('en', key);
  assertNoFrench(en, { allow: ['EFFIS', 'Copernicus EMS', 'NASA FIRMS'] });
  assert.deepEqual(en.legend.map((line) => line.label), [
    'The fire, day by day', 'July 22-23', 'July 24-25', 'July 26 → August 1',
    'Heat seen by satellite', 'Estimated final area (EFFIS)',
  ]);
  assert.equal(en.legend.at(-1).blurb, '37,191 ha, measured after the last survey.');
  assert.equal(en.note, 'A ring shows where satellites saw the heat arrive, not the flame front.');
  const stats = layer.getStats();
  assert.equal(stats.atEnd, true);
  assert.equal(stats.bandsShown, 3);
  assert.equal(stats.count, hotspots.rows.length, 'the finished fire shows every detection');
});

test('the same key in French, in the reader’s words', () => {
  const fr = withLocale('fr', key);
  assert.deepEqual(fr.legend.map((line) => line.label), [
    'Le feu, jour après jour', '22-23 juillet', '24-25 juillet', '26 juillet → 1ᵉʳ août',
    'Chaleur vue par satellite', 'Surface finale estimée (EFFIS)',
  ]);
  assert.equal(fr.legend.at(-1).blurb, '37 191 ha, mesurés après le dernier relevé.');
  // No count in the key: the numbers belong to the bar under the map.
  assert.ok(layer.getRowControls().legend.every((line) => line.count === undefined));
});

test('a stop parks the replay at the end of its stage: one ring, its detections only', () => {
  layer.setParams({ band: 'jul-22-23' });
  const stats = layer.getStats();
  assert.equal(stats.bandsShown, 1);
  assert.equal(stats.playing, false);
  const epoch = Date.parse(hotspots.epoch);
  const end = Date.parse(bands.bands[0].to);
  const expected = hotspots.rows.filter((row) => epoch + row[2] * 60_000 <= end).length;
  assert.equal(stats.count, expected, 'causal: nothing after the stage’s end is drawn');
  // The key does not move with the cursor.
  assert.equal(withLocale('en', key).legend.length, 6);
});

test('play from the end rewinds to the first detection; pause holds it', (t) => {
  t.after(() => layer.destroy(viewer));
  layer.setParams({ band: 2 });
  layer.setParams({ play: true });
  let stats = layer.getStats();
  assert.equal(stats.playing, true);
  assert.equal(stats.atStart, true);
  assert.equal(stats.bandsShown, 0);
  layer.setParams({ play: false });
  stats = layer.getStats();
  assert.equal(stats.playing, false);
  assert.equal(stats.atStart, true);
});
