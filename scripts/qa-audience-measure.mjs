#!/usr/bin/env node
/**
 * qa-audience-measure — what the PostHog audience measurement actually sends,
 * in a real browser.
 *
 * The unit suite proves the configuration and the URL cleaner against fakes.
 * This proves what leaves the browser: every request to PostHog is answered
 * here (CDP `Fetch`), never forwarded, and its gzipped body read. It checks the
 * host, the cleaned URLs, the cookieless id, that nothing is stored, the
 * showcase's hand-off to `/globe`, the page leave, that nothing else is
 * requested, that a refused browser never downloads the SDK, and the address
 * sheet — all for a visitor who has not answered the banner — then the banner
 * itself: « Accepter » turns on clicks, heatmaps and the replay without a
 * script from PostHog, the answer survives a reload, « Refuser » changes
 * nothing. The remote configuration is answered with replay on, as the
 * project's own settings do.
 *
 *   POSTHOG_PROJECT_TOKEN=phc_probe npx vite build --outDir .context/dist-ph
 *   npx vite preview --outDir .context/dist-ph --port 4199 --strictPort
 *   node scripts/qa-audience-measure.mjs --url http://localhost:4199
 *
 * The user agent is set to a desktop Chrome: the SDK drops events from a
 * `HeadlessChrome` agent, which is also why QA runs never reach a real project.
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import puppeteer from 'puppeteer';
import { newQaPage } from './lib/qa-first-run.mjs';
import { FIRST_RUN_OPTOUT_KEY } from '../src/firstRunOptOut.js';
import { ANALYTICS_CONSENT_KEY } from '../src/analyticsConsent.js';

const args = process.argv.slice(2);
const urlFlag = args.indexOf('--url');
const APP = (urlFlag >= 0 && args[urlFlag + 1] ? args[urlFlag + 1] : 'http://localhost:4199').replace(/\/$/, '');
const CHROME = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  (() => { try { return puppeteer.executablePath(); } catch { return null; } })(),
].filter(Boolean).find((candidate) => fs.existsSync(candidate));
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`);
};

function decode(entry) {
  const buf = Buffer.concat((entry.postDataEntries || []).map((e) => Buffer.from(e.bytes || '', 'base64')));
  let text;
  try { text = zlib.gunzipSync(buf).toString('utf8'); } catch { text = buf.toString('utf8'); }
  if (text.startsWith('data=')) text = Buffer.from(decodeURIComponent(text.slice(5)), 'base64').toString('utf8');
  try { return JSON.parse(text); } catch { return { raw: text.slice(0, 200) }; }
}

async function capturePage(browser, { vitrine = false, refuse = false } = {}) {
  const page = await newQaPage(browser, { vitrine });
  await page.setUserAgent(UA);
  if (refuse) {
    await page.evaluateOnNewDocument((key) => localStorage.setItem(key, 'refused'), FIRST_RUN_OPTOUT_KEY);
  }
  const cdp = await page.createCDPSession();
  const hits = [];
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*posthog.com*', requestStage: 'Request' }] });
  cdp.on('Fetch.requestPaused', async (event) => {
    hits.push({ url: event.request.url, method: event.request.method, body: event.request.method === 'POST' ? decode(event.request) : null });
    const config = /\/(flags|decide)\/|\/array\/[^/]+\/config/.test(new URL(event.request.url).pathname);
    await cdp.send('Fetch.fulfillRequest', {
      requestId: event.requestId,
      responseCode: 200,
      responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: APP },
        { name: 'Access-Control-Allow-Credentials', value: 'true' }],
      body: Buffer.from(config ? REMOTE_CONFIG : '{"status":1}').toString('base64'),
    }).catch(() => {});
  });
  return { page, hits };
}

/** What the project answers: replay on (the PostHog project has it on), no flags. */
const REMOTE_CONFIG = JSON.stringify({
  sessionRecording: { endpoint: '/s/' }, supportedCompression: ['gzip', 'gzip-js'], autocapture_opt_out: false,
  heatmaps: true, capturePerformance: false, featureFlags: {}, featureFlagPayloads: {}, errorsWhileComputingFlags: false,
});
const isCapture = (h) => /^\/(e|i\/v0\/e|batch|capture|s)\/?$/.test(new URL(h.url).pathname);
const isConfig = (h) => /\/(flags|decide)\/|\/array\/[^/]+\/config/.test(new URL(h.url).pathname);
const storageOf = (page) => page.evaluate(() => ({ cookie: document.cookie, local: Object.keys(localStorage), session: Object.keys(sessionStorage) }));
const hasPosthogKeys = (st) => /ph_|posthog/i.test(st.cookie) || [...st.local, ...st.session].some((k) => /ph_|posthog/i.test(k));
/** The banner, only if a visitor can actually see it (a stylesheet once hid it at 0×0). */
const banner = async (page) => {
  const el = await page.$('.gev-consent');
  return el && (await el.boundingBox()) ? el : null;
};
/**
 * A real click on a visible button of the page (not the banner's): autocapture
 * records buttons, not the globe's canvas. Buttons only: a link (the logo) would
 * leave the page and take the queued events with it.
 */
