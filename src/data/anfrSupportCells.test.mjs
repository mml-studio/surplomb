// The city view's supports kept by grid cell: what a camera stop asks the
// register, and that what it draws is what a request for its own box returned.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ANFR_CELL_DEG,
  anfrCellBlockBox,
  anfrCellIndex,
  anfrCellsPerRequest,
  createAnfrSupportCells,
  planAnfrCellBlocks,
} from './anfrSupportCells.js';

const MAX_BOX_DEG = 0.35;

/** A dense synthetic register: one support every ~0.004°, Paris and Brest. */
function register() {
  const rows = [];
  let id = 1;
  for (const [lat0, lon0] of [[48.6, 2.0], [48.2, -4.7]]) {
    for (let i = 0; i < 180; i++) {
      for (let j = 0; j < 180; j++) rows.push({ id: id++, lat: lat0 + i * 0.0041, lon: lon0 + j * 0.0043 });
    }
  }
  // Two supports exactly on a cell edge, where two blocks both answer them.
  rows.push({ id: id++, lat: 48.85, lon: 2.3 }, { id: id++, lat: 48.8375, lon: 2.325 });
  return rows;
}
const REGISTER = register();

const inside = (row, box) => row.lat >= box.south && row.lat <= box.north && row.lon >= box.west && row.lon <= box.east;

/** The proxy, as `/api/anfr-fr/supports` answers: the rows inside the box, and the ceiling enforced. */
function proxy() {
  const asked = [];
  const fetchBlock = async (box) => {
    asked.push({ box });
    const numbers = Object.fromEntries(Object.entries(box).map(([key, value]) => [key, Number(value)]));
    const ceiling = MAX_BOX_DEG + 1e-9;
    if (numbers.north - numbers.south > ceiling || numbers.east - numbers.west > ceiling) {
      throw new Error(`HTTP 400 for ${JSON.stringify(box)}`);
    }
    const supports = REGISTER.filter((row) => inside(row, numbers));
    return { supports, count: supports.length, inBox: supports.length, truncated: false, edition: '2026-08-27', fetchedAt: 1 };
  };
  return { asked, fetchBlock };
}

const ids = (answer) => answer.supports.map((row) => row.id);
const expected = (box) => REGISTER.filter((row) => inside(row, box)).map((row) => row.id).sort((a, b) => a - b);

test('one request covers a view of the entry span, and asks at most the proxy’s ceiling', () => {
  assert.equal(anfrCellsPerRequest(MAX_BOX_DEG), 14);
  const view = { south: 48.7013, west: 2.1107, north: 49.0213, east: 2.4307 }; // 0.32°
  const range = [anfrCellIndex(view.south), anfrCellIndex(view.north)];
  const cells = [];
  for (let row = range[0]; row <= range[1]; row++) {
    for (let col = anfrCellIndex(view.west); col <= anfrCellIndex(view.east); col++) cells.push([row, col]);
  }
  const blocks = planAnfrCellBlocks(cells, 14);
  assert.equal(blocks.length, 1);
  const box = anfrCellBlockBox(blocks[0]);
  assert.ok(Number(box.north) - Number(box.south) <= MAX_BOX_DEG + 1e-9);
  assert.ok(Number(box.south) <= view.south && Number(box.north) >= view.north);
  assert.match(box.south, /^\d+\.\d{5}$/, 'five decimals, so one block is always one URL');
});

test('the supports drawn are exactly those a request for the view box returns', async () => {
  const { fetchBlock } = proxy();
  const store = createAnfrSupportCells({ fetchBlock, maxBoxDeg: MAX_BOX_DEG });
  for (const view of [
    { south: 48.8301, west: 2.2903, north: 48.8702, east: 2.3504 },
    { south: 48.7, west: 2.1, north: 49.02, east: 2.42 },
    // Across the Greenwich meridian's west side: negative longitudes.
    { south: 48.3, west: -4.61, north: 48.45, east: -4.4 },
    // The two supports sitting exactly on cell edges.
    { south: 48.83, west: 2.29, north: 48.86, east: 2.33 },
  ]) {
    const answer = await store.load(view);
    assert.deepEqual(ids(answer), expected(view), 'the same supports, in the register’s order (by id)');
    assert.equal(answer.count, answer.supports.length);
    assert.equal(new Set(ids(answer)).size, answer.supports.length, 'no support twice');
  }
});

