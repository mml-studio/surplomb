#!/usr/bin/env node
/**
 * Browser QA for the ARCEP coverage under the `anfr-fr` masts.
 *
 * Opens the globe over the Mont-Blanc massif with the Antennes row on and the
 * dead-zone mode restored FROM THE SHARE LINK (`lo=an.c.z`), then checks what
 * a reader would see:
 *
 *   1. the coverage block of the key, « Sans 4G » lit, and the row's own tile;
 *   2. an imagery layer on the globe (`getStats().coverage.drawn`);
 *   3. tiles fetched from `/tiles/mobile-coverage/…`, never from `/api`, and
 *      none of them a 404 (the client reads the meta's index before asking);
 *   4. the key's coverage block and its quarter;
 *   5. a painted pixel on screen in the ramp's magenta, i.e. the tiles really
 *      decoded and recoloured.
 *
 * Then switches to Orange through `setParams`, as the chip does, and checks the
 * layer swapped. Screenshots go to `qa-shots/mobile-coverage/`.
 *
 * `--photoreal` runs the same checks on Google's mesh instead of the globe:
 * the coverage draped on the tileset (`coverage.draped`), the magenta on the
 * mesh, a click on the mesh that stands the card on it, and the frame cost of
 * the drape. It spends ONE Cesium ion session (the root tile), so it is opt-in;
 * the line of sight is skipped there, it is still drawn on the globe only.
 *
 * Needs a server that HAS the pyramid (`node scripts/build-mobile-coverage.mjs`):
 * without one the harness stops at step 1 and says so.
 *
 * Usage:
 *   node scripts/qa-mobile-coverage.mjs --url http://127.0.0.1:4417 [--photoreal]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import sharp from 'sharp';
import { newQaPage } from './lib/qa-first-run.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const SHOTS_DIR = path.join(REPO_ROOT, 'qa-shots', 'mobile-coverage');
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const APP_URL = option('--url', process.env.QA_BASE_URL || 'http://localhost:4173');
const HEADFUL = args.includes('--headful');
const PHOTOREAL = args.includes('--photoreal');
const SHOT_PREFIX = PHOTOREAL ? 'photoreal-' : '';

/** Chamonix and the Mont-Blanc massif from 22 km: valleys served, summits not. */
const VIEW = { lat: 45.86, lon: 6.88, alt: 22_000, heading: 0, pitch: -50 };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let failures = 0;
function check(label, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

async function render(page, frames = 10) {
  for (let i = 0; i < frames; i += 1) {
    await page.evaluate(() => { try { window.__godsEyeView?.viewer?.scene?.render(); } catch { /* stalled */ } });
    await sleep(120);
  }
}

/**
 * Pixels of a screenshot that read as the ramp's magenta over any basemap:
 * red high, green well under it, blue in between. Compared between the
 * coverage on and off, so the basemap's own pinks cancel out.
 */
async function magentaPixels(file) {
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  let count = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i]; const g = data[i + 1]; const b = data[i + 2];
    if (r > 170 && r - g > 90 && b > 70 && b < r) count += 1;
  }
  return count / (info.width * info.height);
}

/** Wait for Google's mesh to finish streaming the view, when it is the surface. */
async function meshSettled(page, timeoutMs = 60_000) {
  if (!PHOTOREAL) return true;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const loaded = await page.evaluate(() => {
      const tileset = window.__godsEyeView?.tileset;
      try { window.__godsEyeView?.viewer?.scene?.render(); } catch { /* stalled */ }
      return Boolean(tileset?.show && tileset.tilesLoaded);
    });
    if (loaded) return true;
    await sleep(1_000);
  }
  return false;
}

/** Mean `scene.render()` time, in ms, over `frames` forced frames. */
async function frameMs(page, frames = 30) {
  return page.evaluate((count) => {
    const scene = window.__godsEyeView.viewer.scene;
    scene.render();
    const start = performance.now();
    for (let i = 0; i < count; i += 1) scene.render();
    return (performance.now() - start) / count;
  }, frames);
}

async function coverageState(page) {
  return page.evaluate(() => {
    const module = window.__godsEyeView?.dataManager?.layers?.get('anfr-fr')?.module;
    if (!module?.getRowControls) return null;
    const controls = module.getRowControls();
    const block = (controls.legendBlocks || []).find((entry) => entry.key === 'coverage') || null;
    return {
      stats: module.getStats?.().coverage ?? null,
      params: module.getParams?.() ?? null,
      // The coverage is its own block of the key since 2026-09-22, with
      // segments instead of the five chips it had on the row.
      segments: (block?.legendSegments || []).map((segment) => ({ label: segment.label, active: segment.active })),
      subSegments: (block?.legendSubSegments || []).map((segment) => segment.label),
      tile: document.querySelector('.map-legend-tile[data-tile-layer="anfr-fr"]')?.getAttribute('aria-pressed') ?? null,
      // The masts' classes and the coverage's, in the order the key prints them.
      legend: [...controls.legend, ...(block?.legend || [])].map((entry) => entry.label),
      note: block?.note ?? null,
    };
  });
}

