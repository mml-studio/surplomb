#!/usr/bin/env node
/**
 * Browser proof for the power-grid layer's NATIONAL pack
 * (`src/data/local_data/power_grid_fr/national.json`, drawn by `powerGrid.js`).
 *
 * The operator's request of 2026-09-19 was two sentences — the grid "met
 * beaucoup de temps à s'afficher", and it should show "même avec une vue bien
 * dézoomée et nationale". This harness measures both on the real app:
 *
 *   i.   a NATIONAL camera (2 500 km over France) draws the grid at all — the
 *        pack loads, the 400/225 kV bands are built and shown, the 63/90 kV
 *        mesh is NOT built (a camera that never descends never pays for it),
 *        and the row is green rather than asking for a zoom
 *   ii.  a REGIONAL camera (300 km) brings the mesh and the ≥ 180 kV yards in
 *   iii. a LOCAL camera (26 km over Saclay) hands over: the viewport answer
 *        is drawn, the national batches hide EXACTLY the ways it brought, and
 *        the national yard dots stand down for the named ones
 *   iv.  how long each of those took from the moment the page was asked for
 *
 * `/api/power-grid` is intercepted with the captured Saclay answer (the same
 * fixture the unit tests and `qa-power-grid.mjs` use) so section iii does not
 * depend on Overpass's afternoon; `--live` lets it through.
 *
 * Each camera gets its OWN page, with the pose and the layer set in the share
 * link: a camera set by `setView` loses to the boot flight, and a second view
 * in the same tab reads the first one's state.
 *
 * Run: node scripts/qa-power-grid-national.mjs --url http://127.0.0.1:4391
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { newQaPage } from './lib/qa-first-run.mjs';
import { projectPowerGrid } from '../src/data/powerGridFeed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const SHOTS_DIR = path.join(REPO_ROOT, 'qa-shots', 'power-grid-national');
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const APP_URL = option('--url', process.env.QA_BASE_URL || 'http://127.0.0.1:4173').replace(/\/$/, '');
const HEADFUL = args.includes('--headful');
const LIVE = args.includes('--live');
/** Share-link token of the power-grid layer (`layerState.js`). */
const LAYER_TOKEN = '2';

// The installed Chrome FIRST: Chrome for Testing picks nothing and can stop
// producing frames mid-session on this machine (see qa-firstrun.mjs).
const CHROME = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  (() => { try { return puppeteer.executablePath(); } catch { return null; } })(),
].filter(Boolean).find((candidate) => { try { return fs.existsSync(candidate); } catch { return false; } });

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

const OSM = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'src/data/fixtures/power-grid-osm-sample.json'), 'utf8'));
const FIXTURE = {
  ...projectPowerGrid(OSM),
  retrievedAt: new Date().toISOString(),
  status: 'ready',
  source: 'OpenStreetMap contributors (ODbL 1.0), via Overpass (qa fixture)',
};

const failures = [];
function check(label, condition, detail = '') {
  const ok = Boolean(condition);
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

/** Render by hand: the app is in requestRenderMode and a batch only builds on a frame. */
async function pump(page, frames = 4, gapMs = 80) {
  for (let frame = 0; frame < frames; frame += 1) {
    await page.evaluate(() => {
      try {
        window.__godsEyeView?.viewer?.scene?.requestRender();
        window.__godsEyeView?.viewer?.scene?.render();
      } catch { /* stalled context */ }
    }).catch(() => {});
    await sleep(gapMs);
  }
}

/** Poll a page-side predicate while pumping frames; resolves to its value or null. */
async function waitFor(page, fn, arg, { timeoutMs = 90_000 } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const value = await page.evaluate(fn, arg);
      if (value) return value;
    } catch { /* context still swapping */ }
    await pump(page, 2, 100);
  }
  return null;
}

async function shoot(page, name) {
  try {
    // The boot splash stays up until the arrival settles, which on a camera
    // this high can outlast the pack: a shot taken under it is of the logo.
    await waitFor(page, () => document.getElementById('loading-screen')?.classList.contains('hidden'), null, { timeoutMs: 30_000 });
    await pump(page, 3);
    await page.screenshot({ path: path.join(SHOTS_DIR, name) });
    console.log(`    📸 qa-shots/power-grid-national/${name}`);
  } catch (error) {
    console.log(`    (screenshot skipped: ${error.message})`);
  }
}

