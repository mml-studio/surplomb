#!/usr/bin/env node
/**
 * Record the landing page's hero loop from the live app.
 *
 *     node scripts/capture-landing-hero.mjs                  # desktop + phone, 2 ion sessions
 *     node scripts/capture-landing-hero.mjs --only phone     # 1 ion session
 *     node scripts/capture-landing-hero.mjs --rehearsal      # OSM globe, 0 ion session
 *     node scripts/capture-landing-hero.mjs --assemble-only  # rebuild the loops from saved frames, 0 session
 *     node scripts/capture-landing-hero.mjs --quality hq     # Retina-grade loops, see HQ below
 *
 * WHY A RECORDING AND NOT THE LIVE GLOBE. Every boot of the photoreal globe is
 * one billed Cesium ion session, and a landing page is the one surface whose
 * visitors mostly never click through. So the hero is a video of the real app
 * — real Google mesh, real vehicles, real detection frames — and the live
 * globe is only bought when a visitor asks for it. The data in the video goes
 * stale; that was accepted (2026-09-17) as long as it still reads as live.
 *
 * WHY THE CAMERA ORBITS. A still aerial frame reads as a photograph. An 8°
 * swing around the point the camera looks at makes the buildings shift
 * against each other, which is the cheapest proof that this is 3D.
 *
 * WHY THE ORBIT LAW IS WRITTEN DOWN. The page swaps the frozen video frame for
 * the live globe when a visitor clicks, and that swap is only seamless if the
 * page can put the live camera exactly where the video was at that instant.
 * `hero-capture.json` therefore carries the pose at t = 0, the orbit centre,
 * and the law, and every video frame is placed on the timeline by the orbit
 * phase that was RENDERED into it — not by when the screencast delivered it.
 *
 * WHY ONE CYCLE OF PRE-ROLL. The orbit runs one full period before the
 * recorded one. The camera path is identical in both, so the first period
 * streams every tile the second one will look at, and the recorded period is
 * steady. It also gives the seam its material: the last 0.6 s of the loop is
 * cross-faded into the 0.6 s that PRECEDE t = 0, which show the same camera
 * pose (the law is periodic) with the vehicles where they were — so the loop
 * restarts on the frame it cross-faded into.
 *
 * BUDGET. One fresh browser per device, and each boot with the photoreal
 * globe costs one ion session: 2 for a full run. No loop, no retry; a failed
 * run says why and stops. `--assemble-only` rebuilds from disk for free.
 *
 * HQ (`--quality hq`, 2026-09-17). The standard loop, 1600 px at 1.4 Mbit/s,
 * is enlarged ×1.9 and visibly blocky on a Retina laptop. HQ captures at the
 * size the page is actually drawn: 1440×900 CSS at DPR 2 (2880×1800) and
 * 390×844 at DPR 3 (1170×2532), lossless PNG frames, a finer mesh (tile error
 * 8 instead of 16) and MSAA. No machine renders and screencasts that in real
 * time at 30 frames a second, so HQ records in SLOW MOTION: the page's clock
 * (performance.now, Date, timers, rAF timestamps) is slowed k times for the
 * recorded period, Cesium is capped at 30 frames of PAGE time, and each frame
 * is placed on the timeline by the orbit phase that was rendered into it. The
 * vehicles, the detection animation and the orbit all run on that clock, so
 * the result plays back at 30 regular frames a second whatever the real
 * frame rate was. A 5 s real-time trial runs first and picks k.
 *
 * PITFALLS THIS SCRIPT IS SHAPED AROUND (see the QA memory notes):
 *   - `page.click()` and a parked-scene `page.screenshot()` hang: nothing here
 *     clicks, and frames come from `Page.startScreencast`, which only needs
 *     the page to keep producing frames — the traffic layer holds the render
 *     governor in continuous mode.
 *   - `waitForFunction` needs numeric polling: `newQaPage` provides it.
 *   - `tilesLoaded` can flicker true between two batches: it must hold for
 *     3 s before it counts.
 *   - a promise resolved inside rAF within `page.evaluate` never returns: the
 *     orbit runs on its own rAF loop and Node polls a flag.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import puppeteer from 'puppeteer';
import { newPhoneQaPage, newQaPage, phoneUrl } from './lib/qa-first-run.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/** The hero view, exactly as the share link spells it. */
export const HERO_VIEW = Object.freeze({ lat: 48.83, lon: 2.265, alt: 600, heading: 350, pitch: -60, roll: 0 });

/**
 * `dm=DENSE&dd=75` is the detection look (VEH-xxxx frames); `l=t.8` is traffic
 * plus road events; `sc=0` removes the scope vignette so the colours stay
 * natural. `v=2` is what makes `l=` authoritative at all.
 */
const HERO_HASH = 'v=2&lat=48.8300&lon=2.2650&alt=600&heading=350&pitch=-60&roll=0'
  + '&map=photoreal&dm=DENSE&dd=75&l=t.8&sc=0';
const EXPECTED_LAYERS = ['road-events-fr', 'traffic'];

/** Colour description written on every video this pipeline produces. */
export const COLOUR_TAGS = Object.freeze(['-color_range', 'tv', '-colorspace', 'bt709',
  '-color_primaries', 'bt709', '-color_trc', 'iec61966-2-1']);

/** The same contract as frame properties — encoders read these over their options. */
export const COLOUR_PARAMS = 'setparams=range=tv:colorspace=bt709:color_primaries=bt709:color_trc=iec61966-2-1';

export const ORBIT = Object.freeze({ periodS: 18, amplitudeDeg: 8, crossfadeS: 0.6, outputFps: 30 });

/** Pose tolerances the capture must meet before it records anything. */
const POSE_TOLERANCE = Object.freeze({ deg: 0.0005, heightM: 2, angleDeg: 0.5 });

/**
 * Desktop sizes, best first. 1920×1080 only if the screencast keeps up; both
 * are 16:9, so the horizontal field of view — and the framing — is identical.
 */
const DESKTOP_SIZES = Object.freeze([
  { cssWidth: 1920, cssHeight: 1080 },
  { cssWidth: 1600, cssHeight: 900 },
]);
const DESKTOP_MIN_FPS = 24;
const PHONE_SIZE = Object.freeze({ cssWidth: 390, cssHeight: 844, dpr: 2 });

/**
 * The HQ capture. 16:10 on the desktop rather than 16:9: a laptop viewport
 * crops less of it. DPR 2 rather than 2880 CSS pixels: the VEH labels keep
 * the size they have in the app on a Retina screen, and come out sharp.
 */
const HQ = Object.freeze({
  out: '.context/landing-assets/hq/raw',
  desktop: { cssWidth: 1440, cssHeight: 900, dpr: 2, window: '1600,1000' },
  phone: { cssWidth: 390, cssHeight: 844, dpr: 3, window: '600,1000' },
  // Finer than the desktop's 16. Measured drain at 8: see the capture report.
  tileSse: 8,
  // The default 1.5 GB evicts tiles mid-orbit at this error; eviction is a
  // tile reloading, and a reloading tile is a flicker in the loop.
  cacheBytes: 3 * 1024 ** 3,
  cacheOverflowBytes: 1024 ** 3,
  format: 'png',
  // Page frames per second while slowed down: one render per output frame.
  slowTargetFps: 30,
  trialS: 5,
  // A real-time recording is only kept if the trial meets all three.
  realtime: { minFps: 30, maxP90Ms: 45, maxGapMs: 100 },
});

