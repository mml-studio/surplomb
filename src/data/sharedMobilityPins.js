/**
 * @module sharedMobilityPins
 *
 * Which parked vehicles wear a PIN, out of the thousands drawn as dots.
 *
 * Adopted 2026-09-21 from the « Repères discrets » mock: every vehicle is a
 * dot in its operator's hue, and a few of them — never two within
 * {@link SHARED_MOBILITY_PIN_SPACING_PX} of each other on screen — carry a pin
 * that says what the vehicle is. The dots say how many and whose; the pins
 * say what, without a carpet of silhouettes over the street.
 *
 * WHY A SCREEN RULE, AND NOT A GROUND ONE. The views this layer opens on are
 * oblique: the landing's Paris link looks down at 55°, so a fixed ground cell
 * spans ten times more pixels at the bottom of the screen than near the
 * horizon, and a ground grid piles pins up exactly where the street is
 * smallest. Spacing is therefore measured in CSS pixels, on the camera's own
 * projection, once per arrival — never per frame.
 *
 * WHY THE SAME VEHICLES FROM ONE ARRIVAL TO THE NEXT. A pin that hopped to a
 * neighbour on every pan, or on every 60-second poll, would read as the fleet
 * moving when nothing did. Candidates are ranked by a hash of their id, which
 * a poll does not change, and the pins held before the move are offered first:
 * a short pan keeps every pin that still has room.
 *
 * Pure on purpose: the projection lives in `sharedMobilityFrance.js`, and this
 * turns screen points into a set of ids.
 */

/**
 * Least distance between two pins, in CSS px.
 *
 * Set against the mock rather than chosen: it holds ~18 pins over a
 * 1,200 × 1,300 view. 200 px gives 26 over a 1,440 × 900 desktop and 8 over a
 * 390 × 844 phone on the densest Paris view — the same density on both, so a
 * phone gets fewer pins, not smaller ones — and it is six times the pin's own
 * width, which is what keeps two pins from ever touching.
 */
export const SHARED_MOBILITY_PIN_SPACING_PX = 200;

/**
 * Hard ceiling on pins, whatever the screen. A 3,840 × 2,160 desktop would
 * otherwise hold about 160; past a few dozen a pin stops being a landmark.
 */
export const SHARED_MOBILITY_PIN_MAX = 48;

/** FNV-1a 32-bit — stable across sessions, polls and processes. */
export function sharedMobilityPinRank(id) {
  const text = String(id ?? '');
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Choose the pinned vehicles.
 *
 * Greedy, in priority order — the forced id (the selected vehicle), then the
 * incumbents, then everything else by rank — and a candidate is kept only if
 * no kept pin lies within `spacingPx`. A grid of `spacingPx` cells means each
 * test reads nine cells, so the pass is linear in the candidates: about 4,000
 * over the densest Paris view.
 *
 * @param {Array<{id: string, x: number, y: number, rank: number}>} candidates
 *   Vehicles already projected to CSS px and already known to be on screen.
 * @param {Object} [options]
 * @param {number} [options.spacingPx=SHARED_MOBILITY_PIN_SPACING_PX]
 * @param {number} [options.max=SHARED_MOBILITY_PIN_MAX]
 * @param {?Set<string>} [options.incumbents] Ids pinned before this pass.
 * @param {?string} [options.forced] An id pinned whatever its neighbours.
 * @returns {Array<string>} Pinned ids, forced first.
 */
export function selectSharedMobilityPins(candidates, options = {}) {
  const spacing = Number.isFinite(options.spacingPx) && options.spacingPx > 0
    ? options.spacingPx
    : SHARED_MOBILITY_PIN_SPACING_PX;
  const max = Number.isFinite(options.max) ? Math.max(0, Math.floor(options.max)) : SHARED_MOBILITY_PIN_MAX;
  const incumbents = options.incumbents || null;
  const forced = options.forced ?? null;
  if (!max || !Array.isArray(candidates) || !candidates.length) return [];

  const tier = (candidate) => {
    if (candidate.id === forced) return 0;
    return incumbents?.has(candidate.id) ? 1 : 2;
  };
  const ordered = candidates
    .filter((candidate) => Number.isFinite(candidate?.x) && Number.isFinite(candidate?.y))
    .sort((a, b) => tier(a) - tier(b) || a.rank - b.rank || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const cells = new Map();
  const spacing2 = spacing * spacing;
  const kept = [];
  for (const candidate of ordered) {
    const cx = Math.floor(candidate.x / spacing);
    const cy = Math.floor(candidate.y / spacing);
    let crowded = false;
    for (let dx = -1; dx <= 1 && !crowded; dx++) {
      for (let dy = -1; dy <= 1 && !crowded; dy++) {
        const cell = cells.get(`${cx + dx},${cy + dy}`);
        if (!cell) continue;
        for (const other of cell) {
          const ex = other.x - candidate.x;
          const ey = other.y - candidate.y;
          if (ex * ex + ey * ey < spacing2) { crowded = true; break; }
        }
      }
    }
    if (crowded) continue;
    const key = `${cx},${cy}`;
    const cell = cells.get(key);
    if (cell) cell.push(candidate);
    else cells.set(key, [candidate]);
    kept.push(candidate.id);
    if (kept.length >= max) break;
  }
  return kept;
}
