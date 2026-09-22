import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

import {
  accumulateCoverageArea,
  buildCoveragePyramid,
  buildTileIndex,
  encodeCoverageTilePng,
  extractCoverageTile,
  halveCoverageStrip,
  mercatorPixelAreaKm2,
  mercatorPixelRowLatitude,
  modeCode,
  packCoverageStrip,
} from './coverageTiler.mjs';
import { coverageLevel, coverageTileExists, encodeCoverage } from '../../src/data/mobileCoverage.js';

test('packing puts each operator in its own two bits and drops everything off the land mask', () => {
  const ops = [
    Uint8Array.of(3, 1, 3),
    Uint8Array.of(2, 0, 3),
    Uint8Array.of(1, 0, 3),
    Uint8Array.of(0, 2, 3),
  ];
  const mask = Uint8Array.of(1, 1, 0);
  const code = new Uint8Array(3);
  const alpha = new Uint8Array(3);
  const land = packCoverageStrip(ops, mask, 3, code, alpha);
  assert.equal(land, 2);
  assert.equal(code[0], encodeCoverage([3, 2, 1, 0]));
  assert.deepEqual([0, 1, 2, 3].map((i) => coverageLevel(code[0], i)), [3, 2, 1, 0]);
  assert.deepEqual([0, 1, 2, 3].map((i) => coverageLevel(code[1], i)), [1, 0, 0, 2]);
  // Sea: every operator at 3 does not make it land.
  assert.equal(code[2], 0);
  assert.equal(alpha[2], 0);
  assert.deepEqual([...alpha], [255, 255, 0]);
});

test('the coarse mode is decided per operator, and a tie goes to the LOWER level', () => {
  // Orange: 3,3,1,1 → tie between 1 and 3 → 1. SFR: 2,2,2,0 → 2.
  const a = encodeCoverage([3, 2, 0, 0]);
  const b = encodeCoverage([3, 2, 0, 0]);
  const c = encodeCoverage([1, 2, 0, 0]);
  const d = encodeCoverage([1, 0, 0, 0]);
  const out = modeCode(a, b, c, d, true, true, true, true);
  assert.equal(coverageLevel(out, 0), 1);
  assert.equal(coverageLevel(out, 1), 2);
  // A sea child does not vote, even with a code under it.
  const sea = encodeCoverage([3, 3, 3, 3]);
  const withSea = modeCode(encodeCoverage([0, 0, 0, 0]), encodeCoverage([0, 0, 0, 0]), sea, sea, true, true, false, false);
  assert.equal(withSea, 0);
});

test('halving keeps a coarse pixel as land only when two of its four children are', () => {
  const srcWidth = 4;
  const code = new Uint8Array(8).fill(encodeCoverage([3, 3, 3, 3]));
  // Left 2×2 block: one land child. Right block: two.
  const alpha = Uint8Array.of(255, 0, 255, 255, 0, 0, 0, 0);
  const dst = { code: new Uint8Array(2), alpha: new Uint8Array(2) };
  halveCoverageStrip({ code, alpha }, dst, { srcWidth, srcRows: 2 });
  assert.deepEqual([...dst.alpha], [0, 255]);
  assert.equal(dst.code[0], 0);
  assert.equal(dst.code[1], encodeCoverage([3, 3, 3, 3]));
});

test('a zoom-12 pixel measures 38.2 m at the equator and shrinks with the cosine of latitude', () => {
  const equator = mercatorPixelAreaKm2(12, 0);
  assert.ok(Math.abs(Math.sqrt(equator * 1e6) - 38.2185) < 1e-3);
  const paris = mercatorPixelAreaKm2(12, 48.85);
  assert.ok(Math.abs(Math.sqrt(paris * 1e6) - 38.2185 * Math.cos((48.85 * Math.PI) / 180)) < 1e-3);
  // Row centres: the first row of the world sits half a pixel under the
  // Mercator limit (85.0511°).
  assert.ok(mercatorPixelRowLatitude(0, 0) > 84.98 && mercatorPixelRowLatitude(0, 0) < 85.0511);
  assert.ok(Math.abs(mercatorPixelRowLatitude(0, 127.5)) < 1e-9);
});

test('the area histogram is keyed on the code and counts land only', () => {
  const histogram = new Float64Array(256);
  const strip = { code: Uint8Array.of(7, 7, 9, 9), alpha: Uint8Array.of(255, 255, 255, 0) };
  accumulateCoverageArea(histogram, strip, { width: 2, rows: 2, z: 12, globalRow: 0 });
  assert.ok(histogram[7] > 0);
  assert.ok(Math.abs(histogram[7] - 2 * mercatorPixelAreaKm2(12, mercatorPixelRowLatitude(12, 0))) < 1e-12);
  assert.ok(Math.abs(histogram[9] - mercatorPixelAreaKm2(12, mercatorPixelRowLatitude(12, 1))) < 1e-12);
});