/**
 * Everything but the globe goes. `visibility` rather than `display` so no
 * panel collapses and nothing downstream re-lays itself out around the change
 * — and applied to descendants too, because a child that sets
 * `visibility: visible` would otherwise punch through a hidden parent.
 * `#world-overlay-root` stays: it carries the VEH-xxxx callouts. The detection
 * frames themselves live on `#world-overlay-detection-surface`, inside the
 * Cesium container. The Google/ion credit line is hidden here because the
 * landing page has to print the attribution itself, over the video.
 */
const MASK_CSS = `
body > :not(#cesiumContainer):not(#world-overlay-root),
body > :not(#cesiumContainer):not(#world-overlay-root) * { visibility: hidden !important; }
#cesiumContainer .cesium-viewer-bottom,
#cesiumContainer .cesium-viewer-toolbar,
#cesiumContainer .cesium-credit-lightbox-overlay,
#scope-mask,
#celestial-ring-overlay { display: none !important; }
html, body { background: #000 !important; }
`;

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
const log = (...args) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...args);

function parseCli(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      origin: { type: 'string', default: 'https://surplomb.app' },
      only: { type: 'string' },
      out: { type: 'string' },
      size: { type: 'string', default: 'auto' },
      rehearsal: { type: 'boolean', default: false },
      'assemble-only': { type: 'boolean', default: false },
      settle: { type: 'string', default: '12' },
      quality: { type: 'string', default: 'standard' },
      format: { type: 'string' },
      slow: { type: 'string', default: 'auto' },
    },
  });
  const hq = values.quality === 'hq';
  if (!hq && values.quality !== 'standard') throw new Error('--quality must be standard or hq');
  const rehearsal = values.rehearsal;
  const out = path.resolve(ROOT, values.out
    || (rehearsal ? `.context/landing-assets/rehearsal${hq ? '-hq' : ''}` : (hq ? HQ.out : '.context/landing-assets/raw')));
  const devices = values.only ? [values.only] : ['desktop', 'phone'];
  for (const device of devices) {
    if (device !== 'desktop' && device !== 'phone') throw new Error(`--only: unknown device "${device}"`);
  }
  let size = null;
  if (values.size !== 'auto') {
    const match = /^(\d+)x(\d+)$/.exec(values.size);
    if (!match) throw new Error('--size must be auto or WIDTHxHEIGHT');
    size = { cssWidth: Number(match[1]), cssHeight: Number(match[2]) };
  }
  return {
    origin: values.origin.replace(/\/+$/, ''),
    devices,
    out,
    size,
    rehearsal,
    assembleOnly: values['assemble-only'],
    settleMs: Number(values.settle) * 1000,
    hq,
    format: values.format || (hq ? HQ.format : 'jpeg'),
    slow: values.slow === 'auto' ? null : Number(values.slow),
  };
}

// ── In-page code ────────────────────────────────────────────────────────────
// Runs in the app page. `window.Cesium` does not exist (Cesium is bundled), so
// the vector math is written out by hand and Cesium types are reached through
// the instances the viewer already holds.

/* eslint-disable no-undef */

/**
 * A slowable page clock, installed before any app script runs.
 *
 * Page time = v0 + (real - r0) / k. `performance.now`, `Date` (now and the
 * no-argument constructor), the rAF timestamp and timer delays all follow it,
 * because those are the clocks the vehicles (`Date.now`), the detection
 * overlay (`performance.now`) and Cesium's frame cap (the rAF timestamp) read.
 * Intervals are re-armed on every rate change, so a 60 s refresh stays 60 s of
 * page time. Workers keep real time; nothing they do is animated.
 *
 * FRAME PACING. Slowed down, the page would still run its rAF callbacks at
 * the screen's 60 Hz: the overlays repaint on every one of them, and the
 * screencast spent its PNG encodes on those overlay-only frames while real
 * renders went uncaptured (50 of 509 missed at ×6, measured 2026-09-17). With
 * `pacingMs`, all rAF callbacks run together once per `pacingMs` of page time,
 * stamped exactly on that grid — one composited frame per output frame.
 */
export function pageInstallClock() {
  const perf = window.performance;
  const realPerfNow = perf.now.bind(perf);
  const RealDate = window.Date;
  const realDateNow = RealDate.now.bind(RealDate);
  const realRaf = window.requestAnimationFrame.bind(window);
  const realSetTimeout = window.setTimeout.bind(window);
  const realSetInterval = window.setInterval.bind(window);
  const realClearInterval = window.clearInterval.bind(window);
  const epochOffset = realDateNow() - realPerfNow();
  let k = 1;
  let r0 = realPerfNow();
  let v0 = r0;
  const toVirtual = (real) => v0 + (real - r0) / k;
  const vperf = () => toVirtual(realPerfNow());
  const vdate = () => vperf() + epochOffset;
  Object.defineProperty(perf, 'now', { value: vperf, configurable: true, writable: true });
  function VDate(...args) {
    if (!new.target) return new RealDate(vdate()).toString();
    return args.length ? new RealDate(...args) : new RealDate(vdate());
  }
  VDate.prototype = RealDate.prototype;
  VDate.now = vdate;
  VDate.parse = RealDate.parse;
  VDate.UTC = RealDate.UTC;
  window.Date = VDate;
  let pacingMs = 0;
  let lastStamp = null;
  let scheduled = false;
  let nextFrameId = 1;
  const queue = new Map();
  const flush = (real) => {
    scheduled = false;
    let stamp = toVirtual(real);
    if (pacingMs > 0 && lastStamp !== null) {
      if (stamp - lastStamp < pacingMs) {
        scheduled = true;
        realRaf(flush);
        return;
      }
      stamp = lastStamp + pacingMs * Math.floor((stamp - lastStamp) / pacingMs);
    }
    lastStamp = stamp;
    const callbacks = [...queue.values()];
    queue.clear();
    for (const callback of callbacks) {
      try { callback(stamp); } catch (error) { realSetTimeout(() => { throw error; }, 0); }
    }
  };
  window.requestAnimationFrame = (callback) => {
    const id = nextFrameId++;
    queue.set(id, callback);
    if (!scheduled) {
      scheduled = true;
      realRaf(flush);
    }
    return id;
  };
  window.cancelAnimationFrame = (id) => { queue.delete(id); };
  window.setTimeout = (fn, delay = 0, ...args) => realSetTimeout(fn, Number(delay || 0) * k, ...args);
  const intervals = new Map();
  let nextInterval = 1;
  const arm = (entry) => { entry.realId = realSetInterval(entry.fn, entry.delay * k, ...entry.args); };
  window.setInterval = (fn, delay = 0, ...args) => {
    const id = nextInterval++;
    const entry = { fn, delay: Number(delay || 0), args, realId: null };
    arm(entry);
    intervals.set(id, entry);
    return id;
  };
  window.clearInterval = (id) => {
    const entry = intervals.get(id);
    if (!entry) return;
    realClearInterval(entry.realId);
    intervals.delete(id);
  };
  window.__landingClock = {
    get rate() { return k; },
    setRate(rate, { pacing = 0 } = {}) {
      const real = realPerfNow();
      v0 = toVirtual(real);
      r0 = real;
      k = rate;
      pacingMs = pacing;
      for (const entry of intervals.values()) {
        realClearInterval(entry.realId);
        arm(entry);
      }
    },
    realEpochNow: () => realPerfNow() + epochOffset,
  };
}

