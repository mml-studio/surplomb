#!/usr/bin/env node
/**
 * QA the strip of lit layers pinned above DATA LAYERS, in a real browser.
 *
 * Switching a layer ON costs one click on whatever row is under the cursor.
 * Switching the PREVIOUS one off used to cost a hunt: 59 rows in seven
 * collapsible groups, and the row to darken is almost never the one on screen.
 * The strip inverts that — what is on is a short list by definition.
 *
 * Every claim below needs a live cascade and a live layout pass, which is why
 * `manager.test.mjs` cannot make them:
 *
 *   1. The strip is the FIRST child of the scroller and paints nothing until
 *      a row is lit — `[hidden]` must beat `display: flex`.
 *   2. It names every lit row, and only rows (no coordinators, no companions).
 *   3. It is STICKY: scroll the list to the bottom and it is still on screen,
 *      which is the whole reason it is reachable at the moment of regret.
 *   4. A chip darkens its row, and leaves the strip.
 *   5. TOUT ÉTEINDRE takes the rest down and the strip goes away with them.
 *   6. A chip is not addressable as a ROW — `[data-layer-id]` still resolves
 *      to the row, which is what the voice surface and the phone shell read.
 *
 * Usage: node scripts/qa-active-layers-strip.mjs [--url http://localhost:4174] [--headful] [--shots]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { newQaPage } from './lib/qa-first-run.mjs';

const args = process.argv.slice(2);
const getOpt = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const APP_URL = getOpt('--url', 'http://localhost:4174').replace(/\/$/, '');
const HEADFUL = args.includes('--headful');
// OPT-IN, AND OFF BY DEFAULT. `Page.captureScreenshot` only returns while the
// page is producing frames; this app parks its render loop on purpose, so a
// capture here does not merely fail — it times out the protocol and wedges the
// session, taking every assertion AFTER it down with it. Measured twice on
// 2026-09-16, under headless `new` and `shell` alike. The assertions are the
// harness; the pictures are a debugging aid, so they are asked for explicitly.
const SHOTS = args.includes('--shots');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOT_DIR = path.join(ROOT, 'qa-shots', 'active-layers-strip');

/** Three keyless layers in three different groups — the scattering is the point. */
const LIT_LAYERS = ['flights', 'local-airports', 'earthquakes'];

const CHROME_CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  (() => { try { return puppeteer.executablePath(); } catch { return null; } })(),
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`  [${ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'}] ${name}${detail ? ` — ${detail}` : ''}`);
}

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * Shots are evidence, not a check — losing a frame must not cost the run.
 *
 * `Page.captureScreenshot` only ever returns while the page is producing
 * frames, and this app stops asking for them the moment nothing moves. One
 * `requestRender()` first, and the run happens under `headless: 'shell'`,
 * which is the mode that answers at all when the scene has parked.
 */
async function shoot(page, name) {
  if (!SHOTS) return;
  try {
    await page.evaluate(() => {
      window.__godsEyeView?.styleManager?.viewer?.scene?.requestRender?.();
    });
    // `fromSurface: false` reads the renderer rather than waiting on the
    // compositor surface, which is the half of the capture a parked scene
    // never delivers.
    await page.screenshot({ path: path.join(SHOT_DIR, name), fromSurface: false });
  } catch (error) {
    console.log(`  [\x1b[33mSKIP\x1b[0m] shot ${name} — ${String(error.message).slice(0, 80)}`);
  }
}

async function waitFor(page, check, { timeoutMs = 60_000, everyMs = 400 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await page.evaluate(check);
    if (last) return last;
    await sleep(everyMs);
  }
  return last;
}

/** Everything the checks need about the strip, read in one page pass. */
const readStrip = () => {
  const list = document.getElementById('data-toggles');
  const strip = list?.querySelector('.data-active-strip');
  if (!list || !strip) return null;
  const style = getComputedStyle(strip);
  const box = strip.getBoundingClientRect();
  const listBox = list.getBoundingClientRect();
  const chips = [...strip.querySelectorAll('.data-active-chip')];
  const clear = strip.querySelector('.data-active-clear');
  return {
    isFirstChild: list.children[0] === strip,
    display: style.display,
    position: style.position,
    names: chips.map((chip) => chip.querySelector('.data-active-chip-name')?.textContent || ''),
    ids: chips.map((chip) => chip.dataset.activeLayerId),
    count: strip.querySelector('.data-active-count')?.textContent || null,
    clearVisible: clear ? getComputedStyle(clear).display !== 'none' : false,
    box: { top: box.top, height: box.height, width: box.width },
    listBox: { top: listBox.top, height: listBox.height },
    listScroll: { top: list.scrollTop, height: list.scrollHeight, client: list.clientHeight },
  };
};

