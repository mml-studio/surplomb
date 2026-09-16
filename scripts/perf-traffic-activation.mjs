#!/usr/bin/env node
/**
 * perf-traffic-activation.mjs — where the first thirty seconds of "Trafic
 * routier" go.
 *
 * The complaint this measures, in the owner's words (2026-09-16): the layer
 * "s'affiche de manière hyper saccadée" right after it is switched on and is
 * "beaucoup plus fluide" half a minute later; switching place takes about five
 * seconds; and the dots themselves take "des dizaines de secondes" to show up.
 * Three symptoms, and nothing in the repo says whether they are one cause or
 * three.
 *
 * So this script does not assert. It records, second by second, while the
 * layer does exactly what a visitor makes it do:
 *
 *   A. ACTIVATION — camera parked over a city, layer switched on, 45 s of
 *      frame intervals, long tasks and Long Animation Frame script attribution
 *      alongside the layer's own seating/loading state. A stall that lines up
 *      with `floorWaiting > 0` is the ground-seating loop; one that lines up
 *      with a render pass is dot construction.
 *   B. PLACE CHANGE — the same recording across a jump to a second city, which
 *      is the "five seconds" leg.
 *
 * Long tasks are read two ways on purpose. `longtask` gives the 50 ms+ blocks;
 * `long-animation-frame` (LoAF) names the FUNCTION inside them, so the report
 * can say `runRoadFloorSeatingPass` instead of "something blocked for 290 ms".
 *
 * Run it on the real GPU — SwiftShader makes `scene.sampleHeight` about four
 * times its true cost, and that call is the prime suspect:
 *   node scripts/perf-traffic-activation.mjs --url http://localhost:4419 --headful
 *
 * Writes nothing, commits nothing, asserts nothing. Prints a table.
 */

import puppeteer from 'puppeteer';
import fs from 'node:fs';
import { newQaPage } from './lib/qa-first-run.mjs';

const argv = process.argv.slice(2);
const getOpt = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const APP_URL = getOpt('--url', 'http://localhost:4419');
const HEADFUL = argv.includes('--headful');
const WATCH_S = Number(getOpt('--watch-s', '45'));
const OUT_JSON = getOpt('--json', '');
/**
 * Basemap to measure, as the share link spells it (`#map=`). It is not a
 * cosmetic choice: the ground-seating loop probes whatever surface is DRAWN,
 * and `scene.sampleHeight` against the Google photorealistic mesh was measured
 * at 24 ms a call where the plain globe answers in ~6. Measuring `osm` and
 * reporting the result as the app's cost is the mistake this flag exists to
 * make impossible.
 */
const MAP_STACK = getOpt('--map', 'photoreal');
/**
 * Let this run buy a Google 3D root tile. Off by default because `newQaPage`
 * closes that door for every harness (ion meters the photoreal globe per root
 * tile, 1 000 a month on the free tier, one per BOOT) — but the stutter under
 * measurement only exists on that stack, so a run that wants it has to say so.
 */
const WANT_PHOTOREAL = argv.includes('--photoreal');

/** Street band, the altitude the complaint was made at. */
const CITY_A = { name: 'Paris', lat: 48.8566, lon: 2.3522, alt: 900, heading: 20, pitch: -35 };
const CITY_B = { name: 'Marseille', lat: 43.2965, lon: 5.3698, alt: 900, heading: 20, pitch: -35 };

const CHROME_CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  (() => { try { return puppeteer.executablePath(); } catch { return null; } })(),
].filter(Boolean);
const findChrome = () => CHROME_CANDIDATES.find((c) => { try { return fs.existsSync(c); } catch { return false; } }) || null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Install the recorder in the page: long tasks, LoAF script attribution, and
 * a frame-interval log taken off the scene's own post-render event (rAF would
 * measure the harness, not the app).
 */
