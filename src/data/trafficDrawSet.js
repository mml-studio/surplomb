/**
 * @file The view frustum for the traffic layer's DRAW set.
 *
 * WHY THE FETCH BOX AND THE DRAW SET ARE TWO DIFFERENT QUESTIONS. The box the
 * layer asks Overpass for sits on a cache lattice, and that lattice is what
 * turns a repeated road query from 46 s into 65 ms — for every reader, not just
 * the one who warmed it. Shrinking the box to what is on screen would put the
 * camera pose back into the cache key and take that away. So the box does not
 * move. What moves is which of the roads it returned get cars.
 *
 * WHY THE RENDER FRAME IS NOT ENOUGH. `visibleRoadsForAltitude` already trims
 * the network to `_lastRenderBox`, the viewport box capped to the band. That
 * box is AXIS-ALIGNED in lat/lon, and at oblique pitch the view is a trapezoid
 * stretching toward the horizon — its bounding rectangle holds a great deal the
 * trapezoid does not. Measured 2026-09-16 with that frame in place, Paris
 * 800 m / pitch −30°: **6 000 dots drawn and 51.8 % of them off screen**, every
 * frame, for the whole session. `animate()` walks `_dots` in full on every
 * preRender. With the frustum the same view draws 3 352 and 14.2 % — the
 * residual being the margin below, which exists so cars do not flicker out at
 * the edge.
 *
 * WHAT THE GAIN ACTUALLY IS, and it is not where it first looks. Measured on
 * this machine: `animate()` over 6 000 dots costs 1.072 ms/frame (p90 3.0)
 * against 0.252 ms for 2 640 — **0.82 ms per frame, ~2.0 s of main thread over
 * 40 s**. The road-floor seating loop is NOT a target: its cost is per BATCH
 * (~47 ms fixed + 3.2 ms/probe), so shrinking the set it probes buys nothing
 * and fragmenting it into more batches costs. Seating is re-ORDERED by this
 * module, never reduced.
 *
 * WHY THE FRUSTUM ALONE. The coarsest band caps at 30 km altitude over a 0.30°
 * box (~33 km); the horizon from 30 km is ~620 km away, so nothing in the box
 * can be behind the limb. `EllipsoidalOccluder` is not a view frustum and has
 * nothing to do here — unlike `firmsHeatmap`, which works at 1 500 km.
 *
 * Split so the decisions are testable without a globe: the arithmetic (pose,
 * churn, margin) is Cesium-free, and only the two functions that must hold a
 * `CullingVolume` touch Cesium.
 *
 * @module data/trafficDrawSet
 */
import * as Cesium from 'cesium';

/**
 * Screen-space slack on every edge, as a factor on tan(fov/2).
 *
 * Measured 2026-09-16 over 2 000 synthetic roads under a Paris 800 m / −30°
 * camera: 1.00 rejects 64 % of roads, 1.10 rejects 58 %, 1.20 rejects 55 %,
 * 1.30 rejects 53 %.
 *
 * 1.20 and not less, because the margin has to cover what the POSE GATE below
 * lets drift before it re-culls. At the default 60° fov, 3.9° of heading takes
 * the horizontal edge from tan 30° to tan 33.9° — a ratio of 1.164 — and 3° of
 * pitch takes the vertical half-angle at 16:9 from 18.0° to 21.0°, a ratio of
 * 1.182. A margin under those is a margin that lets cars vanish while they are
 * still on screen, which is the one failure this gate must not have.
 */
export const TRAFFIC_CULL_MARGIN = 1.20;

/**
 * How far the camera may drift before the draw set is recomputed.
 *
 * Read together with {@link TRAFFIC_CULL_MARGIN}: the margin has to be wider
 * than what these allow, or the gate is a flicker generator. Note that 4° of
 * HEADING is not 4° of axis: at pitch −30° it is only 3.46° of angle between
 * the two view directions, which is why the axis threshold is stated in axis
 * terms and not in compass terms.
 */
export const CULL_POSE_THRESHOLDS = Object.freeze({
  axisDeg: 3.5,
  rollDeg: 3,
  moveM: 120,
});

/** Fraction of the draw set that must change before a respawn is worth it. */
export const CULL_CHURN_FRACTION = 0.02;
/** Floor on that fraction — below this, the churn is noise. */
export const CULL_CHURN_MIN_ROADS = 3;

