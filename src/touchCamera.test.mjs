import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as Cesium from 'cesium';
import { GLOBE_VIEW } from './locations.js';
import {
  TOUCH_INERTIA,
  TOUCH_MAX_ZOOM_DISTANCE_M,
  TOUCH_MIN_ZOOM_DISTANCE_M,
  applyTouchCameraProfile,
} from './touchCamera.js';

/** Cesium's shipped defaults, as the scene hands them over before we touch it. */
function defaultController() {
  return {
    zoomEventTypes: [Cesium.CameraEventType.WHEEL, Cesium.CameraEventType.PINCH],
    tiltEventTypes: [Cesium.CameraEventType.MIDDLE_DRAG, Cesium.CameraEventType.PINCH],
    enableLook: true,
    inertiaSpin: 0.9,
    inertiaTranslate: 0.9,
    inertiaZoom: 0.8,
    minimumZoomDistance: 1,
    maximumZoomDistance: Number.POSITIVE_INFINITY,
  };
}

test('a cursor session keeps every Cesium default, field for field', () => {
  const before = defaultController();
  const scene = { screenSpaceCameraController: defaultController() };
  assert.equal(applyTouchCameraProfile(scene, { coarse: false }), false);
  assert.deepEqual(scene.screenSpaceCameraController, before);
  // Node reports no touch points, so the session default is the cursor path.
  assert.equal(applyTouchCameraProfile({ screenSpaceCameraController: defaultController() }), false);
});

test('a finger session unbinds tilt, binds zoom to pinch alone, and damps sooner', () => {
  const scene = { screenSpaceCameraController: defaultController() };
  assert.equal(applyTouchCameraProfile(scene, { coarse: true }), true);
  const c = scene.screenSpaceCameraController;
  assert.deepEqual(c.zoomEventTypes, [Cesium.CameraEventType.PINCH]);
  assert.deepEqual(c.tiltEventTypes, [], 'pinch must not zoom and pitch at the same time');
  assert.equal(c.enableLook, false);
  assert.equal(c.inertiaSpin, TOUCH_INERTIA.spin);
  assert.equal(c.inertiaTranslate, TOUCH_INERTIA.translate);
  assert.equal(c.inertiaZoom, TOUCH_INERTIA.zoom);
  assert.ok(c.inertiaSpin < 0.9 && c.inertiaZoom < 0.8, 'a lifted finger has stopped');
});

test('the pinch cannot end inside a building, nor past the globe', () => {
  const scene = { screenSpaceCameraController: defaultController() };
  applyTouchCameraProfile(scene, { coarse: true });
  assert.equal(scene.screenSpaceCameraController.minimumZoomDistance, 40);
  assert.equal(TOUCH_MIN_ZOOM_DISTANCE_M, 40);
  assert.equal(scene.screenSpaceCameraController.maximumZoomDistance, TOUCH_MAX_ZOOM_DISTANCE_M);
  assert.equal(TOUCH_MAX_ZOOM_DISTANCE_M, GLOBE_VIEW.heightM * 1.5);
  assert.ok(TOUCH_MAX_ZOOM_DISTANCE_M > GLOBE_VIEW.heightM, 'the full-earth preset must stay reachable');
});

test('a scene without a controller is a no-op, not a crash', () => {
  assert.equal(applyTouchCameraProfile(null, { coarse: true }), false);
  assert.equal(applyTouchCameraProfile({}, { coarse: true }), false);
});

test('the profile is applied once, at boot, ahead of anything that can track', () => {
  // `trackedCamera.js` captures inertiaZoom / minimumZoomDistance at the first
  // tracked contact and restores what it captured. A second call mid-session
  // would hand it Cesium's temporary zeroes to restore forever.
  const main = readFileSync(new URL('./main.js', import.meta.url), 'utf8');
  const calls = main.match(/applyTouchCameraProfile\(/g) || [];
  assert.equal(calls.length, 1, 'exactly one call site in main.js');
  const boot = main.indexOf('applyTouchCameraProfile(viewer.scene)');
  const frameRate = main.indexOf('viewer.targetFrameRate = 60');
  assert.ok(frameRate > 0 && boot > frameRate, 'applied on the constructed viewer');
});
