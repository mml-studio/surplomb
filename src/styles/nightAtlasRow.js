/**
 * @module styles/nightAtlasRow
 *
 * The panel row that brings the night atlas with it.
 *
 * « Réseau électrique et centrales » is drawn for a dark ground: under the
 * night atlas the grid wears its night dress (`powerGridFeed.js`) and the
 * stations' columns glow, and the landing page's scene opens the two together
 * with `style=night`. A reader who switched the same row on by hand got the
 * daylight version and had to know to press Night as well. Switching the row
 * on now moves the preset to Night, the way the link does.
 *
 * THREE RULES, each one a case the obvious version gets wrong.
 *
 *  1. Only a READER's switch moves the preset: a hand on the panel (`user`) or
 *     the voice (`voice`). A share link carries its own `style=`, a stored
 *     session comes back the way the reader left it, and a context mode that
 *     parks layers and restores them is not asking for a look. None of them
 *     may override the preset.
 *  2. Switching the row off gives back the preset it replaced — unless the
 *     reader picked another one in the meantime. A preset chosen while the row
 *     was on is the reader's, and it stays.
 *  3. A row switched on under Night owes nothing: the reader who chose Night
 *     keeps it when the row goes off.
 *
 * The row is LIT while any of its layers draws (`layerFusions.js`): a share
 * link can light a companion alone, and a row lit through one of its chips is
 * still the row.
 *
 * Cesium-free and DOM-free, so the rules above are tested under `node --test`
 * against the same code `ui.js` runs.
 */

import { fusionCompanionsFor } from '../data/layerFusions.js';
import { NIGHT_ATLAS_STYLE } from './nightAtlas.js';

/** The rows — fusion primaries — whose switch brings the night atlas. */
export const NIGHT_ATLAS_ROWS = Object.freeze(['power-grid']);

/** Who may move the preset by moving a row. */
const READER_ORIGINS = new Set(['user', 'voice']);

/**
 * Every layer a row carries, the primary first, companions included — an
 * `optIn` companion lights the row as much as a follower does.
 * @param {string} rowId A fusion primary.
 * @returns {string[]}
 */
export function nightAtlasRowMembers(rowId) {
  return [rowId, ...(fusionCompanionsFor(rowId) || []).map((entry) => entry.id)];
}

/**
 * Follow the night rows and move the preset with them.
 *
 * @param {object} deps
 * @param {(layerId: string) => boolean} deps.isEnabled Settled visibility.
 * @param {() => ?string} deps.getStyle The preset on screen.
 * @param {(style: string) => void} deps.setStyle Switch the preset.
 * @param {ReadonlyArray<string>} [deps.rows] Rows to follow.
 * @returns {{
 *   onVisibility: (change: {layerId?: string, origin?: string}) => void,
 *   onStyleChange: () => void,
 *   readonly owedStyle: ?string,
 * }}
 */
export function createNightAtlasRowFollower({
  isEnabled,
  getStyle,
  setStyle,
  rows = NIGHT_ATLAS_ROWS,
}) {
  const rowOf = new Map();
  for (const rowId of rows) {
    for (const id of nightAtlasRowMembers(rowId)) rowOf.set(id, rowId);
  }
  const rowLit = (rowId) => nightAtlasRowMembers(rowId).some((id) => isEnabled(id));
  // Read, not assumed dark: a row a stored session lit before this follower
  // existed would otherwise "light up" on the reader's first chip press.
  const lit = new Map(rows.map((rowId) => [rowId, rowLit(rowId)]));
  // The preset to give back when the rows go dark; null when nothing is owed.
  let restoreTo = null;
  let switching = false;

  const apply = (style) => {
    switching = true;
    try {
      setStyle(style);
    } finally {
      switching = false;
    }
  };

  return {
    /**
     * Feed every SETTLED visibility change. A layer on no night row is ignored;
     * a change that does not flip its row between lit and dark only updates
     * what the follower knows.
     */
    onVisibility(change) {
      const rowId = rowOf.get(change?.layerId);
      if (!rowId) return;
      const was = lit.get(rowId);
      const now = rowLit(rowId);
      lit.set(rowId, now);
      if (now === was || !READER_ORIGINS.has(change?.origin)) return;
      const style = getStyle() || 'normal';
      if (now) {
        if (style === NIGHT_ATLAS_STYLE) return;
        apply(NIGHT_ATLAS_STYLE);
        // After `apply`, not before: the switch announces itself through
        // `onStyleChange`, and a debt written first would be the first thing
        // it cleared.
        restoreTo = style;
        return;
      }
      if ([...lit.values()].some(Boolean)) return;
      const back = restoreTo;
      restoreTo = null;
      if (back && style === NIGHT_ATLAS_STYLE) apply(back);
    },

    /**
     * Every preset change on the page. One this follower did not make is the
     * reader's choice, and there is no longer anything to give back.
     */
    onStyleChange() {
      if (!switching) restoreTo = null;
    },

    /** The preset a dark row would give back, for tests and the console. */
    get owedStyle() {
      return restoreTo;
    },
  };
}
