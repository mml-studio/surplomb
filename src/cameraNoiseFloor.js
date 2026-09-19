/**
 * @module cameraNoiseFloor
 * @description Give Cesium's camera-change check a floor above floating-point
 * noise, so `camera.moveEnd` fires once the camera has actually stopped.
 *
 * THE FAILURE (measured 2026-09-19 on surplomb.app, share link to Lyon at
 * 550 m, pitch -45°). `View.checkForCameraUpdates` compares the camera with a
 * clone of last frame's at `CesiumMath.EPSILON15`, and fires `moveEnd` only
 * after 500 ms without a difference. But reading `camera.heading` or `pitch`
 * round-trips `up`, `direction` and `right` through an east-north-up frame
 * (`Camera#_setTransform`), and Cesium's own `_updateCameraChanged` does that
 * every frame as soon as `camera.changed` has a listener. The round trip moves
 * `up` by a few units in the last place — past 1e-15 on some component in 68
 * frames out of 180 at that pose. So the scene sees a camera that "moves" for
 * ever: `moveEnd` never fired in 30 s, and a programmatic flight from there
 * never ended either.
 *
 * WHAT IT COST. Every layer that waits for the camera to settle before asking
 * its question — the address scans (sales, parcels, DPE, risks…) — asked
 * nothing: the home page's « Une parcelle vendue à Lyon » opened on an empty
 * map, zero requests in 40 s, until the reader happened to move to a luckier
 * pose. And each "moving" frame is also a frame drawn in request-render mode,
 * i.e. a parked camera that keeps the GPU busy.
 *
 * THE FIX. Before Cesium's check runs, a difference that stays within 1e-12
 * on every field is folded into the clone, so the check sees no change. 1e-12
 * of a unit vector is 1e-12 rad — about the width of an atom at 1 000 km; a
 * real gesture or flight moves the camera by many orders of magnitude more,
 * and is still seen on its first frame.
 *
 * It patches ONE private method on the scene's default view (`_defaultView`,
 * `_cameraClone`). If a Cesium upgrade renames either, the install returns
 * false, the app keeps Cesium's own behaviour, and `cameraNoiseFloor.test.mjs`
 * (which reads the installed Cesium source) says so.
 */

/** Tolerance, per component, below which a camera difference is noise. */
export const CAMERA_NOISE_EPSILON = 1e-12;

/** The tolerance Cesium's own check uses (`CesiumMath.EPSILON15`). */
const CESIUM_EPSILON = 1e-15;

function close(a, b, epsilon) {
  const diff = Math.abs(a - b);
  return diff <= epsilon || diff <= epsilon * Math.max(Math.abs(a), Math.abs(b));
}

function closeVec(a, b, epsilon) {
  return close(a.x, b.x, epsilon) && close(a.y, b.y, epsilon) && close(a.z, b.z, epsilon);
}

function closeMatrix(a, b, epsilon) {
  for (let i = 0; i < 16; i += 1) {
    if (!close(a[i], b[i], epsilon)) return false;
  }
  return true;
}

function maxAbs(v) {
  return Math.max(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z));
}

/**
 * Compare two cameras the way `View.checkForCameraUpdates` does (position
 * scaled by its largest component, then direction, up, right, transform and
 * frustum), at a given tolerance.
 *
 * @param {object} a Camera-like: position, direction, up, right, transform, frustum.
 * @param {object} b The same shape.
 * @param {number} epsilon
 * @returns {boolean}
 */
export function camerasWithin(a, b, epsilon) {
  const scale = 1 / Math.max(1, maxAbs(a.position), maxAbs(b.position));
  const pa = { x: a.position.x * scale, y: a.position.y * scale, z: a.position.z * scale };
  const pb = { x: b.position.x * scale, y: b.position.y * scale, z: b.position.z * scale };
  if (!closeVec(pa, pb, epsilon)) return false;
  if (!closeVec(a.direction, b.direction, epsilon)) return false;
  if (!closeVec(a.up, b.up, epsilon)) return false;
  if (!closeVec(a.right, b.right, epsilon)) return false;
  if (a.transform && b.transform && !closeMatrix(a.transform, b.transform, epsilon)) return false;
  if (typeof a.frustum?.equalsEpsilon === 'function') return a.frustum.equalsEpsilon(b.frustum, epsilon);
  return true;
}

/**
 * Install the floor on a scene. Returns true when installed, false when the
 * scene does not have the private shape this relies on (or already has it).
 *
 * @param {object} scene A Cesium Scene.
 * @param {{Camera: {clone: Function}, epsilon?: number}} deps `Camera` is
 *   Cesium's Camera class, passed in so the module stays importable in tests.
 * @returns {boolean}
 */
export function installCameraNoiseFloor(scene, { Camera, epsilon = CAMERA_NOISE_EPSILON } = {}) {
  const view = scene?._defaultView;
  if (!view || typeof view.checkForCameraUpdates !== 'function' || !view._cameraClone) return false;
  if (typeof Camera?.clone !== 'function' || view.__cameraNoiseFloor) return false;
  const original = view.checkForCameraUpdates;
  view.checkForCameraUpdates = function checkForCameraUpdatesAboveNoise(sceneArg) {
    const camera = this.camera;
    const clone = this._cameraClone;
    // Only a difference Cesium WOULD flag and that stays under the floor is
    // folded in; an exact match costs nothing, and a real move is left alone.
    if (camera && clone && !camerasWithin(camera, clone, CESIUM_EPSILON) && camerasWithin(camera, clone, epsilon)) {
      Camera.clone(camera, clone);
    }
    return original.call(this, sceneArg);
  };
  view.__cameraNoiseFloor = true;
  return true;
}
