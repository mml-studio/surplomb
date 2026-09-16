import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  COARSE_DRILL_LIMIT,
  PICK_SIDE_COARSE_CSS_PX,
  drillPickAt,
  getPickDiagnostics,
  pickAt,
  pickSideDrawingBufferPx,
} from './pickAt.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * A scene that records how it was asked, so a test can assert on the CALL and
 * not only on the answer — the fine path's whole contract is "one argument".
 * @param {{hits?: Array, throws?: boolean, ratio?: number}} [options]
 */
function makeScene({ hits = [], throws = false, ratio = 1 } = {}) {
  const calls = { pick: [], drillPick: [] };
  return {
    calls,
    drawingBufferWidth: Math.round(390 * ratio),
    canvas: { clientWidth: 390 },
    pick(...args) {
      calls.pick.push(args);
      if (throws) throw new Error('scene torn down mid-pick');
      return hits[0];
    },
    drillPick(...args) {
      calls.drillPick.push(args);
      if (throws) throw new Error('scene torn down mid-pick');
      return hits;
    },
  };
}

const POINT = { id: 'station-42', primitive: {} };
const OTHER_POINT = { id: 'station-7', primitive: {} };
/** A photoreal tile feature: non-falsy, and nobody can own it. */
const TILE = { primitive: { isCesium3DTileset: true } };

test('a fine pointer picks exactly what it picked before: one argument, no drill', () => {
  const scene = makeScene({ hits: [POINT] });
  const picked = pickAt(scene, { x: 10, y: 10 }, { coarse: false });
  assert.equal(picked, POINT);
  assert.deepEqual(scene.calls.pick, [[{ x: 10, y: 10 }]], 'position only — no width, no height');
  assert.equal(scene.calls.drillPick.length, 0, 'a mouse never pays for a drill');
});

test('the coarse square is asked for in drawing-buffer pixels, and stays odd', () => {
  // The detail governor can leave the buffer at 2.4× the CSS width mid-pan.
  assert.equal(pickSideDrawingBufferPx(makeScene({ ratio: 2.4 })), 59);
  assert.equal(pickSideDrawingBufferPx(makeScene({ ratio: 1 })), 25, '24 rounds up to the odd 25');
  assert.equal(pickSideDrawingBufferPx(makeScene({ ratio: 1 }), 8), 9);
  assert.equal(pickSideDrawingBufferPx(makeScene({ ratio: 1 }), 1), 3, 'never below Cesium’s own 3');
  assert.equal(pickSideDrawingBufferPx(null), 25, 'a scene mid-teardown still answers a size');
  assert.equal(pickSideDrawingBufferPx(makeScene(), 0), 3);
});

test('a coarse pick drills past the photoreal surface to the thing under the finger', () => {
  const scene = makeScene({ hits: [TILE, POINT], ratio: 1 });
  const picked = pickAt(scene, { x: 10, y: 10 }, { coarse: true });
  assert.equal(picked, POINT, 'the tile carries no id, so it is the map, not the target');
  assert.deepEqual(scene.calls.drillPick, [[{ x: 10, y: 10 }, COARSE_DRILL_LIMIT, 25, 25]]);
  assert.equal(scene.calls.pick.length, 0);
});

test('a coarse pick on nothing but the map still answers the map, so cards still dismiss', () => {
  const scene = makeScene({ hits: [TILE], ratio: 1 });
  assert.equal(pickAt(scene, { x: 1, y: 1 }, { coarse: true }), TILE);
  assert.equal(pickAt(makeScene({ hits: [] }), { x: 1, y: 1 }, { coarse: true }), undefined);
});

test('the frontmost owned hit wins; depth order is not re-sorted', () => {
  const scene = makeScene({ hits: [OTHER_POINT, POINT], ratio: 1 });
  assert.equal(pickAt(scene, { x: 1, y: 1 }, { coarse: true }), OTHER_POINT);
});

test('a pick that throws is a miss, not a broken click handler', () => {
  const scene = makeScene({ hits: [POINT], throws: true });
  assert.equal(pickAt(scene, { x: 1, y: 1 }, { coarse: true }), undefined);
  assert.deepEqual(drillPickAt(scene, { x: 1, y: 1 }, 6, { coarse: true }), []);
});

