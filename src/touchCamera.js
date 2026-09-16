/**
 * The camera, for two fingers instead of a mouse with three buttons and a wheel.
 *
 * ── WHY ANY OF THIS ─────────────────────────────────────────────────────────
 *
 * `screenSpaceCameraController` has never been configured in this app beyond
 * `enableInputs`. That is fine for a mouse: Cesium's defaults map wheel to
 * zoom, right-drag to tilt, middle-drag to look, and every one of those inputs
 * exists on a desk. On glass, the same defaults collapse onto ONE gesture —
 * pinch — which Cesium wires to zoom AND tilt simultaneously, with no dead
 * zone between them. Two fingers that are not perfectly parallel therefore
 * pitch the camera while they zoom, and a reader trying to get closer to a
 * street arrives at it from an angle they did not ask for and cannot undo
 * without a preset. That drift is the single loudest thing wrong with the
 * globe on a phone.
 *
 * ── WHAT IS TAKEN AWAY, AND WHERE IT WENT ───────────────────────────────────
 *
 * Tilt is unbound rather than remapped. There is no third finger to give it,
 * the pitch presets in the view switcher already set it exactly, and a camera
 * that stays level is a camera a reader can predict. If testers ask for it
 * back, `tiltEventTypes` below takes `PINCH` again and the drift returns with
 * it — one line, deliberately kept as one line.
 *
 * `enableLook` goes too: it is bound to middle-drag and CTRL+drag, neither of
 * which a touchscreen can produce, and leaving it on costs a branch per frame.
 *
 * ── THE INERTIAS, AND WHY LOWER ─────────────────────────────────────────────
 *
 * Cesium damps 0.9 / 0.9 / 0.8, tuned so a flick of a mouse keeps gliding.
 * A finger that has lifted off the glass is a finger that has STOPPED, and the
 * globe continuing without it reads as the app fighting the reader — the same
 * complaint that makes momentum scrolling feel wrong when it overshoots. 0.7 /
 * 0.7 / 0.6 keeps enough glide to feel alive and lands roughly where the finger
 * left.
 *
 * ── WHY THIS IS CALLED ONCE, AT BOOT, AND NEVER AGAIN ───────────────────────
 *
 * `src/data/trackedCamera.js` captures `inertiaZoom` and `minimumZoomDistance`
 * the first time a contact is tracked and restores them when tracking ends.
 * Applied at boot, the values it captures are these; applied again mid-session
 * while something is tracked, it would capture Cesium's temporary zeroes and
 * restore THOSE forever. One call, before anything can track.
 *
 * @module touchCamera
 */

import * as Cesium from 'cesium';
import { isCoarseInput } from './inputMode.js';
import { GLOBE_VIEW } from './locations.js';

/**
 * Closest the pinch may bring the camera, in metres.
 *
 * Cesium's default is 1 m, which on a photorealistic mesh means a pinch that
 * overshoots ends INSIDE a building with the near plane clipping through
 * geometry, and no gesture that gets back out. 40 m is above roof height for
 * everything but a tower and still close enough to read a shopfront.
 */
export const TOUCH_MIN_ZOOM_DISTANCE_M = 40;

/**
 * Furthest the pinch may push the camera out, in metres.
 *
 * Half again the full-earth preset: a reader who pinches out past the globe
 * gets nothing but black and no gesture to come back, because there is no
 * "zoom to fit" on a touchscreen.
 */
export const TOUCH_MAX_ZOOM_DISTANCE_M = GLOBE_VIEW.heightM * 1.5;

/** Damping factors, lower than Cesium's mouse-tuned defaults. */
export const TOUCH_INERTIA = Object.freeze({ spin: 0.7, translate: 0.7, zoom: 0.6 });

/**
 * Apply the touch camera profile. A no-op for a cursor, by design.
 *
 * @param {object} scene - Cesium scene (or a stub with
 *   `screenSpaceCameraController`).
 * @param {object} [options]
 * @param {boolean} [options.coarse] - Override the session's input mode.
 * @param {object} [options.eventTypes] - `Cesium.CameraEventType`, for tests.
 * @returns {boolean} Whether the profile was applied.
 */
export function applyTouchCameraProfile(scene, options = {}) {
  const coarse = options.coarse === undefined ? isCoarseInput() : !!options.coarse;
  if (!coarse) return false;
  const controller = scene?.screenSpaceCameraController;
  if (!controller) return false;
  const eventTypes = options.eventTypes || Cesium.CameraEventType;

  controller.zoomEventTypes = [eventTypes.PINCH];
  // Empty, not "PINCH removed from a list": see the module header.
  controller.tiltEventTypes = [];
  controller.enableLook = false;
  controller.inertiaSpin = TOUCH_INERTIA.spin;
  controller.inertiaTranslate = TOUCH_INERTIA.translate;
  controller.inertiaZoom = TOUCH_INERTIA.zoom;
  controller.minimumZoomDistance = TOUCH_MIN_ZOOM_DISTANCE_M;
  controller.maximumZoomDistance = TOUCH_MAX_ZOOM_DISTANCE_M;
  return true;
}
