#!/usr/bin/env node
/**
 * qa-dpe-focus.mjs — « ça m'affiche les DPE qui ne sont quasiment pas dans la
 * vue, mais à l'extrémité », asserted as distances against the LIVE app.
 *
 * The address layers scan a disc around the point the camera looks at. That
 * point was read off the ELLIPSOID, and a city is not at height zero: Lyon's
 * Presqu'île stands at about 220 m of ellipsoidal height, so under a tilted
 * camera the centre ray meets the street and goes on down another 220 m before
 * it meets the ellipsoid — hundreds of metres further along the ground. A
 * 200 m disc centred there sits behind the block at the middle of the screen,
 * and the reader sees diagnostics only along the top edge of the view.
 *
 * Three numbers, each at the reader's own kind of view (Lyon 2e, tilted):
 *
 *   1. how far the layer's scan centre stands from the ground point under the
 *      middle of the screen, read by `globe.pick` on the drawn terrain;
 *   2. how far the ELLIPSOID pick stands from that same point — the old
 *      centre, printed so the size of what was fixed is on the record;
 *   3. where the drawn badges fall on screen: the share of them in the middle
 *      half of the canvas, and their mean height against the centre line.
 *
 * Runs on the globe stack (`newQaPage` keeps the run off the metered 3D tiles):
 * its terrain is real, so the bug and its fix both show there.
 *
 * Run:  node scripts/qa-dpe-focus.mjs --url http://127.0.0.1:4173 [--shots] [--height 1400]
 *       [--photoreal]   (one root tile of the shared ion quota per run)
 * Exit 0 = no hard failures.
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
const SHOTS_DIR = option('--shots-dir', path.join(REPO_ROOT, 'qa-shots', 'dpe-focus'));
const SHOTS = args.includes('--shots');
/** Canvas height; `--height 1400` gives the key room to show a whole card. */
const HEIGHT = Number(option('--height', 900)) || 900;
/**
 * `--photoreal` runs on the Google tileset the reader uses. ONE BOOT SPENDS ONE
 * ROOT TILE of a quota every workspace shares, so it is opt-in.
 */
const PHOTOREAL = args.includes('--photoreal');
/**
 * The street's ellipsoidal height at TARGET, measured on the globe stack
 * (229.1 m). The photoreal stack hides the globe, so `getHeight` answers
 * nothing there and the camera is placed from this instead.
 */
const TARGET_GROUND_M = 229;
const CHROME = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((candidate) => candidate && fs.existsSync(candidate));

/** Palais de la Bourse, Lyon 2e — the block in the reader's screenshot. */
const TARGET = { lat: 45.7637, lon: 4.8366 };
/** Height above the street, and the tilt, of the reader's kind of view. */
const ABOVE_GROUND_M = 350;
const PITCH_DEG = -35;

/** The scan centre may stand this far from the looked-at point, in metres. */
const MAX_CENTRE_ERROR_M = 40;
/** At least this share of the drawn badges must fall in the middle half. */
const MIN_CENTRAL_SHARE = 0.5;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let failures = 0;
function note(ok, label, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

/** Metres between two coordinates, equirectangular — good enough for a gate. */
function metresApart(a, b) {
  const dLat = (b.lat - a.lat) * 111_320;
  const dLon = (b.lon - a.lon) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLon);
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
  protocolTimeout: 150_000,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', `--window-size=1400,${HEIGHT}`],
  defaultViewport: { width: 1400, height: HEIGHT },
});
const page = await newQaPage(browser, PHOTOREAL ? { photoreal: true } : {});
page.on('pageerror', (error) => console.log('  [pageerror]', String(error).slice(0, 200)));
if (process.env.QA_DEBUG) {
  page.on('console', (message) => {
    const text = message.text();
    if (/dpe|Data:|scan|camera|flight|director/i.test(text)) console.log(`  [console] ${text.slice(0, 240)}`);
  });
}