export function pageReadState(expectedLayers) {
  const g = window.__godsEyeView;
  const viewer = g.viewer;
  const camera = viewer.scene.camera;
  const deg = (r) => r * 180 / Math.PI;
  const signed = (d) => (d > 180 ? d - 360 : d);
  const carto = camera.positionCartographic;
  const enabled = [...g.dataManager.layers].filter(([, layer]) => layer?.enabled).map(([id]) => id).sort();
  let traffic = null;
  try { traffic = g.dataManager.layers.get('traffic')?.module?.getStats?.() ?? null; } catch { traffic = null; }
  const inkOf = (id) => {
    const canvas = document.getElementById(id);
    if (!canvas || !canvas.width) return null;
    let ctx = null;
    try { ctx = canvas.getContext('2d', { willReadFrequently: true }); } catch { ctx = null; }
    if (!ctx) return { width: canvas.width, height: canvas.height, ink: null };
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let ink = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 8) ink++;
    return { width: canvas.width, height: canvas.height, ink };
  };
  const tileset = g.tileset;
  return {
    camera: {
      lat: deg(carto.latitude),
      lon: deg(carto.longitude),
      height: carto.height,
      headingDeg: deg(camera.heading),
      pitchDeg: deg(camera.pitch),
      rollDeg: signed(deg(camera.roll)),
    },
    fovRad: camera.frustum.fov,
    fovyRad: camera.frustum.fovy,
    aspect: camera.frustum.aspectRatio,
    cssWidth: viewer.canvas.clientWidth,
    cssHeight: viewer.canvas.clientHeight,
    bufferWidth: viewer.canvas.width,
    bufferHeight: viewer.canvas.height,
    dpr: window.devicePixelRatio,
    resolutionScale: viewer.resolutionScale,
    useBrowserRecommendedResolution: viewer.useBrowserRecommendedResolution,
    activeStack: g.mapStackController.getActiveId(),
    tilesetSource: g.tilesetSource ?? null,
    tilesetSse: tileset?.maximumScreenSpaceError ?? null,
    tilesLoaded: tileset ? !!tileset.tilesLoaded : !!viewer.scene.globe.tilesLoaded,
    photorealReady: !!tileset,
    enabledLayers: enabled,
    layersMatch: JSON.stringify(enabled) === JSON.stringify(expectedLayers),
    traffic: traffic && {
      count: traffic.count, loading: traffic.loading,
      floorArmed: traffic.floorArmed, floorSeated: traffic.floorSeated, floorWaiting: traffic.floorWaiting,
    },
    detectionSurface: inkOf('world-overlay-detection-surface'),
    calloutCanvas: inkOf('world-overlay-canvas'),
    postProcessEnabled: (() => {
      const stages = viewer.scene.postProcessStages;
      const on = [];
      for (let i = 0; i < stages.length; i++) if (stages.get(i).enabled) on.push(stages.get(i).name);
      if (stages.fxaa?.enabled) on.push('fxaa');
      if (stages.bloom?.enabled) on.push('bloom');
      if (stages.ambientOcclusion?.enabled) on.push('ambientOcclusion');
      return on;
    })(),
    scopeMaskShown: (() => {
      const node = document.getElementById('scope-mask');
      return !!node && getComputedStyle(node).display !== 'none';
    })(),
    perf: g.getPerfProfileDiagnostics?.()?.profile ?? null,
    msaaSamples: viewer.scene.msaaSamples,
    tilesetCacheBytes: tileset?.cacheBytes ?? null,
    governor: g.getRenderGovernorDiagnostics?.()?.mode ?? null,
  };
}

/**
 * Installs `window.__landingHero`: the orbit centre, the rotation law, a
 * render log and the rAF loop. Returns the law's constants.
 */