const readDiagnostics = () => {
  const layer = window.__godsEyeView?.dataManager?.layers?.get('power-grid')?.module;
  if (!layer?.getNationalDiagnostics) return null;
  return { national: layer.getNationalDiagnostics(), stats: layer.getStats() };
};

/** One page, one camera. Returns the page and the ms the page was asked for at. */
async function openAt(browser, { lat, lon, alt, pitch = -90 }) {
  const page = await newQaPage(browser);
  await page.setViewport({ width: 1440, height: 900 });
  if (!LIVE) {
    // The fixture is served by wrapping the PAGE's fetch, not by Puppeteer's
    // request interception: interception also parks the requests of Cesium's
    // module web workers, so terrain never decodes and no ground batch ever
    // finishes building — measured here, a black globe and `ready: false` for
    // 90 s, where the same page without interception was ready in 12 s.
    await page.evaluateOnNewDocument((body) => {
      const realFetch = window.fetch.bind(window);
      window.fetch = (input, init) => {
        const url = new URL(typeof input === 'string' ? input : input.url, window.location.href);
        if (url.pathname === '/api/power-grid') {
          return Promise.resolve(new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }
        return realFetch(input, init);
      };
    }, JSON.stringify(FIXTURE));
  }
  const url = `${APP_URL}/globe?welcome=0#lat=${lat}&lon=${lon}&alt=${alt}&heading=0&pitch=${pitch}&v=2&l=${LAYER_TOKEN}`;
  const askedAt = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  return { page, askedAt };
}

async function main() {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  console.log(`Power grid — national pack QA\n  App URL : ${APP_URL}\n  Chrome  : ${CHROME || 'bundled'}\n  Mode    : ${LIVE ? 'LIVE /api/power-grid' : 'fixture /api/power-grid'}\n`);
  const browser = await puppeteer.launch({
    headless: HEADFUL ? false : 'new',
    protocolTimeout: 240_000,
    ...(CHROME ? { executablePath: CHROME } : {}),
    args: [
      '--no-sandbox', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows', '--window-size=1440,900',
    ],
  });
  const timings = [];
  try {
    // --- i. national --------------------------------------------------------
    console.log('i. a national camera draws the backbone');
    {
      const { page, askedAt } = await openAt(browser, { lat: 46.6, lon: 2.4, alt: 2_500_000 });
      const loaded = await waitFor(page, () => {
        const layer = window.__godsEyeView?.dataManager?.layers?.get('power-grid')?.module;
        const national = layer?.getNationalDiagnostics?.();
        return national?.loaded ? national : null;
      });
      const loadedMs = Date.now() - askedAt;
      check('the pack loads on a national camera', loaded, loaded ? `${loaded.strokes} strokes, ${loaded.substations} yards, OSM ${loaded.osmBase}` : 'never loaded');
      const ready = await waitFor(page, () => {
        const layer = window.__godsEyeView?.dataManager?.layers?.get('power-grid')?.module;
        const national = layer?.getNationalDiagnostics?.();
        const shown = (national?.batches || []).filter((batch) => batch.show);
        return shown.length && shown.every((batch) => batch.ready) ? national : null;
      });
      const readyMs = Date.now() - askedAt;
      timings.push(['national 2 500 km', loadedMs, ready ? readyMs : null]);
      const state = await page.evaluate(readDiagnostics);
      const national = state?.national;
      check('the band is the national one', national?.band === 'national', national?.band);
      const builtTiers = [...new Set((national?.batches || []).map((batch) => batch.tierId))];
      check('only the 400/225 kV bands are built', builtTiers.every((id) => id === 'ehv' || id === 'hv-high') && builtTiers.length === 2, builtTiers.join(','));
      check('their batches finish building and are shown', ready, ready ? `${readyMs} ms after the page was asked for` : 'never ready in this browser');
      check('the 400 kV yards are dotted', (national?.pointsShown || 0) > 50, `${national?.pointsShown} dots`);
      check('the row is green, not a zoom prompt', state?.stats?.status === 'ok', `${state?.stats?.status} · ${state?.stats?.loadingLabel}`);
      await shoot(page, '1-national-2500km.png');
      await page.close();
    }

    // --- ii. regional -------------------------------------------------------
    console.log('ii. a regional camera brings the mesh in');
    {
      const { page, askedAt } = await openAt(browser, { lat: 47.2, lon: -1.2, alt: 300_000 });
      const ready = await waitFor(page, () => {
        const layer = window.__godsEyeView?.dataManager?.layers?.get('power-grid')?.module;
        const national = layer?.getNationalDiagnostics?.();
        if (national?.band !== 'regional') return null;
        const shown = (national.batches || []).filter((batch) => batch.show);
        return shown.length && shown.every((batch) => batch.ready) ? national : null;
      });
      timings.push(['regional 300 km', null, ready ? Date.now() - askedAt : null]);
      const state = await page.evaluate(readDiagnostics);
      const national = state?.national;
      check('the band is the regional one', national?.band === 'regional', national?.band);
      const shownTiers = [...new Set((national?.batches || []).filter((batch) => batch.show).map((batch) => batch.tierId))];
      check('the 63/90 kV mesh is drawn', shownTiers.includes('hv-low'), shownTiers.join(','));
      check('every shown batch finished building', ready, ready ? '' : 'never ready in this browser');
      check('the ≥ 180 kV yards are dotted', (national?.pointsShown || 0) > 20, `${national?.pointsShown} dots`);
      await shoot(page, '2-regional-300km.png');
      await page.close();
    }

    // --- iii. local handover ------------------------------------------------
    console.log('iii. a local camera hands over to the viewport answer');
    {
      const { page, askedAt } = await openAt(browser, { lat: 48.71, lon: 2.19, alt: 26_000 });
      const nationalReady = await waitFor(page, () => {
        const layer = window.__godsEyeView?.dataManager?.layers?.get('power-grid')?.module;
        const national = layer?.getNationalDiagnostics?.();
        const shown = (national?.batches || []).filter((batch) => batch.show);
        return shown.length && shown.every((batch) => batch.ready) ? national : null;
      });
      const nationalMs = Date.now() - askedAt;
      const handed = await waitFor(page, () => {
        const layer = window.__godsEyeView?.dataManager?.layers?.get('power-grid')?.module;
        const national = layer?.getNationalDiagnostics?.();
        const batches = layer?.getRenderDiagnostics?.() || [];
        return batches.length && national && national.hideTarget > 0 && !national.hidePending
          ? { national, batches }
          : null;
      });
      const handedMs = Date.now() - askedAt;
      timings.push(['local 26 km — national lines', null, nationalReady ? nationalMs : null]);
      timings.push(['local 26 km — exact answer takes over', null, handed ? handedMs : null]);
      const inPack = FIXTURE.strokes.filter((stroke) => stroke.km * 1000 >= 150).length;
      const national = handed?.national;
      check('the band is the local one', national?.band === 'local', national?.band);
      check('the national lines are on screen before the exact answer', nationalReady, nationalReady ? `${nationalMs} ms` : 'never');
      check('the viewport answer is drawn', (handed?.batches || []).length > 0, `${handed?.batches?.length} batches`);
      check('the national batches stand down for the ways it drew', national && national.hideTarget >= 1 && national.hideTarget <= FIXTURE.strokes.length,
        `${national?.hideTarget} hidden; the fixture carries ${FIXTURE.strokes.length} ways, ${inPack} of them long enough to be in the pack`);
      const hiddenInBatches = (national?.batches || []).reduce((sum, batch) => sum + (batch.part === 'casing' ? batch.hidden : 0), 0);
      check('the hide reached the batches, not just the target', hiddenInBatches > 0, `${hiddenInBatches} casings hidden`);
      check('the national yard dots stand down', national?.pointsCollectionShown === false, `collection shown: ${national?.pointsCollectionShown}`);
      await shoot(page, '3-local-26km.png');
      await page.close();
    }
  } finally {
    await browser.close();
  }

  console.log('\niv. timings (ms after the page was asked for, boot included)');
  for (const [label, loadedMs, readyMs] of timings) {
    console.log(`  ${label.padEnd(40)} ${loadedMs === null ? '' : `pack ${loadedMs} · `}drawn ${readyMs ?? 'never'}`);
  }
  if (failures.length) {
    console.log(`\n${failures.length} check(s) failed:\n  - ${failures.join('\n  - ')}`);
    process.exitCode = 1;
  } else {
    console.log('\nall checks passed');
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
