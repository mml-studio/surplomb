#!/usr/bin/env node
/**
 * qa-firstrun — the first-run experience's contract, proved in the real app.
 *
 * The unit suite pins the show policy, the variant table and the bubble against
 * fakes. This harness answers the questions only a running app can: does the
 * card wait for the boot flight to land, does variant A actually fly to the
 * address and switch the address layers on where it lands, do B's tiles switch
 * their layers on without moving the camera, does C's bubble point at the
 * search field it advertises and open it — and does any of it disturb the
 * reasonable-defaults startup look, or the keys that stop it coming back.
 *
 * Usage:
 *   node scripts/qa-firstrun.mjs --url http://localhost:4191
 *   node scripts/qa-firstrun.mjs --url http://localhost:4191 --teeth
 *   node scripts/qa-firstrun.mjs --url http://localhost:4191 --shots
 *   node scripts/qa-firstrun.mjs --url http://localhost:4191 --only variant-C,viewports
 *
 * `--teeth` is the negative control: it removes the card, the bubble and the
 * variant templates before the app can use them, so every behavioural section
 * below must go RED. A green --teeth run means the assertions are not measuring
 * what they claim to.
 *
 * `--shots` writes the taste-pass screenshots into qa-shots/firstrun/. Off by
 * default: on this Mac a capture of the parked globe can time out, and a
 * timed-out capture condemns every evaluate after it.
 *
 * Section A needs the geocoder (`/api/geocode`, keyless: Nominatim + IGN). If
 * it is down, the A sections fail on the lookup, not on the card — the detail
 * line says which.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import {
  PHONE_DEVICE,
  QA_WAIT_POLLING_MS,
  disablePhotoreal,
  phoneUrl,
  skipVitrine,
} from './lib/qa-first-run.mjs';
import {
  FIRST_RUN_SESSION_KEY,
  FIRST_RUN_STORAGE_KEY,
} from '../src/firstRunExperience.js';
import { FIRST_RUN_ADDRESS_BUNDLE, FIRST_RUN_VARIANTS } from '../src/firstRunVariants.js';

const args = process.argv.slice(2);
const getOpt = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const APP_URL = getOpt('--url', 'http://localhost:4173').replace(/\/$/, '');
const TEETH = args.includes('--teeth');
const HEADFUL = args.includes('--headful');
const SHOTS = args.includes('--shots');
const ONLY = new Set(getOpt('--only', '').split(',').map((name) => name.trim()).filter(Boolean));

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOT_DIR = path.join(ROOT, 'qa-shots', 'firstrun');

const CHROME_CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  // The installed Chrome FIRST. Measured 2026-09-17 on this Mac: Chrome for
  // Testing stopped producing frames mid-session (the boot flight parked at
  // 25 km, so the card's reveal never ran) while the installed Chrome, same
  // flags, same server, same minute, landed and revealed in 5.5 s.
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  (() => { try { return puppeteer.executablePath(); } catch { return null; } })(),
].filter(Boolean);

const LAUNCHER = '#first-run-launcher';
const HINT = '#first-run-hint';
const KEYS = { durable: FIRST_RUN_STORAGE_KEY, session: FIRST_RUN_SESSION_KEY };
/** Every layer a choice can switch on, plus the one the boot already does. */
const WATCHED_LAYERS = [...new Set([
  ...FIRST_RUN_ADDRESS_BUNDLE,
  ...Object.values(FIRST_RUN_VARIANTS.B.tiles).flatMap((tile) => tile.layerIds),
])];
const EIFFEL = { lat: 48.8584, lon: 2.2945 };
const VIEUX_PORT = { lat: 43.2951, lon: 5.3744 };

const results = [];
let currentSection = 'setup';
function record(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail, section: currentSection });
  console.log(`  [${ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'}] ${name}${detail ? ` — ${detail}` : ''}`);
}

/**
 * Run one independent section.
 *
 * Sections are isolated on purpose. A single straight line ends at the FIRST
 * throw — under `--teeth` that once meant 9 of 38 checks ever ran while the
 * control still claimed to have teeth. A throw now fails its own section and
 * the rest still run, which is what makes the per-section tally meaningful.
 */
