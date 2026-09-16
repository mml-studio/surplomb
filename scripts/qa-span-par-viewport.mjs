#!/usr/bin/env node
/**
 * qa-span-par-viewport.mjs — does the reader's WINDOW SIZE still fragment the
 * Overpass cache?
 *
 * WHY THIS EXISTS. `normalizeFetchBox` (PR #230) took the fetch box off the
 * float continuum and onto a lattice: the centre snaps to `tier.snapDeg`, and
 * so does the span. That collapsed two kinds of divergence — camera pose and
 * window size — but only as far as the lattice reaches. Two readers whose
 * ROUNDED spans land one step apart still ask two different questions, and a
 * cold Overpass box costs 0.6 to 46 s where a repeat costs 52 to 78 ms.
 *
 * The open question is therefore arithmetic, not opinion: at the altitude and
 * pitch the app's own boot flight settles on, do the window sizes people
 * actually use produce the SAME snapped box? If they do, warming the default
 * Paris view is one scripted visit a week. If they fall into four buckets, it
 * is four visits, and `snapDeg` is arguably too tight.
 *
 * WHAT IT MEASURES, AND WHY IT IS LOAD-PROOF. Nothing here is a duration. The
 * box is a pure function of the camera frustum and the canvas aspect ratio, so
 * a machine at load average 70 produces the same answer as an idle one — it
 * just takes longer to get there. That is deliberate: this is the one
 * measurement in the traffic work that can be taken on a busy machine.
 *
 * HOW IT DRIVES THE APP. No share link. `flyToDefaultCity` only runs on a boot
 * with NO share state, and the default view is the whole subject — so the page
 * is opened bare, the cinematic is allowed to land, and only then is the layer
 * switched on. A `#lat=...` hash would have suppressed the very flight under
 * test. See `src/camera.js`.
 *
 * Two readings are taken per window size and cross-checked against each other:
 *
 *   - the WIRE truth: the bbox inside the Overpass POST body, which IS the
 *     proxy's cache key;
 *   - the MODEL: the same chain recomputed in Node from the camera state, with
 *     the production functions imported straight out of `trafficBounds.js`
 *     (it is Cesium-free by design). A divergence between the two means this
 *     harness is lying, and it is reported rather than hidden.
 *
 *   node scripts/qa-span-par-viewport.mjs --url http://localhost:4421
 *
 * Writes nothing, commits nothing, asserts nothing. Prints a table.
 */

import puppeteer from 'puppeteer';
import fs from 'node:fs';
import { newQaPage } from './lib/qa-first-run.mjs';
import {
  roadFetchTier,
  deriveFetchCenter,
  clampBoundsAroundCenter,
  normalizeFetchBox,
  tierFetchBox,
  intersectBoxes,
} from '../src/data/trafficBounds.js';

const argv = process.argv.slice(2);
const getOpt = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const APP_URL = getOpt('--url', 'http://localhost:4421');
const HEADFUL = argv.includes('--headful');
const OUT_JSON = getOpt('--json', '');

/**
 * The window sizes under test.
 *
 * The first four are the shortlist the traffic work named: the desktop
 * resolutions that carry most of the web. `mbp14` is added because it is what
 * this project is built and demoed on, and a demo that stutters on the
 * presenter's own laptop is the only one anybody sees.
 */
const SCREEN_VIEWPORTS = [
  { label: '1366x768', width: 1366, height: 768 },
  { label: '1440x900', width: 1440, height: 900 },
  { label: '1920x1080', width: 1920, height: 1080 },
  { label: '2560x1440', width: 2560, height: 1440 },
  { label: 'mbp14 1512x982', width: 1512, height: 982 },
];

/**
 * The same displays, minus the browser's own chrome.
 *
 * SCREEN SIZE IS NOT VIEWPORT SIZE, and the difference is not cosmetic here:
 * the box follows the canvas ASPECT RATIO, and a tab strip plus a toolbar
 * takes ~87 px off the height of every one of these. 1920x1080 maximised is a
 * 1920x993 viewport — aspect 1.93, not 1.78 — which is a different point on
 * the curve and possibly a different lattice cell. A run on nominal screen
 * sizes alone would answer a question nobody's browser asks.
 *
 * The last entry is a window nobody maximised, which is the case that decides
 * whether the answer is robust or merely true for tidy desktops.
 */
const REAL_VIEWPORTS = [
  { label: '1366x768 max', width: 1366, height: 681 },
  { label: '1440x900 max', width: 1440, height: 813 },
  { label: '1920x1080 max', width: 1920, height: 993 },
  { label: '2560x1440 max', width: 2560, height: 1353 },
  { label: 'mbp14 max', width: 1512, height: 895 },
  { label: 'fenetre libre', width: 1200, height: 800 },
];