export function pageInstallOrbit(orbit) {
  const g = window.__godsEyeView;
  const viewer = g.viewer;
  const scene = viewer.scene;
  const camera = scene.camera;
  const ellipsoid = scene.globe.ellipsoid;
  const C3 = camera.positionWC.constructor;
  const deg = (r) => r * 180 / Math.PI;
  const rad = (d) => d * Math.PI / 180;
  const v = (c) => [c.x, c.y, c.z];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => Math.hypot(a[0], a[1], a[2]);
  const unit = (a) => scale(a, 1 / norm(a));
  // Rodrigues, right-hand rule about a unit axis.
  const rotate = (p, axis, angle) => {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return add(add(scale(p, c), scale(cross(axis, p), s)), scale(axis, dot(axis, p) * (1 - c)));
  };
  const angleDeg = (a, b) => deg(Math.acos(Math.max(-1, Math.min(1, dot(unit(a), unit(b))))));

  // The pivot is the surface under the screen centre. A small cross of picks
  // rather than one: a vehicle point or a label under the exact centre pixel
  // would otherwise hand back its own depth.
  scene.render();
  const w = viewer.canvas.clientWidth;
  const h = viewer.canvas.clientHeight;
  const picks = [];
  for (const [dx, dy] of [[0, 0], [-6, 0], [6, 0], [0, -6], [0, 6]]) {
    try {
      const hit = scene.pickPosition({ x: w / 2 + dx, y: h / 2 + dy });
      if (hit) picks.push(v(hit));
    } catch { /* depth picking unsupported: fall through */ }
  }
  const pos0 = v(camera.positionWC);
  const dir0 = v(camera.directionWC);
  const up0 = v(camera.upWC);
  let center;
  let centerSource;
  if (picks.length) {
    // Median along the view ray: the distance is what an outlier corrupts.
    const ranges = picks.map((p) => dot(sub(p, pos0), dir0)).sort((a, b) => a - b);
    const along = ranges[Math.floor(ranges.length / 2)];
    center = add(pos0, scale(dir0, along));
    centerSource = `pickPosition median of ${picks.length}`;
  } else {
    const hit = camera.pickEllipsoid({ x: w / 2, y: h / 2 });
    center = v(hit);
    centerSource = 'pickEllipsoid (depth picking unavailable)';
  }
  const centerC3 = new C3(center[0], center[1], center[2]);
  const centerCarto = ellipsoid.cartesianToCartographic(centerC3);
  const axis = v(ellipsoid.geodeticSurfaceNormal(centerC3));
  const east = unit([-axis[1], axis[0], 0]);
  const north = cross(axis, east);
  const offset = sub(pos0, center);
  const range = norm(offset);
  const toCenter = scale(offset, -1 / range);
  const lookAtHeading = Math.atan2(dot(toCenter, east), dot(toCenter, north));
  const lookAtPitch = Math.asin(dot(toCenter, axis));

  const law = (s) => orbit.amplitudeDeg * (1 - Math.cos(2 * Math.PI * s / orbit.periodS)) / 2;
  const poseAt = (offsetDeg) => {
    const angle = -rad(offsetDeg);
    return {
      position: add(center, rotate(offset, axis, angle)),
      direction: rotate(dir0, axis, angle),
      up: rotate(up0, axis, angle),
    };
  };
  const apply = (offsetDeg) => {
    const pose = poseAt(offsetDeg);
    camera.setView({
      destination: new C3(...pose.position),
      orientation: { direction: new C3(...pose.direction), up: new C3(...pose.up) },
    });
  };

  // Prove the law against Cesium's own orbit primitive, so the page can use
  // either: `lookAt(center, HeadingPitchRange)` must land on the same pose.
  const identity = camera.transform.clone();
  const lookAtCheck = [];
  for (const offsetDeg of [0, orbit.amplitudeDeg / 2, orbit.amplitudeDeg]) {
    camera.lookAt(centerC3, { heading: lookAtHeading + rad(offsetDeg), pitch: lookAtPitch, range });
    const got = { position: v(camera.positionWC), direction: v(camera.directionWC), up: v(camera.upWC) };
    camera.lookAtTransform(identity);
    // What a page reading the manifest would see on its own camera readout.
    const carto = camera.positionCartographic;
    const want = poseAt(offsetDeg);
    lookAtCheck.push({
      offsetDeg,
      positionM: norm(sub(got.position, want.position)),
      directionDeg: angleDeg(got.direction, want.direction),
      upDeg: angleDeg(got.up, want.up),
      cameraReadout: {
        lat: deg(carto.latitude),
        lon: deg(carto.longitude),
        height: carto.height,
        headingDeg: deg(camera.heading),
        pitchDeg: deg(camera.pitch),
        rollDeg: (deg(camera.roll) + 180) % 360 - 180,
      },
    });
  }
  apply(orbit.amplitudeDeg);
  const headingAtAmplitude = deg(camera.heading);
  apply(0);

  const clock = window.__landingClock || null;
  // Real wall-clock time: the screencast stamps frames with it, whatever the
  // page clock is doing.
  const realEpoch = () => (clock ? clock.realEpochNow() : performance.timeOrigin + performance.now());
  const state = {
    running: false,
    done: false,
    lastS: null,
    renders: [],
    ticks: 0,
    slow: 1,
    switchRealEpochMs: null,
  };
  // [real epoch ms, phase rendered, tiles settled] per rendered frame.
  const removeLog = scene.postRender.addEventListener(() => {
    if (state.running) {
      const tileset = g.tileset;
      state.renders.push([realEpoch(), state.lastS, tileset ? (tileset.tilesLoaded ? 1 : 0) : 1]);
    }
  });
  const restoreClock = () => {
    if (clock && clock.rate !== 1) clock.setRate(1);
  };
  /**
   * Run the law from phase `sFrom` to `sTo`. With `slow > 1`, the page clock
   * is slowed from phase `switchAtS` on and frames are paced at `targetFps`
   * per second of page time.
   *
   * `speed > 1` is a time-lapse: the phase — the loop's own clock — advances
   * `speed` times slower than the page's, and one frame is paced per
   * `speed / targetFps` s of page time, so every output frame still carries
   * one rendered phase (the gallery's buses, scripts/capture-landing-gallery.mjs).
   */
  state.start = (sFrom, sTo, { slow = 1, switchAtS = sFrom, targetFps = 30, speed = 1 } = {}) => {
    state.running = true;
    state.done = false;
    state.renders = [];
    state.ticks = 0;
    state.slow = 1;
    state.switchRealEpochMs = null;
    let t0 = null;
    const tick = (now) => {
      if (!state.running) return;
      if (t0 === null) t0 = now;
      const s = sFrom + (now - t0) / 1000 / speed;
      if (s > sTo) {
        state.running = false;
        state.done = true;
        restoreClock();
        return;
      }
      if (slow > 1 && state.slow === 1 && s >= switchAtS && clock) {
        // Cesium's own 60 fps cap stays: the paced grid is coarser, so every
        // paced frame renders.
        clock.setRate(slow, { pacing: (1000 * speed) / targetFps });
        state.slow = slow;
        state.switchRealEpochMs = realEpoch();
      }
      apply(law(s));
      state.lastS = s;
      state.ticks++;
      scene.requestRender();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  state.stop = () => {
    state.running = false;
    restoreClock();
    apply(0);
    scene.requestRender();
  };
  state.dispose = () => removeLog();
  window.__landingHero = state;

  return {
    centerSource,
    center: { lat: deg(centerCarto.latitude), lon: deg(centerCarto.longitude), height: centerCarto.height, ecef: center },
    axis,
    rangeM: range,
    lookAt: { headingRad: lookAtHeading, pitchRad: lookAtPitch, rangeM: range },
    lookAtCheck,
    initialWorld: { position: pos0, direction: dir0, up: up0 },
    headingAtAmplitudeDeg: headingAtAmplitude,
    pickSpreadM: picks.length ? Math.max(...picks.map((p) => norm(sub(p, center)))) : null,
  };
}
/* eslint-enable no-undef */

// ── Node side ──────────────────────────────────────────────────────────────

function poseError(camera) {
  return {
    lat: Math.abs(camera.lat - HERO_VIEW.lat),
    lon: Math.abs(camera.lon - HERO_VIEW.lon),
    height: Math.abs(camera.height - HERO_VIEW.alt),
    heading: Math.abs(((camera.headingDeg - HERO_VIEW.heading + 540) % 360) - 180),
    pitch: Math.abs(camera.pitchDeg - HERO_VIEW.pitch),
    roll: Math.abs(camera.rollDeg - HERO_VIEW.roll),
  };
}

function poseOk(camera) {
  const e = poseError(camera);
  return e.lat <= POSE_TOLERANCE.deg && e.lon <= POSE_TOLERANCE.deg && e.height <= POSE_TOLERANCE.heightM
    && e.heading <= POSE_TOLERANCE.angleDeg && e.pitch <= POSE_TOLERANCE.angleDeg && e.roll <= POSE_TOLERANCE.angleDeg;
}

export async function readState(page, expectedLayers = EXPECTED_LAYERS) {
  return page.evaluate(pageReadState, expectedLayers);
}

/** Poll until `predicate(state)` holds for `holdMs`, or throw after `timeoutMs`. */
export async function waitForState(page, label, predicate, {
  holdMs = 0, timeoutMs = 120_000, everyMs = 250, expectedLayers = EXPECTED_LAYERS,
} = {}) {
  const started = Date.now();
  let since = null;
  let state = null;
  while (Date.now() - started < timeoutMs) {
    state = await readState(page, expectedLayers);
    if (predicate(state)) {
      since ??= Date.now();
      if (Date.now() - since >= holdMs) return state;
    } else {
      since = null;
    }
    await sleep(everyMs);
  }
  throw new Error(`timed out waiting for ${label}: ${JSON.stringify(state)}`);
}

/**
 * Screencast into a directory. Each frame is acknowledged before it is
 * written — an unacknowledged frame throttles the next one, and the disk
 * write is the slow half.
 */
export async function startScreencast(page, { dir, maxWidth, maxHeight, format = 'jpeg' }) {
  const client = await page.createCDPSession();
  const frames = [];
  const writes = [];
  let index = 0;
  let recording = true;
  if (dir) mkdirSync(dir, { recursive: true });
  client.on('Page.screencastFrame', (event) => {
    client.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(() => {});
    if (!recording) return;
    const file = dir ? `f${String(index).padStart(5, '0')}.${format === 'png' ? 'png' : 'jpg'}` : null;
    index++;
    frames.push({ file, ts: event.metadata.timestamp, deviceWidth: event.metadata.deviceWidth, recvMs: Date.now() });
    if (file) writes.push(writeFile(path.join(dir, file), Buffer.from(event.data, 'base64')));
  });
  await client.send('Page.startScreencast', {
    format: format === 'png' ? 'png' : 'jpeg',
    ...(format === 'png' ? {} : { quality: format === 'jpeg100' ? 100 : 90 }),
    maxWidth,
    maxHeight,
    everyNthFrame: 1,
  });
  return {
    frames,
    async stop() {
      recording = false;
      await client.send('Page.stopScreencast').catch(() => {});
      await Promise.all(writes);
      await client.detach().catch(() => {});
      return frames;
    },
  };
}

export function frameStats(timestampsS) {
  if (timestampsS.length < 2) return { frames: timestampsS.length, fps: 0 };
  const gaps = [];
  for (let i = 1; i < timestampsS.length; i++) gaps.push((timestampsS[i] - timestampsS[i - 1]) * 1000);
  const sorted = [...gaps].sort((a, b) => a - b);
  const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  const spanS = timestampsS.at(-1) - timestampsS[0];
  return {
    frames: timestampsS.length,
    spanS: Number(spanS.toFixed(3)),
    fps: Number(((timestampsS.length - 1) / spanS).toFixed(2)),
    gapMs: { p10: Number(q(0.1).toFixed(1)), p50: Number(q(0.5).toFixed(1)), p90: Number(q(0.9).toFixed(1)), max: Number(sorted.at(-1).toFixed(1)) },
    gapsOver100ms: gaps.filter((g) => g > 100).length,
  };
}

export async function runOrbit(page, sFrom, sTo, orbitOptions = {}) {
  await page.evaluate((a, b, o) => window.__landingHero.start(a, b, o), sFrom, sTo, orbitOptions);
  // Polled from Node, one short call at a time: a `waitForFunction` is ONE
  // protocol call, and a slow-motion run longer than `protocolTimeout` (10 min
  // on a loaded machine) failed with a bare "Waiting failed" (2026-09-19).
  const timeoutMs = orbitOptions.timeoutMs
    ?? (sTo - sFrom) * 1000 * (orbitOptions.slow || 1) * (orbitOptions.speed || 1) + 120_000;
  const started = Date.now();
  while (!(await page.evaluate(() => window.__landingHero.done))) {
    if (Date.now() - started > timeoutMs) throw new Error(`orbit ${sFrom}→${sTo} s not done after ${Math.round(timeoutMs / 1000)} s`);
    await sleep(500);
  }
}

function ffmpeg(args) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`ffmpeg failed: ${result.stderr}`);
}