async function installRecorder(page) {
  await page.evaluate(() => {
    const w = window;
    if (w.__perfRec) return;
    const rec = {
      t0: performance.now(),
      longTasks: [],
      loaf: [],
      frames: [],
      marks: [],
    };
    w.__perfRec = rec;
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          rec.longTasks.push({ at: +(e.startTime - rec.t0).toFixed(1), ms: +e.duration.toFixed(1) });
        }
      }).observe({ entryTypes: ['longtask'] });
    } catch { /* not supported */ }
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          const scripts = (e.scripts || []).map((s) => ({
            ms: +s.duration.toFixed(1),
            fn: s.sourceFunctionName || s.invoker || '(anon)',
            url: (s.sourceURL || '').split('/').slice(-1)[0],
            type: s.invokerType || '',
          })).sort((a, b) => b.ms - a.ms).slice(0, 3);
          rec.loaf.push({
            at: +(e.startTime - rec.t0).toFixed(1),
            ms: +e.duration.toFixed(1),
            blocking: +(e.blockingDuration || 0).toFixed(1),
            scripts,
          });
        }
      }).observe({ type: 'long-animation-frame', buffered: false });
    } catch { /* Chrome < 123 */ }

    const scene = w.__godsEyeView?.viewer?.scene;
    if (scene?.postRender) {
      let last = performance.now();
      scene.postRender.addEventListener(() => {
        const now = performance.now();
        rec.frames.push(+(now - last).toFixed(1));
        last = now;
        if (rec.frames.length > 20000) rec.frames.shift();
      });
    }
  });
}

/** Zero the recorder without reinstalling its observers. */
const resetRecorder = (page) => page.evaluate(() => {
  const rec = window.__perfRec;
  rec.t0 = performance.now();
  rec.longTasks.length = 0;
  rec.loaf.length = 0;
  rec.frames.length = 0;
  rec.marks.length = 0;
});

const readRecorder = (page) => page.evaluate(() => ({
  longTasks: window.__perfRec.longTasks.slice(),
  loaf: window.__perfRec.loaf.slice(),
  frames: window.__perfRec.frames.slice(),
  marks: window.__perfRec.marks.slice(),
  floorPasses: window.__godsEyeView?.dataManager?.layers?.get('traffic')?.module
    ?.__qaFloorPasses?.() ?? [],
}));

/**
 * Which surface the seating loop is actually probing, and whether it has
 * drained. Read from the scene rather than from the chip: the chip says what
 * was CHOSEN, and a photorealistic tileset that 403s leaves the globe drawn
 * under a chip that still reads "Google 3D".
 */
const surfaceState = (page) => page.evaluate(() => {
  const scene = window.__godsEyeView?.viewer?.scene;
  if (!scene) return null;
  let tileset = null;
  for (let i = 0; i < scene.primitives.length; i++) {
    const p = scene.primitives.get(i);
    if (p?.constructor?.name === 'Cesium3DTileset' && p.show) { tileset = p; break; }
  }
  return {
    globeShow: Boolean(scene.globe?.show),
    tileset: Boolean(tileset),
    tilesLoaded: tileset ? Boolean(tileset.tilesLoaded) : null,
    surface: tileset && !scene.globe?.show ? 'photoreal' : 'globe',
    terrain: scene.terrainProvider?.constructor?.name || '?',
  };
});

const trafficStats = (page) => page.evaluate(() => {
  const mod = window.__godsEyeView?.dataManager?.layers?.get('traffic')?.module;
  const s = mod?.getStats?.();
  if (!s) return null;
  return {
    count: s.count,
    loading: s.loading,
    mode: s.mode,
    cov: s.flowCoveragePct,
    tiles: s.tilesFetched,
    floorArmed: s.floorArmed,
    floorSeated: s.floorSeated,
    floorWaiting: s.floorWaiting,
    floorCells: s.floorCells,
    pass: s.floorPass,
    passWorstMs: s.floorPassWorstMs,
    passTotalMs: s.floorPassTotalMs,
    ribbon: (s.ribbonCounts?.free || 0) + (s.ribbonCounts?.slow || 0) + (s.ribbonCounts?.jam || 0),
    // The draw-set gate (`trafficDrawSet.js`). `culled` is the whole point of
    // it — roads inside the fetch box that the camera cannot see — and
    // `respawns` is the cost: one differential respawn per camera settle that
    // actually changed the set.
    drawRoads: s.drawRoads,
    culled: s.culledRoads,
    cullPasses: s.cullPasses,
    cullRespawns: s.cullRespawns,
    cullPoseSkips: s.cullPoseSkips,
    cullDeltaSkips: s.cullDeltaSkips,
  };
});

