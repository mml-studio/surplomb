// src/data/trafficDrawSet.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as Cesium from 'cesium';
import {
  TRAFFIC_CULL_MARGIN,
  CULL_POSE_THRESHOLDS,
  CULL_CHURN_MIN_ROADS,
  widenFov,
  cameraCullPose,
  cullPoseMoved,
  drawSetDelta,
  shouldRespawnDrawSet,
  trafficCullingVolume,
  roadCullSphere,
  invalidateRoadCullSphere,
  selectDrawRoads,
} from './trafficDrawSet.js';

/** A camera at `height` over `lon/lat`, looking down, with an ORTHONORMAL triple. */
function nadirCamera({ lon = 2.35, lat = 48.85, height = 800, fov = Math.PI / 3 } = {}) {
  const eye = Cesium.Cartesian3.fromDegrees(lon, lat, height);
  const direction = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.negate(eye, new Cesium.Cartesian3()),
    new Cesium.Cartesian3(),
  );
  const right = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.cross(direction, Cesium.Cartesian3.UNIT_Z, new Cesium.Cartesian3()),
    new Cesium.Cartesian3(),
  );
  const up = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.cross(right, direction, new Cesium.Cartesian3()),
    new Cesium.Cartesian3(),
  );
  return {
    positionWC: eye,
    directionWC: direction,
    upWC: up,
    frustum: Object.assign(new Cesium.PerspectiveFrustum(), {
      fov, aspectRatio: 16 / 9, near: 1, far: 50_000_000,
    }),
  };
}

/** A road of two waypoints at `lon/lat`, shaped like `parseRoads` output. */
function road(lon, lat, { flow = null } = {}) {
  return {
    coords: [[lon, lat], [lon + 0.0005, lat]],
    waypoints: [
      Cesium.Cartesian3.fromDegrees(lon, lat, 0),
      Cesium.Cartesian3.fromDegrees(lon + 0.0005, lat, 0),
    ],
    type: 'residential',
    flow,
  };
}

// ─── Margin and fov ────────────────────────────────────────

test('the margin is wider than what the pose gate lets the camera drift', () => {
  // A margin under the gate's own tolerance is a flicker generator: cars would
  // vanish from roads still on screen and come back on the next settle.
  // At the default 60° fov the horizontal edge sits at tan 30°; 3.5° of axis
  // takes it to tan 33.5°.
  const edge = Math.tan(Math.PI / 6);
  const drifted = Math.tan(((30 + CULL_POSE_THRESHOLDS.axisDeg) * Math.PI) / 180);
  assert.ok(
    TRAFFIC_CULL_MARGIN >= drifted / edge,
    `margin ${TRAFFIC_CULL_MARGIN} is under the ${(drifted / edge).toFixed(3)} the gate allows`,
  );
});

test('widenFov widens the tangent, not the angle, and refuses to invert', () => {
  const fov = Math.PI / 3;
  assert.equal(widenFov(fov, 1), fov, 'a margin of 1 changes nothing');
  assert.equal(widenFov(fov, 0.5), fov, 'a margin below 1 must never NARROW the view');
  assert.equal(widenFov(NaN, 1.2), NaN);
  const wide = widenFov(fov, 1.2);
  assert.ok(Math.abs(Math.tan(wide / 2) / Math.tan(fov / 2) - 1.2) < 1e-9);
  // An absurd margin cannot produce a degenerate frustum.
  assert.ok(widenFov(fov, 1e9) < Math.PI);
});

// ─── Pose ──────────────────────────────────────────────────

test('the pose is nine plain numbers — heading/pitch exist only on a real Camera', () => {
  // Reading `camera.heading` off a test double yields NaN, and `NaN >= 4` is
  // false, so the gate would fail CLOSED. A pure rotation does not move
  // positionWC at all, so it would then never re-cull — the exact bug this
  // module exists to fix, reintroduced by the gate meant to bound it.
  const camera = nadirCamera();
  const pose = cameraCullPose(camera);
  assert.deepEqual(Object.keys(pose).sort(), ['dx', 'dy', 'dz', 'px', 'py', 'pz', 'ux', 'uy', 'uz']);
  for (const value of Object.values(pose)) assert.ok(Number.isFinite(value));
  assert.equal(cameraCullPose(null), null);
  assert.equal(cameraCullPose({}), null);
  assert.equal(cameraCullPose({ positionWC: camera.positionWC }), null);
});

