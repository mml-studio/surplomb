#!/usr/bin/env node
/**
 * Read the English globe and report the French left on screen.
 *
 * The ratchets (`src/i18n/i18nRatchet.test.mjs`) count French in the SOURCE,
 * file by file. They cannot see what a reader sees: a string can be in a
 * catalog and still reach the screen in French — an untranslated leaf, a
 * `labelFor` falling back to its raw value, a date formatted with 'fr-FR'
 * four calls away. This harness opens `/globe?lang=en`, turns the layers on,
 * harvests the VISIBLE text of the document, and runs the same detector the
 * ratchets use over it.
 *
 * Advisory by default — it reports and exits 0 — because it runs while the
 * globe is being translated batch by batch. `--strict` makes it fail, which
 * is how the last pull request of the campaign will wire it into CI.
 *
 *   npm run qa:i18n-en -- --url http://127.0.0.1:4147
 *   npm run qa:i18n-en -- --layers dvf-sales,dpe-fr --view 48.8566,2.3522,1200
 *   npm run qa:i18n-en -- --strict --allow "Vélib’,Saint-Étienne"
 *   npm run qa:i18n-en -- --closed        # harvest without opening the panels
 *
 * Place names are French and legitimate on an English screen; the glossary's
 * proper nouns are already accepted (src/i18n/glossary.js), the rest go in
 * `--allow`. Every finding names the element it came from, so a false
 * positive is cheap to read and to add.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import puppeteer from 'puppeteer';
import { newQaPage } from './lib/qa-first-run.mjs';
import { findFrench } from '../src/i18n/frenchDetector.js';

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : (args[index + 1] ?? '');
};
const has = (name) => args.includes(`--${name}`);

const APP_URL = (flag('url', process.env.GEV_QA_URL || 'http://localhost:4173')).replace(/\/$/, '');
const LAYERS = (flag('layers', '') || '').split(',').map((id) => id.trim()).filter(Boolean);
const ALLOW = (flag('allow', '') || '').split(',').map((word) => word.trim()).filter(Boolean);
const VIEW = (flag('view', '') || '').split(',').map(Number).filter((n) => Number.isFinite(n));
const OUT_DIR = flag('out', path.join('.context', 'qa', 'i18n-en'));
const STRICT = has('strict');
const HEADFUL = has('headful');

/** Text a reader can actually see, with the element it came from. */
function harvestVisibleText() {
  const seen = [];
  const skipTags = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TITLE']);
  const visible = (element) => {
    if (!element) return false;
    if (element.getClientRects().length === 0) return false;
    const style = window.getComputedStyle(element);
    return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.05;
  };
  const describe = (element) => {
    const parts = [];
    for (let node = element; node && node.nodeType === 1 && parts.length < 4; node = node.parentElement) {
      const id = node.id ? `#${node.id}` : '';
      const cls = typeof node.className === 'string' && node.className.trim()
        ? `.${node.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '';
      parts.unshift(`${node.tagName.toLowerCase()}${id}${cls}`);
      if (id) break;
    }
    return parts.join(' > ');
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue?.trim();
    if (!text || text.length < 2) continue;
    const element = node.parentElement;
    if (!element || skipTags.has(element.tagName)) continue;
    // Material Symbols render their ligature name as an icon, not as a word.
    if (element.classList?.contains('material-symbols-outlined')) continue;
    if (!visible(element)) continue;
    seen.push({ text, where: describe(element), kind: 'text' });
  }
  for (const element of document.querySelectorAll('[aria-label], [title], [placeholder], [alt]')) {
    if (!visible(element)) continue;
    for (const attribute of ['aria-label', 'title', 'placeholder', 'alt']) {
      const value = element.getAttribute(attribute)?.trim();
      if (value && value.length > 1) seen.push({ text: value, where: `${describe(element)}[${attribute}]`, kind: attribute });
    }
  }
  return seen;
}

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

async function main() {
  const chrome = process.env.PUPPETEER_EXECUTABLE_PATH || puppeteer.executablePath();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await puppeteer.launch({
    // `headless: 'new'` stops painting on this machine; `shell` still does.
    headless: HEADFUL ? false : 'shell',
    executablePath: chrome,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--window-size=1600,1000'],
    defaultViewport: { width: 1600, height: 1000 },
  });
  const findings = [];
  try {
    const page = await newQaPage(browser, { locale: 'en' });
    page.on('pageerror', (error) => console.log(`  · page error: ${error.message}`));
    console.log(`[qa] i18n-en — ${APP_URL}/globe?lang=en`);
    await page.goto(`${APP_URL}/globe?lang=en`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForFunction(() => Boolean(window.__godsEyeView?.viewer && window.__godsEyeView?.dataManager),
      { timeout: 120_000, polling: 500 });
    const lang = await page.evaluate(() => document.documentElement.lang);
    console.log(`  · <html lang> = ${lang}`);
    if (lang !== 'en') throw new Error(`the page did not open in English (lang="${lang}")`);

    if (VIEW.length >= 2) {
      // `window.Cesium` is a global of the BUILT bundle only; on a dev server
      // the module is never hung on `window`. The camera's own position is a
      // Cartesian3, so its constructor carries `fromDegrees`.
      await page.evaluate(([lat, lon, height]) => {
        const { viewer } = window.__godsEyeView;
        const Cartesian3 = window.Cesium?.Cartesian3 ?? viewer.camera.position.constructor;
        viewer.camera.setView({ destination: Cartesian3.fromDegrees(lon, lat, height || 2000) });
      }, VIEW);
      await sleep(2000);
    }

    for (const id of LAYERS) {
      const known = await page.evaluate((layerId) => Boolean(window.__godsEyeView.dataManager.layers.has(layerId)), id);
      if (!known) { console.log(`  ✗ unknown layer: ${id}`); continue; }
      await page.evaluate((layerId) => window.__godsEyeView.dataManager.setEnabled(layerId, true), id);
      const ready = await page.waitForFunction((layerId) => {
        const status = window.__godsEyeView.dataManager.layers.get(layerId)?.module?.getStats?.()?.status;
        return status && status !== 'loading';
      }, { timeout: 60_000, polling: 1000 }, id).then(() => true).catch(() => false);
      console.log(`  ${ready ? '·' : '✗'} ${id}${ready ? '' : ' — still loading after 60 s'}`);
      await sleep(1500);
    }
    await sleep(2500);

    // A collapsed panel holds text nobody can read, and the harvest skips it —
    // which is how a first version of this scanner read 73 strings and missed
    // every layer name. Open what says it can open, twice: a disclosure often
    // reveals another.
    if (!has('closed')) {
      for (let pass = 0; pass < 2; pass += 1) {
        const opened = await page.evaluate(() => {
          const shut = [...document.querySelectorAll('[aria-expanded="false"]')]
            .filter((element) => element.getClientRects().length > 0);
          for (const element of shut) element.click();
          return shut.length;
        });
        if (!opened) break;
        await sleep(1200);
      }
      await sleep(800);
    }

    // The desktop Layers panel shows ONE group at a time beside its rail
    // (src/data/layerPanelRail.js), so one harvest would read one group's rows
    // and miss the rest. Read each group in turn; the duplicates (the rail,
    // the strip, everything outside the panel) are folded below.
    const harvest = await page.evaluate(harvestVisibleText);
    const railGroups = await page.evaluate(() => (window.__godsEyeView.layerPanelRail
      ? [...document.querySelectorAll('.data-rail-item[data-rail-category]')].map((node) => node.dataset.railCategory)
      : []));
    for (const group of railGroups) {
      await page.evaluate((id) => window.__godsEyeView.layerPanelRail.open(id), group);
      await sleep(300);
      harvest.push(...await page.evaluate(harvestVisibleText));
    }
    console.log(`  · ${harvest.length} visible strings read${railGroups.length ? ` across ${railGroups.length} rail groups` : ''}`);
    const counted = new Set();
    for (const item of harvest) {
      if (counted.has(`${item.where}\u0000${item.text}`)) continue;
      counted.add(`${item.where}\u0000${item.text}`);
      const evidence = findFrench(item.text, { allow: ALLOW });
      if (evidence.length) findings.push({ ...item, evidence: evidence.map((e) => `${e.kind}:${e.match}`) });
    }
    await page.screenshot({ path: path.join(OUT_DIR, 'globe-en.png') });
    fs.writeFileSync(path.join(OUT_DIR, 'findings.json'),
      `${JSON.stringify({ url: APP_URL, layers: LAYERS, read: harvest.length, findings }, null, 2)}\n`);
  } finally {
    await browser.close();
  }

  if (!findings.length) {
    console.log('\n  ✓ no French on the English globe');
    return 0;
  }
  console.log(`\n  ${STRICT ? '✗' : '!'} ${findings.length} string${findings.length > 1 ? 's' : ''} read as French:`);
  for (const finding of findings.slice(0, 60)) {
    console.log(`    ${finding.where}\n      “${finding.text.slice(0, 120)}” — ${finding.evidence.slice(0, 4).join(', ')}`);
  }
  if (findings.length > 60) console.log(`    … and ${findings.length - 60} more (see ${OUT_DIR}/findings.json)`);
  return STRICT ? 1 : 0;
}

main().then((code) => process.exit(code), (error) => {
  console.error(error);
  process.exit(2);
});
