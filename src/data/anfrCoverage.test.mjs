// The ARCEP coverage as the `anfr-fr` layer exposes it: its own block of the
// key with a two-level mode control, a share-linked mode, an imagery layer on
// the globe, and a card on the ground.
// Kept apart from anfrFrance.test.mjs because the coverage state is module-
// level and every test here sets it on purpose.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';

import anfrFranceLayer, {
  ANFR_FR_OVERLAY_SOURCE_ID,
  _anfrCoverageCardForTest,
  _anfrMapStackChangedForTest,
  _openAnfrCoverageCardForTest,
  _setAnfrCoverageForTest,
} from './anfrFrance.js';
import { COVERAGE_FORMAT, encodeCoverage } from './mobileCoverage.js';

const META = Object.freeze({
  format: COVERAGE_FORMAT,
  edition: '2026_T1',
  quarterEnd: '2026-03-31',
  minZoom: 5,
  maxZoom: 12,
  bounds: [-5.36, 41.22, 9.76, 51.2],
  tiles: { 12: { x0: 2074, y0: 1409, cols: 1, rows: 1, count: 1, bits: 'AQ==' } },
  stats: {
    landKm2: 1000,
    histogramKm2: Array.from({ length: 256 }, (_, code) => (code === 0 ? 10 : (code === 255 ? 990 : 0))),
  },
});

function imageryDouble() {
  const layers = [];
  return {
    layers,
    add(layer) { layers.push(layer); },
    remove(layer) {
      const index = layers.indexOf(layer);
      if (index >= 0) layers.splice(index, 1);
      return index >= 0;
    },
  };
}

/**
 * A `Cesium3DTileset` as far as the layer can tell — the prototype is what
 * `instanceof` reads — without a network or a WebGL context behind it.
 */
function tilesetDouble() {
  const tileset = Object.create(Cesium.Cesium3DTileset.prototype);
  const imageryLayers = imageryDouble();
  Object.defineProperty(tileset, 'imageryLayers', { value: imageryLayers });
  Object.defineProperty(tileset, 'isDestroyed', { value: () => false });
  return tileset;
}

function viewerDouble({ globeShow = true, ground = { lon: 2.35, lat: 48.85 }, groundHeight = 35, tileset = null } = {}) {
  const hit = Cesium.Cartesian3.fromDegrees(ground.lon, ground.lat, groundHeight);
  const primitives = tileset ? [tileset] : [];
  return {
    imageryLayers: imageryDouble(),
    scene: {
      requestRender() {},
      primitives: { get length() { return primitives.length; }, get: (i) => primitives[i], add: (p) => primitives.push(p) },
      // A hidden globe answers no height, as the real one does on Google 3D.
      globe: {
        show: globeShow,
        ellipsoid: Cesium.Ellipsoid.WGS84,
        pick: () => hit,
        getHeight: () => (globeShow ? groundHeight : undefined),
      },
      camera: { getPickRay: () => ({}) },
      pickPositionSupported: !globeShow,
      pickPosition: () => hit,
    },
  };
}

function hostDouble() {
  const calls = [];
  return {
    calls,
    setEntries: (source, entries) => calls.push({ source, entries }),
    setVisible() {},
    clearSource: (source) => calls.push({ source, cleared: true }),
  };
}

test('the mode is a share-linked param, accepted before the layer is on and normalized', () => {
  _setAnfrCoverageForTest({ viewer: viewerDouble(), enabled: false });
  assert.deepEqual(anfrFranceLayer.getParams(), { coverage: 'off' });
  assert.equal(anfrFranceLayer.setParams({ coverage: 'free' }), true);
  assert.deepEqual(anfrFranceLayer.getParams(), { coverage: 'free' });
  assert.equal(anfrFranceLayer.setParams({ coverage: '5g' }), true);
  assert.deepEqual(anfrFranceLayer.getParams(), { coverage: 'off' });
  // Params without a coverage key are not a rejection.
  assert.equal(anfrFranceLayer.setParams({}), true);
});

/** The coverage block the key prints, or undefined. */
function coverageBlock() {
  return anfrFranceLayer.getRowControls().legendBlocks?.find((block) => block.key === 'coverage');
}

test('no chip on the row, and no coverage block until the server is known to have a map', () => {
  _setAnfrCoverageForTest({ viewer: viewerDouble(), mode: 'off', meta: null, status: 'missing', enabled: true });
  assert.deepEqual(anfrFranceLayer.getRowControls().chips, [], 'the row is a tile in the key now');
  assert.equal(coverageBlock(), undefined);

  _setAnfrCoverageForTest({ viewer: viewerDouble(), mode: 'off', meta: META, enabled: true });
  const block = coverageBlock();
  assert.equal(block.title, 'Couverture 4G');
  assert.deepEqual(block.legendSegments.map((segment) => segment.label), ['Sans 4G', 'Par opérateur']);
  assert.ok(block.legendSegments.every((segment) => segment.active === false));
  assert.deepEqual(block.legendSegments.map((segment) => segment.toggle), [
    { param: 'coverage', value: 'gaps' },
    { param: 'coverage', value: 'orange' },
  ], '« Par opérateur » opens on Orange before any operator was shown');
  assert.deepEqual(block.legendSubSegments, [], 'no operator strip until « Par opérateur » is lit');
  assert.deepEqual(block.legend, [], 'nothing painted, no class');
  assert.equal(block.note, undefined);
});

