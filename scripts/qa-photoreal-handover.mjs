#!/usr/bin/env node
/**
 * qa-photoreal-handover.mjs — the swap from the opening basemap to the 3D globe.
 *
 * Three behaviours ship together and only make sense measured together, which
 * is why one harness covers all three:
 *
 *   1. THE TRAY FOLLOWS THE GLOBE. `photorealAdoption` talks to the controller
 *      directly, and until now nothing re-lit the chips outside a click — so
 *      the first public visit spent its session on Google's mesh under a lit
 *      "SATELLITE" chip and a SAT badge.
 *   2. THE HAND, NOT THE STILLNESS. The purchase now starts on the reader's
 *      first touch of the canvas rather than on the rest that follows it.
 *   3. ONE SURFACE ON THE SECOND VISIT. The verdict is remembered, so a reader
 *      who already has the mesh opens on it instead of building a basemap and
 *      throwing it away.
 *
 * WHAT THIS COSTS, because it is the reason the whole feature exists: every
 * adoption is one ion "root tile", metered per reader. This run spends TWO —
 * one for the adoption, one for the reload that proves the memory works. Do
 * not put it in a loop.
 *
 * Run:  npm run build && npm run preview &   (or: npm run dev)
 *       node scripts/qa-photoreal-handover.mjs --url http://localhost:4173
 */
import fs from 'node:fs';
import puppeteer from 'puppeteer';
import { newQaPage } from './lib/qa-first-run.mjs';

const argv = process.argv.slice(2);
const getOpt = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const APP_URL = getOpt('--url', process.env.QA_BASE_URL || 'http://localhost:4173');
const HEADFUL = argv.includes('--headful');

/** The ion endpoint that IS the bill. One successful GET is one root tile. */
const ROOT_TILE_URL = /api\.cesium\.com\/v1\/assets\/2275207\/endpoint/;

const failures = [];
const check = (name, passed, detail = '') => {
  console.log(`  [${passed ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`);
  if (!passed) failures.push(name);
};

const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH
  || (() => { try { return puppeteer.executablePath(); } catch { return null; } })();
if (!executablePath || !fs.existsSync(executablePath)) {
  throw new Error('Puppeteer Chrome for Testing is unavailable');
}

/** What the app thinks it is showing, and what the tray says it is showing. */
const readState = (page) => page.evaluate(() => {
  const gev = window.__godsEyeView;
  const controller = gev?.mapStackController;
  const pressed = [...document.querySelectorAll('#map-stack-chips [data-stack-id]')]
    .filter((chip) => chip.getAttribute('aria-pressed') === 'true')
    .map((chip) => chip.dataset.stackId);
  return {
    activeId: controller?.getActiveId?.() ?? null,
    chipPressed: pressed,
    badge: document.getElementById('map-stack-status')?.textContent?.trim() ?? null,
    armed: gev?.photorealAdoption?.isArmed?.() ?? null,
    spent: gev?.photorealAdoption?.isSpent?.() ?? null,
    globeShow: gev?.viewer?.scene?.globe?.show ?? null,
    hasTileset: !!gev?.tileset,
  };
});

const browser = await puppeteer.launch({
  headless: HEADFUL ? false : 'new',
  executablePath,
  args: ['--use-angle=metal', '--enable-gpu', '--no-sandbox', '--window-size=1280,800'],
});

