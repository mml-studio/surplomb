#!/usr/bin/env node
/**
 * qa:phone-shell — the phone shell's layout, on two handsets and one desktop.
 *
 * WHAT THIS IS FOR. `qa:phone-boot` asks whether the app RECOGNISES a phone and
 * what that recognition buys. This one asks what the recognition LOOKS like:
 * whether the page fits its own screen, whether a finger can hit what is drawn,
 * whether the required attribution is visible at all three sheet heights,
 * whether the one control still floating over the map stays on screen in each
 * of its four states, and whether the desktop this shell was carved out of is
 * exactly where it was.
 *
 * WHY THE DESKTOP CONTROL IS IN THE SAME RUN (check 8). Every rule in
 * `phone.css` is guarded by `html[data-shell="phone"]`, and a guard is a claim
 * that nothing else moved. A claim nobody measures is a hope: one `#phone-sheet`
 * added to an occluder list, one wrapper around three chips, and the desktop
 * rail is 40 px narrower with nobody looking. The reference rectangles are in
 * `scripts/fixtures/desktop-layout-reference.json`, taken on the commit BEFORE
 * the shell existed, and regenerated only on purpose (`--write-reference`).
 *
 * WHAT THIS RUN COSTS. Nothing. The page opens with photoreal shut (the
 * `newQaPage` default), so no ion root tile is bought.
 *
 * Run:  npm run build && npm run preview
 *       node scripts/qa-phone-shell.mjs --url http://localhost:4173
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { newPhoneQaPage, newQaPage, phoneUrl } from './lib/qa-first-run.mjs';
// Imported from the app rather than restated: a harness with its own copy of a
// product list is a harness that passes after the list changes.
import {
  PHONE_FEATURED_LAYER_IDS as FEATURED_IDS,
  PHONE_HEAVY_LAYER_IDS as HEAVY_IDS,
} from '../src/phoneSheetLayout.js';

const argv = process.argv.slice(2);
const getOpt = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const APP_URL = getOpt('--url', process.env.QA_BASE_URL || 'http://localhost:4173').replace(/\/$/, '');
const WRITE_REFERENCE = argv.includes('--write-reference');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOT_DIR = path.join(ROOT, 'qa-shots', 'phone-shell');
// TRACKED, unlike `qa-shots/` which is gitignored: a regression baseline nobody
// else can check out is a baseline of one machine.
const REFERENCE_FILE = path.join(ROOT, 'scripts', 'fixtures', 'desktop-layout-reference.json');

/** The guideline floor for a touch target. */
const TOUCH_TARGET_PX = 44;
/** The floor a target may drop to when it has clear air around it instead. */
const TOUCH_TARGET_CROWDED_PX = 40;
/** How much clear air earns that exemption. */
const TOUCH_NEIGHBOUR_GAP_PX = 8;
/**
 * The fewest controls each tab is still itself with.
 *
 * A count and not a boolean, because "not empty" is too weak: Recherche with
 * its city pills gone but the field intact would pass a presence test while
 * having lost most of what it is. The numbers are floors with room under the
 * shipped counts (10, 49, 2), not snapshots — a tab that GAINS a control must
 * not fail a harness.
 *
 * Légende is zero on purpose: a key is content, and with no layer lit it is an
 * empty state with nothing to press. Its height still has to be non-zero.
 */
const TAB_CONTROL_FLOORS = Object.freeze({
  search: 5, layers: 10, legend: 0, selection: 2,
});

/** The band at the top of the screen where fixed chrome used to collide. */
const TOP_BAND_PX = 120;
/** How far a desktop rectangle may move before it is a regression. */
const DESKTOP_DRIFT_PX = 1;

