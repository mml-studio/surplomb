// src/data/trafficRecull.test.mjs
//
// THE WIRING, which is the part no other test reaches. `trafficDrawSet.test.mjs`
// proves the arithmetic; the perf harness parks the camera and never turns it.
// What is left unexercised is exactly where the NEW failure mode lives: a
// camera that rotates in place earns no fetch, so nothing re-renders, and the
// draw set either goes stale (the bug) or respawns wholesale (the cure that is
// worse — every car on screen teleports, on every camera settle).
import assert from 'node:assert/strict';
import test from 'node:test';
import * as Cesium from 'cesium';

import trafficLayer from './traffic.js';

/** Minimal event channel matching Cesium's add/removeEventListener shape. */
function eventChannel() {
  const listeners = new Set();
  const channel = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  channel.addEventListener = channel;
  channel.removeEventListener = (listener) => listeners.delete(listener);
  channel.raise = (...args) => { for (const listener of [...listeners]) listener(...args); };
  return channel;
}

const LON = 2.3522;
const LAT = 48.8566;
const WAY_COUNT = 12;

/** An Overpass payload of `WAY_COUNT` short streets spread over ~0.02°. */
function syntheticRoads() {
  const elements = [];
  for (let i = 0; i < WAY_COUNT; i++) {
    const lon = LON + (i - WAY_COUNT / 2) * 0.0015;
    elements.push({
      type: 'way',
      id: 1000 + i,
      tags: { highway: i % 3 === 0 ? 'primary' : 'residential' },
      geometry: [
        { lon, lat: LAT - 0.0008 },
        { lon, lat: LAT },
        { lon, lat: LAT + 0.0008 },
      ],
    });
  }
  return { elements };
}

/** Orthonormalise a direction against the ellipsoid normal at `eye`. */
function frame(eye, direction) {
  const d = Cesium.Cartesian3.normalize(direction, new Cesium.Cartesian3());
  const right = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.cross(d, Cesium.Cartesian3.UNIT_Z, new Cesium.Cartesian3()),
    new Cesium.Cartesian3(),
  );
  const up = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.cross(right, d, new Cesium.Cartesian3()),
    new Cesium.Cartesian3(),
  );
  return { d, up };
}

