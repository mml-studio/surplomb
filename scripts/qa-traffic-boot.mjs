#!/usr/bin/env node
/**
 * qa-traffic-boot.mjs — what a reader pays when the traffic layer is ON before
 * they arrive.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT THE SAME QUESTION AS `qa-traffic-floor`.
 * Every traffic harness so far switches the layer on over a scene that has
 * already been built: camera parked, basemap chosen, mesh drained. The boot is
 * a different path and it crosses two things the parked case never does.
 *
 *   1. TWO BANDS IN FOUR SECONDS. `flyToDefaultCity` starts at 25 km — the
 *      `metro` band, arterials only, a 0.30° box — and lands at 600 m, which
 *      is `street`: the full graph over a 0.05° box. Those are two unrelated
 *      datasets, and a layer that is already on pays for BOTH.
 *   2. THE SURFACE CHANGES UNDER THE DOTS. The app opens on `ign-ortho` and
 *      buys the photorealistic mesh on the reader's FIRST TOUCH of the canvas
 *      (`photorealAdoption.js`). Every ground reading the layer took against
 *      the globe is void at that instant: `seatRoadFloors` clears its cells
 *      and re-probes the whole network, with dots already on screen. Nobody
 *      has ever timed that.
 *
 * WHAT IT DOES NOT DO. It does not change the product. The layer is switched
 * on the way a RETURNING reader has it on — by seeding the app's own durable
 * layer-state key before any page script runs — so the boot under test is the
 * real one, with the real default flight. A `#l=t` hash would have been
 * simpler and would have suppressed `flyToDefaultCity`, which is the subject.
 *
 * THE GESTURE IS A REAL ONE. Adoption is armed by the boot flight and tripped
 * by the reader's hand; a synthetic `setView` never trips it, and the harness
 * would then measure a swap that never happened. So the touch here is mouse
 * events on the canvas, and the run FAILS LOUDLY rather than quietly reporting
 * a globe-only number if the surface does not flip.
 *
 *   node scripts/qa-traffic-boot.mjs --url http://localhost:4421
 *
 * Prints a table. Asserts four things; exits non-zero if any fails.
 */

import puppeteer from 'puppeteer';
import fs from 'node:fs';
import { newQaPage } from './lib/qa-first-run.mjs';
import { LAYER_STATE_STORAGE_KEY, serializeStoredLayerState } from '../src/data/layerState.js';

const argv = process.argv.slice(2);
const getOpt = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const APP_URL = getOpt('--url', 'http://localhost:4421');
const HEADFUL = argv.includes('--headful');
/**
 * Boot the same path with the layer OFF.
 *
 * Without this the run reports a long-task total and silently credits all of
 * it to traffic, when a photorealistic mesh arriving mid-gesture produces long
 * tasks of its own whether or not a single car is on screen. The number that
 * decides whether this layer can be on by default is the DELTA, and a delta
 * needs two runs.
 */
const CONTROL = argv.includes('--control');
const OUT_JSON = getOpt('--json', null);

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
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const OFF = '\x1b[0m';

let failures = 0;
const record = (name, ok, detail) => {
  if (!ok) failures += 1;
  console.log(`  [${ok ? `${GREEN}PASS${OFF}` : `${RED}FAIL${OFF}`}] ${name}  — ${detail}`);
};

/** Everything the boot path is judged on, read out of the live layer. */
async function readState(page) {
  return page.evaluate(() => {
    const gev = window.__godsEyeView;
    const entry = gev?.dataManager?.layers?.get('traffic');
    const stats = entry?.module?.getStats?.() || null;
    const carto = gev?.viewer?.camera?.positionCartographic;
    return {
      t: performance.now(),
      altitudeM: carto ? carto.height : null,
      enabled: Boolean(entry?.enabled),
      stats,
      longTasks: window.__qaLongTasks || { count: 0, totalMs: 0, worstMs: 0 },
      basemap: gev?.getPhotorealDiagnostics?.()?.stack
        || window.__godsEyeView?.mapSource || null,
    };
  });
}

