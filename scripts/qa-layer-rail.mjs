#!/usr/bin/env node
/**
 * QA the desktop Layers panel — a rail of groups and one list beside it
 * (src/data/layerPanelRail.js) — in a real browser.
 *
 * The unit tests pin the rail's pure parts (search, pin default, group choice).
 * What needs a live cascade, a live layout pass and real events is here:
 *
 *   1. Expanding the panel opens the list: 380 px with the rail, 88 px without.
 *   2. The list shows ONE group, and the rail says which, with the lit rows
 *      counted on its badges exactly as the strip counts them.
 *   3. Pressing the open group again closes the list; another group swaps it.
 *   4. Touching the globe folds it — a click, a drag, a wheel alike; a pinned
 *      list survives all three.
 *   4b. A real mouse resting on the rail unfolds it on its last group, and
 *      leaving the panel folds nothing; a pointer crossing the rail, or
 *      crossing it with a button down, unfolds nothing; a click that lands
 *      just after the list unfolded does not fold it; a list folded under
 *      the pointer waits for the pointer to leave and come back.
 *   5. The search keeps matching rows across every group, folds accents, says
 *      so when nothing matches, and Escape empties it, then closes.
 *   6. A fused layer revealed by the voice surface opens its primary's group.
 *   7. Collapsing the panel hides the rail; expanding it again opens the list.
 *   8. On a 1280 × 620 window every rail button is on screen (no hidden
 *      scroll); at 1920 px the list starts unpinned too.
 *
 * The globe presses are dispatched on a canvas this harness adds inside
 * `#cesiumContainer`, never on Cesium's own: a synthetic pointer event on the
 * live canvas runs a pick under software GL, which has taken whole sessions
 * down on this Mac. The rail's rule is "a canvas inside the globe's
 * container", and that is exactly what it is given. For the same reason the
 * real mouse of 4b only ever moves between the rail and a spot this harness
 * lays over the right edge, never over the globe.
 *
 * Usage: node scripts/qa-layer-rail.mjs [--url http://localhost:4174] [--headful]
 */

import fs from 'node:fs';
import puppeteer from 'puppeteer';
import { newQaPage } from './lib/qa-first-run.mjs';

const args = process.argv.slice(2);
const getOpt = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const APP_URL = getOpt('--url', 'http://localhost:4174').replace(/\/$/, '');
const HEADFUL = args.includes('--headful');

const CHROME_CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  (() => { try { return puppeteer.executablePath(); } catch { return null; } })(),
].filter(Boolean);

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`  [${ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'}] ${name}${detail ? ` — ${detail}` : ''}`);
}

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

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

/** Everything the checks read about the panel, in one page pass. */
const readPanel = () => {
  const panel = document.getElementById('data-panel');
  const list = document.getElementById('data-toggles');
  const rail = panel?.querySelector('.data-rail');
  const shown = (node) => Boolean(node) && node.getClientRects().length > 0;
  const sections = [...(list?.querySelectorAll('.data-category') || [])];
  const visibleSections = sections.filter(shown);
  const rows = [...(list?.querySelectorAll('.data-toggle-row') || [])].filter(shown);
  const buttons = [...(rail?.querySelectorAll('.data-rail-item[data-rail-category]') || [])];
  const strip = list?.querySelector('.data-active-strip');
  const railBox = rail?.getBoundingClientRect();
  const empty = panel?.querySelector('.data-drawer-empty');
  const input = panel?.querySelector('.data-drawer-search-input');
  return {
    classes: panel?.className || '',
    width: Math.round(panel?.getBoundingClientRect().width || 0),
    railWidth: Math.round(railBox?.width || 0),
    railShown: shown(rail),
    listShown: shown(list),
    visibleSections: visibleSections.map((section) => section.dataset.categoryId),
    visibleHeaders: visibleSections.filter((section) => shown(section.querySelector('.data-category-header'))).length,
    visibleRows: rows.map((row) => row.dataset.layerId),
    current: buttons.filter((button) => button.classList.contains('is-current')).map((button) => button.dataset.railCategory),
    expanded: buttons.filter((button) => button.getAttribute('aria-expanded') === 'true').map((button) => button.dataset.railCategory),
    badges: Object.fromEntries(buttons.map((button) => [
      button.dataset.railCategory,
      Number(button.querySelector('.data-rail-badge')?.textContent || 0),
    ])),
    stripCount: strip && !strip.hidden ? Number(strip.querySelector('.data-active-count')?.textContent || 0) : 0,
    title: panel?.querySelector('.data-drawer-title')?.textContent || '',
    emptyShown: shown(empty),
    emptyText: empty?.textContent || '',
    query: input?.value ?? null,
    pinPressed: panel?.querySelector('.data-drawer-pin')?.getAttribute('aria-pressed') || null,
    railClipped: rail ? rail.scrollHeight > rail.clientHeight + 1 : null,
    buttonsOutside: buttons.filter((button) => {
      const box = button.getBoundingClientRect();
      return box.bottom > railBox.bottom + 1 || box.height === 0;
    }).length,
    labelsShown: buttons.filter((button) => shown(button.querySelector('.data-rail-label'))).length,
    state: window.__godsEyeView?.layerPanelRail?.getState?.() || null,
  };
};

