#!/usr/bin/env node
/**
 * qa-first-run-ab — the first-run A/B test, end to end, in a real browser.
 *
 * The unit suites prove the draw, the schema, the sink and the report against
 * fakes. This proves the pieces meet: that a boot on a server running the test
 * draws and keeps a variant, that a card's life lands in the day file as the
 * schema says and as nothing else, that a returning visitor reports once, that
 * the privacy page describes the test and its refusal works — and, with
 * `--off`, that a server without the variable measures nothing at all.
 *
 *   GEV_FIRST_RUN_AB=A,B,C npx vite --port 4193 --strictPort
 *   node scripts/qa-first-run-ab.mjs --url http://localhost:4193 [--dir .gev-cache/first-run-ab]
 *
 *   npx vite --port 4194 --strictPort          # no variable
 *   node scripts/qa-first-run-ab.mjs --url http://localhost:4194 --off
 *
 * Pages come from `newQaPage()`: its session seed hides a card that was DRAWN,
 * which is exactly what the draw check needs, and `?welcome=` still replays a
 * card on purpose — those reports are marked `forced`, like a support demo.
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { newQaPage } from './lib/qa-first-run.mjs';
import { FIRST_RUN_STORAGE_KEY, FIRST_RUN_VARIANT_KEY } from '../src/firstRunExperience.js';
import { FIRST_RUN_OPTOUT_KEY } from '../src/firstRunOptOut.js';
import { FIRST_RUN_REPORT_FIELDS } from '../src/firstRunAb.js';

const args = process.argv.slice(2);
const option = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const APP_URL = option('--url', 'http://localhost:4193').replace(/\/$/, '');
const DIR = path.resolve(option('--dir', path.join(process.cwd(), '.gev-cache', 'first-run-ab')));
const OFF = args.includes('--off');
const CHROME = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  // The installed Chrome first: Chrome for Testing can stop producing frames
  // mid-session on this Mac, and the card only reveals on a landed flight.
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  (() => { try { return puppeteer.executablePath(); } catch { return null; } })(),
].filter(Boolean).find((candidate) => fs.existsSync(candidate));

const results = [];
const record = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok) });
  console.log(`  [${ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'}] ${name}${detail ? ` — ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(page, predicate, arg = null, timeout = 30000) {
  const until = Date.now() + timeout;
  let value;
  do {
    value = await page.evaluate(predicate, arg).catch(() => undefined);
    if (value) return value;
    await sleep(250);
  } while (Date.now() < until);
  return value;
}

/** Every line the sink has written, parsed. */
function readLines() {
  let names = [];
  try {
    names = fs.readdirSync(DIR).filter((name) => /^events-\d{4}-\d{2}-\d{2}\.jsonl$/.test(name)).sort();
  } catch {
    return { lines: [], raw: '' };
  }
  const raw = names.map((name) => fs.readFileSync(path.join(DIR, name), 'utf8')).join('');
  const lines = raw.split('\n').filter(Boolean).map((line) => JSON.parse(line));
  return { lines, raw };
}

/** Seconds precision, like `receivedAt`: only this run's lines are looked at. */
const STARTED = new Date(Date.now() - 1000).toISOString().slice(0, 19);

async function waitForLines(predicate, timeout = 15000) {
  const until = Date.now() + timeout;
  let found = [];
  do {
    found = readLines().lines.filter((line) => line.receivedAt >= STARTED && predicate(line));
    if (found.length) return found;
    await sleep(300);
  } while (Date.now() < until);
  return found;
}

async function open(page, query = '') {
  await page.bringToFront();
  await page.goto(`${APP_URL}/${query}`, { waitUntil: 'domcontentloaded' });
  await waitFor(page, () => {
    if (!window.__godsEyeView?.styleManager) return false;
    const card = document.getElementById('first-run-launcher');
    const hint = document.getElementById('first-run-hint');
    if (hint?.classList.contains('visible')) return true;
    return !card || card.classList.contains('visible');
  }, null, 60000);
  await sleep(500);
}

const clearStorage = (page) => page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });

/** What `document.hidden` would say when the visitor switches tabs. */
const hidePage = (page) => page.evaluate(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
  document.dispatchEvent(new Event('visibilitychange'));
});