async function section(name, body) {
  if (ONLY.size && !ONLY.has(name)) return;
  currentSection = name;
  console.log(`\n  \x1b[2m── ${name} ──\x1b[0m`);
  try {
    await body();
  } catch (error) {
    record(`[${name}] section completed without throwing`, false, error.message);
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Poll a predicate with `page.evaluate`. Never `waitForFunction`'s rAF clock:
 * this app parks its render loop, and headless Chrome here may never tick rAF.
 * @returns {Promise<any>} the last value, truthy or not.
 */
async function waitFor(page, predicate, arg = null, { timeout = 30000, interval = QA_WAIT_POLLING_MS * 4 } = {}) {
  const until = Date.now() + timeout;
  let value;
  do {
    value = await page.evaluate(predicate, arg).catch(() => undefined);
    if (value) return value;
    await sleep(interval);
  } while (Date.now() < until);
  return value;
}

/** `node.click()` in the page: puppeteer's pointer path stalls on this app. */
const domClick = (page, selector) => page.evaluate((sel) => {
  const node = document.querySelector(sel);
  node?.click();
  return Boolean(node);
}, selector);

/** Type into a field the way a form sees it, then submit its form. */
const typeAndSubmit = (page, selector, value) => page.evaluate((sel, text) => {
  const field = document.querySelector(sel);
  if (!field) return false;
  field.focus();
  field.value = text;
  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.form?.requestSubmit();
  return true;
}, selector, value);

/** Where the first-run experience stands in the live page. */
const firstRunState = (page) => page.evaluate((sel) => {
  const node = document.querySelector(sel.launcher);
  const hint = document.querySelector(sel.hint);
  const rect = node?.getBoundingClientRect();
  const hit = rect && rect.width > 0 && rect.height > 0
    ? document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    : null;
  return {
    present: !!node,
    initialized: node?.dataset.initialized === 'true',
    variant: node?.dataset.firstRunVariant || hint?.dataset.firstRunVariant || null,
    classVisible: !!node?.classList.contains('visible'),
    onScreen: !!node && node.getClientRects().length > 0,
    topmost: !!(hit && node && node.contains(hit)),
    status: node?.querySelector('[data-first-run-status]')?.textContent || '',
    busy: node?.getAttribute('aria-busy') || null,
    hintPresent: !!hint,
    hintVisible: !!hint?.classList.contains('visible') && !hint.hidden,
    templates: document.querySelectorAll('template[data-first-run-variant]').length,
    durable: localStorage.getItem(sel.keys.durable),
    session: sessionStorage.getItem(sel.keys.session),
  };
}, { launcher: LAUNCHER, hint: HINT, keys: KEYS });

const cardUp = async (page) => (await firstRunState(page)).classVisible;

/** Camera, layers and the prefs a choice must not write. */
const appState = (page) => page.evaluate((ids) => {
  const gev = window.__godsEyeView || {};
  const sm = gev.styleManager;
  const dm = gev.dataManager;
  const camera = sm?.viewer?.camera;
  const carto = camera?.positionCartographic;
  // Effective intent: a layer still `enabling` has been switched on.
  const enabled = dm?.getEnabledLayerIds?.() || new Set();
  const layers = {};
  for (const id of ids) layers[id] = enabled.has(id);
  const panel = document.getElementById('global-context-panel');
  return {
    heightM: carto ? Math.round(carto.height) : null,
    lat: carto ? (carto.latitude * 180) / Math.PI : null,
    lon: carto ? (carto.longitude * 180) / Math.PI : null,
    layers,
    contextPanelCollapsed: panel ? panel.classList.contains('collapsed') : null,
    contextMode: sm?.getContextModeState?.().mode ?? null,
    detectionOverridden: sm?._detectionUserOverridden ?? null,
    layerStateBlob: localStorage.getItem('gev:layer-state:v2'),
    allocation: localStorage.getItem('gev:detection-allocation:v1'),
  };
}, WATCHED_LAYERS);

/** Great-circle distance, km. */
function distanceKm(a, b) {
  if (![a?.lat, a?.lon, b?.lat, b?.lon].every(Number.isFinite)) return Infinity;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

const enabledList = (state) => Object.entries(state.layers).filter(([, on]) => on).map(([id]) => id);

/**
 * Load the app and wait for the first-run experience to settle one way or the
 * other: the card revealed, the bubble up, or both removed. Revealed now means
 * AFTER the boot flight lands (~T+5.5 s on a desktop; immediate on a phone).
 *
 * `errorSink` is emptied on the way out: navigating away aborts whatever the
 * previous page had in flight, and Chrome reports those aborts as
 * "TypeError: Failed to fetch". Those belong to this harness, not to the app.
 */
async function open(page, {
  query = '', hash = '', clearAll = true, clearSession = true, errorSink = null, phone = false,
} = {}) {
  const url = phone ? phoneUrl(`${APP_URL}/${query}${hash}`) : `${APP_URL}/${query}${hash}`;
  // An unfocused Puppeteer tab reads `visibilityState === 'hidden'`: no frames,
  // so no boot flight, no reveal — the card waits forever for a landing.
  await page.bringToFront();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  if (clearAll || clearSession) {
    await page.evaluate((all) => {
      if (all) localStorage.clear();
      sessionStorage.clear();
    }, clearAll);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
  }
  await waitFor(page, (sel) => {
    if (!window.__godsEyeView?.styleManager) return false;
    const node = document.querySelector(sel.launcher);
    const hint = document.querySelector(sel.hint);
    if (hint?.classList.contains('visible')) return true;
    return !node || node.classList.contains('visible');
  }, { launcher: LAUNCHER, hint: HINT }, { timeout: 60000 });
  await sleep(400);
  const visibility = await page.evaluate(() => document.visibilityState).catch(() => null);
  if (visibility !== 'visible') console.log(`  \x1b[33m   WARN the page is ${visibility}: frames are not being produced\x1b[0m`);
  if (errorSink) errorSink.length = 0;
}

/** Wait for the card to leave; true if it did. */
const cardGone = (page, timeout = 30000) => waitFor(page, (sel) => {
  const node = document.querySelector(sel);
  return !node || !node.classList.contains('visible');
}, LAUNCHER, { timeout });

/**
 * Wait until every id has been switched on; returns the ids that were not.
 *
 * "Switched on" is the manager's effective INTENT (`getEnabledLayerIds`), not
 * `isEnabled`: the latter stays false while a layer is still `enabling`, and a
 * cold `/api/ads-fr` for a city the server has not read yet takes longer than
 * any wait worth writing here. Whether the choice ASKED is the card's contract;
 * how long the layer then takes is the layer's.
 */
async function layersOn(page, ids, timeout = 25000) {
  const read = () => page.evaluate((list) => {
    const enabled = window.__godsEyeView?.dataManager?.getEnabledLayerIds?.() || new Set();
    return list.filter((id) => !enabled.has(id));
  }, ids);
  const until = Date.now() + timeout;
  let missing = await read();
  while (missing.length && Date.now() < until) {
    await sleep(200);
    missing = await read();
  }
  return missing;
}

/** Give the layers up to `ms` to finish enabling, so what they persist is readable. */
const settleLayers = (page, ids, ms = 45000) => page.evaluate(async (list, limit) => {
  const dm = window.__godsEyeView?.dataManager;
  await Promise.race([
    Promise.all(list.map((id) => dm?.waitForLayerSettled?.(id))),
    new Promise((resolve) => setTimeout(resolve, limit)),
  ]);
}, ids, ms).catch(() => {});

async function shoot(page, name) {
  // The teeth run has no card, so its frames would overwrite the evidence.
  if (!SHOTS || TEETH) return null;
  const file = path.join(SHOT_DIR, `${name}.png`);
  try {
    await page.screenshot({ path: file, fromSurface: false });
    return path.relative(ROOT, file);
  } catch (error) {
    console.log(`  \x1b[2m   SKIP shot ${name}: ${error.message}\x1b[0m`);
    return null;
  }
}

/** A page the harness owns, with the same flags as the fleet, WITHOUT the suppression. */
async function launcherPage(browser, { consoleErrors, teeth = TEETH, phone = false, geolocation = null } = {}) {
  const page = await browser.newPage();
  // This harness deliberately skips `newQaPage()` — it is the one that PROVES
  // the card appears — but it has no use for the 3D globe, and an ion root
  // tile is billed per boot. See `disablePhotoreal`.
  await disablePhotoreal(page);
  // The bare root is the showcase for a first visitor; this harness is about
  // the card the cockpit shows, so it goes straight to the cockpit.
  await skipVitrine(page);
  if (phone) {
    // `newPhoneQaPage()`'s two load-bearing steps, minus the suppression.
    await page.emulate(PHONE_DEVICE);
    const client = await page.createCDPSession();
    await client.send('Emulation.setEmulatedMedia', {
      features: [
        { name: 'pointer', value: 'coarse' },
        { name: 'hover', value: 'none' },
        { name: 'any-pointer', value: 'coarse' },
        { name: 'any-hover', value: 'none' },
      ],
    });
  } else {
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  }
  if (geolocation) {
    // A fixed fix, so "Autour de moi" is offered and answers without a prompt.
    await page.evaluateOnNewDocument((fix) => {
      const geolocation = {
        getCurrentPosition(success) {
          setTimeout(() => success({
            coords: { latitude: fix.lat, longitude: fix.lon, accuracy: 30 },
            timestamp: Date.now(),
          }), 50);
        },
        watchPosition() { return 0; },
        clearWatch() {},
      };
      Object.defineProperty(navigator, 'geolocation', { configurable: true, get: () => geolocation });
    }, geolocation);
  }
  if (consoleErrors) {
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      const text = message.text();
      if (!/Failed to load resource.*(404|429|503)/i.test(text)) consoleErrors.push(text);
    });
    page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
  }
  if (teeth) {
    // Negative control: the markup never arrives, so nothing can be revealed.
    await page.evaluateOnNewDocument(() => {
      document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('#first-run-launcher, #first-run-hint, template[data-first-run-variant]')
          .forEach((node) => node.remove());
      });
    });
  }
  return page;
}

