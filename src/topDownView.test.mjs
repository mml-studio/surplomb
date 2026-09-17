import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import { TOP_DOWN_VIEW, framingAngles, prefersTopDownView } from './topDownView.js';
import { DEFAULT_CITY_VIEW, flyToDefaultCity } from './camera.js';
import { flyToLandmark } from './locations.js';
import { flyToWorldTarget } from './worldFocus.js';

const PARIS = Cesium.Cartesian3.fromDegrees(2.3470, 48.8494, 0);
const close = (a, b) => Math.abs(a - b) < 1e-9;

function stubViewer() {
  const calls = { setView: [], flyToBoundingSphere: [] };
  return {
    calls,
    scene: { globe: null, canvas: { clientWidth: 390, clientHeight: 800 } },
    camera: {
      heading: Cesium.Math.toRadians(315),
      cancelFlight() {},
      setView(options) { calls.setView.push(options); },
      flyTo() {},
      flyToBoundingSphere(sphere, options) { calls.flyToBoundingSphere.push({ sphere, options }); },
      lookAt() {},
      lookAtTransform() {},
    },
  };
}

test('straight down means -90° and north up, and nothing else', () => {
  assert.deepEqual({ ...TOP_DOWN_VIEW }, { pitchDeg: -90, headingDeg: 0 });
  assert.ok(Object.isFrozen(TOP_DOWN_VIEW), 'one pose for every phone framing');
  assert.deepEqual(framingAngles({ pitchDeg: -25, headingDeg: 225 }, { topDown: true }), TOP_DOWN_VIEW);
  assert.deepEqual(
    framingAngles({ pitchDeg: -25, headingDeg: 225 }, { topDown: false }),
    { pitchDeg: -25, headingDeg: 225 },
    'a desktop keeps the angle the framing was tuned for',
  );
});

test('the session decides, and Node is not a phone', () => {
  // The desktop is the default a test (or a harness without ?input=phone)
  // gets, so every existing framing test still reads the tuned angles.
  assert.equal(prefersTopDownView(), false);
  assert.deepEqual(framingAngles({ pitchDeg: -30, headingDeg: 315 }), { pitchDeg: -30, headingDeg: 315 });
});

test('a phone lands on the default view straight down, over the point itself', () => {
  const phone = stubViewer();
  flyToDefaultCity(phone, DEFAULT_CITY_VIEW, { immediate: true, topDown: true });
  const [pose] = phone.calls.setView;
  assert.ok(close(pose.orientation.pitch, -Math.PI / 2), `pitch ${pose.orientation.pitch}`);
  assert.equal(pose.orientation.heading, 0);
  const carto = Cesium.Cartographic.fromCartesian(pose.destination);
  assert.ok(Math.abs(Cesium.Math.toDegrees(carto.latitude) - DEFAULT_CITY_VIEW.lat) < 1e-9);
  assert.ok(Math.abs(carto.height - DEFAULT_CITY_VIEW.settleAltitudeM) < 1e-3, 'same height as the desktop');

  // The desktop landing is unchanged, field for field.
  const desk = stubViewer();
  flyToDefaultCity(desk, DEFAULT_CITY_VIEW, { immediate: true, topDown: false });
  const [deskPose] = desk.calls.setView;
  assert.ok(close(deskPose.orientation.pitch, Cesium.Math.toRadians(DEFAULT_CITY_VIEW.pitchDeg)));
  assert.ok(close(deskPose.orientation.heading, Cesium.Math.toRadians(DEFAULT_CITY_VIEW.headingDeg)));
});

test('a landmark flight keeps its range and loses its angle on a phone', () => {
  // Range is kept on purpose: it is the distance to the point under the
  // centre of the screen, so the scale there is the one the framing was
  // tuned for. Only the tilt and the heading change.
  const phone = stubViewer();
  flyToLandmark(phone, 48.8530, 2.3499, { range: 400, pitch: -25, heading: 225, topDown: true });
  const { offset } = phone.calls.flyToBoundingSphere[0].options;
  assert.ok(close(offset.pitch, -Math.PI / 2));
  assert.equal(offset.heading, 0);
  assert.equal(offset.range, 400);

  const desk = stubViewer();
  flyToLandmark(desk, 48.8530, 2.3499, { range: 400, pitch: -25, heading: 225, topDown: false });
  const deskOffset = desk.calls.flyToBoundingSphere[0].options.offset;
  assert.ok(close(deskOffset.pitch, Cesium.Math.toRadians(-25)));
  assert.ok(close(deskOffset.heading, Cesium.Math.toRadians(225)));
  assert.equal(deskOffset.range, 400);
});

test('a clicked fire is framed straight down on a phone, and north up', () => {
  const phone = stubViewer();
  assert.equal(flyToWorldTarget(phone, { kind: 'fire', id: 'f', position: PARIS }, { topDown: true }), true);
  const { offset } = phone.calls.flyToBoundingSphere[0].options;
  assert.ok(close(offset.pitch, -Math.PI / 2));
  assert.equal(offset.heading, 0, 'not the 315° the camera had');
});

test('Cesium resolves a -90° offset to a north-up camera, not a degenerate one', () => {
  // `flyToBoundingSphere` special-cases a view direction parallel to the local
  // up; `lookAt` falls back to +X for its right vector. Both must land north
  // up, or a phone would open on a map rotated by floating-point noise.
  const offset = new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-90), 600);
  const camera = new Cesium.Camera({
    canvas: { clientWidth: 390, clientHeight: 800 },
    drawingBufferWidth: 390,
    drawingBufferHeight: 800,
    mapProjection: new Cesium.GeographicProjection(),
    tweens: new Cesium.TweenCollection(),
    mode: Cesium.SceneMode.SCENE3D,
    globe: undefined,
    preloadFlightAnimationFrameRate: 30,
  });
  camera.lookAt(PARIS, offset);
  camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
  assert.ok(Math.abs(Cesium.Math.toDegrees(camera.pitch) + 90) < 0.01, `pitch ${Cesium.Math.toDegrees(camera.pitch)}`);
  const heading = Cesium.Math.toDegrees(camera.heading);
  assert.ok(Math.min(heading, 360 - heading) < 0.01, `heading ${heading}`);
});