async function runOn(browser) {
  console.log(`\nFirst-run A/B QA — ${APP_URL}\n  sink: ${DIR}\n`);
  const trial = await (await fetch(`${APP_URL}/api/trial`)).json();
  record('/api/trial names the variants', JSON.stringify(trial.experiments) === JSON.stringify({ firstRun: { variants: ['A', 'B', 'C'] } }),
    JSON.stringify(trial.experiments));
  const health = await (await fetch(`${APP_URL}/healthz`)).json().catch(() => ({}));
  record('/healthz says the test is collecting', health.abtest === true, `abtest=${health.abtest}`);

  // ── A natural draw ────────────────────────────────────────────────────────
  const drawPage = await newQaPage(browser);
  await drawPage.setViewport({ width: 1440, height: 900 });
  await open(drawPage);
  await clearStorage(drawPage);
  await open(drawPage);
  const drawn = await waitFor(drawPage, (key) => localStorage.getItem(key), FIRST_RUN_VARIANT_KEY, 10000);
  let parsed = null;
  try { parsed = JSON.parse(drawn); } catch { /* reported below */ }
  record('a boot draws a variant and keeps it',
    parsed && ['A', 'B', 'C'].includes(parsed.variant) && /^[0-9a-z]{16}$/.test(parsed.visitorId),
    drawn || 'nothing stored');
  await open(drawPage);
  const kept = await drawPage.evaluate((key) => localStorage.getItem(key), FIRST_RUN_VARIANT_KEY);
  record('the next boot keeps the same draw', kept === drawn);
  await drawPage.close();

  // ── A forced card, closed by a choice, then left ──────────────────────────
  const page = await newQaPage(browser);
  await page.setViewport({ width: 1440, height: 900 });
  await open(page);
  await clearStorage(page);
  const before = readLines().lines.length;
  await open(page, '?welcome=A');
  const cardUp = await page.evaluate(() => document.getElementById('first-run-launcher')?.classList.contains('visible'));
  record('?welcome=A shows the card on a measured page', cardUp);
  await page.evaluate(() => {
    const field = document.querySelector('[data-first-run-address]');
    field.value = 'Vieux-Port, Marseille';
    field.form.requestSubmit();
  });
  const terminal = await waitForLines((line) => line.variant === 'A' && line.forced && line.seq === 1, 30000);
  const first = terminal.at(-1);
  record('the terminal report lands, once', terminal.length >= 1 && readLines().lines.length === before + 1,
    first ? `${first.events.map((event) => event.kind || event.via || event.type).join(' → ')}` : 'no line');
  record('it is the schema, exactly, with the time it arrived',
    first && JSON.stringify(Object.keys(first)) === JSON.stringify(['receivedAt', ...FIRST_RUN_REPORT_FIELDS]),
    first ? Object.keys(first).join(',') : '');
  const address = first?.events.find((event) => event.type === 'action');
  record('the address is a length bucket, found', address?.kind === 'address' && address.outcome === 'found' && address.qLen === '11-30',
    JSON.stringify(address));
  await sleep(2500);
  await hidePage(page);
  const cumulative = await waitForLines((line) => line.sessionId === first?.sessionId && line.seq === 2, 15000);
  record('leaving sends the cumulative report with the time spent',
    cumulative.length === 1 && Number.isInteger(cumulative[0].dwellMs) && cumulative[0].dwellMs >= 2000,
    cumulative[0] ? `dwell ${cumulative[0].dwellMs} ms, ${cumulative[0].events.length} events` : 'none');
  const { raw } = readLines();
  const leaks = ['Vieux-Port', 'Marseille', 'dvf-sales', 'HeadlessChrome', 'Mozilla', '127.0.0.1', 'localhost']
    .filter((leak) => raw.includes(leak));
  record('neither the text, the layers, the browser nor the address reach the file', leaks.length === 0,
    leaks.join(', ') || 'clean');
  await page.close();

  // ── A returning visitor ───────────────────────────────────────────────────
  const back = await newQaPage(browser, { durable: true });
  await back.setViewport({ width: 1440, height: 900 });
  await open(back);
  await back.evaluate((key) => localStorage.removeItem(key), FIRST_RUN_VARIANT_KEY);
  await open(back);
  const noCard = await back.evaluate(() => !document.getElementById('first-run-launcher'));
  const returnsBefore = readLines().lines.filter((line) => line.returnVisit).length;
  await hidePage(back);
  const returns = await waitForLines((line) => line.returnVisit, 15000);
  const latest = returns.at(-1);
  record('a returning visitor sees no card and reports once, empty',
    noCard && returns.length === returnsBefore + 1 && latest.events.length === 0 && latest.forced === false,
    latest ? `variant ${latest.variant}, dwell ${latest.dwellMs} ms` : 'none');
  await back.close();

  // ── The privacy page and the refusal ──────────────────────────────────────
  const html = await (await fetch(`${APP_URL}/confidentialite`)).text();
  record('the privacy page describes the test', html.includes('test A/B') && !html.includes('pas de mesure d’audience'));
  record('and offers the refusal', /data-first-run-optout/.test(html));
  const privacy = await newQaPage(browser);
  await privacy.setViewport({ width: 1280, height: 900 });
  await privacy.bringToFront();
  await privacy.goto(`${APP_URL}/confidentialite`, { waitUntil: 'domcontentloaded' });
  await waitFor(privacy, () => document.querySelector('[data-first-run-optout-status]')?.textContent?.length > 0, null, 15000);
  const refusal = await privacy.evaluate((key) => {
    const button = document.querySelector('[data-first-run-optout]');
    button.click();
    return {
      stored: localStorage.getItem(key),
      status: document.querySelector('[data-first-run-optout-status]')?.textContent,
      label: button.textContent,
    };
  }, FIRST_RUN_OPTOUT_KEY);
  record('the button stores the refusal and says so', refusal.stored === 'refused' && /n’est pas mesuré/.test(refusal.status),
    JSON.stringify(refusal));
  await open(privacy);
  const forgotten = await privacy.evaluate((key) => localStorage.getItem(key), FIRST_RUN_VARIANT_KEY);
  record('the next boot forgets the draw', forgotten === null, String(forgotten));
  const linesBefore = readLines().lines.length;
  await open(privacy, '?welcome=C');
  const hint = await privacy.evaluate(() => document.getElementById('first-run-hint')?.classList.contains('visible'));
  await privacy.evaluate(() => document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
  await sleep(1500);
  await hidePage(privacy);
  await sleep(3000);
  record('a refused browser still gets its card, and nothing is sent',
    hint && readLines().lines.length === linesBefore, `lines ${linesBefore} → ${readLines().lines.length}`);
  await privacy.close();
}

async function runOff(browser) {
  console.log(`\nFirst-run A/B QA, switched OFF — ${APP_URL}\n`);
  const trial = await (await fetch(`${APP_URL}/api/trial`)).json();
  record('/api/trial says no test', trial.experiments === null, JSON.stringify(trial.experiments));
  const post = await fetch(`${APP_URL}/api/first-run/events`, { method: 'POST', body: '{}' });
  record('the sink is a 404', post.status === 404, String(post.status));
  const html = await (await fetch(`${APP_URL}/confidentialite`)).text();
  record('the privacy page says there is no audience measurement', html.includes('pas de mesure d’audience') && !html.includes('test A/B'));
  const page = await newQaPage(browser);
  await page.setViewport({ width: 1440, height: 900 });
  await open(page);
  // A draw left from a test that has since been switched off.
  await page.evaluate((key) => {
    localStorage.clear();
    localStorage.setItem(key, JSON.stringify({ variant: 'B', assignedAt: Date.now(), visitorId: 'abcdefghij012345' }));
  }, FIRST_RUN_VARIANT_KEY);
  const beacons = [];
  page.on('request', (request) => { if (request.url().includes('/api/first-run/events')) beacons.push(request.url()); });
  await open(page);
  const leftover = await page.evaluate((key) => localStorage.getItem(key), FIRST_RUN_VARIANT_KEY);
  record('the leftover draw is forgotten at boot', leftover === null, String(leftover));
  await open(page, '?welcome=B');
  const shown = await page.evaluate(() => document.getElementById('first-run-launcher')?.classList.contains('visible'));
  await page.evaluate(() => document.querySelector('[data-first-run-choice="explore"]')?.click());
  await sleep(1500);
  await hidePage(page);
  await sleep(2000);
  record('a forced card still works, and no report is sent', shown && beacons.length === 0, `${beacons.length} request(s)`);
  const durable = await page.evaluate((key) => localStorage.getItem(key), FIRST_RUN_STORAGE_KEY);
  record('the card still closes for good', durable === 'suppressed');
  await page.close();
}

async function main() {
  const response = await fetch(`${APP_URL}/`).catch(() => null);
  if (!response?.ok) {
    console.error(`No server at ${APP_URL}`);
    process.exit(2);
  }
  const browser = await puppeteer.launch({
    headless: 'new',
    protocolTimeout: 120000,
    ...(CHROME ? { executablePath: CHROME } : {}),
    args: ['--no-sandbox', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1440,900'],
  });
  try {
    if (OFF) await runOff(browser);
    else await runOn(browser);
  } finally {
    await browser.close();
  }
  const failed = results.filter((entry) => !entry.ok).length;
  console.log(`\n  ${results.length - failed}/${results.length} checks passed\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
