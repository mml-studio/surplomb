import test from 'node:test';
import assert from 'node:assert/strict';
import { fusionToggleGroupFor } from '../data/layerFusions.js';
import {
  NIGHT_ATLAS_ROWS,
  createNightAtlasRowFollower,
  nightAtlasRowMembers,
} from './nightAtlasRow.js';

/**
 * A page with a layer registry and a preset, wired the way `ui.js` wires it:
 * every settled visibility change reaches `onVisibility`.
 */
function page({ style = 'normal', lit = [] } = {}) {
  const enabled = new Set(lit);
  const calls = [];
  const state = { style };
  const follower = createNightAtlasRowFollower({
    isEnabled: (id) => enabled.has(id),
    getStyle: () => state.style,
    setStyle: (next) => {
      calls.push(next);
      state.style = next;
    },
  });
  const move = (ids, on, origin) => {
    for (const id of ids) {
      if (on) enabled.add(id);
      else enabled.delete(id);
      follower.onVisibility({ type: 'visibility', layerId: id, enabled: on, origin });
    }
  };
  return {
    calls,
    state,
    // What the row's own switch does: on carries the primary and its
    // followers, off takes every member down.
    row: (on, origin = 'user') => move(on
      ? fusionToggleGroupFor('power-grid')
      : nightAtlasRowMembers('power-grid'), on, origin),
    layer: (id, on, origin = 'user') => move([id], on, origin),
    // The reader presses a preset button.
    pick: (next) => { state.style = next; },
  };
}

test('the grid-and-plants row is the one that brings the night', () => {
  assert.deepEqual(NIGHT_ATLAS_ROWS, ['power-grid']);
  assert.deepEqual(nightAtlasRowMembers('power-grid'),
    ['power-grid', 'rte-generation', 'edf-power-plants', 'fr-hydro-plants']);
  // A MEMBER of « Incendies », followed alone (it brings Dusk, below): the
  // row's other mode, the recent world detections, is read on the plain globe.
  assert.deepEqual(nightAtlasRowMembers('gironde-megafire-2026'), ['gironde-megafire-2026']);
});

test('« Grands incendies » brings Dusk, and « Détections récentes » does not', () => {
  const state = { style: 'normal', on: new Set() };
  const calls = [];
  const follower = createNightAtlasRowFollower({
    isEnabled: (id) => state.on.has(id),
    getStyle: () => state.style,
    setStyle: (next) => { state.style = next; calls.push(next); },
  });
  const move = (id, on) => {
    if (on) state.on.add(id); else state.on.delete(id);
    follower.onVisibility({ layerId: id, origin: 'user' });
  };
  move('local-firms', true);
  assert.deepEqual(calls, []);
  // The mode tiles are exclusive: the replay comes on as the detections go.
  move('local-firms', false);
  move('gironde-megafire-2026', true);
  assert.deepEqual(calls, ['dusk']);
  move('gironde-megafire-2026', false);
  assert.deepEqual(calls, ['dusk', 'normal']);
});

test('on, Night; off, Normal', () => {
  const p = page({ style: 'normal' });
  p.row(true);
  // Once, although two layers came on: the row flipped once.
  assert.deepEqual(p.calls, ['noir']);
  p.row(false);
  assert.deepEqual(p.calls, ['noir', 'normal']);
});

test('arriving from the landing page, switching the row off goes back to Normal', () => {
  // The scene link lit the row itself and asked for Night: the row replaced
  // no preset. The first version owed nothing here and left the reader in
  // the dark.
  const p = page({ style: 'normal' });
  p.pick('noir');
  p.row(true, 'share-restore');
  assert.deepEqual(p.calls, [], 'the link sets its own preset; the row adds nothing');
  p.row(false);
  assert.deepEqual(p.calls, ['normal']);
});

test('off means Normal even when the row replaced another preset', () => {
  const p = page({ style: 'retro' });
  p.row(true);
  p.row(false);
  assert.deepEqual(p.calls, ['noir', 'normal']);
});

test('a reader who chose Night before the row still gets Normal when it goes off', () => {
  const p = page({ style: 'noir' });
  p.row(true);
  assert.deepEqual(p.calls, [], 'already at night: nothing to switch on');
  p.row(false);
  assert.deepEqual(p.calls, ['normal']);
});

test('a preset the reader picks while the row is on is theirs to keep', () => {
  const p = page({ style: 'normal' });
  p.row(true);
  p.pick('thermal');
  p.row(false);
  assert.deepEqual(p.calls, ['noir'], 'only Night goes away with the row, never FLIR');
  assert.equal(p.state.style, 'thermal');
});

test('the voice switches the row the way a hand does', () => {
  const p = page({ style: 'normal' });
  p.layer('power-grid', true, 'voice');
  p.layer('power-grid', false, 'voice');
  assert.deepEqual(p.calls, ['noir', 'normal']);
});

test('a share link, a stored session or a context mode never moves the preset', () => {
  for (const origin of ['share-restore', 'local-restore', 'context-restore', 'scene', 'programmatic']) {
    const p = page({ style: 'normal' });
    p.row(true, origin);
    assert.deepEqual(p.calls, [], `${origin} on`);
    p.pick('noir');
    p.row(false, origin);
    assert.deepEqual(p.calls, [], `${origin} off`);
  }
});

test('the row is lit by any of its layers, and the last one out brings Normal', () => {
  const p = page({ style: 'normal' });
  // The reader presses only the EDF register's chip.
  p.layer('edf-power-plants', true);
  assert.deepEqual(p.calls, ['noir']);
  p.layer('power-grid', true);
  // The grid chip goes off, the register is still drawing: the row is still lit.
  p.layer('power-grid', false);
  assert.deepEqual(p.calls, ['noir']);
  p.layer('edf-power-plants', false);
  assert.deepEqual(p.calls, ['noir', 'normal']);
});

test('a row parked by a context mode stays at night until the reader turns it off', () => {
  const p = page({ style: 'normal' });
  p.row(true);
  p.row(false, 'context-restore');
  assert.deepEqual(p.calls, ['noir'], 'a context mode is not the reader asking for daylight');
  p.row(true, 'context-restore');
  p.row(false, 'user');
  assert.deepEqual(p.calls, ['noir', 'normal']);
});

test('layers on no night row are ignored', () => {
  const p = page({ style: 'noir' });
  p.layer('traffic', true);
  p.layer('traffic', false);
  p.layer('gas-fr', true);
  assert.deepEqual(p.calls, []);
});

test('a row already lit when the follower starts is not lit again by the next chip', () => {
  // A stored session brought the grid back before the style manager attached.
  const p = page({ style: 'normal', lit: ['power-grid'] });
  p.layer('rte-generation', true);
  assert.deepEqual(p.calls, [], 'the row was lit all along; nothing flipped');
});
