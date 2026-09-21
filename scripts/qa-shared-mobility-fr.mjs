#!/usr/bin/env node
/**
 * Deterministic browser proof for the French shared-mobility layer.
 *
 * The live feeds cannot be a fixed truth, so this intercepts
 * `/api/shared-mobility-fr/*` with a fixture and proves the four things the
 * feeds themselves cannot:
 *
 *   i.   the country view fetches no fleet — from 400 km the layer asks for
 *        the PLACES a network runs in (`/networks`), draws one label per
 *        place, and raises no « zoom in » card
 *   ii.  a city view draws one object per object, and a station with NO
 *        availability data is coloured neutral rather than empty
 *   iii. the row legend counts what is on screen, by kind, omitting zeroes
 *   iv.  the layer reports the shared municipal bays it merged out, instead of
 *        silently drawing three dots on every bay in the city
 *   v.   SHAPE rides the pin — every vehicle is a dot, and close to the street
 *        a few of them, never two within 200 px, wear a pin with their kind's
 *        silhouette; no two kinds share one
 *   vi.  COLOUR says who runs it — a vehicle is drawn in its operator's hue and
 *        a station is a dark disc RINGED in it, holding a core of it as large
 *        as it is full, so two operators in one street are tellable apart
 *   vii. from the city-wide view the layer asks for GROUPS, and draws the
 *        proxy's counts — every vehicle in exactly one bubble or one dot, and
 *        the docks' available vehicles counted into the bubbles
 *
 * Run: node scripts/qa-shared-mobility-fr.mjs --url http://localhost:4173
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { newQaPage } from './lib/qa-first-run.mjs';
import { GBFS_CLUSTER_CELLS_DEG, clusterGbfsVehicles, gbfsBoxWantsClusters } from '../src/data/gbfsFeeds.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const SHOTS_DIR = path.join(REPO_ROOT, 'qa-shots', 'shared-mobility-fr');
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const APP_URL = option('--url', process.env.QA_BASE_URL || 'http://localhost:4173');
const APP_ORIGIN = new URL(APP_URL).origin;
const HEADFUL = args.includes('--headful');

const chromeCandidates = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  (() => { try { return puppeteer.executablePath(); } catch { return null; } })(),
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
].filter(Boolean);
const chrome = chromeCandidates.find((candidate) => {
  try { return fs.existsSync(candidate); } catch { return false; }
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Nantes: a real mix of dock stations and a small free-floating fleet. */
const CITY = { lon: -1.5536, lat: 47.2184 };
/**
 * Ellipsoidal height below which an anchor is judged to be on the ELLIPSOID
 * and not on Nantes. The city sits a few metres above the sea, but the geoid
 * runs ~+47 m through western France, so a real floor there is tens of metres
 * of ellipsoidal height — while the pre-fix anchor was the 2.5 m lift alone.
 */
const GROUND_FLOOR_MIN_M = 20;

const DOCK_SYSTEM = {
  id: 'gbfs-dock', name: 'Naolib Nantes', area: 'Nantes Métropole', kind: 'docked',
  licence: 'ODbL 1.0', publisher: 'Nantes Métropole', pageUrl: null, datasetUrl: null,
  stationsSuppressed: 0, retrievedAt: new Date().toISOString(), stale: false, error: null,
};
const FLOAT_SYSTEM = {
  id: 'gbfs-float', name: 'Pony Nantes', area: 'Nantes Métropole', kind: 'free-floating',
  licence: 'Licence Ouverte 2.0', publisher: 'Pony', pageUrl: null, datasetUrl: null,
  // The two numbers this harness exists to keep visible: the municipal bays
  // merged out across operators, and the operator's own bays that held nothing.
  stationsSuppressed: 2480, baysHidden: 392,
  retrievedAt: new Date().toISOString(), stale: false, error: null,
};
/** A second operator in the same street — the case the colour channel exists for. */
const FLOAT_SYSTEM_B = {
  id: 'gbfs-float-b', name: 'Lime Nantes', area: 'Nantes Métropole', kind: 'free-floating',
  licence: 'Licence Ouverte 2.0', publisher: 'Lime', pageUrl: null, datasetUrl: null,
  stationsSuppressed: 0, retrievedAt: new Date().toISOString(), stale: false, error: null,
};