/** `--viewports 1200x800,1600x900` overrides both lists. */
const CUSTOM = getOpt('--viewports', '');
const VIEWPORTS = CUSTOM
  ? CUSTOM.split(',').map((s) => {
    const [w, h] = s.trim().split('x').map(Number);
    return { label: `${w}x${h}`, width: w, height: h };
  })
  : (argv.includes('--real') ? REAL_VIEWPORTS : SCREEN_VIEWPORTS);

const CHROME_CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  (() => { try { return puppeteer.executablePath(); } catch { return null; } })(),
].filter(Boolean);
const findChrome = () => CHROME_CANDIDATES.find((c) => {
  try { return fs.existsSync(c); } catch { return false; }
}) || null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r5 = (v) => (Number.isFinite(v) ? Number(v.toFixed(5)) : null);

/**
 * Everything the box depends on, read out of the live scene.
 *
 * `computeViewRectangle` is the raw input; `pickEllipsoid` at the canvas
 * centre is what `getFetchCenter` uses for the look-at point. Both are read
 * here rather than recomputed, because the point of the cross-check is to
 * feed the model the SAME inputs production had.
 */
async function readCameraState(page) {
  return page.evaluate(() => {
    const gev = window.__godsEyeView;
    const viewer = gev?.viewer;
    const cam = viewer?.camera;
    const canvas = viewer?.scene?.canvas;
    if (!cam || !canvas) return null;
    const deg = (rad) => (rad * 180) / Math.PI;
    const carto = cam.positionCartographic;
    const rect = cam.computeViewRectangle();

    // The look-at point, the way `getFetchCenter` takes it: the ellipsoid
    // under the middle of the canvas. On the default boot stack the terrain is
    // an ellipsoid provider, so this is analytic and reproducible.
    //
    // Done WITHOUT the Cesium namespace: it stopped being on `window` when the
    // engine moved into the bundle (2026-09-09), so a harness reaching for
    // `window.Cesium` silently reads undefined. `pickEllipsoid` only wants
    // `.x`/`.y` off its argument and defaults to WGS84, and the scene already
    // owns an ellipsoid that can do the cartesian → cartographic leg.
    let hitLat = null;
    let hitLon = null;
    const w = canvas.clientWidth || canvas.width;
    const h = canvas.clientHeight || canvas.height;
    if (w > 0 && h > 0) {
      const hit = cam.pickEllipsoid({ x: w / 2, y: h / 2 });
      const ell = viewer.scene.globe?.ellipsoid || viewer.scene.ellipsoid;
      if (hit && ell) {
        const hc = ell.cartesianToCartographic(hit);
        if (hc) {
          hitLat = deg(hc.latitude);
          hitLon = deg(hc.longitude);
        }
      }
    }
    return {
      canvas: { w, h, dpr: window.devicePixelRatio },
      window: { w: window.innerWidth, h: window.innerHeight },
      nadirLat: deg(carto.latitude),
      nadirLon: deg(carto.longitude),
      altitudeM: carto.height,
      headingDeg: deg(cam.heading),
      pitchDeg: deg(cam.pitch),
      rect: rect ? {
        south: deg(rect.south), west: deg(rect.west),
        north: deg(rect.north), east: deg(rect.east),
      } : null,
      hitLat,
      hitLon,
      profile: gev?.getPerfProfileDiagnostics?.()?.profile || '?',
    };
  });
}

/**
 * Wait for the boot cinematic to put the camera down.
 *
 * `flyTo` raises `complete` before the camera's own `moveEnd`, and `moveEnd`
 * is not raised by `setView` at all — so neither event is a reliable "we have
 * arrived" here. Two consecutive identical altitude readings are, and they
 * cost nothing but a poll.
 */
async function waitForSettle(page, { timeoutMs = 120000 } = {}) {
  const t0 = Date.now();
  let prev = null;
  let stable = 0;
  while (Date.now() - t0 < timeoutMs) {
    const alt = await page.evaluate(() => {
      const c = window.__godsEyeView?.viewer?.camera?.positionCartographic;
      return c ? c.height : null;
    });
    if (alt !== null && prev !== null && Math.abs(alt - prev) < 1) {
      stable += 1;
      if (stable >= 3 && alt < 5000) return { altitudeM: alt, ms: Date.now() - t0 };
    } else {
      stable = 0;
    }
    prev = alt;
    await sleep(700);
  }
  return { altitudeM: prev, ms: Date.now() - t0, timedOut: true };
}

