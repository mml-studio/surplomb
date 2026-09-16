import * as Cesium from 'cesium';
import { isCoarseInput } from '../inputMode.js';

export const MAX_TRACKING_CLICK_TRAVEL_PX = 6;
export const MAX_TRACKING_CLICK_DURATION_MS = 400;

/**
 * The same two limits, for hands instead of a cursor.
 *
 * A mouse click is a mechanical switch under a stationary pointer: 6 px of
 * cumulative travel and 400 ms are generous for it. A tap is a finger rolling
 * on glass — the contact point wanders while the pressure builds and again
 * while it releases, and iOS reports the centroid of a contact patch that
 * changes shape. Held to the mouse limits, an ordinary tap fails BOTH: the
 * gesture is classified as a drag, the empty-space branch never runs, and the
 * reader taps a tracked aircraft's empty sky three times without releasing it.
 *
 * 12 px is twice the mouse budget and still half the 24 px pick square, so a
 * gesture that travels far enough to be rejected here has also travelled far
 * enough to land on a different object. 600 ms sits under the 1 500 ms Cesium
 * spends deciding a touch is a HOLD, so the two classifiers cannot both fire.
 */
export const MAX_TRACKING_CLICK_TRAVEL_PX_COARSE = 12;
export const MAX_TRACKING_CLICK_DURATION_MS_COARSE = 600;

/**
 * Cesium's own tolerance, relaxed for a finger.
 *
 * Load-bearing and easy to miss: `ScreenSpaceEventHandler` only raises
 * `LEFT_CLICK` on touch-end when the STRAIGHT-LINE distance from touch-start
 * stays within `_clickPixelTolerance` (5 px). That gate runs BEFORE any of the
 * accounting below, so raising the cumulative budget to 12 px without raising
 * this one buys nothing — the click simply never arrives.
 */
export const CESIUM_CLICK_TOLERANCE_PX_COARSE = 10;

/**
 * The travel and duration budget for this session's hands.
 * @param {boolean} [coarse] - Defaults to the session's input mode.
 * @returns {{travelPx: number, durationMs: number}}
 */
export function trackingClickLimits(coarse = isCoarseInput()) {
  return coarse
    ? { travelPx: MAX_TRACKING_CLICK_TRAVEL_PX_COARSE, durationMs: MAX_TRACKING_CLICK_DURATION_MS_COARSE }
    : { travelPx: MAX_TRACKING_CLICK_TRAVEL_PX, durationMs: MAX_TRACKING_CLICK_DURATION_MS };
}

/**
 * Decide whether a completed press stayed spatially click-like. Duration is
 * deliberately ignored so a stationary long press may still select a contact;
 * callers apply the full click classifier before destructive deselection.
 * @param {{travelPx?: number}} gesture - Accumulated pointer path.
 * @param {{travelPx?: number}} [limits] - Defaults to this session's limits.
 * @returns {boolean} True when travel stays within the click limit.
 */
export function isTrackingSelectionGesture(gesture = {}, limits = trackingClickLimits()) {
  const travelPx = Number.isFinite(gesture.travelPx)
    ? Math.max(0, gesture.travelPx)
    : Number.POSITIVE_INFINITY;
  return travelPx <= limits.travelPx;
}

/**
 * Decide whether a completed press is a clean click suitable for deselection
 * or another action that requires both short duration and low travel.
 * @param {{travelPx?: number, durationMs?: number}} gesture - Accumulated path and press time.
 * @param {{travelPx?: number, durationMs?: number}} [limits] - Defaults to this session's limits.
 * @returns {boolean} True when the gesture stays within both click limits.
 */
export function isTrackingClickGesture(gesture = {}, limits = trackingClickLimits()) {
  const durationMs = Number.isFinite(gesture.durationMs)
    ? Math.max(0, gesture.durationMs)
    : Number.POSITIVE_INFINITY;
  return isTrackingSelectionGesture(gesture, limits)
    && durationMs <= limits.durationMs;
}

