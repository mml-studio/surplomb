/**
 * @module styles/nightAtlasRow
 *
 * The panel rows that bring a darker ground with them, and take it away.
 *
 * « Réseau électrique et centrales » is drawn for a dark ground: under the
 * night atlas the grid wears its night dress (`powerGridFeed.js`) and the
 * stations' columns glow, and the landing page's scene opens the two together
 * with `style=night`. A reader who switched the same row on by hand got the
 * daylight version and had to know to press Night as well. Switching the row
 * on now moves the preset to Night, the way the link does — and switching it
 * off puts a night map back to Normal.
 *
 * « Infrastructure numérique » does the same with DUSK (`dusk.js`), since the
 * mock of 2026-09-23: the antennas' line of sight and the data-centre poles
 * glow over a dimmed ground, and Night was too dark for a reader who is also
 * reading the terrain. Each row names its own preset in {@link ROW_PRESETS}.
 *
 * THREE RULES, each one a case the obvious version gets wrong.
 *
 *  1. Only a READER's switch moves the preset: a hand on the panel (`user`) or
 *     the voice (`voice`). A share link carries its own `style=`, a stored
 *     session comes back the way the reader left it, and a context mode that
 *     parks layers and restores them is not asking for a look. None of them
 *     may override the preset.
 *  2. Off means Normal, whoever lit the row. The first version gave back the
 *     preset the row had REPLACED, and owed nothing when it had replaced
 *     nothing — which is every arrival from the landing page, where the link
 *     lit the row and asked for Night itself. A reader switched the row off
 *     there and stayed in the dark. The operator asked for the plain rule:
 *     on, Night; off, Normal. With two such rows lit, the one still lit keeps
 *     its own preset on screen.
 *  3. Only a preset a row BRINGS is put back. A preset the reader picked while
 *     the row was on — CRT, FLIR — is theirs, and the row going dark leaves it
 *     alone.
 *
 * The row is LIT while any of its layers draws (`layerFusions.js`): a share
 * link can light a companion alone, and a row lit through one of its chips is
 * still the row. It goes DARK when the last of them stops.
 *
 * Cesium-free and DOM-free, so the rules above are tested under `node --test`
 * against the same code `ui.js` runs.
 */

import { fusionCompanionsFor } from '../data/layerFusions.js';
import { DUSK_STYLE } from './dusk.js';
import { NIGHT_ATLAS_STYLE } from './nightAtlas.js';

/**
 * The rows — fusion primaries — whose switch brings a darker ground, and which.
 *
 * An entry may also be ONE MEMBER of a row, when only that member is drawn
 * for the dark: « Grands incendies » (`gironde-megafire-2026`) glows on Dusk,
 * while « Détections récentes », the other mode of « Incendies », is read on
 * the plain globe. A member keyed here is followed alone — it has no
 * companions of its own — so pressing its tile is what brings the night.
 */
export const ROW_PRESETS = Object.freeze({
  'power-grid': NIGHT_ATLAS_STYLE,
  // « Infrastructure numérique », whose primary is the data centres.
  'local-datacenters': DUSK_STYLE,
  // The replayed fire of « Incendies » (mock of 2026-09-23): rings of light
  // over the forest they burnt. Dusk and not Night, at the operator's request:
  // the ground stays readable under the zones.
  'gironde-megafire-2026': DUSK_STYLE,
});

/** The rows whose switch brings the night atlas itself. */
export const NIGHT_ATLAS_ROWS = Object.freeze(
  Object.keys(ROW_PRESETS).filter((rowId) => ROW_PRESETS[rowId] === NIGHT_ATLAS_STYLE),
);

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
 * Follow the rows and move the preset with them.
 *
 * @param {object} deps
 * @param {(layerId: string) => boolean} deps.isEnabled Settled visibility.
 * @param {() => ?string} deps.getStyle The preset on screen.
 * @param {(style: string) => void} deps.setStyle Switch the preset.
 * @param {ReadonlyArray<string>|Readonly<Record<string, string>>} [deps.rows]
 *   Rows to follow: a row → preset table, or a list of rows that all bring the
 *   night atlas.
 * @returns {{onVisibility: (change: {layerId?: string, origin?: string}) => void}}
 */
export function createNightAtlasRowFollower({
  isEnabled,
  getStyle,
  setStyle,
  rows = ROW_PRESETS,
}) {
  const presets = new Map(Array.isArray(rows)
    ? rows.map((rowId) => [rowId, NIGHT_ATLAS_STYLE])
    : Object.entries(rows));
  const brought = new Set(presets.values());
  const rowOf = new Map();
  for (const rowId of presets.keys()) {
    for (const id of nightAtlasRowMembers(rowId)) rowOf.set(id, rowId);
  }
  const rowLit = (rowId) => nightAtlasRowMembers(rowId).some((id) => isEnabled(id));
  // Read, not assumed dark: a row a stored session lit before this follower
  // existed would otherwise "light up" on the reader's first chip press.
  const lit = new Map([...presets.keys()].map((rowId) => [rowId, rowLit(rowId)]));

  return {
    /**
     * Feed every SETTLED visibility change. A layer on no such row is ignored;
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
      const current = getStyle() || 'normal';
      if (now) {
        const preset = presets.get(rowId);
        if (current !== preset) setStyle(preset);
        return;
      }
      if (!brought.has(current)) return;
      // Another row still drawing keeps ITS ground on screen.
      const stillLit = [...lit].filter(([, on]) => on).map(([id]) => presets.get(id));
      if (stillLit.length) {
        if (!stillLit.includes(current)) setStyle(stillLit[stillLit.length - 1]);
        return;
      }
      setStyle('normal');
    },
  };
}