/** The bbox Overpass was actually asked for, out of the POST body. */
function bboxFromBody(body) {
  const m = decodeURIComponent(body || '').match(
    /\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/
  );
  if (!m) return null;
  return {
    south: Number(m[1]), west: Number(m[2]), north: Number(m[3]), east: Number(m[4]),
  };
}

/** Which road classes a query asked for — the two passes differ only in this. */
function classesFromBody(body) {
  const m = decodeURIComponent(body || '').match(/highway"~"\^\(([^)]*)\)/);
  return m ? m[1] : '?';
}

const keyOf = (b) => (b ? `${b.south},${b.west},${b.north},${b.east}` : 'none');
const spanOf = (b) => (b ? { lat: b.north - b.south, lon: b.east - b.west } : null);

/**
 * Recompute the production chain in Node from the camera state.
 *
 * Mirrors `onCameraChanged`, which since the frustum split produces TWO boxes
 * from one camera state:
 *
 *   - the FRAME (`clamped` here): view rectangle → look-at centre → capped at
 *     the band span. It is the reader's own window and it decides which roads
 *     get dots. It is window-dependent on purpose.
 *   - the FETCH BOX (`snapped`): the band's full span on the band's lattice,
 *     a function of the cell alone. It IS the proxy's cache key, and the
 *     whole question this harness asks is whether it still carries the window.
 *
 * Any divergence from the wire is a bug in this harness, not in the app, and
 * is printed as such.
 */
function modelBox(state) {
  const tier = roadFetchTier(state.altitudeM);
  if (!tier || !state.rect) return { tier, raw: null, clamped: null, snapped: null };
  const centre = deriveFetchCenter({
    nadirLat: state.nadirLat,
    nadirLon: state.nadirLon,
    hitLat: state.hitLat ?? undefined,
    hitLon: state.hitLon ?? undefined,
    maxPullKm: tier.pullKm,
  });
  const snapped = tierFetchBox(centre, tier);
  const frame = intersectBoxes(
    clampBoundsAroundCenter(state.rect, centre, tier.spanDeg), snapped,
  );
  return { tier, centre, raw: state.rect, clamped: frame, snapped };
}

/**
 * The chain as it stood before the frustum split, for contrast only.
 *
 * The span was the viewport's, rounded onto the lattice — so it moved with the
 * window AND with every zoom step and pitch change. This is what produced the
 * five keys the `--real` sweep measured.
 */
function legacyBox(state) {
  const tier = roadFetchTier(state.altitudeM);
  if (!tier || !state.rect) return null;
  const centre = deriveFetchCenter({
    nadirLat: state.nadirLat,
    nadirLon: state.nadirLon,
    hitLat: state.hitLat ?? undefined,
    hitLon: state.hitLon ?? undefined,
    maxPullKm: tier.pullKm,
  });
  return normalizeFetchBox(clampBoundsAroundCenter(state.rect, centre, tier.spanDeg), tier);
}

/**
 * Poses a reader actually strikes over one crossroads, inside the street band.
 *
 * Deliberately NOT a pan: a pan is meant to change the cell, and a new cell is
 * a new question that nobody claims is free. What is claimed to be free is
 * looking at the SAME place harder — leaning in, tilting, turning around it.
 */
const POSES = [
  { label: 'arrivee  900m -35', height: 900, pitch: -35, heading: 0 },
  { label: 'penche   900m -20', height: 900, pitch: -20, heading: 0 },
  { label: 'a plat   900m -60', height: 900, pitch: -60, heading: 0 },
  { label: 'tourne   900m -35', height: 900, pitch: -35, heading: 90 },
  { label: 'zoom     600m -35', height: 600, pitch: -35, heading: 0 },
  { label: 'zoom     400m -35', height: 400, pitch: -35, heading: 0 },
  { label: 'recul   1600m -35', height: 1600, pitch: -35, heading: 0 },
  { label: 'recul   2600m -35', height: 2600, pitch: -35, heading: 0 },
];

/**
 * One boot, one window, many poses over the same crossroads: how many distinct
 * Overpass questions does that cost?
 */
