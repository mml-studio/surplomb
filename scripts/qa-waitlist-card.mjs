#!/usr/bin/env node
/**
 * QA the hosted trial's waitlist card, in a real browser, against a server
 * started WITH the trial on:
 *
 *   GEV_TRIAL_LIMIT=2 GEV_TRIAL_SECRET=… GEV_WAITLIST_BUTTONDOWN=<user> \
 *     npx vite preview --port 4391
 *   node scripts/qa-waitlist-card.mjs --url http://localhost:4391
 *
 * What the unit tests cannot see:
 *
 *   1. `?waitlist=1` opens the card in place of the first-run launcher, with
 *      the Buttondown form, no price, and the caret in the email field.
 *   2. A mic click opens the card (reason `voice`) instead of a session — the
 *      dock is not left in CONNECTING or ERROR.
 *   3. The HUD, once its trial is spent, stops asking and opens the card
 *      WITHOUT taking focus. This spends `GEV_TRIAL_LIMIT` real HUD summaries.
 *   4. On a phone the card is a bottom sheet, full width, and the sheet behind
 *      it stands down.
 *
 * Usage: node scripts/qa-waitlist-card.mjs [--url http://localhost:4391] [--headful] [--skip-hud]
 */

import puppeteer from 'puppeteer';
import { newPhoneQaPage, newQaPage, phoneUrl } from './lib/qa-first-run.mjs';

const args = process.argv.slice(2);
const getOpt = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const APP_URL = getOpt('--url', 'http://localhost:4391').replace(/\/$/, '');
const HEADFUL = args.includes('--headful');
const SKIP_HUD = args.includes('--skip-hud');

const CHROME_CANDIDATES = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  (() => { try { return puppeteer.executablePath(); } catch { return null; } })(),
].filter(Boolean);

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok });
  console.log(`  [${ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'}] ${name}${detail ? ` — ${detail}` : ''}`);
}

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

async function waitFor(page, check, arg, { timeoutMs = 60_000, everyMs = 300 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await page.evaluate(check, arg);
    if (last) return last;
    await sleep(everyMs);
  }
  return last;
}

/** Everything the checks need about the card, read in one page pass. */
const readCard = () => {
  const card = document.getElementById('waitlist-card');
  if (!card) return null;
  // The entrance animation only advances while the page produces frames, and
  // headless Chrome here produces none: measure the settled layout, not frame 0.
  for (const animation of card.getAnimations?.() || []) animation.finish();
  const box = card.getBoundingClientRect();
  const form = card.querySelector('.waitlist-form');
  const launcher = document.getElementById('first-run-launcher');
  const sheet = document.getElementById('phone-sheet');
  return {
    reason: card.dataset.reason,
    title: card.querySelector('h2')?.textContent || '',
    action: form?.getAttribute('action') || null,
    target: form?.getAttribute('target') || null,
    formVisible: Boolean(form && !form.hidden && getComputedStyle(form).display !== 'none'),
    mentionsPrice: /€/.test(card.textContent || ''),
    focusedId: document.activeElement?.id || document.activeElement?.className || null,
    box: { top: box.top, bottom: box.bottom, left: box.left, width: box.width, height: box.height },
    viewport: { width: innerWidth, height: innerHeight },
    display: getComputedStyle(card).display,
    launcherVisible: Boolean(launcher && !launcher.hidden && getComputedStyle(launcher).display !== 'none'
      && launcher.classList.contains('visible')),
    sheetVisibility: sheet ? getComputedStyle(sheet).visibility : null,
  };
};

