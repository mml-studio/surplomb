// The HUD says the same thing in both languages, and that is the claim.
//
// `ALT`, `SUN`, `COLL`, `ONA`, `MGRS` are instrument abbreviations: the French
// page has always printed them, and translating them would invent a French
// cockpit nobody asked for. This file pins that decision so it is a decision
// and not an oversight — the day the product wants a French HUD, these
// assertions are what it has to change on purpose.
import test from 'node:test';
import assert from 'node:assert/strict';

import messages from './hud.i18n.js';
import { messageLeaves } from './i18n/messages.js';

test('every HUD leaf is identical in French and in English', () => {
  const differing = [];
  for (const { path, leaf } of messageLeaves(messages.definition)) {
    if (!leaf) continue;
    const fr = typeof leaf.fr === 'function' ? leaf.fr(...(leaf.sample || [])) : leaf.fr;
    const en = typeof leaf.en === 'function' ? leaf.en(...(leaf.sample || [])) : leaf.en;
    if (fr !== en) differing.push(path);
  }
  assert.deepEqual(differing, [], 'a HUD readout now differs by language — was that meant?');
});

test('the readouts print the units and the symbols the overlay is read by', () => {
  const m = messages('en');
  assert.equal(m.readouts.altSun(320, '12.4'), 'ALT: 320m   SUN: 12.4° EL');
  assert.equal(m.readouts.coll('14:05:09'), 'COLL: 14:05:09Z');
  assert.equal(m.readouts.ona('60.0'), 'ONA: 60.0°');
  assert.equal(m.readouts.position('31U DQ 5075 1173', '48°51\'29.00"N', '002°17\'40.00"E'),
    'MGRS: 31U DQ 5075 1173  LAT: 48°51\'29.00"N  LON: 002°17\'40.00"E');
  assert.equal(messages('fr').readouts.ona('60.0'), m.readouts.ona('60.0'));
});

test('the one sentence on the overlay is the one to translate first', () => {
  assert.equal(messages('fr').awaitingTelemetry, 'Awaiting telemetry...');
  assert.equal(messages('en').awaitingTelemetry, 'Awaiting telemetry...');
});
