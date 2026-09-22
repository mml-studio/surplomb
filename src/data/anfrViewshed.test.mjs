// The selected mast's line of sight, as the `anfr-fr` row draws it: computed
// once per selection, laid on the globe, said on the card and in the key, and
// gone with the selection. The network-and-canvas half is swapped for a stub;
// the geometry itself is tested in mastViewshed.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';

import anfrFranceLayer, {
  _anfrViewshedForTest,
  _clearAnfrSelectionForTest,
  _selectAnfrForTest,
  _setAnfrStateForTest,
  _setAnfrViewshedForTest,
  anfrSupportId,
  anfrViewshedLine,
} from './anfrFrance.js';
import {
  VIEWSHED_COLOR,
  assembleHeights,
  terrariumToHeights,
  viewshedRgba,
} from './mastViewshedImagery.js';
import { VIEWSHED_HIDDEN, VIEWSHED_VISIBLE, viewshedWindow } from './mastViewshed.js';

const SUPPORT = Object.freeze({
  id: 990001,
  lat: 45.9237,
  lon: 6.8694,
  svc: 8,
  live: 8,
  plan: 0,
  operators: ['ORANGE'],
  systems: ['LTE 800'],
  nature: 'pylône',
  heightM: 30,
});
const PACK = Object.freeze({
  supports: [SUPPORT],
  count: 1,
  inBox: 1,
  truncated: false,
  edition: '2026-08-27',
  national: { count: 1, live: 1, projectOnly: 0, plannedUpgrades: 0 },
  fetchedAt: 1_767_000_000_000,
});

function setup({ globeShow = true } = {}) {
  const added = [];
  const viewer = {
    camera: { computeViewRectangle: () => Cesium.Rectangle.fromDegrees(6.8, 45.9, 6.9, 46) },
    scene: { requestRender() {}, globe: { show: globeShow } },
    imageryLayers: {
      add: (layer) => added.push(layer),
      remove: (layer) => {
        const index = added.indexOf(layer);
        if (index >= 0) added.splice(index, 1);
      },
    },
  };
  const host = { entries: null, setEntries(_, entries) { host.entries = entries; }, setVisible() {}, clearSource() { host.entries = null; } };
  _setAnfrStateForTest({ viewer, overlayHost: host, pack: PACK });
  return { viewer, host, added };
}

const RESULT = Object.freeze({ radiusM: 27_624, horizonM: 27_624, capped: false, area: { share: 0.41 } });

test('selecting a mast with a height computes its line of sight once, from the top of the mast', async () => {
  const { host, added } = setup();
  const calls = [];
  const layer = { tag: 'viewshed' };
  _setAnfrViewshedForTest({
    compute: async (input) => { calls.push(input); return RESULT; },
    layerFactory: () => layer,
  });
  _selectAnfrForTest(anfrSupportId(SUPPORT.id));
  assert.equal(_anfrViewshedForTest().status, 'loading');
  assert.ok(host.entries[0].details.includes('Calcul de la zone d’où l’on voit l’antenne…'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, [{ lon: SUPPORT.lon, lat: SUPPORT.lat, antennaM: 30 }]);
  assert.deepEqual(added, [layer]);
  assert.equal(_anfrViewshedForTest().status, 'ready');
  const card = host.entries[0].details.join('\n');
  assert.match(card, /Visible depuis 41\s% du terrain dans un rayon de 28 km/);
  // Above the source line, which still closes the card.
  assert.match(host.entries[0].details.at(-1), /^Source : ANFR/);
  const entry = anfrFranceLayer.getRowControls().legend.find((row) => row.color === VIEWSHED_COLOR);
  assert.equal(entry.label, 'Terrain d’où l’on voit l’antenne');
  assert.equal(entry.blurb, 'D’après le relief, sans bâtiments ni arbres.');

  // Re-selecting the same mast does not recompute.
  _selectAnfrForTest(anfrSupportId(SUPPORT.id));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.length, 1);

  _clearAnfrSelectionForTest();
  assert.deepEqual(added, []);
  assert.equal(_anfrViewshedForTest(), null);
  assert.equal(anfrFranceLayer.getRowControls().legend.some((row) => row.color === VIEWSHED_COLOR), false);
});

