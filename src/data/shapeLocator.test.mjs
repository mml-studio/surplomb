// src/data/shapeLocator.test.mjs
// Pins the two answers a diagnostic can get from the cadastre — inside a
// shape, or snapped onto the frontage it stands on — and the one it must not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createShapeLocator } from './shapeLocator.js';

// Two terraced parcels facing a street to the south (y < 45.7600 is road).
const WEST = { id: 'W', parts: [[[[4.8300, 45.7600], [4.8302, 45.7600], [4.8302, 45.7603], [4.8300, 45.7603]]]] };
const EAST = { id: 'E', parts: [[[[4.8302, 45.7600], [4.8304, 45.7600], [4.8304, 45.7603], [4.8302, 45.7603]]]] };
// A parcel around a courtyard that belongs to nobody.
const COURT = {
  id: 'C',
  parts: [[
    [[4.8310, 45.7600], [4.8316, 45.7600], [4.8316, 45.7606], [4.8310, 45.7606]],
    [[4.8312, 45.7602], [4.8314, 45.7602], [4.8314, 45.7604], [4.8312, 45.7604]],
  ]],
};

const locator = createShapeLocator([WEST, EAST, COURT]);

test('a point inside a parcel is that parcel, and says it was inside', () => {
  assert.deepEqual(locator.locate(4.8301, 45.7601), { id: 'W', inside: true, distanceM: 0 });
  assert.equal(locator.locate(4.8303, 45.7602).id, 'E');
});

test('a front door a metre into the street lands on the parcel whose frontage it faces', () => {
  // ~1.1 m south of the frontage, in front of E.
  const hit = locator.locate(4.8303, 45.75999, { snapM: 3 });
  assert.equal(hit.id, 'E');
  assert.equal(hit.inside, false);
  assert.ok(hit.distanceM > 0.9 && hit.distanceM < 1.3, String(hit.distanceM));
});

test('without a snap, or beyond it, the street is nobody\'s', () => {
  assert.equal(locator.locate(4.8303, 45.75999), null);
  // ~11 m into the road.
  assert.equal(locator.locate(4.8303, 45.7599, { snapM: 3 }), null);
});

test('a courtyard hole is not the parcel, and snaps back onto it only by its own edge', () => {
  assert.equal(locator.locate(4.8313, 45.7603), null);
  // The middle of a 16 × 22 m courtyard is ~8 m from any edge.
  assert.equal(locator.locate(4.8313, 45.7603, { snapM: 3 }), null);
  const nearEdge = locator.locate(4.83121, 45.7603, { snapM: 3 });
  assert.equal(nearEdge?.id, 'C');
  assert.equal(nearEdge?.inside, false);
});

test('where two shapes both hold a point, the smaller one wins', () => {
  const big = { id: 'BIG', parts: [[[[4.829, 45.759], [4.832, 45.759], [4.832, 45.762], [4.829, 45.762]]]] };
  const both = createShapeLocator([big, WEST]);
  assert.equal(both.locate(4.8301, 45.7601).id, 'W');
});

test('a shape hands back the parts it was indexed with', () => {
  // Stored as float32 offsets: the same rings, to well under a millimetre.
  const back = locator.partsOf('E');
  assert.equal(back[0][0].length, EAST.parts[0][0].length);
  back[0][0].forEach(([lon, lat], i) => {
    assert.ok(Math.abs(lon - EAST.parts[0][0][i][0]) < 1e-8);
    assert.ok(Math.abs(lat - EAST.parts[0][0][i][1]) < 1e-8);
  });
  assert.equal(locator.partsOf('nope'), null);
  assert.equal(locator.size, 3);
});

test('shapes with no id or no ring are skipped, and a bad point is no answer', () => {
  const sparse = createShapeLocator([{ id: '', parts: WEST.parts }, { id: 'X', parts: [] }, EAST]);
  assert.equal(sparse.size, 1);
  assert.equal(sparse.locate(Number.NaN, 45.76, { snapM: 3 }), null);
});
