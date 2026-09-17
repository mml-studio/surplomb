#!/usr/bin/env node
/**
 * qa:phone-top-down — a phone looks straight down, and one pinch is enough.
 *
 * Owner field test of 2026-09-17, two complaints from one handset:
 *   1. the globe opened "à moitié allongée" — tilted 30° below the horizon,
 *      where a map app looks straight down;
 *   2. a pinch barely zoomed, so getting anywhere took three or four.
 *
 * WHAT IS MEASURED, AND HOW.
 *   - The poses are read off the live Cesium camera, on a handset and on a
 *     desktop from the same build: the phone must change, the desktop must not.
 *   - "Autour de moi" is flown on the handset with a fix injected through CDP.
 *   - The pinch is dispatched as touch PointerEvents on the globe canvas —
 *     real Puppeteer input hangs on this app (see the memory note on
 *     `page.click`), and Cesium reads pointer events directly. Cesium calls
 *     `setPointerCapture` on a pointer a synthetic event does not own, so the
 *     canvas's is stubbed for the gesture. The SAME gesture runs twice from
 *     the SAME pose, once with Cesium's own zoom factor and once with the
 *     app's, so the gain is a ratio read in one run on one machine.
 *
 * WHAT THIS RUN COSTS. Nothing: photoreal off, no layer, no geocode.
 *
 * Run:  npm run build && npx vite preview --port 4391 --strictPort
 *       node scripts/qa-phone-top-down.mjs --url http://localhost:4391
 */
import puppeteer from 'puppeteer';
import { newPhoneQaPage, newQaPage, phoneUrl } from './lib/qa-first-run.mjs';

const argv = process.argv.slice(2);
const getOpt = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const APP_URL = getOpt('--url', process.env.QA_BASE_URL || 'http://localhost:4173');

/** Paris, Sorbonne — the block of the field report. */
const FIX = { latitude: 48.8484, longitude: 2.3431, accuracy: 30 };

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
};

const readPose = (page) => page.evaluate(() => {
  const { camera, scene } = window.__godsEyeView.viewer;
  const deg = (r) => r * 180 / Math.PI;
  const carto = camera.positionCartographic;
  // Distance to the ground under the centre of the screen: what Cesium's zoom
  // scales, and the only height that is comparable across two pinches.
  const centre = { x: scene.canvas.clientWidth / 2, y: scene.canvas.clientHeight / 2 };
  let groundM = null;
  try {
    const ray = camera.getPickRay(centre);
    const hit = scene.globe.pick(ray, scene);
    if (hit) groundM = Math.hypot(hit.x - camera.position.x, hit.y - camera.position.y, hit.z - camera.position.z);
  } catch { /* reported as null */ }
  return {
    pitchDeg: Number(deg(camera.pitch).toFixed(2)),
    headingDeg: Number(deg(camera.heading).toFixed(2)),
    heightM: Math.round(carto.height),
    lat: Number(deg(carto.latitude).toFixed(5)),
    lon: Number(deg(carto.longitude).toFixed(5)),
    groundM: groundM === null ? null : Math.round(groundM),
    zoomFactor: scene.screenSpaceCameraController.zoomFactor,
    inertiaSpin: scene.screenSpaceCameraController.inertiaSpin,
  };
});

/**
 * Wait until the camera has stopped moving for `quietMs`.
 *
 * Polled on a timer, not on animation frames: a page that is not the front
 * tab gets no frames at all, and a wait built on them never returns. That is
 * also why the two pages are measured one after the other, each brought to
 * the front first — Cesium's own render loop is frame-driven too.
 */
const waitForRest = (page, { quietMs = 1200, timeoutMs = 30_000 } = {}) => page.evaluate(
  (quiet, timeout) => new Promise((resolve) => {
    const { camera } = window.__godsEyeView.viewer;
    const started = performance.now();
    let last = camera.position.clone();
    let stillSince = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      const p = camera.position;
      if (Math.hypot(p.x - last.x, p.y - last.y, p.z - last.z) > 0.01) {
        stillSince = now;
        last = p.clone();
      }
      if (now - stillSince >= quiet || now - started >= timeout) {
        clearInterval(timer);
        resolve(now - stillSince >= quiet);
      }
    }, 100);
  }),
  quietMs,
  timeoutMs,
);