test('the same view, a zoom in and a return ask nothing; a pan asks for the strip it uncovered', async () => {
  const { asked, fetchBlock } = proxy();
  const store = createAnfrSupportCells({ fetchBlock, maxBoxDeg: MAX_BOX_DEG });
  const view = { south: 48.8013, west: 2.2517, north: 48.8987, east: 2.3983 };
  assert.equal((await store.load(view)).requested, 1);
  // 11 m: the pan that used to cost a request.
  const nudged = { south: 48.8014, west: 2.2518, north: 48.8988, east: 2.3984 };
  assert.equal((await store.load(nudged)).requested, 0);
  assert.equal((await store.load({ south: 48.84, west: 2.3, north: 48.86, east: 2.33 })).requested, 0);
  const panned = await store.load({ south: 48.8013, west: 2.3017, north: 48.8987, east: 2.4483 });
  assert.equal(panned.requested, 1);
  const strip = asked.at(-1).box;
  assert.ok(Number(strip.east) - Number(strip.west) <= 3 * ANFR_CELL_DEG, `only the new columns: ${JSON.stringify(strip)}`);
  assert.equal((await store.load(view)).requested, 0);
  assert.equal(asked.length, 2);
});

test('two views asking at once share the request for the ground they share', async () => {
  const { asked, fetchBlock } = proxy();
  const store = createAnfrSupportCells({ fetchBlock, maxBoxDeg: MAX_BOX_DEG });
  const a = { south: 48.8, west: 2.25, north: 48.9, east: 2.4 };
  const b = { south: 48.81, west: 2.26, north: 48.89, east: 2.39 };
  const [first, second] = await Promise.all([store.load(a), store.load(b)]);
  assert.equal(asked.length, 1);
  assert.deepEqual(ids(first), expected(a));
  assert.deepEqual(ids(second), expected(b));
});

test('a cell is trusted for the poll’s six hours, then asked for again', async () => {
  const { asked, fetchBlock } = proxy();
  let clock = 0;
  const store = createAnfrSupportCells({ fetchBlock, maxBoxDeg: MAX_BOX_DEG, maxAgeMs: 6 * 3_600_000, now: () => clock });
  const view = { south: 48.8013, west: 2.2517, north: 48.8987, east: 2.3983 };
  await store.load(view);
  clock = 6 * 3_600_000;
  assert.equal((await store.load(view)).requested, 0);
  clock += 1;
  const answer = await store.load(view);
  assert.equal(answer.requested, 1);
  assert.equal(asked.length, 2);
  assert.equal(answer.edition, '2026-08-27', 'the provenance of the answer travels with it');
});

test('a failed request fails the view, and the next stop asks again', async () => {
  let fail = true;
  const { fetchBlock } = proxy();
  const store = createAnfrSupportCells({
    fetchBlock: async (box) => {
      if (fail) throw new Error('ECONNREFUSED');
      return fetchBlock(box);
    },
    maxBoxDeg: MAX_BOX_DEG,
  });
  const view = { south: 48.8, west: 2.25, north: 48.9, east: 2.4 };
  await assert.rejects(store.load(view), /ECONNREFUSED/);
  fail = false;
  const answer = await store.load(view);
  assert.equal(answer.requested, 1);
  assert.deepEqual(ids(answer), expected(view));
});

test('an answer the proxy cut short is drawn once and never kept', async () => {
  const { asked, fetchBlock } = proxy();
  const store = createAnfrSupportCells({
    fetchBlock: async (box) => ({ ...(await fetchBlock(box)), truncated: true }),
    maxBoxDeg: MAX_BOX_DEG,
  });
  const view = { south: 48.8, west: 2.25, north: 48.9, east: 2.4 };
  assert.equal((await store.load(view)).truncated, true);
  assert.equal((await store.load(view)).requested, 1, 'asked again rather than trusted');
  assert.equal(asked.length, 2);
});

test('the cells kept are bounded, least recently drawn out first', async () => {
  const { fetchBlock } = proxy();
  const store = createAnfrSupportCells({ fetchBlock, maxBoxDeg: MAX_BOX_DEG, capacity: 20 });
  const first = { south: 48.8, west: 2.2, north: 48.85, east: 2.25 };
  await store.load(first);
  await store.load({ south: 48.8, west: 2.4, north: 48.85, east: 2.45 });
  await store.load({ south: 48.9, west: 2.4, north: 48.95, east: 2.45 });
  assert.ok(store.size <= 20);
  assert.equal((await store.load(first)).requested, 1, 'the oldest view was let go');
});

test('an answer that lands after the store was cleared is not filed', async () => {
  const { fetchBlock } = proxy();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const store = createAnfrSupportCells({
    fetchBlock: async (box) => { await gate; return fetchBlock(box); },
    maxBoxDeg: MAX_BOX_DEG,
  });
  const view = { south: 48.8, west: 2.25, north: 48.9, east: 2.4 };
  const late = store.load(view);
  store.clear();
  release();
  await assert.rejects(late, /cell unavailable/);
  assert.equal(store.size, 0);
});

