/**
 * @module sharedMobilityClusters
 *
 * The city-wide view of the shared fleets: GROUPS, each a count and the
 * operators it holds, instead of thousands of dots.
 *
 * Adopted 2026-09-21 from the « Regroupements lisibles » mock, as the third
 * tier after the dots and the pins (`sharedMobilityPins.js`): above the pins'
 * ceiling, over a view holding at least `GBFS_CLUSTER_ABOVE` vehicles, the
 * proxy counts them on a fixed grid (`clusterGbfsVehicles` in `gbfsFeeds.js`)
 * and the layer draws one bubble per group. A sparser view keeps its dots.
 * The counts are the server's, over every vehicle it holds — the client never
 * sees the objects, so a number on the map cannot be the 6,000-object cap's
 * fair share.
 *
 * Pure on purpose: the Cesium side lives in `sharedMobilityFrance.js`, and this
 * turns the proxy's groups into the bubbles to draw.
 */
import { GBFS_CLUSTER_CELLS_DEG, GBFS_CLUSTER_LON_FACTOR, gbfsClusterCellKey } from './gbfsFeeds.js';

/**
 * Screen size a grid cell aims at, in CSS px. The grid only doubles, so a cell
 * lands between 113 and 226 px: about fifty groups over a 1,440 × 900 desktop
 * and a dozen over a phone, where the mock drew twenty over 1,200 × 1,300.
 */
export const SHARED_MOBILITY_CLUSTER_CELL_PX = 160;

/**
 * Two bubbles closer than this on screen become one. Two neighbouring cells
 * can put their centroids a few pixels apart across their shared edge, and a
 * bubble is 46 px wide: merged, the count is still the sum, and still true.
 */
export const SHARED_MOBILITY_BUBBLE_MERGE_PX = 58;

/** Metres per degree of latitude. */
const M_PER_DEG = 111_320;

/**
 * The grid step for a view, from its ground resolution: the step of
 * {@link GBFS_CLUSTER_CELLS_DEG} nearest, on a log scale, to a cell of
 * {@link SHARED_MOBILITY_CLUSTER_CELL_PX}.
 * @param {number} metresPerPixel Ground metres per CSS px at the screen centre.
 * @param {number} [targetPx]
 * @returns {?number} A grid step, or null when the resolution is unusable.
 */
export function sharedMobilityClusterCell(metresPerPixel, targetPx = SHARED_MOBILITY_CLUSTER_CELL_PX) {
  if (!(metresPerPixel > 0) || !Number.isFinite(metresPerPixel)) return null;
  const wanted = (metresPerPixel * targetPx) / M_PER_DEG;
  let best = GBFS_CLUSTER_CELLS_DEG[0];
  for (const step of GBFS_CLUSTER_CELLS_DEG) {
    if (Math.abs(Math.log(step / wanted)) < Math.abs(Math.log(best / wanted))) best = step;
  }
  return best;
}

/**
 * The groups as the filters see them.
 *
 * Draw-only, like every filter of the row: a group's `by` says `system|kind`
 * → count, so a family filter or an operator focus re-counts it here without
 * a request. A group the filters empty is dropped.
 *
 * @param {Array<{id:string, lat:number, lon:number, n:number, by:Object<string, number>}>} clusters
 * @param {Object} options
 * @param {(system: string, kind: string) => boolean} options.keep The row's filters.
 * @param {(system: string) => {id:string, color:string}} options.operatorOf
 * @returns {Array<{id:string, lat:number, lon:number, n:number,
 *   operators: Array<{id:string, color:string, n:number}>}>}
 */
export function foldSharedMobilityClusters(clusters, { keep, operatorOf }) {
  const out = [];
  for (const cluster of Array.isArray(clusters) ? clusters : []) {
    const byOperator = new Map();
    let n = 0;
    for (const [tag, count] of Object.entries(cluster?.by || {})) {
      const cut = tag.lastIndexOf('|');
      const system = tag.slice(0, cut);
      const kind = tag.slice(cut + 1);
      if (!(count > 0) || !keep(system, kind)) continue;
      const operator = operatorOf(system);
      const seen = byOperator.get(operator.id);
      if (seen) seen.n += count;
      else byOperator.set(operator.id, { id: operator.id, color: operator.color, n: count });
      n += count;
    }
    if (!n) continue;
    out.push({
      id: cluster.id,
      lat: cluster.lat,
      lon: cluster.lon,
      n,
      operators: [...byOperator.values()].sort((a, b) => b.n - a.n || (a.id < b.id ? -1 : 1)),
    });
  }
  return out;
}