test('the pose gate fails OPEN, and catches a pure rotation', () => {
  const pose = cameraCullPose(nadirCamera());
  assert.equal(cullPoseMoved(null, pose), true, 'no previous pose means re-cull');
  assert.equal(cullPoseMoved(pose, null), true);
  assert.equal(cullPoseMoved(pose, { ...pose, dx: NaN }), true, 'a NaN must not freeze the draw set');
  assert.equal(cullPoseMoved(pose, { ...pose }), false, 'an identical pose costs nothing');

  // A rotation in place: the position is untouched, only the axis turns.
  const turn = (deg) => {
    const a = (deg * Math.PI) / 180;
    return { ...pose, dx: pose.dx * Math.cos(a) - pose.dy * Math.sin(a), dy: pose.dx * Math.sin(a) + pose.dy * Math.cos(a) };
  };
  assert.equal(cullPoseMoved(pose, turn(1)), false, 'a 1° twitch is not worth a respawn');
  assert.equal(cullPoseMoved(pose, turn(10)), true, 'a 10° turn is');
});

test('the pose gate catches a translation the axis cannot see', () => {
  const pose = cameraCullPose(nadirCamera());
  assert.equal(cullPoseMoved(pose, { ...pose, px: pose.px + 50 }), false);
  assert.equal(cullPoseMoved(pose, { ...pose, px: pose.px + 500 }), true);
  assert.equal(CULL_POSE_THRESHOLDS.moveM, 120);
});

// ─── Churn ─────────────────────────────────────────────────

test('the delta is identity-based and order-independent', () => {
  const a = road(2.35, 48.85);
  const b = road(2.36, 48.85);
  const c = road(2.37, 48.85);
  const { entered, left } = drawSetDelta([a, b], [c, b]);
  assert.deepEqual(entered, [c]);
  assert.deepEqual(left, [a]);
  assert.deepEqual(drawSetDelta([a, b], [b, a]), { entered: [], left: [] });
  assert.deepEqual(drawSetDelta(null, [a]), { entered: [a], left: [] });
});

test('the churn floor scales with the set, and never below three roads', () => {
  // The threshold used to be an inline expression, which means it had no test
  // at all while `drawSetDelta` had four. At 3.5° of axis in a 60° field the
  // corner that enters is worth ~7 % of the set, so 2 % has to sit well under
  // it — and a handful of roads must not churn on one.
  const set = (n) => Array.from({ length: n }, (_, i) => road(2.35 + i * 0.001, 48.85));
  const floorFor = (n) => shouldRespawnDrawSet([], set(n)).floor;
  assert.equal(floorFor(0), CULL_CHURN_MIN_ROADS);
  assert.equal(floorFor(1), CULL_CHURN_MIN_ROADS);
  assert.equal(floorFor(50), CULL_CHURN_MIN_ROADS, '2 % of 50 is 1 — the floor wins');
  assert.equal(floorFor(149), CULL_CHURN_MIN_ROADS);
  assert.equal(floorFor(150), 3);
  assert.equal(floorFor(1000), 20);
});

test('a respawn happens only when the churn clears the floor', () => {
  const kept = Array.from({ length: 1000 }, (_, i) => road(2.35 + i * 0.001, 48.85));
  const oneMore = [...kept, road(9, 9)];
  assert.equal(shouldRespawnDrawSet(kept, oneMore).respawn, false, '1 road out of 1 000 is noise');
  const manyMore = [...kept, ...Array.from({ length: 30 }, (_, i) => road(9 + i, 9))];
  const verdict = shouldRespawnDrawSet(kept, manyMore);
  assert.equal(verdict.respawn, true);
  assert.equal(verdict.delta, 30);
  assert.equal(verdict.entered.length, 30);
  assert.equal(verdict.left.length, 0);
});

// ─── Frustum ───────────────────────────────────────────────

test('a scene that cannot describe its frustum culls nothing at all', () => {
  // Failing OPEN is load-bearing: a gate that culled when it could not answer
  // would empty the street rather than merely fail to trim it.
  assert.equal(trafficCullingVolume(undefined), null);
  assert.equal(trafficCullingVolume({ frustum: { fov: Math.PI / 3 } }), null);
  assert.equal(trafficCullingVolume({ frustum: new Cesium.PerspectiveFrustum() }), null);
  const roads = [road(2.35, 48.85), road(2.36, 48.85)];
  const { draw, keep, culled } = selectDrawRoads(roads, null);
  assert.deepEqual(draw, roads);
  assert.deepEqual(keep, [true, true]);
  assert.equal(culled, 0);
});

