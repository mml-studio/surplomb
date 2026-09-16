#!/usr/bin/env node
/**
 * warm-default-view.mjs — pay the default view's cold Overpass box once a week
 * so that no reader ever does.
 *
 * ── The number this exists for ────────────────────────────────────────────
 * A cold road fetch costs 0.6 to 46 s (measured 2026-09-16 against the hosted
 * origin from the VPS: Lyon 46.4 s, Paris arterials 17.8 s, Marseille 6.1 s,
 * Bordeaux 2.7 s). The same query repeated costs 52 to 78 ms. The proxy's
 * disk cache holds Overpass answers for 7 days.
 *
 * So somebody pays the cold box roughly once a week, and today it is whoever
 * happens to arrive first — on the one view that every single visitor lands
 * on, with nothing on screen while they wait.
 *
 * ── Why this is ONE visit and not five ────────────────────────────────────
 * It is only one because the fetch box stopped depending on the reader.
 * `tierFetchBox` puts the box at the band's own span on the band's lattice, so
 * the default Paris view is a single Overpass key —
 * `scripts/qa-span-par-viewport.mjs` measures one key across eleven window
 * sizes, where the previous chain produced five. Before that, warming meant
 * guessing which window sizes to sweep.
 *
 * ── Why a browser and not a crafted request ───────────────────────────────
 * The alternative is to compute the query body in Node and POST it. That is
 * faster and it rots silently: the box comes from the camera's look-at point,
 * which comes from the default view's altitude, pitch and heading, and the day
 * any of those changes the warmer keeps warming a cell nobody visits — with
 * nothing to notice, because a warm request looks exactly like a useful one.
 * A real visit cannot drift from the real key, because it IS the reader.
 *
 * The traffic layer is on by default (`DEFAULT_ENABLED_LAYER_IDS`), so the
 * visit is bare: no hash, no seeding, nothing to keep in step.
 *
 * ── What it must not do ───────────────────────────────────────────────────
 * Buy a Cesium ion root tile. Photorealistic adoption is metered per reader
 * and this reader is a robot, so it is suppressed — which costs nothing here,
 * since the mesh has no bearing on which Overpass box is asked for.
 *
 *   node scripts/warm-default-view.mjs --url https://surplomb.app
 *   # crontab: 17 4 * * 1  (weekly, well inside the 7-day TTL)
 *
 * Exits 0 when the view was warmed, 1 when it was not — so a cron mail means
 * something.
 */

import puppeteer from 'puppeteer';
import fs from 'node:fs';
import { suppressFirstRun, disablePhotoreal } from './lib/qa-first-run.mjs';

const argv = process.argv.slice(2);
const getOpt = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const APP_URL = getOpt('--url', 'http://localhost:4421');
const BUDGET_MS = Number(getOpt('--budget-ms', 180000));

const CHROME_CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  (() => { try { return puppeteer.executablePath(); } catch { return null; } })(),
].filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date().toISOString();

(async () => {
  const exe = CHROME_CANDIDATES.find((c) => { try { return fs.existsSync(c); } catch { return false; } });
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: exe || undefined,
    protocolTimeout: Math.max(BUDGET_MS, 120000),
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  const asked = [];
  let dots = 0;
  try {
    const page = await browser.newPage();
    await suppressFirstRun(page);
    await disablePhotoreal(page);
    page.on('request', (req) => {
      if (!req.url().includes('/api/overpass')) return;
      const body = decodeURIComponent(req.postData() || '');
      const m = body.match(/\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/);
      asked.push({ at: Date.now(), box: m ? m.slice(1, 5).join(',') : '?' });
    });

    const t0 = Date.now();
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: BUDGET_MS });
    // Both passes go out together and the slower one is what the cache needs
    // held; so the wait is for DOTS, which only exist once a pass has landed
    // and been parsed — a request having left is not an answer having arrived.
    while (Date.now() - t0 < BUDGET_MS) {
      await sleep(1000);
      dots = await page.evaluate(() => {
        const e = window.__godsEyeView?.dataManager?.layers?.get('traffic');
        return e?.module?.getStats?.()?.count ?? 0;
      }).catch(() => 0);
      if (dots > 0) break;
    }
    // One more breath so the second (full-graph) pass lands in the cache too.
    if (dots > 0) await sleep(8000);
    console.log(`[warm ${stamp()}] ${APP_URL} — ${dots} dots after ${Date.now() - t0} ms`);
    for (const a of asked) console.log(`[warm ${stamp()}]   asked ${a.box} at +${a.at - t0} ms`);
  } finally {
    await browser.close();
  }

  if (dots === 0 || asked.length === 0) {
    console.error(`[warm ${stamp()}] NOT WARMED — ${dots} dots, ${asked.length} Overpass request(s)`);
    process.exit(1);
  }
  process.exit(0);
})();
