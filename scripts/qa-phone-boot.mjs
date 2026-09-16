#!/usr/bin/env node
/**
 * qa:phone-boot — what a handset gets when it opens the page and touches it once.
 *
 * WHAT THIS PINS, in one run, because these are one decision. A phone is a
 * device the app has to RECOGNISE before it can spend anything on it, and
 * every ceiling downstream is worthless if the recognition fails: a handset
 * that boots as a desktop gets MSAA 4, a four-second flight, a layer holding
 * the scene in continuous render, 848 kB of sky, and Google's mesh bought on
 * its first tap. So check 1 is the recognition and checks 2-8 are what it buys.
 *
 * WHAT THIS RUN COSTS. Zero ion root tiles if the adoption guard works, ONE if
 * it is broken — which is exactly what check 2 is measuring, so the cost is
 * the finding. It is a single tile, not a loop; do not put this in one. The
 * page opens with `{ photoreal: true }` deliberately: with the door shut by
 * the harness there would be nothing to prove.
 *
 * CHECK 6 WAS EXPECTED TO FAIL until the phone shell landed (volet C). It was
 * written first, red, because it was that work's acceptance criterion and a
 * harness added afterwards would have been written to whatever shipped. It
 * passes since `phone.css`.
 *
 * Run:  npm run build && npm run preview
 *       node scripts/qa-phone-boot.mjs --url http://localhost:4173
 */
import puppeteer from 'puppeteer';
import { newPhoneQaPage, phoneUrl } from './lib/qa-first-run.mjs';

const argv = process.argv.slice(2);
const getOpt = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const APP_URL = getOpt('--url', process.env.QA_BASE_URL || 'http://localhost:4173');
const MAX_API = Number(getOpt('--max-api', '3'));
const MAX_LONG_TASKS = Number(getOpt('--max-long-tasks', '6'));
const MAX_LONG_TASK_MS = Number(getOpt('--max-long-task-ms', '1500'));