/**
 * Widen a field of view by a margin factor applied to its half-angle tangent.
 *
 * @param {number} fov Field of view in radians.
 * @param {number} margin Factor on tan(fov/2); <= 1 returns `fov` untouched.
 * @returns {number} Widened field of view in radians.
 */
export function widenFov(fov, margin) {
  if (!Number.isFinite(fov) || !(margin > 1)) return fov;
  return Math.min(Math.PI * 0.99, 2 * Math.atan(Math.tan(fov / 2) * margin));
}

/**
 * The camera pose, as nine plain numbers.
 *
 * NOT `camera.heading` / `camera.pitch`: those are getters that only a real
 * `Cesium.Camera` has, and every test double in this repo builds a camera out
 * of `positionWC` / `directionWC` / `upWC` instead. Reading heading off one of
 * those yields NaN, and `NaN >= 4` is false — so the gate would fail CLOSED and
 * a pure rotation, which does not move `positionWC` at all, would never
 * re-cull. Nine numbers have no getters and no failure mode.
 *
 * @param {Object} camera
 * @returns {?{dx:number,dy:number,dz:number,ux:number,uy:number,uz:number,px:number,py:number,pz:number}}
 */
export function cameraCullPose(camera) {
  const d = camera?.directionWC;
  const u = camera?.upWC;
  const p = camera?.positionWC;
  if (!d || !u || !p) return null;
  return {
    dx: d.x, dy: d.y, dz: d.z,
    ux: u.x, uy: u.y, uz: u.z,
    px: p.x, py: p.y, pz: p.z,
  };
}

const dot3 = (a, b, k) => (a[`${k}x`] * b[`${k}x`]) + (a[`${k}y`] * b[`${k}y`]) + (a[`${k}z`] * b[`${k}z`]);

/**
 * Whether the camera has moved enough to be worth re-culling.
 *
 * Fails OPEN — anything non-finite, or a missing previous pose, means "yes,
 * re-cull". A gate that failed closed would freeze the draw set in whatever
 * pose it happened to hold, which is indistinguishable from the bug this file
 * exists to fix.
 *
 * @param {?Object} prev Previous pose, or null.
 * @param {?Object} next Current pose, or null.
 * @param {{axisDeg:number, rollDeg:number, moveM:number}} [thresholds]
 * @returns {boolean}
 */
export function cullPoseMoved(prev, next, thresholds = CULL_POSE_THRESHOLDS) {
  if (!prev || !next) return true;
  for (const key of ['dx', 'dy', 'dz', 'ux', 'uy', 'uz', 'px', 'py', 'pz']) {
    if (!Number.isFinite(prev[key]) || !Number.isFinite(next[key])) return true;
  }
  const axis = Math.acos(Math.min(1, Math.max(-1, dot3(prev, next, 'd'))));
  if (axis >= (thresholds.axisDeg * Math.PI) / 180) return true;
  const roll = Math.acos(Math.min(1, Math.max(-1, dot3(prev, next, 'u'))));
  if (roll >= (thresholds.rollDeg * Math.PI) / 180) return true;
  const mx = next.px - prev.px;
  const my = next.py - prev.py;
  const mz = next.pz - prev.pz;
  return Math.sqrt((mx * mx) + (my * my) + (mz * mz)) >= thresholds.moveM;
}

/**
 * Which roads entered the draw set and which left it.
 *
 * Identity-based and order-independent: the road objects are the same instances
 * across a re-cull, because the network is not re-parsed.
 *
 * @param {Array} prev Previous draw set.
 * @param {Array} next New draw set.
 * @returns {{entered: Array, left: Array}}
 */
export function drawSetDelta(prev, next) {
  const before = new Set(prev || []);
  const after = new Set(next || []);
  const entered = [];
  const left = [];
  for (const road of after) if (!before.has(road)) entered.push(road);
  for (const road of before) if (!after.has(road)) left.push(road);
  return { entered, left };
}

/**
 * Whether a re-cull has changed enough to be worth applying.
 *
 * The threshold lives here rather than at the call site because it is a
 * DECISION, and a decision written inline in a Cesium function is a decision no
 * test can reach. Measured: at 4° of heading in a 60° field, the corner that
 * enters is worth ~7 % of the set — so the floor has to be well under that, and
 * the minimum of 3 roads is what keeps a tiny set from churning on one road.
 *
 * @param {Array} prevDraw
 * @param {Array} nextDraw
 * @param {{fraction?:number, minRoads?:number}} [opts]
 * @returns {{respawn:boolean, entered:Array, left:Array, delta:number, floor:number}}
 */