/** Every section the run is expected to reach; the teeth verdict requires all. */
const EXPECTED_SECTIONS = [
  'show-policy', 'esc-arbitration',
  'variant-A-address', 'variant-A-chip', 'variant-A-not-found', 'variant-A-look-around', 'variant-A-locate',
  'variant-B-tiles', 'variant-B-phone',
  'variant-C', 'variant-C-phone',
  'viewports', 'console',
];

/*
 * Sections that are NOT expected to go red under --teeth.
 *
 * `console` is a hygiene check, not a launcher check: with the card removed the
 * page legitimately still logs nothing, so demanding a red there would be
 * demanding a false failure. Everything else exists to test the first-run
 * experience and must collapse without it. This list is deliberately tiny and
 * named — it is the one place a section can be excused.
 */
const HYGIENE_SECTIONS = ['console'];

async function runShowPolicySection(page, { shots, consoleErrors }) {
  await section('show-policy', async () => {
    await open(page, { errorSink: consoleErrors });
    const fresh = await firstRunState(page);
    record('a fresh browser gets the card', fresh.classVisible);
    record('the default card is variant A', fresh.variant === 'A', `variant=${fresh.variant}`);
    record('the unused templates and the bubble host are gone', fresh.classVisible && fresh.templates === 0 && !fresh.hintPresent,
      `templates=${fresh.templates} hint=${fresh.hintPresent}`);
    const landed = await appState(page);
    // DEFAULT_CITY_VIEW frames the Eiffel Tower from 600 m; the flight starts
    // in orbit. A card revealed mid-descent would read thousands of km here.
    record('the card appears only once the boot flight has landed',
      fresh.classVisible && landed.heightM !== null && landed.heightM < 5000,
      `camera at ${landed.heightM} m when the card is up`);
    if (fresh.classVisible) shots.push(await shoot(page, 'card-A-desktop'));

    const focused = await page.evaluate(() => document.activeElement?.dataset?.firstRunAddress !== undefined);
    record('focus lands in the address field', focused);

    // The card is a flex column, and an author `display` on this id outranks
    // the UA's `[hidden]` rule. Prove the attribute still hides it.
    const hiddenHonored = await page.evaluate((sel) => {
      const node = document.querySelector(sel);
      if (!node) return null;
      node.hidden = true;
      const display = getComputedStyle(node).display;
      node.hidden = false;
      return display;
    }, LAUNCHER);
    record('the hidden attribute still hides the flex card', hiddenHonored === 'none',
      `computed display while hidden = ${hiddenHonored}`);

    const copy = await page.evaluate((sel) => ({
      kicker: document.querySelector(`${sel} .first-run-kicker`)?.textContent?.trim() || '',
      title: document.getElementById('first-run-title')?.textContent?.trim() || '',
      footerPx: Number.parseFloat(getComputedStyle(document.querySelector(`${sel} .first-run-footer`) || document.body).fontSize),
    }), LAUNCHER);
    record('the card speaks French', /PREMIÈRE VISITE/.test(copy.kicker) && /adresse/.test(copy.title),
      `${copy.kicker} / ${copy.title}`);
    record('the footer is readable (≥ 9 px)', copy.footerPx >= 9, `${copy.footerPx} px`);

    // ESC dismisses — stated as a TRANSITION, never as "not visible" alone,
    // which passes vacuously whenever the card never appeared.
    await page.keyboard.press('Escape');
    await sleep(600);
    const afterEsc = await firstRunState(page);
    record('ESC dismisses the card', fresh.classVisible && !afterEsc.classVisible,
      fresh.classVisible ? 'visible → dismissed' : 'never appeared, so nothing was dismissed');
    record('a close writes BOTH keys (once per browser)',
      fresh.classVisible && afterEsc.session === 'dismissed' && afterEsc.durable === 'suppressed',
      `session=${afterEsc.session} durable=${afterEsc.durable}`);

    await open(page, { clearAll: false, clearSession: false, errorSink: consoleErrors });
    const reload = await firstRunState(page);
    record('a reload in the same session stays quiet',
      fresh.classVisible && !reload.classVisible && !reload.hintVisible,
      `present=${reload.present}`);

    await open(page, { clearAll: false, clearSession: true, errorSink: consoleErrors });
    const nextSession = await firstRunState(page);
    record('the next fresh session does NOT get it again',
      fresh.classVisible && !nextSession.classVisible && !nextSession.hintVisible,
      `present=${nextSession.present} durable=${nextSession.durable}`);

    await open(page, { clearAll: false, clearSession: true, query: '?welcome=1', errorSink: consoleErrors });
    record('?welcome=1 replays past the close', await cardUp(page));

    for (const variant of ['A', 'B']) {
      await open(page, { clearAll: false, clearSession: false, query: `?welcome=${variant.toLowerCase()}`, errorSink: consoleErrors });
      const forced = await firstRunState(page);
      record(`?welcome=${variant.toLowerCase()} replays variant ${variant}`,
        forced.classVisible && forced.variant === variant, `variant=${forced.variant}`);
    }
    await open(page, { clearAll: false, clearSession: false, query: '?welcome=C', errorSink: consoleErrors });
    const forcedC = await firstRunState(page);
    record('?welcome=C replays the bubble, never the card',
      forcedC.hintVisible && !forcedC.present && forcedC.variant === 'C',
      `hint=${forcedC.hintVisible} launcher=${forcedC.present}`);

    await open(page, { query: '?welcome=0', errorSink: consoleErrors });
    const zero = await firstRunState(page);
    record('?welcome=0 suppresses a fresh browser', fresh.classVisible && !zero.present && !zero.hintPresent,
      `launcher=${zero.present} hint=${zero.hintPresent}`);

    // Share links bypass entirely, forced variant or not.
    await open(page, { query: '?welcome=B', hash: '#lat=43.2951&lon=5.3744&alt=2500', errorSink: consoleErrors });
    const shared = await firstRunState(page);
    const shareState = await page.evaluate(() => !!window.__godsEyeView?.styleManager?.hasShareState);
    record('a share link bypasses every variant', fresh.classVisible && shareState && !shared.present && !shared.hintPresent,
      `hasShareState=${shareState} launcher=${shared.present} hint=${shared.hintPresent}`);
  });
}

/**
 * ESC arbitration — the defects that motivated the yield design, plus the yield
 * itself. Driven through the real body classes, because that is exactly what
 * Cockpit and the Scene director set.
 */