test('a result that lands after the mast was let go is dropped, not drawn', async () => {
  const { added } = setup();
  let release;
  _setAnfrViewshedForTest({ compute: () => new Promise((resolve) => { release = resolve; }), layerFactory: () => ({}) });
  _selectAnfrForTest(anfrSupportId(SUPPORT.id));
  _clearAnfrSelectionForTest();
  release(RESULT);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(added, []);
  assert.equal(_anfrViewshedForTest(), null);
});

test('on Google 3D nothing is fetched, and the card says where to look instead', () => {
  const { host } = setup({ globeShow: false });
  let called = false;
  _setAnfrViewshedForTest({ compute: async () => { called = true; return RESULT; } });
  _selectAnfrForTest(anfrSupportId(SUPPORT.id));
  assert.equal(called, false);
  assert.equal(_anfrViewshedForTest().status, 'photoreal');
  assert.ok(host.entries[0].details.includes('Zone de visibilité : passez en vue Satellite, Plan IGN ou OSM'));
  _clearAnfrSelectionForTest();
});

test('a failed DEM fetch is said on the card, in words a reader can use', async () => {
  const { host } = setup();
  _setAnfrViewshedForTest({ compute: async () => { throw new Error('HTTP 522'); } });
  _selectAnfrForTest(anfrSupportId(SUPPORT.id));
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(host.entries[0].details.includes('Zone de visibilité indisponible'));
  _clearAnfrSelectionForTest();
  _setAnfrViewshedForTest();
});

test('the line of sight is one short line, and nothing when there is none', () => {
  assert.equal(anfrViewshedLine({ status: 'ready', share: 0.2, radiusM: 40_000, horizonM: 52_300, capped: true }),
    'Visible depuis 20 % du terrain dans un rayon de 40 km');
  assert.equal(anfrViewshedLine(null), '');
});

test('terrarium tiles decode and assemble into the window, the antenna at its centre', () => {
  const rgba = new Uint8ClampedArray([128, 0, 0, 255, 128, 100, 128, 255]);
  assert.deepEqual([...terrariumToHeights(rgba)], [0, 100.5]);
  const window = viewshedWindow(6.8694, 45.9237, 2_000);
  const tiles = window.tiles.map((tile) => ({
    tile,
    heights: new Float32Array(512 * 512).fill(tile.x * 1000 + tile.y),
  }));
  const heights = assembleHeights(window, tiles);
  // Every cell came from SOME tile: none is left at the Float32Array's zero.
  assert.ok(heights.every((value) => value > 0));
  const tileOf = (col, row) => ({
    x: Math.floor((window.x0 + col) / 512),
    y: Math.floor((window.y0 + row) / 512),
  });
  const centre = tileOf(window.observerCol, window.observerRow);
  assert.equal(heights[window.observerRow * window.size + window.observerCol], centre.x * 1000 + centre.y);
});

test('only visible cells are painted, in the selection cyan', () => {
  const window = viewshedWindow(6.8694, 45.9237, 500);
  const grid = new Uint8Array(window.size * window.size).fill(VIEWSHED_HIDDEN);
  grid[window.observerRow * window.size + window.observerCol] = VIEWSHED_VISIBLE;
  const { rgba, size } = viewshedRgba({ window, grid });
  let painted = 0;
  for (let i = 0; i < size * size; i++) {
    if (rgba[i * 4 + 3]) {
      painted += 1;
      assert.deepEqual([rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]], [0, 255, 255]);
    }
  }
  assert.ok(painted >= 1 && painted <= 2, String(painted));
});
