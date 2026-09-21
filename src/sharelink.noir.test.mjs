// Noir's share-link parameters since it became the night atlas.
//
// The film-noir controls (`contrastAmt`, `grainAmt`) are gone, and with them
// their tokens: a link written before 2026-09-21 that carries them restores
// Noir at its defaults rather than feeding a stale number into a new control.
import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeStyleParamState, encodeStyleParamState } from './sharelink.js';
import { noirShader } from './styles/noir.js';

test('every Noir slider travels in the link, and comes back', () => {
  const params = new URLSearchParams('v=2');
  const values = { dimAmt: 0.8, desatAmt: 0.4, glowAmt: 0.3, vignetteAmt: 0.2 };
  encodeStyleParamState(params, 'noir', values);
  assert.deepEqual(decodeStyleParamState(params, 'noir'), values);
  // The link carries exactly the sliders the panel draws.
  assert.deepEqual(Object.keys(values).sort(), Object.keys(noirShader.uniforms).sort());
});

test('a link from the film-noir days restores Noir at its defaults', () => {
  const params = new URLSearchParams('v=2&style=noir&sp=c.130_g.50_v.50');
  // `v` (vignette) kept its token; the two retired controls are ignored.
  assert.deepEqual(decodeStyleParamState(params, 'noir'), { vignetteAmt: 0.5 });
  assert.equal(decodeStyleParamState(new URLSearchParams('v=2&sp=c.130_g.50'), 'noir'), null);
});