test('a tile with no land is not extracted, and one with land round-trips through PNG unchanged', async () => {
  const width = 512;
  const code = new Uint8Array(width * 256);
  const alpha = new Uint8Array(width * 256);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      code[y * width + x] = (x * 31 + y) & 255;
      alpha[y * width + x] = (x + y) % 5 ? 255 : 0;
    }
  }
  assert.equal(extractCoverageTile({ code, alpha }, width, 1), null);
  const raw = extractCoverageTile({ code, alpha }, width, 0);
  const png = await encodeCoverageTilePng(raw);
  assert.equal(png[25], 4, 'grey+alpha colour type');
  const names = [];
  for (let p = 8; p < png.length;) {
    const len = png.readUInt32BE(p);
    names.push(png.toString('ascii', p + 4, p + 8));
    p += 12 + len;
  }
  for (const chunk of ['gAMA', 'iCCP', 'sRGB', 'cHRM']) {
    assert.ok(!names.includes(chunk), `${chunk} would let a browser colour-manage the codes`);
  }
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < 256 * 256; i++) {
    const a = raw[2 * i + 1];
    assert.equal(data[i * info.channels + info.channels - 1], a);
    if (a) assert.equal(data[i * info.channels], raw[2 * i]);
  }
});

test('the tile index is a bounding range and a bitset the client can read back', () => {
  const index = buildTileIndex([[10, 20], [12, 21], [11, 20]]);
  assert.deepEqual({ x0: index.x0, y0: index.y0, cols: index.cols, rows: index.rows, count: index.count },
    { x0: 10, y0: 20, cols: 3, rows: 2, count: 3 });
  const meta = { tiles: { 7: index } };
  assert.equal(coverageTileExists(meta, 7, 10, 20), true);
  assert.equal(coverageTileExists(meta, 7, 11, 20), true);
  assert.equal(coverageTileExists(meta, 7, 12, 21), true);
  assert.equal(coverageTileExists(meta, 7, 12, 20), false);
  assert.equal(coverageTileExists(meta, 7, 9, 20), false);
  assert.equal(coverageTileExists(meta, 6, 10, 20), false);
  assert.equal(buildTileIndex([]), null);
});

test('the pyramid streams a raster into every zoom and totals its area', async () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-pyramid-'));
  try {
    // Two tiles wide, one tile tall, at zoom 3 — tile (5, 3) and (6, 3).
    const dataCols = 512;
    const dataRows = 256;
    const ops = [0, 1, 2, 3].map(() => new Uint8Array(dataCols * dataRows));
    const mask = new Uint8Array(dataCols * dataRows);
    for (let y = 0; y < dataRows; y++) {
      for (let x = 0; x < 256; x++) {
        // Left tile: land, Orange very good, nobody else. Right tile: sea.
        mask[y * dataCols + x] = 1;
        ops[0][y * dataCols + x] = 3;
      }
    }
    const result = await buildCoveragePyramid({
      readRows: (rowStart, rows) => ({
        ops: ops.map((op) => op.subarray(rowStart * dataCols, (rowStart + rows) * dataCols)),
        mask: mask.subarray(rowStart * dataCols, (rowStart + rows) * dataCols),
      }),
      dataCols,
      dataRows,
      originTileX: 5,
      originTileY: 3,
      maxZoom: 3,
      minZoom: 1,
      outDir,
    });
    assert.deepEqual(Object.keys(result.tiles).sort(), ['1', '2', '3']);
    assert.equal(result.tiles[3].count, 1);
    assert.ok(fs.existsSync(path.join(outDir, '3', '5', '3.png')));
    assert.ok(!fs.existsSync(path.join(outDir, '3', '6', '3.png')));
    assert.ok(fs.existsSync(path.join(outDir, '2', '2', '1.png')));
    assert.ok(fs.existsSync(path.join(outDir, '1', '1', '0.png')));
    const code = encodeCoverage([3, 0, 0, 0]);
    const total = result.histogram.reduce((sum, v) => sum + v, 0);
    assert.ok(result.histogram[code] > 0);
    assert.equal(result.histogram[code], total);
    // Zoom 2 halves the one land tile into a quarter of a tile, still Orange-only.
    const { data, info } = await sharp(fs.readFileSync(path.join(outDir, '2', '2', '1.png')))
      .raw().toBuffer({ resolveWithObject: true });
    // Tile (2, 1) at zoom 2 covers zoom-3 tiles (4..5, 2..3); ours is (5, 3): its bottom-right quarter.
    const at = (x, y) => [data[(y * 256 + x) * info.channels], data[(y * 256 + x) * info.channels + info.channels - 1]];
    assert.deepEqual(at(200, 200), [code, 255]);
    assert.deepEqual(at(50, 50)[1], 0);
    assert.equal(result.files, 3);
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});