export function shouldRespawnDrawSet(prevDraw, nextDraw, opts = {}) {
  const fraction = Number.isFinite(opts.fraction) ? opts.fraction : CULL_CHURN_FRACTION;
  const minRoads = Number.isFinite(opts.minRoads) ? opts.minRoads : CULL_CHURN_MIN_ROADS;
  const { entered, left } = drawSetDelta(prevDraw, nextDraw);
  const delta = entered.length + left.length;
  const floor = Math.max(minRoads, Math.round((nextDraw?.length || 0) * fraction));
  return { respawn: delta >= floor, entered, left, delta, floor };
}

// ─── The two functions that must hold Cesium objects ───────

/**
 * The widened view frustum, as a culling volume.
 *
 * Fails OPEN: null culls nothing, which is what a test double, a half-built
 * scene, or an orthographic frustum with no `fov` gets. A gate that threw — or
 * that culled everything when it could not answer — would empty the street
 * rather than merely fail to trim it.
 *
 * The frustum is CLONED before it is widened. The camera's own frustum is
 * shared with the renderer, and widening it in place would widen what the globe
 * itself draws.
 *
 * @param {Object} camera
 * @param {number} [margin]
 * @returns {?Cesium.CullingVolume}
 */
export function trafficCullingVolume(camera, margin = TRAFFIC_CULL_MARGIN) {
  const frustum = camera?.frustum;
  if (typeof frustum?.computeCullingVolume !== 'function') return null;
  if (!camera.positionWC || !camera.directionWC || !camera.upWC) return null;
  try {
    let widened = frustum;
    if (Number.isFinite(frustum.fov) && typeof frustum.clone === 'function') {
      widened = frustum.clone();
      widened.fov = widenFov(frustum.fov, margin);
    }
    return widened.computeCullingVolume(camera.positionWC, camera.directionWC, camera.upWC);
  } catch {
    return null;
  }
}

/**
 * The bounding sphere of a road's drawn geometry, built once and kept on it.
 *
 * 2.6 µs per road measured, so building it lazily on the first cull costs less
 * than the parse pass it was tempting to add it to — and `parseRoads` has a
 * timed twin whose source is compared against it byte for byte, so nothing may
 * be added there.
 *
 * @param {{waypoints: Array}} road
 * @returns {?Cesium.BoundingSphere}
 */
export function roadCullSphere(road) {
  if (road.cullSphere) return road.cullSphere;
  if (!road.waypoints?.length) return null;
  road.cullSphere = Cesium.BoundingSphere.fromPoints(road.waypoints);
  return road.cullSphere;
}

/**
 * Forget a road's cached sphere.
 *
 * Called by `applyRoadFloor` the moment it seats a road: that function moves
 * every waypoint in Z, and the sphere the frustum gate tests was built from the
 * old ones. Measured over Biarritz, roads seat between 56.1 m and 109.4 m, so a
 * stale sphere is a wrong answer at the screen edge — and it is exported rather
 * than inlined precisely so the invalidate-then-rebuild cycle has a test.
 *
 * @param {Object} road
 */
export function invalidateRoadCullSphere(road) {
  if (road) road.cullSphere = null;
}

/**
 * Split a road list into what the camera can see and what it cannot.
 *
 * `keep` is a boolean array ALIGNED ON THE INDEXES of `roads`, because the dot
 * allocator is index-addressed and the budget is computed before the cull —
 * deliberately. Redirecting an off-screen road's budget to an on-screen one
 * would double the cars on every street in view, which is a visible regression
 * bought in the name of performance.
 *
 * @param {Array} roads
 * @param {?Cesium.CullingVolume} cullingVolume Null keeps everything.
 * @returns {{draw: Array, keep: boolean[], culled: number}}
 */
export function selectDrawRoads(roads, cullingVolume) {
  const keep = new Array(roads.length);
  if (!cullingVolume) {
    keep.fill(true);
    return { draw: roads.slice(), keep, culled: 0 };
  }
  const draw = [];
  let culled = 0;
  for (let i = 0; i < roads.length; i++) {
    const sphere = roadCullSphere(roads[i]);
    const visible = !sphere
      || cullingVolume.computeVisibility(sphere) !== Cesium.Intersect.OUTSIDE;
    keep[i] = visible;
    if (visible) draw.push(roads[i]);
    else culled += 1;
  }
  return { draw, keep, culled };
}