async function clickAButton(page) {
  for (const handle of await page.$$('button, [role="button"]')) {
    const ok = await handle.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return !el.closest('.gev-consent') && r.width > 8 && r.height > 8 && r.top >= 0 && r.bottom <= innerHeight
        && getComputedStyle(el).visibility !== 'hidden' && !el.disabled && !el.closest('a[href], form');
    });
    if (!ok) continue;
    try { await handle.click(); return await handle.evaluate((el) => el.textContent.trim().slice(0, 40) || el.getAttribute('aria-label') || el.tagName); } catch { /* covered: next */ }
  }
  return null;
}

const events = (hits) => hits.flatMap((h) => {
  const b = h.body;
  if (!b) return [];
  if (Array.isArray(b)) return b;
  if (Array.isArray(b.batch)) return b.batch;
  return [b];
});

const reachable = await fetch(`${APP}/`).catch(() => null);
if (!reachable?.ok) {
  console.error(`No server at ${APP}`);
  process.exit(2);
}
const browser = await puppeteer.launch({
  headless: 'new',
  ...(CHROME ? { executablePath: CHROME } : {}),
  args: ['--no-sandbox', '--window-size=1440,900', '--disable-blink-features=AutomationControlled'],
});
try {
  // A. Showcase with a campaign link, then « Ouvrir le globe », then leave.
  console.log('A. / → /globe');
  {
    const { page, hits } = await capturePage(browser, { vitrine: true });
    await page.goto(`${APP}/?utm_source=probe&utm_campaign=x&gclid=secret#v=2&lat=48.1`, { waitUntil: 'load' });
    await sleep(4000);
    check('the banner asks', Boolean(await banner(page)));
    const before = events(hits).filter((e) => e.event === '$pageview');
    check('a page view reaches eu.i.posthog.com; the configuration comes from PostHog EU too', before.length === 1
      && hits.filter(isCapture).every((h) => h.url.startsWith('https://eu.i.posthog.com/'))
      && hits.every((h) => /^https:\/\/eu(-assets)?\.i\.posthog\.com\//.test(h.url)),
      `${before.length} pageview(s); hosts ${[...new Set(hits.map((h) => new URL(h.url).host))].join(',')}`);
    const pv = before[0]?.properties || {};
    check('URL keeps utm_*, loses gclid and the hash', pv.$current_url === `${APP}/?utm_source=probe&utm_campaign=x`, pv.$current_url);
    check('distinct id is the cookieless sentinel', before[0]?.properties?.distinct_id === '$posthog_cookieless' || before[0]?.distinct_id === '$posthog_cookieless',
      String(before[0]?.properties?.distinct_id ?? before[0]?.distinct_id));
    check('no title property', !('title' in pv));
    const storage = await page.evaluate(() => ({
      cookie: document.cookie,
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
    }));
    const phKeys = [...storage.local, ...storage.session].filter((k) => /ph_|posthog/i.test(k));
    check('nothing PostHog in cookies, localStorage or sessionStorage', !/ph_|posthog/i.test(storage.cookie) && phKeys.length === 0,
      JSON.stringify({ cookie: storage.cookie, phKeys }));
    await page.evaluate(() => {
      const input = document.querySelector('#vitrine input[name="q"]');
      if (input) input.value = '12 rue de la Paix Paris';
      document.querySelector('#vitrine button.primary[type="submit"]')?.click();
    });
    await sleep(6000);
    const path = await page.evaluate(() => location.pathname + location.search);
    const after = events(hits).filter((e) => e.event === '$pageview');
    const globe = after.find((e) => e.properties?.$pathname === '/globe');
    check('handing over to the globe is a second page view', after.length === 2 && Boolean(globe), `${after.length} pageviews; address now ${path}`);
    check('the globe page view carries no typed address', globe && !/rue de|Paix|[?&]q=/.test(JSON.stringify(globe.properties)), globe?.properties?.$current_url);
    // A real unload's beacon leaves after CDP has let go of the page; the same
    // handler fired on the live page shows what it sends.
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false })));
    await sleep(2500);
    const leave = events(hits).find((e) => e.event === '$pageleave');
    check('leaving sends a page leave', Boolean(leave), leave ? Object.keys(leave.properties).filter((k) => k.startsWith('$prev_pageview')).join(',') : 'none');
    const kinds = [...new Set(events(hits).map((e) => e.event))];
    check('only $pageview and $pageleave are sent', kinds.every((k) => k === '$pageview' || k === '$pageleave'), kinds.join(','));
    const other = hits.filter((h) => !isCapture(h) && !isConfig(h));
    check('besides events, only the remote configuration: no script, no flags', other.length === 0 && hits.filter(isConfig).every((h) => !/\.js$/.test(new URL(h.url).pathname)),
      other.map((h) => `${h.method} ${new URL(h.url).pathname}`).join(' '));
    await page.close();
  }

  // B. A refused browser sends nothing and fetches no SDK chunk.
  console.log('B. refused');
  {
    const { page, hits } = await capturePage(browser, { vitrine: true, refuse: true });
    const chunks = [];
    page.on('request', (r) => { if (/audienceMeasure|module\.(slim|no-external)|posthog-recorder/.test(r.url())) chunks.push(r.url()); });
    await page.goto(`${APP}/`, { waitUntil: 'load' });
    await sleep(4000);
    check('a refused browser sends nothing', hits.length === 0, `${hits.length} request(s)`);
    check('and never downloads the SDK', !chunks.some((u) => /module\.(slim|no-external)|posthog-recorder/.test(u)), chunks.map((u) => u.split('/').pop()).join(','));
    check('nor sees the banner', !(await banner(page)));
    await page.close();
  }

  // C. The address sheet with a typed address.
  console.log('C. fiche');
  {
    const { page, hits } = await capturePage(browser);
    // B's refusal is still in this profile's localStorage: withdraw it.
    await page.evaluateOnNewDocument((key) => localStorage.removeItem(key), FIRST_RUN_OPTOUT_KEY);
    await page.goto(`${APP}/fiche.html?q=${encodeURIComponent('12 rue de la Paix Paris')}`, { waitUntil: 'load' });
    await sleep(8000);
    const pv = events(hits).find((e) => e.event === '$pageview');
    check('the sheet is counted, without its address', pv && pv.properties.$current_url === `${APP}/fiche.html` && !/Paix/.test(JSON.stringify(pv.properties)),
      `${pv?.properties?.$current_url} (${hits.length} request(s))`);
    await page.close();
  }

  // D. « Accepter » on the globe: clicks, heatmaps, the replay, a stored id — no script from PostHog.
  console.log('D. accept');
  const context = await browser.createBrowserContext();
  {
    const { page, hits } = await capturePage(context);
    const chunks = [];
    page.on('request', (r) => { if (/posthog-recorder|dead-clicks/.test(r.url())) chunks.push(r.url()); });
    await page.goto(`${APP}/globe?welcome=0&photoreal=0&q=Lyon`, { waitUntil: 'load' });
    await sleep(5000);
    check('no recorder before the answer', chunks.length === 0, chunks.join(','));
    await page.click('.gev-consent [data-consent="accept"]');
    await sleep(2000);
    const clicked = await clickAButton(page);
    await sleep(400);
    await page.mouse.click(720, 450);
    // The replay flushes its first batch a few seconds after it starts: 8 s on surplomb.app.
    await sleep(12000);
    console.log(`    (clicked « ${clicked} »)`);
    const kinds = [...new Set(events(hits).map((e) => e.event))];
    check('the banner closes', !(await banner(page)));
    check('the answer itself is recorded', kinds.includes('analytics_consent_granted'), kinds.join(','));
    check('clicks are recorded ($autocapture)', kinds.includes('$autocapture'), kinds.join(','));
    check('the replay is recorded', kinds.includes('$snapshot') || hits.some((h) => new URL(h.url).pathname.startsWith('/s')), kinds.join(','));
    check('the recorder came from this site', chunks.length > 0 && chunks.every((u) => u.startsWith(APP)), chunks.map((u) => u.split('/').pop()).join(','));
    check('no script from PostHog', !hits.some((h) => /\.js($|\?)/.test(new URL(h.url).pathname)));
    const st = await storageOf(page);
    check('the answer and a PostHog id are kept', st.local.includes(ANALYTICS_CONSENT_KEY) && hasPosthogKeys(st), st.local.join(','));
    const granted = events(hits).find((e) => e.event === 'analytics_consent_granted');
    check('with consent the URL keeps its query', /[?&]welcome=0/.test(granted?.properties?.$current_url ?? ''), granted?.properties?.$current_url);
    await page.close();
  }
  // E. The next visit: no banner, detailed from the first page view, no second consent event.
  console.log('E. reload with consent');
  {
    const { page, hits } = await capturePage(context);
    await page.goto(`${APP}/globe?welcome=0&photoreal=0`, { waitUntil: 'load' });
    await sleep(5000);
    await clickAButton(page);
    await sleep(5000);
    const kinds = [...new Set(events(hits).map((e) => e.event))];
    check('no banner', !(await banner(page)));
    check('clicks recorded from the start', kinds.includes('$autocapture'), kinds.join(','));
    check('no second consent event', !kinds.includes('analytics_consent_granted'));
    const ids = new Set(events(hits).map((e) => e.properties?.distinct_id ?? e.distinct_id).filter(Boolean));
    check('a stored id, not the cookieless one', ids.size >= 1 && !ids.has('$posthog_cookieless'), [...ids].join(','));
    await page.close();
  }
  await context.close();

  // F. « Refuser »: nothing changes, and the question is not asked again.
  console.log('F. refuse');
  const refusing = await browser.createBrowserContext();
  {
    const { page, hits } = await capturePage(refusing);
    await page.goto(`${APP}/globe?welcome=0&photoreal=0`, { waitUntil: 'load' });
    await sleep(4000);
    await page.click('.gev-consent [data-consent="refuse"]');
    await clickAButton(page);
    await sleep(4000);
    const kinds = [...new Set(events(hits).map((e) => e.event))];
    check('page views only', kinds.every((k) => k === '$pageview' || k === '$pageleave'), kinds.join(','));
    const st = await storageOf(page);
    check('only the answer is kept', st.local.includes(ANALYTICS_CONSENT_KEY) && !hasPosthogKeys(st), JSON.stringify(st));
    await page.close();
    const again = await capturePage(refusing);
    await again.page.goto(`${APP}/globe?welcome=0&photoreal=0`, { waitUntil: 'load' });
    await sleep(3000);
    check('not asked again', !(await banner(again.page)));
    await again.page.close();
  }
  await refusing.close();
} finally {
  await browser.close();
}
const failed = results.filter((ok) => !ok).length;
console.log(failed ? `${failed} FAILED` : 'ALL PASS');
process.exit(failed ? 1 : 0);