test('a camera that turns on the spot re-culls, without a fetch and without teleporting anyone', async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const originalLog = console.log;

  let timerId = 0;
  const timers = new Map();
  let overpassPosts = 0;
  let viewer = null;
  let collection = null;

  /** Run every pending timer whose delay matches, oldest first. */
  const runTimers = async (delay = null) => {
    for (let guard = 0; guard < 500; guard++) {
      const entry = [...timers].find(([, t]) => delay === null || t.delay === delay);
      if (!entry) break;
      timers.delete(entry[0]);
      entry[1].callback();
      for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r));
    }
  };
  const pending = (delay) => [...timers.values()].filter((t) => t.delay === delay);

  try {
    globalThis.fetch = async (url) => {
      const href = String(url);
      if (href.includes('/api/tomtom/status')) {
        return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ hasKey: false }) };
      }
      if (href.includes('/api/overpass')) {
        overpassPosts += 1;
        return {
          ok: true, status: 200, headers: { get: () => null }, json: async () => syntheticRoads(),
        };
      }
      return { ok: false, status: 404, headers: { get: () => null }, json: async () => ({}) };
    };
    globalThis.setTimeout = (callback, delay = 0) => {
      const id = ++timerId;
      timers.set(id, { callback, delay: Number(delay) || 0 });
      return id;
    };
    globalThis.clearTimeout = (id) => timers.delete(id);
    console.log = () => {};

    const eye = Cesium.Cartesian3.fromDegrees(LON, LAT, 800);
    const down = Cesium.Cartesian3.negate(eye, new Cesium.Cartesian3());
    const nadir = frame(eye, down);
    const camera = {
      moveEnd: eventChannel(),
      changed: eventChannel(),
      percentageChanged: 0.5,
      positionWC: eye,
      directionWC: nadir.d,
      upWC: nadir.up,
      positionCartographic: { longitude: LON * Math.PI / 180, latitude: LAT * Math.PI / 180, height: 800 },
      frustum: Object.assign(new Cesium.PerspectiveFrustum(), {
        fov: Math.PI / 3, aspectRatio: 16 / 9, near: 1, far: 50_000_000,
      }),
      pickEllipsoid: () => undefined,
      seesNothing: false,
      computeViewRectangle() {
        if (this.seesNothing) return undefined;
        return {
          south: (LAT - 0.01) * Math.PI / 180,
          west: (LON - 0.01) * Math.PI / 180,
          north: (LAT + 0.01) * Math.PI / 180,
          east: (LON + 0.01) * Math.PI / 180,
        };
      },
    };
    viewer = {
      camera,
      scene: {
        canvas: { clientWidth: 1600, clientHeight: 900, width: 1600, height: 900 },
        preRender: eventChannel(),
        postRender: eventChannel(),
        primitives: {
          add: (p) => {
            // The layer's PointPrimitiveCollection, captured so the test can
            // read the positions back — a respawn is invisible in any counter.
            if (typeof p?.get === 'function' && 'length' in p) collection = p;
            return p;
          },
          remove: () => true,
        },
        groundPrimitives: { add: (p) => p, remove: () => true },
      },
    };

    try { trafficLayer.destroy(viewer); } catch { /* nothing to tear down yet */ }
    trafficLayer.init(viewer);
    trafficLayer.enable(viewer);
    await runTimers(320);
    await runTimers(320);

    const loaded = trafficLayer.getStats();
    assert.ok(loaded.count > 0, `precondition: the layer must have drawn something, got ${loaded.count}`);
    assert.ok(loaded.drawRoads > 0, 'and the cull must have kept the roads under the camera');
    // The gain is visible at NADIR too, which is worth stating: at 800 m a 60°
    // fov reaches ~460 m on the ground (~554 m with the margin), while the
    // fetch box the cache lattice requires is 0.05° — about 1.8 km across. The
    // outermost streets in it were never on screen.
    assert.ok(loaded.culledRoads > 0, 'the fetch box is wider than the screen even looking straight down');
    assert.equal(loaded.drawRoads + loaded.culledRoads, WAY_COUNT, 'the split is a partition of the network');
    const postsAfterLoad = overpassPosts;

    // ─── Turn to look at the opposite horizon ───────────────
    // A real `camera.changed`: Cesium raises it on rotation once the direction
    // has moved more than `fovy/2 * percentageChanged`.
    const away = frame(eye, Cesium.Cartesian3.negate(down, new Cesium.Cartesian3()));
    camera.directionWC = away.d;
    camera.upWC = away.up;
    camera.changed.raise();

    assert.equal(pending(400).length, 1, 'a turn in place must arm exactly one re-cull');
    assert.equal(pending(320).length, 0, 'and must NOT arm a fetch — the box has not moved');
    await runTimers(400);

    const turned = trafficLayer.getStats();
    assert.equal(overpassPosts, postsAfterLoad, 'the re-cull must not cost one request');
    assert.equal(turned.drawRoads, 0, 'nothing is in front of a camera pointed at the sky');
    assert.equal(turned.count, 0, 'so no car is animated');
    assert.equal(turned.culledRoads + turned.drawRoads, loaded.culledRoads + loaded.drawRoads);
    assert.equal(turned.cullRespawns, 1);
    assert.equal(
      turned.cullPasses,
      turned.cullPoseSkips + turned.cullDeltaSkips + turned.cullRespawns,
      'the three outcomes must partition the passes, or no ratio built on them means anything',
    );

    // ─── Turn back ─────────────────────────────────────────
    camera.directionWC = nadir.d;
    camera.upWC = nadir.up;
    camera.changed.raise();
    await runTimers(400);
    const back = trafficLayer.getStats();
    assert.ok(back.count > 0, 'the cars come back when the camera does');
    assert.equal(back.drawRoads, loaded.drawRoads);

    // ─── THE REGRESSION THIS DESIGN EXISTS FOR ─────────────
    // `spawnDotsForRoad` draws a random segment and a random offset for every
    // car it makes. Re-spawning the whole draw set on each settle would
    // TELEPORT every vehicle on screen and reshuffle the jam platoons — on
    // every camera settle, forever. So the re-cull is differential: it removes
    // the cars of roads that left and spawns only the ones that entered.
    assert.ok(collection, 'the point collection must have been captured');
    const positionsOf = () => {
      const out = [];
      for (let i = 0; i < collection.length; i++) {
        const p = collection.get(i)?.position;
        if (p) out.push(`${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}`);
      }
      return out;
    };
    const beforeTilt = positionsOf();
    const respawnsAtNadir = trafficLayer.getStats().cullRespawns;
    assert.ok(beforeTilt.length > 0, 'precondition: there are cars to keep');

    // Tilt enough to drop some roads but keep the ones under the camera.
    const east = Cesium.Cartesian3.normalize(
      Cesium.Cartesian3.cross(Cesium.Cartesian3.UNIT_Z, eye, new Cesium.Cartesian3()),
      new Cesium.Cartesian3(),
    );
    const tilted = frame(eye, Cesium.Cartesian3.add(
      Cesium.Cartesian3.multiplyByScalar(nadir.d, 0.7, new Cesium.Cartesian3()),
      Cesium.Cartesian3.multiplyByScalar(east, 0.7, new Cesium.Cartesian3()),
      new Cesium.Cartesian3(),
    ));
    camera.directionWC = tilted.d;
    camera.upWC = tilted.up;
    camera.changed.raise();
    await runTimers(400);

    const afterTilt = positionsOf();
    // Without this the check below is vacuous: a tilt the delta gate refused
    // would leave every position untouched for the wrong reason.
    assert.equal(
      trafficLayer.getStats().cullRespawns,
      respawnsAtNadir + 1,
      'precondition: the tilt must have actually changed the draw set',
    );
    assert.notEqual(afterTilt.length, beforeTilt.length, 'precondition: some cars must have gone');
    const kept = new Set(beforeTilt);
    const survivors = afterTilt.filter((p) => kept.has(p)).length;
    assert.ok(afterTilt.length > 0, 'a tilt must not empty the street');
    assert.equal(
      survivors,
      afterTilt.length,
      `${afterTilt.length - survivors} cars teleported — the re-cull must only add and remove, never redraw`,
    );

    // Come back to nadir so the twitch check below starts from a known pose.
    camera.directionWC = nadir.d;
    camera.upWC = nadir.up;
    camera.changed.raise();
    await runTimers(400);

    // ─── A twitch must cost nothing ────────────────────────
    const settled = trafficLayer.getStats();
    const passesBefore = settled.cullPasses;
    const respawnsBefore = settled.cullRespawns;
    camera.changed.raise();
    await runTimers(400);
    const twitched = trafficLayer.getStats();
    assert.equal(twitched.cullPasses, passesBefore + 1);
    assert.equal(twitched.cullRespawns, respawnsBefore, 'an unmoved camera must not respawn');
    assert.equal(twitched.cullPoseSkips, settled.cullPoseSkips + 1);

    // ─── Looking past the limb ─────────────────────────────
    // `computeViewRectangle` returns nothing when the camera sees only sky.
    // There is nothing to FETCH there, but very much something to re-cull:
    // returning early without arming the gate would leave the cars animating
    // behind the camera for as long as the reader keeps looking up.
    camera.seesNothing = true;
    camera.directionWC = away.d;
    camera.upWC = away.up;
    camera.changed.raise();
    assert.equal(pending(400).length, 1, 'a view with no rectangle must still arm a re-cull');
    await runTimers(400);
    assert.equal(trafficLayer.getStats().count, 0, 'and it must actually empty the screen');
  } finally {
    try { trafficLayer.disable(viewer); } catch { /* stub viewer */ }
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
    globalThis.fetch = originalFetch;
    console.log = originalLog;
  }
});