async function main() {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  // The system Chrome on Metal, as `capture-landing-gallery.mjs` launches it:
  // Chrome for Testing's headless mode renders no frames on this Mac, so the
  // boot veil never fades and every screenshot is the loading screen.
  const systemChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const browser = await puppeteer.launch({
    headless: HEADFUL ? false : 'new',
    ...(fs.existsSync(systemChrome) ? { executablePath: systemChrome } : {}),
    args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows', '--window-size=1280,800'],
    defaultViewport: { width: 1280, height: 800 },
    protocolTimeout: 180_000,
  });
  const tiles = [];
  try {
    // The photoreal door is closed by default: it bills a root tile per boot.
    const page = await newQaPage(browser, PHOTOREAL ? { photoreal: true } : {});
    page.on('response', (response) => {
      const url = response.url();
      if (url.includes('mobile-coverage')) tiles.push({ url, status: response.status() });
    });
    const hash = `lat=${VIEW.lat}&lon=${VIEW.lon}&alt=${VIEW.alt}&heading=${VIEW.heading}&pitch=${VIEW.pitch}`
      + '&v=2&l=an&lo=an.c.z' + (PHOTOREAL ? '&map=photoreal' : '');
    const url = `${APP_URL}/globe?welcome=0${PHOTOREAL ? '' : '&photoreal=0'}#${hash}`;
    console.log(`→ ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });

    let state = null;
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      state = await coverageState(page).catch(() => null);
      if (state?.stats?.drawn && (!PHOTOREAL || state.stats.draped)) break;
      if (state?.stats?.status === 'missing' || state?.stats?.status === 'failed') break;
      await sleep(2_000);
    }
    console.log('\nRestored from the link');
    check('the layer restored the dead-zone mode from `lo=an.c.z`', state?.params?.coverage === 'gaps',
      JSON.stringify(state?.params));
    if (!check('the server has a coverage pyramid', state?.stats?.status === 'ready', `status ${state?.stats?.status}`)) {
      console.log('  Build it first: node scripts/build-mobile-coverage.mjs');
      return;
    }
    check('the coverage block has its two modes, « Sans 4G » lit',
      state.segments.length === 2 && state.segments[0].active === true,
      state.segments.map((segment) => `${segment.label}:${segment.active}`).join(' '));
    check('the Antennes tile in the key is lit', state.tile === 'true', String(state.tile));
    check('an imagery layer is on the globe', state.stats.drawn === true);
    if (PHOTOREAL) {
      const stack = await page.evaluate(() => window.__godsEyeView.mapStackController.getActiveId());
      check('the surface is Google’s mesh', stack === 'photoreal', stack);
      check('the coverage is draped on the mesh', state.stats.draped === true, JSON.stringify(state.stats));
    }
    check('the key carries the coverage block', state.legend.some((label) => label === 'Opérateurs qui captent'),
      state.legend.join(' | '));
    check('the key says whose estimate it is, and the month', /^Estimation des opérateurs, publiée par l’ARCEP \(\p{L}+ \d{4}\)\./u.test(state.note || ''), state.note);

    // The boot veil fades once the first view has settled; a screenshot before
    // that is a picture of the loading screen.
    const veilDeadline = Date.now() + 60_000;
    while (Date.now() < veilDeadline) {
      const veiled = await page.evaluate(() => {
        const veil = document.getElementById('loading-screen');
        return Boolean(veil) && !veil.classList.contains('hidden') && getComputedStyle(veil).display !== 'none';
      });
      if (!veiled) break;
      await sleep(1_000);
    }
    await render(page, 30);
    await sleep(6_000);
    await render(page, 20);
    if (PHOTOREAL) check('the mesh finished streaming the view', await meshSettled(page));
    const tileHits = tiles.filter((entry) => /\/tiles\/mobile-coverage\/.+\.png(\?|$)/.test(entry.url));
    console.log('\nTiles');
    check('tiles were fetched', tileHits.length > 0, `${tileHits.length} tiles`);
    check('no tile went through /api', !tiles.some((entry) => /\/api\/.+\.png/.test(entry.url)));
    check('no tile request was a 404 (the index is read first)', !tileHits.some((entry) => entry.status === 404),
      tileHits.filter((entry) => entry.status === 404).map((entry) => entry.url).slice(0, 3).join(', '));

    const shot = path.join(SHOTS_DIR, `${SHOT_PREFIX}gaps-mont-blanc.png`);
    await page.screenshot({ path: shot });
    console.log(`  · screenshot ${shot}`);

    console.log('\nOn screen');
    await page.evaluate(() => {
      window.__godsEyeView.dataManager.setLayerParams('anfr-fr', { coverage: 'off' }, { origin: 'user' });
    });
    await render(page, 20);
    const offShot = path.join(SHOTS_DIR, `${SHOT_PREFIX}off-mont-blanc.png`);
    await page.screenshot({ path: offShot });
    const on = await magentaPixels(shot);
    const off = await magentaPixels(offShot);
    check('the dead-zone view paints magenta the bare view does not have', on - off > 0.005,
      `${(on * 100).toFixed(2)} % on, ${(off * 100).toFixed(2)} % off`);
    if (PHOTOREAL) {
      // What the drape costs a frame, the mesh settled both times. Reported,
      // not judged: SwiftShader or Metal, the absolute figure is the machine's.
      const offMs = await frameMs(page);
      await page.evaluate(() => {
        window.__godsEyeView.dataManager.setLayerParams('anfr-fr', { coverage: 'gaps' }, { origin: 'user' });
      });
      await render(page, 20);
      await meshSettled(page);
      await sleep(3_000);
      await render(page, 10);
      const onMs = await frameMs(page);
      console.log(`  · frame ${offMs.toFixed(1)} ms bare, ${onMs.toFixed(1)} ms draped`);
      await page.evaluate(() => {
        window.__godsEyeView.dataManager.setLayerParams('anfr-fr', { coverage: 'off' }, { origin: 'user' });
      });
      await render(page, 10);
    }

    console.log('\nBy operator: Orange');
    await page.evaluate(() => {
      window.__godsEyeView.dataManager.setLayerParams('anfr-fr', { coverage: 'orange' }, { origin: 'user' });
    });
    await render(page, 20);
    await sleep(3_000);
    await render(page, 10);
    state = await coverageState(page);
    check('the mode is Orange and one layer is drawn', state.params.coverage === 'orange' && state.stats.drawn === true,
      JSON.stringify(state.stats));
    if (PHOTOREAL) check('and draped on the mesh', state.stats.draped === true);
    check('the key is Orange’s', state.legend.some((label) => label === 'Réseau Orange'), state.legend.join(' | '));
    check('the operator strip follows « Par opérateur »', state.subSegments.join(' ') === 'Orange SFR Bouygues Free',
      state.subSegments.join(' '));
    await meshSettled(page, 20_000);
    await render(page, 10);
    await page.screenshot({ path: path.join(SHOTS_DIR, `${SHOT_PREFIX}orange-mont-blanc.png`) });

    console.log('\nA click on the ground');
    await page.evaluate(() => {
      window.__godsEyeView.dataManager.setLayerParams('anfr-fr', { coverage: 'gaps' }, { origin: 'user' });
    });
    await render(page, 10);
    // A free patch of ground near the middle of the canvas, clicked with the
    // whole down/up pair inside ONE evaluate so it lands as a click and not as
    // a long press (see the memory on synthetic world clicks).
    const clicked = await page.evaluate(() => {
      const { viewer } = window.__godsEyeView;
      const scene = viewer.scene;
      const canvas = scene.canvas;
      const rect = canvas.getBoundingClientRect();
      const offsets = [[0, 0], [-120, 60], [120, 60], [-200, 120], [0, 160], [200, -40]];
      for (const [dx, dy] of offsets) {
        const clientX = rect.left + rect.width / 2 + dx;
        const clientY = rect.top + rect.height / 2 + dy;
        const top = document.elementFromPoint(clientX, clientY);
        if (top !== canvas && !canvas.contains(top)) continue;
        const position = { x: clientX - rect.left, y: clientY - rect.top };
        // On Google 3D the globe is hidden and the depth buffer is the ground.
        let hit = null;
        if (scene.globe.show) {
          const ray = scene.camera.getPickRay(position);
          hit = ray && scene.globe.pick(ray, scene);
        } else {
          hit = scene.pickPosition(position);
        }
        if (!hit) continue;
        const carto = scene.globe.ellipsoid.cartesianToCartographic(hit);
        const base = { bubbles: true, cancelable: true, clientX, clientY, button: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true };
        canvas.dispatchEvent(new PointerEvent('pointerdown', { ...base, buttons: 1 }));
        canvas.dispatchEvent(new PointerEvent('pointerup', { ...base, buttons: 0 }));
        return { lon: (carto.longitude * 180) / Math.PI, lat: (carto.latitude * 180) / Math.PI, height: carto.height, dx, dy };
      }
      return { blocked: true };
    });
    check('a free patch of ground was clicked', clicked && !clicked.blocked, JSON.stringify(clicked));
    let card = null;
    const cardDeadline = Date.now() + 15_000;
    while (Date.now() < cardDeadline) {
      card = (await coverageState(page))?.stats?.card;
      if (card && !/Chargement…/.test(card.text)) break;
      await sleep(500);
    }
    const lines = card?.text?.split('\n') || [];
    check('a card opened where the click landed',
      Boolean(card) && Math.abs(card.lon - clicked?.lon) < 0.01 && Math.abs(card.lat - clicked?.lat) < 0.01,
      JSON.stringify(card && { lon: card.lon, lat: card.lat }));
    check('it names the four operators and a verdict',
      /capte(nt)? ici|pas de 4G ici/.test(lines[0] || '') && lines.filter((line) => /^(Orange|SFR|Bouygues|Free) : /.test(line)).length === 4,
      lines.join(' / '));
    if (PHOTOREAL) {
      // Chamonix's valley floor is at 1,000 m: a card at sea level would sit
      // under the mesh, and be hidden by it.
      check('the card stands on the mesh, not at sea level',
        Number.isFinite(card?.height) && Math.abs(card.height - clicked.height) < 50 && card.height > 500,
        `card ${card?.height?.toFixed?.(0)} m, clicked ${clicked?.height?.toFixed?.(0)} m`);
    }
    await render(page, 10);
    await page.screenshot({ path: path.join(SHOTS_DIR, `${SHOT_PREFIX}card-ground.png`) });

    if (PHOTOREAL) {
      console.log('\nThe line of sight of a mast: globe only, skipped on Google 3D');
      return;
    }

    console.log('\nThe line of sight of a mast');
    await page.keyboard.press('Escape');
    // The mast dot nearest the middle of the screen that is not under a panel,
    // clicked the same way as the ground.
    const mast = await page.evaluate(() => {
      const { viewer } = window.__godsEyeView;
      const scene = viewer.scene;
      const canvas = scene.canvas;
      const rect = canvas.getBoundingClientRect();
      const points = [];
      const visit = (collection) => {
        const primitives = collection?._primitives || [];
        for (const primitive of primitives) {
          if (primitive?._pointPrimitives) {
            for (const point of primitive._pointPrimitives) {
              if (point?.show && typeof point.id === 'string' && point.id.startsWith('anfr-fr:')) points.push(point);
            }
          } else if (primitive?._primitives) visit(primitive);
        }
      };
      visit(scene.primitives);
      const candidates = [];
      for (const point of points) {
        const screen = scene.cartesianToCanvasCoordinates(point.position);
        if (!screen) continue;
        const clientX = rect.left + screen.x;
        const clientY = rect.top + screen.y;
        const top = document.elementFromPoint(clientX, clientY);
        if (top !== canvas && !canvas.contains(top)) continue;
        const dx = screen.x - rect.width / 2;
        const dy = screen.y - rect.height / 2;
        candidates.push({ id: point.id, clientX, clientY, distance: dx * dx + dy * dy });
      }
      candidates.sort((a, b) => a.distance - b.distance);
      const target = candidates[0];
      if (!target) return { points: points.length, candidates: 0 };
      const base = { bubbles: true, cancelable: true, clientX: target.clientX, clientY: target.clientY, button: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true };
      canvas.dispatchEvent(new PointerEvent('pointerdown', { ...base, buttons: 1 }));
      canvas.dispatchEvent(new PointerEvent('pointerup', { ...base, buttons: 0 }));
      return { points: points.length, candidates: candidates.length, id: target.id };
    });
    check('a mast dot on screen was clicked', Boolean(mast?.id), JSON.stringify(mast));
    let viewshed = null;
    const viewshedDeadline = Date.now() + 45_000;
    while (Date.now() < viewshedDeadline) {
      viewshed = await page.evaluate(() => window.__godsEyeView.dataManager.layers.get('anfr-fr').module.getStats().viewshed);
      if (viewshed && ['ready', 'failed', 'photoreal'].includes(viewshed.status)) break;
      await sleep(1_000);
    }
    check('its line of sight was computed and drawn', viewshed?.status === 'ready' && viewshed.drawn === true,
      JSON.stringify(viewshed));
    check('the radius is the radio horizon of a real mast (5–40 km)',
      viewshed?.radiusM > 5_000 && viewshed?.radiusM <= 40_000, String(viewshed?.radiusM));
    const legend = (await coverageState(page))?.legend || [];
    check('the key names the line of sight', legend.includes('Terrain d’où l’on voit l’antenne'), legend.join(' | '));
    await render(page, 20);
    await sleep(2_000);
    await render(page, 10);
    await page.screenshot({ path: path.join(SHOTS_DIR, 'line-of-sight.png') });
  } finally {
    await browser.close();
    console.log(`\n${failures ? `${failures} check(s) failed` : 'All checks passed'}`);
    process.exitCode = failures ? 1 : 0;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
