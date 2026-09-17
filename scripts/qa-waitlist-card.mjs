#!/usr/bin/env node
/**
 * QA the hosted trial's waitlist card, in a real browser, against a server
 * started WITH the trial on:
 *
 *   export GEV_TRIAL_SECRET=…
 *   GEV_TRIAL_LIMIT=2 GEV_WAITLIST_BUTTONDOWN=<user> npx vite preview --port 4391
 *   node scripts/qa-waitlist-card.mjs --url http://localhost:4391
 *
 * The secret is read by BOTH: this script signs a cookie whose voice trial is
 * already spent, which a real browser could only get by paying for a session.
 *
 * What the unit tests cannot see:
 *
 *   1. `?waitlist=1` opens the card in place of the first-run launcher, with
 *      the Buttondown form, no price, and the caret in the email field.
 *   2. The mic wears the premium crown, its help tray says what the trial
 *      holds, and a REFUSED microphone never mints a session — the one voice
 *      trial is not spent on a permission prompt.
 *   3. Once the voice trial is spent, a mic click opens the premium card
 *      (reason `voice`) instead of a session — the dock is not left in
 *      CONNECTING or ERROR.
 *   4. The HUD, once its trial is spent, stops asking and opens the card
 *      WITHOUT taking focus. This spends `GEV_TRIAL_LIMIT` real HUD summaries.
 *   5. On a phone the card is a bottom sheet, full width, and the sheet behind
 *      it stands down.
 *
 * Usage: node scripts/qa-waitlist-card.mjs [--url http://localhost:4391] [--headful] [--skip-hud]
 */

import puppeteer from 'puppeteer';
import { newPhoneQaPage, newQaPage, phoneUrl } from './lib/qa-first-run.mjs';
import { TRIAL_COOKIE, signTrialToken } from '../src/trialQuota.js';

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

/** The crown on the mic and the words under it. */
const readBadge = () => {
  const badge = document.querySelector('#gev-voice-control .gev-premium-badge');
  if (!badge || !document.documentElement.dataset.voicePremium) return null;
  const box = badge.getBoundingClientRect();
  return {
    state: document.documentElement.dataset.voicePremium,
    display: getComputedStyle(badge).display,
    width: box.width,
    height: box.height,
    background: getComputedStyle(badge).backgroundImage,
    help: document.querySelector('#gev-voice-control .gev-voice-help-premium')?.textContent || '',
  };
};

async function micFresh(browser) {
  console.log('\nmic (desktop, a new browser): the crown, and a refused microphone');
  const page = await newQaPage(browser);
  await page.setViewport({ width: 1440, height: 900 });
  const minted = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/realtime/token')) minted.push(request.url());
  });
  await page.goto(`${APP_URL}/`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  const badge = await waitFor(page, readBadge, null, { timeoutMs: 90_000 });
  record('the mic wears the crown', badge?.display === 'grid' && Math.round(badge.width) === 15
    && /gradient/.test(badge.background), JSON.stringify(badge));
  record('its help tray says what the trial holds', /^Fonction premium · essai gratuit de \d+ demandes?$/.test(badge?.help || ''),
    badge?.help);
  if (!badge) return page.close();

  // The visitor refuses the microphone: the session must not be minted,
  // or their one voice trial is gone without a word said.
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
    document.getElementById('gev-voice-button').click();
  });
  // `idle` is also where the dock starts, so only the refusal's own error
  // proves the click reached the microphone at all.
  const settled = await waitFor(page, () => (
    document.getElementById('gev-voice-control')?.dataset.status === 'error'
      ? document.getElementById('gev-voice-error-detail')?.textContent || 'error'
      : null
  ), null, { timeoutMs: 30_000 });
  record('the refusal reaches the dock', Boolean(settled), String(settled));
  await sleep(1500);
  record('a refused microphone never mints a session', Boolean(settled) && minted.length === 0,
    `${minted.length} token request(s)`);
  const trial = await page.evaluate(async () => (await fetch('/api/trial', { cache: 'no-store' })).json());
  record('the voice trial is still whole', trial.voice?.remaining > 0 && trial.voice.remaining === trial.voice.limit,
    JSON.stringify(trial.voice));
  record('no card for a refused microphone', !(await page.evaluate(readCard)));
  await page.close();
}

async function micSpent(browser) {
  console.log('\nmic click (desktop, voice trial already used)');
  const secret = process.env.GEV_TRIAL_SECRET;
  if (!secret) {
    record('GEV_TRIAL_SECRET is exported for this script too', false, 'it signs the spent cookie');
    return;
  }
  const page = await newQaPage(browser);
  await page.setViewport({ width: 1440, height: 900 });
  await page.setCookie({
    name: TRIAL_COOKIE,
    // 20 is the most requests a voice trial can be configured with.
    value: signTrialToken({ used: 1, voiceUsed: 20, id: 'qa-voice-spent' }, secret),
    url: APP_URL,
    httpOnly: true,
    sameSite: 'Lax',
  });
  await page.goto(`${APP_URL}/`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  const trial = await page.evaluate(async () => (await fetch('/api/trial', { cache: 'no-store' })).json());
  record('the server reads the spent cookie', trial.voice?.remaining === 0,
    trial.voice ? JSON.stringify(trial.voice) : 'no voice field — wrong GEV_TRIAL_SECRET?');
  const badge = await waitFor(page, readBadge, null, { timeoutMs: 90_000 });
  record('the crown stays, and the tray says the trial is used', badge?.display === 'grid'
    && badge.help === 'Fonction premium · essai utilisé', badge?.help);
  const button = await waitFor(page, () => Boolean(document.getElementById('gev-voice-button')), null, { timeoutMs: 90_000 });
  if (!button) return page.close();
  await page.evaluate(() => document.getElementById('gev-voice-button').click());
  const card = await waitFor(page, readCard, null, { timeoutMs: 15_000 });
  record('the mic opens the premium card', card?.reason === 'voice' && card.title === 'La voix est une fonction premium',
    card ? card.title : 'no card');
  record('the card has no price either', card && !card.mentionsPrice);
  const status = await page.evaluate(() => document.getElementById('gev-voice-control')?.dataset.status || 'idle');
  record('the dock is not left connecting or in error', !['connecting', 'error', 'listening', 'answering', 'ready'].includes(status), status);
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
  await micFresh(browser);
  await micSpent(browser);
  if (!SKIP_HUD) await hudExhausted(browser);
  await phone(browser);
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
