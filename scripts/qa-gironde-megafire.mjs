#!/usr/bin/env node
/**
 * Deterministic browser proof for « Grands incendies » — the Gironde fire of
 * July 2026 (`gironde-megafire-2026`), replayed as three rings of light.
 *
 * The pack and the rings are shipped files, guarded offline by
 * `megafirePack.test.mjs` and `megafireBands.test.mjs`; the clock by
 * `megafireClock.test.mjs`. What no unit test can reach is whether the replay
 * actually arrives on a globe, so this harness proves what only a live page can:
 *
 *   i.   « Incendies » is two MODE tiles in the key: a DOM click on
 *        « Grands incendies » lights the replay and puts « Détections
 *        récentes » out, moves the preset to Dusk and the basemap to Satellite
 *        — the row followers — and the pack loads
 *   ii.  the replay opens on the FINISHED fire: three band fills, each ONE
 *        colour (the Cesium rectangle-classification trap), three rings, the
 *        dashed EFFIS edge, every detection
 *   iii. the bar under the map is in the DOM with three stops, and a DOM click
 *        on the first parks the replay at the end of that stage: one ring, and
 *        exactly the detections acquired by then — CAUSAL
 *   iv.  the main button plays: the render governor is held while the tape
 *        runs, the rings come in order, the detection count only climbs, and
 *        at the end every hold is handed back (the last ring's flare included)
 *   v.   the arrows step from stop to stop
 *   vi.  « Temps en 3D »: a DOM click on the key's segment lifts the three
 *        stages into levels in the air — the ground zones go, each detection
 *        rides at its level's height, the rulers belong to the top level shown,
 *        the camera stands back to frame the whole stack — a stop hides the
 *        levels after it, and « Au sol » puts everything back down
 *   vii. switching the layer off takes the bar away, hides everything it drew,
 *        and gives the preset back
 *
 * Screenshots are OPT-IN (`--shots`), under the gitignored
 * `qa-shots/gironde-megafire/`: on this app `page.screenshot()` can hang for
 * minutes, so a proof must never depend on one.
 *
 * Run: node scripts/qa-gironde-megafire.mjs --url http://localhost:4173
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { newQaPage } from './lib/qa-first-run.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const SHOTS_DIR = path.join(REPO_ROOT, 'qa-shots', 'gironde-megafire');
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const APP_URL = option('--url', process.env.QA_BASE_URL || 'http://localhost:4173');
const HEADFUL = args.includes('--headful');
const SHOTS = args.includes('--shots');

const LAYER_ID = 'gironde-megafire-2026';
const LIVE_ID = 'local-firms';
const PACK_DIR = path.join(REPO_ROOT, 'src', 'data', 'local_data', 'gironde_megafire_2026');
const HOTSPOTS = JSON.parse(fs.readFileSync(path.join(PACK_DIR, 'hotspots.json'), 'utf8'));
const BANDS = JSON.parse(fs.readFileSync(path.join(PACK_DIR, 'bands.json'), 'utf8'));
const EPOCH = Date.parse(HOTSPOTS.epoch);
/** Detections acquired at or before an instant — what a causal replay shows. */
const reachedBy = (iso) => HOTSPOTS.rows.filter((row) => EPOCH + row[2] * 60_000 <= Date.parse(iso)).length;

const chromeCandidates = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  (() => { try { return puppeteer.executablePath(); } catch { return null; } })(),
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
].filter(Boolean);
const chrome = chromeCandidates.find((candidate) => {
  try { return fs.existsSync(candidate); } catch { return false; }
});

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/** Force this many scene renders: the replay advances ON a frame. */
async function pump(page, frames = 8, gapMs = 80) {
  for (let frame = 0; frame < frames; frame += 1) {
    await page.evaluate(() => {
      try { window.__godsEyeView?.viewer?.scene?.render(); } catch { /* stalled context */ }
    });
    await sleep(gapMs);
  }
}