(async () => {
  const exe = findChrome();
  const browser = await puppeteer.launch({
    headless: HEADFUL ? false : 'new',
    executablePath: exe || undefined,
    protocolTimeout: 300000,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  const timeline = [];
  let overpass = [];
  try {
    // `{ photoreal: true }` costs one Cesium ion root tile per run and is the
    // whole point: the surface swap under test cannot happen without it.
    const page = await newQaPage(browser, { photoreal: true });

    // The layer is on BEFORE the first byte of app code runs — the state a
    // returning reader carries, and the state a default-on layer would create.
    // Serialised by the app's OWN codec, not by hand: the durable format is
    // `{v,l,o}` and a hand-written `{version,enabledLayerIds}` parses to null,
    // which boots with the layer off and measures nothing.
    const seeded = serializeStoredLayerState({ enabledLayerIds: CONTROL ? [] : ['traffic'] });
    await page.evaluateOnNewDocument((key, value) => {
      try {
        window.localStorage.setItem(key, value);
      } catch { /* storage blocked — the enabled assertion below will say so */ }
      // Long tasks are the honest measure of "the page is not answering".
      // A rAF sampler cannot see them: it is itself what they block.
      window.__qaLongTasks = { count: 0, totalMs: 0, worstMs: 0 };
      try {
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            window.__qaLongTasks.count += 1;
            window.__qaLongTasks.totalMs += e.duration;
            window.__qaLongTasks.worstMs = Math.max(window.__qaLongTasks.worstMs, e.duration);
          }
        }).observe({ entryTypes: ['longtask'] });
      } catch { /* not every build ships the longtask entry type */ }
    }, LAYER_STATE_STORAGE_KEY, seeded);

    overpass = [];
    page.on('request', (req) => {
      const u = req.url();
      if (u.includes('/api/overpass')) {
        const body = decodeURIComponent(req.postData() || '');
        const m = body.match(/\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/);
        const cls = body.match(/highway"~"\^\(([^)]*)\)/);
        overpass.push({
          at: Date.now(),
          box: m ? `${m[1]},${m[2]},${m[3]},${m[4]}` : '?',
          span: m ? +(Number(m[3]) - Number(m[1])).toFixed(4) : null,
          classes: cls ? cls[1] : '?',
        });
      }
    });

    console.log(`\nTraffic boot path — ${APP_URL}`);
    console.log(CONTROL
      ? '  CONTROL RUN — layer OFF. Everything below is what the boot costs anyway.\n'
      : '  layer seeded ON in durable state; bare URL, so the default flight runs\n');

    const t0 = Date.now();
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });

    // ── Phase A: the flight, with the layer already on ──────────────────────
    let firstDotMs = null;
    let settleMs = null;
    let prevAlt = null;
    let stable = 0;
    let last = null;
    for (let i = 0; i < 180; i++) {
      await sleep(400);
      const s = await readState(page).catch(() => null);
      if (!s) continue;
      last = s;
      timeline.push({ ms: Date.now() - t0, alt: s.altitudeM, count: s.stats?.count ?? 0 });
      if (firstDotMs === null && (s.stats?.count ?? 0) > 0) firstDotMs = Date.now() - t0;
      if (s.altitudeM !== null && prevAlt !== null && Math.abs(s.altitudeM - prevAlt) < 1) {
        stable += 1;
        if (stable >= 3 && s.altitudeM < 5000 && settleMs === null) settleMs = Date.now() - t0;
      } else {
        stable = 0;
      }
      prevAlt = s.altitudeM;
      if (settleMs !== null && firstDotMs !== null && (Date.now() - t0) > settleMs + 6000) break;
    }

    const arrival = await readState(page);
    console.log('(i) Arrival — layer on through the whole flight');
    record(CONTROL ? 'the control really has the layer off' : 'the layer really was on before the first byte',
      CONTROL ? !arrival.enabled : arrival.enabled,
      `enabled=${arrival.enabled}`);
    if (CONTROL) {
      record('control: nothing to paint', (arrival.stats?.count ?? 0) === 0,
        `${arrival.stats?.count ?? 0} dots, camera parked ${settleMs ?? '—'} ms`);
    } else {
      record('a car is on screen before the flight ends', firstDotMs !== null && settleMs !== null
        && firstDotMs <= settleMs + 2000,
        `first dot ${firstDotMs ?? '—'} ms, camera parked ${settleMs ?? '—'} ms`);
    }
    console.log(`  · ${arrival.stats?.count ?? 0} dots, mode ${arrival.stats?.mode}, `
      + `surface ${arrival.stats?.floorSurface}, seated ${arrival.stats?.floorSeated}/`
      + `${(arrival.stats?.floorSeated ?? 0) + (arrival.stats?.floorWaiting ?? 0)}`);
    console.log(`  · seating held the thread ${Math.round(arrival.stats?.floorPassTotalMs ?? 0)} ms `
      + `over ${arrival.stats?.floorPasses ?? 0} passes, worst ${arrival.stats?.floorPassWorstMs ?? 0} ms`);
    console.log(`  · long tasks ${arrival.longTasks.count}, `
      + `${Math.round(arrival.longTasks.totalMs)} ms total, worst ${Math.round(arrival.longTasks.worstMs)} ms`);

    console.log('\n  Overpass during the flight:');
    for (const r of overpass) {
      console.log(`    +${String(r.at - t0).padStart(6)} ms  span ${String(r.span).padEnd(7)} `
        + `${r.box.padEnd(30)} [${r.classes.slice(0, 44)}]`);
    }
    const metroRequests = overpass.filter((r) => r.span !== null && r.span > 0.1);
    record('the descent does not pay for a band nobody reads',
      CONTROL || metroRequests.length === 0,
      metroRequests.length === 0
        ? 'no 0.30° metro box was fetched during the descent'
        : `${metroRequests.length} metro-band request(s) during a 4 s descent`);

    // ── Phase B: the reader's first touch swaps the surface ─────────────────
    console.log('\n(ii) First touch — the photorealistic mesh arrives under the dots');
    const beforeSwap = await readState(page);
    const box = await page.evaluate(() => {
      const c = window.__godsEyeView?.viewer?.scene?.canvas;
      if (!c) return null;
      const r = c.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (box) {
      // A real hand: press, drag a little, release. `setView` never arms this.
      await page.mouse.move(box.x, box.y);
      await page.mouse.down();
      for (let i = 1; i <= 6; i++) {
        await page.mouse.move(box.x + i * 6, box.y + i * 3);
        await sleep(60);
      }
      await page.mouse.up();
    }

    let swapMs = null;
    let convergedMs = null;
    let worstAfter = 0;
    const tSwap = Date.now();
    for (let i = 0; i < 150; i++) {
      await sleep(400);
      const s = await readState(page).catch(() => null);
      if (!s) continue;
      last = s;
      if (CONTROL) { if (Date.now() - tSwap > 25000) break; continue; }
      if (!s.stats) continue;
      if (swapMs === null && s.stats.floorSurface === 'photoreal') swapMs = Date.now() - tSwap;
      if (CONTROL && Date.now() - tSwap > 25000) break;
      if (swapMs !== null) {
        worstAfter = Math.max(worstAfter, s.stats.floorPassWorstMs ?? 0);
        if (convergedMs === null && s.stats.floorWaiting === 0 && s.stats.floorArmed
          && (s.stats.floorSeated ?? 0) > 0) {
          convergedMs = Date.now() - tSwap;
          break;
        }
      }
    }

    const afterSwap = await readState(page);
    record('the touch actually bought the mesh', CONTROL || swapMs !== null,
      swapMs !== null
        ? `surface flipped to photoreal ${swapMs} ms after the touch`
        : `surface stayed ${afterSwap.stats?.floorSurface} — the swap under test never happened`);
    record('and the dots re-seat on it without the reader waiting',
      CONTROL || convergedMs !== null,
      convergedMs !== null
        ? `${afterSwap.stats.floorSeated} roads re-seated ${convergedMs} ms after the touch, `
          + `${afterSwap.stats.floorWaiting} waiting`
        : `still ${afterSwap.stats?.floorWaiting} roads waiting after 60 s`);
    console.log(`  · worst seating pass after the swap ${worstAfter} ms `
      + `(before: ${beforeSwap.stats?.floorPassWorstMs ?? 0} ms)`);
    console.log(`  · long tasks now ${afterSwap.longTasks.count}, `
      + `${Math.round(afterSwap.longTasks.totalMs)} ms total, `
      + `worst ${Math.round(afterSwap.longTasks.worstMs)} ms`);
    console.log(`  · ${afterSwap.stats?.count ?? 0} dots, ${afterSwap.stats?.floorCells ?? 0} cells probed, `
      + `box floor ${afterSwap.stats?.floorBoxM} m`);

    if (OUT_JSON) {
      fs.writeFileSync(OUT_JSON, JSON.stringify({
        url: APP_URL, firstDotMs, settleMs, swapMs, convergedMs,
        overpass, timeline, arrival: arrival.stats, afterSwap: afterSwap.stats,
      }, null, 2));
      console.log(`\n  wrote ${OUT_JSON}`);
    }
    void last;
    await page.close();
  } finally {
    await browser.close();
  }

  console.log(`\n${failures === 0 ? GREEN : RED}${5 - failures}/5 controls passed${OFF}\n`);
  process.exit(failures === 0 ? 0 : 1);
})();
