// src/defaultView.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CITY_VIEW, defaultViewFetchBox } from './defaultView.js';
import { DEFAULT_CITY_VIEW as VIA_CAMERA } from './camera.js';
import { ROAD_FETCH_TIERS, buildOverpassQuery } from './data/trafficBounds.js';

/**
 * The box `scripts/qa-span-par-viewport.mjs` captured in the Overpass POST
 * body on 2026-09-16, on ALL ELEVEN window sizes it sweeps — the wire truth
 * this file exists to keep the derivation honest against.
 */
const MEASURED_ON_THE_WIRE = '48.84,2.26,48.89,2.31';

test('the derived cell is the one the app was measured asking for', () => {
  // THE FAILURE THIS CATCHES. `scripts/warm-road-cells.mjs` pre-warms a cell
  // it computes rather than a cell it observes, because a browser on the VPS
  // costs an image. Move the default view, or a band's `snapDeg`, and the
  // warmer would keep warming a cell nobody visits — with nothing to notice,
  // since a useless request looks exactly like a useful one.
  //
  // If this fails: re-run `node scripts/qa-span-par-viewport.mjs --url …`,
  // read the VERDICT line, and put its box here. Do not "fix" it by reading
  // the derivation's own output — that is the check deleting itself.
  const { box } = defaultViewFetchBox();
  assert.equal(`${box.south},${box.west},${box.north},${box.east}`, MEASURED_ON_THE_WIRE);
});

test('the default view lands in the street band, which is what makes it warmable', () => {
  // A view that settled in `metro` would ask for a 0.30° arterial box, which
  // is a different cell AND a different class list — the warmer would be
  // warming the right coordinates of the wrong question.
  const { tier } = defaultViewFetchBox();
  assert.equal(tier.id, 'street');
  assert.ok(tier.fullClasses, 'the street band is the only one with a full-graph pass');
});

test('the look-at point is ahead of the camera, not under it', () => {
  // The whole reason `deriveFetchCenter` exists: at -30° the reader is looking
  // about a kilometre up-range, and centring the box on the nadir would fetch
  // a neighbourhood they are not looking at.
  const { center } = defaultViewFetchBox();
  const dLatM = (center.lat - DEFAULT_CITY_VIEW.lat) * 111320;
  const dLonM = (center.lon - DEFAULT_CITY_VIEW.lon) * 111320
    * Math.cos((DEFAULT_CITY_VIEW.lat * Math.PI) / 180);
  const aheadM = Math.hypot(dLatM, dLonM);
  // 600 m at a 30° depression is 600/tan(30°) ≈ 1 039 m.
  assert.ok(Math.abs(aheadM - 1039) < 15, `${aheadM.toFixed(0)} m ahead`);
  // Heading 315° is north-west: north of the camera and west of it.
  assert.ok(dLatM > 0, 'north of the camera');
  assert.ok(dLonM < 0, 'west of the camera');
});

test('the look-at point is comfortably inside its own cell, not on an edge', () => {
  // Half a lattice step of centre snap must never move the box off the point
  // being looked at. Measured margin here, not asserted in the abstract.
  const { center, box, tier } = defaultViewFetchBox();
  const marginLat = Math.min(center.lat - box.south, box.north - center.lat);
  const marginLon = Math.min(center.lon - box.west, box.east - center.lon);
  assert.ok(marginLat > tier.snapDeg, `lat margin ${marginLat} ≤ one step`);
  assert.ok(marginLon > tier.snapDeg, `lon margin ${marginLon} ≤ one step`);
});

test('the warmer asks the same question the layer asks, byte for byte', () => {
  // The proxy caches on the query BODY. Anything less than identical warms a
  // cell of its own and leaves the reader's cold — the most expensive possible
  // outcome, since it pays the upstream cost and delivers none of the benefit.
  const { box, tier } = defaultViewFetchBox();
  const major = buildOverpassQuery(box.south, box.west, box.north, box.east, {
    classes: tier.classes, timeoutSec: 12,
  });
  assert.equal(
    major,
    '[out:json][timeout:12];(way["highway"~"^(motorway|trunk|primary|secondary)$"]'
    + '(48.84,2.26,48.89,2.31););out geom qt;',
  );
  const full = buildOverpassQuery(box.south, box.west, box.north, box.east, {
    classes: tier.fullClasses, timeoutSec: 20,
  });
  assert.ok(full.includes('(48.84,2.26,48.89,2.31)'), full);
  assert.ok(full.includes('residential'), 'the full pass is the one that draws the streets');
});

test('camera.js still exports the same object it always did', () => {
  // It moved out of `camera.js` so Node could read it. Every existing caller
  // imports it from there and must keep working.
  assert.equal(VIA_CAMERA, DEFAULT_CITY_VIEW);
  assert.ok(Object.isFrozen(DEFAULT_CITY_VIEW));
});

test('the band table has not quietly changed under the pinned box', () => {
  const street = ROAD_FETCH_TIERS[0];
  assert.equal(street.id, 'street');
  assert.equal(street.spanDeg, 0.05);
  assert.equal(street.snapDeg, 0.005);
});
