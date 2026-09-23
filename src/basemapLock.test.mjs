// The rows that impose a basemap while they are lit (`basemapLock.js`).
//
// « Infrastructure numérique » on means Satellite, and off gives back the
// basemap the reader had. The pins below are the cases the obvious version
// gets wrong: a row lit by a companion alone, a row a stored session lit
// before anything was listening, and a reader who was on Satellite already.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fusionToggleGroupFor } from './data/layerFusions.js';
import { nightAtlasRowMembers } from './styles/nightAtlasRow.js';
import { ROW_BASEMAPS, createRowBasemapLock } from './basemapLock.js';

const ROW = 'local-datacenters';

/**
 * A page with a layer registry, a basemap and the controller's lock, wired
 * the way `ui.js` wires them: every settled visibility change reaches
 * `onVisibility`. The switch lands at once here; the controller's own refusal
 * is pinned in `mapStackController.test.mjs`.
 */
function page({ stack = 'osm', lit = [], available = () => true } = {}) {
  const enabled = new Set(lit);
  const switches = [];
  const locks = [];
  const state = { stack, lock: null };
  const lock = createRowBasemapLock({
    isEnabled: (id) => enabled.has(id),
    getStack: () => state.stack,
    setStack: (next) => {
      switches.push(next);
      state.stack = next;
    },
    setLock: (next) => {
      locks.push(next);
      state.lock = next;
    },
    isAvailable: available,
  });
  const move = (ids, on, origin) => {
    for (const id of ids) {
      if (on) enabled.add(id);
      else enabled.delete(id);
      lock.onVisibility({ type: 'visibility', layerId: id, enabled: on, origin });
    }
  };
  return {
    switches,
    locks,
    state,
    // The row's own switch: on carries the primary and its followers, off
    // takes every member down.
    row: (on, origin = 'user') => move(on
      ? fusionToggleGroupFor(ROW)
      : nightAtlasRowMembers(ROW), on, origin),
    layer: (id, on, origin = 'user') => move([id], on, origin),
    sync: () => lock.sync(),
  };
}

test('the digital infrastructure row and the replayed fire impose Satellite', () => {
  assert.deepEqual(ROW_BASEMAPS, {
    'local-datacenters': 'ign-ortho',
    'gironde-megafire-2026': 'ign-ortho',
  });
});

test('on, Satellite; off, the basemap the reader had', () => {
  const p = page({ stack: 'osm' });
  p.row(true);
  // Once, although three layers came on: the row flipped once.
  assert.deepEqual(p.switches, ['ign-ortho']);
  assert.deepEqual(p.locks, [{ stackId: 'ign-ortho', rowId: ROW }]);
  p.row(false);
  assert.deepEqual(p.switches, ['ign-ortho', 'osm']);
  assert.deepEqual(p.locks, [{ stackId: 'ign-ortho', rowId: ROW }, null]);
  assert.equal(p.state.lock, null);
});

test('the lock is taken before the switch and released before the way back', () => {
  // The controller refuses every stack but the lock's while it holds, so the
  // order is the difference between switching and being refused.
  const order = [];
  const enabled = new Set();
  let stack = 'google-roadmap';
  const lock = createRowBasemapLock({
    isEnabled: (id) => enabled.has(id),
    getStack: () => stack,
    setStack: (next) => { order.push(`stack:${next}`); stack = next; },
    setLock: (next) => { order.push(next ? `lock:${next.stackId}` : 'unlock'); },
  });
  enabled.add(ROW);
  lock.onVisibility({ layerId: ROW });
  enabled.delete(ROW);
  lock.onVisibility({ layerId: ROW });
  assert.deepEqual(order, ['lock:ign-ortho', 'stack:ign-ortho', 'unlock', 'stack:google-roadmap']);
});

test('a reader already on Satellite is not switched, on or off', () => {
  const p = page({ stack: 'ign-ortho' });
  p.row(true);
  assert.deepEqual(p.switches, []);
  assert.equal(p.state.lock?.stackId, 'ign-ortho', 'the other basemaps are still refused');
  p.row(false);
  assert.deepEqual(p.switches, []);
  assert.equal(p.state.lock, null);
});

test('every origin locks, not only a reader’s hand', () => {
  // Unlike the preset follower: a share link, a stored session or a context
  // mode that lights the row lights a layer that is read against the ground.
  for (const origin of ['share-restore', 'context', 'programmatic', 'voice']) {
    const p = page({ stack: 'osm' });
    p.row(true, origin);
    assert.deepEqual(p.switches, ['ign-ortho'], origin);
    p.row(false, origin);
    assert.deepEqual(p.switches, ['ign-ortho', 'osm'], origin);
  }
});

test('a companion alone lights the row, and the last one out releases it', () => {
  const p = page({ stack: 'photoreal' });
  p.layer('anfr-fr', true);
  assert.deepEqual(p.switches, ['ign-ortho']);
  p.layer('telegeography-submarine-cables', true);
  assert.equal(p.locks.length, 1, 'a second member does not take the lock again');
  p.layer('anfr-fr', false);
  assert.equal(p.state.lock?.stackId, 'ign-ortho', 'the cables still draw: still lit');
  p.layer('telegeography-submarine-cables', false);
  assert.deepEqual(p.switches, ['ign-ortho', 'photoreal']);
  assert.equal(p.state.lock, null);
});

test('layers on no such row are ignored', () => {
  const p = page({ stack: 'osm' });
  p.layer('power-grid', true);
  p.layer('flights', true);
  p.layer('power-grid', false);
  assert.deepEqual(p.switches, []);
  assert.deepEqual(p.locks, []);
});

test('a row a stored session lit before the follower existed locks at creation', () => {
  const p = page({ stack: 'osm', lit: ['local-datacenters'] });
  assert.deepEqual(p.switches, ['ign-ortho']);
  assert.equal(p.state.lock?.rowId, ROW);
  // …and the reader's first chip press on the row is a switch OFF, which
  // gives back the basemap the session opened on.
  p.row(false);
  assert.deepEqual(p.switches, ['ign-ortho', 'osm']);
});

test('a build that cannot show Satellite locks nothing', () => {
  const p = page({ stack: 'osm', available: (id) => id !== 'ign-ortho' });
  p.row(true);
  p.row(false);
  assert.deepEqual(p.switches, []);
  assert.deepEqual(p.locks, []);
});

test('sync is a no-op when nothing moved', () => {
  const p = page({ stack: 'osm', lit: ['anfr-fr'] });
  p.sync();
  p.sync();
  assert.deepEqual(p.switches, ['ign-ortho']);
  assert.equal(p.locks.length, 1);
});

test('a row switched off before Satellite has landed still goes back', () => {
  // `getStack()` reads the controller's committed stack, which moves only once
  // a switch has finished. A version that went back only "if the globe still
  // shows Satellite" skipped the way home here, and the switch still in
  // flight then left the reader on Satellite with nothing locking it.
  const enabled = new Set();
  const asked = [];
  const lock = createRowBasemapLock({
    isEnabled: (id) => enabled.has(id),
    getStack: () => 'osm',
    setStack: (next) => { asked.push(next); },
    setLock: () => {},
  });
  enabled.add(ROW);
  lock.onVisibility({ layerId: ROW });
  enabled.delete(ROW);
  lock.onVisibility({ layerId: ROW });
  assert.deepEqual(asked, ['ign-ortho', 'osm']);
});