async function runArbitrationSection(page, { shots, consoleErrors }) {
  await section('esc-arbitration', async () => {
    // ── A Scene starts while the card is up ─────────────────────────────────
    await open(page, { query: '?welcome=1', errorSink: consoleErrors });
    const beforeScene = await firstRunState(page);
    record('the card is up before the scene starts', beforeScene.onScreen);

    await page.evaluate(() => document.body.classList.add('scene-playback-mode'));
    await sleep(300);
    const duringScene = await firstRunState(page);
    record(
      'a scene taking the screen makes the card YIELD, not just hide',
      beforeScene.onScreen && !duringScene.classVisible,
      `onScreen=${duringScene.onScreen} classVisible=${duringScene.classVisible}`,
    );
    record('a yield counts as a close: both keys',
      beforeScene.onScreen && duringScene.session === 'dismissed' && duringScene.durable === 'suppressed',
      `session=${duringScene.session} durable=${duringScene.durable}`);

    await page.keyboard.press('Escape');
    await sleep(300);
    const sceneStillOn = await page.evaluate(() => document.body.classList.contains('scene-playback-mode'));
    record('ESC during a scene never lands on the card', beforeScene.onScreen && sceneStillOn);
    await page.evaluate(() => document.body.classList.remove('scene-playback-mode'));
    await sleep(200);
    const afterScene = await firstRunState(page);
    record('a yielded card does not pop back when the scene ends',
      beforeScene.onScreen && !afterScene.classVisible, `classVisible=${afterScene.classVisible}`);

    // ── Cockpit engages while the card is up ────────────────────────────────
    await open(page, { query: '?welcome=1', errorSink: consoleErrors });
    const beforeCockpit = await firstRunState(page);
    record('the card is up before cockpit engages', beforeCockpit.onScreen);
    await page.evaluate(() => document.body.classList.add('cockpit-mode'));
    await sleep(300);
    const duringCockpit = await firstRunState(page);
    record('cockpit engaging makes the card YIELD before it can contest ESC',
      beforeCockpit.onScreen && !duringCockpit.classVisible, `classVisible=${duringCockpit.classVisible}`);
    await page.evaluate(() => document.body.classList.remove('cockpit-mode'));
    await sleep(200);

    // ── A surface that takes the screen with NO class ───────────────────────
    // The attribution lightbox is full-screen at z-index 200 against the card's
    // 175 and announces itself with nothing at all.
    const lightboxState = () => page.evaluate(() => {
      const overlay = document.querySelector('.cesium-credit-lightbox-overlay');
      return {
        shown: !!overlay && getComputedStyle(overlay).display !== 'none',
        z: overlay ? getComputedStyle(overlay).zIndex : null,
      };
    });
    await open(page, { query: '?welcome=1', errorSink: consoleErrors });
    const beforeLightbox = await firstRunState(page);
    record('the card is up before the attribution lightbox opens', beforeLightbox.onScreen);
    const linkClicked = await domClick(page, '#cesium-credits .cesium-credit-expand-link');
    await sleep(300);
    const lightboxUp = await lightboxState();
    record('the real "Data attribution" lightbox opens above the card',
      linkClicked && lightboxUp.shown && lightboxUp.z === '200',
      `link=${linkClicked} shown=${lightboxUp.shown} z-index=${lightboxUp.z} vs the card's 175`);
    const buried = await firstRunState(page);
    record('an unclassed overlay leaves the card MEASURABLE but no longer topmost',
      buried.onScreen && !buried.topmost, `onScreen=${buried.onScreen} topmost=${buried.topmost}`);
    await page.keyboard.press('Escape');
    await sleep(400);
    const escUnderLightbox = await firstRunState(page);
    record('ESC under the lightbox never lands on the buried card',
      beforeLightbox.onScreen && escUnderLightbox.classVisible, `classVisible=${escUnderLightbox.classVisible}`);
    record('that ESC writes neither key',
      beforeLightbox.onScreen && escUnderLightbox.session !== 'dismissed' && escUnderLightbox.durable !== 'suppressed',
      `session=${escUnderLightbox.session} durable=${escUnderLightbox.durable}`);
    record('the lightbox keeps its OWN ESC semantics (Cesium binds none, so it stays)',
      (await lightboxState()).shown);
    await domClick(page, '.cesium-credit-lightbox-close');
    await sleep(300);
    const uncovered = await firstRunState(page);
    record('closing the lightbox hands the card back the key', uncovered.topmost, `topmost=${uncovered.topmost}`);
    await page.keyboard.press('Escape');
    await sleep(600);
    const afterUncoveredEsc = await firstRunState(page);
    record('ESC dismisses normally again once nothing is on top',
      beforeLightbox.onScreen && !afterUncoveredEsc.classVisible && afterUncoveredEsc.session === 'dismissed',
      `classVisible=${afterUncoveredEsc.classVisible} session=${afterUncoveredEsc.session}`);

    // ── A control that claims only the KEY ──────────────────────────────────
    await open(page, { query: '?welcome=1', errorSink: consoleErrors });
    const beforeRadio = await firstRunState(page);
    record('the card is up before the radio disclosure opens', beforeRadio.onScreen);
    const radioOpened = await page.evaluate(() => {
      document.getElementById('context-radio-toggle-btn')?.click();
      return !!document.getElementById('context-radio-dock')?.classList.contains('disclosure-open');
    });
    await sleep(250);
    record('the compact Radio disclosure opens', radioOpened);
    const withRadio = await firstRunState(page);
    record('a small disclosure is a key contest, not a screen takeover — no yield',
      withRadio.classVisible && withRadio.topmost, `classVisible=${withRadio.classVisible} topmost=${withRadio.topmost}`);
    await page.keyboard.press('Escape');
    await sleep(400);
    const radioAfterEsc = await page.evaluate(() => (
      !!document.getElementById('context-radio-dock')?.classList.contains('disclosure-open')
    ));
    const cardAfterRadioEsc = await firstRunState(page);
    record('ESC closes the disclosure', radioOpened && !radioAfterEsc, `disclosure still open=${radioAfterEsc}`);
    record('that SAME ESC does not also dismiss the card',
      beforeRadio.onScreen && cardAfterRadioEsc.classVisible && cardAfterRadioEsc.session !== 'dismissed',
      `classVisible=${cardAfterRadioEsc.classVisible} session=${cardAfterRadioEsc.session}`);
    await page.keyboard.press('Escape');
    await sleep(600);
    const nextEsc = await firstRunState(page);
    record('the next ESC belongs to the card again',
      beforeRadio.onScreen && !nextEsc.classVisible && nextEsc.session === 'dismissed',
      `classVisible=${nextEsc.classVisible} session=${nextEsc.session}`);

    // ── Deferred reveal: a surface already up when the card would show ──────
    // The reveal now waits for the boot flight, so a fixed hold would assert in
    // the void. Re-assert the class until init has actually run, then a beat.
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.goto(`${APP_URL}/?welcome=1`, { waitUntil: 'domcontentloaded' });
    const holdStarted = Date.now();
    let initializedAt = null;
    while (Date.now() - holdStarted < 20000) {
      const initialized = await page.evaluate((sel) => {
        document.body?.classList.add('cockpit-mode');
        return document.querySelector(sel)?.dataset.initialized === 'true';
      }, LAUNCHER).catch(() => false);
      if (initialized && initializedAt === null) initializedAt = Date.now();
      if (initializedAt !== null && Date.now() - initializedAt > 500) break;
      await sleep(200);
    }
    const withCockpitUp = await firstRunState(page);
    const classHeld = await page.evaluate(() => document.body.classList.contains('cockpit-mode'));
    record('the card WAITS rather than appearing over a surface already up',
      initializedAt !== null && classHeld && withCockpitUp.present && !withCockpitUp.classVisible,
      `initialized=${initializedAt !== null} cockpitClassHeld=${classHeld} present=${withCockpitUp.present} classVisible=${withCockpitUp.classVisible}`);
    record('waiting writes neither key',
      withCockpitUp.present && withCockpitUp.session !== 'dismissed' && withCockpitUp.durable !== 'suppressed',
      `session=${withCockpitUp.session} durable=${withCockpitUp.durable}`);
    await page.evaluate(() => document.body.classList.remove('cockpit-mode'));
    const appeared = await waitFor(page, (sel) => !!document.querySelector(sel)?.classList.contains('visible'), LAUNCHER, { timeout: 3000 });
    record('the card appears once the surface clears', Boolean(appeared));
    if (appeared) shots.push(await shoot(page, 'arbitration-revealed-after-cockpit'));
  });
}