/** The ion endpoint that IS the bill. One successful GET is one root tile. */
const ROOT_TILE_RE = /api\.cesium\.com\/v1\/assets\/2275207\/endpoint/;
/** The smallest target a finger finds reliably. 44 is the guideline; 40 is the floor. */
const MIN_TOUCH_TARGET_PX = 40;

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
};
const skip = (name, why) => {
  results.push({ name, pass: true, skipped: true });
  console.log(`  [SKIP] ${name} — ${why}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  headless: 'new',
  protocolTimeout: 300_000,
  args: [
    '--no-sandbox', '--disable-setuid-sandbox',
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
  ],
});

try {
  const page = await newPhoneQaPage(browser, { photoreal: true });

  const pageErrors = [];
  page.on('pageerror', (error) => {
    const message = String(error?.message || error);
    // A HARNESS ARTIFACT, not an app fault. Cesium's own
    // `ScreenSpaceEventHandler.handlePointerDown` calls
    // `event.target.setPointerCapture(event.pointerId)` unguarded
    // (`@cesium/engine/Source/Core/ScreenSpaceEventHandler.js:828`), and a
    // synthetic `PointerEvent` has no active pointer to capture — so the tap
    // this harness dispatches throws there and nowhere else. A real finger
    // always has one. Dropping it here keeps check 9 about the app.
    if (/setPointerCapture/.test(message)) return;
    pageErrors.push(message.slice(0, 200));
  });

  const rootTiles = [];
  const apiCalls = [];
  const origin = new URL(APP_URL).origin;
  page.on('request', (req) => {
    const url = req.url();
    if (ROOT_TILE_RE.test(url)) rootTiles.push(url.slice(0, 120));
    // Same-origin `/api/` only: a third-party tile server is somebody else's
    // budget, and what this counts is calls against OUR rate limit — which on
    // a mobile network is shared with every other subscriber behind the CGNAT.
    if (url.startsWith(`${origin}/api/`)) apiCalls.push(url.slice(origin.length, origin.length + 90));
  });

  // Long tasks are the honest measure of "the page is not answering". A rAF
  // sampler cannot see them: it is itself what they block. Comparable between
  // runs of THIS harness only — SwiftShader is not a phone GPU.
  await page.evaluateOnNewDocument(() => {
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
  });

  const t0 = Date.now();
  await page.goto(phoneUrl(APP_URL), { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => !!window.__godsEyeView?.viewer, { timeout: 120_000 });

  // ── 1. The recognition, before anything it pays for ──────────────────────
  const perf = await page.evaluate(() => ({
    ...window.__godsEyeView.getPerfProfileDiagnostics(),
    input: window.__godsEyeView.getInputModeDiagnostics?.() ?? null,
    shellAttr: document.documentElement.getAttribute('data-shell'),
    inputAttr: document.documentElement.getAttribute('data-input'),
  }));
  check(
    'the handset is recognised: lite profile, source `phone`, phone shell',
    perf.profile === 'lite' && perf.source === 'phone'
      && perf.signals?.viewportMinPx === 390
      && perf.shellAttr === 'phone' && perf.inputAttr === 'coarse',
    {
      profile: perf.profile, source: perf.source, viewportMinPx: perf.signals?.viewportMinPx,
      shell: perf.shellAttr, input: perf.inputAttr,
    },
  );

  // ── 7. The camera lands instead of flying ────────────────────────────────
  let settleMs = null;
  try {
    await page.waitForFunction(
      () => window.__godsEyeView?.viewer?.camera?.positionCartographic?.height < 1000,
      { timeout: 3_000 },
    );
    settleMs = Date.now() - t0;
  } catch { /* reported by the check */ }
  check(
    'the camera is parked under 1 000 m within 3 s — no four-second boot flight',
    settleMs !== null,
    { settleMs, height: await page.evaluate(() => Math.round(window.__godsEyeView.viewer.camera.positionCartographic.height)) },
  );

  // Read now, tap later. The tap is the LAST thing this harness does, because
  // everything between here and there is measuring a boot NOBODY TOUCHED —
  // and a gesture releases the HUD's engagement gate, which spends two metered
  // calls that would otherwise land inside the /api budget below and make it
  // measure the harness rather than the product.
  const stack = await page.evaluate(() => ({
    photorealAvailable: !!window.__godsEyeView.mapStackController?.isStackAvailable?.('photoreal'),
    activeId: window.__godsEyeView.mapStackController?.getActiveId?.() ?? null,
    adoption: window.__godsEyeView.photorealAdoption ?? null,
  }));

  // ── 3, 4, 8. The untouched boot window ───────────────────────────────────
  await wait(Math.max(0, 20_000 - (Date.now() - t0)));

  check(
    `at most ${MAX_API} same-origin /api calls in the first 20 s, untouched`,
    apiCalls.length <= MAX_API,
    { n: apiCalls.length, calls: apiCalls },
  );

  const longTasks = await page.evaluate(() => ({ ...window.__qaLongTasks }));
  check(
    `the main thread is not held: ≤ ${MAX_LONG_TASKS} long tasks, ≤ ${MAX_LONG_TASK_MS} ms total`,
    longTasks.count <= MAX_LONG_TASKS && longTasks.totalMs <= MAX_LONG_TASK_MS,
    longTasks,
  );

  const quiet = await page.evaluate(() => ({
    scopePressed: document.getElementById('scope-toggle')?.getAttribute('aria-pressed') ?? null,
    trafficEnabled: !!window.__godsEyeView.dataManager?.isEnabled?.('traffic'),
    holds: window.__godsEyeView.getRenderGovernorDiagnostics().holds,
  }));
  check(
    'nothing holds the scene awake: scope off, traffic off, no render holds',
    quiet.scopePressed === 'false' && quiet.trafficEnabled === false && quiet.holds.length === 0,
    quiet,
  );

  // ── 5. The page fits its own screen ──────────────────────────────────────
  const overflow = await page.evaluate(() => {
    const spillers = [...document.body.querySelectorAll('*')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.right > window.innerWidth + 1
          && getComputedStyle(el).visibility !== 'hidden';
      })
      .slice(0, 12)
      .map((el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}.${[...el.classList].slice(0, 2).join('.')} right=${Math.round(el.getBoundingClientRect().right)}`);
    return { scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth, spillers };
  });
  check(
    'the document does not scroll sideways',
    overflow.scrollWidth <= overflow.innerWidth,
    overflow,
  );

  // ── 6. Targets a finger can hit. RED until the phone shell lands. ────────
  const targets = await page.evaluate((floor) => {
    const offenders = [];
    for (const el of document.querySelectorAll('button, [role=button], a[href], input[type=range], select')) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      // THE ONE EXEMPTION, and it is not ours to take: the attribution links
      // are Cesium's own markup, sized by `widgets.css`, and Google's and
      // Cesium's terms require the notice to be shown AS GIVEN. Enlarging them
      // would be editing a legal notice for ergonomics. `qa:phone-shell` makes
      // the same exception for the same reason.
      if (el.closest('#cesium-credits, .cesium-credit-lightbox')) continue;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      const smallest = Math.min(r.width, r.height);
      if (smallest >= floor) continue;
      offenders.push({
        sel: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : ''}`,
        w: Math.round(r.width), h: Math.round(r.height),
      });
    }
    return offenders;
  }, MIN_TOUCH_TARGET_PX);
  check(
    `every visible control is at least ${MIN_TOUCH_TARGET_PX} px on its short side`,
    targets.length === 0,
    { offenders: targets.length, worst: targets.sort((a, b) => Math.min(a.w, a.h) - Math.min(b.w, b.h)).slice(0, 10) },
  );

  const starfieldLoaded = await page.evaluate(() => !!window.__godsEyeView.starfield?.isLoaded?.());
  check('the 848 kB star field is never paid for', starfieldLoaded === false, { starfieldLoaded });

  // ── 2. One tap must not buy Google's mesh. LAST, for the reason above. ───
  if (!stack.photorealAvailable) {
    skip('one tap does not buy the 3D mesh', 'this build has no photoreal door (keyless / no ion token)');
  } else {
    const before = rootTiles.length;
    // A DOM PointerEvent, not `page.touchscreen`: real Puppeteer input hangs on
    // this app, and what is under test is the listener, not Chromium's input
    // plumbing. `pointerType: 'touch'` is the half that matters — `touchstart`
    // and a touch pointerdown are both in READER_INPUT_EVENTS.
    await page.evaluate(() => {
      const target = document.querySelector('#cesiumContainer canvas') || document.body;
      target.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: true,
      }));
    });
    await wait(5_000);
    const after = await page.evaluate(() => window.__godsEyeView.mapStackController?.getActiveId?.() ?? null);
    check(
      'one tap does not buy the 3D mesh, and no adoption watch was armed',
      stack.adoption === null && stack.activeId === 'ign-ortho'
        && after === 'ign-ortho' && rootTiles.length === before,
      {
        adoptionInstalled: stack.adoption !== null,
        stackAtBoot: stack.activeId,
        stackAfterTap: after,
        rootTilesBought: rootTiles.length - before,
      },
    );
  }

  check('no uncaught error on a phone boot', pageErrors.length === 0, pageErrors.slice(0, 5));
} finally {
  await browser.close();
}

const passed = results.filter((r) => r.pass).length;
console.log(`\nqa:phone-boot ${passed}/${results.length}`);
process.exit(passed === results.length ? 0 : 1);