/**
 * Count the docks' available bikes into the groups of the same grid cells.
 *
 * A dock joins the group of its cell — the proxy's own key, so a Vélib' dock
 * and the Lime bikes parked beside it land in one bubble — or opens a group of
 * its own where no fleet vehicle is. It adds its bikes to the count, its
 * network to the bar, and pulls the centroid by its weight. An empty dock adds
 * nothing: a bubble counts what can be ridden away.
 *
 * Only docks inside `box` grown by one cell are counted, the rule the proxy
 * applies to its own cells.
 *
 * @param {Array<Object>} bubbles {@link foldSharedMobilityClusters}' answer.
 * @param {Array<{lat:number, lon:number, bikes:number, operator:{id:string, color:string}}>} docks
 * @param {number} cellDeg The answer's grid step.
 * @param {?{south:number, west:number, north:number, east:number}} box
 * @returns {Array<Object>} The same shape, with the docks in.
 */
export function addDocksToSharedMobilityBubbles(bubbles, docks, cellDeg, box = null) {
  if (!(cellDeg > 0) || !Array.isArray(docks) || !docks.length) return bubbles;
  const byId = new Map(bubbles.map((bubble) => [bubble.id, {
    ...bubble,
    operators: bubble.operators.map((operator) => ({ ...operator })),
    latSum: bubble.lat * bubble.n,
    lonSum: bubble.lon * bubble.n,
  }]));
  const lonStep = cellDeg * GBFS_CLUSTER_LON_FACTOR;
  for (const dock of docks) {
    const bikes = Number(dock?.bikes);
    if (!(bikes > 0) || !Number.isFinite(dock.lat) || !Number.isFinite(dock.lon)) continue;
    if (box && (dock.lat < box.south - cellDeg || dock.lat > box.north + cellDeg
      || dock.lon < box.west - lonStep || dock.lon > box.east + lonStep)) continue;
    const id = gbfsClusterCellKey(dock.lat, dock.lon, cellDeg);
    let bubble = byId.get(id);
    if (!bubble) {
      bubble = { id, lat: dock.lat, lon: dock.lon, n: 0, operators: [], latSum: 0, lonSum: 0 };
      byId.set(id, bubble);
    }
    bubble.n += bikes;
    bubble.latSum += dock.lat * bikes;
    bubble.lonSum += dock.lon * bikes;
    const seen = bubble.operators.find((operator) => operator.id === dock.operator.id);
    if (seen) seen.n += bikes;
    else bubble.operators.push({ id: dock.operator.id, color: dock.operator.color, n: bikes });
  }
  return [...byId.values()].map(({ latSum, lonSum, ...bubble }) => ({
    ...bubble,
    lat: latSum / bubble.n,
    lon: lonSum / bubble.n,
    operators: bubble.operators.sort((a, b) => b.n - a.n || (a.id < b.id ? -1 : 1)),
  }));
}

/**
 * Merge the bubbles that would touch on screen.
 *
 * Greedy, biggest first: a bubble absorbs every smaller one within
 * `mergePx`, adding its count and its operators, and moves to their weighted
 * centroid. The merged bubble keeps the biggest member's id, so a poll that
 * brings the same fleet back keeps the same bubbles.
 *
 * @param {Array<{id:string, x:number, y:number, lat:number, lon:number, n:number,
 *   operators:Array<{id:string, color:string, n:number}>}>} bubbles Projected to CSS px.
 * @param {number} [mergePx]
 * @returns {Array<Object>} The same shape, fewer of them.
 */
