// Which parked vehicles wear a pin. The rule has three halves, and each one
// failing looks like something else on screen: two pins touching reads as a
// cluster, a pin that hops on every pan reads as the fleet moving, and a
// selected vehicle without a pin loses the mark its card points at.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SHARED_MOBILITY_PIN_MAX,
  SHARED_MOBILITY_PIN_SPACING_PX,
  selectSharedMobilityPins,
  sharedMobilityPinRank,
} from './sharedMobilityPins.js';

/** A dense street: `count` vehicles scattered over a `width` × `height` screen. */
function field(count, width, height, prefix = 'v') {
  const out = [];
  for (let i = 0; i < count; i++) {
    const id = `${prefix}:${i}`;
    const rank = sharedMobilityPinRank(id);
    // Deterministic scatter from the id's own hash, so the fixture needs no RNG.
    out.push({ id, rank, x: (rank % 10_007) / 10_007 * width, y: ((rank >>> 11) % 10_009) / 10_009 * height });
  }
  return out;
}

function minGap(pins, byId) {
  let best = Infinity;
  for (let i = 0; i < pins.length; i++) {
    for (let j = i + 1; j < pins.length; j++) {
      const a = byId.get(pins[i]);
      const b = byId.get(pins[j]);
      best = Math.min(best, Math.hypot(a.x - b.x, a.y - b.y));
    }
  }
  return best;
}

test('no two pins are ever closer than the spacing, over the densest Paris view', () => {
  // 2,175 vehicles on screen was the landing view measured on 2026-09-21.
  const vehicles = field(2_175, 1_440, 900);
  const byId = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
  const pins = selectSharedMobilityPins(vehicles);
  assert.ok(minGap(pins, byId) >= SHARED_MOBILITY_PIN_SPACING_PX, `closest pair ${minGap(pins, byId)} px`);
  // Discreet, the mock's word: a few dozen landmarks, not the fleet again.
  assert.ok(pins.length >= 15 && pins.length <= 35, `${pins.length} pins on a desktop`);
});

test('a phone gets the same density, so fewer pins rather than smaller ones', () => {
  const desktop = selectSharedMobilityPins(field(2_175, 1_440, 900));
  const phone = selectSharedMobilityPins(field(600, 390, 844));
  assert.ok(phone.length >= 4 && phone.length <= 12, `${phone.length} pins on a phone`);
  assert.ok(phone.length < desktop.length / 2);
});

test('a short pan keeps the pins that still have room', () => {
  const vehicles = field(1_500, 1_440, 900);
  const before = selectSharedMobilityPins(vehicles);
  // The camera slid 40 px: every vehicle moves together, and a few leave the screen.
  const panned = vehicles
    .map((vehicle) => ({ ...vehicle, x: vehicle.x - 40 }))
    .filter((vehicle) => vehicle.x >= 0);
  const after = selectSharedMobilityPins(panned, { incumbents: new Set(before) });
  const stillOnScreen = before.filter((id) => panned.some((vehicle) => vehicle.id === id));
  const kept = stillOnScreen.filter((id) => after.includes(id));
  assert.equal(kept.length, stillOnScreen.length, 'an incumbent with room is never displaced');
});

test('the same answer twice pins the same vehicles, whatever order it arrives in', () => {
  const vehicles = field(800, 1_000, 700);
  const once = selectSharedMobilityPins(vehicles);
  const again = selectSharedMobilityPins([...vehicles].reverse());
  assert.deepEqual(again, once);
  assert.equal(sharedMobilityPinRank('lime:1'), sharedMobilityPinRank('lime:1'));
});

test('the selected vehicle is pinned first, and its neighbours make room', () => {
  const vehicles = [
    { id: 'near', x: 100, y: 100, rank: 1 },
    { id: 'chosen', x: 130, y: 100, rank: 9 },
  ];
  assert.deepEqual(selectSharedMobilityPins(vehicles), ['near']);
  assert.deepEqual(selectSharedMobilityPins(vehicles, { forced: 'chosen' }), ['chosen']);
});

test('isolated vehicles each get a pin, and the ceiling still holds', () => {
  const street = [0, 1, 2].map((i) => ({ id: `s:${i}`, x: 100 + i * 300, y: 400, rank: i }));
  assert.equal(selectSharedMobilityPins(street).length, 3);
  const wall = field(20_000, 7_680, 4_320);
  assert.equal(selectSharedMobilityPins(wall).length, SHARED_MOBILITY_PIN_MAX);
  assert.deepEqual(selectSharedMobilityPins([]), []);
  assert.deepEqual(selectSharedMobilityPins(street, { max: 0 }), []);
  assert.deepEqual(selectSharedMobilityPins([{ id: 'x', x: Number.NaN, y: 1, rank: 0 }]), []);
});
