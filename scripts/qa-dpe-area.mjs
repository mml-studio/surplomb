#!/usr/bin/env node
/**
 * qa-dpe-area.mjs — the energy ratings seen from altitude, on the reader's own
 * view: Lyon's Presqu'île, tilted, from about a kilometre up.
 *
 * The request this answers (2026-09-22): « que le Data Layer DPE puisse être
 * visible sur une vue dézoomée et qu'on ne vienne pas afficher ces espèces de
 * cercles mais bien directement les parcelles des bâtiments concernés », on
 * the DPE scale, and « en fonction de la hauteur … pareil que pour le DVF ».
 *
 * What is checked, in order:
 *   1. From ~1 100 m: the layer answers in PARCELS, paints them as primitives
 *      in at most eight colours (seven letters and the neutral), and the key
 *      is the A–G scale counted in parcels.
 *   2. A click on the ground at the middle of the screen opens a parcel's card
 *      in the key: an address, a count, the classes present.
 *   3. From 650 m straight down, only the tiles the screen shows are asked
 *      for — not the whole box.
 *   4. From ~3 000 m: the layer answers in cadastral SECTIONS, still on the
 *      A–G scale.
 *   5. No disc is drawn at any altitude, and nothing throws.
 *
 * Runs on the globe stack (`newQaPage` keeps the run off the metered 3D tiles).
 *
 * Run:  node scripts/qa-dpe-area.mjs --url http://127.0.0.1:4173 [--shots]
 * Exit 0 = no failures.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { newQaPage } from './lib/qa-first-run.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const APP_URL = option('--url', process.env.QA_BASE_URL || 'http://localhost:4173');
const SHOTS_DIR = option('--shots-dir', path.join(REPO_ROOT, 'qa-shots', 'dpe-area'));
const SHOTS = args.includes('--shots');
const CHROME = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((candidate) => candidate && fs.existsSync(candidate));

/** Rue de la République by the Palais de la Bourse, Lyon 2e — the reader's screenshot. */
const TARGET = { lat: 45.7620, lon: 4.8355 };
/** The street's ellipsoidal height there, measured on the globe stack. */
const TARGET_GROUND_M = 229;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let failures = 0;
function note(ok, label, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

/** A screenshot that can never end the run: a wedged compositor is not a failure. */
async function shoot(page, name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  try {
    await page.evaluate(() => window.__godsEyeView.viewer.scene.requestRender());
    await sleep(2_000);
    const file = path.join(SHOTS_DIR, name);
    await page.screenshot({ path: file, timeout: 120_000 });
    console.log(`  ·    ${file}`);
  } catch (error) {
    console.log(`  ·    screenshot ${name} skipped — ${String(error).slice(0, 80)}`);
  }
}

/** Poll with `page.evaluate`: `waitForFunction` hangs on a globe at rest. */
async function waitFor(page, predicate, timeoutMs, arg) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await page.evaluate(predicate, arg)) return true;
    } catch { /* navigation in flight */ }
    await sleep(500);
  }
  return false;
}

const browser = await puppeteer.launch({
  headless: 'new',
  executablePath: CHROME,
  protocolTimeout: 180_000,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--window-size=1400,1000'],
  defaultViewport: { width: 1400, height: 1000 },
});
const errors = [];

/**
 * The camera that looks at TARGET from `aboveM` over the street, pitched
 * `pitchDeg`, as a share-link hash. Posed AT BOOT: a `setView` issued after
 * the page loads is overwritten by the arrival cinematic, which on this view
 * parked the camera at 1 911 m over the nadir and turned a parcel check into
 * a section one.
 */
function viewHash(aboveM, pitchDeg, target = TARGET) {
  const backM = aboveM / Math.tan((-pitchDeg * Math.PI) / 180);
  const lat = target.lat - backM / 111_320;
  return `#lat=${lat.toFixed(5)}&lon=${target.lon.toFixed(5)}&alt=${Math.round(TARGET_GROUND_M + aboveM)}`
    + `&heading=0&pitch=${pitchDeg}`;
}

/** The layer's own account of what it drew. */
const read = (page) => page.evaluate(() => {
  const { viewer, dataManager } = window.__godsEyeView;
  const module = dataManager.layers.get('dpe-fr')?.module;
  const stats = module?.getStats?.() || {};
  const controls = module?.getRowControls?.() || {};
  const source = viewer.dataSources.getByName('dpe-fr')[0];
  const values = source ? [...source.entities.values] : [];
  return {
    basis: stats.scanBasis || null,
    tiles: `${stats.tilesLoaded}/${stats.tilesInBox}`,
    altitude: viewer.camera.positionCartographic.height,
    total: stats.diagnosticsTotal ?? null,
    draw: module?.getAreaDraw?.() ?? null,
    legend: (controls.legend || []).map((entry) => `${entry.label}:${entry.count}`),
    note: controls.note || '',
    selection: controls.legendSelection || null,
    discs: values.filter((entity) => /cell/.test(String(entity.id))).length,
    billboards: values.filter((entity) => entity.billboard).length,
  };
});

/**
 * One view in a page of its own — a page reused across views reports the
 * answer of the view before (see the harness notes in `qa-address-layers`).
 */