function objectsPayload() {
  const now = Math.floor(Date.now() / 1000);
  const stations = [];
  for (let i = 0; i < 12; i++) {
    const known = i < 9;
    stations.push({
      id: `gbfs-dock:${i}`,
      system: DOCK_SYSTEM.id,
      lat: Number((CITY.lat - 0.01 + Math.floor(i / 4) * 0.008).toFixed(5)),
      lon: Number((CITY.lon - 0.015 + (i % 4) * 0.01).toFixed(5)),
      name: `Station ${i}`,
      // Three stations publish NO availability. They must not read as empty.
      available: known ? (i % 3 === 0 ? 0 : 6 + i) : null,
      docks: known ? 4 : null,
      capacity: known ? 20 : null,
      renting: true,
      byKind: known ? { bike: 4, ebike: 2 } : null,
      virtual: false,
    });
  }
  // A Pony bay whose feed published `station_id` in the name field, so the
  // parser dropped the echo and it arrives here nameless. It must be labelled
  // by its OPERATOR, never by an identifier the reader cannot use.
  stations.push({
    id: 'gbfs-float:bay-1',
    system: FLOAT_SYSTEM.id,
    lat: Number((CITY.lat - 0.002).toFixed(5)),
    lon: Number((CITY.lon - 0.018).toFixed(5)),
    name: null,
    virtual: true,
    available: 2,
    docks: null,
    capacity: null,
    renting: true,
    byKind: { ebike: 2 },
  });
  const vehicles = [];
  const kinds = ['ebike', 'scooter', 'bike', 'moped'];
  for (let i = 0; i < 20; i++) {
    // Operator alternates every FOUR vehicles while kind cycles every one, so
    // each operator runs all four kinds. The two channels have to be readable
    // at once, and a fixture that correlated them would let either channel
    // pass on the other's evidence.
    const system = Math.floor(i / kinds.length) % 2 === 0 ? FLOAT_SYSTEM : FLOAT_SYSTEM_B;
    vehicles.push({
      id: `${system.id}:${i}`,
      system: system.id,
      lat: Number((CITY.lat + 0.004 + Math.floor(i / 5) * 0.005).toFixed(5)),
      lon: Number((CITY.lon + 0.004 + (i % 5) * 0.006).toFixed(5)),
      kind: kinds[i % kinds.length],
      rangeMeters: 8000 + i * 100,
      lastReported: now - 45,
    });
  }
  return {
    status: 'ready',
    retrievedAt: new Date().toISOString(),
    box: { south: CITY.lat - 0.1, west: CITY.lon - 0.1, north: CITY.lat + 0.1, east: CITY.lon + 0.1 },
    stations,
    vehicles,
    systems: [
      { ...DOCK_SYSTEM, stationsInView: stations.length - 1, vehiclesInView: 0 },
      { ...FLOAT_SYSTEM, stationsInView: 1, vehiclesInView: vehicles.filter((v) => v.system === FLOAT_SYSTEM.id).length },
      { ...FLOAT_SYSTEM_B, stationsInView: 0, vehiclesInView: vehicles.filter((v) => v.system === FLOAT_SYSTEM_B.id).length },
    ],
    systemsMatched: 3,
    systemsFetched: 3,
    systemsFailed: 0,
    systemsTruncated: false,
    objectsTruncated: false,
    redundantSystems: 23,
    indexGeneratedAt: new Date().toISOString(),
  };
}

