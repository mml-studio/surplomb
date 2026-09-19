// The gallery encode's pure rules (scripts/build-landing-gallery.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bandRect, CAP_BYTES, climbLadder, GALLERY_LOOPS } from './build-landing-gallery.mjs';

test('the voice band is the page\'s 2.9:1, full width, even-sized, and stays inside the frame', () => {
  const rect = bandRect({ width: 1440, height: 872 }, { centreY: 0.6, aspect: 2.9 });
  assert.equal(rect.width, 1440);
  assert.equal(rect.height % 2, 0);
  assert.ok(Math.abs(rect.width / rect.height - 2.9) < 0.01);
  assert.ok(rect.y >= 0 && rect.y + rect.height <= 872);
  const low = bandRect({ width: 1440, height: 872 }, { centreY: 0.99, aspect: 2.9 });
  assert.equal(low.y + low.height, 872, 'clamped to the bottom edge');
});

test('the ladder stops at the lightest rung that reaches the target', async () => {
  const table = { 50: { bytes: 90, vmaf: 84 }, 46: { bytes: 120, vmaf: 91 }, 42: { bytes: 170, vmaf: 94 } };
  const tried = [];
  const result = await climbLadder([50, 46, 42], async (crf) => { tried.push(crf); return table[crf]; },
    { target: 90, capBytes: 1000 });
  assert.equal(result.chosen.crf, 46);
  assert.equal(result.reached, true);
  assert.deepEqual(tried, [50, 46], 'no heavier rung is encoded once the target is met');
});

test('out of reach under the cap: the best rung under it, flagged', async () => {
  const table = { 50: { bytes: 90, vmaf: 80 }, 46: { bytes: 120, vmaf: 85 }, 42: { bytes: 400, vmaf: 93 } };
  const result = await climbLadder([50, 46, 42], async (crf) => table[crf], { target: 90, capBytes: 300 });
  assert.equal(result.chosen.crf, 46);
  assert.equal(result.reached, false);
  await assert.rejects(climbLadder([50], async () => ({ bytes: 900, vmaf: 99 }), { target: 90, capBytes: 300 }));
});

test('seven loops, each width capped, the stills\' widths and names kept', () => {
  assert.equal(GALLERY_LOOPS.length, 7);
  assert.deepEqual(GALLERY_LOOPS.map((l) => l.key), ['view:01', 'view:02', 'view:03', 'view:04', 'view:05', 'view:06', 'voice-response']);
  for (const loop of GALLERY_LOOPS) for (const w of loop.widths) assert.ok(CAP_BYTES[w] > 0, `${loop.key} ${w}`);
  assert.equal(GALLERY_LOOPS.at(-1).stem, 'voice-bus', 'the voice answer keeps the still\'s name');
});
