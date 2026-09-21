// The power grid's NIGHT DRESS, worn under the night atlas (the Noir preset).
//
// By day the four bands are red, orange, yellow and green on a near-black
// casing, chosen against an orthophoto. At night the ground is dark and the
// palette spends its range on hierarchy instead: the transmission tiers warm
// and bright, the sub-transmission tiers cool and receding. These tests hold
// that hierarchy and the one property both dresses share — four bands, four
// colours a reader can tell apart.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  POWER_GRID_NIGHT_DRESS,
  POWER_GRID_TIERS,
  powerTierColor,
} from './powerGridFeed.js';
import { createSubstationOverlayEntry } from './powerGrid.js';

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const peak = (hex) => Math.max(...rgb(hex));
const warmth = (hex) => { const [r, , b] = rgb(hex); return r - b; };

test('every band has a night colour, and the day palette is untouched', () => {
  for (const tier of POWER_GRID_TIERS) {
    assert.ok(POWER_GRID_NIGHT_DRESS[tier.id], tier.id);
    assert.equal(powerTierColor(tier), tier.color, 'by day, the shipped palette');
    assert.equal(powerTierColor(tier.id), tier.color, 'by id as by tier');
    assert.equal(powerTierColor(tier, { night: true }), POWER_GRID_NIGHT_DRESS[tier.id].color);
  }
  assert.equal(powerTierColor('no-such-band', { night: true }), null);
  assert.equal(powerTierColor(null), null);
});

test('at night the four bands stay four distinct colours', () => {
  const night = POWER_GRID_TIERS.map((tier) => powerTierColor(tier, { night: true }));
  assert.equal(new Set(night).size, POWER_GRID_TIERS.length);
});

test('the transmission tiers are warm, the sub-transmission tiers cool', () => {
  const [ehv, high, mid, low] = POWER_GRID_TIERS.map((tier) => POWER_GRID_NIGHT_DRESS[tier.id]);
  assert.ok(warmth(ehv.color) > 0 && warmth(high.color) > 0, '400 and 225 kV are warm');
  assert.ok(warmth(mid.color) < 0 && warmth(low.color) < 0, '150 and 63/90 kV are cool');
});

test('the dress recedes with the band: brightness, halo and opacity never rise', () => {
  const dresses = POWER_GRID_TIERS.map((tier) => POWER_GRID_NIGHT_DRESS[tier.id]);
  for (let i = 1; i < dresses.length; i += 1) {
    assert.ok(dresses[i].haloAlpha <= dresses[i - 1].haloAlpha, `halo ${i}`);
    assert.ok(dresses[i].strokeAlpha <= dresses[i - 1].strokeAlpha, `opacity ${i}`);
  }
  // The two transmission tiers reach the bloom threshold of `noir.js` (0.55
  // on the brightest channel, full at 0.95); the slate 63/90 kV stays under it.
  assert.ok(peak(dresses[0].color) >= 0.95 && peak(dresses[1].color) >= 0.95);
  assert.ok(peak(dresses[3].color) < 0.95);
});

test('a yard label wears the dress the map is wearing', () => {
  const payload = { voltages: [{ v: 400_000, tier: 'ehv' }] };
  const substation = { id: 7, name: 'Poste électrique de Pivoz-Cordier', vi: 0 };
  const day = createSubstationOverlayEntry(substation, { x: 0, y: 0, z: 0 }, payload);
  const night = createSubstationOverlayEntry(substation, { x: 0, y: 0, z: 0 }, payload, { night: true });
  assert.equal(day.accent, POWER_GRID_TIERS[0].color);
  assert.equal(night.accent, POWER_GRID_NIGHT_DRESS.ehv.color);
});
