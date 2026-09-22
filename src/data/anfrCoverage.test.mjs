// The ARCEP coverage as the `anfr-fr` row exposes it: five chips, a share-
// linked mode, an imagery layer on the globe, a key, and a card on the ground.
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
  Object.defineProperty(tileset, 'tilesLoaded', { value: true });
  return tileset;
}

function viewerDouble({ globeShow = true, ground = { lon: 2.35, lat: 48.85 }, groundHeight = 35, tileset = null } = {}) {
  const hit = Cesium.Cartesian3.fromDegrees(ground.lon, ground.lat, groundHeight);
  const primitives = tileset ? [tileset] : [];
  const frames = [];
  return {
    imageryLayers: imageryDouble(),
    /** Render one frame, as far as the layer's postRender listeners can tell. */
    renderFrame() { for (const listener of [...frames]) listener(); },
    scene: {
      requestRender() {},
      postRender: {
        addEventListener(listener) {
          frames.push(listener);
          return () => frames.splice(frames.indexOf(listener), 1);
        },
      },
      primitives: { get length() { return primitives.length; }, get: (i) => primitives[i], add: (p) => primitives.push(p) },
      // A hidden globe answers no height, as the real one does on Google 3D.
      globe: {
        show: globeShow,
        ellipsoid: Cesium.Ellipsoid.WGS84,
        pick: () => hit,
        getHeight: () => (globeShow ? groundHeight : undefined),
        tilesLoaded: true,
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

test('no chips until the server is known to have a map; five once it is, and the active one turns it off', () => {
  _setAnfrCoverageForTest({ viewer: viewerDouble(), mode: 'off', meta: null, status: 'missing', enabled: true });
  assert.deepEqual(anfrFranceLayer.getRowControls().chips, []);

  _setAnfrCoverageForTest({ viewer: viewerDouble(), mode: 'off', meta: META, enabled: true });
  const chips = anfrFranceLayer.getRowControls().chips;
  assert.deepEqual(chips.map((chip) => chip.label), ['Zones blanches', 'Orange', 'SFR', 'Bouygues', 'Free']);
  assert.ok(chips.every((chip) => chip.state === 'idle'));
  assert.deepEqual(chips[0].params, { coverage: 'gaps' });

  _setAnfrCoverageForTest({ viewer: viewerDouble(), mode: 'orange', meta: META, enabled: true });
  const active = anfrFranceLayer.getRowControls().chips.find((chip) => chip.active);
  assert.equal(active.label, 'Orange');
  assert.deepEqual(active.params, { coverage: 'off' });
});

test('a link that asks for coverage on a server without the map keeps its chip, in error, and says why', () => {
  _setAnfrCoverageForTest({ viewer: viewerDouble(), mode: 'gaps', meta: null, status: 'missing', enabled: true });
  const chips = anfrFranceLayer.getRowControls().chips;
  const gaps = chips.find((chip) => chip.id === 'coverage-gaps');
  assert.equal(gaps.state, 'error');
  assert.equal(gaps.active, false);
  assert.equal(gaps.title, 'Carte indisponible sur ce serveur.');
});

test('one imagery layer on the globe for the mode, swapped on a mode change, gone when the row is off', () => {
  const viewer = viewerDouble();
  _setAnfrCoverageForTest({ viewer, mode: 'gaps', meta: META, enabled: true });
  assert.equal(viewer.imageryLayers.layers.length, 1);
  const first = viewer.imageryLayers.layers[0];
  assert.ok(first instanceof Cesium.ImageryLayer);
  anfrFranceLayer.setParams({ coverage: 'sfr' });
  // The next mode loads out of sight while the current one stays on screen:
  // removing first left the map bare for the frames the new tiles took.
  assert.equal(viewer.imageryLayers.layers.length, 2);
  assert.equal(viewer.imageryLayers.layers[0], first);
  assert.equal(viewer.imageryLayers.layers[1].alpha, 0);
  viewer.renderFrame();
  assert.equal(viewer.imageryLayers.layers.length, 2, 'one settled frame is not yet enough');
  viewer.renderFrame();
  assert.equal(viewer.imageryLayers.layers.length, 1);
  assert.notEqual(viewer.imageryLayers.layers[0], first);
  assert.equal(viewer.imageryLayers.layers[0].alpha, 1);
  assert.equal(anfrFranceLayer.getStats().coverage.mode, 'sfr');
  assert.equal(anfrFranceLayer.getStats().coverage.drawn, true);
  anfrFranceLayer.setParams({ coverage: 'off' });
  assert.equal(viewer.imageryLayers.layers.length, 0);
  assert.equal(anfrFranceLayer.getStats().coverage.drawn, false);
});

test('the key carries the coverage block, whose estimate it is, and how to use it — on Google 3D too', () => {
  _setAnfrCoverageForTest({ viewer: viewerDouble(), mode: 'gaps', meta: META, enabled: true });
  const controls = anfrFranceLayer.getRowControls();
  const labels = controls.legend.map((entry) => entry.label);
  assert.ok(labels.includes('Réseau 4G : opérateurs qui captent'));
  assert.ok(labels.includes('Aucun opérateur : zone blanche'));
  assert.equal(controls.legendNote, undefined, 'the source sits under the coverage classes, not above the antennas');
  assert.equal(controls.note,
    'Estimation des opérateurs, publiée par l’ARCEP (mars 2026). Cliquez sur la carte pour voir le réseau à un endroit. Métropole seulement.');

  // The colours are draped on the mesh now, so the key is the same key.
  _setAnfrCoverageForTest({ viewer: viewerDouble({ globeShow: false, tileset: tilesetDouble() }), mode: 'gaps', meta: META, enabled: true });
  assert.deepEqual(anfrFranceLayer.getRowControls().legend, controls.legend);
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

  // The mesh is replaced at once: a second draped layer, even at alpha 0,
  // rebuilds every loaded tile's draw commands and froze Google 3D 528 ms.
  anfrFranceLayer.setParams({ coverage: 'free' });
  assert.equal(tileset.imageryLayers.layers.length, 1);
  assert.notEqual(tileset.imageryLayers.layers[0], draped);
  assert.equal(tileset.imageryLayers.layers[0].alpha, 1);

  anfrFranceLayer.setParams({ coverage: 'off' });
  assert.equal(tileset.imageryLayers.layers.length, 0);
  assert.equal(anfrFranceLayer.getStats().coverage.draped, false);
});

test('a swap waits for its tiles, gives up waiting after a second and a half, and follows a second press', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  const viewer = viewerDouble();
  _setAnfrCoverageForTest({ viewer, mode: 'gaps', meta: META, enabled: true });
  anfrFranceLayer.setParams({ coverage: 'orange' });
  const incoming = viewer.imageryLayers.layers[1];
  // Tiles still owed: the swap holds.
  incoming.imageryProvider.coveragePending = () => 3;
  viewer.renderFrame();
  viewer.renderFrame();
  assert.equal(viewer.imageryLayers.layers.length, 2);
  // A second press before it lands re-aims the swap rather than stacking one.
  anfrFranceLayer.setParams({ coverage: 'sfr' });
  assert.equal(viewer.imageryLayers.layers.length, 2);
  assert.notEqual(viewer.imageryLayers.layers[1], incoming);
  viewer.imageryLayers.layers[1].imageryProvider.coveragePending = () => 1;
  t.mock.timers.tick(1_501);
  viewer.renderFrame();
  assert.equal(viewer.imageryLayers.layers.length, 1);
  assert.equal(anfrFranceLayer.getStats().coverage.mode, 'sfr');
  // Back to the mode on screen during a swap: the swap is simply dropped.
  anfrFranceLayer.setParams({ coverage: 'free' });
  anfrFranceLayer.setParams({ coverage: 'sfr' });
  assert.equal(viewer.imageryLayers.layers.length, 1);
  assert.equal(viewer.imageryLayers.layers[0].alpha, 1);
});

test('switching the row off mid-swap removes both layers', () => {
  const viewer = viewerDouble();
  _setAnfrCoverageForTest({ viewer, mode: 'gaps', meta: META, enabled: true });
  anfrFranceLayer.setParams({ coverage: 'bouygues' });
  anfrFranceLayer.setParams({ coverage: 'off' });
  assert.equal(viewer.imageryLayers.layers.length, 0);
  viewer.renderFrame();
  assert.equal(viewer.imageryLayers.layers.length, 0);
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

test('a click on bare ground reads the point and shows the card once, with its answer', async () => {
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
  // Nothing on screen yet: a « Chargement… » card rewritten 20 ms later into a
  // taller one standing elsewhere is what the reader saw as a flicker.
  assert.equal(_anfrCoverageCardForTest().text, null);
  assert.equal(host.calls.filter((call) => call.entries).length, 0);
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(Math.abs(asked.lon - 2.35) < 1e-6 && Math.abs(asked.lat - 48.85) < 1e-6);
  const lines = _anfrCoverageCardForTest().text.split('\n');
  assert.equal(lines[0], '2 opérateurs sur 4 captent ici');
  assert.equal(lines[1], 'Orange : très bon');
  assert.equal(lines[3], 'Bouygues : faible (dehors seulement)');
  const published = host.calls.filter((call) => call.entries);
  assert.equal(published.length, 1, 'published once, with the answer');
  assert.equal(published[0].source, ANFR_FR_OVERLAY_SOURCE_ID);
  assert.equal(published[0].entries[0].id, 'anfr-fr:coverage');
  assert.equal(published[0].entries[0].title, '2 opérateurs sur 4 captent ici');
});

test('a read slower than a quarter of a second says it is reading, then answers', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const host = hostDouble();
  const viewer = viewerDouble();
  let release;
  _setAnfrCoverageForTest({
    viewer, mode: 'gaps', meta: META, enabled: true, overlayHost: host,
    read: () => new Promise((resolve) => { release = resolve; }),
  });
  assert.equal(_openAnfrCoverageCardForTest(viewer, { x: 10, y: 10 }), true);
  t.mock.timers.tick(249);
  assert.equal(host.calls.filter((call) => call.entries).length, 0);
  t.mock.timers.tick(1);
  assert.equal(_anfrCoverageCardForTest().text, 'Réseau 4G ici\nChargement…');
  release({ inside: true, code: 0 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(_anfrCoverageCardForTest().text.split('\n')[0], 'Zone blanche : pas de 4G ici');
  assert.equal(host.calls.filter((call) => call.entries).length, 2);
});

test('a second click keeps the open card on screen until the new answer replaces it', async () => {
  const host = hostDouble();
  const viewer = viewerDouble();
  let release = null;
  _setAnfrCoverageForTest({
    viewer, mode: 'gaps', meta: META, enabled: true, overlayHost: host,
    read: () => new Promise((resolve) => { release = resolve; }),
  });
  _openAnfrCoverageCardForTest(viewer, { x: 10, y: 10 });
  release({ inside: true, code: 0 });
  await new Promise((resolve) => setImmediate(resolve));
  _openAnfrCoverageCardForTest(viewer, { x: 20, y: 20 });
  assert.equal(host.calls.filter((call) => call.cleared).length, 0, 'the first card is never cleared in between');
  release({ inside: true, code: encodeCoverage([3, 3, 3, 3]) });
  await new Promise((resolve) => setImmediate(resolve));
  const last = host.calls.filter((call) => call.entries).at(-1);
  assert.equal(last.entries[0].title, 'Les 4 opérateurs captent ici');
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