export function mergeSharedMobilityBubbles(bubbles, mergePx = SHARED_MOBILITY_BUBBLE_MERGE_PX) {
  const ordered = (Array.isArray(bubbles) ? bubbles : [])
    .filter((bubble) => Number.isFinite(bubble?.x) && Number.isFinite(bubble?.y))
    .sort((a, b) => b.n - a.n || (a.id < b.id ? -1 : 1));
  const limit2 = mergePx * mergePx;
  const taken = new Set();
  const out = [];
  for (let i = 0; i < ordered.length; i++) {
    if (taken.has(i)) continue;
    const head = ordered[i];
    const merged = {
      ...head,
      operators: head.operators.map((operator) => ({ ...operator })),
    };
    let latSum = head.lat * head.n;
    let lonSum = head.lon * head.n;
    for (let j = i + 1; j < ordered.length; j++) {
      if (taken.has(j)) continue;
      const other = ordered[j];
      const dx = other.x - head.x;
      const dy = other.y - head.y;
      if (dx * dx + dy * dy >= limit2) continue;
      taken.add(j);
      merged.n += other.n;
      latSum += other.lat * other.n;
      lonSum += other.lon * other.n;
      for (const operator of other.operators) {
        const seen = merged.operators.find((entry) => entry.id === operator.id);
        if (seen) seen.n += operator.n;
        else merged.operators.push({ ...operator });
      }
    }
    merged.lat = latSum / merged.n;
    merged.lon = lonSum / merged.n;
    merged.operators.sort((a, b) => b.n - a.n || (a.id < b.id ? -1 : 1));
    out.push(merged);
  }
  return out;
}

/**
 * The operator bar under a bubble's count: one segment per operator, in its
 * hue, as wide as its share — the mock's bar. Four operators at most, the rest
 * folded into a neutral tail, and never a segment under 2 px, so a small share
 * is still seen rather than rounded away.
 *
 * @param {Array<{id:string, color:string, n:number}>} operators Biggest first.
 * @param {number} widthPx The bar's width.
 * @param {{max?: number, minPx?: number, tailColor?: string}} [options]
 * @returns {Array<{color:string, x:number, w:number}>} `x` from the bar's left edge.
 */
export function sharedMobilityBubbleBar(operators, widthPx, { max = 4, minPx = 2, tailColor = '#9fb0c4' } = {}) {
  const list = Array.isArray(operators) ? operators.filter((operator) => operator.n > 0) : [];
  const total = list.reduce((sum, operator) => sum + operator.n, 0);
  if (!total || !(widthPx > 0)) return [];
  const shown = list.slice(0, max);
  const rest = list.slice(max).reduce((sum, operator) => sum + operator.n, 0);
  const parts = shown.map((operator) => ({ color: operator.color, n: operator.n }));
  if (rest) parts.push({ color: tailColor, n: rest });
  // Floors first, then the width that is left shared by count.
  const floor = Math.min(minPx, widthPx / parts.length);
  const free = widthPx - floor * parts.length;
  let x = 0;
  return parts.map((part) => {
    const w = floor + (free * part.n) / total;
    const segment = { color: part.color, x, w };
    x += w;
    return segment;
  });
}

/** Clear space kept around a place label, in CSS px. */
export const SHARED_MOBILITY_PLACE_GAP_PX = 6;

/**
 * The place labels of the country view that fit, heaviest first.
 *
 * A label is a name, and two names cannot be summed the way two counts can —
 * so where {@link mergeSharedMobilityBubbles} folds, this one yields: a label
 * that would overlap one already kept is not drawn at all, the way a map drops
 * the smaller town's name. Zoomed in, it has the room and comes back.
 *
 * @param {Array<{id:string, x:number, y:number, w:number, h:number, weight:number}>} labels
 *   Projected, centred on `x`/`y`, in CSS px.
 * @param {{gapPx?: number}} [options]
 * @returns {Array<Object>} The labels kept, heaviest first.
 */
export function placeSharedMobilityLabels(labels, { gapPx = SHARED_MOBILITY_PLACE_GAP_PX } = {}) {
  const ordered = (Array.isArray(labels) ? labels : [])
    .filter((label) => Number.isFinite(label?.x) && Number.isFinite(label?.y))
    .sort((a, b) => (b.weight || 0) - (a.weight || 0) || (a.id < b.id ? -1 : 1));
  const kept = [];
  for (const label of ordered) {
    const clash = kept.some((other) => (
      Math.abs(other.x - label.x) * 2 < other.w + label.w + 2 * gapPx
      && Math.abs(other.y - label.y) * 2 < other.h + label.h + 2 * gapPx
    ));
    if (!clash) kept.push(label);
  }
  return kept;
}
