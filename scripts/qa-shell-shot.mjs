#!/usr/bin/env node
/**
 * qa-shell-shot — capture the globe's chrome (panels, docks, HUD) at a fixed
 * Paris camera, for before/after comparison of the interface shell.
 * Usage: node scripts/qa-shell-shot.mjs [--url http://localhost:4173] [--tag before] [--out qa-shots]
 *        [--width 1600 --height 900] [--phone]
 *
 * `--phone` shoots the phone shell once, as a check that the desktop top row
 * (src/globeShell.js) left it alone.
 */
import puppeteer from 'puppeteer';
import { newPhoneQaPage, newQaPage, phoneUrl } from './lib/qa-first-run.mjs';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv;
const arg = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
const url = arg('--url', 'http://localhost:4173');
const tag = arg('--tag', 'shot');
const outDir = arg('--out', 'qa-shots');
const width = Number(arg('--width', 1600));
const height = Number(arg('--height', 900));
mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({
  headless: 'new',
  protocolTimeout: 300_000,
  args: [
    '--no-sandbox', '--disable-setuid-sandbox', `--window-size=${width},${height}`,
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
  ],
});
try {
  if (argv.includes('--phone')) {
    const phone = await newPhoneQaPage(browser);
    await phone.goto(phoneUrl(`${url.replace(/\/$/, '')}/globe?welcome=0&photoreal=0`), { waitUntil: 'domcontentloaded' });
    await phone.waitForFunction(() => !!window.__godsEyeView?.viewer, { timeout: 120_000 });
    await new Promise((r) => setTimeout(r, 12_000));
    const phoneFile = path.join(outDir, `shell-${tag}-phone.png`);
    await phone.screenshot({ path: phoneFile });
    console.log(`saved ${phoneFile}`);
    console.log(JSON.stringify(await phone.evaluate(() => ({
      shell: document.documentElement.className,
      placeSearchHidden: document.getElementById('place-search')?.hidden,
      topBarHidden: document.getElementById('globe-top-bar')?.hidden,
      formParent: document.getElementById('location-search-form')?.parentElement?.id,
    }))));
    process.exit(0);
  }
  const page = await newQaPage(browser);
  await page.setViewport({ width, height });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto(`${url.replace(/\/$/, '')}/globe?welcome=0&photoreal=0`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__godsEyeView?.viewer, { timeout: 120_000 });
  await new Promise((r) => setTimeout(r, 14_000));
  await page.evaluate(() => {
    const viewer = window.__godsEyeView.viewer;
    viewer.camera.cancelFlight();
    const C = window.Cesium;
    const dest = viewer.scene.globe.ellipsoid.cartographicToCartesian({
      longitude: 2.37 * Math.PI / 180, latitude: 48.815 * Math.PI / 180, height: 1400,
    });
    viewer.camera.setView({ destination: dest, orientation: { heading: 0.35, pitch: -0.55, roll: 0 } });
  });
  await page.evaluate(() => new Promise((resolve) => {
    const v = window.__godsEyeView.viewer;
    let ticks = 0;
    const tick = () => { v.scene.requestRender?.(); if (++ticks < 300) requestAnimationFrame(tick); else resolve(); };
    requestAnimationFrame(tick);
  }));
  await new Promise((r) => setTimeout(r, 1_500));
  const file = path.join(outDir, `shell-${tag}.png`);
  await page.screenshot({ path: file });
  console.log(`saved ${file}`);
  // The same view with each menu of the top row open, when the build has it.
  const opens = [
    ['appearance', '#appearance-toggle'],
    ['search', '#location-search'],
    ['actions', '#more-actions-toggle'],
  ];
  for (const [name, selector] of opens) {
    const present = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el || el.closest('[hidden]')) return false;
      if (el.matches('input')) el.focus(); else el.click();
      return true;
    }, selector);
    if (!present) continue;
    await new Promise((r) => setTimeout(r, 900));
    const openFile = path.join(outDir, `shell-${tag}-${name}.png`);
    await page.screenshot({ path: openFile });
    console.log(`saved ${openFile}`);
    await page.keyboard.press('Escape');
    await page.mouse.click(Math.round(width * 0.62), Math.round(height * 0.55));
    await new Promise((r) => setTimeout(r, 400));
  }
  // A city from the menu: the flight starts, the menu stays open on its landmarks.
  const flew = await page.evaluate(() => {
    const field = document.getElementById('location-search');
    if (!field || field.closest('[hidden]')) return false;
    field.focus();
    const pill = document.querySelector('#place-search [data-location-id="biarritz"]');
    pill?.click();
    return !!pill;
  });
  if (flew) {
    await new Promise((r) => setTimeout(r, 7_000));
    await page.evaluate(() => document.getElementById('location-search')?.focus());
    await new Promise((r) => setTimeout(r, 600));
    const cityFile = path.join(outDir, `shell-${tag}-search-city.png`);
    await page.screenshot({ path: cityFile });
    console.log(`saved ${cityFile}`);
    await page.keyboard.press('Escape');
  }
  // A style with parameters, chosen from its preview.
  const styled = await page.evaluate(() => {
    const toggle = document.getElementById('appearance-toggle');
    if (!toggle || toggle.closest('[hidden]')) return false;
    toggle.click();
    document.querySelector('#appearance-panel .style-btn[data-style="surveillance"]')?.click();
    return true;
  });
  if (styled) {
    await new Promise((r) => setTimeout(r, 1_500));
    const styleFile = path.join(outDir, `shell-${tag}-appearance-nvg.png`);
    await page.screenshot({ path: styleFile });
    console.log(`saved ${styleFile}`);
  }
  const report = await page.evaluate(() => ({
    appearanceOpen: !document.getElementById('appearance-panel')?.hidden,
    paramsVisible: !!document.querySelector('#appearance-styles #param-slider-panel.active'),
    hash: location.hash.slice(0, 400),
    shell: document.documentElement.classList.contains('globe-shell'),
    scope: document.getElementById('scope-toggle')?.getAttribute('aria-pressed'),
    edgeShade: document.getElementById('edge-shade')?.style.background || null,
    hud: document.getElementById('intel-hud')?.classList.contains('active'),
    cctvHidden: document.getElementById('cctv-panel')?.hidden,
  }));
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
