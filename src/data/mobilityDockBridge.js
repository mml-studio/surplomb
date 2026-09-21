/**
 * @module mobilityDockBridge
 *
 * The one thing the two layers of the « Mobilités partagées » row have to tell
 * each other: the docks `bikeshare.js` draws, for the groups
 * `sharedMobilityFrance.js` draws.
 *
 * WHY THE DOCKS JOIN THE GROUPS. From the city-wide view the shared fleets are
 * bubbles that count (`sharedMobilityClusters.js`). The Vélib' docks stayed
 * dots under them: 1,344 rings over Paris from 18 km, the densest mark on the
 * map, and a bubble that said « 739 » while the bikes waiting in the docks
 * around it were not in the number. So while the groups are drawn, a dock's
 * available bikes are counted into the group of the same grid cell, in the
 * dock network's hue, and the dock itself is not drawn.
 *
 * A bridge rather than an import either way: the two layers load lazily and
 * separately, and neither should need the other to exist. Without the
 * shared-fleet layer nothing is ever grouped and the docks draw as always;
 * without `bikeshare.js` the groups count the fleets alone.
 */

/** @type {?() => Array<{lat:number, lon:number, bikes:number, operator:{id:string, color:string}}>} */
let _provider = null;
let _grouped = false;
const _groupedListeners = new Set();
const _changedListeners = new Set();

/**
 * `bikeshare.js`: say where the docks are. The provider answers the docks the
 * row's filters leave on the map, with their available bikes.
 * @param {?Function} provider
 * @returns {void}
 */
export function publishMobilityDocks(provider) {
  _provider = typeof provider === 'function' ? provider : null;
}

/** The docks as the provider sees them now, or none. */
export function readMobilityDocks() {
  if (!_provider) return [];
  try {
    return _provider() || [];
  } catch {
    return [];
  }
}

/** `bikeshare.js`: the availability or the filters changed — count again. */
export function notifyMobilityDocksChanged() {
  for (const listener of _changedListeners) listener();
}

/** `sharedMobilityFrance.js`: hear about it. @returns {Function} Unsubscribe. */
export function onMobilityDocksChanged(listener) {
  _changedListeners.add(listener);
  return () => _changedListeners.delete(listener);
}

/**
 * `sharedMobilityFrance.js`: the groups are, or are no longer, drawn — so the
 * docks they count must not be drawn as well.
 * @param {boolean} grouped
 * @returns {void}
 */
export function setMobilityDocksGrouped(grouped) {
  const next = grouped === true;
  if (next === _grouped) return;
  _grouped = next;
  for (const listener of _groupedListeners) listener(next);
}

/** Whether a group is counting the docks right now. */
export function mobilityDocksGrouped() {
  return _grouped;
}

/** `bikeshare.js`: hear about it. @returns {Function} Unsubscribe. */
export function onMobilityDocksGrouped(listener) {
  _groupedListeners.add(listener);
  return () => _groupedListeners.delete(listener);
}

/** Back to nothing published and nothing grouped — for the unit tests. */
export function _resetMobilityDockBridgeForTest() {
  _provider = null;
  _grouped = false;
  _groupedListeners.clear();
  _changedListeners.clear();
}