/**
 * One page per window size, each in its OWN browser context: the pin is
 * stored in `localStorage`, and a size that inherited the previous page's
 * choice would be testing that choice instead of its own default.
 */
/** Requests the page was refused: printed, never failed on — see below. */
const refusedRequests = new Set();

async function openPage(browser, width, height, consoleErrors) {
  const context = await browser.createBrowserContext();
  const page = await newQaPage(context);
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  // A refused request is a fact about the deployment's keys (a local Google
  // key that refuses the `/api/google/*` proxies answers 403 on every boot),
  // not about this panel, which requests nothing. It is listed so a reader can
  // see it, and kept out of the verdict so the verdict stays about the panel.
  page.on('response', (response) => {
    if (response.status() >= 400) refusedRequests.add(`${response.status()} ${response.url().split('?')[0].slice(0, 120)}`);
  });
  page.on('console', (message) => {
    if (message.type() !== 'error' || message.text().startsWith('Failed to load resource')) return;
    consoleErrors.push(message.text().slice(0, 300));
  });
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message.slice(0, 300)}`));
  await page.goto(`${APP_URL}/globe?welcome=0&photoreal=0`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  const ready = await waitFor(page, () => Boolean(window.__godsEyeView?.dataManager));
  return ready ? page : null;
}

const expand = (page) => page.evaluate(() => {
  window.__godsEyeView.styleManager.setPanelCollapsed('data-panel', false, { explicit: true });
});
const collapse = (page) => page.evaluate(() => {
  window.__godsEyeView.styleManager.setPanelCollapsed('data-panel', true, { explicit: true });
});
const pressGroup = (page, id) => page.evaluate((groupId) => {
  document.querySelector(`.data-rail-item[data-rail-category="${groupId}"]`).click();
}, id);
const typeSearch = (page, text) => page.evaluate((value) => {
  const input = document.querySelector('.data-drawer-search-input');
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}, text);
const pressEscape = (page) => page.evaluate(() => {
  const input = document.querySelector('.data-drawer-search-input');
  input.focus();
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
});

/**
 * The globe, touched: `'wheel'`, or a press whose `travel` 0 is a click and
 * anything more a pan.
 */
const touchGlobe = (page, gesture) => page.evaluate((how) => {
  let probe = document.getElementById('qa-layer-rail-globe');
  if (!probe) {
    probe = document.createElement('canvas');
    probe.id = 'qa-layer-rail-globe';
    probe.width = 10;
    probe.height = 10;
    document.getElementById('cesiumContainer').appendChild(probe);
  }
  if (how === 'wheel') {
    probe.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -120, clientX: 900, clientY: 400 }));
    return;
  }
  const at = (type, x) => probe.dispatchEvent(new PointerEvent(type, {
    bubbles: true, cancelable: true, pointerId: 7, pointerType: 'mouse', isPrimary: true,
    button: 0, buttons: type === 'pointerdown' ? 1 : 0, clientX: x, clientY: 400,
  }));
  at('pointerdown', 900);
  at('pointerup', 900 + how);
}, gesture);

/** Where the real mouse goes to be off the panel without being on the globe. */
const elsewhere = (page) => page.evaluate(() => {
  let spot = document.getElementById('qa-layer-rail-elsewhere');
  if (!spot) {
    spot = document.createElement('div');
    spot.id = 'qa-layer-rail-elsewhere';
    spot.style.cssText = 'position:fixed;right:0;top:40%;width:80px;height:80px;z-index:2147483647;';
    document.body.appendChild(spot);
  }
  const box = spot.getBoundingClientRect();
  return { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) };
});
const railButtonAt = (page, id) => page.evaluate((groupId) => {
  const box = document.querySelector(`.data-rail-item[data-rail-category="${groupId}"]`).getBoundingClientRect();
  return { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2) };
}, id);

async function main() {
  const executablePath = CHROME_CANDIDATES.find((candidate) => {
    try { return fs.existsSync(candidate); } catch { return false; }
  });
  const browser = await puppeteer.launch({
    headless: HEADFUL ? false : 'new',
    ...(executablePath ? { executablePath } : {}),
    protocolTimeout: 120_000,
    args: [
      '--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist', '--hide-scrollbars',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
    ],
  });

  const consoleErrors = [];
  try {
    // ── A 13-inch MacBook: the list starts unpinned ────────────────────────
    console.log(`\nOpening ${APP_URL} at 1470 × 830 …`);
    const page = await openPage(browser, 1470, 830, consoleErrors);
    record('app boots and exposes the data manager', Boolean(page));
    if (!page) return;
    await sleep(3000);
    const mounted = await page.evaluate(() => ({
      rail: Boolean(window.__godsEyeView.layerPanelRail),
      hasRail: document.getElementById('data-panel').classList.contains('has-rail'),
    }));
    record('the rail is mounted on the desktop', mounted.rail && mounted.hasRail, JSON.stringify(mounted));

    // 1. Expanding opens the list.
    await expand(page);
    await sleep(900);
    let seen = await page.evaluate(readPanel);
    record('expanding the panel opens the list', seen.classes.includes('drawer-open') && seen.listShown,
      seen.classes);
    record('open, the panel is the rail plus the list: 380 px', Math.abs(seen.width - 380) <= 2,
      `panel ${seen.width} px, rail ${seen.railWidth} px`);
    record('the list starts unpinned', seen.state?.pinned === false && seen.pinPressed === 'false',
      `pinned=${seen.state?.pinned}`);

    // 2. One group, named by the rail.
    record('the list shows exactly one group', seen.visibleSections.length === 1
      && seen.visibleSections[0] === seen.state?.category, `shown: ${seen.visibleSections.join(',')}`);
    record('its header is hidden — the list head names it', seen.visibleHeaders === 0 && seen.title.length > 0,
      `title « ${seen.title} »`);
    record('the rail marks that group current and expanded',
      seen.current.join() === seen.state?.category && seen.expanded.join() === seen.state?.category,
      `current=${seen.current} expanded=${seen.expanded}`);
    const badgeSum = Object.values(seen.badges).reduce((sum, value) => sum + value, 0);
    record('the badges count the lit rows exactly as the strip does', badgeSum === seen.stripCount,
      `badges ${JSON.stringify(seen.badges)} strip ${seen.stripCount}`);

    // 3. Swap, then close by pressing the open group again.
    await pressGroup(page, 'energy');
    await sleep(500);
    seen = await page.evaluate(readPanel);
    record('pressing another group swaps the list', seen.visibleSections.join() === 'energy'
      && seen.current.join() === 'energy', `shown: ${seen.visibleSections.join(',')}`);
    await pressGroup(page, 'energy');
    await sleep(500);
    seen = await page.evaluate(readPanel);
    record('pressing the open group again closes the list', !seen.listShown && seen.state?.open === false);
    record('closed, the panel is the rail alone: 88 px', Math.abs(seen.width - 88) <= 2 && seen.railShown,
      `panel ${seen.width} px`);

    // 4. The globe folds it — a click, a drag, a wheel; a pin keeps it.
    for (const [gesture, how] of [['a click', 0], ['a drag', 40], ['a wheel', 'wheel']]) {
      await pressGroup(page, 'built-environment');
      await sleep(400);
      if (how === 0) {
        seen = await page.evaluate(readPanel);
        record('« Bâti » opens with its ten rows', seen.visibleRows.length >= 10,
          `${seen.visibleRows.length} rows`);
      }
      await touchGlobe(page, how);
      await sleep(400);
      seen = await page.evaluate(readPanel);
      record(`${gesture} on the globe folds the list into the rail`,
        seen.state?.open === false && !seen.listShown && Math.abs(seen.width - 88) <= 2, `panel ${seen.width} px`);
    }

    await pressGroup(page, 'built-environment');
    await page.evaluate(() => document.querySelector('.data-drawer-pin').click());
    await sleep(300);
    await touchGlobe(page, 40);
    await touchGlobe(page, 'wheel');
    await sleep(400);
    seen = await page.evaluate(readPanel);
    const storedPin = await page.evaluate(() => localStorage.getItem('godsEyeView.v1.dataLayerDrawerPin'));
    record('pinned, the list survives a drag and a wheel on the globe', seen.state?.open === true && seen.pinPressed === 'true',
      `stored=${storedPin}`);
    record('the pin is remembered', storedPin === 'true');
    await page.evaluate(() => document.querySelector('.data-drawer-pin').click());
    await sleep(200);
    await touchGlobe(page, 0);
    await sleep(300);

    // 4b. The real mouse brings it back.
    const away = await elsewhere(page);
    const onBati = await railButtonAt(page, 'built-environment');
    const onEnergy = await railButtonAt(page, 'energy');
    await page.mouse.move(away.x, away.y);
    await page.mouse.move(onEnergy.x, onEnergy.y);
    await sleep(700);
    seen = await page.evaluate(readPanel);
    record('a mouse resting on the rail unfolds the list on its last group',
      seen.state?.open === true && seen.listShown && seen.visibleSections.join() === 'built-environment',
      `shown: ${seen.visibleSections.join(',')}`);
    await page.mouse.move(away.x, away.y);
    await sleep(700);
    seen = await page.evaluate(readPanel);
    record('the mouse leaving the panel folds nothing', seen.state?.open === true);

    await touchGlobe(page, 0);
    await sleep(200);
    await page.mouse.move(onEnergy.x, onEnergy.y);
    await page.mouse.move(away.x, away.y);
    await sleep(700);
    seen = await page.evaluate(readPanel);
    record('a mouse crossing the rail unfolds nothing', seen.state?.open === false);

    await page.mouse.down();
    await page.mouse.move(onEnergy.x, onEnergy.y);
    await sleep(700);
    seen = await page.evaluate(readPanel);
    record('a mouse dragged over the rail, button down, unfolds nothing', seen.state?.open === false);
    await page.mouse.move(away.x, away.y);
    await page.mouse.up();
    await sleep(200);

    await page.mouse.move(onBati.x, onBati.y);
    await sleep(320);
    await page.mouse.down();
    await page.mouse.up();
    await sleep(300);
    seen = await page.evaluate(readPanel);
    record('a click that lands as the list unfolds on its own group does not fold it',
      seen.state?.open === true && seen.visibleSections.join() === 'built-environment');
    await sleep(600);
    await page.mouse.click(onBati.x, onBati.y);
    await page.mouse.move(onBati.x + 3, onBati.y + 2);
    await sleep(700);
    seen = await page.evaluate(readPanel);
    record('pressed again, it folds, and stays folded under the resting mouse', seen.state?.open === false);
    await page.mouse.move(away.x, away.y);
    await page.mouse.move(onBati.x, onBati.y);
    await sleep(700);
    seen = await page.evaluate(readPanel);
    record('the mouse leaving and coming back unfolds it again', seen.state?.open === true);
    await page.mouse.move(away.x, away.y);

    // 5. The search.
    await typeSearch(page, 'electrique');
    await sleep(400);
    seen = await page.evaluate(readPanel);
    const hits = seen.state?.hits || [];
    record('the search folds accents and keeps matching rows only',
      hits.length >= 2 && seen.visibleRows.length === hits.length
        && seen.visibleRows.every((id) => hits.includes(id)),
      `hits ${hits.join(',')}`);
    record('results sit under their group headers', seen.visibleHeaders === seen.visibleSections.length
      && seen.visibleSections.length >= 1 && seen.classes.includes('rail-searching'),
      `groups ${seen.visibleSections.join(',')}`);
    await typeSearch(page, 'militaire');
    await sleep(400);
    seen = await page.evaluate(readPanel);
    record('a fused layer is found on the row that carries it', seen.visibleRows.includes('flights'),
      `rows ${seen.visibleRows.join(',')}`);
    await typeSearch(page, 'zzqx');
    await sleep(400);
    seen = await page.evaluate(readPanel);
    record('no match says so, and shows no row', seen.emptyShown && seen.emptyText.includes('zzqx')
      && seen.visibleRows.length === 0, `« ${seen.emptyText} »`);
    await pressEscape(page);
    await sleep(300);
    seen = await page.evaluate(readPanel);
    record('the first Escape empties the field and keeps the list', seen.query === '' && seen.state?.open === true);
    await pressEscape(page);
    await sleep(300);
    seen = await page.evaluate(readPanel);
    record('the second Escape closes the list', seen.state?.open === false);

    // 6. The voice surface's door.
    const fused = await page.evaluate(() => {
      const layer = window.__godsEyeView.dataManager.getAll().find((entry) => entry.fusedInto);
      if (!layer) return null;
      const rowId = window.__godsEyeView.dataManager.revealPanelRow(layer.id);
      return { id: layer.id, rowId };
    });
    await sleep(400);
    seen = await page.evaluate(readPanel);
    record('revealing a fused layer opens the group of the row it lives on',
      Boolean(fused) && seen.state?.open === true && seen.visibleRows.includes(fused.rowId),
      fused ? `${fused.id} → ${fused.rowId} in ${seen.visibleSections.join(',')}` : 'no fused layer');

    // 7. Collapse and expand.
    await collapse(page);
    await sleep(600);
    seen = await page.evaluate(readPanel);
    record('collapsing the panel hides the rail', !seen.railShown && !seen.listShown);
    await expand(page);
    await sleep(900);
    seen = await page.evaluate(readPanel);
    record('expanding it again opens the list', seen.railShown && seen.listShown && seen.state?.open === true);
    await page.close();

    // ── A 1280 px laptop at 150 %: every rail button on screen ─────────────
    console.log('\nOpening at 1280 × 620 …');
    const small = await openPage(browser, 1280, 620, consoleErrors);
    if (small) {
      await sleep(3000);
      await expand(small);
      await sleep(1200);
      seen = await small.evaluate(readPanel);
      record('1280 × 620: no rail button is cut off', seen.buttonsOutside === 0 && seen.railClipped === false,
        `outside=${seen.buttonsOutside} clipped=${seen.railClipped}`);
      record('1280 × 620: the rail keeps its glyphs and drops its words', seen.labelsShown === 0);
      await small.close();
    } else {
      record('1280 × 620 page boots', false);
    }

    // ── A 24-inch 1080p screen: the list starts unpinned there too ──────────
    console.log('\nOpening at 1920 × 950 …');
    const wide = await openPage(browser, 1920, 950, consoleErrors);
    if (wide) {
      await sleep(3000);
      seen = await wide.evaluate(readPanel);
      record('1920 × 950: the list starts folded and unpinned',
        seen.state?.open === false && seen.state?.pinned === false && seen.pinPressed === 'false');
      await expand(wide);
      await sleep(900);
      seen = await wide.evaluate(readPanel);
      record('1920 × 950: the rail keeps its words', seen.labelsShown > 0);
      await wide.close();
    } else {
      record('1920 × 950 page boots', false);
    }

    record('no script errors during the run', consoleErrors.length === 0,
      consoleErrors.slice(0, 3).join(' | '));
    for (const refused of refusedRequests) console.log(`  [INFO] request refused: ${refused}`);
  } finally {
    await browser.close();
  }

  const failed = results.filter((entry) => !entry.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) process.exitCode = 1;
}

await main();