async function runPoseSweep(browser) {
  const page = await newQaPage(browser);
  const net = [];
  page.on('request', (req) => {
    if (req.url().includes('/api/overpass')) net.push({ body: req.postData() || '' });
  });
  await page.setViewport({ width: 1920, height: 993, deviceScaleFactor: 1 });
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
  for (let i = 0; i < 240; i++) {
    const ready = await page.evaluate(
      () => Boolean(window.__godsEyeView?.viewer && window.__godsEyeView?.dataManager)
    );
    if (ready) break;
    await sleep(500);
  }
  await waitForSettle(page);
  const anchor = await page.evaluate(() => {
    const c = window.__godsEyeView.viewer.camera.positionCartographic;
    return { lat: (c.latitude * 180) / Math.PI, lon: (c.longitude * 180) / Math.PI };
  });
  await page.evaluate(() => window.__godsEyeView.dataManager.setEnabled('traffic', true));
  await sleep(6000);

  const rows = [];
  for (const pose of POSES) {
    net.length = 0;
    await page.evaluate((p, a) => {
      const gev = window.__godsEyeView;
      const ell = gev.viewer.scene.globe.ellipsoid;
      const d2r = Math.PI / 180;
      gev.viewer.camera.setView({
        destination: ell.cartographicToCartesian({
          longitude: a.lon * d2r, latitude: a.lat * d2r, height: p.height,
        }),
        orientation: { heading: p.heading * d2r, pitch: p.pitch * d2r, roll: 0 },
      });
    }, pose, anchor);
    // `setView` raises no `moveEnd`; the layer's own settle watcher is what
    // re-decides, and the fetch is debounced behind it.
    await sleep(4000);
    const state = await readCameraState(page);
    rows.push({
      pose,
      state,
      requests: net.map((e) => bboxFromBody(e.body)).filter(Boolean),
      now: state ? tierFetchBox(modelBox(state).centre, roadFetchTier(state.altitudeM)) : null,
      before: state ? legacyBox(state) : null,
    });
    process.stdout.write(`[pose] ${pose.label} … ${net.length} request(s)\n`);
  }
  await page.close();
  return rows;
}

async function runOne(browser, vp) {
  const page = await newQaPage(browser);
  const net = [];
  page.on('request', (req) => {
    if (req.url().includes('/api/overpass')) {
      net.push({ body: req.postData() || '', at: Date.now() });
    }
  });

  await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1 });
  // Bare URL on purpose: any hash is share state, and share state suppresses
  // the default flight this measurement is about.
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });

  for (let i = 0; i < 240; i++) {
    const ready = await page.evaluate(
      () => Boolean(window.__godsEyeView?.viewer && window.__godsEyeView?.dataManager)
    );
    if (ready) break;
    await sleep(500);
  }
  const settle = await waitForSettle(page);
  const state = await readCameraState(page);

  // The layer is switched on AFTER the arrival, which is what a reader who
  // opens the tray does, and what a default-on layer would do at the end of
  // the flight. Switching it on earlier would measure a box from mid-descent.
  net.length = 0;
  await page.evaluate(() => window.__godsEyeView.dataManager.setEnabled('traffic', true));
  for (let i = 0; i < 60 && net.length === 0; i++) await sleep(500);
  await sleep(2500); // let the second (full-graph) pass go out too

  const wire = net.map((e) => ({ bbox: bboxFromBody(e.body), classes: classesFromBody(e.body) }))
    .filter((e) => e.bbox);
  const model = state ? modelBox(state) : null;

  await page.close();
  return { vp, settle, state, wire, model };
}

