#!/usr/bin/env node
/**
 * qa-globe-nav — press every control of the navigation bar (src/globeNav.js)
 * on a real globe and check what the camera did: top view keeps the heading,
 * north turns north up, zoom halves the distance, 2D locks the tilt and levels
 * a search that lands tilted, « Vue précédente » flies back, 3D gives the tilt
 * back, « Réinitialiser » goes out to the globe. Shoots the bar at each step.
 * Usage: node scripts/qa-globe-nav.mjs [--url http://localhost:4173] [--out qa-shots] [--photoreal]
 */
import puppeteer from 'puppeteer';
import { newQaPage } from './lib/qa-first-run.mjs';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv;
const arg = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
const url = arg('--url', 'http://localhost:4173').replace(/\/$/, '');
const outDir = arg('--out', 'qa-shots');
const photoreal = argv.includes('--photoreal');
mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  headless: 'new',
  protocolTimeout: 300_000,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1600,900'],
});
let failures = 0;
const check = (ok, label, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
};

try {
  const page = await newQaPage(browser, { photoreal });
  await page.setViewport({ width: 1600, height: 900 });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto(`${url}/globe?welcome=0${photoreal ? '' : '&photoreal=0'}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__godsEyeView?.styleManager, { timeout: 120_000 });
  await sleep(12_000);

  const camera = () => page.evaluate(() => {
    const v = window.__godsEyeView.viewer;
    const c = v.camera;
    const carto = c.positionCartographic;
    const deg = 180 / Math.PI;
    const canvas = v.scene.canvas;
    const centre = c.pickEllipsoid({ x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 });
    return {
      headingDeg: (((c.heading * deg) % 360) + 360) % 360,
      pitchDeg: c.pitch * deg,
      heightM: carto.height,
      lat: carto.latitude * deg,
      lon: carto.longitude * deg,
      rangeM: centre ? Math.hypot(centre.x - c.positionWC.x, centre.y - c.positionWC.y, centre.z - c.positionWC.z) : null,
      tilt: v.scene.screenSpaceCameraController.enableTilt,
    };
  });
  const press = (id) => page.evaluate((target) => document.getElementById(target)?.click(), id);
  const settle = async (ms = 2_000) => {
    await sleep(ms);
    await page.evaluate(() => new Promise((resolve) => {
      const v = window.__godsEyeView.viewer;
      let ticks = 0;
      const tick = () => { v.scene.requestRender?.(); if (++ticks < 40) requestAnimationFrame(tick); else resolve(); };
      requestAnimationFrame(tick);
    }));
  };
  const bar = () => page.evaluate(() => {
    const nav = document.getElementById('globe-nav');
    const rect = nav?.querySelector('.globe-nav-row')?.getBoundingClientRect();
    const chip = document.getElementById('globe-nav-place');
    return {
      shown: !!nav && !nav.hidden && getComputedStyle(nav).display !== 'none',
      rect: rect ? { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) } : null,
      resetInside: !!nav?.contains(document.getElementById('reset-globe-view')),
      backDisabled: document.getElementById('globe-nav-back')?.disabled,
      topPressed: document.getElementById('globe-nav-top')?.getAttribute('aria-pressed'),
      flatPressed: document.getElementById('globe-nav-2d')?.getAttribute('aria-pressed'),
      chip: chip && !chip.hidden ? chip.textContent.trim() : null,
    };
  });
  const shoot = async (name) => {
    const file = path.join(outDir, `globe-nav-${name}.png`);
    await page.screenshot({ path: file });
    return file;
  };

  let state = await bar();
  check(state.shown, 'the bar is shown on a desktop', JSON.stringify(state.rect));
  check(state.resetInside, '« Réinitialiser » moved into the bar');
  for (let i = 0; i < 20 && !state.chip; i += 1) { await sleep(500); state = await bar(); }
  check(!!state.chip && /Paris/.test(state.chip), 'the chip names Paris at boot', state.chip);
  console.log(`  shot ${await shoot('boot')}`);

  const start = await camera();
  console.log(`  boot camera ${JSON.stringify(start)}`);

  await press('globe-nav-top');
  await settle();
  let cam = await camera();
  state = await bar();
  check(cam.pitchDeg <= -85, '« Vue du dessus » looks straight down', `pitch ${cam.pitchDeg.toFixed(1)}`);
  const kept = Math.abs(((cam.headingDeg - start.headingDeg + 540) % 360) - 180) < 3;
  check(kept, '…and keeps the heading', `${start.headingDeg.toFixed(1)} → ${cam.headingDeg.toFixed(1)}`);
  check(state.topPressed === 'true', '…and shows pressed', state.chip);
  console.log(`  shot ${await shoot('top')}`);

  await press('globe-nav-top');
  await settle();
  cam = await camera();
  check(Math.abs(cam.pitchDeg - start.pitchDeg) < 3, 'pressed again, it tilts back', `pitch ${cam.pitchDeg.toFixed(1)}`);

  await press('globe-nav-north');
  await settle();
  cam = await camera();
  check(cam.headingDeg < 1.5 || cam.headingDeg > 358.5, 'the needle turns north up', `heading ${cam.headingDeg.toFixed(1)}`);
  check(Math.abs(cam.pitchDeg - start.pitchDeg) < 3, '…at the same tilt', `pitch ${cam.pitchDeg.toFixed(1)}`);

  const beforeZoom = await camera();
  await press('globe-nav-zoom-in');
  await settle(1_500);
  cam = await camera();
  const ratio = beforeZoom.rangeM / cam.rangeM;
  check(ratio > 1.7 && ratio < 2.3, '+ halves the distance to the centre', `${Math.round(beforeZoom.rangeM)} → ${Math.round(cam.rangeM)} m`);
  await press('globe-nav-zoom-out');
  await settle(1_500);
  cam = await camera();
  check(Math.abs(cam.rangeM / beforeZoom.rangeM - 1) < 0.15, '− doubles it back', `${Math.round(cam.rangeM)} m`);

  await press('globe-nav-2d');
  await settle();
  cam = await camera();
  state = await bar();
  check(cam.pitchDeg < -88 && (cam.headingDeg < 1.5 || cam.headingDeg > 358.5), '2D: straight down, north up', `pitch ${cam.pitchDeg.toFixed(1)} heading ${cam.headingDeg.toFixed(1)}`);
  check(cam.tilt === false, '2D: the tilt gesture is off');
  check(state.flatPressed === 'true' && /2D/.test(state.chip || ''), '2D: pressed, and the chip says so', state.chip);
  console.log(`  shot ${await shoot('flat')}`);

  // A search lands tilted; 2D levels it once it settles.
  await page.evaluate(() => {
    const field = document.getElementById('location-search');
    field.value = 'Lyon';
    document.getElementById('location-search-form').requestSubmit();
  });
  for (let i = 0; i < 40; i += 1) {
    await sleep(500);
    cam = await camera();
    if (Math.abs(cam.lat - 45.76) < 0.3 && cam.pitchDeg < -88) break;
  }
  await settle(2_500);
  cam = await camera();
  state = await bar();
  check(Math.abs(cam.lat - 45.76) < 0.3, 'the search flew to Lyon', `${cam.lat.toFixed(3)}, ${cam.lon.toFixed(3)}`);
  check(cam.pitchDeg < -88 && (cam.headingDeg < 3 || cam.headingDeg > 357), '2D levelled the landing', `pitch ${cam.pitchDeg.toFixed(1)} heading ${cam.headingDeg.toFixed(1)}`);
  check(/Lyon/.test(state.chip || ''), 'the chip names Lyon', state.chip);
  check(state.backDisabled === false, '« Vue précédente » is available');
  console.log(`  shot ${await shoot('lyon-flat')}`);

  await press('globe-nav-back');
  for (let i = 0; i < 20; i += 1) {
    await sleep(500);
    cam = await camera();
    if (Math.abs(cam.lat - start.lat) < 0.2) break;
  }
  await settle(2_000);
  cam = await camera();
  check(Math.abs(cam.lat - start.lat) < 0.2 && Math.abs(cam.lon - start.lon) < 0.2, '« Vue précédente » flies back to Paris', `${cam.lat.toFixed(3)}, ${cam.lon.toFixed(3)}`);

  await press('globe-nav-3d');
  await settle();
  cam = await camera();
  state = await bar();
  check(cam.tilt === true, '3D gives the tilt back');
  check(cam.pitchDeg > -80, '3D tilts the view', `pitch ${cam.pitchDeg.toFixed(1)}`);
  check(state.flatPressed === 'false', '3D shows pressed', state.chip);
  console.log(`  shot ${await shoot('relief')}`);

  await press('reset-globe-view');
  await settle(5_000);
  cam = await camera();
  state = await bar();
  check(cam.heightM > 10_000_000, '« Réinitialiser » goes out to the whole globe', `${Math.round(cam.heightM / 1000)} km`);
  check(state.chip === null, 'the chip says nothing over the whole globe', String(state.chip));
  console.log(`  shot ${await shoot('globe')}`);

  // Narrow window: the words go, the bar stays on one row.
  await page.setViewport({ width: 1100, height: 760 });
  await settle(1_000);
  state = await bar();
  check(state.rect && state.rect.h <= 50 && state.rect.w < 560, 'at 1100 px the bar keeps one row, icons only', JSON.stringify(state.rect));
  console.log(`  shot ${await shoot('narrow')}`);
} finally {
  await browser.close();
}
process.exit(failures ? 1 : 0);
