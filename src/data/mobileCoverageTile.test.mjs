// The coverage tiles' CPU half — decode, keep, repaint — and the page-side
// source that runs it in a worker or, failing that, on the main thread.
import test from 'node:test';
import assert from 'node:assert/strict';

import { COVERAGE_TILE_PX, coverageLut, encodeCoverage } from './mobileCoverage.js';
import {
  COVERAGE_TILE_EDGE,
  coverageTileCode,
  createCoverageTileStore,
  decodeCoverageRgba,
  paintCoverageTile,
} from './mobileCoverageTile.js';
import { createCoverageTileSource } from './mobileCoverageTiles.js';

const PIXELS = COVERAGE_TILE_EDGE * COVERAGE_TILE_EDGE;

/** A decoded tile whose every pixel holds `code`, with sea where `sea(i)`. */
function rgbaOf(code, sea = () => false) {
  const rgba = new Uint8ClampedArray(PIXELS * 4);
  for (let i = 0; i < PIXELS; i++) {
    rgba[i * 4] = typeof code === 'function' ? code(i) : code;
    rgba[i * 4 + 3] = sea(i) ? 0 : 255;
  }
  return rgba;
}

test('the tile edge is the pyramid’s: the worker cannot import the i18n-bearing contract', () => {
  assert.equal(COVERAGE_TILE_EDGE, COVERAGE_TILE_PX);
});

test('a tile that is all land keeps no mask; one with sea keeps a bit per pixel', () => {
  assert.equal(decodeCoverageRgba(rgbaOf(7)).land, null);
  const coastal = decodeCoverageRgba(rgbaOf(7, (i) => i % 2 === 1));
  assert.equal(coastal.land.length, PIXELS / 8);
  assert.equal(coverageTileCode(coastal, 0, 0), 7);
  assert.equal(coverageTileCode(coastal, 1, 0), null);
  assert.equal(coverageTileCode(coastal, 256, 0), null);
});

test('a crop magnifies its square nearest-neighbour, rung by rung, and keeps the sea bare', () => {
  const lut = coverageLut('gaps');
  const dead = encodeCoverage([0, 0, 0, 0]);
  const full = encodeCoverage([3, 3, 3, 3]);
  // Left half dead zone, right half fully served; the bottom row is sea.
  const tile = decodeCoverageRgba(rgbaOf((i) => ((i % 256) < 128 ? dead : full), (i) => i >= PIXELS - 256));
  const out = paintCoverageTile(tile, lut, new Uint32Array(PIXELS), { sx: 64, sy: 128, size: 128 });
  // Source columns 64..191: output x < 128 reads source x < 128 (dead), x ≥ 128 reads served.
  assert.equal(out[0], lut[dead]);
  assert.equal(out[127], lut[dead]);
  assert.equal(out[128], 0, 'served ground is not painted in gaps mode');
  // Output rows 254–255 magnify source row 255, the sea.
  assert.equal(out[255 * 256], 0);
  assert.equal(out[253 * 256], lut[dead]);
});

test('the store decodes a URL once however many ask at once, and forgets the least recent first', async () => {
  const decoded = [];
  const store = createCoverageTileStore(async (url) => {
    decoded.push(url);
    return decodeCoverageRgba(rgbaOf(1));
  }, 2);
  await Promise.all([store.tile('a'), store.tile('a'), store.tile('a')]);
  assert.deepEqual(decoded, ['a']);
  await store.tile('b');
  await store.tile('a'); // a is now the most recent
  await store.tile('c'); // evicts b
  assert.equal(store.has('a'), true);
  assert.equal(store.has('b'), false);
  assert.equal(store.size, 2);
});

test('without a worker the source paints and reads on the main thread, from one decode', async () => {
  let decodes = 0;
  const source = createCoverageTileSource({
    createWorker: () => null,
    decodeInline: async () => { decodes++; return decodeCoverageRgba(rgbaOf(encodeCoverage([0, 0, 0, 0]))); },
  });
  assert.equal(source.backend, 'inline');
  const lut = coverageLut('gaps');
  const buffer = await source.paint('/t/12/1/1.png', lut).promise;
  assert.equal(new Uint32Array(buffer)[0], lut[0]);
  assert.equal(await source.read('/t/12/1/1.png', 5, 5), 0);
  assert.equal(decodes, 1, 'the card reads the tile the drawing decoded');
  const cancelled = source.paint('/t/12/1/1.png', lut);
  cancelled.cancel();
  assert.equal(await cancelled.promise, null);
});

/** A worker double: records what it is sent, answers when told to. */
function workerDouble() {
  const sent = [];
  const worker = {
    sent,
    terminated: false,
    postMessage(message) { sent.push(message); },
    terminate() { this.terminated = true; },
    answer(data) { worker.onmessage({ data }); },
  };
  return worker;
}

test('the worker gets the table with every paint, and its answer comes back as bytes', async () => {
  const worker = workerDouble();
  const source = createCoverageTileSource({ createWorker: () => worker, decodeInline: async () => { throw new Error('not here'); } });
  assert.equal(source.backend, 'worker');
  const lut = coverageLut('free');
  const job = source.paint('/t/12/1/1.png', lut, { sx: 0, sy: 0, size: 128 });
  const paint = worker.sent.find((m) => m.type === 'paint');
  assert.equal(paint.lut, lut);
  assert.deepEqual(paint.crop, { sx: 0, sy: 0, size: 128 });
  const bytes = new Uint32Array(PIXELS).buffer;
  worker.answer({ id: paint.id, buffer: bytes });
  assert.equal(await job.promise, bytes);
});

test('a worker that cannot decode hands every job it owes back to the main thread', async () => {
  const worker = workerDouble();
  const source = createCoverageTileSource({
    createWorker: () => worker,
    decodeInline: async () => decodeCoverageRgba(rgbaOf(encodeCoverage([3, 0, 0, 0]))),
  });
  const read = source.read('/t/12/1/1.png', 0, 0);
  worker.answer({ type: 'ready', ok: false });
  assert.equal(worker.terminated, true);
  assert.equal(source.backend, 'inline');
  assert.equal(await read, encodeCoverage([3, 0, 0, 0]));
});

test('a worker that crashes is replaced by the main thread too', async () => {
  const worker = workerDouble();
  const source = createCoverageTileSource({
    createWorker: () => worker,
    decodeInline: async () => decodeCoverageRgba(rgbaOf(9)),
  });
  const read = source.read('/t/12/1/1.png', 0, 0);
  worker.onerror(new Event('error'));
  assert.equal(await read, 9);
});
