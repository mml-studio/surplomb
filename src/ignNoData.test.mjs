import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NO_DATA_FLOOR,
  NO_DATA_MIN_PIXELS,
  NO_DATA_RING_FLOOR,
  keyNoDataImage,
  keyNoDataPixels,
} from './ignNoData.js';

const SIDE = 256;

/** A 256×256 RGBA tile, every pixel `rgb`, fully opaque. */
function tile(rgb) {
  const rgba = new Uint8ClampedArray(SIDE * SIDE * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = rgb[0];
    rgba[i + 1] = rgb[1];
    rgba[i + 2] = rgb[2];
    rgba[i + 3] = 255;
  }
  return rgba;
}

function paint(rgba, from, count, rgb) {
  for (let p = from; p < from + count; p += 1) {
    rgba.set(rgb, p * 4);
  }
}

const alphaAt = (rgba, p) => rgba[p * 4 + 3];
const opaqueCount = (rgba) => {
  let n = 0;
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] === 255) n += 1;
  return n;
};

test('the blank tile the Géoplateforme serves past its survey is keyed out whole', () => {
  // Measured 2026-09-23 off Socoa, levels 13-14: 1 651 bytes, 65 536 pixels,
  // one colour, (255, 255, 255).
  const rgba = tile([255, 255, 255]);
  assert.equal(keyNoDataPixels(rgba, SIDE), SIDE * SIDE);
  assert.equal(opaqueCount(rgba), 0);
});

test('a photograph with no pure-white pixel is not touched', () => {
  const rgba = tile([40, 90, 110]);
  // Three bright pixels, the most the land tiles over Ciboure hold at 250+.
  paint(rgba, 1000, 3, [252, 251, 250]);
  const before = rgba.slice();
  assert.equal(keyNoDataPixels(rgba, SIDE), 0);
  assert.deepEqual(rgba, before);
});

test('a few pure-white pixels are a white roof, not a hole in the survey', () => {
  const rgba = tile([60, 60, 60]);
  paint(rgba, 5000, NO_DATA_MIN_PIXELS - 1, [255, 255, 255]);
  assert.equal(keyNoDataPixels(rgba, SIDE), 0);
  assert.equal(opaqueCount(rgba), SIDE * SIDE);
});

test('on a tile the edge crosses, the block and its JPEG fringe go, the photograph stays', () => {
  const rgba = tile([30, 70, 95]);
  // The no-data block: the top half.
  paint(rgba, 0, SIDE * SIDE / 2, [255, 255, 255]);
  const edge = SIDE * SIDE / 2;
  const at = (row, col) => edge + row * SIDE + col;
  // Row 0 under the block: one pixel at the floor, one a notch under it on
  // one channel but light enough for the ring.
  paint(rgba, at(0, 10), 1, [NO_DATA_FLOOR, NO_DATA_FLOOR, NO_DATA_FLOOR]);
  paint(rgba, at(0, 11), 1, [NO_DATA_FLOOR - 1, 255, 255]);
  // Row 1: light, inside the ring. Row 2: light, past it. Row 0: dark sea.
  paint(rgba, at(1, 20), 1, [NO_DATA_RING_FLOOR, 200, 210]);
  paint(rgba, at(2, 30), 1, [NO_DATA_RING_FLOOR, 200, 210]);
  paint(rgba, at(0, 40), 1, [NO_DATA_RING_FLOOR - 1, 200, 210]);

  assert.equal(keyNoDataPixels(rgba, SIDE), SIDE * SIDE / 2 + 3);
  assert.equal(alphaAt(rgba, 0), 0);
  assert.equal(alphaAt(rgba, at(0, 10)), 0, 'the fringe at the floor is keyed');
  assert.equal(alphaAt(rgba, at(0, 11)), 0, 'a light pixel touching the block goes with the ring');
  assert.equal(alphaAt(rgba, at(1, 20)), 0, 'two pixels out is still the ring');
  assert.equal(alphaAt(rgba, at(2, 30)), 255, 'three pixels out is photograph, however light');
  assert.equal(alphaAt(rgba, at(0, 40)), 255, 'a dark pixel beside the block is photograph');
  assert.equal(alphaAt(rgba, SIDE * SIDE - 1), 255);
});

test('a keyed pixel takes the colour of the photograph, so filtering lends it no white', () => {
  const rgba = tile([30, 70, 90]);
  paint(rgba, 0, SIDE * SIDE / 2, [255, 255, 255]);
  keyNoDataPixels(rgba, SIDE);
  // Every kept pixel is (30, 70, 90), so their mean is too.
  assert.deepEqual([...rgba.subarray(0, 4)], [30, 70, 90, 0]);
});

test('a tile that is all white keys to transparent black, not white', () => {
  const rgba = tile([255, 255, 255]);
  keyNoDataPixels(rgba, SIDE);
  assert.deepEqual([...rgba.subarray(0, 4)], [0, 0, 0, 0]);
});

test('an image that cannot be measured is handed back as it came', async () => {
  const image = { width: 0, height: 0 };
  assert.equal(await keyNoDataImage(image), image);
  assert.equal(await keyNoDataImage(undefined), undefined);
});