test('drilling keeps its depth on a mouse and gains the square on a finger', () => {
  const fine = makeScene({ hits: [TILE, POINT] });
  assert.deepEqual(drillPickAt(fine, { x: 2, y: 3 }, 6, { coarse: false }), [TILE, POINT]);
  assert.deepEqual(fine.calls.drillPick, [[{ x: 2, y: 3 }, 6]]);

  const coarse = makeScene({ hits: [TILE, POINT], ratio: 1 });
  assert.deepEqual(drillPickAt(coarse, { x: 2, y: 3 }, 6, { coarse: true }), [TILE, POINT]);
  assert.deepEqual(coarse.calls.drillPick, [[{ x: 2, y: 3 }, 6, 25, 25]]);

  const shallow = makeScene({ hits: [], ratio: 1 });
  drillPickAt(shallow, { x: 0, y: 0 }, 1, { coarse: true });
  assert.equal(shallow.calls.drillPick[0][1], COARSE_DRILL_LIMIT, 'widening without deepening only buys more tiles');
});

test('a limit above one hands back the array instead of a single hit', () => {
  const scene = makeScene({ hits: [TILE, POINT] });
  assert.deepEqual(pickAt(scene, { x: 0, y: 0 }, { coarse: false, limit: 4 }), [TILE, POINT]);
  assert.deepEqual(scene.calls.drillPick, [[{ x: 0, y: 0 }, 4]]);
});

test('a scene or a position that is gone is a miss, never a throw', () => {
  assert.equal(pickAt(null, { x: 0, y: 0 }, { coarse: true }), undefined);
  assert.equal(pickAt(makeScene(), null, { coarse: false }), undefined);
  assert.deepEqual(drillPickAt(null, { x: 0, y: 0 }, 4, { coarse: false }), []);
  assert.deepEqual(drillPickAt({}, { x: 0, y: 0 }, 4, { coarse: true }), []);
});

test('the reach is half a HIG target, and the constants say so out loud', () => {
  assert.equal(PICK_SIDE_COARSE_CSS_PX, 24);
  assert.equal(COARSE_DRILL_LIMIT, 3);
});

test('the seam publishes the numbers a headless harness cannot measure', () => {
  // SwiftShader answers nothing for the bare globe and no Cesium entity paints
  // in headless Chromium, so "did the tap select it" is unprovable there.
  const diagnostics = getPickDiagnostics(makeScene({ ratio: 1 }));
  assert.deepEqual(diagnostics, { coarse: false, cssPx: 0, sidePx: 3, drillLimit: 1 });
});

// ── Source ratchet ──────────────────────────────────────────────────────────
// A new layer written by copying its neighbour inherits `scene.pick(...)` in
// one line and loses the finger with it, silently, on phones only — the one
// class of regression no harness on a laptop can see. So the seam is enforced
// here rather than reviewed: every direct call in `src/data` is listed, with
// the reason it is allowed to stay.
const DIRECT_PICK_ALLOWANCE = new Map([
  // The hover pass: a pointer that has no finger. Widening it would spend
  // three picks per move for a reader who is already precise.
  ['cctv.js', 1],
  // The calibration gizmo already picks a 14 px square of its own.
  ['cctvGizmo.js', 2],
  // Hover again, for the launch-pad cursor.
  ['rocketLaunches.js', 1],
  // Radio's own ±8 px offset sweep, which predates this module and resolves
  // stations by a different rule (see RADIO_PICK_OFFSETS).
  ['radio.js', 1],
  // The seam itself.
  ['pickAt.js', 3],
]);

/** Strip comments so a doc block naming `scene.pick()` is not read as a call. */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

test('no layer reaches past the pick seam without saying why', () => {
  const offenders = [];
  for (const name of readdirSync(HERE)) {
    if (!name.endsWith('.js')) continue;
    const source = stripComments(readFileSync(join(HERE, name), 'utf8'));
    const found = source.match(/\bscene\.(?:pick|drillPick)\(/g) || [];
    const allowed = DIRECT_PICK_ALLOWANCE.get(name) ?? 0;
    if (found.length !== allowed) {
      offenders.push(`${name}: ${found.length} direct pick call(s), ${allowed} allowed`);
    }
  }
  assert.deepEqual(offenders, [], 'use pickAt()/drillPickAt() from ./pickAt.js, or add the site to DIRECT_PICK_ALLOWANCE with its reason');
});