async function directLink(browser) {
  console.log('\n?waitlist=1 (desktop)');
  const page = await newQaPage(browser);
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${APP_URL}/?waitlist=1`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  const card = await waitFor(page, readCard);
  record('the card opens from the link', Boolean(card), card ? card.title : 'no #waitlist-card after 60 s');
  if (!card) return page.close();
  record('it is the direct variant', card.reason === 'direct' && card.title === 'Liste d’attente', card.reason);
  record('the form posts to Buttondown in a new tab',
    /^https:\/\/buttondown\.com\/api\/emails\/embed-subscribe\//.test(card.action || '') && card.target === '_blank',
    `${card.action} → ${card.target}`);
  record('the form is shown', card.formVisible, card.formVisible ? '' : 'hidden — is GEV_WAITLIST_BUTTONDOWN set?');
  record('no price on the card', !card.mentionsPrice);
  record('the caret is in the email field', card.focusedId === 'waitlist-email', String(card.focusedId));
  const inside = card.box.top >= 0 && card.box.bottom <= card.viewport.height && card.box.left >= 0;
  record('the card sits inside the viewport', inside, JSON.stringify(card.box));
  record('the first-run launcher did not open on top', !card.launcherVisible);

  await page.evaluate(() => document.querySelector('#waitlist-card [data-waitlist-close]').click());
  const gone = await waitFor(page, () => !document.getElementById('waitlist-card'), null, { timeoutMs: 3000 });
  record('× closes it', Boolean(gone));
  await page.close();
}

async function micClick(browser) {
  console.log('\nmic click (desktop, voice out of the trial)');
  const page = await newQaPage(browser);
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${APP_URL}/`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  const button = await waitFor(page, () => Boolean(document.getElementById('gev-voice-button')), null, { timeoutMs: 90_000 });
  record('the voice dock is mounted', Boolean(button));
  if (!button) return page.close();
  await page.evaluate(() => document.getElementById('gev-voice-button').click());
  const card = await waitFor(page, readCard, null, { timeoutMs: 15_000 });
  record('the mic opens the card', card?.reason === 'voice', card ? card.title : 'no card');
  const status = await page.evaluate(() => document.getElementById('gev-voice-control')?.dataset.status || 'idle');
  record('the dock is not left connecting or in error', !['connecting', 'error', 'listening'].includes(status), status);
  await page.close();
}

async function hudExhausted(browser) {
  console.log('\nHUD summary past the trial (spends GEV_TRIAL_LIMIT summaries)');
  const page = await newQaPage(browser);
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${APP_URL}/`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  const ready = await waitFor(page, () => Boolean(window.__godsEyeView?.styleManager?.hud), null, { timeoutMs: 90_000 });
  record('the HUD exists', Boolean(ready));
  if (!ready) return page.close();
  const trial = await page.evaluate(async () => (await fetch('/api/trial')).json());
  record('the server has the trial on', trial.enabled === true, JSON.stringify(trial));
  if (!trial.enabled) return page.close();

  const outcome = await page.evaluate(async (limit) => {
    const hud = window.__godsEyeView.styleManager.hud;
    window.dispatchEvent(new PointerEvent('pointerdown'));
    hud.onStyleChange('surveillance');
    const lines = [];
    for (let i = 0; i <= limit + 1; i += 1) {
      hud._updateCameraData?.();
      // eslint-disable-next-line no-await-in-loop
      await hud._updateSummary(false, true);
      lines.push({ disabled: hud._summaryDisabled, card: Boolean(document.getElementById('waitlist-card')) });
    }
    return lines;
  }, trial.remaining);
  const card = await waitFor(page, readCard, null, { timeoutMs: 10_000 });
  record('the HUD latches off once refused', outcome.at(-1).disabled === true, JSON.stringify(outcome));
  record('the card opens with the exhausted variant', card?.reason === 'exhausted' && card.title === 'Essai terminé', card?.title);
  record('an automatic card does not take focus', card && card.focusedId !== 'waitlist-email', String(card?.focusedId));
  await page.close();
}

async function phone(browser) {
  console.log('\n?waitlist=1 (phone)');
  const page = await newPhoneQaPage(browser);
  await page.goto(phoneUrl(`${APP_URL}/?waitlist=1`), { waitUntil: 'domcontentloaded', timeout: 120_000 });
  const card = await waitFor(page, readCard);
  record('the card opens on a phone', Boolean(card));
  if (!card) return page.close();
  record('it is a full-width bottom sheet',
    Math.abs(card.box.bottom - card.viewport.height) < 2 && Math.abs(card.box.width - card.viewport.width) < 2,
    JSON.stringify({ box: card.box, viewport: card.viewport }));
  record('its top stays on screen', card.box.top >= 0, `top ${Math.round(card.box.top)}`);
  record('the phone sheet stands down', card.sheetVisibility !== 'visible', String(card.sheetVisibility));
  await page.close();
}

const executablePath = CHROME_CANDIDATES[0];
const browser = await puppeteer.launch({
  headless: HEADFUL ? false : true,
  executablePath,
  protocolTimeout: 180_000,
  args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1440,900'],
});
try {
  await directLink(browser);
  await micClick(browser);
  if (!SKIP_HUD) await hudExhausted(browser);
  await phone(browser);
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