async function openView(aboveM, pitchDeg, basis, target = TARGET) {
  const page = await newQaPage(browser);
  page.on('pageerror', (error) => errors.push(String(error?.message || error)));
  await page.goto(`${APP_URL}/globe?welcome=0&photoreal=0${viewHash(aboveM, pitchDeg, target)}`, {
    waitUntil: 'domcontentloaded', timeout: 180_000,
  });
  const booted = await waitFor(page, () => Boolean(window.__godsEyeView?.dataManager), 180_000);
  if (!booted) throw new Error('the app never exposed its data manager');
  await page.evaluate(() => window.__godsEyeView.dataManager.setEnabled('dpe-fr', true, { origin: 'user' }));
  const ready = await waitFor(page, (want) => {
    const module = window.__godsEyeView.dataManager.layers.get('dpe-fr')?.module;
    const draw = module?.getAreaDraw?.();
    return module?.getStats?.()?.scanBasis === want && draw?.shapes > 0 && draw.ready;
  }, 240_000, basis);
  return { page, ready };
}

try {
  // ── 1. parcels ──────────────────────────────────────────────────────────
  const { page, ready: parcelsReady } = await openView(1_100, -50, 'parcels');
  const high = await read(page);
  note(parcelsReady, 'from ~1 100 m the layer paints parcels, and they finish building',
    `${high.basis} at ${Math.round(high.altitude)} m`);
  note(high.draw?.shapes > 100, 'hundreds of parcels are on the ground',
    `${high.draw?.shapes} shapes, ${high.total} ratings, ${high.tiles} tiles loaded`);
  note(high.draw?.fills > 0 && high.draw.fills <= 8, 'one batch per colour, eight at most', `${high.draw?.fills} batches`);
  note(high.legend.slice(0, 7).map((entry) => entry[0]).join('') === 'ABCDEFG',
    'the key is the A–G scale', high.legend.join(' '));
  note(high.discs === 0 && high.billboards === 0, 'no disc and no plate above 600 m',
    `${high.discs} discs, ${high.billboards} billboards`);
  console.log(`  ·    ${high.note}`);
  await shoot(page, 'parcels.png');

  // ── 2. a click on a parcel ──────────────────────────────────────────────
  // A click on a street between two parcels opens nothing — the shape under
  // the click is found by geometry, and a road is nobody's — so the harness
  // tries points spiralling out from the middle of the screen until one lands
  // on a parcel. Each press and release is dispatched in ONE evaluate, so they
  // are microseconds apart: a pair sent as two CDP round trips can land seconds
  // apart under SwiftShader and read as a long press.
  const OFFSETS = [[0, 0], [30, 0], [-30, 0], [0, 30], [0, -30], [30, 30], [-30, -30],
    [30, -30], [-30, 30], [60, 0], [-60, 0], [0, 60], [0, -60], [60, 60], [-60, -60]];
  let opened = false;
  for (const [dx, dy] of OFFSETS) {
    await page.evaluate(({ offsetX, offsetY }) => {
      const canvas = window.__godsEyeView.viewer.scene.canvas;
      const rect = canvas.getBoundingClientRect();
      const x = rect.left + rect.width / 2 + offsetX;
      const y = rect.top + rect.height / 2 + offsetY;
      const common = {
        bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0,
        pointerId: 1, pointerType: 'mouse', isPrimary: true,
      };
      canvas.dispatchEvent(new PointerEvent('pointerdown', { ...common, buttons: 1 }));
      canvas.dispatchEvent(new PointerEvent('pointerup', { ...common, buttons: 0 }));
    }, { offsetX: dx, offsetY: dy });
    opened = await waitFor(page, () => {
      const module = window.__godsEyeView.dataManager.layers.get('dpe-fr')?.module;
      return Boolean(module?.getRowControls?.()?.legendSelection);
    }, 4_000);
    if (opened) break;
  }
  const clicked = await read(page);
  note(opened && /^dpe-parcel:/.test(clicked.selection?.key || ''),
    'a click on the ground opens the parcel under it',
    clicked.selection ? `${clicked.selection.title} · ${clicked.selection.headline}` : 'no card');
  if (clicked.selection) {
    console.log(`  ·    ${[clicked.selection.meta, clicked.selection.chips?.text, ...(clicked.selection.lines || []), clicked.selection.footnote].filter(Boolean).join(' | ')}`);
  }
  await shoot(page, 'parcel-card.png');
  await page.close();

  // ── 3. low and straight down: only the tiles on screen ──────────────────
  // The middle of one 0.01° tile, from 650 m: the screen shows part of the
  // box, and the layer must not ask for the rest.
  const { page: low, ready: lowReady } = await openView(650, -89, 'parcels', { lat: 45.7650, lon: 4.8350 });
  const lowRead = await read(low);
  const [loaded, inBox] = lowRead.tiles.split('/').map(Number);
  note(lowReady && loaded < inBox, 'from 650 m straight down, only the tiles on screen are loaded',
    `${lowRead.tiles} tiles, ${lowRead.draw?.shapes} parcels`);
  await shoot(low, 'low.png');
  await low.close();

  // ── 4. sections ─────────────────────────────────────────────────────────
  const { page: high2, ready: sectionsReady } = await openView(3_000, -55, 'sections');
  const higher = await read(high2);
  note(sectionsReady, 'from ~3 000 m the layer paints cadastral sections',
    `${higher.basis} at ${Math.round(higher.altitude)} m`);
  note(higher.legend.slice(0, 7).map((entry) => entry[0]).join('') === 'ABCDEFG',
    'the key is still the A–G scale', higher.legend.join(' '));
  note(higher.discs === 0, 'and still no disc');
  console.log(`  ·    ${higher.draw?.shapes} sections · ${higher.note}`);
  await shoot(high2, 'sections.png');
  await high2.close();

  const fatal = errors.filter((message) => !/ResizeObserver|Failed to load resource/.test(message));
  note(fatal.length === 0, 'nothing threw', fatal.slice(0, 2).join(' | '));
} finally {
  await browser.close();
}
console.log(`\n${failures ? `${failures} FAILED` : 'all checks passed'}`);
process.exit(failures ? 1 : 0);