async function runVariantASections(browser, page, { shots, consoleErrors }) {
  await section('variant-A-address', async () => {
    await open(page, { query: '?welcome=A', errorSink: consoleErrors });
    const before = await appState(page);
    const up = await cardUp(page);
    record('variant A is up', up);
    const typed = await typeAndSubmit(page, '[data-first-run-address]', 'Tour Eiffel, Paris');
    const busy = await firstRunState(page);
    record('the card says what it is looking for', typed && /Recherche de « Tour Eiffel, Paris »/.test(busy.status),
      `status="${busy.status}"`);
    const submittedAt = Date.now();
    const left = await cardGone(page, 30000);
    const leftAfterMs = Date.now() - submittedAt;
    // The bundle is switched on at the LANDING, three seconds into the flight.
    // Still off when the card has already gone = the card left at the start.
    const atLeave = await appState(page);
    const earlyOn = FIRST_RUN_ADDRESS_BUNDLE.filter((id) => atLeave.layers[id]);
    record('the card leaves as the flight STARTS, not when it lands',
      up && left && earlyOn.length === 0,
      `left after ${leftAfterMs} ms (lookup included); bundle already on at that moment: ${earlyOn.join(', ') || 'none'}`);
    const missing = await layersOn(page, [...FIRST_RUN_ADDRESS_BUNDLE]);
    record('sales, permits and DPE are on once the camera lands', up && missing.length === 0,
      missing.length ? `still off: ${missing.join(', ')}` : FIRST_RUN_ADDRESS_BUNDLE.join(' · '));
    await settleLayers(page, [...FIRST_RUN_ADDRESS_BUNDLE]);
    const after = await appState(page);
    const blob = after.layerStateBlob || '';
    record('the bundle is remembered like a click on those rows',
      up && FIRST_RUN_ADDRESS_BUNDLE.every((id) => blob.includes(id)), `layer-state=${blob.slice(0, 120)}`);
    const km = distanceKm(after, EIFFEL);
    record('the camera landed on the Eiffel Tower', up && km < 2, `${km.toFixed(2)} km away, ${after.heightM} m up`);
    record('the choice leaves the detection override untouched',
      up && after.detectionOverridden === false, `_detectionUserOverridden=${after.detectionOverridden}`);
    record('the choice never writes the detection-allocation pref',
      up && after.allocation === before.allocation, `${before.allocation} → ${after.allocation}`);
    const keys = await firstRunState(page);
    record('the choice counts as a close: both keys',
      up && keys.durable === 'suppressed' && keys.session === 'dismissed',
      `durable=${keys.durable} session=${keys.session}`);
    record('no panel opened', up && after.contextPanelCollapsed === before.contextPanelCollapsed && after.contextMode === before.contextMode,
      `context panel collapsed ${before.contextPanelCollapsed} → ${after.contextPanelCollapsed}`);
    shots.push(await shoot(page, 'card-A-arrived-eiffel'));
  });

  await section('variant-A-chip', async () => {
    await open(page, { query: '?welcome=A', errorSink: consoleErrors });
    const up = await cardUp(page);
    await domClick(page, '[data-first-run-chip="Vieux-Port, Marseille"]');
    const field = await page.evaluate(() => document.querySelector('[data-first-run-address]')?.value || '');
    record('a chip fills the field with its place', up && field === 'Vieux-Port, Marseille', `field="${field}"`);
    const left = await cardGone(page, 30000);
    record('a chip searches like Enter does', up && left);
    const missing = await layersOn(page, [...FIRST_RUN_ADDRESS_BUNDLE]);
    const after = await appState(page);
    const km = distanceKm(after, VIEUX_PORT);
    record('the chip flew to Marseille and switched the bundle on there',
      up && missing.length === 0 && km < 5, `${km.toFixed(2)} km from the Vieux-Port; still off: ${missing.join(', ') || 'none'}`);
  });

  await section('variant-A-not-found', async () => {
    await open(page, { query: '?welcome=A', errorSink: consoleErrors });
    const up = await cardUp(page);
    const before = await appState(page);
    await typeAndSubmit(page, '[data-first-run-address]', 'zzqxv-nulle-part-9');
    const answered = await waitFor(page, (sel) => {
      const node = document.querySelector(sel);
      return node?.getAttribute('aria-busy') === 'false' && /Introuvable|échoué/.test(node.querySelector('[data-first-run-status]')?.textContent || '');
    }, LAUNCHER, { timeout: 30000 });
    const state = await firstRunState(page);
    record('an unknown place says so, in the card', up && Boolean(answered) && /Introuvable/.test(state.status),
      `status="${state.status}"`);
    record('the card stays open for another try', up && state.classVisible);
    const focus = await page.evaluate(() => {
      const field = document.activeElement;
      return {
        isField: field?.dataset?.firstRunAddress !== undefined,
        selected: field?.selectionStart === 0 && field?.selectionEnd === field?.value?.length && field.value.length > 0,
        readOnly: !!field?.readOnly,
      };
    });
    record('the field is focused and selected, and editable again',
      up && focus.isField && focus.selected && !focus.readOnly, JSON.stringify(focus));
    const after = await appState(page);
    const lit = FIRST_RUN_ADDRESS_BUNDLE.filter((id) => after.layers[id] && !before.layers[id]);
    record('nothing was switched on', up && lit.length === 0, lit.join(', ') || 'none');
    record('no key was written', up && state.durable === null && state.session === null,
      `durable=${state.durable} session=${state.session}`);
    shots.push(await shoot(page, 'card-A-not-found'));
  });

  await section('variant-A-look-around', async () => {
    await open(page, { query: '?welcome=A', errorSink: consoleErrors });
    const up = await cardUp(page);
    const before = await appState(page);
    await domClick(page, '[data-first-run-look-around]');
    const left = await cardGone(page, 5000);
    await sleep(800);
    const after = await appState(page);
    record('"Regarder autour d’ici" closes the card', up && left);
    const lit = enabledList(after).filter((id) => !before.layers[id]);
    record('it switches nothing on (traffic was already on)',
      up && lit.length === 0 && after.layers.traffic === before.layers.traffic, `on: ${enabledList(after).join(', ') || 'none'}`);
    record('it never moves the camera', up && after.heightM === before.heightM,
      `${before.heightM} → ${after.heightM} m`);
    const keys = await firstRunState(page);
    record('it counts as a close: both keys', up && keys.durable === 'suppressed' && keys.session === 'dismissed');
  });

  await section('variant-A-locate', async () => {
    const geoPage = await launcherPage(browser, { consoleErrors, geolocation: VIEUX_PORT });
    try {
      await open(geoPage, { query: '?welcome=A', errorSink: consoleErrors });
      const up = await cardUp(geoPage);
      const offered = await geoPage.evaluate(() => {
        const chip = document.querySelector('[data-first-run-chip="locate"]');
        return !!chip && !chip.hidden && chip.getClientRects().length > 0;
      });
      record('"Autour de moi" is offered where geolocation works', up && offered);
      await domClick(geoPage, '[data-first-run-chip="locate"]');
      const left = await cardGone(geoPage, 15000);
      record('"Autour de moi" closes the card as the flight starts', up && left);
      const missing = await layersOn(geoPage, [...FIRST_RUN_ADDRESS_BUNDLE]);
      const after = await appState(geoPage);
      const km = distanceKm(after, VIEUX_PORT);
      record('it flies to the fix and switches the bundle on there',
        up && missing.length === 0 && km < 3, `${km.toFixed(2)} km from the fix; still off: ${missing.join(', ') || 'none'}`);
    } finally {
      await geoPage.close().catch(() => {});
    }
  });
}

