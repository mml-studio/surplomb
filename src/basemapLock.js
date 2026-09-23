/**
 * @module basemapLock
 *
 * The panel rows that impose a basemap while they are lit, and give the
 * previous one back when they go dark.
 *
 * « Infrastructure numérique » is read against the ground itself: an antenna's
 * line of sight crosses a valley, a data centre sits in a business park, a
 * cable lands on a beach. On a drawn map (OSM, Plan IGN) or a roadmap those
 * are lines over a diagram. The operator asked for the plain rule: the row on
 * means Satellite, and while it stays on, the other basemaps are greyed out in
 * the tray rather than offered.
 *
 * TWO DIFFERENCES FROM THE PRESET FOLLOWER, both deliberate.
 *
 *  1. EVERY origin locks. The preset follower ignores a share link, a stored
 *     session and a context mode, because a preset is a look and those carry
 *     their own. The basemap here is not a look but a condition of the layer:
 *     a row a link lit is as unreadable on OSM as one a hand lit.
 *  2. Off gives back what was there BEFORE, not a fixed default. There is no
 *     "normal" basemap — the build's startup stack depends on its keys — so
 *     the only honest answer is the one the reader had.
 *
 * The lock itself lives on the controller (`MapStackController.setLock`),
 * which refuses every other stack while it holds; this module only decides
 * when it holds. Cesium-free and DOM-free, like its sibling, so the rules are
 * tested under `node --test` against the code `ui.js` runs.
 */

import { nightAtlasRowMembers } from './styles/nightAtlasRow.js';

/**
 * The rows — fusion primaries, or one member of a row, as in
 * `nightAtlasRow.js` — that impose a basemap, and which.
 */
export const ROW_BASEMAPS = Object.freeze({
  // « Infrastructure numérique », whose primary is the data centres.
  'local-datacenters': 'ign-ortho',
  // « Grands incendies »: the rings are drawn over the forest they burnt, on
  // the IGN orthophoto the mock was drawn on — not over a street plan.
  'gironde-megafire-2026': 'ign-ortho',
});

/**
 * Follow the rows and hold the basemap they impose.
 *
 * @param {object} deps
 * @param {(layerId: string) => boolean} deps.isEnabled Settled visibility.
 * @param {() => ?string} deps.getStack The stack on the globe.
 * @param {(stackId: string) => void} deps.setStack Switch the stack.
 * @param {(lock: ?{stackId: string, rowId: string}) => void} deps.setLock
 *   Hold (or release, with `null`) the controller's lock.
 * @param {(stackId: string) => boolean} [deps.isAvailable] Whether this build
 *   can show a stack; a row whose basemap it cannot show locks nothing.
 * @param {Readonly<Record<string, string>>} [deps.rows] Row → stack table.
 * @returns {{onVisibility: (change: {layerId?: string}) => void, sync: () => void}}
 */
export function createRowBasemapLock({
  isEnabled,
  getStack,
  setStack,
  setLock,
  isAvailable = () => true,
  rows = ROW_BASEMAPS,
}) {
  const stackOf = new Map(Object.entries(rows));
  const rowOf = new Map();
  for (const rowId of stackOf.keys()) {
    for (const id of nightAtlasRowMembers(rowId)) rowOf.set(id, rowId);
  }
  const rowLit = (rowId) => nightAtlasRowMembers(rowId).some((id) => isEnabled(id));
  /** The lock this follower holds on the controller, or null. */
  let held = null;
  /** The stack on the globe when the lock was first taken. */
  let previous = null;

  function evaluate() {
    const rowId = [...stackOf.keys()]
      .find((id) => rowLit(id) && isAvailable(stackOf.get(id)));
    if (rowId) {
      if (held?.rowId === rowId) return;
      const stackId = stackOf.get(rowId);
      // Only the FIRST lock remembers: a second row taking over from the first
      // must not record the first one's satellite as the reader's choice.
      if (!held) previous = getStack() ?? null;
      held = { stackId, rowId };
      // Lock before switching, so the controller already refuses everything
      // else by the time the switch is awaited.
      setLock({ stackId, rowId });
      if (getStack() !== stackId) setStack(stackId);
      return;
    }
    if (!held) return;
    const { stackId } = held;
    const back = previous;
    held = null;
    previous = null;
    // Release before switching back, or the controller refuses the way home.
    setLock(null);
    // No check that the globe still shows the lock's stack, although the
    // obvious version would make one: nothing else can move the basemap while
    // the lock holds, and `getStack()` does not see a switch still in flight —
    // a row switched on and off inside one switch would leave the reader on
    // Satellite with no lock to explain it. Asking for the stack already on
    // the globe is free (`setStack` short-circuits it).
    if (back && back !== stackId) setStack(back);
  }

  // Read, not assumed dark: a stored session may have lit a row before this
  // follower existed, and its first visibility change may be a long way off.
  evaluate();

  return {
    /**
     * Feed every SETTLED visibility change. A layer on no such row is ignored.
     */
    onVisibility(change) {
      if (!rowOf.has(change?.layerId)) return;
      evaluate();
    },
    /** Read the rows as they stand now; a no-op when nothing moved. */
    sync: evaluate,
  };
}
