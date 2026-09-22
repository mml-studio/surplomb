import test from 'node:test';
import assert from 'node:assert/strict';

import {
  VIEWSHED_HIDDEN,
  VIEWSHED_OUTSIDE,
  VIEWSHED_VISIBLE,
  computeViewshed,
  mercatorGroundPixelM,
  radioHorizonM,
  terrariumHeight,
  viewshedArea,
  viewshedWindow,
  viewshedWindowBounds,
} from './mastViewshed.js';

test('the radio horizon of the national median mast (30 m) is 27.6 km', () => {
  assert.ok(Math.abs(radioHorizonM(30) - 27_624) < 10, String(radioHorizonM(30)));
  // Taller sees further, as the square root.
  assert.ok(radioHorizonM(120) > radioHorizonM(30) * 1.7);
  assert.equal(radioHorizonM(0, 0), 0);
});

test('terrarium decodes sea level, a summit and a trench', () => {
  assert.equal(terrariumHeight(128, 0, 0), 0);
  assert.equal(terrariumHeight(146, 205, 0), 4813);
  assert.equal(terrariumHeight(127, 0, 128), -255.5);
});

test('the window picks the finest zoom that keeps the grid under its ceiling, and centres the antenna', () => {
  const near = viewshedWindow(6.87, 45.92, 5_000);
  assert.equal(near.z, 12);
  assert.equal(near.observerCol, near.radiusPx);
  assert.equal(near.observerRow, near.radiusPx);
  assert.equal(near.size, 2 * near.radiusPx + 1);
  const far = viewshedWindow(6.87, 45.92, 40_000);
  assert.ok(far.z < near.z);
  assert.ok(far.size <= 1_600 + 1);
  assert.ok(Math.abs(far.pixelM - mercatorGroundPixelM(far.z, 45.92)) < 1e-9);
  const [west, south, east, north] = viewshedWindowBounds(near);
  assert.ok(west < 6.87 && east > 6.87 && south < 45.92 && north > 45.92);
});

function grid(size, heightAt) {
  const heights = new Float32Array(size * size);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) heights[row * size + col] = heightAt(col, row);
  }
  return heights;
}

test('on a flat plain every cell inside the disc is in view, and nothing outside it is claimed', () => {
  const size = 101;
  const result = computeViewshed({
    heights: grid(size, () => 100), size, observerCol: 50, observerRow: 50,
    antennaM: 30, pixelM: 50, radiusPx: 50,
  });
  let hidden = 0; let visible = 0; let outside = 0;
  for (const state of result) {
    if (state === VIEWSHED_HIDDEN) hidden += 1;
    else if (state === VIEWSHED_VISIBLE) visible += 1;
    else outside += 1;
  }
  assert.equal(hidden, 0);
  assert.ok(visible > 7_800 && visible < 7_900, String(visible));
  assert.equal(result[0], VIEWSHED_OUTSIDE);
});

test('a ridge hides the valley behind it and not the slope in front', () => {
  const size = 101;
  // A 200 m wall running north–south, 10 cells east of the antenna.
  const heights = grid(size, (col) => (col === 60 ? 300 : 100));
  const result = computeViewshed({
    heights, size, observerCol: 50, observerRow: 50, antennaM: 30, pixelM: 50, radiusPx: 50,
  });
  assert.equal(result[50 * size + 55], VIEWSHED_VISIBLE, 'in front of the wall');
  assert.equal(result[50 * size + 60], VIEWSHED_VISIBLE, 'the wall face itself');
  assert.equal(result[50 * size + 70], VIEWSHED_HIDDEN, 'behind the wall');
  assert.equal(result[50 * size + 30], VIEWSHED_VISIBLE, 'the open side');
  const area = viewshedArea(result, 50);
  assert.ok(area.share > 0.5 && area.share < 0.95, String(area.share));
});

test('the Earth\'s curvature hides a handset past the horizon even on a perfect plain', () => {
  // 1 km cells, a 10 m antenna: horizon ≈ 18 km. Cells at 40 km must be hidden.
  const size = 101;
  const result = computeViewshed({
    heights: grid(size, () => 0), size, observerCol: 50, observerRow: 50,
    antennaM: 10, pixelM: 1_000, radiusPx: 50,
  });
  assert.equal(result[50 * size + 60], VIEWSHED_VISIBLE, '10 km out');
  assert.equal(result[50 * size + 90], VIEWSHED_HIDDEN, '40 km out');
});