test('a diagonal pan asks for the two strips it uncovered, not the whole view again', async () => {
  const { asked, fetchBlock } = proxy();
  const store = createAnfrSupportCells({ fetchBlock, maxBoxDeg: MAX_BOX_DEG });
  const view = { south: 48.7013, west: 2.1107, north: 49.0213, east: 2.4307 }; // 0.32°, 13 × 13 cells
  await store.load(view);
  const panned = { south: view.south + 0.03, west: view.west + 0.03, north: view.north + 0.03, east: view.east + 0.03 };
  const answer = await store.load(panned);
  assert.deepEqual(ids(answer), expected(panned));
  const cells = asked.slice(1).reduce((sum, { box }) => {
    const rows = Math.round((Number(box.north) - Number(box.south)) / ANFR_CELL_DEG);
    const cols = Math.round((Number(box.east) - Number(box.west)) / ANFR_CELL_DEG);
    return sum + rows * cols;
  }, 0);
  assert.equal(answer.requested, 2);
  assert.ok(cells < 60, `${cells} cells asked for, of the 169 in view`);
});

test('a zoom out asks for the thin ring it uncovered, and one box when the ring is nearly the view', () => {
  const ring = (size, width) => {
    const cells = [];
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        if (row < width || row >= size - width || col < width || col >= size - width) cells.push([row, col]);
      }
    }
    return cells;
  };
  // One cell wide around 10 × 10 held: 44 of 144 cells, four strips.
  assert.deepEqual(planAnfrCellBlocks(ring(12, 1), 14), [
    { r0: 0, r1: 0, c0: 0, c1: 11 },
    { r0: 1, r1: 10, c0: 0, c1: 0 },
    { r0: 1, r1: 10, c0: 11, c1: 11 },
    { r0: 11, r1: 11, c0: 0, c1: 11 },
  ]);
  // Five cells wide around 4 × 4 held: 180 of 196, and one box is fewer requests for 9 % more ground.
  assert.deepEqual(planAnfrCellBlocks(ring(14, 5), 14), [{ r0: 0, r1: 13, c0: 0, c1: 13 }]);
});

test('a view over held ground never waits on another view’s request', async () => {
  const { fetchBlock } = proxy();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let hold = false;
  const store = createAnfrSupportCells({
    fetchBlock: async (box) => {
      if (hold) { await gate; throw new Error('HTTP 429'); }
      return fetchBlock(box);
    },
    maxBoxDeg: MAX_BOX_DEG,
  });
  // 4 × 4 cells, then a diagonal pan of two cells: 12 of the 16 new cells are
  // missing, so one box covers them — and the 2 × 2 already held with them.
  await store.load({ south: 48.8013, west: 2.2517, north: 48.8987, east: 2.3483 });
  hold = true;
  // The pan's request hangs, then fails...
  const pan = store.load({ south: 48.8513, west: 2.3017, north: 48.9487, east: 2.3983 });
  // ...and meanwhile a zoom in over the 2 × 2 already held. Raced against a
  // timer, so a zoom that waits on the pan fails here instead of hanging.
  const zoom = await Promise.race([
    store.load({ south: 48.851, west: 2.301, north: 48.899, east: 2.349 }),
    new Promise((_, reject) => { setTimeout(() => reject(new Error('the zoom waited on the pan')), 1000).unref(); }),
  ]);
  assert.equal(zoom.requested, 0);
  assert.ok(zoom.supports.length > 0);
  release();
  await assert.rejects(pan, /HTTP 429/);
});

test('a load that lands first never evicts the cells another load is about to read', async () => {
  const { fetchBlock } = proxy();
  const gates = [];
  let gated = false;
  const store = createAnfrSupportCells({
    fetchBlock: async (box) => {
      if (gated) await new Promise((resolve) => gates.push(resolve));
      return fetchBlock(box);
    },
    maxBoxDeg: MAX_BOX_DEG,
    capacity: 20,
  });
  const here = { south: 48.8013, west: 2.2017, north: 48.8487, east: 2.2483 }; // 2 × 2 cells
  await store.load(here);
  gated = true;
  // Load B pans `here` by one column and waits on its strip; load A goes to a
  // new town, lands first, and fills the store past its capacity.
  const b = store.load({ ...here, west: 2.2267, east: 2.2733 });
  const a = store.load({ south: 48.5013, west: 2.0017, north: 48.6487, east: 2.1483 }); // 7 × 6 cells
  while (gates.length < 2) await new Promise((resolve) => setImmediate(resolve));
  gates[1]();
  await a;
  gates[0]();
  const answer = await b;
  assert.ok(answer.supports.length > 0, 'the view that was waiting still draws');
  assert.ok(store.size <= 20, `${store.size} cells kept`);
});
