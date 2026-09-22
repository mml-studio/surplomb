#!/usr/bin/env node
/**
 * qa:ai-badge — the « IA » mark on the two surfaces a model speaks through.
 *
 * EU AI Act article 50(1), in force since 2026-08-02: a person interacting
 * with an AI system is told so, at the latest at the first interaction, in a
 * clear and distinguishable way. The globe has two such surfaces — the voice
 * assistant (a synthetic voice) and the HUD's summary line (written by a
 * model) — and src/aiDisclosure.js marks both. What this harness proves is
 * what `npm test` cannot see: that the mark is PAINTED, on every layout.
 *
 *   1. Desktop 1440×900: the mic wears « IA » beside the premium crown and the
 *      two do not touch; the button's description names the assistant.
 *   2. The same with the location panel open — the old `AI AGENT` kicker is
 *      hidden in that state, which is how the audit found it lacking.
 *   3. The HUD summary wears « IA » while its text came from the model, and
 *      not while the local telemetry line stands in for it.
 *   4. A tablet width (820 px), where the dock changes grid once more.
 *   5. A phone (390×844): the mic is the only AI surface left (the HUD is
 *      hidden there), and it keeps its mark next to the crown.
 *   6. English: « AI », and an English description.
 *
 * The crown is only drawn where voice is sold (`data-voice-premium` on
 * <html>, from `/api/trial`). A local preview runs without `GEV_TRIAL_LIMIT`,
 * so the harness sets the mark itself — the hosted state is the crowded one,
 * and the one to check for a collision.
 *
 * Shots are evidence, not checks: `--shots DIR` writes them, `--label` prefixes
 * their names (`before` / `after`), and a capture that fails is skipped.
 *
 * Usage:
 *   npm run build && npx vite preview --port 4391 --strictPort
 *   npm run qa:ai-badge -- --url http://localhost:4391 [--shots DIR] [--label after]
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { newPhoneQaPage, newQaPage, phoneUrl } from './lib/qa-first-run.mjs';

const args = process.argv.slice(2);
const getOpt = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const APP_URL = getOpt('--url', 'http://localhost:4391').replace(/\/$/, '');
const SHOT_DIR = getOpt('--shots', null);
const LABEL = getOpt('--label', 'after');
const GLOBE = `${APP_URL}/globe?welcome=0&photoreal=0`;

/** The mark's letters: the crown's keyline colour, #0e1b16. */
const DARK_INK = 'rgb(14, 27, 22)';

