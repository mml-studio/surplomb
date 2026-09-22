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

function viewerDouble({ globeShow = true, ground = { lon: 2.35, lat: 48.85 } } = {}) {
  const hit = Cesium.Cartesian3.fromDegrees(ground.lon, ground.lat, 35);
  return {
    imageryLayers: imageryDouble(),
    scene: {
      requestRender() {},
      globe: { show: globeShow, ellipsoid: Cesium.Ellipsoid.WGS84, pick: () => hit, getHeight: () => 35 },
      camera: { getPickRay: () => ({}) },
      pickPositionSupported: false,
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
  assert.equal(viewer.imageryLayers.layers.length, 1);
  assert.notEqual(viewer.imageryLayers.layers[0], first);
  assert.equal(anfrFranceLayer.getStats().coverage.mode, 'sfr');
  assert.equal(anfrFranceLayer.getStats().coverage.drawn, true);
  anfrFranceLayer.setParams({ coverage: 'off' });
  assert.equal(viewer.imageryLayers.layers.length, 0);
  assert.equal(anfrFranceLayer.getStats().coverage.drawn, false);
});

test('the key carries the coverage block, whose estimate it is, and how to use it — and on Google 3D, only why nothing shows', () => {
  _setAnfrCoverageForTest({ viewer: viewerDouble(), mode: 'gaps', meta: META, enabled: true });
  const controls = anfrFranceLayer.getRowControls();
  const labels = controls.legend.map((entry) => entry.label);
  assert.ok(labels.includes('Réseau 4G : opérateurs qui captent'));
  assert.ok(labels.includes('Aucun opérateur : zone blanche'));
  assert.equal(controls.legendNote, undefined, 'the source sits under the coverage classes, not above the antennas');
  assert.equal(controls.note,
    'Estimation des opérateurs, publiée par l’ARCEP (mars 2026). Cliquez sur la carte pour voir le réseau à un endroit. Métropole seulement.');

  _setAnfrCoverageForTest({ viewer: viewerDouble({ globeShow: false }), mode: 'gaps', meta: META, enabled: true });
  const photoreal = anfrFranceLayer.getRowControls().legend;
  assert.deepEqual(photoreal.map((entry) => entry.color ?? null).filter(Boolean), []);
  assert.match(photoreal.at(-1).label, /^Pas visible en vue Google 3D/);
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