/** Park the camera the way a place chip does, then raise the real event. */
async function park(page, view) {
  await page.evaluate((v) => {
    const gev = window.__godsEyeView;
    const d2r = Math.PI / 180;
    const ell = gev.viewer.scene.globe?.ellipsoid || gev.viewer.scene.ellipsoid;
    try { gev.viewer.camera.cancelFlight(); } catch { /* no flight */ }
    gev.viewer.camera.setView({
      destination: ell.cartographicToCartesian({
        longitude: v.lon * d2r, latitude: v.lat * d2r, height: v.alt,
      }),
      orientation: { heading: v.heading * d2r, pitch: v.pitch * d2r, roll: 0 },
    });
    // setView does NOT raise moveEnd, and the per-view layers listen for it.
    gev.viewer.camera.changed.raiseEvent();
    gev.viewer.camera.moveEnd.raiseEvent();
  }, view);
}

const pct = (arr, p) => {
  if (!arr.length) return null;
  const s = arr.slice().sort((a, b) => a - b);
  return +s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(1);
};

/** Bucket the recording into one line per second of wall clock. */
function report(label, rec, timeline) {
  const seconds = Math.ceil(WATCH_S);
  const rows = [];
  for (let s = 0; s < seconds; s++) {
    const lo = s * 1000;
    const hi = lo + 1000;
    const lt = rec.longTasks.filter((e) => e.at >= lo && e.at < hi);
    const blocked = lt.reduce((n, e) => n + e.ms, 0);
    const tl = timeline.filter((e) => e.at >= lo && e.at < hi).slice(-1)[0];
    rows.push({
      s,
      blockedMs: Math.round(blocked),
      worstMs: lt.length ? Math.max(...lt.map((e) => e.ms)) : 0,
      tasks: lt.length,
      dots: tl?.stats?.count ?? null,
      culled: tl?.stats?.culled ?? null,
      waiting: tl?.stats?.floorWaiting ?? null,
      seated: tl?.stats?.floorSeated ?? null,
      loading: tl?.stats?.loading ?? null,
    });
  }

  console.log(`\n\x1b[1m── ${label} ────────────────────────────────────────────\x1b[0m`);
  console.log('  s   blocked  worst  tasks | dots  culled  seated  waiting  loading');
  for (const r of rows) {
    if (r.blockedMs === 0 && r.dots === (rows[r.s - 1]?.dots ?? null) && r.s > 12 && r.waiting === 0) continue;
    console.log(
      `  ${String(r.s).padStart(2)}  ${String(r.blockedMs).padStart(6)}  ${String(Math.round(r.worstMs)).padStart(5)}  ${String(r.tasks).padStart(5)} | `
      + `${String(r.dots ?? '-').padStart(4)}  ${String(r.culled ?? '-').padStart(6)}  ${String(r.seated ?? '-').padStart(6)}  ${String(r.waiting ?? '-').padStart(7)}  ${r.loading ?? '-'}`,
    );
  }

  // Where the seating loop's milliseconds went, summed over the recording.
  const passes = timeline.map((e) => e.stats?.pass).filter((p) => p && p.totalMs > 0);
  if (passes.length) {
    const last = timeline.filter((e) => e.stats).slice(-1)[0]?.stats;
    const worst = passes.reduce((a, p) => (p.totalMs > a.totalMs ? p : a), passes[0]);
    console.log(`\n  seating loop: ${last?.passTotalMs ?? '?'} ms of main thread since enable, worst single pass ${last?.passWorstMs ?? '?'} ms`);
    console.log(`    a sampled pass: total ${worst.totalMs} ms = probes ${worst.probeMs} (×${worst.probes})`
      + ` + borrow ${worst.borrowMs} (×${worst.borrowScans}) + apply ${worst.applyMs} + reseat ${worst.reseatMs}`);
  }
  if (rec.floorPasses?.length) {
    const t = rec.floorPasses.map((p) => p.totalMs);
    const perProbe = rec.floorPasses.filter((p) => p.probes > 0).map((p) => +(p.probeMs / p.probes).toFixed(1));
    const over50 = t.filter((x) => x > 50).length;
    console.log(`    ${t.length} passes logged: median ${pct(t, 0.5)} ms, p90 ${pct(t, 0.9)} ms, max ${Math.max(...t)} ms`
      + ` — ${over50} of them over 50 ms (a dropped frame)`);
    console.log(`    per probe: median ${pct(perProbe, 0.5)} ms, p90 ${pct(perProbe, 0.9)} ms, max ${Math.max(0, ...perProbe)} ms`);
  }

  const frames = rec.frames.filter((f) => f > 0 && f < 5000);
  const total = rec.longTasks.reduce((n, e) => n + e.ms, 0);
  console.log(`\n  frames: n=${frames.length} median=${pct(frames, 0.5)}ms p90=${pct(frames, 0.9)}ms p99=${pct(frames, 0.99)}ms max=${Math.round(Math.max(0, ...frames))}ms`);
  console.log(`  long tasks: ${rec.longTasks.length}, ${Math.round(total)} ms blocked over ${WATCH_S}s (${(total / (WATCH_S * 10)).toFixed(1)}% of wall clock)`);

  // Who blocked. LoAF names the function; group by it.
  const byFn = new Map();
  for (const f of rec.loaf) {
    for (const s of f.scripts) {
      const key = `${s.fn || '(anon)'} [${s.url || '?'}]`;
      const prev = byFn.get(key) || { ms: 0, n: 0, worst: 0 };
      prev.ms += s.ms; prev.n += 1; prev.worst = Math.max(prev.worst, s.ms);
      byFn.set(key, prev);
    }
  }
  const top = [...byFn.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, 8);
  if (top.length) {
    console.log('\n  who blocked (LoAF script attribution):');
    for (const [k, v] of top) {
      console.log(`    ${String(Math.round(v.ms)).padStart(6)} ms  ×${String(v.n).padStart(4)}  worst ${String(Math.round(v.worst)).padStart(4)} ms  ${k}`);
    }
  }
  return { rows, frames: { median: pct(frames, 0.5), p90: pct(frames, 0.9), p99: pct(frames, 0.99) }, blockedMs: Math.round(total), top };
}