async function runVariantBSections(browser, page, { shots, consoleErrors }) {
  await section('variant-B-tiles', async () => {
    const tiles = FIRST_RUN_VARIANTS.B.tiles;
    for (const choice of Object.keys(tiles)) {
      await open(page, { query: '?welcome=B', errorSink: consoleErrors });
      const up = await cardUp(page);
      if (choice === 'sales') {
        const order = await page.$$eval('[data-first-run-choice]', (nodes) => nodes.map((node) => node.dataset.firstRunChoice));
        record('four tiles, in order', up && order.join() === 'sales,permits,live,explore', order.join(' · '));
        const focused = await page.evaluate(() => document.activeElement?.dataset?.firstRunChoice ?? null);
        record('focus lands on the first tile', up && focused === 'sales', `activeElement=${focused}`);
        shots.push(await shoot(page, 'card-B-desktop'));
      }
      const before = await appState(page);
      await domClick(page, `[data-first-run-choice="${choice}"]`);
      const left = await cardGone(page, 30000);
      const expected = [...tiles[choice].layerIds];
      const missing = expected.length ? await layersOn(page, expected) : [];
      await sleep(expected.length ? 800 : 1200);
      const after = await appState(page);
      const lit = enabledList(after).filter((id) => !before.layers[id]);
      const unexpected = lit.filter((id) => !expected.includes(id));
      record(`${choice}: the card closes and exactly its layers come on`,
        up && left && missing.length === 0 && unexpected.length === 0,
        `on: ${expected.join(', ') || 'nothing'}${missing.length ? `; missing ${missing.join(', ')}` : ''}${unexpected.length ? `; unexpected ${unexpected.join(', ')}` : ''}`);
      const drift = before.heightM && after.heightM ? Math.abs(after.heightM - before.heightM) : Infinity;
      record(`${choice}: the camera stays where it was`,
        up && drift <= Math.max(5, before.heightM * 0.02) && after.heightM < 12_000_000,
        `${before.heightM} → ${after.heightM} m`);
      record(`${choice}: no panel, no context mode`,
        up && after.contextPanelCollapsed === before.contextPanelCollapsed && after.contextMode === before.contextMode,
        `panel collapsed ${before.contextPanelCollapsed} → ${after.contextPanelCollapsed}; mode ${before.contextMode} → ${after.contextMode}`);
    }
  });

  await section('variant-B-phone', async () => {
    const phonePage = await launcherPage(browser, { consoleErrors, phone: true });
    try {
      await open(phonePage, { query: '?welcome=B', phone: true, errorSink: consoleErrors });
      const shell = await phonePage.evaluate(() => document.documentElement.dataset.shell || null);
      record('the phone shell is on', shell === 'phone', `data-shell=${shell}`);
      const up = await cardUp(phonePage);
      const subcopy = await phonePage.evaluate(() => (
        document.querySelector('[data-first-run-choice="sales"] small')?.textContent || ''
      ));
      record('the sales tile stops promising the parcel', up && subcopy === 'Ventes DVF, 5 ans', `"${subcopy}"`);
      const sheetHidden = await phonePage.evaluate(() => {
        const sheet = document.getElementById('phone-sheet');
        return sheet ? getComputedStyle(sheet).visibility : null;
      });
      record('the card is a sheet that hides the phone sheet behind it', up && sheetHidden === 'hidden', `visibility=${sheetHidden}`);
      shots.push(await shoot(phonePage, 'card-B-phone'));
      await domClick(phonePage, '[data-first-run-choice="sales"]');
      await cardGone(phonePage, 30000);
      const missing = await layersOn(phonePage, ['dvf-sales']);
      await sleep(800);
      const after = await appState(phonePage);
      record('sales comes on without the heavy parcel layer',
        up && missing.length === 0 && !after.layers['cadastre-fr'],
        `dvf-sales=${after.layers['dvf-sales']} cadastre-fr=${after.layers['cadastre-fr']}`);
    } finally {
      await phonePage.close().catch(() => {});
    }
  });
}

/** The bubble's box against its anchor's. */
const hintGeometry = (page, anchorSelector) => page.evaluate((sel) => {
  const hint = document.querySelector(sel.hint);
  const anchor = document.querySelector(sel.anchor);
  if (!hint || !anchor) return null;
  const h = hint.getBoundingClientRect();
  const a = anchor.getBoundingClientRect();
  const styles = getComputedStyle(hint);
  const caret = Number.parseFloat(hint.style.getPropertyValue('--first-run-hint-caret')) || 0;
  return {
    hintTop: Math.round(h.top),
    hintBottom: Math.round(h.bottom),
    hintLeft: Math.round(h.left),
    hintRight: Math.round(h.right),
    anchorTop: Math.round(a.top),
    anchorBottom: Math.round(a.bottom),
    anchorCentre: Math.round(a.left + a.width / 2),
    caretX: Math.round(h.left + h.width / 2 + caret),
    vw: window.innerWidth,
    opacity: Number.parseFloat(styles.opacity),
  };
}, { hint: HINT, anchor: anchorSelector });