const failures = [];
function check(label, condition, detail = '') {
  const ok = Boolean(condition);
  if (!ok) failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}${detail && !ok ? ` — ${detail}` : ''}`);
  return ok;
}

/** Render frames explicitly — headless WebGL can stall the rAF loop outright. */
async function pump(page, frames = 8, gapMs = 80) {
  for (let frame = 0; frame < frames; frame++) {
    await page.evaluate(() => {
      try { window.__godsEyeView?.viewer?.scene?.render(); } catch { /* stalled context */ }
    });
    await sleep(gapMs);
  }
}

async function shoot(page, name) {
  try {
    await page.evaluate(() => { try { window.__godsEyeView?.viewer?.scene?.render(); } catch { /* stalled */ } });
    await page.screenshot({ path: path.join(SHOTS_DIR, name) });
  } catch (error) {
    console.log(`  · screenshot ${name} unavailable (${String(error?.message || error).split('\n')[0]})`);
  }
}

async function setView(page, lon, lat, height) {
  await page.evaluate((lo, la, h) => {
    const gev = window.__godsEyeView;
    const ellipsoid = gev.viewer.scene.globe?.ellipsoid || gev.viewer.scene.ellipsoid;
    const d2r = Math.PI / 180;
    try { gev.viewer.camera.cancelFlight(); } catch { /* no flight active */ }
    gev.viewer.camera.setView({
      destination: ellipsoid.cartographicToCartesian({ longitude: lo * d2r, latitude: la * d2r, height: h }),
      orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
    });
    gev.viewer.scene.requestRender?.();
  }, lon, lat, height);
  await pump(page, 4);
}

function probe(page) {
  return page.evaluate(() => {
    const gev = window.__godsEyeView;
    const module = gev.dataManager.layers.get('shared-mobility-fr').module;

    // Read what actually reached the SCENE, not what the layer says it drew.
    // The collections are found by the id of the objects inside them, so this
    // cannot accidentally sample another layer's sprites.
    const ellipsoid = gev.viewer.scene.globe?.ellipsoid || gev.viewer.scene.ellipsoid;
    // Stations and vehicle dots share one point collection since 2026-09-21,
    // and the pins have their own; every collection is read, and an item is
    // told apart by what it is — a pin carries an image, a dot does not.
    const scan = (prefix) => {
      const primitives = gev.viewer.scene.primitives;
      const drawn = [];
      for (let i = 0; i < primitives.length; i++) {
        const collection = primitives.get(i);
        if (typeof collection?.get !== 'function' || !collection.length) continue;
        const first = collection.get(0);
        if (typeof first?.id !== 'string' || !first.id.startsWith('gbfs-')) continue;
        for (let n = 0; n < collection.length; n++) {
          const item = collection.get(n);
          if (typeof item.id !== 'string' || !item.id.startsWith(prefix)) continue;
          // The ANCHOR, read off the primitive rather than off the layer's
          // own record: a record that agrees with the ground while the sprite
          // does not is the bug with a passing test.
          const carto = item.position ? ellipsoid.cartesianToCartographic(item.position) : null;
          const screen = item.image && item.position
            ? gev.viewer.scene.cartesianToCanvasCoordinates(item.position)
            : null;
          drawn.push({
            id: item.id,
            image: item.image || null,
            color: item.color?.toCssHexString?.() || null,
            outline: item.outlineColor?.toCssHexString?.() || null,
            // A dock is TWO points under one id since 2026-09-21: the ringed
            // disc, and the availability core with no ring at all.
            core: !item.image && item.outlineWidth === 0,
            pixelSize: item.pixelSize ?? null,
            height: carto ? carto.height : null,
            screen: screen ? { x: screen.x, y: screen.y } : null,
          });
        }
      }
      return drawn;
    };

    return {
      stats: module.getStats(),
      systems: module.getSystemSummaries(),
      legend: module.getRowControls().legend.map((item) => [item.label, item.count]),
      legendRows: module.getRowControls().legend.map((item) => ({
        label: item.label, color: item.color, glyph: item.glyph || null, channel: item.channel,
        toggle: item.toggle || null,
      })),
      segments: (module.getRowControls().legendSegments || []).map((segment) => segment.label),
      detections: module.getDetectableObjects({ maxCount: 100000 }).map((entry) => entry.id),
      rendered: module.getDetectableObjects({ maxCount: 100000 }).length,
      glyphs: scan('gbfs-float').filter((item) => !item.image && !item.core && !item.id.includes('bay')),
      pins: scan('gbfs-float').filter((item) => item.image),
      bays: scan('gbfs-float').filter((item) => !item.image && !item.core && item.id.includes('bay')),
      dots: scan('gbfs-dock').filter((item) => !item.core),
      cores: scan('gbfs-dock').filter((item) => item.core),
      places: (() => {
        const primitives = gev.viewer.scene.primitives;
        const names = [];
        for (let i = 0; i < primitives.length; i++) {
          const collection = primitives.get(i);
          if (typeof collection?.get !== 'function') continue;
          for (let n = 0; n < collection.length; n++) {
            const item = collection.get(n);
            if (typeof item?.text === 'string' && String(item.id).startsWith('shared-mobility-fr-place:')) names.push(item.text);
          }
        }
        return names;
      })(),
      zoomCard: (() => {
        const card = document.getElementById('zoom-prompt');
        return Boolean(card && !card.hidden && card.offsetParent);
      })(),
    };
  });
}

async function main() {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  const browser = await puppeteer.launch({
    headless: !HEADFUL,
    executablePath: chrome,
    args: ['--enable-unsafe-swiftshader', '--no-sandbox', '--window-size=1600,1000'],
    defaultViewport: { width: 1600, height: 1000 },
    protocolTimeout: 45000,
  });

  try {
    const page = await newQaPage(browser);
    const consoleErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });

    const payload = objectsPayload();
    let objectRequests = 0;
    let clusterRequests = 0;
    let networkRequests = 0;
    // The fixture's 20 vehicles are far under the proxy's density rule, which
    // is the point of sections i–vi: a sparse city keeps its dots. Section vii
    // lowers the rule to what the fixture holds, to see the groups drawn.
    let clusterAbove;
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.origin === APP_ORIGIN && url.pathname === '/api/shared-mobility-fr/objects') {
        objectRequests += 1;
        // Asked for groups, the fixture answers the way the proxy does — with
        // the proxy's own function, over the same vehicles.
        const cell = Number(url.searchParams.get('cluster'));
        let body = payload;
        const box = ['south', 'west', 'north', 'east'].reduce((out, edge) => ({ ...out, [edge]: Number(url.searchParams.get(edge)) }), {});
        const parts = payload.systems.map((system) => ({
          id: system.id,
          vehicles: payload.vehicles.filter((vehicle) => vehicle.system === system.id),
        }));
        if (GBFS_CLUSTER_CELLS_DEG.includes(cell) && gbfsBoxWantsClusters(parts, box, clusterAbove, cell)) {
          clusterRequests += 1;
          const { clusters, vehicles, counted } = clusterGbfsVehicles(parts, box, cell);
          body = { ...payload, vehicles, clusters, clusterDeg: cell, vehiclesCounted: counted };
        }
        void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
        return;
      }
      if (url.origin === APP_ORIGIN && url.pathname === '/api/shared-mobility-fr/networks') {
        networkRequests += 1;
        void request.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            places: [{
              id: 'gbfs-dock',
              name: 'Nantes',
              lat: CITY.lat,
              lon: CITY.lon,
              bbox: { south: CITY.lat - 0.1, west: CITY.lon - 0.15, north: CITY.lat + 0.1, east: CITY.lon + 0.15 },
              systems: [{ id: 'gbfs-dock', name: 'Naolib Nantes' }, { id: 'gbfs-float', name: 'Pony Nantes' }],
              weight: 1,
            }],
          }),
        });
        return;
      }
      if (url.origin === APP_ORIGIN && url.pathname === '/api/shared-mobility-fr/systems') {
        void request.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ catalogResourceCount: 165, distinctSystemCount: 135, redundantCount: 23 }),
        });
        return;
      }
      void request.continue();
    });

    console.log(`[qa] booting ${APP_URL}`);
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(
      () => window.__godsEyeView?.viewer && window.__godsEyeView?.dataManager,
      { timeout: 60000, polling: 200 },
    );
    await sleep(2000);

    // ── i. the country view draws places, not fleets ───────────────────────
    //
    // Until 2026-09-21 this view was a « Zoome pour charger » card and an empty
    // map. It is now the places a network runs in, from one small request.
    console.log('[qa] i. country view');
    await setView(page, CITY.lon, CITY.lat, 400_000);
    await page.evaluate(() => window.__godsEyeView.dataManager.setEnabled('shared-mobility-fr', true));
    let gated = null;
    for (let attempt = 0; attempt < 20; attempt++) {
      await pump(page, 3, 60);
      await sleep(300);
      gated = await probe(page);
      if (gated.places.length) break;
    }
    check('a country view issues no fleet request', objectRequests === 0, `${objectRequests} request(s)`);
    check('but asks where the networks run, once', networkRequests === 1, `${networkRequests} request(s)`);
    check('and labels the place with its name', JSON.stringify(gated.places) === '["Nantes"]', JSON.stringify(gated.places));
    check('with no vehicle drawn and no « zoom in » card',
      gated.rendered === 0 && !gated.zoomCard && gated.stats.status === 'ok',
      `${gated.rendered} points, card=${gated.zoomCard}, status=${gated.stats.status}`);
    check('while the key names its operators without a count',
      gated.legendRows.some((row) => row.label === 'Naolib') && gated.legend.every(([, count]) => count === undefined || count === null),
      JSON.stringify(gated.legend));
    await shoot(page, '01-country.png');

    // ── ii. a city view draws the inventory ────────────────────────────────
    console.log('[qa] ii. city view');
    await setView(page, CITY.lon, CITY.lat, 6_000);
    let loaded = null;
    for (let attempt = 0; attempt < 25; attempt++) {
      await pump(page, 3, 60);
      await sleep(400);
      loaded = await probe(page);
      if (objectRequests >= 1 && !loaded.stats.loading && loaded.stats.count > 0) break;
    }
    check('the viewport request is issued once inside the gate', objectRequests >= 1, `${objectRequests}`);
    check('one point per object', loaded.rendered === 33, `${loaded.rendered} for 13 stations + 20 vehicles`);
    check('stations and vehicles are both drawn', loaded.stats.count === 33, `count=${loaded.stats.count}`);
    await shoot(page, '02-city.png');

    // ── ii-bis. the fleet stands on the ground ─────────────────────────────
    //
    // A point anchored at ellipsoid 0 is not "slightly off": depth testing is
    // disabled so it is painted anyway, and its screen position then follows
    // the CAMERA POSE — drag the map and the whole fleet slides over the
    // rooftops. The fix reads the floor before placing anything and comes back
    // when a better one lands, so this waits for the settle rather than
    // asserting on the first frame.
    console.log('[qa] ii-bis. the fleet stands on the ground');
    let anchored = loaded;
    for (let attempt = 0; attempt < 25; attempt++) {
      const heights = [...anchored.dots, ...anchored.bays, ...anchored.glyphs].map((item) => item.height);
      if (heights.length && heights.every((h) => Number.isFinite(h) && h > GROUND_FLOOR_MIN_M)) break;
      await pump(page, 3, 60);
      await sleep(400);
      anchored = await probe(page);
    }
    const anchorHeights = [...anchored.dots, ...anchored.bays, ...anchored.glyphs].map((item) => item.height);
    const buried = anchorHeights.filter((h) => !Number.isFinite(h) || h <= GROUND_FLOOR_MIN_M).length;
    const lowest = anchorHeights.length ? Math.min(...anchorHeights) : null;
    const highest = anchorHeights.length ? Math.max(...anchorHeights) : null;
    console.log(`  · ${anchorHeights.length} anchors, `
      + `${lowest === null ? 'n/a' : lowest.toFixed(1)}-${highest === null ? 'n/a' : highest.toFixed(1)} m `
      + `ellipsoidal, ${buried} on the ellipsoid`);
    check('every drawn object is placed on the ground, not on the ellipsoid',
      anchorHeights.length === 33 && buried === 0,
      `${buried} of ${anchorHeights.length} still at ellipsoid height`
      + ` (range ${lowest === null ? 'n/a' : lowest.toFixed(1)}`
      + `-${highest === null ? 'n/a' : highest.toFixed(1)} m)`);
    // One city is one floor. The bound is loose on purpose — Nantes really
    // does have relief, and the measured spread was 34.3 m — because the
    // failure it guards is not a few metres: it is half the fleet borrowing a
    // floor from ground it does not stand on, which is hundreds.
    check('and they share one city floor',
      lowest !== null && highest - lowest < 120,
      `${lowest === null ? 'n/a' : (highest - lowest).toFixed(1)} m between the lowest and the highest`);

    // ── iii. the legend counts what is on screen ───────────────────────────
    console.log('[qa] iii. row legend');
    // Since 2026-09-21 the key counts by OPERATOR (and names families in its
    // segmented control), so the fixture's 33 objects are read per operator:
    // 13 Pony (12 vehicles + the Pony bay), 12 Naolib docks, 8 Lime.
    const byLabel = Object.fromEntries(loaded.legend);
    check('the key counts every operator in view, and the counts add up to the screen',
      byLabel.Pony === 13 && byLabel.Naolib === 12 && byLabel.Lime === 8,
      JSON.stringify(loaded.legend));
    check('the docks on screen bring their fill key with them',
      ['bien remplie', 'à moitié', 'presque vide'].every((label) => label in byLabel),
      JSON.stringify(loaded.legend));
    check('with no zero-count operator',
      loaded.legend.every(([, count]) => count === null || count > 0), JSON.stringify(loaded.legend));

    // ── iv. the merged-out bays are reported ───────────────────────────────
    console.log('[qa] iv. merged bays are declared');
    const suppressed = loaded.systems.reduce((sum, system) => sum + (system.stationsSuppressed || 0), 0);
    check('the layer reports the shared bays it did not draw', suppressed === 2480, `${suppressed}`);
    // The control row has been French since the layer's screens were
    // translated (#173); this harness still asserted the English it shipped
    // with, so it had been failing on a healthy base.
    check('and says so in the control row',
      // `\s` on purpose: `Intl.NumberFormat('fr-FR')` groups with a NARROW
      // NO-BREAK SPACE (U+202F), not a plain one, so "2 480" typed by hand
      // never matches what the row actually prints.
      /2\s480 stations mutualisées fusionnées/.test(loaded.stats.loadingLabel || ''), loaded.stats.loadingLabel);
    const emptyBays = loaded.systems.reduce((sum, system) => sum + (system.baysHidden || 0), 0);
    check('the layer reports the empty painted bays the proxy dropped', emptyBays === 392, `${emptyBays}`);
    check('and says that in the control row too',
      /392 aires vides masquées/.test(loaded.stats.loadingLabel || ''), loaded.stats.loadingLabel);
    // The screen-facing half of the same fix: a bay whose feed published an
    // identifier instead of a name is labelled by its operator, and no HUD
    // label anywhere is a raw GBFS `station_id`.
    check('a nameless bay is labelled by its operator, not by its station_id',
      loaded.detections.includes('AIRE PONY'), loaded.detections.slice(0, 6).join(' | '));
    check('and no detection label is a raw feed identifier',
      !loaded.detections.some((id) => /_ZID[A-Z0-9]{6,}|_PARKING_/.test(id)),
      loaded.detections.filter((id) => /_ZID|_PARKING_/.test(id)).join(' | '));

    // ── v. SHAPE rides the pin ─────────────────────────────────────────────
    console.log('[qa] v. shape channel');
    check('every vehicle reaches the scene as a dot',
      loaded.glyphs.length === 20 && loaded.glyphs.every((dot) => dot.image === null),
      `${loaded.glyphs.length} dot(s)`);
    check('and from the city view no vehicle is pinned — the dots carry it',
      loaded.pins.length === 0, `${loaded.pins.length} pin(s) at 6 km`);
    // Since 2026-09-21 the key names FAMILIES as a segmented control rather
    // than reprinting the silhouettes: e-bike and bike are one « Vélos ».
    check('the key offers one segment per family on screen, after « Tous »',
      JSON.stringify(loaded.segments) === JSON.stringify(['Tous', 'Vélos', 'Trottinettes', 'Scooters']),
      JSON.stringify(loaded.segments));

    // Down to 2.4 km over the middle of the fleet — under the pins' ceiling,
    // with the fixture's vehicles ~260 px apart, so each one clear of the side
    // panels has room for its own pin.
    await setView(page, CITY.lon + 0.016, CITY.lat + 0.0115, 2_400);
    // The pins are chosen on arrival and again when the answer for the new
    // view lands, so this waits for a set that two reads agree on.
    let street = await probe(page);
    let previous = '';
    for (let attempt = 0; attempt < 25; attempt++) {
      await pump(page, 3, 60);
      await sleep(400);
      street = await probe(page);
      const signature = street.pins.map((pin) => pin.id).sort().join(',');
      if (signature && signature === previous && !street.stats.loading) break;
      previous = signature;
    }
    const kindById = new Map(payload.vehicles.map((vehicle) => [vehicle.id, vehicle.kind]));
    const systemById = new Map(payload.vehicles.map((vehicle) => [vehicle.id, vehicle.system]));
    check('close to the street, vehicles wear pins',
      street.pins.length >= 4, `${street.pins.length} pin(s) at 2.4 km`);
    check('every pin stands on a vehicle of the answer',
      street.pins.every((pin) => kindById.has(pin.id)), street.pins.map((pin) => pin.id).join(', '));
    const imageByKey = new Map();
    let shared = 0;
    for (const pin of street.pins) {
      const key = `${systemById.get(pin.id)}|${kindById.get(pin.id)}`;
      if (imageByKey.has(key) && imageByKey.get(key) !== pin.image) shared = -1;
      imageByKey.set(key, pin.image);
    }
    const imagesByOperator = new Map();
    for (const [key, image] of imageByKey) {
      const [system] = key.split('|');
      if (!imagesByOperator.has(system)) imagesByOperator.set(system, []);
      imagesByOperator.get(system).push(image);
    }
    for (const images of imagesByOperator.values()) {
      if (new Set(images).size !== images.length) shared += 1;
    }
    check('a pin wears its vehicle\'s kind: one image per kind and operator, no two kinds alike',
      shared === 0 && imageByKey.size >= 3, `${imageByKey.size} kind×operator image(s), clash=${shared}`);
    const onScreen = street.pins.filter((pin) => pin.screen);
    let closest = Infinity;
    for (let i = 0; i < onScreen.length; i++) {
      for (let j = i + 1; j < onScreen.length; j++) {
        closest = Math.min(closest, Math.hypot(onScreen[i].screen.x - onScreen[j].screen.x,
          onScreen[i].screen.y - onScreen[j].screen.y));
      }
    }
    check('and no two pins stand within 200 px of each other',
      onScreen.length < 2 || closest >= 200, `closest pair ${Math.round(closest)} px`);
    await shoot(page, '03-pins.png');
    await setView(page, CITY.lon, CITY.lat, 6_000);

    // ── vi. COLOUR says who runs it ────────────────────────────────────────
    console.log('[qa] vi. operator channel');
    const hueById = new Map(loaded.glyphs.map((dot) => [dot.id, dot.color]));
    const pony = [...hueById].filter(([id]) => id.startsWith('gbfs-float:')).map(([, hue]) => hue);
    const lime = [...hueById].filter(([id]) => id.startsWith('gbfs-float-b:')).map(([, hue]) => hue);
    check('every vehicle of one operator is drawn in one hue',
      new Set(pony).size === 1 && new Set(lime).size === 1,
      `${new Set(pony).size} / ${new Set(lime).size}`);
    check('and the two operators in the same street are NOT the same hue',
      pony[0] !== lime[0], `${pony[0]} vs ${lime[0]}`);
    const ponyShapes = new Set(street.pins.filter((pin) => pin.id.startsWith('gbfs-float:'))
      .map((pin) => pin.image));
    const ponyKinds = new Set(street.pins.filter((pin) => pin.id.startsWith('gbfs-float:'))
      .map((pin) => kindById.get(pin.id)));
    check('the two channels are independent — one operator, a silhouette per kind, one hue',
      ponyShapes.size === ponyKinds.size && ponyKinds.size >= 2 && new Set(pony).size === 1,
      `${ponyShapes.size} shape(s) for ${ponyKinds.size} kind(s), ${new Set(pony).size} hue(s)`);
    // The Naolib docks only — the Pony bay is ringed in ITS operator's hue,
    // which is the whole point of the channel and would break a "one hue" read.
    const dockDots = loaded.dots.filter((dot) => dot.id.startsWith('gbfs-dock:'));
    const stationHues = new Set(dockDots.map((dot) => dot.outline));
    check('a station is RINGED in its operator hue',
      dockDots.length === 12 && stationHues.size === 1 && stationHues.has([...stationHues][0]),
      JSON.stringify([...stationHues]));
    const ring = [...stationHues][0]?.slice(0, 7);
    const dockCores = loaded.cores.filter((core) => core.id.startsWith('gbfs-dock:'));
    check('while a CORE in the ring\'s own hue answers availability — and an emptied dock has none',
      dockCores.length > 0 && dockCores.length < dockDots.length
        && dockCores.every((core) => core.color?.slice(0, 7) === ring)
        && new Set(dockCores.map((core) => core.pixelSize)).size >= 1,
      `${dockCores.length} core(s) for ${dockDots.length} docks, hues ${JSON.stringify([...new Set(dockCores.map((core) => core.color))])}`);
    const operatorRows = loaded.legendRows.filter((row) => row.channel === 'Fournisseurs');
    check('every named operator line is a switch offered to the whole row',
      operatorRows.length >= 3 && operatorRows.every((row) => row.toggle?.param === 'operator' && row.toggle.fanOut),
      JSON.stringify(operatorRows.map((row) => row.label)));
    check('the legend names every operator in view',
      ['Naolib', 'Pony', 'Lime'].every((name) => loaded.legendRows.some((row) => row.label === name)),
      JSON.stringify(loaded.legendRows.map((row) => row.label)));
    check('and the detection readout says whose vehicle it is',
      loaded.detections.some((id) => id.startsWith('LIME ')) && loaded.detections.some((id) => id.startsWith('PONY ')),
      loaded.detections.slice(0, 4).join(' | '));
    await shoot(page, '04-channels.png');

    // ── vii. the city-wide groups ──────────────────────────────────────────
    console.log('[qa] vii. city-wide groups');
    check('a sparse city is not grouped, even from above the pins\' ceiling',
      clusterRequests === 0, `${clusterRequests} grouped answer(s) for 20 vehicles`);
    clusterAbove = 1;
    await setView(page, CITY.lon + 0.016, CITY.lat + 0.0115, 9_000);
    const readGroups = () => page.evaluate(() => {
      const scene = window.__godsEyeView.viewer.scene;
      const labels = [];
      let vehicleDots = 0;
      for (let i = 0; i < scene.primitives.length; i++) {
        const collection = scene.primitives.get(i);
        if (typeof collection?.get !== 'function' || !collection.length) continue;
        for (let n = 0; n < collection.length; n++) {
          const item = collection.get(n);
          if (typeof item.id !== 'string') continue;
          if (typeof item.text === 'string' && item.id.startsWith('shared-mobility-fr-group:')) labels.push(item.text);
          if (!item.image && typeof item.text !== 'string' && /^gbfs-float(-b)?:\d+$/.test(item.id)) vehicleDots += 1;
        }
      }
      return { labels, vehicleDots };
    });
    let groups = await readGroups();
    for (let attempt = 0; attempt < 25 && !groups.labels.length; attempt++) {
      await pump(page, 3, 60);
      await sleep(400);
      groups = await readGroups();
    }
    const grouped = groups.labels.reduce((sum, text) => sum + Number(text.replace(/\D/g, '')), 0);
    check('a dense city-wide view is answered in groups', clusterRequests >= 1, `${clusterRequests} grouped answer(s)`);
    check('and draws them as bubbles', groups.labels.length >= 1, `${groups.labels.length} bubble(s)`);
    // Under the groups a station is not drawn: its available vehicles join the
    // bubble of its cell, as the Vélib' docks do (since 2026-09-21).
    const docked = payload.stations.reduce((sum, station) => (
      sum + (Number(station.available) > 0 && station.renting !== false ? Number(station.available) : 0)), 0);
    check('every vehicle is in exactly one bubble or one dot, and every docked one in a bubble',
      grouped + groups.vehicleDots === payload.vehicles.length + docked,
      `${grouped} grouped + ${groups.vehicleDots} alone for ${payload.vehicles.length} + ${docked} docked`);
    await shoot(page, '05-groups.png');

    const relevant = consoleErrors.filter((entry) => !/favicon|Failed to load resource/i.test(entry));
    check('no console errors from the layer',
      !relevant.some((entry) => /SharedMobility|shared-mobility/i.test(entry)),
      relevant.filter((entry) => /SharedMobility|shared-mobility/i.test(entry)).join(' | '));

    console.log(`\n[qa] shots → ${path.relative(REPO_ROOT, SHOTS_DIR)}`);
  } finally {
    await browser.close();
  }

  if (failures.length) {
    console.error(`\n[qa] FAILED (${failures.length}):`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
  } else {
    console.log('\n[qa] PASS');
  }
}

main().catch((error) => {
  console.error('[qa] harness error:', error);
  process.exitCode = 1;
});
