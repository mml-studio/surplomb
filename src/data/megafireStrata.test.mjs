// « Temps en 3D »: the geometry that stands the Gironde replay up in the air.
// Pure, so it is pinned here against both toy shapes and the shipped rings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MEGAFIRE_AXIS_MARGIN_M,
  MEGAFIRE_FRAMING,
  MEGAFIRE_STRATA,
  MEGAFIRE_VIEWS,
  megafireAxisAnchor,
  megafireFramingScale,
  megafireGuidePoints,
  megafireRegionFrame,
  megafireStratumHeight,
} from './megafireStrata.js';
import { megafireToMetres } from './megafirePack.js';

const bands = JSON.parse(readFileSync(new URL('./local_data/gironde_megafire_2026/bands.json', import.meta.url), 'utf8'));

/** A one-polygon region from `[lon, lat]` corners. */
const region = (...corners) => [[corners.flat()]];

/** Metres between two `{lon, lat}`, in the pack's flat projection. */
const metres = (a, b) => {
  const [ax, ay] = megafireToMetres(a.lon, a.lat);
  const [bx, by] = megafireToMetres(b.lon, b.lat);
  return Math.hypot(ax - bx, ay - by);
};

test('the two views, and nothing else, are views', () => {
  assert.deepEqual([...MEGAFIRE_VIEWS], ['ground', 'strata']);
});

test('height is the order of the stages at equal steps, lowest first', () => {
  const heights = bands.bands.map((band, index) => megafireStratumHeight(index));
  assert.deepEqual(heights, [6000, 12000, 18000]);
  for (let i = 1; i < heights.length; i += 1) {
    assert.equal(heights[i] - heights[i - 1], MEGAFIRE_STRATA.stepM, 'equal steps: height is not the date to scale');
  }
  assert.equal(megafireStratumHeight(-2), MEGAFIRE_STRATA.baseM);
  assert.equal(megafireStratumHeight(Number.NaN), MEGAFIRE_STRATA.baseM);
});

test('the verticals drop from the silhouette’s tips, one line per tip', () => {
  // A diamond: north, east, south, west. The diagonal directions tie between
  // two tips and must not draw a line twice.
  const diamond = region([-1, 45.1], [-0.9, 45], [-1, 44.9], [-1.1, 45]);
  const points = megafireGuidePoints(diamond);
  assert.equal(points.length, 4);
  const keys = points.map((p) => `${p.lon},${p.lat}`).sort();
  assert.deepEqual(keys, ['-0.9,45', '-1,44.9', '-1,45.1', '-1.1,45'].sort());
  assert.deepEqual(megafireGuidePoints([]), []);
});

test('on the shipped rings every vertical stands on a vertex of the outline it drops from', () => {
  for (const band of bands.bands) {
    const vertices = new Set();
    for (const polygon of band.region) {
      const outer = polygon[0];
      for (let i = 0; i + 1 < outer.length; i += 2) vertices.add(`${outer[i]},${outer[i + 1]}`);
    }
    const points = megafireGuidePoints(band.region);
    assert.ok(points.length >= 4 && points.length <= 8, `${band.id}: ${points.length} verticals`);
    for (const point of points) assert.ok(vertices.has(`${point.lon},${point.lat}`), `${band.id}: ${point.lon},${point.lat}`);
  }
});

test('the time axis stands to the camera’s left, clear of the silhouette by the margin', () => {
  // Looking north, the left is the west: the axis sits west of a square's
  // west edge, level with its middle.
  const square = region([-1.1, 44.9], [-0.9, 44.9], [-0.9, 45.1], [-1.1, 45.1]);
  const anchor = megafireAxisAnchor(square, 0);
  assert.ok(anchor.lon < -1.1);
  assert.ok(Math.abs(anchor.lat - 45) < 1e-4);
  assert.ok(Math.abs(metres(anchor, { lon: -1.1, lat: anchor.lat }) - MEGAFIRE_AXIS_MARGIN_M) < 2);
  // Looking east, the left is the north.
  const east = megafireAxisAnchor(square, 90);
  assert.ok(east.lat > 45.1);
  assert.equal(megafireAxisAnchor([], 16), null);
});

test('from the arrival heading, the real axis stands west of the whole scar, over the sea', () => {
  const last = bands.bands.at(-1);
  const anchor = megafireAxisAnchor(last.region, 16);
  let west = Infinity;
  for (const polygon of last.region) {
    for (let i = 0; i < polygon[0].length; i += 2) west = Math.min(west, polygon[0][i]);
  }
  assert.ok(anchor.lon < west, `${anchor.lon} west of ${west}`);
});

test('the stack’s sphere holds the widest region and its full height', () => {
  const square = region([-1.1, 44.9], [-0.9, 44.9], [-0.9, 45.1], [-1.1, 45.1]);
  const flat = megafireRegionFrame(square, 0);
  const corner = metres({ lon: flat.lon, lat: flat.lat }, { lon: -1.1, lat: 44.9 });
  assert.ok(Math.abs(flat.radiusM - corner) < 2);
  const tall = megafireRegionFrame(square, 9000, 9000);
  assert.equal(tall.heightM, 9000);
  assert.ok(Math.abs(tall.radiusM - Math.hypot(flat.radiusM, 9000)) < 1e-6);
  assert.equal(megafireRegionFrame([], 0), null);
});

test('a narrower window backs the camera off by the map the key leaves free, within bounds', () => {
  assert.equal(megafireFramingScale(MEGAFIRE_FRAMING.referencePx, 941), 1);
  const at1280 = megafireFramingScale(1280, 800);
  assert.ok(at1280 > 1.2 && at1280 < 1.25, String(at1280));
  assert.equal(megafireFramingScale(2560, 1440), 1, 'never closer than the tuned framing');
  assert.equal(megafireFramingScale(900, 700), MEGAFIRE_FRAMING.maxScale);
  assert.equal(megafireFramingScale(600, 400), 1, 'narrower than the chrome: laid out otherwise');
  assert.equal(megafireFramingScale(undefined), 1);
});

test('in portrait the field of view turns vertical, and the camera backs off by height over width', () => {
  assert.ok(Math.abs(megafireFramingScale(390, 844) - 844 / 390) < 1e-9);
  assert.equal(megafireFramingScale(320, 1000), MEGAFIRE_FRAMING.maxPortraitScale);
});