async function runVariantCSections(browser, page, { shots, consoleErrors }) {
  await section('variant-C', async () => {
    await open(page, { query: '?welcome=C', errorSink: consoleErrors });
    const state = await firstRunState(page);
    record('C shows the bubble and no card', state.hintVisible && !state.present,
      `hint=${state.hintVisible} launcher=${state.present}`);
    await sleep(400);
    const geometry = await hintGeometry(page, '#location-bar .location-toolbar-label');
    record('the bubble sits above LOCATION, inside the viewport',
      !!geometry && state.hintVisible && geometry.hintBottom <= geometry.anchorTop + 1
        && geometry.hintLeft >= 0 && geometry.hintRight <= geometry.vw,
      geometry ? JSON.stringify(geometry) : 'absent');
    record('its caret points at LOCATION',
      !!geometry && state.hintVisible && Math.abs(geometry.caretX - geometry.anchorCentre) <= 3,
      geometry ? `caret ${geometry.caretX} vs label ${geometry.anchorCentre}` : 'absent');
    shots.push(await shoot(page, 'hint-C-desktop'));

    // A click on the globe is a click away.
    await page.evaluate(() => {
      const canvas = window.__godsEyeView?.viewer?.canvas || document.querySelector('canvas');
      canvas?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }));
    });
    await sleep(400);
    const away = await firstRunState(page);
    record('a click on the globe closes it, and writes both keys',
      state.hintVisible && !away.hintPresent && away.durable === 'suppressed' && away.session === 'dismissed',
      `hint=${away.hintPresent} durable=${away.durable} session=${away.session}`);

    await open(page, { clearAll: false, clearSession: false, errorSink: consoleErrors });
    const reload = await firstRunState(page);
    record('after a close, a reload shows neither card nor bubble',
      state.hintVisible && !reload.hintPresent && !reload.present);

    await open(page, { query: '?welcome=C', errorSink: consoleErrors });
    const again = await firstRunState(page);
    await domClick(page, '[data-first-run-hint-open]');
    await sleep(500);
    const opened = await page.evaluate(() => ({
      trayOpen: !document.getElementById('location-bar')?.classList.contains('collapsed'),
      focused: document.activeElement?.id || null,
      hint: !!document.getElementById('first-run-hint'),
    }));
    record('a click on the bubble opens LOCATION with the caret in the search field',
      again.hintVisible && opened.trayOpen && opened.focused === 'location-search',
      JSON.stringify(opened));
    shots.push(await shoot(page, 'hint-C-opened-search'));

    await open(page, { query: '?welcome=C', errorSink: consoleErrors });
    const third = await firstRunState(page);
    await sleep(13000);
    const timedOut = await firstRunState(page);
    record('twelve seconds of nothing close it',
      third.hintVisible && !timedOut.hintPresent && timedOut.durable === 'suppressed',
      `hint=${timedOut.hintPresent} durable=${timedOut.durable}`);

    await open(page, { query: '?welcome=C', errorSink: consoleErrors });
    const trayCase = await firstRunState(page);
    // Hovering LOCATION opens its popover exactly where the bubble sits.
    await page.evaluate(() => window.__godsEyeView?.styleManager?.setPanelCollapsed?.('location-bar', false));
    await sleep(300);
    const trayOpened = await firstRunState(page);
    record('the LOCATION tray opening in its place closes it',
      trayCase.hintVisible && !trayOpened.hintPresent, `hint=${trayOpened.hintPresent}`);

    await open(page, { query: '?welcome=C', errorSink: consoleErrors });
    const fourth = await firstRunState(page);
    await page.evaluate(() => document.body.classList.add('ui-clean-view'));
    await sleep(300);
    const yielded = await firstRunState(page);
    await page.evaluate(() => document.body.classList.remove('ui-clean-view'));
    record('clean view closes it', fourth.hintVisible && !yielded.hintPresent, `hint=${yielded.hintPresent}`);
  });

  await section('variant-C-phone', async () => {
    const phonePage = await launcherPage(browser, { consoleErrors, phone: true });
    try {
      await open(phonePage, { query: '?welcome=C', phone: true, errorSink: consoleErrors });
      const state = await firstRunState(phonePage);
      record('the phone gets the bubble and no card', state.hintVisible && !state.present);
      await sleep(400);
      const geometry = await hintGeometry(phonePage, '#phone-search');
      record('the bubble hangs under the search bar',
        !!geometry && state.hintVisible && geometry.hintTop >= geometry.anchorBottom - 1
          && geometry.hintLeft >= 0 && geometry.hintRight <= geometry.vw
          && Math.abs(geometry.caretX - geometry.anchorCentre) <= 3,
        geometry ? JSON.stringify(geometry) : 'absent');
      const sheet = await phonePage.evaluate(() => {
        const node = document.getElementById('phone-sheet');
        return node ? getComputedStyle(node).visibility : null;
      });
      record('the sheet it points at stays visible', state.hintVisible && sheet === 'visible', `visibility=${sheet}`);
      shots.push(await shoot(phonePage, 'hint-C-phone'));
      await domClick(phonePage, '[data-first-run-hint-open]');
      await sleep(600);
      const opened = await phonePage.evaluate(() => ({
        panelShown: document.getElementById('phone-panel-search')?.hidden === false,
        snap: window.__godsEyeView?.phoneSheet?.getSnap?.() ?? null,
        focused: document.activeElement?.id || null,
      }));
      record('a tap opens the search panel, above peek, with the field focused',
        state.hintVisible && opened.panelShown && opened.snap && opened.snap !== 'peek' && opened.focused === 'location-search',
        JSON.stringify(opened));
    } finally {
      await phonePage.close().catch(() => {});
    }
  });
}

async function runViewportsSection(page, { shots, consoleErrors }) {
  await section('viewports', async () => {
    // Portrait phone, LANDSCAPE phone (the short viewport that clipped the card
    // at both ends before it grew a max-height), and a small desktop window.
    const VIEWPORTS = [
      { name: 'mobile-375', width: 375, height: 812, dpr: 2, label: '375 x 812 portrait window' },
      { name: 'landscape-667', width: 667, height: 390, dpr: 2, label: '667 x 390 landscape window' },
      { name: 'desktop-800', width: 800, height: 600, dpr: 1, label: '800 x 600 small desktop' },
    ];
    for (const variant of ['A', 'B']) {
      for (const vp of VIEWPORTS) {
        await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: vp.dpr });
        await open(page, { query: `?welcome=${variant}`, errorSink: consoleErrors });
        const box = await page.evaluate((sel) => {
          const node = document.querySelector(sel);
          if (!node) return null;
          const rect = node.getBoundingClientRect();
          const list = node.querySelector('.first-run-choices');
          const onScreen = (element) => {
            const r = element?.getBoundingClientRect();
            return !!r && r.height > 0 && r.top >= 0 && r.bottom <= window.innerHeight;
          };
          return {
            top: Math.round(rect.top), bottom: Math.round(rect.bottom),
            left: Math.round(rect.left), right: Math.round(rect.right),
            vw: window.innerWidth, vh: window.innerHeight,
            listScrolls: !!list && list.scrollHeight > list.clientHeight + 1,
            statusOnScreen: onScreen(node.querySelector('[data-first-run-status]')),
            fieldOnScreen: onScreen(node.querySelector('[data-first-run-address]')),
            submitOnScreen: onScreen(node.querySelector('[data-first-run-submit]')),
          };
        }, LAUNCHER);
        const fits = !!box && box.top >= 0 && box.bottom <= box.vh && box.left >= 0 && box.right <= box.vw;
        record(`${variant}: the card fits a ${vp.label} with no clipping`, fits,
          box ? `${box.left},${box.top} → ${box.right},${box.bottom} in ${box.vw}x${box.vh}${box.listScrolls ? ' (list scrolls)' : ''}` : 'absent');
        record(`${variant}: the status line stays on screen at ${vp.width}x${vp.height}`, !!box?.statusOnScreen);
        if (variant === 'A') {
          record(`A: the field and VOIR are on screen at ${vp.width}x${vp.height}`,
            !!box?.fieldOnScreen && !!box?.submitOnScreen);
        }

        if (variant === 'B') {
          // Discoverability: if the list scrolls, the LAST tile must still peek
          // above the fold, or the list reads as complete.
          const peek = await page.evaluate((sel) => {
            const list = document.querySelector(sel)?.querySelector('.first-run-choices');
            if (!list) return null;
            list.scrollTop = 0;
            const tiles = [...list.querySelectorAll('[data-first-run-choice]')];
            const last = tiles[tiles.length - 1];
            if (!last) return null;
            const listBox = list.getBoundingClientRect();
            const lastBox = last.getBoundingClientRect();
            const visible = Math.max(0, Math.min(listBox.bottom, lastBox.bottom) - Math.max(listBox.top, lastBox.top));
            return {
              scrolls: list.scrollHeight > list.clientHeight + 1,
              fraction: lastBox.height ? visible / lastBox.height : 0,
              label: last.dataset.firstRunChoice,
            };
          }, LAUNCHER);
          record(`B: the last tile is discoverable at ${vp.width}x${vp.height}`,
            !!peek && (!peek.scrolls || peek.fraction >= 0.25),
            peek ? `${peek.label} ${(peek.fraction * 100).toFixed(0)}% visible${peek.scrolls ? ' (list scrolls)' : ' (no scroll needed)'}` : 'absent');
        }

        // Every control must be keyboard-reachable, and reaching one must
        // bring it into view. focus() scrolls synchronously and the rects force
        // layout, so no frame wait is needed (or safe) here.
        const reach = await page.evaluate((sel) => {
          const node = document.querySelector(sel);
          if (!node) return null;
          const targets = [...node.querySelectorAll('input, button')]
            .filter((target) => target.getClientRects().length > 0);
          const unreachable = [];
          for (const target of targets) {
            target.focus();
            const rect = target.getBoundingClientRect();
            const host = node.getBoundingClientRect();
            if (document.activeElement !== target || rect.bottom <= host.top || rect.top >= host.bottom) {
              unreachable.push(target.dataset.firstRunChoice || target.dataset.firstRunChip || target.className);
            }
          }
          return { count: targets.length, unreachable };
        }, LAUNCHER);
        // Derived per variant, never a magic number: A is the field, VOIR, the
        // shown chips and the link; B is the four tiles.
        const expectedFocusable = await page.evaluate((sel, v) => {
          const node = document.querySelector(sel);
          if (!node) return -1;
          const selector = v === 'A'
            ? '[data-first-run-address], [data-first-run-submit], [data-first-run-chip]:not([hidden]), [data-first-run-look-around]'
            : '[data-first-run-choice]';
          return node.querySelectorAll(selector).length;
        }, LAUNCHER, variant);
        record(`${variant}: every control is keyboard-reachable at ${vp.width}x${vp.height}`,
          !!reach && reach.count === expectedFocusable && reach.unreachable.length === 0,
          reach ? `${reach.count}/${expectedFocusable} focusable${reach.unreachable.length ? `, unreachable: ${reach.unreachable.join(', ')}` : ''}` : 'absent');
        await page.evaluate((sel) => {
          const list = document.querySelector(sel)?.querySelector('.first-run-choices');
          if (list) list.scrollTop = 0;
          document.activeElement?.blur?.();
        }, LAUNCHER);
        await sleep(250);
        shots.push(await shoot(page, `card-${variant}-${vp.name}`));
      }
    }
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  });
}