(async () => {
  const exe = findChrome();
  const browser = await puppeteer.launch({
    headless: HEADFUL ? false : 'new',
    executablePath: exe || undefined,
    protocolTimeout: 300000,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  // ── Pose sweep: one window, one corner, many ways of looking at it ────────
  if (argv.includes('--poses')) {
    let rows = [];
    try {
      rows = await runPoseSweep(browser);
    } finally {
      await browser.close();
    }
    const keyNow = new Set();
    const keyBefore = new Set();
    const wireKeysSeen = new Set();
    let wireRequests = 0;
    console.log('\n  pose               alt(m)  pitch   requests   fetch box (cache key)');
    console.log('  ' + '-'.repeat(80));
    for (const r of rows) {
      if (r.now) keyNow.add(keyOf(r.now));
      if (r.before) keyBefore.add(keyOf(r.before));
      wireRequests += r.requests.length;
      for (const b of r.requests) wireKeysSeen.add(keyOf(b));
      console.log(
        `  ${r.pose.label.padEnd(18)} ${String(Math.round(r.state?.altitudeM ?? 0)).padEnd(7)} `
        + `${String(Math.round(r.state?.pitchDeg ?? 0)).padEnd(7)} ${String(r.requests.length).padEnd(10)} `
        + `${keyOf(r.now)}`
      );
    }
    console.log(`\n  VERDICT — ${rows.length} poses over ONE crossroads, inside the street band:`);
    console.log(`    now    : ${keyNow.size} distinct cache key(s)`);
    console.log(`    before : ${keyBefore.size} distinct cache key(s) (the pre-split chain, recomputed`);
    console.log('             from the same camera states — each one a 0.6–46 s cold box)');
    console.log(`    on the wire: ${wireRequests} Overpass request(s) across ${wireKeysSeen.size} key(s)`);
    console.log('\n  A pan is excluded on purpose: a new cell is a new question, and nobody');
    console.log('  claims that one is free. Leaning in on the same corner is what got free.');
    return;
  }

  const runs = [];
  try {
    for (const vp of VIEWPORTS) {
      process.stdout.write(`[span] ${vp.label} … `);
      try {
        const run = await runOne(browser, vp);
        runs.push(run);
        const b = run.wire[0]?.bbox;
        process.stdout.write(b ? `${keyOf(b)}\n` : 'NO OVERPASS REQUEST\n');
      } catch (err) {
        process.stdout.write(`FAILED (${err.message})\n`);
        runs.push({ vp, error: err.message });
      }
    }
  } finally {
    await browser.close();
  }

  // ── Report ────────────────────────────────────────────────────────────────
  const ok = runs.filter((r) => r.state && r.model?.snapped);
  console.log('\n  window          canvas       alt(m)  pitch   raw span (lat x lon)     frame span          fetch box (cache key)');
  console.log('  ' + '-'.repeat(116));
  for (const r of runs) {
    if (!r.state) { console.log(`  ${r.vp.label.padEnd(15)} —  ${r.error || 'no state'}`); continue; }
    const s = r.state;
    const raw = spanOf(s.rect);
    const cl = spanOf(r.model.clamped);
    console.log(
      `  ${r.vp.label.padEnd(15)} ${`${s.canvas.w}x${s.canvas.h}`.padEnd(12)} `
      + `${String(Math.round(s.altitudeM)).padEnd(7)} ${String(Math.round(s.pitchDeg)).padEnd(7)} `
      + `${raw ? `${r5(raw.lat)} x ${r5(raw.lon)}`.padEnd(24) : '—'.padEnd(24)} `
      + `${cl ? `${r5(cl.lat)} x ${r5(cl.lon)}`.padEnd(19) : '—'.padEnd(19)} `
      + `${keyOf(r.model.snapped)}`
    );
  }

  // Does the wire agree with the model? If not, believe the wire.
  console.log('\n  wire vs model');
  for (const r of ok) {
    for (const w of r.wire) {
      const same = keyOf(w.bbox) === keyOf(r.model.snapped);
      console.log(`  ${r.vp.label.padEnd(15)} ${same ? 'agree' : 'DIVERGE'}  wire=${keyOf(w.bbox)}  `
        + `${same ? '' : `model=${keyOf(r.model.snapped)}`}  [${w.classes.slice(0, 40)}]`);
    }
    if (!r.wire.length) console.log(`  ${r.vp.label.padEnd(15)} no Overpass request captured`);
  }

  // ── Verdict ───────────────────────────────────────────────────────────────
  const wireKeys = new Map();
  for (const r of ok) {
    const k = keyOf(r.wire[0]?.bbox || r.model.snapped);
    wireKeys.set(k, [...(wireKeys.get(k) || []), r.vp.label]);
  }
  const frameSpans = new Set(ok.map((r) => {
    const f = spanOf(r.model.clamped);
    return f ? `${r5(f.lat)} x ${r5(f.lon)}` : 'none';
  }));
  console.log(`\n  VERDICT — ${wireKeys.size} distinct cache key(s) across ${ok.length} window size(s):`);
  for (const [k, labels] of wireKeys) console.log(`    ${k}  ←  ${labels.join(', ')}`);
  console.log(`\n  ...backing ${frameSpans.size} distinct FRAME span(s): ${[...frameSpans].join(' | ')}`);
  console.log('  The frame is meant to differ — it is the window, and it is what keeps the');
  console.log('  dot budget spent on roads the reader can see. Only the key has to collapse.');
  console.log(
    wireKeys.size === 1
      ? '\n  One key. Warming the default view is ONE scripted visit; every reader hits it.'
      : `\n  ${wireKeys.size} keys. Warming the default view costs ${wireKeys.size} visits, `
        + 'or snapDeg has to be relaxed.'
  );

  if (OUT_JSON) {
    fs.writeFileSync(OUT_JSON, JSON.stringify({ url: APP_URL, headful: HEADFUL, runs }, null, 2));
    console.log(`\n  wrote ${OUT_JSON}`);
  }
})();
