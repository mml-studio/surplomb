import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { LAYER_MANIFEST } from './data/layerManifest.js';
import { fusedIntoFor } from './data/layerFusions.js';
import {
  PHONE_FEATURED_LAYER_IDS,
  PHONE_HEAVY_LAYER_IDS,
  PHONE_SHEET_PEEK_PX,
  phoneSheetKeyboardInset,
  phoneSheetSnapHeights,
  resolvePhoneSheetSnap,
} from './phoneSheetLayout.js';

// iPhone 13 portrait, with the top bar measured at 64 px.
const portrait = phoneSheetSnapHeights({ viewportHeight: 844, topInset: 64 });
// The same handset turned sideways.
const landscape = phoneSheetSnapHeights({ viewportHeight: 390, topInset: 64 });

test('the three snaps ascend, and full stops below the top bar', () => {
  assert.deepEqual(portrait, { peek: 116, half: 422, full: 780 });
  assert.ok(portrait.peek < portrait.half && portrait.half < portrait.full);
});

test('peek is a fixed pixel stack, not a share of the screen', () => {
  assert.equal(portrait.peek, PHONE_SHEET_PEEK_PX);
  assert.equal(landscape.peek, PHONE_SHEET_PEEK_PX);
});

test('landscape gives half 65 % instead of 50 %, because 50 % is two rows', () => {
  assert.equal(landscape.half, Math.round(390 * 0.65));
  assert.equal(portrait.half, Math.round(844 * 0.5));
});

test('a viewport too short for the peek chrome never inverts the snaps', () => {
  const tiny = phoneSheetSnapHeights({ viewportHeight: 140, topInset: 64 });
  assert.ok(tiny.peek <= tiny.half && tiny.half <= tiny.full);
  assert.equal(tiny.full, 76);
});

test('a slow release goes to the nearest snap', () => {
  assert.equal(resolvePhoneSheetSnap({ height: 150, velocity: 0.1, snaps: portrait }), 'peek');
  assert.equal(resolvePhoneSheetSnap({ height: 400, velocity: 0, snaps: portrait }), 'half');
  assert.equal(resolvePhoneSheetSnap({ height: 700, velocity: -0.2, snaps: portrait }), 'full');
});

test('a flick outranks where the finger let go', () => {
  // Released at 200 px — nearest is `peek` — but thrown upward at 1.2 px/ms.
  assert.equal(resolvePhoneSheetSnap({ height: 200, velocity: 1.2, snaps: portrait }), 'half');
  // Released just under `full`, thrown down: the snap below, not the nearest.
  assert.equal(resolvePhoneSheetSnap({ height: 760, velocity: -1.4, snaps: portrait }), 'half');
});

test('a flick past the last snap in its direction settles on the nearest', () => {
  assert.equal(resolvePhoneSheetSnap({ height: 780, velocity: 2, snaps: portrait }), 'full');
  assert.equal(resolvePhoneSheetSnap({ height: 116, velocity: -2, snaps: portrait }), 'peek');
});

test('only a shrink bigger than the URL bar counts as a keyboard', () => {
  assert.equal(phoneSheetKeyboardInset({ innerHeight: 844, visualViewportHeight: 844 }), 0);
  assert.equal(phoneSheetKeyboardInset({ innerHeight: 844, visualViewportHeight: 760 }), 0);
  assert.equal(phoneSheetKeyboardInset({ innerHeight: 844, visualViewportHeight: 508 }), 336);
  assert.equal(phoneSheetKeyboardInset({ innerHeight: 844, visualViewportHeight: null }), 0);
});

test('every featured and heavy id is a real layer', () => {
  const known = new Set(LAYER_MANIFEST.map((entry) => entry.id));
  for (const id of [...PHONE_FEATURED_LAYER_IDS, ...PHONE_HEAVY_LAYER_IDS]) {
    assert.ok(known.has(id), `${id} is not in LAYER_MANIFEST`);
  }
});

test('no featured or heavy id names a fused companion, which has no row', () => {
  // The failure this pins is SILENT: `_groupedPanelLayers()` skips a fused
  // layer, so a featured id that names one simply does not appear, and a heavy
  // id that names one never gets its badge. It cost this list two entries the
  // first time it ran against a real panel.
  for (const id of [...PHONE_FEATURED_LAYER_IDS, ...PHONE_HEAVY_LAYER_IDS]) {
    assert.equal(fusedIntoFor(id) ?? null, null, `${id} is a chip on another row, not a row`);
  }
});

test('a layer is never both the first thing offered and a warning', () => {
  const featured = new Set(PHONE_FEATURED_LAYER_IDS);
  for (const id of PHONE_HEAVY_LAYER_IDS) {
    assert.ok(!featured.has(id), `${id} is both featured and heavy`);
  }
});

test('the peek is re-measured when the credit footer changes size', () => {
  // Cesium fills the footer after the sheet mounts; a peek measured once left
  // it hanging under the screen edge (116 px for 147 px of chrome).
  const source = readFileSync(new URL('./phoneSheet.js', import.meta.url), 'utf8');
  assert.match(source, /new ResizeObserver\(\(\) => \{\s*if \(!drag\) snapTo\(snap\);\s*\}\);\s*creditObserver\.observe\(creditHost\);/);
});