async function main() {
  console.log('\nFirst-Run Experience QA');
  console.log(`  App URL : ${APP_URL}`);
  console.log(`  Mode    : ${TEETH ? 'TEETH (card, bubble and templates removed — expect RED)' : 'normal'}${ONLY.size ? ` · only ${[...ONLY].join(', ')}` : ''}\n`);

  try {
    const response = await fetch(`${APP_URL}/`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    console.error(`Dev server not reachable at ${APP_URL}: ${error.message}`);
    process.exit(2);
  }

  if (SHOTS) fs.mkdirSync(SHOT_DIR, { recursive: true });
  const executablePath = CHROME_CANDIDATES.find((candidate) => {
    try { return fs.existsSync(candidate); } catch { return false; }
  });
  const browser = await puppeteer.launch({
    headless: HEADFUL ? false : 'new',
    protocolTimeout: 120000,
    ...(executablePath ? { executablePath } : {}),
    args: [
      '--no-sandbox', '--disable-setuid-sandbox',
      '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist',
      '--disable-dev-shm-usage', '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
      '--window-size=1440,900',
    ],
  });

  const shots = [];
  const consoleErrors = [];
  const context = { shots, consoleErrors };
  try {
    const page = await launcherPage(browser, { consoleErrors });
    await runShowPolicySection(page, context);
    await runArbitrationSection(page, context);
    await runVariantASections(browser, page, context);
    await runVariantBSections(browser, page, context);
    await runVariantCSections(browser, page, context);
    await runViewportsSection(page, context);
    await section('console', async () => {
      record('no console errors across the whole run', consoleErrors.length === 0,
        consoleErrors.slice(0, 3).join(' | ') || 'clean');
    });
  } finally {
    await browser.close();
  }

  const failed = results.filter((entry) => !entry.ok);
  const sections = [...new Set(results.map((entry) => entry.section))];
  const tally = sections.map((name) => {
    const rows = results.filter((entry) => entry.section === name);
    return { name, total: rows.length, red: rows.filter((entry) => !entry.ok).length };
  });

  const written = shots.filter(Boolean);
  if (written.length) console.log(`\n  Screenshots: ${written.join(', ')}`);
  console.log(`\n  ${results.length - failed.length}/${results.length} checks passed\n`);
  if (failed.length) {
    for (const row of tally.filter((entry) => entry.red)) console.log(`    ${row.name}: ${row.red}/${row.total} red`);
    console.log('');
  }

  if (!TEETH) process.exit(failed.length === 0 ? 0 : 1);

  /*
   * NEGATIVE CONTROL VERDICT.
   *
   *   (a) the harness must REPORT FAILURE under the stub — a run with the card
   *       removed is a failing run, and it exits non-zero like one;
   *   (b) EVERY section must produce at least one red — a section that stays
   *       fully green without the card is not testing the card.
   *
   * Because (a) means the process always exits non-zero here, the control's own
   * verdict is carried in the exit CODE: 1 = healthy, 2 = the control is broken.
   */
  console.log('  TEETH — per-section reachability (each section must go red):');
  for (const row of tally) {
    const hygiene = HYGIENE_SECTIONS.includes(row.name);
    const tag = hygiene ? '\x1b[2mHYGN\x1b[0m' : (row.red > 0 ? '\x1b[32mRED \x1b[0m' : '\x1b[31mNONE\x1b[0m');
    console.log(`    [${tag}] ${row.name}: ${row.red}/${row.total} red`);
  }
  const toothless = tally.filter((row) => row.red === 0 && !HYGIENE_SECTIONS.includes(row.name));
  const expected = ONLY.size ? EXPECTED_SECTIONS.filter((name) => ONLY.has(name)) : EXPECTED_SECTIONS;
  const unreached = expected.filter((name) => !sections.includes(name));
  const healthy = failed.length > 0 && toothless.length === 0 && unreached.length === 0;
  if (unreached.length) console.log(`\n  UNREACHED sections: ${unreached.join(', ')}`);
  if (toothless.length) console.log(`  TOOTHLESS sections: ${toothless.map((row) => row.name).join(', ')}`);
  console.log(healthy
    ? `\n  TEETH HEALTHY: harness failed as required (${failed.length} red) and every one of ${tally.length} sections went red. Exit 1 by design.\n`
    : '\n  TEETH BROKEN: the control did not collapse the way it claims to. Exit 2.\n');
  process.exit(healthy ? 1 : 2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