/**
 * Place every frame on the orbit timeline.
 *
 * A frame shows a render that happened a little before its swap timestamp.
 * Matching each frame to "the last render before it" is right on average but
 * noisy frame to frame — with renders and swaps both near 60 Hz, two
 * neighbours often match the same render while the next render goes
 * unclaimed, and dropping those "duplicates" threw away a third of real
 * frames (measured 2026-09-17). So the match is used only to estimate ONE
 * constant: the offset between swap time and orbit phase. Every frame is then
 * placed at `swap time - offset`, which keeps the screencast's own regular
 * cadence and is off by at most the swap jitter (±10 ms, 0.015° of heading at
 * the orbit's fastest).
 */
function phaseFrames(frames, renders, { slow = 1, switchRealEpochMs = null } = {}) {
  if (slow > 1) return phaseFramesSlow(frames, renders, switchRealEpochMs);
  const offsets = [];
  let r = 0;
  for (const frame of frames) {
    const swapMs = frame.ts * 1000;
    while (r + 1 < renders.length && renders[r + 1][0] <= swapMs) r++;
    if (!renders.length || renders[r][0] > swapMs || renders[r][1] === null) continue;
    offsets.push(frame.ts - renders[r][1]);
  }
  if (!offsets.length) throw new Error('no frame could be matched to a rendered orbit phase');
  const sorted = [...offsets].sort((a, b) => a - b);
  const offset = sorted[Math.floor(sorted.length / 2)];
  const placed = [];
  for (const frame of frames) {
    if (!frame.file) continue;
    const s = frame.ts - offset;
    // Two deliveries with one timestamp are one frame: keep the later copy.
    if (placed.length && s <= placed.at(-1).s) placed[placed.length - 1] = { ...frame, s: placed.at(-1).s };
    else placed.push({ ...frame, s });
  }
  const q = (p) => Number(((sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] - offset) * 1000).toFixed(1));
  return { frames: placed, matchSpreadMs: { p10: q(0.1), p90: q(0.9) }, matched: offsets.length };
}

/**
 * Slow-motion placement. Renders are 1/(30·k) s of real time apart — far
 * more than the swap jitter — so each frame belongs unambiguously to the last
 * render before it, and takes that render's EXACT phase. Only the first frame
 * of each render is kept: later deliveries of the same render are the
 * compositor repainting an overlay, not new content.
 */
function phaseFramesSlow(frames, renders, switchRealEpochMs) {
  const placed = [];
  const lags = [];
  let r = 0;
  let lastRender = -1;
  for (const frame of frames) {
    const swapMs = frame.ts * 1000;
    if (!frame.file || swapMs < switchRealEpochMs) continue;
    while (r + 1 < renders.length && renders[r + 1][0] <= swapMs) r++;
    const render = renders[r];
    if (!render || render[0] > swapMs || render[1] === null || render[0] < switchRealEpochMs) continue;
    if (r === lastRender) continue;
    lastRender = r;
    lags.push(swapMs - render[0]);
    placed.push({ ...frame, s: render[1], tilesSettled: render[2] ?? 1 });
  }
  if (!placed.length) throw new Error('no slow-motion frame could be matched to a render');
  // Renders the screencast never delivered: each one is a repeated frame.
  const rendered = renders.filter((x) => x[0] >= switchRealEpochMs && x[1] !== null).length;
  const sorted = [...lags].sort((a, b) => a - b);
  return {
    frames: placed,
    matchSpreadMs: { p10: sorted[Math.floor(sorted.length * 0.1)], p90: sorted[Math.floor(sorted.length * 0.9)] },
    matched: placed.length,
    rendersMissed: rendered - placed.length,
  };
}

/** Frame cadence on the PAGE clock: what playback will show. */
function phaseStats(frames) {
  const s = frames.map((f) => f.s);
  const stats = frameStats(s);
  return { ...stats, tilesUnsettled: frames.filter((f) => f.tilesSettled === 0).length };
}