/**
 * One two-finger spread on the canvas centre, from `fromPx` to `toPx` of
 * spacing, over `frames` animation frames, with a zoom factor forced first.
 * The camera is parked on `pose` before the gesture so both runs start equal.
 */
const pinch = (page, { zoomFactor, pose, fromPx = 150, toPx = 300, frames = 12 }) => page.evaluate(
  async (factor, parked, from, to, steps) => {
    const { viewer } = window.__godsEyeView;
    const { camera, scene } = viewer;
    const canvas = scene.canvas;
    const rad = (d) => d * Math.PI / 180;
    // `window.Cesium` no longer exists; the camera's own position is a
    // Cartesian3, so its constructor is the class.
    const Cartesian3 = camera.position.constructor;
    camera.setView({
      destination: new Cartesian3(parked.position.x, parked.position.y, parked.position.z),
      orientation: { heading: rad(parked.headingDeg), pitch: rad(parked.pitchDeg), roll: 0 },
    });
    scene.screenSpaceCameraController.zoomFactor = factor;
    const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
    await frame(); await frame();
    const rect = canvas.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const original = canvas.setPointerCapture;
    canvas.setPointerCapture = () => {};
    const fire = (type, id, spacing) => canvas.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerType: 'touch', pointerId: id, isPrimary: id === 11,
      clientX: cx, clientY: cy + (id === 11 ? -spacing / 2 : spacing / 2), buttons: type === 'pointerup' ? 0 : 1,
    }));
    try {
      fire('pointerdown', 11, from);
      fire('pointerdown', 12, from);
      await frame();
      for (let i = 1; i <= steps; i += 1) {
        const spacing = from + ((to - from) * i) / steps;
        fire('pointermove', 11, spacing);
        fire('pointermove', 12, spacing);
        await frame();
      }
      // Held still for a beat before lifting, like a finger that has arrived:
      // Cesium only replays inertia after a press shorter than 0.4 s.
      await new Promise((r) => setTimeout(r, 450));
      fire('pointerup', 11, to);
      fire('pointerup', 12, to);
    } finally {
      canvas.setPointerCapture = original;
    }
    return { canvasHeight: canvas.clientHeight };
  },
  zoomFactor, pose, fromPx, toPx, frames,
);

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
  const phone = await newPhoneQaPage(browser, { photoreal: false });
  const desk = await newQaPage(browser, { photoreal: false });
  await desk.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

  const pageErrors = [];
  phone.on('pageerror', (error) => pageErrors.push(String(error?.message || error).slice(0, 200)));

  await browser.defaultBrowserContext().overridePermissions(new URL(APP_URL).origin, ['geolocation']);
  await phone.setGeolocation(FIX);

  await Promise.all([
    phone.goto(phoneUrl(APP_URL), { waitUntil: 'domcontentloaded', timeout: 120_000 }),
    desk.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 120_000 }),
  ]);
  await Promise.all([
    phone.waitForFunction(() => !!window.__godsEyeView?.viewer, { timeout: 120_000 }),
    desk.waitForFunction(() => !!window.__godsEyeView?.viewer, { timeout: 120_000 }),
  ]);

  // ── 1. The opening pose ──────────────────────────────────────────────────
  await desk.bringToFront();
  await waitForRest(desk, { timeoutMs: 45_000 });
  const deskBoot = await readPose(desk);
  await phone.bringToFront();
  await waitForRest(phone);
  const phoneBoot = await readPose(phone);
  const northUp = (h) => Math.min(h, 360 - h) < 0.5;
  check(
    'a phone opens straight down and north up, over the default point',
    Math.abs(phoneBoot.pitchDeg + 90) < 0.5 && northUp(phoneBoot.headingDeg)
      && Math.abs(phoneBoot.lat - 48.8584) < 0.001 && Math.abs(phoneBoot.lon - 2.2945) < 0.001,
    phoneBoot,
  );
  check(
    'the desktop still opens at -30° heading north-west',
    Math.abs(deskBoot.pitchDeg + 30) < 1 && Math.abs(deskBoot.headingDeg - 315) < 1,
    deskBoot,
  );

  // ── 2. One pinch, before and after ───────────────────────────────────────
  const parked = await phone.evaluate(() => {
    const { camera } = window.__godsEyeView.viewer;
    const deg = (r) => r * 180 / Math.PI;
    const { x, y, z } = camera.position;
    return { position: { x, y, z }, headingDeg: deg(camera.heading), pitchDeg: deg(camera.pitch) };
  });
  const appFactor = phoneBoot.zoomFactor;
  const measure = async (zoomFactor) => {
    await phone.evaluate(async (p) => {
      const { camera } = window.__godsEyeView.viewer;
      const Cartesian3 = camera.position.constructor;
      camera.setView({
        destination: new Cartesian3(p.position.x, p.position.y, p.position.z),
        orientation: { heading: p.headingDeg * Math.PI / 180, pitch: p.pitchDeg * Math.PI / 180, roll: 0 },
      });
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }, parked);
    const start = await readPose(phone);
    const gesture = await pinch(phone, { zoomFactor, pose: parked });
    await waitForRest(phone, { quietMs: 800, timeoutMs: 10_000 });
    const end = await readPose(phone);
    const before = start.groundM ?? start.heightM;
    const after = end.groundM ?? end.heightM;
    return { zoomFactor, before, after, closer: Number((before / after).toFixed(2)), ...gesture };
  };
  const cesiumPinch = await measure(5);
  const appPinch = await measure(appFactor);
  check(
    'a pinch that doubles the finger spacing brings the camera about 2× closer (Cesium alone: ~1.3×)',
    appFactor === 15 && appPinch.closer > 1.7 && appPinch.closer < 2.4
      && cesiumPinch.closer < 1.4 && appPinch.closer > cesiumPinch.closer * 1.4,
    { cesium: cesiumPinch, app: appPinch },
  );
  // Restore the app's own factor for what follows.
  await phone.evaluate((f) => { window.__godsEyeView.viewer.scene.screenSpaceCameraController.zoomFactor = f; }, appFactor);
  check(
    'a throw on glass glides longer than it did, and the desktop keeps Cesium’s tuning',
    phoneBoot.inertiaSpin === 0.85 && deskBoot.inertiaSpin === 0.9 && deskBoot.zoomFactor === 5,
    { phone: phoneBoot.inertiaSpin, desktop: { spin: deskBoot.inertiaSpin, zoomFactor: deskBoot.zoomFactor } },
  );

  // ── 3. "Autour de moi" ───────────────────────────────────────────────────
  await phone.evaluate(() => {
    const el = document.querySelector('#locate-me');
    el?.click();
  });
  let located = null;
  try {
    await phone.waitForFunction(() => /[#&]lat=48\.84/.test(location.hash), { timeout: 25_000, polling: 250 });
    await waitForRest(phone, { quietMs: 800, timeoutMs: 10_000 });
    located = await readPose(phone);
  } catch { /* reported below */ }
  check(
    '"Autour de moi" lands straight down on the fix, at the opening shot’s height',
    located !== null && Math.abs(located.pitchDeg + 90) < 0.5 && northUp(located.headingDeg)
      && Math.abs(located.lat - FIX.latitude) < 0.0005 && Math.abs(located.lon - FIX.longitude) < 0.0005
      && located.heightM > 550 && located.heightM < 750,
    located ?? { hash: await phone.evaluate(() => location.hash.slice(0, 80)) },
  );

  check('no uncaught error on the handset', pageErrors.length === 0, pageErrors.slice(0, 5));
} finally {
  await browser.close();
}

const passed = results.filter((r) => r.pass).length;
console.log(`\nqa:phone-top-down ${passed}/${results.length}`);
process.exit(passed === results.length ? 0 : 1);