test('a lit mode is pressed again to take the coverage away; the operators follow « Par opérateur »', () => {
  _setAnfrCoverageForTest({ viewer: viewerDouble(), mode: 'gaps', meta: META, enabled: true });
  let [gaps, byOperator] = coverageBlock().legendSegments;
  assert.equal(gaps.active, true);
  assert.deepEqual(gaps.toggle, { param: 'coverage', value: 'off' });
  assert.match(gaps.title, /Appuyez de nouveau pour retirer la couverture\.$/);
  assert.equal(byOperator.active, false);

  anfrFranceLayer.setParams({ coverage: 'sfr' });
  const block = coverageBlock();
  [gaps, byOperator] = block.legendSegments;
  assert.equal(byOperator.active, true);
  assert.deepEqual(byOperator.toggle, { param: 'coverage', value: 'off' });
  assert.deepEqual(block.legendSubSegments.map((segment) => [segment.label, segment.active]), [
    ['Orange', false], ['SFR', true], ['Bouygues', false], ['Free', false],
  ]);
  // The lit operator would change nothing, so it is not a control.
  assert.equal(block.legendSubSegments[1].toggle, null);
  assert.deepEqual(block.legendSubSegments[3].toggle, { param: 'coverage', value: 'free' });

  // Back to « Sans 4G », then « Par opérateur » again: it reopens on SFR.
  anfrFranceLayer.setParams({ coverage: 'gaps' });
  assert.deepEqual(coverageBlock().legendSegments[1].toggle, { param: 'coverage', value: 'sfr' });
});

test('a link that asks for coverage on a server without the map keeps its block, unlit, and says why', () => {
  _setAnfrCoverageForTest({ viewer: viewerDouble(), mode: 'gaps', meta: null, status: 'missing', enabled: true });
  const block = coverageBlock();
  const [gaps] = block.legendSegments;
  assert.equal(gaps.active, false);
  assert.equal(gaps.title, 'Carte indisponible sur ce serveur.');
  assert.equal(block.note, 'Carte indisponible sur ce serveur.');
  assert.deepEqual(block.legend, []);
});

test('one imagery layer on the globe for the mode, swapped on a mode change, gone when the row is off', () => {
  const viewer = viewerDouble();
  _setAnfrCoverageForTest({ viewer, mode: 'gaps', meta: META, enabled: true });
  assert.equal(viewer.imageryLayers.layers.length, 1);
  const first = viewer.imageryLayers.layers[0];
  assert.ok(first instanceof Cesium.ImageryLayer);
  anfrFranceLayer.setParams({ coverage: 'sfr' });
  assert.equal(viewer.imageryLayers.layers.length, 1);
  assert.notEqual(viewer.imageryLayers.layers[0], first);
  assert.equal(anfrFranceLayer.getStats().coverage.mode, 'sfr');
  assert.equal(anfrFranceLayer.getStats().coverage.drawn, true);
  anfrFranceLayer.setParams({ coverage: 'off' });
  assert.equal(viewer.imageryLayers.layers.length, 0);
  assert.equal(anfrFranceLayer.getStats().coverage.drawn, false);
});

test('the key carries the coverage block, whose estimate it is, and how to use it — on Google 3D too', () => {
  _setAnfrCoverageForTest({ viewer: viewerDouble(), mode: 'gaps', meta: META, enabled: true });
  const controls = anfrFranceLayer.getRowControls();
  const block = coverageBlock();
  const labels = block.legend.map((entry) => entry.label);
  assert.ok(labels.includes('Opérateurs qui captent'));
  assert.ok(labels.includes('Aucun : zone blanche'));
  // Its own block, not five lines at the foot of the antenna colours.
  assert.equal(controls.legend.some((entry) => entry.label === 'Aucun : zone blanche'), false);
  assert.equal(controls.note, undefined, 'the antenna block carries no coverage sentence');
  assert.equal(block.legendNote, undefined, 'the source sits under the coverage classes');
  assert.equal(block.note,
    'Estimation des opérateurs, publiée par l’ARCEP (mars 2026). Cliquez sur la carte pour voir le réseau à un endroit. Métropole seulement.');

  // The colours are draped on the mesh now, so the key is the same key.
  _setAnfrCoverageForTest({ viewer: viewerDouble({ globeShow: false, tileset: tilesetDouble() }), mode: 'gaps', meta: META, enabled: true });
  assert.deepEqual(coverageBlock().legend, block.legend);
});

