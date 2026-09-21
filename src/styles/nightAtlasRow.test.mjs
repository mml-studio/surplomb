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
 * every settled visibility change reaches `onVisibility`, every preset change
 * reaches `onStyleChange` — including the ones the follower makes itself.
 */
function page({ style = 'normal', lit = [] } = {}) {
  const enabled = new Set(lit);
  const calls = [];
  const state = { style };
  let follower = null;
  const setStyle = (next) => {
    calls.push(next);
    state.style = next;
    follower.onStyleChange();
  };
  follower = createNightAtlasRowFollower({
    isEnabled: (id) => enabled.has(id),
    getStyle: () => state.style,
    setStyle,
  });
  const move = (ids, on, origin) => {
    for (const id of ids) {
      if (on) enabled.add(id);
      else enabled.delete(id);
      follower.onVisibility({ type: 'visibility', layerId: id, enabled: on, origin });
    }
  };
  return {
    follower,
    calls,
    state,
    // What the row's own switch does: the primary and its followers.
    row: (on, origin = 'user') => move(on
      ? fusionToggleGroupFor('power-grid')
      : nightAtlasRowMembers('power-grid'), on, origin),
    layer: (id, on, origin = 'user') => move([id], on, origin),
    pick: (next) => {
      // The reader presses a preset button.
      state.style = next;
      follower.onStyleChange();
    },
  };
}

test('the grid-and-plants row is the one that brings the night', () => {
  assert.deepEqual(NIGHT_ATLAS_ROWS, ['power-grid']);
  assert.deepEqual(nightAtlasRowMembers('power-grid'),
    ['power-grid', 'rte-generation', 'edf-power-plants', 'fr-hydro-plants']);
});

test('switching the row on moves the preset to Night, and off gives the old one back', () => {
  const p = page({ style: 'normal' });
  p.row(true);
  // Once, although two layers came on: the row flipped once.
  assert.deepEqual(p.calls, ['noir']);
  assert.equal(p.follower.owedStyle, 'normal');
  p.row(false);
  assert.deepEqual(p.calls, ['noir', 'normal']);
  assert.equal(p.follower.owedStyle, null);
});

test('the voice switches the row the way a hand does', () => {
  const p = page({ style: 'thermal' });
  p.layer('power-grid', true, 'voice');
  assert.deepEqual(p.calls, ['noir']);
  p.layer('power-grid', false, 'voice');
  assert.deepEqual(p.calls, ['noir', 'thermal']);
});

test('a share link, a stored session or a context mode never moves the preset', () => {
  for (const origin of ['share-restore', 'local-restore', 'context-restore', 'scene', 'programmatic']) {
    const p = page({ style: 'normal' });
    p.row(true, origin);
    assert.deepEqual(p.calls, [], origin);
    p.row(false, 'user');
    assert.deepEqual(p.calls, [], `${origin}: nothing was owed, so nothing is given back`);
  }
});

test('a preset the reader picks while the row is on is theirs to keep', () => {
  const p = page({ style: 'normal' });
  p.row(true);
  p.pick('retro');
  assert.equal(p.follower.owedStyle, null);
  p.row(false);
  assert.deepEqual(p.calls, ['noir'], 'turning the row off must not undo CRT');
  assert.equal(p.state.style, 'retro');
});

test('a reader already under Night keeps it when the row goes off', () => {
  const p = page({ style: 'noir' });
  p.row(true);
  p.row(false);
  assert.deepEqual(p.calls, []);
  assert.equal(p.state.style, 'noir');
});

test('the row is lit by any of its layers, so one chip counts and the last one out restores', () => {
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

test('a row parked by a context mode keeps its debt until the reader turns it off', () => {
  const p = page({ style: 'anime' });
  p.row(true);
  p.row(false, 'context-restore');
  assert.deepEqual(p.calls, ['noir'], 'a context mode is not the reader asking for daylight');
  p.row(true, 'context-restore');
  p.row(false, 'user');
  assert.deepEqual(p.calls, ['noir', 'anime']);
});

test('layers on no night row are ignored', () => {
  const p = page({ style: 'normal' });
  p.layer('traffic', true);
  p.layer('gas-fr', true);
  assert.deepEqual(p.calls, []);
});

test('a row already lit when the follower starts is not lit again by the next chip', () => {
  // A stored session brought the grid back before the style manager attached.
  const p = page({ style: 'normal', lit: ['power-grid'] });
  p.layer('rte-generation', true);
  assert.deepEqual(p.calls, [], 'the row was lit all along; nothing flipped');
});
