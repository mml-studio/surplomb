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
 * ── THE PINCH, AND WHY THREE TIMES FASTER ───────────────────────────────────
 *
 * Cesium moves the camera by `zoomFactor × distance × Δ / canvasHeight`, where
 * Δ is the change in finger spacing MULTIPLIED BY 0.25 (ScreenSpaceEventHandler
 * scales the pinch before anyone sees it). Integrated over a gesture, the
 * camera distance is divided by exp(zoomFactor × 0.25 × Δspacing / height).
 * With Cesium's 5, on an 800 px tall phone, spreading two fingers from 150 to
 * 300 px brings the camera 1.26× closer. A map app brings it 2× closer — the
 * spacing doubled — and that gap is the owner's field report of 2026-09-17:
 * three or four pinches to do what one does anywhere else.
 * `TOUCH_ZOOM_FACTOR` closes it: 15 makes that same pinch 2.0× (see the
 * constant for the arithmetic). The wheel is not affected: this profile is
 * never applied to a session with a cursor.
 *
 * ── THE INERTIAS ────────────────────────────────────────────────────────────
 *
 * Cesium damps 0.9 / 0.9 / 0.8, tuned so a flick of a mouse keeps gliding.
 * Zoom is damped harder (0.6): a pinch that keeps going after the fingers
 * stopped overshoots the street the reader was aiming at.
 *
 * Spin is the one that carries a one-finger PAN in 3D (`update3D` routes the
 * drag through `spin3D`, and `inertiaTranslate` only serves 2D and Columbus
 * view). Cesium replays it only after a THROW — a press released within
 * 0.4 s — so it never moves a finger that dragged and stopped. It was 0.7,
 * which carries a throw for 0.13 s (glide = speed / ((1 − k) × 25)): a flick
 * that barely travels, and the second half of the same field report. 0.85
 * carries it 0.27 s, the distance a map app's fling covers.
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
export const TOUCH_INERTIA = Object.freeze({ spin: 0.85, translate: 0.7, zoom: 0.6 });

/**
 * Pinch speed, three times Cesium's 5.
 *
 * Solved for "a pinch that doubles the finger spacing halves the distance",
 * at the spacing a thumb and finger actually use (150 → 300 px) on an 800 px
 * tall canvas: ln 2 × 800 / (0.25 × 150) = 14.8. The rule is only exact at
 * that spacing — Cesium reads the CHANGE in spacing, not its ratio — so a
 * wider pinch runs a little ahead of a map app and a tighter one a little
 * behind.
 */
export const TOUCH_ZOOM_FACTOR = 15;

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
  controller.zoomFactor = TOUCH_ZOOM_FACTOR;
  controller.minimumZoomDistance = TOUCH_MIN_ZOOM_DISTANCE_M;
  controller.maximumZoomDistance = TOUCH_MAX_ZOOM_DISTANCE_M;
  return true;
}