/**
 * Build the seamless loop: R[0, T] with its last `crossfadeS` blended into
 * R[-crossfadeS, 0]. Output is constant 30 fps, exactly `periodS` long.
 */
export function assembleLoop({ name, out, orbit }) {
  const framesDir = path.join(out, `${name}-frames`);
  const meta = JSON.parse(readFileSync(path.join(out, `${name}-frames.json`), 'utf8'));
  const phased = phaseFrames(meta.frames, meta.renders, meta);
  const lossless = meta.master === 'lossless';
  // In slow motion every render is one output frame, one 1/fps step of phase
  // apart — but the grid starts wherever the first tick fell. Half a frame
  // off, each output instant sits midway between two renders, and `fps`
  // settled every third tie on the same one: a repeated frame in three on
  // the orbits (measured on the gallery rehearsal, 2026-09-19). Snapping the
  // phases onto the output grid moves the picture by under half a frame
  // (≤ 17 ms of the law: 0.02° of heading at the hero's fastest).
  const frames = meta.slow > 1
    ? phased.frames.map((f) => ({ ...f, s: Math.round(f.s * orbit.outputFps) / orbit.outputFps }))
    : phased.frames;
  const pngInput = frames[0].file.endsWith('.png');
  const d = orbit.crossfadeS;
  const T = orbit.periodS;
  const w0 = -d;
  const w1 = T;
  const firstIdx = frames.findLastIndex((f) => f.s <= w0);
  if (firstIdx < 0) throw new Error(`${name}: no frame at or before s=${w0}`);
  const lastIdx = frames.findLastIndex((f) => f.s < w1);
  const inWindow = frames.slice(firstIdx, lastIdx + 1);
  if (frames.at(-1).s < w1) throw new Error(`${name}: recording ends at s=${frames.at(-1).s}, before ${w1}`);
  // Each still is its own image2 input, whose default rate — 25 fps — becomes
  // the time base of the whole concatenation: 30 frames a second rounded onto
  // a 40 ms grid collided five times a second, and `fps=30` refilled the holes
  // with repeats. Every loop assembled before 2026-09-19 carries a repeated
  // frame every sixth (a 25 fps judder; measured on the hero's phone master:
  // 90 of 539). A millisecond time base keeps every frame where its phase is.
  const TIME_BASE = 'option framerate 1000';
  const lines = ['ffconcat version 1.0'];
  inWindow.forEach((frame, i) => {
    const start = Math.max(frame.s, w0);
    const end = i + 1 < inWindow.length ? inWindow[i + 1].s : w1;
    lines.push(`file '${path.join(framesDir, frame.file)}'`, TIME_BASE, `duration ${(end - start).toFixed(6)}`);
  });
  // The concat demuxer ignores the last entry's duration unless it repeats.
  lines.push(`file '${path.join(framesDir, inWindow.at(-1).file)}'`, TIME_BASE);
  const listFile = path.join(out, `${name}-concat.txt`);
  writeFileSync(listFile, `${lines.join('\n')}\n`);

  const master = path.join(out, `${name}-loop.mkv`);
  const fps = orbit.outputFps;
  // Screencast JPEGs are full-range BT.601. The web encodes want the one
  // colour contract every browser honours the same way: limited-range BT.709
  // matrix, tagged, with the sRGB transfer the pixels actually carry — an
  // untagged or full-range stream is decoded differently by Safari and Chrome,
  // and the poster (a PNG cut from the video) would no longer match it.
  // PNG frames are plain sRGB RGB: only the output side of the matrix applies.
  const toYuv = pngInput
    ? 'scale=out_range=tv:out_color_matrix=bt709:flags=lanczos+accurate_rnd+full_chroma_int'
    : 'scale=in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709';
  const graph = [
    `[0:v]fps=${fps},${toYuv},format=yuv420p,split=2[a][b]`,
    `[a]trim=start=${d}:end=${d + T},setpts=PTS-STARTPTS[A]`,
    `[b]trim=start=0:end=${d},setpts=PTS-STARTPTS[P]`,
    `[A][P]xfade=transition=fade:duration=${d}:offset=${T - d},format=yuv420p,${COLOUR_PARAMS}[v]`,
  ].join(';');
  // The web encodes are cut from this, and the posters from those. HQ keeps
  // it LOSSLESS: it is also the reference every VMAF score is measured against.
  const quality = lossless ? ['-qp', '0', '-preset', 'veryfast'] : ['-crf', '8', '-preset', 'medium'];
  ffmpeg(['-f', 'concat', '-safe', '0', '-i', listFile, '-filter_complex', graph, '-map', '[v]',
    '-an', '-c:v', 'libx264', ...quality, '-pix_fmt', 'yuv420p', '-r', String(fps),
    ...COLOUR_TAGS, master]);

  // Eyes on the seam: the loop's first frame, its last, and the middle of the fade.
  const checks = {
    start: 0,
    xfadeMid: T - d / 2,
    end: T - 1 / fps,
  };
  for (const [label, t] of Object.entries(checks)) {
    ffmpeg(['-ss', t.toFixed(4), '-i', master, '-frames:v', '1', path.join(out, `${name}-check-${label}.png`)]);
  }
  const probe = spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,nb_read_frames,r_frame_rate:format=duration', '-of', 'json', master], { encoding: 'utf8' });
  const info = JSON.parse(probe.stdout);
  const inWindowStats = meta.slow > 1 ? phaseStats(inWindow) : frameStats(inWindow.map((f) => f.ts));
  // The source frame the loop opens on: the build step compares its poster to
  // it, which is the only check that the colour conversion did not shift.
  const t0Frame = inWindow.reduce((best, f) => (Math.abs(f.s) < Math.abs(best.s) ? f : best));
  return {
    master: path.relative(ROOT, master),
    width: info.streams[0].width,
    height: info.streams[0].height,
    frames: Number(info.streams[0].nb_read_frames),
    durationS: Number(info.format.duration),
    sourceFramesInWindow: inWindow.length,
    sourceFpsInWindow: inWindowStats.fps,
    sourceGapMs: inWindowStats.gapMs,
    sourceClock: meta.slow > 1 ? `page time (slow motion ×${meta.slow})` : 'real time',
    tilesUnsettledFrames: inWindowStats.tilesUnsettled ?? null,
    gapsOver100ms: inWindowStats.gapsOver100ms,
    rendersMissed: phased.rendersMissed ?? null,
    phaseMatchSpreadMs: phased.matchSpreadMs,
    t0SourceFrame: { file: path.relative(ROOT, path.join(framesDir, t0Frame.file)), s: Number(t0Frame.s.toFixed(4)) },
    checks: Object.fromEntries(Object.keys(checks).map((k) => [k, path.relative(ROOT, path.join(out, `${name}-check-${k}.png`))])),
  };
}