/**
 * Poll a predicate with `page.evaluate`, never `page.waitForFunction`: under
 * SwiftShader the rAF polling never ticks (the finding `qa-fr-hydro.mjs`
 * records). `render` forces that many frames per try, for waits on playback.
 */
async function pollUntil(page, predicate, { tries = 120, gapMs = 500, arg = null, render = 0 } = {}) {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    const done = await page.evaluate(predicate, arg).catch(() => false);
    if (done) return true;
    if (render) await pump(page, render, 0);
    await sleep(gapMs);
  }
  return false;
}

const failures = [];
function check(label, condition, detail = '') {
  const ok = Boolean(condition);
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}${detail && !ok ? ` — ${detail}` : ''}`);
  return ok;
}

async function shoot(page, name) {
  if (!SHOTS) return;
  try {
    fs.mkdirSync(SHOTS_DIR, { recursive: true });
    await page.evaluate(() => { try { window.__godsEyeView?.viewer?.scene?.render(); } catch { /* stalled */ } });
    await page.screenshot({ path: path.join(SHOTS_DIR, name) });
  } catch (error) {
    console.log(`  · screenshot ${name} unavailable (${String(error?.message || error).split('\n')[0]})`);
  }
}

/**
 * The replay's state, read off the live scene. Ground primitives are named by
 * their INSTANCE ids (`<layer>:<role>:…`), which survive minification where a
 * constructor name reads `$o`.
 */
function sceneProbe(page) {
  return page.evaluate((id) => {
    const gev = window.__godsEyeView;
    const module = gev.dataManager.layers.get(id)?.module;
    if (!module) return { missing: true };
    const scene = gev.viewer.scene;
    const ground = [];
    for (let i = 0; i < scene.groundPrimitives.length; i += 1) {
      const primitive = scene.groundPrimitives.get(i);
      const instances = primitive?.geometryInstances;
      const list = instances ? (Array.isArray(instances) ? instances : [instances]) : [];
      const firstId = String(list[0]?.id ?? '');
      if (!firstId.startsWith(`${id}:`)) continue;
      const colors = new Set();
      for (const instance of list) {
        const value = instance?.attributes?.color?.value;
        if (value) colors.add([...value].join(','));
      }
      ground.push({
        role: firstId.split(':')[1],
        band: firstId.split(':')[2],
        instances: list.length,
        colors: colors.size,
        show: primitive.show !== false,
      });
    }
    let points = 0;
    let pointsShown = 0;
    let collectionShown = null;
    // Heights of the shown detections, to the kilometre — 0 on the ground.
    const pointHeights = new Set();
    // « Temps en 3D »: primitives in the air say their role on a symbol.
    const air = [];
    const role = Symbol.for('surplomb.megafire.air');
    const ellipsoid = scene.globe.ellipsoid;
    for (let i = 0; i < scene.primitives.length; i += 1) {
      const primitive = scene.primitives.get(i);
      if (primitive?.[role]) {
        const [kind, band] = String(primitive[role]).split(':');
        air.push({ role: kind, band, show: primitive.show !== false });
        continue;
      }
      if (typeof primitive?.get !== 'function' || primitive.length < 5000) continue;
      if (typeof primitive.get(0)?.pixelSize !== 'number') continue;
      points = primitive.length;
      collectionShown = primitive.show !== false;
      for (let p = 0; p < primitive.length; p += 1) {
        const point = primitive.get(p);
        if (!point.show) continue;
        pointsShown += 1;
        if (p % 25 === 0) pointHeights.add(Math.round(ellipsoid.cartesianToCartographic(point.position).height / 1000));
      }
    }
    const bar = document.getElementById('megafire-timeline');
    return {
      stats: module.getStats(),
      ground,
      points,
      pointsShown,
      collectionShown,
      pointHeights: [...pointHeights].sort((a, b) => a - b),
      air,
      bar: bar ? {
        stops: bar.querySelectorAll('.megafire-timeline-stop').length,
        playing: bar.getAttribute('data-playing'),
        ended: bar.getAttribute('data-ended'),
        heading: bar.querySelector('.megafire-timeline-heading')?.textContent || '',
      } : null,
      style: document.documentElement.dataset.gevStyle || null,
      stack: gev.mapStackController?.getActiveId?.() ?? null,
      satelliteAvailable: gev.mapStackController?.isStackAvailable?.('ign-ortho') ?? null,
      governor: gev.getRenderGovernorDiagnostics?.() || null,
      liveOn: gev.dataManager.isEnabled('local-firms'),
      replayOn: gev.dataManager.isEnabled(id),
    };
  }, LAYER_ID);
}

const shown = (probe, role) => probe.ground.filter((entry) => entry.role === role && entry.show);
const aloft = (probe, role) => probe.air.filter((entry) => entry.role === role && entry.show);
const held = (probe) => (probe.governor?.holds || []).some((hold) => String(hold).startsWith(LAYER_ID));

/** Click a node by selector, the DOM way (a Puppeteer mouse click can hang here). */
const domClick = (page, selector) => page.evaluate((sel) => {
  const node = document.querySelector(sel);
  if (!node) return false;
  node.click();
  return true;
}, selector);

async function main() {
  console.log(`Grands incendies (Gironde) — preuve navigateur sur ${APP_URL}`);
  if (!chrome) {
    console.error('No Chrome/Chromium found. Set PUPPETEER_EXECUTABLE_PATH.');
    process.exit(2);
  }
  const browser = await puppeteer.launch({
    headless: HEADFUL ? false : 'new',
    executablePath: chrome,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--window-size=1600,1000'],
    defaultViewport: { width: 1600, height: 1000 },
  });
  const page = await newQaPage(browser);
  page.on('pageerror', (error) => console.log(`  · page error: ${error.message}`));

  try {
    const base = APP_URL.replace(/\/$/, '');
    await page.goto(`${base}/globe?welcome=0&photoreal=0#lat=44.6&lon=-1.0&alt=90000&pitch=-60&sc=0`,
      { waitUntil: 'domcontentloaded', timeout: 90_000 });
    const booted = await pollUntil(page,
      () => Boolean(window.__godsEyeView?.viewer && window.__godsEyeView?.dataManager),
      { tries: 120, gapMs: 1000 });
    if (!booted) throw new Error('the app never created window.__godsEyeView');
    await sleep(1500);

    console.log('\ni. « Incendies » : deux modes, un seul allumé');
    // Lit by code, so the row and its tiles are in the key without a FIRMS key.
    await page.evaluate((id) => window.__godsEyeView.dataManager.setEnabled(id, true, { origin: 'programmatic' }), LAYER_ID);
    const tiles = await pollUntil(page,
      () => document.querySelectorAll('#map-legend-items .map-legend-tile').length === 2,
      { tries: 60, gapMs: 250 });
    check('the key shows the row’s two tiles', tiles);
    // « Détections récentes » by hand: the replay goes out.
    await domClick(page, `#map-legend-items .map-legend-tile[data-tile-layer="${LIVE_ID}"]`);
    await pollUntil(page, (id) => !window.__godsEyeView.dataManager.isEnabled(id), { tries: 40, gapMs: 250, arg: LAYER_ID });
    let probe = await sceneProbe(page);
    check('pressing « Détections récentes » puts the replay out', !probe.replayOn);
    // Let the live detections land (or fail, on a build with no FIRMS key):
    // the next press must find their tile settled either way.
    await pollUntil(page, (id) => window.__godsEyeView.dataManager.getLayerLifecycleState(id)?.lifecycleState !== 'enabling',
      { tries: 40, gapMs: 250, arg: LIVE_ID });
    // « Grands incendies » by hand: the replay comes back, the live mode goes.
    const pressed = await domClick(page, `#map-legend-items .map-legend-tile[data-tile-layer="${LAYER_ID}"]`);
    check('the « Grands incendies » tile is still in the key to press', pressed);
    const loaded = await pollUntil(page,
      (id) => window.__godsEyeView.dataManager.isEnabled(id)
        && window.__godsEyeView.dataManager.layers.get(id)?.module?.getStats?.()?.status === 'ok',
      { tries: 90, gapMs: 500, arg: LAYER_ID });
    if (!loaded) throw new Error('the replay never came back on');
    await sleep(2800); // the arrival flight
    await pump(page, 12, 120);
    probe = await sceneProbe(page);
    check('pressing « Grands incendies » lights the replay…', probe.replayOn);
    check('…and puts « Détections récentes » out (exclusive tiles)', !probe.liveOn);
    check('the preset follows the tile to Dusk', probe.style === 'dusk', `style=${probe.style}`);
    if (probe.satelliteAvailable) check('the basemap follows the tile to Satellite', probe.stack === 'ign-ortho', `stack=${probe.stack}`);
    else console.log('  · Satellite unavailable on this build — basemap lock not asserted');
    const camera = await page.evaluate(() => {
      const c = window.__godsEyeView.viewer.camera;
      return { pitch: c.pitch * 180 / Math.PI, heading: c.heading * 180 / Math.PI, height: c.positionCartographic.height };
    });
    check('the camera arrives low and oblique over the scar',
      camera.pitch > -40 && camera.pitch < -28 && Math.abs(camera.heading - 16) < 3 && camera.height < 60_000,
      JSON.stringify(camera));
    await shoot(page, '01-finished-fire.png');

    console.log('\nii. le feu terminé : trois anneaux, toutes les détections');
    await pollUntil(page, (id) => {
      const scene = window.__godsEyeView.viewer.scene;
      let ready = 0;
      for (let i = 0; i < scene.groundPrimitives.length; i += 1) {
        const p = scene.groundPrimitives.get(i);
        const list = p?.geometryInstances;
        const first = Array.isArray(list) ? list[0] : list;
        if (String(first?.id ?? '').startsWith(`${id}:`) && p.ready) ready += 1;
      }
      return ready >= 9;
    }, { tries: 60, gapMs: 300, arg: LAYER_ID, render: 2 });
    probe = await sceneProbe(page);
    const fills = probe.ground.filter((entry) => entry.role === 'fill');
    check('three band fills, one per band', fills.length === BANDS.bands.length, `fills=${fills.length}`);
    check('each fill carries exactly ONE colour', fills.every((entry) => entry.colors === 1),
      JSON.stringify(fills.map((entry) => entry.colors)));
    check('three rings drawn (core + halo per band)', shown(probe, 'ring').length === 3 && shown(probe, 'halo').length === 3,
      `ring=${shown(probe, 'ring').length} halo=${shown(probe, 'halo').length}`);
    check('the dashed EFFIS edge is drawn on the finished fire', shown(probe, 'effis').length === 1);
    check('every detection is shown', probe.pointsShown === HOTSPOTS.rows.length,
      `${probe.pointsShown}/${HOTSPOTS.rows.length}`);
    check('the stats agree', probe.stats.count === HOTSPOTS.rows.length && probe.stats.bandsShown === 3);

    console.log('\niii. la frise : trois étapes, un clic = la fin d’une étape');
    check('the bar is mounted with three stops', probe.bar?.stops === 3, JSON.stringify(probe.bar));
    check('the bar says the replay has ended', probe.bar?.ended === 'true');
    await domClick(page, '#megafire-timeline .megafire-timeline-stop[data-index="0"]');
    await pump(page, 6, 80);
    probe = await sceneProbe(page);
    const firstEnd = reachedBy(BANDS.bands[0].to);
    check('one ring after the first stop', shown(probe, 'ring').length === 1 && shown(probe, 'fill').length === 1,
      `ring=${shown(probe, 'ring').length}`);
    check('exactly the detections acquired by the end of that stage (causal)', probe.pointsShown === firstEnd,
      `${probe.pointsShown} vs ${firstEnd}`);
    check('no EFFIS edge before the end', shown(probe, 'effis').length === 0);
    await shoot(page, '02-first-stage.png');

    console.log('\niv. lecture : le rendu est tenu, les anneaux arrivent dans l’ordre');
    await domClick(page, '#megafire-timeline .megafire-timeline-main');
    await pump(page, 4, 60);
    probe = await sceneProbe(page);
    check('the main button plays', probe.stats.playing === true && probe.bar?.playing === 'true');
    check('the render governor is held while the tape runs', held(probe), JSON.stringify(probe.governor?.holds));
    let previousCount = -1;
    let previousRings = 0;
    let monotonic = true;
    let ordered = true;
    for (let i = 0; i < 80; i += 1) {
      await pump(page, 3, 40);
      const step = await sceneProbe(page);
      if (step.pointsShown < previousCount) monotonic = false;
      if (step.stats.bandsShown < previousRings) ordered = false;
      previousCount = step.pointsShown;
      previousRings = step.stats.bandsShown;
      if (!step.stats.playing) break;
    }
    check('the detection count only climbs', monotonic);
    check('the rings arrive in order and none leaves', ordered);
    const ended = await pollUntil(page, (id) => window.__godsEyeView.dataManager.layers.get(id)?.module?.getStats?.()?.atEnd === true,
      { tries: 80, gapMs: 250, arg: LAYER_ID, render: 4 });
    check('playback stops on the finished fire', ended);
    await pump(page, 30, 60); // the last ring's flare
    await sleep(1600);
    await pump(page, 6, 60);
    probe = await sceneProbe(page);
    check('every hold is handed back at the end, flare included', !held(probe), JSON.stringify(probe.governor?.holds));
    check('the finished fire again: three rings, every detection',
      shown(probe, 'ring').length === 3 && probe.pointsShown === HOTSPOTS.rows.length);

    console.log('\nv. les flèches passent d’une étape à l’autre');
    await domClick(page, '#megafire-timeline [data-command="prev"]');
    await pump(page, 4, 60);
    probe = await sceneProbe(page);
    check('« previous » from the end holds the second stage', probe.stats.bandsShown === 2, `bands=${probe.stats.bandsShown}`);
    await domClick(page, '#megafire-timeline [data-command="prev"]');
    await pump(page, 4, 60);
    probe = await sceneProbe(page);
    check('« previous » again holds the first', probe.stats.bandsShown === 1);
    await domClick(page, '#megafire-timeline [data-command="next"]');
    await pump(page, 4, 60);
    probe = await sceneProbe(page);
    check('« next » goes forward one stage', probe.stats.bandsShown === 2);

    console.log('\nvi. « Temps en 3D » : les étapes en étages');
    await domClick(page, '#megafire-timeline .megafire-timeline-stop[data-index="2"]');
    await pump(page, 4, 60);
    const lifted = await domClick(page, '#map-legend-items .map-legend-segment[data-toggle-value="strata"]');
    check('the key offers « Temps en 3D »', lifted);
    await pollUntil(page, (id) => window.__godsEyeView.dataManager.layers.get(id)?.module?.getStats?.()?.view === 'strata',
      { tries: 20, gapMs: 250, arg: LAYER_ID });
    await sleep(2200); // the flight to the stack
    await pump(page, 12, 120);
    probe = await sceneProbe(page);
    const pressedStrata = await page.evaluate(() => document.querySelector(
      '#map-legend-items .map-legend-segment[data-toggle-value="strata"]',
    )?.getAttribute('aria-pressed'));
    check('the segment reads pressed', pressedStrata === 'true', String(pressedStrata));
    check('three levels in the air, outline and glow each',
      aloft(probe, 'stratum-fill').length === 3 && aloft(probe, 'stratum-ring').length === 3
        && aloft(probe, 'stratum-glow').length === 3,
      JSON.stringify(probe.air.filter((entry) => entry.show)));
    check('the ground zones and rings are gone', shown(probe, 'fill').length === 0 && shown(probe, 'ring').length === 0);
    check('the rulers are the top level’s: one set of verticals, one axis, one ground outline',
      aloft(probe, 'guide').length === 1 && aloft(probe, 'axis').length === 1 && shown(probe, 'ghost').length === 1
        && aloft(probe, 'guide')[0].band === BANDS.bands.at(-1).id,
      `guide=${aloft(probe, 'guide').length} axis=${aloft(probe, 'axis').length} ghost=${shown(probe, 'ghost').length}`);
    check('each detection rides on the level of its days (6, 12, 18 km)',
      JSON.stringify(probe.pointHeights) === '[6,12,18]', JSON.stringify(probe.pointHeights));
    check('every detection is still shown', probe.pointsShown === HOTSPOTS.rows.length);
    const stackCamera = await page.evaluate(() => {
      const c = window.__godsEyeView.viewer.camera;
      return { pitch: c.pitch * 180 / Math.PI, heading: c.heading * 180 / Math.PI, height: c.positionCartographic.height };
    });
    check('the camera stands back, lower, to frame the whole stack',
      stackCamera.pitch > -30 && stackCamera.pitch < -18 && Math.abs(stackCamera.heading - 16) < 3
        && stackCamera.height > 20_000 && stackCamera.height < 120_000,
      JSON.stringify(stackCamera));
    await shoot(page, '03-time-in-3d.png');
    await domClick(page, '#megafire-timeline .megafire-timeline-stop[data-index="0"]');
    await pump(page, 6, 80);
    probe = await sceneProbe(page);
    check('a stop in the air hides the levels after it', aloft(probe, 'stratum-fill').length === 1
      && aloft(probe, 'stratum-fill')[0].band === BANDS.bands[0].id);
    check('…and keeps the replay causal', probe.pointsShown === firstEnd, `${probe.pointsShown} vs ${firstEnd}`);
    check('…and its rulers are the first level’s', aloft(probe, 'guide').length === 1
      && aloft(probe, 'guide')[0].band === BANDS.bands[0].id);
    await domClick(page, '#megafire-timeline .megafire-timeline-stop[data-index="2"]');
    await domClick(page, '#map-legend-items .map-legend-segment[data-toggle-value="ground"]');
    await pollUntil(page, (id) => window.__godsEyeView.dataManager.layers.get(id)?.module?.getStats?.()?.view === 'ground',
      { tries: 20, gapMs: 250, arg: LAYER_ID });
    await pump(page, 6, 80);
    probe = await sceneProbe(page);
    check('« Au sol » puts the three zones back down', shown(probe, 'fill').length === 3 && shown(probe, 'ring').length === 3);
    check('…and nothing stays in the air', probe.air.every((entry) => !entry.show) && shown(probe, 'ghost').length === 0);
    check('…and every detection is back on the ground', JSON.stringify(probe.pointHeights) === '[0]',
      JSON.stringify(probe.pointHeights));

    console.log('\nvii. éteindre retire tout');
    await domClick(page, `#map-legend-items .map-legend-tile[data-tile-layer="${LAYER_ID}"]`);
    await pollUntil(page, (id) => !window.__godsEyeView.dataManager.isEnabled(id), { tries: 40, gapMs: 250, arg: LAYER_ID });
    await pump(page, 4, 60);
    probe = await sceneProbe(page);
    check('the bar is gone', probe.bar === null);
    check('nothing this layer drew is still shown',
      probe.ground.every((entry) => !entry.show) && probe.air.every((entry) => !entry.show) && probe.collectionShown === false);
    check('the preset goes back to Normal', probe.style === 'normal', `style=${probe.style}`);
  } catch (error) {
    failures.push(`harness: ${error?.message || error}`);
    console.log(`  ✗ ${error?.stack || error}`);
  } finally {
    await browser.close();
  }

  console.log(`\n${failures.length ? `${failures.length} échec(s)` : 'tout est vert'}`);
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(failures.length ? 1 : 0);
}

main();