test('the gate keeps what is on screen and drops what is behind the camera', () => {
  const camera = nadirCamera({ lon: 2.35, lat: 48.85, height: 800 });
  const volume = trafficCullingVolume(camera);
  assert.ok(volume);
  const roads = [
    road(2.35, 48.85),   // under the camera
    road(2.3505, 48.85), // just beside it
    road(2.55, 48.85),   // ~15 km east at 800 m up — far outside a 60° cone
    road(-60, -20),      // the other side of the planet
  ];
  const { draw, keep, culled } = selectDrawRoads(roads, volume);
  assert.deepEqual(keep.slice(0, 2), [true, true], 'what is under the camera must stay');
  assert.deepEqual(keep.slice(2), [false, false]);
  assert.equal(draw.length, 2);
  assert.equal(culled, 2);
  assert.equal(draw.length + culled, roads.length, 'the split is a partition');
});

test('the culling volume never mutates the camera frustum it widened', () => {
  // The camera's frustum is shared with the renderer: widening it in place
  // would widen what the globe itself draws.
  const camera = nadirCamera();
  const before = camera.frustum.fov;
  trafficCullingVolume(camera, 1.5);
  assert.equal(camera.frustum.fov, before);
});

test('the margin keeps a road that has just left the edge', () => {
  const camera = nadirCamera({ height: 800 });
  const tight = trafficCullingVolume(camera, 1);
  const generous = trafficCullingVolume(camera, 2.2);
  // A road far enough out that a bare frustum drops it.
  const edge = [road(2.3585, 48.85)];
  const { culled: tightCulled } = selectDrawRoads(edge, tight);
  edge[0].cullSphere = null;
  const { culled: wideCulled } = selectDrawRoads(edge, generous);
  assert.equal(tightCulled, 1, 'precondition: this road is outside the bare cone');
  assert.equal(wideCulled, 0, 'the margin is what stops it flickering out');
});

// ─── Sphere lifecycle ──────────────────────────────────────

test('the bounding sphere is built once, and dies when the road is re-seated', () => {
  const r = road(2.35, 48.85);
  assert.equal(r.cullSphere, undefined);
  const first = roadCullSphere(r);
  assert.ok(first instanceof Cesium.BoundingSphere);
  assert.equal(roadCullSphere(r), first, 'the second call must not rebuild it');

  invalidateRoadCullSphere(r);
  assert.equal(r.cullSphere, null);
  const rebuilt = roadCullSphere(r);
  assert.notEqual(rebuilt, first, 'and the next cull rebuilds it from the new waypoints');
  assert.doesNotThrow(() => invalidateRoadCullSphere(null));
  assert.equal(roadCullSphere({ waypoints: [] }), null, 'a road with no geometry has no sphere');
});

test('a re-seated road answers the gate from its NEW height, not its old one', () => {
  // `applyRoadFloor` moves every waypoint in Z. Measured over Biarritz, roads
  // seat between 56.1 m and 109.4 m — enough for a stale sphere to be a wrong
  // answer at the screen edge.
  const r = road(2.35, 48.85);
  const before = roadCullSphere(r);
  const beforeHeight = Cesium.Cartographic.fromCartesian(before.center).height;
  for (let i = 0; i < r.waypoints.length; i++) {
    Cesium.Cartesian3.fromDegrees(r.coords[i][0], r.coords[i][1], 90, Cesium.Ellipsoid.WGS84, r.waypoints[i]);
  }
  invalidateRoadCullSphere(r);
  const after = Cesium.Cartographic.fromCartesian(roadCullSphere(r).center).height;
  assert.ok(Math.abs(beforeHeight) < 1, `precondition: the road started at ground, got ${beforeHeight}`);
  assert.ok(Math.abs(after - 90) < 1, `the sphere must follow the seating, got ${after}`);
});

test('applyRoadFloor still invalidates the sphere — source tripwire', () => {
  // The riskiest line in this change is one call inside a function that is not
  // exported and that a fake scene exits long before reaching. A source check
  // is not elegant, but a silent removal here shows up as cars missing at the
  // screen edge, which nobody would ever trace back to a bounding sphere.
  const source = readFileSync(new URL('./traffic.js', import.meta.url), 'utf8');
  const start = source.indexOf('function applyRoadFloor(');
  assert.notEqual(start, -1, 'applyRoadFloor must exist');
  const body = source.slice(start, source.indexOf('\n}', start));
  assert.match(body, /invalidateRoadCullSphere\(road\)/);
});
