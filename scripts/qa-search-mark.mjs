#!/usr/bin/env node
/**
 * qa-search-mark — type real searches into the place field and shoot what the
 * globe marks (src/searchResultMark.js): a pin on a precise place, the limits
 * of a town, a département or a région.
 * Usage: node scripts/qa-search-mark.mjs [--url http://localhost:4173] [--out qa-shots] [--photoreal]
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

const SEARCHES = [
  { name: 'city', query: 'Biarritz', expect: 'outline' },
  { name: 'address', query: '12 avenue de la Marne, Biarritz', expect: 'pin' },
  { name: 'departement', query: 'Pyrénées-Atlantiques', expect: 'outline' },
  { name: 'region', query: 'Nouvelle-Aquitaine', expect: 'outline' },
];

const browser = await puppeteer.launch({
  headless: 'new',
  protocolTimeout: 300_000,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1600,900'],
});
let failures = 0;
try {
  const page = await newQaPage(browser, { photoreal });
  await page.setViewport({ width: 1600, height: 900 });
  page.on('pageerror', (e) => console.log('pageerror', e.message));
  await page.goto(`${url}/globe?welcome=0${photoreal ? '' : '&photoreal=0'}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__godsEyeView?.styleManager, { timeout: 120_000 });
  await new Promise((r) => setTimeout(r, 12_000));
  let previous = null;
  for (const search of SEARCHES) {
    await page.evaluate((query) => {
      const field = document.getElementById('location-search');
      field.value = query;
      document.getElementById('location-search-form').requestSubmit();
    }, search.query);
    // The geocode (an address also asks Overpass for its building), the
    // flight and the outline: wait for a mark that is not the previous one.
    let state = null;
    for (let i = 0; i < 90; i += 1) {
      await new Promise((r) => setTimeout(r, 500));
      state = await page.evaluate(() => {
        const mark = window.__godsEyeView?.styleManager?._searchResultMark;
        return mark ? mark.current() : null;
      });
      if (state && JSON.stringify(state) !== previous && i >= 8) break;
    }
    await new Promise((r) => setTimeout(r, 2_500));
    previous = JSON.stringify(state);
    await page.evaluate(() => new Promise((resolve) => {
      const v = window.__godsEyeView.viewer;
      let ticks = 0;
      const tick = () => { v.scene.requestRender?.(); if (++ticks < 120) requestAnimationFrame(tick); else resolve(); };
      requestAnimationFrame(tick);
    }));
    await page.mouse.click(1500, 850);
    const file = path.join(outDir, `search-mark-${search.name}.png`);
    await page.screenshot({ path: file });
    const outlineDrawn = await page.evaluate(() => {
      const prims = window.__godsEyeView.viewer.scene.primitives;
      let ground = 0;
      for (let i = 0; i < prims.length; i += 1) if (prims.get(i)?.constructor?.name === 'GroundPolylinePrimitive') ground += 1;
      return ground;
    });
    const ok = state && (search.expect === 'pin' ? state.kind === 'pin' : state.kind === 'outline' && outlineDrawn > 0);
    if (!ok) failures += 1;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${search.name} « ${search.query} » → ${JSON.stringify(state)} groundPolylines=${outlineDrawn} (${file})`);
  }
  // Emptying the field takes the mark away.
  const cleared = await page.evaluate(() => {
    const field = document.getElementById('location-search');
    field.value = '';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    return window.__godsEyeView.styleManager._searchResultMark.current();
  });
  console.log(`${cleared === null ? 'PASS' : 'FAIL'} emptying the field clears the mark`);
  if (cleared !== null) failures += 1;
} finally {
  await browser.close();
}
process.exit(failures ? 1 : 0);