/** The second handset: the narrowest body still worth supporting. */
const ANDROID = {
  name: 'android360',
  viewport: { width: 360, height: 780, deviceScaleFactor: 3, isMobile: true, hasTouch: true, isLandscape: false },
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
};

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass });
  const mark = pass ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  console.log(`  [${mark}] ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Shots are evidence, not a check. Cesium under headless ANGLE stalls
 * `captureScreenshot` past the protocol timeout often enough that losing one
 * must not cost the run the assertions that already passed.
 */
async function shoot(page, name) {
  try {
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(SHOT_DIR, name) });
  } catch (error) {
    console.log(`  [\x1b[33mSKIP\x1b[0m] shot ${name} — ${String(error.message).slice(0, 70)}`);
  }
}

/**
 * Wait out the boot veil.
 *
 * `#loading-screen` is a full-screen fixed element that fades over 800 ms and
 * only then computes `visibility: hidden` — a `visibility` transition holds the
 * old computed value for its whole duration. Every geometry reader below would
 * otherwise find it overlapping the title bar, sitting under
 * `elementFromPoint` at the centre of the credit line, and generally being the
 * answer to every question this harness asks.
 *
 * @param {import('puppeteer').Page} page
 * @returns {Promise<void>}
 */
async function waitForBootVeil(page) {
  await page.waitForFunction(() => {
    const el = document.getElementById('loading-screen');
    if (!el) return true;
    const style = getComputedStyle(el);
    return style.visibility === 'hidden' || style.display === 'none'
      || Number.parseFloat(style.opacity || '1') < 0.05;
  }, { timeout: 30_000 });
}

/** One frame, so a layout written in a rAF callback has landed. */
async function settle(page) {
  await page.evaluate(() => new Promise((resolve) => {
    window.__godsEyeView?.viewer?.scene?.requestRender?.();
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

// ── The page-side readers. Kept as strings of one function each so the failure
// message can name the offender rather than a boolean. ──────────────────────

const readOverflow = () => {
  const spillers = [];
  for (const el of document.body.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') continue;
    if (r.right <= window.innerWidth + 1) continue;
    spillers.push(`${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''} right=${Math.round(r.right)}`);
    if (spillers.length >= 10) break;
  }
  return { scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth, spillers };
};

const readTargets = ({ floor, crowdedFloor, gap }) => {
  const label = (el) => {
    const cls = typeof el.className === 'string' && el.className.trim()
      ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '';
    return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${cls}`;
  };
  const boxes = [];
  for (const el of document.querySelectorAll('button, [role=button], a[href], input, select, textarea')) {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') continue;
    if (r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) continue;
    boxes.push({ el, r });
  }
  // THE ONE EXEMPTION, and it is not ours to take. The attribution links are
  // Cesium's own markup, their size is set by `widgets.css`, and Google's and
  // Cesium's terms require the notice to be SHOWN as given. Enlarging them
  // would be editing a legal notice for ergonomics; they stay, and they are
  // counted as content rather than as controls.
  const exempt = (el) => !!el.closest('#cesium-credits, .cesium-credit-lightbox');
  const offenders = [];
  for (const { el, r } of boxes) {
    if (exempt(el)) continue;
    const smallest = Math.min(r.width, r.height);
    if (smallest >= floor) continue;
    // A 40 px control is findable when nothing else is within a finger's
    // width of it — which is the case that matters for the layer toggles
    // (64 x 40 with 12 px of row around them). Under 40 there is no exemption.
    let nearest = Infinity;
    for (const other of boxes) {
      if (other.el === el || other.el.contains(el) || el.contains(other.el)) continue;
      const dx = Math.max(0, Math.max(r.left - other.r.right, other.r.left - r.right));
      const dy = Math.max(0, Math.max(r.top - other.r.bottom, other.r.top - r.bottom));
      nearest = Math.min(nearest, Math.hypot(dx, dy));
    }
    if (smallest >= crowdedFloor && nearest >= gap) continue;
    offenders.push({
      sel: label(el),
      w: Math.round(r.width),
      h: Math.round(r.height),
      gap: Number.isFinite(nearest) ? Math.round(nearest) : null,
    });
  }
  return offenders.sort((a, b) => Math.min(a.w, a.h) - Math.min(b.w, b.h)).slice(0, 12);
};

const readTopBandCollisions = (band) => {
  const nodes = [];
  for (const el of document.body.querySelectorAll('*')) {
    const style = getComputedStyle(el);
    if (style.position !== 'fixed') continue;
    if (style.visibility === 'hidden' || style.display === 'none') continue;
    if (Number.parseFloat(style.opacity || '1') < 0.05) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0 || r.top > band) continue;
    nodes.push({ el, r, id: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}` });
  }
  const hits = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const overlapX = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const overlapY = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (overlapX > 1 && overlapY > 1) hits.push(`${a.id} × ${b.id}`);
    }
  }
  return { fixedInBand: nodes.map((n) => n.id), hits };
};

const readCredits = () => {
  const el = document.getElementById('cesium-credits');
  if (!el) return { present: false };
  const r = el.getBoundingClientRect();
  const inside = r.width > 0 && r.height > 0
    && r.top >= 0 && r.bottom <= window.innerHeight + 1
    && r.left >= 0 && r.right <= window.innerWidth + 1;
  const hit = document.elementFromPoint(
    Math.min(window.innerWidth - 1, Math.max(0, r.left + r.width / 2)),
    Math.min(window.innerHeight - 1, Math.max(0, r.top + r.height / 2)),
  );
  return {
    present: true,
    inside,
    onTop: !!hit && (hit === el || el.contains(hit) || hit.contains(el)),
    rect: { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) },
    hit: hit ? `${hit.tagName.toLowerCase()}${hit.id ? `#${hit.id}` : ''}` : null,
  };
};

/**
 * The four states the voice module can be left in, forced from the attribute
 * the app itself writes.
 *
 * No session is opened and none is needed: every failure this check exists for
 * is a LAYOUT failure, and the layout is driven entirely by `data-status` and
 * `data-help`. Opening a real session would cost an API key, a microphone
 * permission no headless browser grants, and a minute a harness does not have.
 */
const VOICE_STATES = [
  { name: 'idle', status: 'idle' },
  { name: 'help-open', status: 'idle', help: true },
  { name: 'listening', status: 'listening', transcript: true },
  { name: 'error', status: 'error' },
];

const setVoiceState = ({ status, help = false, transcript = false }) => {
  const root = document.getElementById('gev-voice-control');
  if (!root) return false;
  root.dataset.status = status;
  if (help) root.dataset.help = 'open';
  else delete root.dataset.help;
  root.classList.remove('error-dismissed');
  const tray = root.querySelector('.gev-voice-transcript');
  if (tray) {
    tray.hidden = !transcript;
    const line = tray.querySelector('.gev-voice-transcript-text');
    if (transcript && line) line.textContent = 'allume le trafic routier et montre-moi les capteurs de qualité de l’air';
  }
  return true;
};

/**
 * Three questions about the voice module, asked of every visible part of it.
 *
 * WHY EACH ONE IS HERE, and none of them is hypothetical:
 *
 *   - `outsideOwnBox`: it shipped keeping the desktop dock's grid — a 40 px
 *     help button in a 12.8 px row — so the `?` and the status word were
 *     painted eight pixels ABOVE the panel they belong to, on top of whatever
 *     sat beside them.
 *   - `offScreen`: the help tray and the error tray hang off `left: 50%` with
 *     a −50 % translate, which centres them on a module that is flush against
 *     the right edge of the screen. Measured at 92 px and 99 px past the
 *     viewport, and the second of those took the DISMISS button with it.
 *   - `overSheet`: the module is positioned off `--phone-sheet-height`, so
 *     anything that grows upward is free and anything that grows DOWNWARD ends
 *     up behind the sheet.
 *
 * The three trays are exempt from `outsideOwnBox` by design: they are meant to
 * float clear of the module. They are not exempt from the other two.
 */
const readVoiceModule = () => {
  const root = document.getElementById('gev-voice-control');
  if (!root) return { present: false, offScreen: [], outsideOwnBox: [], overSheet: [] };
  const TRAYS = '.gev-voice-help-tray, .gev-voice-transcript, .gev-voice-error-tray';
  const box = root.getBoundingClientRect();
  const sheet = document.getElementById('phone-sheet')?.getBoundingClientRect() ?? null;
  const label = (el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${
    typeof el.className === 'string' && el.className.trim()
      ? `.${el.className.trim().split(/\s+/)[0]}` : ''}`;
  const offScreen = [];
  const outsideOwnBox = [];
  const overSheet = [];
  for (const el of [root, ...root.querySelectorAll('*')]) {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    if (Number.parseFloat(style.opacity || '1') < 0.05) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    if (r.left < -0.5 || r.right > window.innerWidth + 0.5
      || r.top < -0.5 || r.bottom > window.innerHeight + 0.5) {
      offScreen.push(`${label(el)} ${Math.round(r.left)}…${Math.round(r.right)}`);
    }
    if (el !== root && !el.closest(TRAYS)
      && (r.top < box.top - 1 || r.bottom > box.bottom + 1
        || r.left < box.left - 1 || r.right > box.right + 1)) {
      outsideOwnBox.push(label(el));
    }
    if (sheet
      && Math.min(r.bottom, sheet.bottom) - Math.max(r.top, sheet.top) > 1
      && Math.min(r.right, sheet.right) - Math.max(r.left, sheet.left) > 1) {
      overSheet.push(label(el));
    }
  }
  const unique = (list) => [...new Set(list)].slice(0, 6);
  return {
    present: true,
    offScreen: unique(offScreen),
    outsideOwnBox: unique(outsideOwnBox),
    overSheet: unique(overSheet),
  };
};

/**
 * What one tab holds, asked of the tab that is currently open.
 *
 * WHY A TAB CAN BE EMPTY AND NOBODY NOTICES. The four panels are ADOPTED from
 * the desktop, where each is a tray that opens and shuts, and `.collapsed` is
 * implemented as `display: none !important` on the tray's contents. Any path
 * that puts the class back — the dock's touchscreen auto-dismiss, a reflow, a
 * share link's `ui=` segment, a restore from storage — empties a tab without
 * touching the sheet, so every other check in this file still passes. Recherche
 * shipped that way and was blank on every tap.
 *
 * The touch-target scan is repeated PER TAB for the same reason: the run-wide
 * one reads whatever the sheet opens on, which is Couches, so three of the four
 * panels' controls had never been measured. It found two at 36 px.
 */
const readOpenTab = ({ floor, crowdedFloor, gap }) => {
  const panel = document.querySelector('.phone-sheet-panel:not([hidden])');
  if (!panel) return { present: false };
  const rect = panel.getBoundingClientRect();
  const boxes = [];
  for (const el of panel.querySelectorAll('button, [role=button], a[href], input, select, textarea')) {
    const r = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    if (r.width <= 0 || r.height <= 0) continue;
    boxes.push({ el, r });
  }
  const offenders = [];
  for (const { el, r } of boxes) {
    const smallest = Math.min(r.width, r.height);
    if (smallest >= floor) continue;
    let nearest = Infinity;
    for (const other of boxes) {
      if (other.el === el || other.el.contains(el) || el.contains(other.el)) continue;
      const dx = Math.max(0, Math.max(r.left - other.r.right, other.r.left - r.right));
      const dy = Math.max(0, Math.max(r.top - other.r.bottom, other.r.top - r.bottom));
      nearest = Math.min(nearest, Math.hypot(dx, dy));
    }
    if (smallest >= crowdedFloor && nearest >= gap) continue;
    offenders.push(`${el.id || (typeof el.className === 'string' ? el.className.split(/\s+/)[0] : el.tagName)} ${Math.round(r.width)}x${Math.round(r.height)}`);
  }
  return {
    present: true,
    id: panel.id,
    height: Math.round(rect.height),
    controls: boxes.length,
    offenders: [...new Set(offenders)].slice(0, 6),
  };
};

const readFontSizes = () => {
  const offenders = [];
  for (const el of document.querySelectorAll('input:not([type=range]):not([type=checkbox]):not([type=radio]), select, textarea')) {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') continue;
    const size = Number.parseFloat(style.fontSize);
    if (size >= 16) continue;
    offenders.push({ sel: `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}`, fontSize: size });
  }
  return offenders;
};

const readHidden = (ids) => Object.fromEntries(ids.map((id) => {
  const el = document.getElementById(id);
  return [id, el ? getComputedStyle(el).display : 'absent'];
}));

const readDesktopRects = (selectors) => Object.fromEntries(selectors.map((selector) => {
  const el = document.querySelector(selector);
  if (!el) return [selector, null];
  const r = el.getBoundingClientRect();
  return [selector, {
    x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
  }];
}));

const DESKTOP_SELECTORS = ['#left-panel-stack', '#right-context-rail', '#command-dock', '#cesium-credits'];

/**
 * Open one handset, run the layout checks, and return its shot prefix.
 * @param {import('puppeteer').Browser} browser
 * @param {{name: string, viewport?: object, userAgent?: string}} device
 * @param {boolean} full - Whether to run the sheet checks (only on the first pass).
 */
async function runHandset(browser, device, full) {
  const page = device.viewport
    ? await newQaPage(browser)
    : await newPhoneQaPage(browser);
  if (device.viewport) {
    await page.setViewport(device.viewport);
    await page.setUserAgent(device.userAgent);
    const client = await page.createCDPSession();
    await client.send('Emulation.setEmulatedMedia', {
      features: [
        { name: 'pointer', value: 'coarse' },
        { name: 'hover', value: 'none' },
        { name: 'any-pointer', value: 'coarse' },
        { name: 'any-hover', value: 'none' },
      ],
    });
  }
  await page.goto(phoneUrl(APP_URL), { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => !!window.__godsEyeView?.viewer, { timeout: 120_000 });
  await waitForBootVeil(page);
  await settle(page);

  const shell = await page.evaluate(() => ({
    shell: document.documentElement.dataset.shell ?? null,
    sheet: !!window.__godsEyeView?.phoneSheet,
  }));
  check(`[${device.name}] the shell is the phone shell, and the sheet is mounted`,
    shell.shell === 'phone' && shell.sheet, shell);

  const overflow = await page.evaluate(readOverflow);
  check(`[${device.name}] the page fits its own width`,
    overflow.scrollWidth <= overflow.innerWidth && overflow.spillers.length === 0, overflow);

  const band = await page.evaluate(readTopBandCollisions, TOP_BAND_PX);
  check(`[${device.name}] nothing fixed overlaps anything else in the top ${TOP_BAND_PX} px`,
    band.hits.length === 0, band);

  const targets = await page.evaluate(readTargets, {
    floor: TOUCH_TARGET_PX, crowdedFloor: TOUCH_TARGET_CROWDED_PX, gap: TOUCH_NEIGHBOUR_GAP_PX,
  });
  check(`[${device.name}] every visible control is ${TOUCH_TARGET_PX} px, or ${TOUCH_TARGET_CROWDED_PX} with ${TOUCH_NEIGHBOUR_GAP_PX} px of air`,
    targets.length === 0, { offenders: targets.length, worst: targets });

  const fonts = await page.evaluate(readFontSizes);
  check(`[${device.name}] no field under 16 px, so focusing one cannot zoom the viewport`,
    fonts.length === 0, fonts);

  const hidden = await page.evaluate(readHidden, ['left-panel-stack', 'right-context-rail', 'intel-hud', 'globe-heading-tape']);
  check(`[${device.name}] the desktop rails and HUD are not drawn`,
    Object.values(hidden).every((display) => display === 'none' || display === 'absent'), hidden);

  // ── The voice module, in each of the four states it can be left in ───────
  const voice = {};
  for (const state of VOICE_STATES) {
    await page.evaluate(setVoiceState, state);
    await wait(260);
    voice[state.name] = await page.evaluate(readVoiceModule);
  }
  await page.evaluate(setVoiceState, VOICE_STATES[0]);
  await wait(200);
  check(`[${device.name}] the voice module and its trays stay on screen, inside their own box, and clear of the sheet`,
    Object.values(voice).every((state) => state.present
      && state.offScreen.length === 0
      && state.outsideOwnBox.length === 0
      && state.overSheet.length === 0),
    voice);

  if (full) {
    // ── The sheet: three snaps, ascending, each clear of the top bar ────────
    const heights = {};
    const creditsAt = {};
    for (const snap of ['peek', 'half', 'full']) {
      await page.evaluate((name) => window.__godsEyeView.phoneSheet.snapTo(name), snap);
      await wait(320);
      await settle(page);
      heights[snap] = await page.evaluate(() => Math.round(
        document.getElementById('phone-sheet').getBoundingClientRect().height,
      ));
      creditsAt[snap] = await page.evaluate(readCredits);
      await shoot(page, `${device.name}-${snap}.png`);
    }
    const innerHeight = await page.evaluate(() => window.innerHeight);
    check(`[${device.name}] the three snaps ascend and full clears the top bar`,
      heights.peek < heights.half && heights.half < heights.full && heights.full <= innerHeight - 56,
      { ...heights, innerHeight });

    check(`[${device.name}] the required credit line is visible and on top at every snap`,
      Object.values(creditsAt).every((c) => c.present && c.inside && c.onTop), creditsAt);

    // ── A real gesture on the grip lands on a snap ─────────────────────────
    await page.evaluate(() => window.__godsEyeView.phoneSheet.snapTo('peek'));
    await wait(300);
    const drag = await dragGrip(page);
    await wait(400);
    const afterDrag = await page.evaluate(() => ({
      snap: window.__godsEyeView.phoneSheet.getSnap(),
      height: Math.round(document.getElementById('phone-sheet').getBoundingClientRect().height),
    }));
    check(`[${device.name}] dragging the grip upward ends on a higher snap (${drag.how})`,
      afterDrag.snap !== 'peek' && afterDrag.height > heights.peek, { ...afterDrag, ...drag });

    // ── Every tab holds something, and everything it holds is reachable ────
    const tabs = {};
    await page.evaluate(() => window.__godsEyeView.phoneSheet.snapTo('full'));
    for (const tab of Object.keys(TAB_CONTROL_FLOORS)) {
      await page.evaluate((name) => window.__godsEyeView.phoneSheet.selectTab(name), tab);
      // Long enough to outlive the dock's 420 ms auto-dismiss, which is what
      // emptied Recherche a third of a second after it opened.
      await wait(700);
      tabs[tab] = await page.evaluate(readOpenTab, {
        floor: TOUCH_TARGET_PX, crowdedFloor: TOUCH_TARGET_CROWDED_PX, gap: TOUCH_NEIGHBOUR_GAP_PX,
      });
    }
    check(`[${device.name}] every tab holds content and every control in it is reachable`,
      Object.entries(tabs).every(([name, t]) => t.present && t.height > 0
        && t.controls >= TAB_CONTROL_FLOORS[name] && t.offenders.length === 0), tabs);

    // The map source moved out of a panel a phone never shows; the eight
    // basemaps are the tab's first block or they are nowhere. Measured with
    // Couches OPEN — the loop above ends on Sélection, and a hidden panel
    // reports every height as zero.
    await page.evaluate(() => window.__godsEyeView.phoneSheet.selectTab('layers'));
    await wait(400);
    const mapSource = await page.evaluate(() => {
      const section = document.querySelector('.map-source-section');
      if (!section) return { present: false };
      const layers = document.getElementById('phone-panel-layers');
      const r = section.getBoundingClientRect();
      return {
        present: true,
        inLayersTab: !!layers && layers.contains(section),
        first: layers?.firstElementChild === section,
        chips: section.querySelectorAll('.map-stack-chip').length,
        active: section.querySelector('.map-stack-chip.active')?.textContent?.trim() ?? null,
        height: Math.round(r.height),
      };
    });
    check(`[${device.name}] the eight map sources lead the Couches tab`,
      mapSource.present && mapSource.inLayersTab && mapSource.first
      && mapSource.chips === 8 && mapSource.height > 0, mapSource);

    // ── Evidence for the two tabs a reader actually uses ───────────────────
    await page.evaluate(() => {
      window.__godsEyeView.phoneSheet.selectTab('layers');
      window.__godsEyeView.phoneSheet.snapTo('half');
    });
    await wait(300);
    await shoot(page, `${device.name}-layers.png`);
    await page.evaluate(() => window.__godsEyeView.phoneSheet.selectTab('selection'));
    await wait(300);
    await shoot(page, `${device.name}-selection.png`);

    // « À LA UNE » leads the panel, and the heavy layers are badged.
    //
    // Asserted against the LISTS, not against a count: a featured id that names
    // a layer with no row disappears in silence, which is exactly how this
    // shipped with seven rows where the list said eight. `src/phoneSheetLayout.test.mjs`
    // pins the cause (no fused id in either list); this pins the effect.
    const featured = await page.evaluate(({ wantFeatured, wantHeavy }) => {
      const first = document.querySelector('#data-toggles .data-category');
      const rows = [...document.querySelectorAll('#data-toggles [data-layer-id]')].map((row) => row.dataset.layerId);
      const seen = new Set();
      const duplicated = [];
      for (const id of rows) {
        if (seen.has(id)) duplicated.push(id);
        seen.add(id);
      }
      const featuredRows = [...(first?.querySelectorAll('[data-layer-id]') || [])].map((row) => row.dataset.layerId);
      const badged = [...document.querySelectorAll('#data-toggles .data-scope-chip.is-heavy')]
        .map((chip) => chip.closest('[data-layer-id]')?.dataset.layerId);
      return {
        firstGroup: first?.dataset.categoryId ?? null,
        firstLabel: first?.querySelector('.data-category-label')?.textContent ?? null,
        featuredRows,
        missingFeatured: wantFeatured.filter((id) => !featuredRows.includes(id)),
        missingHeavy: wantHeavy.filter((id) => !badged.includes(id)),
        strayHeavy: badged.filter((id) => !wantHeavy.includes(id)),
        duplicated,
      };
    }, { wantFeatured: [...FEATURED_IDS], wantHeavy: [...HEAVY_IDS] });
    check(`[${device.name}] « À LA UNE » leads the panel, moved and not copied, and every heavy layer is badged`,
      featured.firstGroup === 'featured'
        && featured.missingFeatured.length === 0
        && featured.missingHeavy.length === 0
        && featured.strayHeavy.length === 0
        && featured.duplicated.length === 0,
      featured);
  } else {
    await shoot(page, `${device.name}-peek.png`);
  }

  await page.close();
}

/**
 * Drag the sheet's grip upward.
 *
 * `page.touchscreen` first, because it is the only way to prove the browser
 * does not steal the gesture for a scroll (`touch-action: none` is what stops
 * it, and a synthetic DOM event never tests that). Real Puppeteer input has a
 * documented habit of hanging on this app, so a DOM `PointerEvent` sequence is
 * the fallback — it still exercises the handler, and says which path it took.
 *
 * @param {import('puppeteer').Page} page
 * @returns {Promise<{how: string}>}
 */
async function dragGrip(page) {
  const grip = await page.evaluate(() => {
    const r = document.querySelector('[data-phone-grip]').getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  });
  try {
    const touchscreen = page.touchscreen;
    await Promise.race([
      (async () => {
        await touchscreen.touchStart(grip.x, grip.y);
        for (let step = 1; step <= 6; step++) {
          await touchscreen.touchMove(grip.x, grip.y - step * 40);
          await wait(16);
        }
        await touchscreen.touchEnd();
      })(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('touchscreen timeout')), 8_000)),
    ]);
    return { how: 'touchscreen' };
  } catch {
    await page.evaluate((start) => {
      const target = document.querySelector('[data-phone-grip]');
      const fire = (type, y) => target.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: true,
        pointerId: 1, clientX: start.x, clientY: y,
      }));
      fire('pointerdown', start.y);
      for (let step = 1; step <= 6; step++) fire('pointermove', start.y - step * 40);
      fire('pointerup', start.y - 240);
    }, grip);
    return { how: 'dom-pointer-events' };
  }
}

const browser = await puppeteer.launch({
  headless: 'new',
  protocolTimeout: 300_000,
  args: [
    '--no-sandbox', '--disable-setuid-sandbox',
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
  ],
});

try {
  if (!WRITE_REFERENCE) {
    await runHandset(browser, { name: 'iphone13' }, true);
    await runHandset(browser, ANDROID, false);
  }

  // ── 8. The desktop this shell was carved out of ─────────────────────────
  const desktop = await newQaPage(browser);
  await desktop.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await desktop.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await desktop.waitForFunction(() => !!window.__godsEyeView?.viewer, { timeout: 120_000 });
  await waitForBootVeil(desktop);
  await wait(2_000);
  await settle(desktop);

  const desktopState = await desktop.evaluate(() => {
    // Guarded rather than assumed: this same reader runs on a build from BEFORE
    // the shell existed when the reference is being written, and neither node
    // is there.
    const display = (id) => {
      const el = document.getElementById(id);
      return el ? getComputedStyle(el).display : 'absent';
    };
    return {
      shell: document.documentElement.dataset.shell ?? null,
      input: document.documentElement.dataset.input ?? null,
      sheetDisplay: display('phone-sheet'),
      statusDisplay: display('phone-status'),
      sheetController: !!window.__godsEyeView?.phoneSheet,
    };
  });
  if (!WRITE_REFERENCE) {
    check('[desktop] no phone shell, no sheet, and the status wrapper is transparent to layout',
      desktopState.shell === null && desktopState.sheetDisplay === 'none'
        && desktopState.statusDisplay === 'contents' && desktopState.sheetController === false,
      desktopState);
  }

  const rects = await desktop.evaluate(readDesktopRects, DESKTOP_SELECTORS);
  if (WRITE_REFERENCE) {
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    fs.writeFileSync(REFERENCE_FILE, `${JSON.stringify(rects, null, 2)}\n`);
    console.log(`  [\x1b[33mWROTE\x1b[0m] ${path.relative(ROOT, REFERENCE_FILE)}`);
  } else if (!fs.existsSync(REFERENCE_FILE)) {
    check('[desktop] the reference rectangles exist', false,
      { missing: path.relative(ROOT, REFERENCE_FILE), fix: 'run once with --write-reference on a commit without the shell' });
  } else {
    const reference = JSON.parse(fs.readFileSync(REFERENCE_FILE, 'utf8'));
    const drift = [];
    for (const selector of DESKTOP_SELECTORS) {
      const before = reference[selector];
      const after = rects[selector];
      if (!before || !after) {
        if (before !== after) drift.push({ selector, before, after });
        continue;
      }
      for (const key of ['x', 'y', 'w', 'h']) {
        if (Math.abs(before[key] - after[key]) > DESKTOP_DRIFT_PX) {
          drift.push({ selector, key, before: before[key], after: after[key] });
        }
      }
    }
    check('[desktop] the rails, the dock and the credit line have not moved', drift.length === 0, drift.slice(0, 8));
  }

  await shoot(desktop, 'desktop-control.png');
  await desktop.close();
} finally {
  await browser.close();
}

const passed = results.filter((r) => r.pass).length;
console.log(`\nqa:phone-shell ${passed}/${results.length}`);
process.exit(passed === results.length ? 0 : 1);