/** A model's five words, as `/api/openai/hud-summary` returns them. */
const MODEL_SUMMARY = 'EIFFEL TOWER SEINE RIVERBANK PARIS';

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok });
  const mark = ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  console.log(`  [${mark}] ${name}${detail === undefined ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
}

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/** Poll with `evaluate`: `waitForFunction` is unreliable on a parked globe. */
async function waitFor(page, check, arg, { timeoutMs = 90_000, everyMs = 500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await page.evaluate(check, arg);
    if (last) return last;
    await sleep(everyMs);
  }
  return last;
}

async function shoot(page, name, clip) {
  if (!SHOT_DIR) return;
  try {
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(SHOT_DIR, `${LABEL}-${name}.png`), ...(clip ? { clip } : {}) });
  } catch (error) {
    console.log(`  [\x1b[33mSKIP\x1b[0m] shot ${name} — ${String(error.message).slice(0, 70)}`);
  }
}

/** A crop around an element, three times over, so a 15 px mark can be read. */
async function cropAround(page, selector, pad) {
  const box = await page.evaluate((sel) => {
    const node = document.querySelector(sel);
    if (!node) return null;
    const r = node.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, selector);
  if (!box) return null;
  const x = Math.max(0, box.x - pad);
  const y = Math.max(0, box.y - pad);
  return { x, y, width: box.width + pad * 2, height: box.height + pad * 2, scale: 3 };
}

async function boot(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  const ready = await waitFor(page, () => Boolean(window.__godsEyeView && document.getElementById('gev-voice-button')));
  // The dock settles its grid after the first frames; the boxes below are
  // read once it has.
  await sleep(2500);
  // The hosted state: the crown is drawn, and the mark must stand beside it.
  await page.evaluate(() => { document.documentElement.dataset.voicePremium = 'trial'; });
  return Boolean(ready);
}

/** Everything the checks need about the mic's mark, in one page pass. */
const readVoiceMark = () => {
  const boxOf = (node) => {
    if (!node) return null;
    const r = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return {
      x: r.x, y: r.y, width: r.width, height: r.height,
      painted: style.display !== 'none' && style.visibility === 'visible' && Number(style.opacity) > 0
        && r.width > 0 && r.height > 0,
    };
  };
  const badge = document.querySelector('#gev-voice-button .gev-ai-badge');
  const crown = document.querySelector('#gev-voice-control .gev-premium-badge');
  const button = document.getElementById('gev-voice-button');
  const describedBy = (button?.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
  const description = describedBy
    .map((id) => document.getElementById(id))
    .map((node) => node?.getAttribute('aria-label') || node?.textContent || '')
    .join(' ');
  // What is actually on top at the mark's centre: the mark itself, or
  // something drawn over it.
  const b = badge?.getBoundingClientRect();
  const top = b ? document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2) : null;
  return {
    text: badge?.textContent?.trim() ?? null,
    title: badge?.getAttribute('title') ?? null,
    ink: badge ? getComputedStyle(badge).color : null,
    badge: boxOf(badge),
    crown: boxOf(crown),
    // On a phone the ? button floats just above the mic.
    help: boxOf(document.getElementById('gev-voice-help-btn')),
    onTop: Boolean(top && badge && (top === badge || badge.contains(top))),
    description,
    said: document.querySelector('[data-role="said"] .gev-voice-transcript-text')?.dataset.aiGenerated ?? null,
    heard: document.querySelector('[data-role="heard"] .gev-voice-transcript-text')?.dataset.aiGenerated ?? null,
    viewport: { width: innerWidth, height: innerHeight },
  };
};

/**
 * Put a model's words on the HUD and keep them there (runs in the page).
 * Without a key the HUD would soon put its local line back, which is right
 * for the product and useless for a picture of the mark.
 */
const stillModelSummary = (summary) => {
  const view = window.__godsEyeView.styleManager.hud;
  const set = view._setSummaryText.bind(view);
  view._setSummaryText = (text, animate, aiGenerated) => {
    if (aiGenerated) set(text, animate, aiGenerated);
  };
  set(summary, false, true);
};

const overlap = (a, b) => Boolean(a && b)
  && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const inside = (box, viewport) => Boolean(box)
  && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height;

function checkVoiceMark(tag, mark, { text, descriptionRe }) {
  record(`[${tag}] the mic wears « ${text} »`, mark.text === text && mark.badge?.painted, { text: mark.text, badge: mark.badge });
  record(`[${tag}] the mark is small, and on screen`,
    Boolean(mark.badge) && mark.badge.height <= 16 && mark.badge.width <= 24 && inside(mark.badge, mark.viewport),
    mark.badge && { w: Math.round(mark.badge.width), h: Math.round(mark.badge.height) });
  record(`[${tag}] nothing is drawn over it`, mark.onTop);
  record(`[${tag}] its letters are dark on the cream pill`, mark.ink === DARK_INK, mark.ink);
  record(`[${tag}] the crown is drawn too, and the two do not touch`,
    Boolean(mark.badge?.painted && mark.crown?.painted) && !overlap(mark.badge, mark.crown),
    { badge: mark.badge, crown: mark.crown });
  if (mark.help?.painted) {
    record(`[${tag}] nor does the ? button`, !overlap(mark.badge, mark.help), { badge: mark.badge, help: mark.help });
  }
  record(`[${tag}] the button's description names the assistant`, descriptionRe.test(mark.description), mark.description);
  record(`[${tag}] its tooltip says the same`, descriptionRe.test(mark.title || ''), mark.title);
}

async function desktop(browser) {
  console.log('\ndesktop 1440×900, French');
  const page = await newQaPage(browser);
  await page.setViewport({ width: 1440, height: 900 });
  record('[desktop] the globe booted', await boot(page, GLOBE));

  const mark = await page.evaluate(readVoiceMark);
  checkVoiceMark('desktop', mark, { text: 'IA', descriptionRe: /intelligence artificielle.*voix de synthèse/i });
  record('[desktop] the assistant’s own words are marked as generated', mark.said === 'true', mark.said);
  record('[desktop] the visitor’s words are not', mark.heard === null, mark.heard);

  // The HUD: the local line first, then a model's five words.
  const hud = await page.evaluate((summary) => {
    const view = window.__godsEyeView.styleManager.hud;
    const read = () => {
      const text = document.getElementById('hud-summary');
      const badge = document.querySelector('.hud-summary-wrap .gev-ai-badge');
      const r = badge?.getBoundingClientRect();
      const style = badge ? getComputedStyle(badge) : null;
      return {
        generated: text?.dataset.aiGenerated ?? null,
        text: badge?.textContent?.trim() ?? null,
        ink: style?.color ?? null,
        pointer: style?.pointerEvents ?? null,
        title: badge?.getAttribute('title') ?? null,
        painted: Boolean(style && style.display !== 'none' && style.visibility === 'visible' && r.width > 0),
        box: r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null,
      };
    };
    view._setSummaryText(view._composeSummary(), false, false);
    const local = read();
    view._setSummaryText(summary, false, true);
    const model = read();
    return { local, model };
  }, MODEL_SUMMARY);
  record('[desktop] the local telemetry line is not marked', hud.local.generated === null && !hud.local.painted, hud.local);
  record('[desktop] the model’s summary is marked data-ai-generated', hud.model.generated === 'true', hud.model.generated);
  record('[desktop] … and wears « IA » beside its label', hud.model.text === 'IA' && hud.model.painted, hud.model);
  // `#intel-hud *` paints every node cream and the HUD takes no pointer: the
  // mark must opt out of both, or it is a blank pill with a tooltip nobody
  // can open.
  record('[desktop] … in dark letters, and its tooltip reachable',
    hud.model.ink === DARK_INK && hud.model.pointer === 'auto', { ink: hud.model.ink, pointer: hud.model.pointer });
  record('[desktop] … whose tooltip names the model’s maker', /intelligence artificielle.*OpenAI/i.test(hud.model.title || ''), hud.model.title);

  // For the shots only: on a server without an OpenAI key the HUD puts its
  // local line back (its 15 s tick, a camera settle, the geoid landing), so
  // every line but a model's is refused before the model's words go up again.
  await page.evaluate(stillModelSummary, MODEL_SUMMARY);
  await shoot(page, 'desktop-1440x900');
  await shoot(page, 'desktop-mic-x3', await cropAround(page, '#gev-voice-control', 16));
  await shoot(page, 'desktop-hud-summary-x3', await cropAround(page, '.hud-summary-wrap', 12));

  // The location panel open: where the `AI AGENT` kicker used to vanish.
  await page.evaluate(() => document.querySelector('[data-collapse-target="location-bar"]')?.click());
  await sleep(1200);
  const opened = await page.evaluate(() => !document.getElementById('location-bar')?.classList.contains('collapsed'));
  record('[desktop, panel open] the location panel opened', opened);
  const panelMark = await page.evaluate(readVoiceMark);
  checkVoiceMark('desktop, panel open', panelMark, { text: 'IA', descriptionRe: /intelligence artificielle/i });
  await shoot(page, 'desktop-panel-open-1440x900');
  await shoot(page, 'desktop-panel-open-mic-x3', await cropAround(page, '#gev-voice-control', 16));
  await page.close();
}

async function tablet(browser) {
  console.log('\ntablet 820×1180, French');
  const page = await newQaPage(browser);
  await page.setViewport({ width: 820, height: 1180 });
  record('[tablet] the globe booted', await boot(page, GLOBE));
  const mark = await page.evaluate(readVoiceMark);
  checkVoiceMark('tablet', mark, { text: 'IA', descriptionRe: /intelligence artificielle/i });
  await page.close();
}

async function phone(browser) {
  console.log('\nphone 390×844, French');
  const page = await newPhoneQaPage(browser);
  record('[phone] the globe booted', await boot(page, phoneUrl(GLOBE)));
  const shell = await page.evaluate(() => document.documentElement.dataset.shell ?? null);
  record('[phone] the phone shell is on', shell === 'phone', shell);
  const mark = await page.evaluate(readVoiceMark);
  checkVoiceMark('phone', mark, { text: 'IA', descriptionRe: /intelligence artificielle/i });
  await shoot(page, 'phone-390x844');
  await shoot(page, 'phone-mic-x3', await cropAround(page, '#gev-voice-button', 14));
  await page.close();
}

async function english(browser) {
  console.log('\ndesktop 1440×900, English');
  const page = await newQaPage(browser, { locale: 'en' });
  await page.setViewport({ width: 1440, height: 900 });
  record('[english] the globe booted', await boot(page, GLOBE));
  const mark = await page.evaluate(readVoiceMark);
  checkVoiceMark('english', mark, { text: 'AI', descriptionRe: /artificial intelligence.*synthetic voice/i });
  await page.evaluate(stillModelSummary, MODEL_SUMMARY);
  const hudTitle = await page.evaluate(() => {
    const badge = document.querySelector('.hud-summary-wrap .gev-ai-badge');
    return { text: badge?.textContent?.trim() ?? null, title: badge?.getAttribute('title') ?? null };
  });
  record('[english] the summary wears « AI », with an English tooltip',
    hudTitle.text === 'AI' && /artificial intelligence/i.test(hudTitle.title || ''), hudTitle);
  await shoot(page, 'english-mic-x3', await cropAround(page, '#gev-voice-control', 16));
  await shoot(page, 'english-hud-summary-x3', await cropAround(page, '.hud-summary-wrap', 12));
  await page.close();
}

const browser = await puppeteer.launch({
  headless: 'new',
  protocolTimeout: 180_000,
  args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=1440,900'],
});
try {
  await desktop(browser);
  await tablet(browser);
  await phone(browser);
  await english(browser);
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\nqa:ai-badge ${results.length - failed.length}/${results.length}`);
process.exit(failed.length ? 1 : 0);