/** The layer and the camera, as one line, for a run under QA_DEBUG. */
async function trace(page, label) {
  if (!process.env.QA_DEBUG) return;
  const state = await page.evaluate(() => {
    const { viewer, dataManager } = window.__godsEyeView;
    const stats = dataManager.getAll().find((layer) => layer.id === 'dpe-fr')?.stats || {};
    const carto = viewer.camera.positionCartographic;
    return {
      camera: [(carto.longitude * 180) / Math.PI, (carto.latitude * 180) / Math.PI, carto.height]
        .map((value) => Number(value.toFixed(5))),
      centre: stats.scanCentre,
      count: stats.count,
      served: stats.diagnosticsServed,
      dormant: stats.dormant,
      error: stats.error,
      selected: stats.selectedId,
    };
  }).catch((error) => ({ error: String(error) }));
  console.log(`  ·    [${label}] ${JSON.stringify(state)}`);
}

try {
  await page.goto(`${APP_URL}/globe?welcome=0${PHOTOREAL ? '' : '&photoreal=0'}`, {
    waitUntil: 'domcontentloaded', timeout: 120_000,
  });
  const booted = await waitFor(page, () => Boolean(window.__godsEyeView?.dataManager), 180_000);
  if (!booted) throw new Error('the app never exposed its data manager');

  /**
   * Stand the camera so the middle of the screen looks at TARGET from
   * ABOVE_GROUND_M over the street, pitched PITCH_DEG. The street's own height
   * is read first — the camera is placed from it, not from the ellipsoid.
   */
  const park = () => page.evaluate(({ target, aboveM, pitchDeg, groundM }) => {
    const { viewer } = window.__godsEyeView;
    const { scene } = viewer;
    viewer.camera.cancelFlight?.();
    const lonR = (target.lon * Math.PI) / 180;
    const latR = (target.lat * Math.PI) / 180;
    const ground = (scene.globe.show !== false
      && scene.globe.getHeight({ longitude: lonR, latitude: latR, height: 0 })) || groundM;
    const pitch = (pitchDeg * Math.PI) / 180;
    const backM = aboveM / Math.tan(-pitch);
    viewer.camera.setView({
      destination: scene.globe.ellipsoid.cartographicToCartesian({
        longitude: lonR,
        latitude: latR - backM / 6_371_000,
        height: ground + aboveM,
      }),
      orientation: { heading: 0, pitch, roll: 0 },
    });
    scene.requestRender();
    return ground;
  }, {
    target: TARGET, aboveM: ABOVE_GROUND_M, pitchDeg: PITCH_DEG, groundM: TARGET_GROUND_M,
  });

  await park();
  await sleep(4_000);
  const groundM = await park();
  await page.evaluate(() => window.__godsEyeView.dataManager.setEnabled('dpe-fr', true));

  // The terrain refines as it streams, so the camera is re-parked until the
  // street height it stands on stops moving, then the layer is waited FOR.
  let lastGround = groundM;
  for (let pass = 0; pass < 6; pass += 1) {
    await sleep(3_000);
    const now = await park();
    if (Math.abs(now - lastGround) < 0.5) break;
    lastGround = now;
  }
  // The scan must be one taken from THIS view: a centre left over from the
  // boot camera settles just as well and measures somewhere else entirely.
  const settled = await waitFor(page, (target) => {
    const stats = window.__godsEyeView.dataManager.getAll()
      .find((layer) => layer.id === 'dpe-fr')?.stats;
    const centre = stats?.scanCentre;
    if (!centre) return false;
    const dLat = (centre.lat - target.lat) * 111_320;
    const dLon = (centre.lon - target.lon) * 111_320 * Math.cos((target.lat * Math.PI) / 180);
    return Math.hypot(dLat, dLon) < 1_000 && !stats.loading && !stats.refreshing
      && stats.count > 0 && stats.seatPending === false;
  }, 120_000, TARGET);
  note(settled, 'the layer drew and seated its badges');

  const reading = await page.evaluate(() => {
    const { viewer, dataManager } = window.__godsEyeView;
    const { scene, camera } = viewer;
    const width = scene.canvas.clientWidth;
    const height = scene.canvas.clientHeight;
    const centre = { x: width / 2, y: height / 2 };
    const toDeg = (cartesian) => {
      if (!cartesian) return null;
      const carto = scene.globe.ellipsoid.cartesianToCartographic(cartesian);
      return carto
        ? { lon: (carto.longitude * 180) / Math.PI, lat: (carto.latitude * 180) / Math.PI, h: carto.height }
        : null;
    };
    // The oracle is the surface DRAWN: the terrain on the globe stack, the
    // depth buffer on the photoreal one, where the globe is hidden.
    const ray = camera.getPickRay(centre);
    const surface = toDeg(scene.globe.show !== false
      ? (ray ? scene.globe.pick(ray, scene) : null)
      : scene.pickPosition(centre));
    const ellipsoid = toDeg(camera.pickEllipsoid(centre, scene.globe.ellipsoid));
    const stats = dataManager.getAll().find((layer) => layer.id === 'dpe-fr')?.stats || {};
    const source = viewer.dataSources.getByName('dpe-fr')[0];
    const now = viewer.clock.currentTime;
    const ys = [];
    let onScreen = 0;
    let central = 0;
    let total = 0;
    for (const entity of source?.entities?.values || []) {
      if (!entity.billboard || entity.show === false) continue;
      const position = entity.position?.getValue(now);
      if (!position) continue;
      total += 1;
      const point = scene.cartesianToCanvasCoordinates(position);
      if (!point || !Number.isFinite(point.x)) continue;
      if (point.x < 0 || point.x > width || point.y < 0 || point.y > height) continue;
      onScreen += 1;
      ys.push(point.y);
      if (point.x > width / 4 && point.x < (3 * width) / 4
        && point.y > height / 4 && point.y < (3 * height) / 4) central += 1;
    }
    const meanY = ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : null;
    return {
      surface,
      ellipsoid,
      camera: {
        h: camera.positionCartographic.height,
        lat: (camera.positionCartographic.latitude * 180) / Math.PI,
        lon: (camera.positionCartographic.longitude * 180) / Math.PI,
      },
      scanBasis: stats.scanBasis || 'disc',
      count: stats.count,
      sources: viewer.dataSources.length,
      scanCentre: stats.scanCentre || null,
      badges: total,
      onScreen,
      central,
      meanYFromCentre: meanY === null ? null : meanY - height / 2,
      height,
    };
  });

  const centreError = reading.surface && reading.scanCentre
    ? metresApart(reading.surface, reading.scanCentre) : null;
  const ellipsoidError = reading.surface && reading.ellipsoid
    ? metresApart(reading.surface, reading.ellipsoid) : null;
  if (process.env.QA_DEBUG) console.log(JSON.stringify(reading));
  console.log(`  ·    street at ${reading.surface?.h?.toFixed(1)} m of ellipsoidal height`);
  console.log(`  ·    ellipsoid pick ${ellipsoidError?.toFixed(0)} m beyond the looked-at street`);
  note(
    centreError !== null && centreError <= MAX_CENTRE_ERROR_M,
    'the scan centre stands on the block at the middle of the screen',
    centreError === null ? 'no reading' : `${centreError.toFixed(0)} m off (ceiling ${MAX_CENTRE_ERROR_M} m)`,
  );
  const share = reading.onScreen ? reading.central / reading.onScreen : 0;
  note(
    share >= MIN_CENTRAL_SHARE,
    'most badges fall in the middle half of the view',
    `${reading.central} of ${reading.onScreen} on screen (${Math.round(share * 100)} %), `
      + `${reading.badges} drawn, mean ${reading.meanYFromCentre?.toFixed(0)} px from the centre line`,
  );

  await shoot(page, 'lyon-tilted.png');

  // -------------------------------------------------------------------------
  // The key: seven lettered plates that filter, eight counts in two columns
  // -------------------------------------------------------------------------
  console.log('\n— the key —');
  const key = await page.evaluate(() => {
    const block = document.querySelector('#map-legend-items .map-legend-group[data-layer="dpe-fr"]');
    if (!block) return null;
    const plates = [...block.querySelectorAll('.map-legend-segments.is-swatches .is-swatch')];
    return {
      plates: plates.map((plate) => plate.textContent),
      pressed: plates.filter((plate) => plate.getAttribute('aria-pressed') === 'true').length,
      counts: block.querySelectorAll('.map-legend-inline.is-columns .map-legend-entry').length,
      note: block.querySelector('.map-legend-note')?.textContent || '',
      scroll: (() => {
        const list = document.getElementById('map-legend-items');
        return list ? { content: list.scrollHeight, window: list.clientHeight } : null;
      })(),
    };
  });
  note(key?.plates?.join('') === 'ABCDEFG' && key.pressed === 7,
    'the key opens on seven lettered plates, all shown', JSON.stringify(key?.plates));
  note(key?.counts === 8, 'the counts sit in columns, seven classes and the unpublished label',
    `${key?.counts} entries · ${key?.note}`);

  await trace(page, 'after-key');
  // -------------------------------------------------------------------------
  // Plates that touch are grouped, never stacked
  // -------------------------------------------------------------------------
  console.log('\n— overlapping plates —');
  const overlap = await page.evaluate(() => {
    const { viewer } = window.__godsEyeView;
    const { scene } = viewer;
    const source = viewer.dataSources.getByName('dpe-fr')[0];
    const now = viewer.clock.currentTime;
    const own = new Set((source?.entities?.values || []).filter((entity) => entity.billboard));
    const boxes = [];
    // What is actually PAINTED: a plate a pill stands for is hidden, and the
    // pill is drawn in its place.
    for (const entity of own) {
      if (entity.billboard.show?.getValue?.(now) === false || entity.billboard.show === false) continue;
      const position = entity.position?.getValue(now);
      const point = position && scene.cartesianToCanvasCoordinates(position);
      const size = Number(entity.billboard.width?.getValue?.(now) ?? entity.billboard.width);
      if (point) boxes.push({ x: point.x, y: point.y, w: size, h: size });
    }
    const pills = [];
    for (let i = 0; i < scene.primitives.length; i += 1) {
      const collection = scene.primitives.get(i);
      if (typeof collection?.get !== 'function' || !Number.isFinite(collection.length)) continue;
      for (let j = 0; j < collection.length; j += 1) {
        const billboard = collection.get(j);
        if (!Array.isArray(billboard?.id) || !billboard.id.some((entity) => own.has(entity))) continue;
        const point = billboard.computeScreenSpacePosition(scene);
        if (!point) continue;
        pills.push(billboard.id.length);
        boxes.push({ x: point.x, y: point.y, w: billboard.width, h: billboard.height });
      }
    }
    let overlaps = 0;
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i];
        const b = boxes[j];
        if (Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h) overlaps += 1;
      }
    }
    return { enabled: true, marks: boxes.length, pills, overlaps };
  });
  note(overlap.enabled && overlap.pills.length > 0,
    'plates that touch are grouped into pills', `${overlap.pills.length} pills grouping ${overlap.pills.join(', ')} plates`);
  note(overlap.overlaps === 0, 'no two painted marks sit on one another',
    `${overlap.overlaps} overlapping pair(s) among ${overlap.marks} marks`);

  await trace(page, 'before-select');
  // -------------------------------------------------------------------------
  // One site selected: its card in the key, a tag on the map, its ground lit
  // -------------------------------------------------------------------------
  console.log('\n— a selected site —');
  const picked = await page.evaluate(() => {
    const { viewer, dataManager } = window.__godsEyeView;
    const source = viewer.dataSources.getByName('dpe-fr')[0];
    const now = viewer.clock.currentTime;
    let best = null;
    for (const entity of source?.entities?.values || []) {
      if (!entity.billboard) continue;
      const n = Number(entity.properties?.diagnostics?.getValue(now)) || 0;
      if (!best || n > best.n) best = { id: entity.id, n };
    }
    if (!best) return null;
    const before = viewer.scene.primitives.length;
    const ok = dataManager.layers.get('dpe-fr').module.selectCard(best.id);
    return { ...best, ok, before };
  });
  await trace(page, 'just-selected');
  await sleep(2_500);
  await trace(page, 'selected+2.5s');
  const selected = await page.evaluate((before) => {
    const { viewer } = window.__godsEyeView;
    const card = document.querySelector('#map-legend-items .map-legend-group[data-layer="dpe-fr"] .map-legend-selection');
    const tag = [...document.querySelectorAll('[data-overlay-source="dpe-fr"], .world-overlay-card, .overlay-card')]
      .map((node) => node.textContent.trim()).find(Boolean) || null;
    return {
      title: card?.querySelector('.map-legend-selection-title')?.textContent || null,
      headline: card?.querySelector('.map-legend-selection-headline')?.textContent || null,
      chips: [...(card?.querySelectorAll('.map-legend-selection-chips .map-legend-selection-chip') || [])]
        .map((chip) => chip.textContent),
      range: card?.querySelector('.map-legend-selection-chips-text')?.textContent || null,
      listSummary: card?.querySelector('.map-legend-selection-list summary')?.textContent || null,
      listItems: card?.querySelectorAll('.map-legend-selection-list li').length || 0,
      links: [...(card?.querySelectorAll('.map-legend-selection-list a') || [])].map((a) => a.href).slice(0, 2),
      tag,
      primitivesAdded: viewer.scene.primitives.length - before,
    };
  }, picked?.before ?? 0);
  if (process.env.QA_DEBUG) console.log(JSON.stringify({ picked, selected }));
  note(Boolean(picked?.ok && selected.title), 'a click puts the site\'s card in the key',
    `${selected.title} — ${selected.headline}`);
  note(selected.chips.length > 0 && Boolean(selected.range),
    'the card shows the classes present and their range', `${selected.chips.join(' ')} · ${selected.range}`);
  note(selected.listItems === picked?.n,
    'every diagnostic at the address is listed', `${selected.listItems} of ${picked?.n}`);
  note(selected.links.every((href) => href.startsWith('https://observatoire-dpe-audit.ademe.fr/afficher-dpe/')),
    'each listed diagnostic links to its ADEME page', selected.links[0] || 'no link');
  note(selected.primitivesAdded >= 1, 'the selected building and parcel are lit on the ground',
    `${selected.primitivesAdded} primitive(s)`);
  await page.evaluate(() => {
    document.querySelector('#map-legend-items .map-legend-selection-list details')?.setAttribute('open', '');
  });
  await shoot(page, 'lyon-selected.png');

  await trace(page, 'before-filter');
  // -------------------------------------------------------------------------
  // A plate pressed: the map keeps only that class
  // -------------------------------------------------------------------------
  console.log('\n— the filter —');
  const filtered = await page.evaluate(async () => {
    const { viewer } = window.__godsEyeView;
    const plate = [...document.querySelectorAll('#map-legend-items .is-swatch')]
      .find((node) => node.textContent === 'F');
    plate?.click();
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    const source = viewer.dataSources.getByName('dpe-fr')[0];
    const now = viewer.clock.currentTime;
    const letters = [];
    for (const entity of source?.entities?.values || []) {
      if (!entity.billboard) continue;
      letters.push(entity.properties?.etiquetteDpe?.getValue(now) ?? null);
    }
    const plates = [...document.querySelectorAll('#map-legend-items .is-swatch')];
    return {
      letters,
      pressed: plates.filter((node) => node.getAttribute('aria-pressed') === 'true').map((node) => node.textContent),
      note: document.querySelector('#map-legend-items .map-legend-group[data-layer="dpe-fr"] .map-legend-note')
        ?.textContent || '',
      params: window.__godsEyeView.dataManager.layers.get('dpe-fr').module.getParams(),
    };
  });
  note(filtered.params?.classes === 'F' && filtered.pressed.join('') === 'F',
    'pressing F shows F alone', `${filtered.params?.classes} · pressed ${filtered.pressed.join('')}`);
  note(filtered.letters.length > 0 && filtered.letters.every((letter) => letter === 'F'),
    'every badge left on the map is an F', `${filtered.letters.length} badges: ${[...new Set(filtered.letters)].join(', ')}`);
  note(/F/.test(filtered.note), 'the key says a filter is on', filtered.note);
  await shoot(page, 'lyon-filter-f.png');

  // -------------------------------------------------------------------------
  // A pill clicked: the camera comes closer until its plates part
  // -------------------------------------------------------------------------
  console.log('\n— a pill clicked —');
  const target = await page.evaluate(() => {
    const { viewer } = window.__godsEyeView;
    const { scene } = viewer;
    const source = viewer.dataSources.getByName('dpe-fr')[0];
    const own = new Set((source?.entities?.values || []).filter((entity) => entity.billboard));
    for (let i = 0; i < scene.primitives.length; i += 1) {
      const collection = scene.primitives.get(i);
      if (typeof collection?.get !== 'function' || !Number.isFinite(collection.length)) continue;
      for (let j = 0; j < collection.length; j += 1) {
        const billboard = collection.get(j);
        if (!Array.isArray(billboard?.id) || !billboard.id.some((entity) => own.has(entity))) continue;
        const point = billboard.computeScreenSpacePosition(scene);
        if (point) {
          const rect = scene.canvas.getBoundingClientRect();
          return {
            x: rect.left + point.x,
            y: rect.top + point.y,
            plates: billboard.id.length,
            distance: Math.hypot(
              viewer.camera.positionWC.x - billboard.position.x,
              viewer.camera.positionWC.y - billboard.position.y,
              viewer.camera.positionWC.z - billboard.position.z,
            ),
          };
        }
      }
    }
    return null;
  }).catch(() => null);
  if (!target) {
    note(false, 'a pill was on screen to click');
  } else {
    await Promise.race([page.mouse.click(target.x, target.y), sleep(10_000)]);
    await sleep(2_500);
    const after = await page.evaluate(({ x, y }) => {
      const { viewer } = window.__godsEyeView;
      const rect = viewer.scene.canvas.getBoundingClientRect();
      const at = { x: x - rect.left, y: y - rect.top };
      const ray = viewer.camera.getPickRay(at);
      const ground = viewer.scene.globe.show !== false
        ? (ray && viewer.scene.globe.pick(ray, viewer.scene))
        : viewer.scene.pickPosition(at);
      const eye = viewer.camera.positionWC;
      return ground ? Math.hypot(eye.x - ground.x, eye.y - ground.y, eye.z - ground.z) : null;
    }, target);
    note(Number.isFinite(after) && after < target.distance * 0.6,
      'clicking a pill brings the camera closer to its plates',
      `${Math.round(target.distance)} m → ${Math.round(after)} m, ${target.plates} plates`);
    await shoot(page, 'lyon-pill-zoomed.png');
  }
} catch (error) {
  failures += 1;
  console.log(`FAIL  run aborted — ${String(error?.message || error).slice(0, 200)}`);
} finally {
  await browser.close();
}

console.log(`\n${failures ? `${failures} failure(s)` : 'all checks passed'}`);
process.exit(failures ? 1 : 0);