try {
  // `photoreal: true` — this harness is one of the 28 that measure something
  // AGAINST the 3D globe, so it opts back into the purchase the fleet default
  // switched off.
  const page = await newQaPage(browser, { photoreal: true });
  await page.setViewport({ width: 1280, height: 800 });

  let rootTiles = 0;
  page.on('response', (response) => {
    if (ROOT_TILE_URL.test(response.url()) && response.request().method() === 'GET'
      && response.status() < 400) rootTiles += 1;
  });

  // -----------------------------------------------------------------------
  // First visit
  // -----------------------------------------------------------------------
  console.log(`\nFIRST VISIT — ${APP_URL}`);
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__godsEyeView?.mapStackController, { timeout: 90_000 });

  const opened = await readState(page);
  check('opens on the keyless satellite stack', opened.activeId === 'ign-ortho', opened.activeId);
  check('the tray agrees with the globe at boot',
    opened.chipPressed.join(',') === 'ign-ortho', `pressed: ${opened.chipPressed.join(',') || 'none'}`);
  check('nothing is bought on arrival', rootTiles === 0, `${rootTiles} root tile(s)`);

  // The opening flight descends to 600 m by itself; the watch is armed at its
  // end, never tripped by it.
  await page.waitForFunction(() => window.__godsEyeView?.photorealAdoption?.isArmed?.() === true,
    { timeout: 60_000 });
  const armed = await readState(page);
  check('the boot descent arms the watch, it does not trip it',
    armed.armed === true && rootTiles === 0, `${rootTiles} root tile(s) after a 600 m arrival`);

  // Sample the handover from inside the page: the question is whether the
  // basemap the reader was looking at survives until the mesh has geometry.
  await page.evaluate(() => {
    window.__qaHandover = [];
    window.__qaSampler = setInterval(() => {
      const gev = window.__godsEyeView;
      const tileset = gev?.tileset;
      window.__qaHandover.push({
        t: Date.now(),
        activeId: gev?.mapStackController?.getActiveId?.() ?? null,
        globeShow: gev?.viewer?.scene?.globe?.show ?? null,
        tilesLoaded: tileset?.tilesLoaded ?? null,
        // The mechanism, not the symptom: a hidden tileset that requests
        // nothing means `preloadWhenHidden` did not take and the wait is pure
        // delay. Sustained pending requests while `show === false` is the
        // proof that the mesh really is warming up behind the basemap.
        pending: tileset?.statistics?.numberOfPendingRequests ?? null,
        preloading: tileset ? (tileset.show === false && tileset.preloadWhenHidden === true) : null,
      });
    }, 50);
  });

  // ONE synthetic wheel on the canvas. Not a camera move — the point is that
  // the app no longer waits for one.
  const touchedAt = Date.now();
  await page.evaluate(() => {
    const canvas = window.__godsEyeView?.viewer?.scene?.canvas;
    canvas?.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -120 }));
  });
  await page.waitForFunction(
    () => window.__godsEyeView?.mapStackController?.getActiveId?.() === 'photoreal',
    { timeout: 60_000 },
  );
  const adoptedMs = Date.now() - touchedAt;
  await page.evaluate(() => { clearInterval(window.__qaSampler); });

  const adopted = await readState(page);
  check('one touch buys the globe, with no rest in between',
    adopted.activeId === 'photoreal', `${adoptedMs} ms after the wheel`);
  check('exactly one root tile is spent', rootTiles === 1, `${rootTiles}`);
  check('THE TRAY FOLLOWS THE GLOBE',
    adopted.chipPressed.join(',') === 'photoreal',
    `pressed: ${adopted.chipPressed.join(',') || 'none'}, badge: ${adopted.badge}`);
  check('the badge stops saying SAT', (adopted.badge || '').toLowerCase() !== 'sat', adopted.badge);

  const samples = await page.evaluate(() => window.__qaHandover);
  const flip = samples.findIndex((s) => s.globeShow === false);
  const lastBefore = flip > 0 ? samples[flip - 1] : null;
  check('the old basemap stays on screen while the mesh warms up',
    flip > 0 && lastBefore?.globeShow === true,
    flip > 0 ? `globe hidden ${flip * 50} ms in, mesh tilesLoaded=${samples[flip].tilesLoaded}` : 'never flipped',
  );
  const warming = samples.filter((s) => s.preloading === true && s.pending > 0);
  check('the mesh really streams behind it, rather than the wait being pure delay',
    warming.length > 0,
    `${warming.length} samples with a hidden tileset requesting tiles, peak ${Math.max(0, ...warming.map((s) => s.pending))} in flight`,
  );
  const drained = flip > 0 && (samples[flip].tilesLoaded === true || samples[flip].pending === 0);
  check('and it is not handed over to an empty mesh',
    drained || (flip > 0 && flip * 50 >= 2400),
    flip > 0
      ? `tilesLoaded=${samples[flip].tilesLoaded}, pending=${samples[flip].pending} at the swap${drained ? '' : ' (guard)'}`
      : 'n/a',
  );

  // The share link carried the SAME stale label as the chip: `map=ign-ortho`
  // under a reader looking at Google's mesh. The write is debounced, so this
  // waits for it rather than reading the hash on the next line.
  let shareFollowed = true;
  await page.waitForFunction(() => window.location.hash.includes('map=photoreal'), { timeout: 20_000 })
    .catch(() => { shareFollowed = false; });
  check('the share link follows the globe', shareFollowed,
    await page.evaluate(() => (window.location.hash.match(/map=[^&]*/) || ['none'])[0]));

  // -----------------------------------------------------------------------
  // Second visit — same profile, so the verdict is still there
  // -----------------------------------------------------------------------
  console.log('\nSECOND VISIT (reload, same reader)');
  const stacksBuilt = [];
  await page.evaluateOnNewDocument(() => {
    window.__qaStacks = [];
    window.addEventListener('gev:map-stack-changed', (event) => {
      if (event.detail?.status === 'ready') window.__qaStacks.push(event.detail.activeId);
    });
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__godsEyeView?.mapStackController, { timeout: 90_000 });
  const second = await readState(page);
  stacksBuilt.push(...await page.evaluate(() => window.__qaStacks || []));

  check('the second visit opens on the 3D globe directly',
    second.activeId === 'photoreal', second.activeId);
  check('ONE surface is built, not two',
    !stacksBuilt.includes('ign-ortho'), `switches after boot: ${stacksBuilt.join(',') || 'none'}`);
  check('the tray is right on arrival too',
    second.chipPressed.join(',') === 'photoreal', `pressed: ${second.chipPressed.join(',') || 'none'}`);
  check('the watch is not installed for a reader who already has the globe',
    second.armed === null, `armed: ${second.armed}`);
  check('the second visit costs the same one root tile a touch would have',
    rootTiles === 2, `${rootTiles} total across both visits`);
} finally {
  await browser.close();
}

console.log(`\n${failures.length ? `FAIL — ${failures.length}: ${failures.join(', ')}` : 'PASS — all checks'}`);
process.exit(failures.length ? 1 : 0);
