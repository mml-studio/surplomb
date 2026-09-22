#!/usr/bin/env node
/**
 * Which host the satellite base beyond France asks, on a running build.
 *
 * The unit tests pin the rule (src/data/worldImagery.test.mjs); this is the
 * network log that proves a page follows it. The anonymous Esri endpoint is not
 * available for commercial use and its tiles are fetched by the browser, so the
 * only proof that a commercial deployment never asks it is a browser that
 * watched every request and saw none.
 *
 *   npm run build
 *   GEV_NONCOMMERCIAL_SOURCES=off npx vite preview --port 4395 --strictPort &
 *   node scripts/qa-world-imagery-licence.mjs --url http://localhost:4395 --expect off
 *
 * `--expect`:
 *   off       no ARCGIS_API_KEY, switch off: zero Esri requests, Sentinel-2 drawn
 *   on        no ARCGIS_API_KEY, switch unset: the anonymous endpoint, as before
 *   licensed  a build with ARCGIS_API_KEY: ibasemaps with `token`, never the
 *             anonymous endpoint, whatever the switch says
 *
 * `--shots <dir>` writes the canvas (read inside `postRender`, which is what
 * works when the scene has parked itself) and the state it checked there.
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { newQaPage } from './lib/qa-first-run.mjs';

const args = process.argv.slice(2);
const option = (flag, fallback) => {
  const at = args.indexOf(flag);
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback;
};
const APP_URL = option('--url', 'http://localhost:4173').replace(/\/$/, '');
const EXPECT = option('--expect', 'off');
const SHOTS = option('--shots', '');
if (!['off', 'on', 'licensed'].includes(EXPECT)) {
  console.error(`--expect must be off, on or licensed, not ${EXPECT}`);
  process.exit(2);
}

// Mid-Atlantic from 4,000 km: no IGN tile anywhere in the frame, so every
// pixel of ground is the world base, and the view never hides it.
const HASH = 'lat=42&lon=-25&alt=4000000&heading=0&pitch=-90&map=ign-ortho';

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
const hosts = { anonymous: [], licensed: [], eox: [] };
const classify = (url) => {
  if (/(^|\/\/)([a-z0-9-]+\.)*arcgisonline\.com\//i.test(url)) return 'anonymous';
  if (/\/\/ibasemaps-api\.arcgis\.com\//i.test(url)) return 'licensed';
  if (/\/\/tiles\.maps\.eox\.at\//i.test(url)) return 'eox';
  return null;
};

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await puppeteer.launch({
  headless: 'shell',
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || puppeteer.executablePath(),
  args: [
    '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--window-size=1280,800',
  ],
});
try {
  const page = await newQaPage(browser);
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  // Listening only: request interception freezes Cesium's workers.
  page.on('request', (request) => {
    const kind = classify(request.url());
    if (kind) hosts[kind].push(request.url());
  });

  console.log(`World imagery licence — ${APP_URL}, expecting "${EXPECT}"`);
  await page.goto(`${APP_URL}/globe?welcome=0&photoreal=0#${HASH}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => Boolean(window.__godsEyeView?.mapStackController), { timeout: 90_000 });
  // Long enough for the base to fill the frame and for a late `/api/trial`
  // answer to have been applied.
  for (let waited = 0; waited < 20_000; waited += 1_000) {
    await page.evaluate(() => window.__godsEyeView.viewer.scene.requestRender());
    await sleep(1_000);
    if (waited >= 8_000 && (await page.evaluate(() => window.__godsEyeView.viewer.scene.globe.tilesLoaded))) break;
  }

  const state = await page.evaluate(() => {
    const controller = window.__godsEyeView.mapStackController;
    const display = window.__godsEyeView.viewer.creditDisplay;
    const credits = [...(display._staticCredits || [])].map((credit) => credit.html);
    const screen = document.getElementById('cesium-credits')?.innerText || '';
    return {
      activeId: controller.getActiveId(),
      kind: controller.getWorldImageryKind(),
      popover: credits.filter((html) => /Worldwide satellite base/.test(html)),
      screen,
    };
  });
  console.log(`  stack ${state.activeId}, world base ${state.kind}`);
  console.log(`  requests: anonymous Esri ${hosts.anonymous.length}, licensed Esri ${hosts.licensed.length}, EOX ${hosts.eox.length}`);

  check('the Satellite stack is on screen', state.activeId === 'ign-ortho', state.activeId);
  const popoverNames = (pattern) => state.popover.some((html) => pattern.test(html));
  if (EXPECT === 'off') {
    check('no request to the anonymous Esri endpoint', hosts.anonymous.length === 0, hosts.anonymous[0] || '');
    check('no request to the licensed endpoint either (no key)', hosts.licensed.length === 0);
    check('Sentinel-2 tiles were drawn', hosts.eox.length > 0, `${hosts.eox.length} tiles`);
    // 2016, the one CC BY vintage that covers the world (2017 is Europe only).
    check('every one from the worldwide 2016 vintage', hosts.eox.every((url) => url.includes('/s2cloudless_3857/')));
    check('the controller says Sentinel-2', state.kind === 's2cloudless', state.kind);
    check('the popover no longer credits Esri', !popoverNames(/Esri World Imagery/), `${state.popover.length} world-base line(s)`);
    check('the popover credits Sentinel-2', popoverNames(/Sentinel-2 cloudless 2016/));
  } else if (EXPECT === 'on') {
    check('the anonymous Esri endpoint is asked, as before', hosts.anonymous.length > 0, `${hosts.anonymous.length} tiles`);
    check('no request to the licensed endpoint (no key)', hosts.licensed.length === 0);
    check('the controller says anonymous Esri', state.kind === 'esri-anonymous', state.kind);
    check('the popover credits the anonymous endpoint', popoverNames(/\(keyless\)/));
    check('the popover does not claim a licence it has not got', !popoverNames(/ArcGIS Location Platform/));
  } else {
    check('no request to the anonymous Esri endpoint', hosts.anonymous.length === 0, hosts.anonymous[0] || '');
    check('the licensed endpoint is asked with a token', hosts.licensed.length > 0 && hosts.licensed.every((url) => /[?&]token=/.test(url)), `${hosts.licensed.length} tiles`);
    check('the popover credits ArcGIS Location Platform', popoverNames(/ArcGIS Location Platform/));
    check('"Powered by Esri" is on screen while the layer draws', state.kind !== 'esri-licensed' || /Powered by Esri/.test(state.screen), state.kind);
  }

  if (SHOTS) {
    fs.mkdirSync(SHOTS, { recursive: true });
    // Read inside `postRender`, while the frame just drawn is still the
    // drawing buffer: outside it, a `lite` profile (no preserved buffer) can
    // hand back a black canvas.
    const jpeg = await page.evaluate(() => new Promise((resolve) => {
      const { viewer } = window.__godsEyeView;
      const remove = viewer.scene.postRender.addEventListener(() => {
        remove();
        resolve(viewer.canvas.toDataURL('image/jpeg', 0.85).split(',')[1]);
      });
      viewer.scene.requestRender();
    }));
    const file = path.join(SHOTS, `world-base-${EXPECT}.jpg`);
    fs.writeFileSync(file, Buffer.from(jpeg, 'base64'));
    fs.writeFileSync(path.join(SHOTS, `world-base-${EXPECT}.json`), `${JSON.stringify({ ...state, requests: {
      anonymous: hosts.anonymous.length, licensed: hosts.licensed.length, eox: hosts.eox.length,
      sample: (hosts.anonymous[0] || hosts.licensed[0] || hosts.eox[0] || '').replace(/token=[^&]+/, 'token=…'),
    } }, null, 2)}\n`);
    console.log(`  shot: ${file}`);
  }
} finally {
  await browser.close();
}

const failed = results.filter((result) => !result.ok).length;
console.log(failed ? `\n${failed} of ${results.length} checks failed` : `\nAll ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
