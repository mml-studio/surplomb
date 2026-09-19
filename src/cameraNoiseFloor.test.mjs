import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { CAMERA_NOISE_EPSILON, camerasWithin, installCameraNoiseFloor } from './cameraNoiseFloor.js';

const vec = (x, y, z) => ({ x, y, z });
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function camera(overrides = {}) {
  return {
    position: vec(4_470_000.123, 377_000.456, 4_527_000.789),
    direction: vec(-0.4, 0.2, -0.894),
    up: vec(0.705, 0.06, 0.7064),
    right: vec(0.1, 0.99, -0.05),
    transform: IDENTITY.slice(),
    frustum: { fov: 1, equalsEpsilon(other) { return other.fov === this.fov; } },
    ...overrides,
  };
}

const FakeCamera = {
  clone(source, target) {
    for (const key of ['position', 'direction', 'up', 'right']) target[key] = { ...source[key] };
    target.transform = source.transform.slice();
    target.frustum = source.frustum;
    return target;
  },
};

/** Cesium's View#checkForCameraUpdates, reduced to its event logic. */
function fakeScene(cam, clock) {
  const events = { start: 0, end: 0 };
  const view = {
    camera: cam,
    _cameraClone: FakeCamera.clone(cam, {}),
    _cameraStartFired: false,
    _cameraMovedTime: 0,
    checkForCameraUpdates(scene) {
      if (!camerasWithin(this.camera, this._cameraClone, 1e-15)) {
        if (!this._cameraStartFired) { events.start += 1; this._cameraStartFired = true; }
        this._cameraMovedTime = clock.now;
        FakeCamera.clone(this.camera, this._cameraClone);
        return true;
      }
      if (this._cameraStartFired && clock.now - this._cameraMovedTime > scene.cameraEventWaitTime) {
        events.end += 1;
        this._cameraStartFired = false;
      }
      return false;
    },
  };
  return { scene: { _defaultView: view, cameraEventWaitTime: 500 }, view, events };
}

/** A parked camera whose `up` is nudged by rounding noise every other frame. */
function runParkedWithNoise({ install }) {
  const clock = { now: 0 };
  const cam = camera();
  const { scene, view, events } = fakeScene(cam, clock);
  if (install) assert.equal(installCameraNoiseFloor(scene, { Camera: FakeCamera }), true);
  // A real move first, so the scene is in the "moving" state.
  cam.position = vec(cam.position.x + 50, cam.position.y, cam.position.z);
  view.checkForCameraUpdates(scene);
  for (let frame = 0; frame < 180; frame += 1) {
    clock.now += 16;
    cam.up = vec(cam.up.x + (frame % 2 ? 3e-15 : -3e-15), cam.up.y, cam.up.z);
    view.checkForCameraUpdates(scene);
  }
  return events;
}

test('rounding noise on a parked camera blocks moveEnd without the floor', () => {
  const events = runParkedWithNoise({ install: false });
  assert.equal(events.start, 1);
  assert.equal(events.end, 0, 'the failure this module exists for: moveEnd never fires');
});

test('with the floor, a parked camera settles and moveEnd fires once', () => {
  const events = runParkedWithNoise({ install: true });
  assert.equal(events.start, 1);
  assert.equal(events.end, 1);
});

test('a real movement is still seen on its first frame', () => {
  const clock = { now: 0 };
  const cam = camera();
  const { scene, view, events } = fakeScene(cam, clock);
  installCameraNoiseFloor(scene, { Camera: FakeCamera });
  cam.direction = vec(cam.direction.x + 1e-6, cam.direction.y, cam.direction.z);
  assert.equal(view.checkForCameraUpdates(scene), true);
  assert.equal(events.start, 1);
});

test('camerasWithin separates noise from motion', () => {
  const a = camera();
  assert.equal(camerasWithin(a, camera(), 1e-15), true);
  const noisy = camera({ up: vec(a.up.x + 3e-15, a.up.y, a.up.z) });
  assert.equal(camerasWithin(a, noisy, 1e-15), false, 'Cesium flags this');
  assert.equal(camerasWithin(a, noisy, CAMERA_NOISE_EPSILON), true, 'the floor absorbs it');
  // One centimetre at ~6 400 km is 1.5e-9 of the scaled position: motion.
  const moved = camera({ position: vec(a.position.x + 0.01, a.position.y, a.position.z) });
  assert.equal(camerasWithin(a, moved, CAMERA_NOISE_EPSILON), false);
});

test('install refuses a scene without the private shape, and installs once', () => {
  assert.equal(installCameraNoiseFloor({}, { Camera: FakeCamera }), false);
  assert.equal(installCameraNoiseFloor({ _defaultView: { checkForCameraUpdates() {} } }, { Camera: FakeCamera }), false);
  const { scene } = fakeScene(camera(), { now: 0 });
  assert.equal(installCameraNoiseFloor(scene, { Camera: FakeCamera }), true);
  assert.equal(installCameraNoiseFloor(scene, { Camera: FakeCamera }), false);
});

test('the installed Cesium still has the private shape this patches', () => {
  // If a Cesium upgrade renames these, the install silently returns false and
  // moveEnd can stall again at unlucky poses — so fail here instead.
  const require = createRequire(import.meta.url);
  const engine = path.dirname(require.resolve('@cesium/engine/package.json'));
  const viewSource = readFileSync(path.join(engine, 'Source/Scene/View.js'), 'utf8');
  const sceneSource = readFileSync(path.join(engine, 'Source/Scene/Scene.js'), 'utf8');
  assert.match(viewSource, /View\.prototype\.checkForCameraUpdates = function \(scene\)/);
  assert.match(viewSource, /const cameraClone = this\._cameraClone;/);
  assert.match(viewSource, /cameraEqual\(camera, cameraClone, CesiumMath\.EPSILON15\)/);
  assert.match(sceneSource, /this\._defaultView = new View\(/);
});
