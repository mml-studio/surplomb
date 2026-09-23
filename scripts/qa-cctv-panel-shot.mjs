#!/usr/bin/env node
/**
 * qa-cctv-panel-shot — open one Lyon camera and capture the camera panel.
 *
 * Writes to gitignored qa-shots/: the whole window, the panel alone, and a
 * JSON dump of what the panel says (text of every visible line), so a
 * before/after comparison does not depend on reading pixels.
 *
 * Usage: node scripts/qa-cctv-panel-shot.mjs [--url http://localhost:4173] [--tag before]
 *        [--camera lyon-cwl9018] [--wait-timelapse] [--warm-minutes 7]
 */
import puppeteer from 'puppeteer';
import { newQaPage } from './lib/qa-first-run.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const argv = process.argv;
const arg = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
const base = arg('--url', 'http://localhost:4173');
const tag = arg('--tag', 'shot');
const cameraId = arg('--camera', 'lyon-cwl9018');
const waitTimelapse = argv.includes('--wait-timelapse');
// Minutes to let the server's recorder fill before the browser opens. The
// first request arms it (on-demand mode), then it adds about a frame a minute.
const warmMinutes = Number(arg('--warm-minutes', '0')) || 0;
const outDir = new URL('../qa-shots/', import.meta.url);
mkdirSync(outDir, { recursive: true });
const out = (name) => new URL(`cctv-${tag}-${name}`, outDir).pathname;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (warmMinutes > 0) {
  const manifestUrl = `${base.replace(/\/$/, '')}/api/cctv/timelapse/${encodeURIComponent(cameraId)}`;
  const deadline = Date.now() + warmMinutes * 60_000;
  let frames = 0;
  while (Date.now() < deadline) {
    try {
      const resp = await fetch(manifestUrl, { cache: 'no-store' });
      const body = await resp.json().catch(() => ({}));
      frames = Array.isArray(body.frames) ? body.frames.length : 0;
      console.log(`[warm] ${resp.status} recording=${body.recording} frames=${frames}`);
      if (frames >= 6) break;
    } catch (error) {
      console.log('[warm] manifest error', error?.message || error);
    }
    await sleep(30_000);
  }
}

const browser = await puppeteer.launch({
  headless: 'new',
  protocolTimeout: 300_000,
  args: [
    '--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900',
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
  ],
});
try {
  const page = await newQaPage(browser);
  page.on('console', (msg) => {
    const text = msg.text();
    if (/cctv|timelapse/i.test(text)) console.log('[page]', text);
  });
  await page.setViewport({ width: 1440, height: 900 });
  const url = `${base.replace(/\/$/, '')}/globe?welcome=0&photoreal=0#lat=45.7578&lon=4.8320&alt=3000&heading=0&pitch=-60`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__godsEyeView?.dataManager, { timeout: 120_000 });
  await sleep(8_000);

  await page.evaluate(async () => {
    const dm = window.__godsEyeView.dataManager;
    const entry = dm.layers.get('cctv');
    if (!entry.enabled) await dm.toggle('cctv');
  });
  await page.waitForFunction(
    () => (window.__godsEyeView.dataManager.layers.get('cctv').module.getUIState().cameras || []).length > 0,
    { timeout: 90_000 },
  );
  const ids = await page.evaluate(() => window.__godsEyeView.dataManager.layers.get('cctv').module
    .getUIState().cameras.map((c) => c.id).filter((id) => id.startsWith('lyon-')));
  console.log('Lyon cameras in the catalog:', ids.join(', ') || '(none)');
  const target = ids.includes(cameraId) ? cameraId : ids[0];
  if (!target) throw new Error('no Lyon camera in the catalog');

  await page.evaluate((id) => {
    window.__godsEyeView.dataManager.layers.get('cctv').module.setParams({ selectedCameraId: id });
  }, target);
  await page.waitForFunction(
    (id) => window.__godsEyeView.dataManager.layers.get('cctv').module.getUIState().activeCameraId === id,
    { timeout: 30_000 },
    target,
  );
  // The live frame, then (when asked) the timelapse player, must have landed.
  await page.waitForFunction(() => {
    const img = document.getElementById('cctv-frame');
    return img && img.complete && img.naturalWidth > 0;
  }, { timeout: 45_000 }).catch(() => console.log('live frame did not load within 45 s'));
  if (waitTimelapse) {
    await page.waitForFunction(() => {
      const wrap = document.getElementById('cctv-frame-wrap');
      return wrap?.dataset.timelapse === 'playing';
    }, { timeout: 60_000 }).catch(() => console.log('timelapse did not start within 60 s'));
    await sleep(2_500);
  } else {
    await sleep(3_000);
  }

  const report = await page.evaluate(() => {
    const panel = document.getElementById('cctv-panel');
    const visible = (el) => {
      if (!el) return false;
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    };
    const lines = [];
    for (const el of panel.querySelectorAll('*')) {
      if (!visible(el)) continue;
      const own = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim();
      if (own) lines.push(`${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}: ${own}`);
    }
    const legend = document.getElementById('map-legend');
    return {
      panelBox: panel.getBoundingClientRect().toJSON(),
      collapsed: panel.classList.contains('collapsed'),
      lines,
      legendVisible: visible(legend),
      legendText: legend && visible(legend) ? legend.innerText : null,
      timelapse: document.getElementById('cctv-frame-wrap')?.dataset.timelapse || null,
    };
  });
  // Proof the loop moves: the clock over the picture, sampled across 1.5 s.
  report.clockSamples = [];
  for (let i = 0; i < 6; i += 1) {
    report.clockSamples.push(await page.evaluate(() => document.getElementById('cctv-timelapse-clock')?.textContent || null));
    await sleep(250);
  }
  writeFileSync(out('report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  await page.screenshot({ path: out('window.png') });
  const box = report.panelBox;
  if (box.width > 0 && box.height > 0) {
    await page.screenshot({
      path: out('panel.png'),
      clip: { x: Math.max(0, box.x - 4), y: Math.max(0, box.y - 4), width: box.width + 8, height: Math.min(900 - box.y, box.height + 8) },
    });
  }
  console.log(`saved ${out('window.png')} and ${out('panel.png')}`);
} finally {
  await browser.close();
}
