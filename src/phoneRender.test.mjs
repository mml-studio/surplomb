import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PHONE_GLOBE_SSE,
  PHONE_MAX_PIXEL_RATIO,
  applyPhoneRenderDetail,
  phoneResolutionScale,
} from './phoneRender.js';
import { LITE_GLOBE_SSE } from './perfProfile.js';

test('a phone settles finer than the lite profile it runs, and finer than Cesium’s default', () => {
  assert.ok(PHONE_GLOBE_SSE < LITE_GLOBE_SSE);
  assert.ok(PHONE_GLOBE_SSE < 2);
});

test('the buffer follows the device ratio up to 2, never past it, never under 1', () => {
  assert.equal(PHONE_MAX_PIXEL_RATIO, 2);
  assert.equal(phoneResolutionScale(3), 2);
  assert.equal(phoneResolutionScale(2.75), 2);
  assert.equal(phoneResolutionScale(2), 2);
  assert.equal(phoneResolutionScale(1.5), 1.5);
  assert.equal(phoneResolutionScale(1), 1);
  assert.equal(phoneResolutionScale(0.5), 1);
  assert.equal(phoneResolutionScale(undefined), 1);
  assert.equal(phoneResolutionScale(Number.NaN), 1);
});

test('applying writes both levers and reports them', () => {
  const viewer = { resolutionScale: 1, scene: { globe: { maximumScreenSpaceError: LITE_GLOBE_SSE } } };
  const applied = applyPhoneRenderDetail(viewer, { devicePixelRatio: 3 });
  assert.deepEqual(applied, { resolutionScale: 2, sse: PHONE_GLOBE_SSE });
  assert.equal(viewer.resolutionScale, 2);
  assert.equal(viewer.scene.globe.maximumScreenSpaceError, PHONE_GLOBE_SSE);
});

test('a viewer without a globe is left alone', () => {
  const viewer = { resolutionScale: 1, scene: {} };
  assert.equal(applyPhoneRenderDetail(viewer, { devicePixelRatio: 3 }), null);
  assert.equal(viewer.resolutionScale, 1);
  assert.equal(applyPhoneRenderDetail(null), null);
});