/**
 * Raise a handler's own click tolerance so a finger's wander still clicks.
 *
 * Only the three layers that bind through {@link bindTrackingClickGesture} get
 * this. The other ~37 layers install their own handler and keep Cesium's 5 px:
 * a trembling tap is LOST there, which is the safe direction — nothing is
 * selected and, crucially, nothing is deselected either. Migrating all of them
 * is a separate piece of work; see `docs/KNOWN-ISSUES.md`.
 *
 * @param {object} handler - A Cesium `ScreenSpaceEventHandler`, or a stub.
 * @param {boolean} [coarse] - Defaults to the session's input mode.
 * @returns {boolean} Whether the tolerance was raised.
 */
export function relaxHandlerClickTolerance(handler, coarse = isCoarseInput()) {
  if (!coarse || typeof handler?._clickPixelTolerance !== 'number') return false;
  handler._clickPixelTolerance = CESIUM_CLICK_TOLERANCE_PX_COARSE;
  return true;
}

/**
 * Bind LEFT_DOWN/MOUSE_MOVE/LEFT_UP accounting ahead of a scene click.
 * Travel is accumulated segment-by-segment, so an orbit nudge that returns to
 * its starting pixel cannot masquerade as a zero-distance click. Every scene
 * click reaches `onClick` with its gesture metadata; the caller decides whether
 * selection (travel-only) or deselection (travel + duration) is allowed.
 *
 * A long press is deliberately NOT bound. Cesium emits `RIGHT_CLICK` after
 * 1 500 ms of a stationary touch, and 1 500 ms of nothing happening reads as
 * "the app is broken" rather than as a second verb — and there is no second
 * verb to give it: forty layers have exactly one action.
 *
 * @param {Object} handler - Input handler.
 * @param {(click: Object, gesture: {travelPx: number, durationMs: number}) => void} onClick - Scene-click callback.
 * @param {{now?: () => number, eventTypes?: Object, onMouseMove?: (event: Object) => void, coarse?: boolean}} [options] - Test/interop seams.
 * @returns {void}
 */
export function bindTrackingClickGesture(handler, onClick, options = {}) {
  const now = options.now || (() => performance.now());
  const eventTypes = options.eventTypes || Cesium.ScreenSpaceEventType;
  relaxHandlerClickTolerance(handler, options.coarse);
  let pressActive = false;
  let pressStartedAt = 0;
  let previousPosition = null;
  let travelPx = 0;
  let completedGesture = null;

  const appendTravel = (position) => {
    if (!pressActive || !Number.isFinite(position?.x) || !Number.isFinite(position?.y)) return;
    if (previousPosition) {
      travelPx += Math.hypot(
        position.x - previousPosition.x,
        position.y - previousPosition.y,
      );
    }
    previousPosition = { x: position.x, y: position.y };
  };

  const finishPress = (position) => {
    if (!pressActive) return;
    appendTravel(position);
    completedGesture = {
      travelPx,
      durationMs: Math.max(0, now() - pressStartedAt),
    };
    pressActive = false;
    previousPosition = null;
  };

  handler.setInputAction((event) => {
    pressActive = true;
    pressStartedAt = now();
    previousPosition = null;
    travelPx = 0;
    completedGesture = null;
    appendTravel(event?.position);
  }, eventTypes.LEFT_DOWN);

  handler.setInputAction((event) => {
    appendTravel(event?.endPosition ?? event?.position);
    options.onMouseMove?.(event);
  }, eventTypes.MOUSE_MOVE);

  handler.setInputAction((event) => {
    finishPress(event?.position);
  }, eventTypes.LEFT_UP);

  handler.setInputAction((click) => {
    if (pressActive) finishPress(click?.position);
    const gesture = completedGesture || { travelPx: 0, durationMs: 0 };
    completedGesture = null;
    onClick(click, gesture);
  }, eventTypes.LEFT_CLICK);
}