async function main() {
  if (SHOTS) fs.mkdirSync(SHOT_DIR, { recursive: true });
  const executablePath = CHROME_CANDIDATES.find((candidate) => {
    try { return fs.existsSync(candidate); } catch { return false; }
  });

  const browser = await puppeteer.launch({
    // `shell`, not `new`: measured on this app, a capture under headless `new`
    // hangs until `protocolTimeout` whenever the render governor has parked.
    headless: HEADFUL ? false : 'shell',
    ...(executablePath ? { executablePath } : {}),
    protocolTimeout: 60_000,
    args: [
      '--no-sandbox', '--disable-setuid-sandbox',
      '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist',
      '--disable-dev-shm-usage', '--window-size=1440,900',
    ],
  });

  const consoleErrors = [];
  try {
    const page = await newQaPage(browser);
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 300));
    });
    page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message.slice(0, 300)}`));

    console.log(`\nOpening ${APP_URL} …`);
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 90_000 });

    const ready = await waitFor(page, () => !!window.__godsEyeView?.dataManager);
    record('app boots and exposes the data manager', !!ready);
    if (!ready) return;

    // The panel ships collapsed, and a collapsed panel hides the whole list.
    await page.evaluate(() => {
      window.__godsEyeView.styleManager.setPanelCollapsed('data-panel', false, { explicit: true });
    });
    await sleep(900);

    // ── 1. Present, first, and invisible at rest ──────────────────────────
    //
    // The app ships with traffic ON (`gev-defaut-nest-pas-une-preference`), so
    // "at rest" has to be MADE: sweep first, then look.
    await page.evaluate(() => window.__godsEyeView.dataManager.turnOffPanelRows());
    await sleep(600);
    const atRest = await page.evaluate(readStrip);
    record('the strip exists and leads the scroller', !!atRest?.isFirstChild,
      atRest ? `first=${atRest.isFirstChild}` : 'no strip in #data-toggles');
    record('nothing lit paints nothing — [hidden] beats display:flex',
      atRest?.display === 'none', `display=${atRest?.display}`);
    await shoot(page, '01-at-rest.png');

    // ── 2. It names the lit rows ──────────────────────────────────────────
    await page.evaluate(async (ids) => {
      const dm = window.__godsEyeView.dataManager;
      for (const id of ids) {
        try {
          await dm.setEnabled(id, true, { origin: 'user' });
          await dm.waitForLayerSettled?.(id);
        } catch { /* a keyless build may not have every layer */ }
      }
    }, LIT_LAYERS);
    await sleep(1500);
    const lit = await page.evaluate(readStrip);
    record('every lit row gets a chip', lit?.ids?.length >= 2,
      `${lit?.ids?.length} chips: ${lit?.names?.join(' | ')}`);
    record('the chips name the lit rows and nothing else',
      LIT_LAYERS.filter((id) => lit?.ids?.includes(id)).length === lit?.ids?.length,
      `ids=${lit?.ids?.join(',')}`);
    record('the count agrees with the chips', lit?.count === String(lit?.ids?.length),
      `count=${lit?.count} chips=${lit?.ids?.length}`);
    record('TOUT ÉTEINDRE shows once two rows are lit', lit?.clearVisible === true);
    await shoot(page, '02-lit.png');

    // ── 3. Sticky: still on screen with the list scrolled to the bottom ───
    // On the desktop the list shows one group at a time (layerPanelRail.js);
    // « Bâti & territoire » is the one long enough to scroll at 1440 × 900.
    await page.evaluate(() => window.__godsEyeView.layerPanelRail?.open('built-environment'));
    await sleep(600);
    // NO `requestAnimationFrame` ANYWHERE IN HERE. The render governor parks
    // this app when nothing moves, and headless Chromium then never ticks rAF
    // — a promise resolved inside one does not merely arrive late, it never
    // arrives, and the protocol times out and wedges the session for every
    // check after it. Reading `getBoundingClientRect()` forces the layout this
    // needs, synchronously, which is all a scroll offset requires.
    const scrolled = await page.evaluate(() => {
      const list = document.getElementById('data-toggles');
      list.scrollTop = list.scrollHeight;
      const strip = list.querySelector('.data-active-strip');
      const box = strip.getBoundingClientRect();
      const listBox = list.getBoundingClientRect();
      return {
        scrolledBy: list.scrollTop,
        scrollable: list.scrollHeight > list.clientHeight + 1,
        stripTop: box.top,
        stripHeight: box.height,
        listTop: listBox.top,
        position: getComputedStyle(strip).position,
      };
    });
    record('the toggle list is a scroller at all', scrolled.scrollable,
      `scrolled ${Math.round(scrolled.scrolledBy)}px`);
    record('the strip is sticky', scrolled.position === 'sticky', `position=${scrolled.position}`);
    // Within a pixel of the scroller's own top: it did NOT travel with the rows.
    record('scrolled to the bottom, the strip is still at the top of the list',
      Math.abs(scrolled.stripTop - scrolled.listTop) <= 2 && scrolled.stripHeight > 0,
      `strip.top=${Math.round(scrolled.stripTop)} list.top=${Math.round(scrolled.listTop)}`);
    await shoot(page, '03-scrolled.png');

    // ── 6. A chip is not a row ────────────────────────────────────────────
    const addressing = await page.evaluate((id) => {
      const found = document.querySelector(`#data-toggles [data-layer-id="${id}"]`);
      return {
        className: found?.className || null,
        hasName: !!found?.querySelector('.data-name'),
      };
    }, LIT_LAYERS[0]);
    record('[data-layer-id] still resolves to the ROW, not to a chip',
      addressing.className?.includes('data-toggle-row') && addressing.hasName,
      `matched .${addressing.className}`);

    // ── 4. A chip darkens its row ─────────────────────────────────────────
    //
    // Clicked through the DOM: `page.click()` hangs on this app when the scene
    // has gone idle (see `puppeteer-click-hangs-use-dom-clicks`).
    const target = lit.ids[0];
    await page.evaluate((id) => {
      document.querySelector(`.data-active-chip[data-active-layer-id="${id}"]`).click();
    }, target);
    await sleep(1500);
    const afterChip = await page.evaluate(readStrip);
    // The row's STATE, not the word on its button: the button says ÉTEINT in
    // French and OFF in English, and `data-feed-state` says `off` in both.
    const afterChipRow = await page.evaluate((id) => ({
      enabled: window.__godsEyeView.dataManager.isEnabled(id),
      rowButton: document.querySelector(`#data-toggles [data-layer-id="${id}"] .data-toggle-btn`)
        ?.dataset?.feedState || null,
    }), target);
    record('the chip switched its layer off', afterChipRow.enabled === false,
      `${target}.enabled=${afterChipRow.enabled}`);
    record('the chip left the strip with it', !afterChip.ids.includes(target),
      `remaining: ${afterChip.names.join(' | ')}`);
    record('the row it stood for agrees', afterChipRow.rowButton === 'off',
      `row button reads ${afterChipRow.rowButton}`);
    await shoot(page, '04-after-chip.png');

    // ── 5. The sweep ──────────────────────────────────────────────────────
    await page.evaluate(() => document.querySelector('.data-active-clear').click());
    await sleep(1800);
    const afterSweep = await page.evaluate(readStrip);
    const stillOn = await page.evaluate(() => window.__godsEyeView.dataManager
      .getAll().filter((layer) => layer.showInTogglePanel && layer.enabled).map((layer) => layer.id));
    record('TOUT ÉTEINDRE takes every lit row down', stillOn.length === 0,
      stillOn.length ? `still on: ${stillOn.join(',')}` : 'panel is dark');
    record('and the strip goes away with them', afterSweep?.display === 'none',
      `display=${afterSweep?.display}`);
    await shoot(page, '05-after-sweep.png');

    record('no console errors during the run', consoleErrors.length === 0,
      consoleErrors.slice(0, 2).join(' | '));
  } finally {
    await browser.close();
  }

  const failed = results.filter((entry) => !entry.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (SHOTS) console.log(`Shots: ${SHOT_DIR}`);
  if (failed.length) process.exitCode = 1;
}

await main();