test('the mode is draped on Google’s mesh too, bought late or early, swapped and removed with the globe’s', () => {
  const tileset = tilesetDouble();
  const viewer = viewerDouble();
  _setAnfrCoverageForTest({ viewer, mode: 'gaps', meta: META, enabled: true });
  // No mesh in this session yet: the globe alone.
  assert.equal(anfrFranceLayer.getStats().coverage.draped, false);

  // The reader switches to Google 3D: the mesh is bought, the stack announces it.
  viewer.scene.primitives.add(tileset);
  _anfrMapStackChangedForTest({ status: 'ready', activeId: 'photoreal' });
  assert.equal(tileset.imageryLayers.layers.length, 1);
  const draped = tileset.imageryLayers.layers[0];
  assert.ok(draped instanceof Cesium.ImageryLayer);
  assert.notEqual(draped, viewer.imageryLayers.layers[0], 'one layer per collection, never shared');
  // One level past the pyramid: Cesium drapes in [minimumLevel, maximumLevel).
  assert.equal(draped.imageryProvider.maximumLevel, META.maxZoom + 1);
  assert.equal(anfrFranceLayer.getStats().coverage.draped, true);

  // A second announcement does not stack a second drape.
  _anfrMapStackChangedForTest({ status: 'ready', activeId: 'ign-ortho' });
  assert.equal(tileset.imageryLayers.layers.length, 1);

  anfrFranceLayer.setParams({ coverage: 'free' });
  assert.equal(tileset.imageryLayers.layers.length, 1);
  assert.notEqual(tileset.imageryLayers.layers[0], draped);

  anfrFranceLayer.setParams({ coverage: 'off' });
  assert.equal(tileset.imageryLayers.layers.length, 0);
  assert.equal(anfrFranceLayer.getStats().coverage.draped, false);
});

test('a mesh already bought gets the drape the moment the coverage is switched on', () => {
  const tileset = tilesetDouble();
  _setAnfrCoverageForTest({ viewer: viewerDouble({ globeShow: false, tileset }), mode: 'sfr', meta: META, enabled: true });
  assert.equal(tileset.imageryLayers.layers.length, 1);
});

test('on Google 3D the ground card stands on the mesh, not at sea level', () => {
  const viewer = viewerDouble({ globeShow: false, tileset: tilesetDouble(), ground: { lon: 6.93, lat: 45.9 }, groundHeight: 2400 });
  _setAnfrCoverageForTest({ viewer, mode: 'gaps', meta: META, enabled: true, read: async () => ({ inside: true, code: 0 }) });
  assert.equal(_openAnfrCoverageCardForTest(viewer, { x: 10, y: 10 }), true);
  const height = Cesium.Cartographic.fromCartesian(_anfrCoverageCardForTest().position).height;
  assert.ok(height > 2400, `card at ${height} m`);
});

test('a click on bare ground opens the card, reads the point, and rewrites the card with the four operators', async () => {
  const host = hostDouble();
  const viewer = viewerDouble();
  let asked = null;
  _setAnfrCoverageForTest({
    viewer,
    mode: 'gaps',
    meta: META,
    enabled: true,
    overlayHost: host,
    read: async (lon, lat) => {
      asked = { lon, lat };
      return { inside: true, code: encodeCoverage([3, 0, 1, 0]) };
    },
  });
  assert.equal(_openAnfrCoverageCardForTest(viewer, { x: 10, y: 10 }), true);
  assert.equal(_anfrCoverageCardForTest().text, 'Réseau 4G ici\nChargement…');
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(Math.abs(asked.lon - 2.35) < 1e-6 && Math.abs(asked.lat - 48.85) < 1e-6);
  const lines = _anfrCoverageCardForTest().text.split('\n');
  assert.equal(lines[0], '2 opérateurs sur 4 captent ici');
  assert.equal(lines[1], 'Orange : très bon');
  assert.equal(lines[3], 'Bouygues : faible (dehors seulement)');
  const published = host.calls.filter((call) => call.entries).at(-1);
  assert.equal(published.source, ANFR_FR_OVERLAY_SOURCE_ID);
  assert.equal(published.entries[0].id, 'anfr-fr:coverage');
});

test('with the coverage off, a ground click is not taken — it falls through to a dismissal', () => {
  const viewer = viewerDouble();
  _setAnfrCoverageForTest({ viewer, mode: 'off', meta: META, enabled: true, read: async () => ({ inside: false }) });
  assert.equal(_openAnfrCoverageCardForTest(viewer, { x: 10, y: 10 }), false);
  assert.equal(_anfrCoverageCardForTest(), null);
});

test('a slow read that lands after the card was dismissed does not bring it back', async () => {
  const host = hostDouble();
  const viewer = viewerDouble();
  let release;
  _setAnfrCoverageForTest({
    viewer,
    mode: 'gaps',
    meta: META,
    enabled: true,
    overlayHost: host,
    read: () => new Promise((resolve) => { release = resolve; }),
  });
  assert.equal(_openAnfrCoverageCardForTest(viewer, { x: 10, y: 10 }), true);
  anfrFranceLayer.setParams({ coverage: 'off' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(_anfrCoverageCardForTest(), null);
  release({ inside: true, code: 0 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(_anfrCoverageCardForTest(), null);
});