async function main() {
  const exe = findChrome();
  const browser = await puppeteer.launch({
    headless: HEADFUL ? false : 'new',
    executablePath: exe || undefined,
    protocolTimeout: 300000,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--window-size=1600,1000'],
    defaultViewport: { width: 1600, height: 1000 },
  });
  const out = { url: APP_URL, headful: HEADFUL, chrome: exe };

  try {
    const page = await newQaPage(browser, { photoreal: WANT_PHOTOREAL });
    const net = [];
    page.on('request', (r) => {
      const u = r.url();
      if (u.includes('/api/overpass') || u.includes('/api/tomtom')) {
        net.push({ url: u.replace(/^https?:\/\/[^/]+/, ''), start: Date.now(), body: (r.postData() || '').slice(0, 400) });
      }
    });
    page.on('response', (r) => {
      const hit = net.find((e) => r.url().endsWith(e.url) && !e.end);
      if (hit) {
        hit.end = Date.now();
        hit.ms = hit.end - hit.start;
        hit.status = r.status();
        hit.cache = r.headers()['x-overpass-cache'] || '';
      }
    });

    // Open straight onto the basemap under test, at the view under test. The
    // share link is the only seam that sets both without a click.
    const bootUrl = `${APP_URL}#lat=${CITY_A.lat}&lon=${CITY_A.lon}&alt=${CITY_A.alt}`
      + `&heading=${CITY_A.heading}&pitch=${CITY_A.pitch}&map=${MAP_STACK}`;
    console.log(`[perf] boot ${bootUrl} (chrome: ${exe || 'bundled'}, headful=${HEADFUL})`);
    await page.goto(bootUrl, { waitUntil: 'domcontentloaded', timeout: 120000 });
    for (let i = 0; i < 120; i++) {
      const ready = await page.evaluate(() => Boolean(window.__godsEyeView?.viewer && window.__godsEyeView?.dataManager));
      if (ready) break;
      await sleep(500);
    }
    await sleep(2000);
    await park(page, CITY_A);
    // Let the imagery/mesh under the parked camera settle BEFORE the layer is
    // switched on, so the recording is the layer's cost and not the basemap's.
    // The photorealistic stack has to DRAIN before a probe means anything, and
    // it is adopted on the first rest under 25 km — so wait on its own signal.
    let surf = null;
    for (let i = 0; i < 60; i++) {
      await sleep(1000);
      surf = await surfaceState(page);
      if (surf?.surface === 'photoreal' && surf.tilesLoaded) break;
      if (MAP_STACK !== 'photoreal' && i >= 8) break;
    }
    console.log(`[perf] surface=${surf?.surface} tileset=${surf?.tileset} drained=${surf?.tilesLoaded} globeShow=${surf?.globeShow} terrain=${surf?.terrain}`);
    out.surface = surf;

    const renderer = await page.evaluate(() => {
      const gl = window.__godsEyeView?.viewer?.scene?.context?._gl;
      const dbg = gl?.getExtension('WEBGL_debug_renderer_info');
      return {
        renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown',
        profile: window.__godsEyeView?.getPerfProfileDiagnostics?.()?.profile || '?',
      };
    });
    console.log(`[perf] renderer=${renderer.renderer} profile=${renderer.profile}`);
    out.renderer = renderer;

    await installRecorder(page);

    // ── 0. IDLE BASELINE ───────────────────────────────────────────────────
    // What a frame costs on this basemap with the layer OFF. Without it,
    // "30 fps with traffic on" is a number with nothing to be compared to —
    // and the governor parks the scene in requestRenderMode when no layer
    // holds it, so this also says whether the app repaints at all when idle.
    await resetRecorder(page);
    await sleep(8000);
    const recIdle = await readRecorder(page);
    const idleFrames = recIdle.frames.filter((f) => f > 0 && f < 5000);
    const idleBlocked = recIdle.longTasks.reduce((n, e) => n + e.ms, 0);
    console.log(`\n[perf] idle baseline (traffic OFF, 8 s): frames=${idleFrames.length} `
      + `median=${pct(idleFrames, 0.5)}ms p90=${pct(idleFrames, 0.9)}ms blocked=${Math.round(idleBlocked)}ms`);
    out.idle = { frames: idleFrames.length, median: pct(idleFrames, 0.5), p90: pct(idleFrames, 0.9), blockedMs: Math.round(idleBlocked) };

    // ── A. ACTIVATION ──────────────────────────────────────────────────────
    net.length = 0;
    await resetRecorder(page);
    const tA = Date.now();
    await page.evaluate(() => window.__godsEyeView.dataManager.setEnabled('traffic', true));
    const timelineA = [];
    let firstDotMs = null;
    for (let i = 0; i < WATCH_S * 2; i++) {
      await sleep(500);
      const stats = await trafficStats(page);
      timelineA.push({ at: Date.now() - tA, stats });
      if (firstDotMs === null && stats?.count > 0) firstDotMs = Date.now() - tA;
    }
    const recA = await readRecorder(page);
    out.activation = report(`A. ACTIVATION over ${CITY_A.name} (alt ${CITY_A.alt} m)`, recA, timelineA);
    console.log(`\n  first dot painted: ${firstDotMs === null ? 'NEVER' : `${firstDotMs} ms`} after the switch`);
    console.log('  network:');
    for (const e of net) {
      const cls = (decodeURIComponent(e.body).match(/highway"~"\^\(([^)]*)\)/) || [])[1];
      console.log(`    ${String(e.ms ?? '…').padStart(6)} ms  ${String(e.status ?? '-').padStart(3)}  ${String(e.cache || '').padEnd(6)}  ${e.url}${cls ? `  [${cls.split('|').length} classes]` : ''}`);
    }
    out.activationNet = net.map((e) => ({ url: e.url, ms: e.ms, status: e.status, cache: e.cache }));
    out.firstDotMs = firstDotMs;

    // ── A2. SMALL PAN ──────────────────────────────────────────────────────
    // A pan shorter than the band's lattice step has to cost NOTHING. The
    // fetch box is snapped, so the query is byte-identical and the layer's own
    // tile cache answers it — which is also the proof that two readers over
    // the same street now share one Overpass entry.
    net.length = 0;
    await park(page, { ...CITY_A, lat: CITY_A.lat + 0.002, lon: CITY_A.lon + 0.002 });
    for (let i = 0; i < 8; i++) await sleep(500);
    const panRequests = net.filter((e) => e.url.includes('/api/overpass'));
    console.log(`\n  small pan (~250 m, inside one lattice cell): ${panRequests.length} Overpass request(s)`
      + `${panRequests.length ? ` — ${panRequests.map((e) => `${e.ms} ms ${e.cache || ''}`).join(', ')}` : ' — the box did not move'}`);
    out.smallPanOverpass = panRequests.length;
    await park(page, CITY_A);
    for (let i = 0; i < 4; i++) await sleep(500);

    // ── B. PLACE CHANGE ────────────────────────────────────────────────────
    net.length = 0;
    await resetRecorder(page);
    const tB = Date.now();
    await park(page, CITY_B);
    const timelineB = [];
    let firstDotB = null;
    let clearedAt = null;
    for (let i = 0; i < WATCH_S * 2; i++) {
      await sleep(500);
      const stats = await trafficStats(page);
      timelineB.push({ at: Date.now() - tB, stats });
      if (clearedAt === null && stats?.count === 0) clearedAt = Date.now() - tB;
      if (firstDotB === null && clearedAt !== null && stats?.count > 0) firstDotB = Date.now() - tB;
    }
    const recB = await readRecorder(page);
    // What ONE ground probe costs on this machine, on this surface, with this
    // many pickable points in the scene. The seating loop spends twelve of
    // these every 250 ms until the box converges, so this number times twelve
    // is how much of each tick the main thread is not available for a frame.
    out.probeCost = await page.evaluate(() => {
      const scene = window.__godsEyeView?.viewer?.scene;
      if (!scene) return null;
      const d2r = Math.PI / 180;
      const samples = [];
      for (let i = 0; i < 16; i++) {
        const c = { longitude: (5.37 + i * 0.0005) * d2r, latitude: (43.297 + i * 0.0005) * d2r, height: 0 };
        const t = performance.now();
        try { scene.sampleHeight(c); } catch { /* mid-teardown */ }
        samples.push(+(performance.now() - t).toFixed(2));
      }
      samples.sort((a, b) => a - b);
      return {
        n: samples.length,
        medianMs: samples[Math.floor(samples.length / 2)],
        maxMs: samples[samples.length - 1],
        perPassMs: +(samples[Math.floor(samples.length / 2)] * 12).toFixed(1),
      };
    });
    console.log(`\n[perf] one scene.sampleHeight on this surface: median ${out.probeCost?.medianMs} ms, `
      + `max ${out.probeCost?.maxMs} ms → a 12-probe seating pass blocks ~${out.probeCost?.perPassMs} ms every 250 ms`);
    out.placeChange = report(`B. PLACE CHANGE ${CITY_A.name} → ${CITY_B.name}`, recB, timelineB);
    console.log(`\n  dots cleared at ${clearedAt ?? '-'} ms, repainted at ${firstDotB ?? 'NEVER'} ms`);
    console.log('  network:');
    for (const e of net) {
      const cls = (decodeURIComponent(e.body).match(/highway"~"\^\(([^)]*)\)/) || [])[1];
      console.log(`    ${String(e.ms ?? '…').padStart(6)} ms  ${String(e.status ?? '-').padStart(3)}  ${String(e.cache || '').padEnd(6)}  ${e.url}${cls ? `  [${cls.split('|').length} classes]` : ''}`);
    }
    out.placeChangeNet = net.map((e) => ({ url: e.url, ms: e.ms, status: e.status, cache: e.cache }));
    out.firstDotBMs = firstDotB;

    // Resource timing tells "the server was slow" apart from "the browser sat
    // on it". `stalled` is the gap between the fetch being issued and the
    // request actually going out — connection-limit queueing, or a renderer
    // too busy to dispatch. A layer that is fast on the wire and slow on
    // screen shows up here and nowhere else.
    out.resourceTiming = await page.evaluate(() => performance.getEntriesByType('resource')
      .filter((e) => /\/api\/(tomtom|overpass)/.test(e.name) || /3dtiles|googleapis|cesium\.com/.test(e.name))
      .map((e) => ({
        url: e.name.replace(/^https?:\/\//, '').slice(0, 60),
        stalled: +(e.requestStart ? e.requestStart - e.fetchStart : -1).toFixed(0),
        ttfb: +(e.responseStart ? e.responseStart - e.requestStart : -1).toFixed(0),
        total: +e.duration.toFixed(0),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 22));
    console.log('\n  resource timing (worst 22) — stalled / ttfb / total ms:');
    for (const r of out.resourceTiming) {
      console.log(`    ${String(r.stalled).padStart(7)}  ${String(r.ttfb).padStart(6)}  ${String(r.total).padStart(6)}   ${r.url}`);
    }

    if (OUT_JSON) {
      fs.writeFileSync(OUT_JSON, JSON.stringify(out, null, 2));
      console.log(`\n[perf] wrote ${OUT_JSON}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