async function captureDevice(device, options) {
  const { origin, out, rehearsal, settleMs, hq, format } = options;
  const name = `hero-${device}`;
  const hqSpec = hq ? HQ[device] : null;
  // The screencast captures at the WINDOW's device scale, not the emulated
  // one: an emulated DPR 2 on a DPR 1 window yields 390×844 frames. Measured
  // 2026-09-17: only a forced window scale of 2, with a window larger than the
  // emulated viewport, gives 780×1688.
  let windowArgs = [];
  if (hq) windowArgs = [`--force-device-scale-factor=${hqSpec.dpr}`, `--window-size=${hqSpec.window}`];
  else if (device === 'phone') windowArgs = ['--force-device-scale-factor=2', '--window-size=1200,2000'];
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: CHROME,
    protocolTimeout: 600_000,
    defaultViewport: null,
    args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization',
      '--hide-scrollbars', '--mute-audio', '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', ...windowArgs],
  });
  const started = Date.now();
  try {
    const qaOptions = { photoreal: !rehearsal };
    let page;
    let url = `${origin}/?welcome=0&perf=full#${HERO_HASH}`;
    let size;
    if (device === 'phone') {
      page = await newPhoneQaPage(browser, qaOptions);
      // iPhone 13 emulation brings DPR 3; the standard loop asks for 2 (780×1688).
      const phone = hq ? hqSpec : PHONE_SIZE;
      await page.setViewport({ width: phone.cssWidth, height: phone.cssHeight,
        deviceScaleFactor: phone.dpr, isMobile: true, hasTouch: true });
      url = phoneUrl(url);
      size = { cssWidth: phone.cssWidth, cssHeight: phone.cssHeight, dpr: phone.dpr };
    } else {
      page = await newQaPage(browser, qaOptions);
      size = hq
        ? { cssWidth: hqSpec.cssWidth, cssHeight: hqSpec.cssHeight, dpr: hqSpec.dpr }
        : { ...(options.size || DESKTOP_SIZES[0]), dpr: 1 };
      await page.setViewport({ width: size.cssWidth, height: size.cssHeight, deviceScaleFactor: size.dpr });
    }
    // Before the app's first script: every clock it reads must be the slowable one.
    if (hq) await page.evaluateOnNewDocument(pageInstallClock);
    await page.bringToFront();
    log(`${name}: ${rehearsal ? 'REHEARSAL (no ion session)' : 'photoreal — 1 ion session'} ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.addStyleTag({ content: MASK_CSS });
    await page.waitForFunction(() => !!window.__godsEyeView?.viewer, { timeout: 120_000 });

    if (device === 'phone' || hq) {
      // A phone renders the globe at CSS resolution (Cesium's default) and asks
      // the mesh for coarser tiles. That is the right trade on a handset and
      // the wrong one for a video that is watched, not flown: render at the
      // emulated DPR and at the desktop's tile error for this capture only.
      await page.evaluate(() => {
        const g = window.__godsEyeView;
        g.viewer.useBrowserRecommendedResolution = false;
        g.requestRender?.('landing-capture');
      });
    }

    const booted = await waitForState(page, 'share-link pose', (s) => poseOk(s.camera), { timeoutMs: 60_000 });
    log(`${name}: pose restored`, booted.camera);
    if (!rehearsal) {
      await waitForState(page, 'photoreal stack', (s) => s.activeStack === 'photoreal' && s.photorealReady, { timeoutMs: 90_000 });
      if (device === 'phone' || hq) {
        await page.evaluate((tiles) => {
          const g = window.__godsEyeView;
          g.tileset.maximumScreenSpaceError = tiles.sse;
          if (tiles.cacheBytes) {
            g.tileset.cacheBytes = tiles.cacheBytes;
            g.tileset.maximumCacheOverflowBytes = tiles.cacheOverflowBytes;
          }
          g.requestRender?.('landing-capture');
        }, hq
          ? { sse: HQ.tileSse, cacheBytes: HQ.cacheBytes, cacheOverflowBytes: HQ.cacheOverflowBytes }
          : { sse: 16 });
      }
    }
    await waitForState(page, 'layers', (s) => s.layersMatch, { timeoutMs: 60_000 });
    await waitForState(page, 'tiles drained (held 3 s)', (s) => s.tilesLoaded, { holdMs: 3000, timeoutMs: 300_000 });
    const drainedAfterS = Number(((Date.now() - started) / 1000).toFixed(1));
    log(`${name}: tiles drained after ${drainedAfterS} s`);
    const traffic = await waitForState(page, 'traffic', (s) => s.traffic && s.traffic.count > 0 && !s.traffic.loading
      && (!s.traffic.floorArmed || s.traffic.floorWaiting === 0), { timeoutMs: 120_000, everyMs: 500 })
      .catch((error) => { log(`${name}: WARN ${error.message.slice(0, 300)}`); return null; });
    log(`${name}: traffic`, traffic?.traffic ?? 'not settled');
    await sleep(settleMs);

    const orbitMeta = await page.evaluate(pageInstallOrbit, ORBIT);
    log(`${name}: orbit centre`, orbitMeta.center, `range ${orbitMeta.rangeM.toFixed(1)} m`,
      `heading at +${ORBIT.amplitudeDeg}° = ${orbitMeta.headingAtAmplitudeDeg.toFixed(3)}°`);
    log(`${name}: lookAt equivalence`, orbitMeta.lookAtCheck);

    let sizeTrial = null;
    let realtimeTrial = null;
    let slow = 1;
    if (hq) {
      // Can this machine record the HQ size in real time? Five seconds of the
      // real orbit, at the real size and format, answers it.
      const trial = await startScreencast(page, {
        dir: null, maxWidth: size.cssWidth * size.dpr, maxHeight: size.cssHeight * size.dpr, format,
      });
      await runOrbit(page, -ORBIT.periodS, -ORBIT.periodS + HQ.trialS);
      const trialFrames = await trial.stop();
      await page.evaluate(() => window.__landingHero.stop());
      realtimeTrial = { size: `${size.cssWidth * size.dpr}x${size.cssHeight * size.dpr}`, format,
        ...frameStats(trialFrames.slice(2).map((f) => f.ts)) };
      const { minFps, maxP90Ms, maxGapMs } = HQ.realtime;
      realtimeTrial.meetsRealtime = realtimeTrial.fps >= minFps && realtimeTrial.gapMs.p90 < maxP90Ms
        && realtimeTrial.gapMs.max < maxGapMs;
      // Slow enough that the screencast delivers every render with room to
      // spare: renders arrive every k/30 s of real time, and each one costs a
      // render, a PNG encode, a 10 MB transfer and a write. A quarter of the
      // real-time trial rate held with no miss at ×10 (2026-09-17).
      slow = options.slow ?? (realtimeTrial.meetsRealtime ? 1
        : Math.min(24, Math.max(2, Math.ceil(HQ.slowTargetFps / (0.25 * Math.max(realtimeTrial.fps, 0.5))))));
      log(`${name}: real-time trial`, realtimeTrial, `→ slow motion ×${slow}`);
      await waitForState(page, 'tiles drained after trial', (s) => s.tilesLoaded, { holdMs: 3000, timeoutMs: 180_000 });
    }
    if (device === 'desktop' && !options.size && !hq) {
      // Measure the screencast at 1920×1080 on a slice of the real orbit.
      const trial = await startScreencast(page, { dir: null, maxWidth: 1920, maxHeight: 1080 });
      await runOrbit(page, -ORBIT.periodS, -ORBIT.periodS + 6);
      const trialFrames = await trial.stop();
      await page.evaluate(() => window.__landingHero.stop());
      sizeTrial = { size: '1920x1080', ...frameStats(trialFrames.slice(3).map((f) => f.ts)) };
      log(`${name}: 1920×1080 trial`, sizeTrial);
      if (sizeTrial.fps < DESKTOP_MIN_FPS) {
        size = { ...DESKTOP_SIZES[1], dpr: 1 };
        await page.setViewport({ width: size.cssWidth, height: size.cssHeight, deviceScaleFactor: 1 });
        await sleep(1000);
        await waitForState(page, 'tiles drained after resize', (s) => s.tilesLoaded, { holdMs: 3000, timeoutMs: 120_000 });
        // Same aspect, same centre ray — but re-derive the law on the new canvas.
        await page.evaluate(() => window.__landingHero.dispose());
        Object.assign(orbitMeta, await page.evaluate(pageInstallOrbit, ORBIT));
      }
    }

    const before = await readState(page);
    if (!poseOk(before.camera)) throw new Error(`${name}: pose drifted before recording: ${JSON.stringify(before.camera)}`);
    if (!rehearsal && before.activeStack !== 'photoreal') throw new Error(`${name}: active stack is ${before.activeStack}`);
    if (before.postProcessEnabled.length) log(`${name}: WARN post-process stages on: ${before.postProcessEnabled}`);
    if (before.scopeMaskShown) log(`${name}: WARN scope mask visible`);

    const framesDir = path.join(out, `${name}-frames`);
    rmSync(framesDir, { recursive: true, force: true });
    const cast = await startScreencast(page, {
      dir: framesDir,
      maxWidth: size.cssWidth * size.dpr,
      maxHeight: size.cssHeight * size.dpr,
      format,
    });
    await sleep(500);
    // One full period of pre-roll, the recorded period, and a short tail. In
    // slow motion the pre-roll runs in real time — it only streams tiles —
    // and the clock slows one second before the cross-fade material starts.
    const recordStarted = Date.now();
    await runOrbit(page, -ORBIT.periodS, ORBIT.periodS + 0.5,
      slow > 1 ? { slow, switchAtS: -ORBIT.crossfadeS - 1, targetFps: HQ.slowTargetFps } : {});
    const recordS = Math.round((Date.now() - recordStarted) / 1000);
    const frames = await cast.stop();
    const renderLog = await page.evaluate(() => ({
      renders: window.__landingHero.renders,
      ticks: window.__landingHero.ticks,
      slow: window.__landingHero.slow,
      switchRealEpochMs: window.__landingHero.switchRealEpochMs,
    }));
    await page.evaluate(() => window.__landingHero.stop());
    const after = await readState(page);

    const recordedStats = frameStats(frames.map((f) => f.ts));
    const renderStats = frameStats(renderLog.renders.map(([ms]) => ms / 1000));
    log(`${name}: screencast`, recordedStats, `renders ${renderStats.fps} fps, rAF ticks ${renderLog.ticks}`);
    writeFileSync(path.join(out, `${name}-frames.json`), JSON.stringify({
      frames,
      renders: renderLog.renders,
      slow: renderLog.slow,
      switchRealEpochMs: renderLog.switchRealEpochMs,
      master: hq ? 'lossless' : 'crf8',
    }));

    const firstFrame = frames.find((f) => f.file);
    return {
      device,
      capturedAt: new Date().toISOString(),
      rehearsal,
      origin,
      url,
      cssWidth: size.cssWidth,
      cssHeight: size.cssHeight,
      dpr: size.dpr,
      screencastDeviceWidth: firstFrame?.deviceWidth ?? null,
      fovRad: before.fovRad,
      fovyRad: before.fovyRad,
      aspect: before.aspect,
      camera: before.camera,
      activeStack: before.activeStack,
      tilesetSource: before.tilesetSource,
      tilesetSse: before.tilesetSse,
      tilesLoaded: before.tilesLoaded,
      bufferWidth: before.bufferWidth,
      bufferHeight: before.bufferHeight,
      perfProfile: before.perf,
      renderGovernor: before.governor,
      enabledLayers: before.enabledLayers,
      traffic: after.traffic,
      detectionSurface: after.detectionSurface,
      calloutCanvas: after.calloutCanvas,
      postProcessEnabled: before.postProcessEnabled,
      sizeTrial,
      quality: hq ? 'hq' : 'standard',
      format,
      realtimeTrial,
      slowMotion: renderLog.slow,
      recordRealS: recordS,
      drainedAfterS,
      msaaSamples: before.msaaSamples,
      tilesetCacheBytes: before.tilesetCacheBytes,
      screencast: recordedStats,
      renders: renderStats,
      orbit: {
        ...ORBIT,
        durationS: ORBIT.periodS,
        headingOffsetDeg: 'amplitudeDeg * (1 - cos(2 * PI * t / periodS)) / 2',
        rotation: 'pose(t) = pose(0) rotated about `axis` through `center.ecef` by -headingOffsetDeg(t), '
          + 'right-hand rule: clockwise seen from above, so the camera heading grows by headingOffsetDeg(t)',
        seam: 'the last crossfadeS seconds blend R(t) into R(t - periodS); the law is periodic, so both '
          + 'sides of the blend carry the same camera pose',
        center: orbitMeta.center,
        centerSource: orbitMeta.centerSource,
        pickSpreadM: orbitMeta.pickSpreadM,
        axis: orbitMeta.axis,
        rangeM: orbitMeta.rangeM,
        initialWorld: orbitMeta.initialWorld,
        lookAt: {
          ...orbitMeta.lookAt,
          usage: 'camera.lookAt(Cartesian3(center.ecef), new HeadingPitchRange(lookAt.headingRad + '
            + 'CesiumMath.toRadians(headingOffsetDeg(t)), lookAt.pitchRad, lookAt.rangeM)); '
            + 'camera.lookAtTransform(Matrix4.IDENTITY)',
          maxDeviation: orbitMeta.lookAtCheck,
        },
        headingAtAmplitudeDeg: orbitMeta.headingAtAmplitudeDeg,
      },
      elapsedS: Math.round((Date.now() - started) / 1000),
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

async function main() {
  const options = parseCli(process.argv.slice(2));
  mkdirSync(options.out, { recursive: true });
  const reportFile = path.join(options.out, 'hero-capture.json');
  const report = existsSync(reportFile) ? JSON.parse(readFileSync(reportFile, 'utf8')) : {};
  let sessions = 0;
  for (const device of options.devices) {
    const name = `hero-${device}`;
    if (!options.assembleOnly) {
      if (!options.rehearsal) sessions++;
      report[device] = await captureDevice(device, options);
    } else if (!report[device]) {
      throw new Error(`--assemble-only: no ${device} entry in ${reportFile}`);
    }
    const loop = assembleLoop({ name, out: options.out, orbit: ORBIT });
    report[device].loop = loop;
    log(`${name}: loop`, loop);
    writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
  }
  const frameDirs = readdirSync(options.out).filter((f) => f.endsWith('-frames'));
  log(`done — ion sessions spent by this run: ${sessions}; report ${path.relative(ROOT, reportFile)}; frame dirs: ${frameDirs.join(', ')}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
