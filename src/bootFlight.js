/**
 * @file The four seconds the app is flying the reader in, published once.
 *
 * WHY THIS EXISTS. `flyToDefaultCity` starts the camera at 25 km over Paris
 * and lands it at 600 m in four seconds, on every boot with no share state.
 * That descent is an ANIMATION, and its only job is to be smooth. A data layer
 * that is already switched on treats it as ordinary camera movement and does
 * what it always does: it reads the altimeter, picks a band, fetches, parses,
 * spawns and starts seating — all of it on the main thread, all of it while
 * the animation is trying to run.
 *
 * Measured on 2026-09-16 (`scripts/qa-traffic-boot.mjs`, two paired runs on a
 * machine at load 15–30, so read the RATIO and not the absolutes):
 *
 *   | boot with the traffic layer on | control, layer off |
 *   |---|---|
 *   | camera parked at 25.5 / 27.2 s | 6.4 / 6.8 s |
 *   | 12 long tasks, 1 483 ms        | 3 long tasks, 431 ms |
 *
 * Four times the arrival, to draw a road graph over a city the camera is
 * leaving. And it is worse than wasted: the descent crosses the `metro` band,
 * so it also pays for a 0.30° arterial Overpass box — a request nobody reads,
 * on a cell nobody revisits.
 *
 * WHAT A LAYER SHOULD DO INSTEAD. Nothing, and then everything at once. The
 * view the reader will actually look at is the one at the END of the flight,
 * it is the same view on every boot, and it is therefore the one cell in the
 * product whose Overpass key is shared by every visitor. Waiting for it costs
 * four seconds of a picture nobody sees and buys back an arrival that is as
 * fast as an empty one.
 *
 * WHY A MODULE AND NOT A FLAG ON THE VIEWER. Two readers: `main.js` owns the
 * flight, and each layer decides for itself whether it is the kind of work
 * that should wait. Hanging it off the Cesium viewer would make it a Cesium
 * concern, which it is not, and would put it out of reach of a unit test.
 *
 * THE DEADLINE IS NOT BELT AND BRACES. `flyTo` raises `complete` OR `cancel`,
 * and a layer that waits for one of them is one dropped callback away from
 * never loading at all. A boot flight that has not ended after its own
 * duration plus a wide margin is over as far as this module is concerned.
 *
 * @module bootFlight
 */

/** @type {boolean} True between `beginBootFlight` and its end. */
let _inFlight = false;
/** @type {Array<Function>} One-shot callbacks owed the end of the flight. */
let _waiters = [];
/** @type {*} Deadline handle — see the module note on the dropped callback. */
let _deadline = null;

/**
 * Milliseconds after which the flight is considered over whatever Cesium says.
 *
 * The flight itself is 4 s behind a 500 ms pause. Fifteen seconds is a bit
 * over three times that, and the slack is the point: the machines that need
 * this mechanism at all are the ones where the animation itself runs late, and
 * a deadline that fired on them would release the layers back into the very
 * descent they are being held out of.
 */
export const BOOT_FLIGHT_DEADLINE_MS = 15000;

/**
 * Declare that the app is flying the reader in.
 *
 * @param {{deadlineMs?: number, setTimer?: Function, clearTimer?: Function}} [opts]
 *   Timer injection is for the unit test; production takes the globals.
 */
export function beginBootFlight({
  deadlineMs = BOOT_FLIGHT_DEADLINE_MS,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  if (_inFlight) return;
  _inFlight = true;
  if (_deadline !== null) clearTimer(_deadline);
  _deadline = setTimer(() => {
    if (!_inFlight) return;
    console.warn('[BootFlight] no completion after the deadline — releasing the layers anyway');
    endBootFlight();
  }, deadlineMs);
}

/**
 * Declare the flight over and release everything that was waiting for it.
 *
 * Idempotent, and safe to call when no flight was ever declared: a boot with
 * share state never flies, and its layers must not be held.
 */
export function endBootFlight() {
  if (_deadline !== null) {
    clearTimeout(_deadline);
    _deadline = null;
  }
  if (!_inFlight && _waiters.length === 0) return;
  _inFlight = false;
  // Taken before the first call: a waiter that re-registers must wait for the
  // NEXT flight, not re-enter this loop.
  const waiters = _waiters;
  _waiters = [];
  for (const fn of waiters) {
    try { fn(); } catch (e) { console.warn('[BootFlight] waiter threw:', e); }
  }
}

/** @returns {boolean} Whether the app is currently flying the reader in. */
export function bootFlightInProgress() {
  return _inFlight;
}

/**
 * Run `fn` when the boot flight ends — immediately when there is no flight.
 *
 * Immediately is the important half: every caller is a layer deciding whether
 * to do its work now, and the common case (a share link, a second visit, a
 * reader who navigates) has no flight at all.
 *
 * @param {Function} fn - Called once, with no arguments.
 */
export function whenBootFlightEnds(fn) {
  if (typeof fn !== 'function') return;
  if (!_inFlight) { fn(); return; }
  _waiters.push(fn);
}

/** Reset module state between unit tests. */
export function _resetBootFlightForTest() {
  if (_deadline !== null) clearTimeout(_deadline);
  _deadline = null;
  _inFlight = false;
  _waiters = [];
}
