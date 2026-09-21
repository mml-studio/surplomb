#!/usr/bin/env node
/**
 * qa:landing — the showcase at `/`, and its door to the globe at `/globe`.
 *
 * The acceptance list of docs/designs/landing/PLAN-EXECUTION.md § 4, adapted to
 * the recorded-loop background decided on 2026-09-17 (no engine behind the
 * page; the globe boots under a frozen frame on « Ouvrir le globe »).
 *
 * One fresh page per case (a first visitor is a browser with nothing stored),
 * the installed Chrome rather than Chrome for Testing, and every wait is a
 * `page.evaluate` poll — see scripts/lib/qa-first-run.mjs for why.
 *
 * Usage:
 *   node scripts/qa-landing.mjs --url http://127.0.0.1:4291 [--only rotation,dock] [--shots]
 *
 * Byte budgets (case `weight`) are only asserted against a BUILD (`vite
 * preview`): the dev server ships unbundled modules and says nothing about
 * what a visitor downloads.
 */
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { newPhoneQaPage, newQaPage, phoneUrl } from './lib/qa-first-run.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(name);
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback;
};
const BASE = option('--url', 'http://127.0.0.1:4173').replace(/\/$/, '');
const ONLY = new Set(String(option('--only', '')).split(',').filter(Boolean));
const SHOTS = args.includes('--shots');
const SHOT_DIR = path.join(ROOT, '.context', 'qa-landing');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail });
  const mark = ok ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  console.log(`  ${mark} ${name}${detail ? ` \x1b[2m— ${detail}\x1b[0m` : ''}`);
}

/** Poll a page predicate without trusting rAF. */
async function waitFor(page, fn, { timeout = 30_000, interval = 150, arg } = {}) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeout) {
    last = await page.evaluate(fn, arg).catch((error) => ({ __error: error.message }));
    if (last && !last.__error) return last;
    await sleep(interval);
  }
  return last && !last.__error ? last : null;
}

async function shot(page, name) {
  if (!SHOTS) return;
  mkdirSync(SHOT_DIR, { recursive: true });
  await Promise.race([
    page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`) }),
    sleep(30_000).then(() => { throw new Error('screenshot timeout'); }),
  ]).catch((error) => console.log(`  \x1b[2m   SKIP shot ${name}: ${error.message}\x1b[0m`));
}

/** Everything a case wants to know about the requests a page made. */
function watchRequests(page) {
  const log = [];
  page.on('request', (request) => log.push({ url: request.url(), at: Date.now() }));
  return log;
}

const ENGINE_RE = /\/(?:src\/main\.js|src\/ui\.js|node_modules\/\.vite\/deps\/cesium\.js|assets\/(?:cesium-engine|main)-[^/]*\.js|cesium-[\d.]+\/(?:Cesium\.js|Workers\/))/;
const ION_RE = /api\.cesium\.com|assets\.ion\.cesium\.com|tile\.googleapis\.com/;
/** A gallery loop (src/vitrine/galleryLoops.js): six views and the voice answer. */
const GALLERY_LOOP_RE = /\/landing\/(?:view-\d\d|voice-bus)-\d+-(?:av1|hevc|h264)\.[0-9a-f]{8}\.mp4/;

let browser;
/**
 * A page in its OWN browser context: a first visitor has nothing stored, and
 * pages of one context share `localStorage` — one case that opens the globe
 * would turn every later case into a returning reader.
 */
async function freshPage({ phone = false, vitrine = true, reducedMotion = false, javascript = true, viewport } = {}) {
  const context = await browser.createBrowserContext();
  const page = phone
    ? await newPhoneQaPage(context, { vitrine })
    : await newQaPage(context, { vitrine });
  const close = page.close.bind(page);
  page.close = async () => { await close().catch(() => {}); await context.close().catch(() => {}); };
  if (!phone) await page.setViewport(viewport || { width: 1440, height: 900, deviceScaleFactor: 1 });
  if (reducedMotion) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  if (!javascript) await page.setJavaScriptEnabled(false);
  page.setDefaultTimeout(60_000);
  return page;
}

const CASES = {
  async desktop() {
    const page = await freshPage();
    const requests = watchRequests(page);
    await page.goto(`${BASE}/`, { waitUntil: 'load', timeout: 90_000 });
    const loadedAt = Date.now();
    const state = await page.evaluate(() => {
      const visible = (el) => Boolean(el) && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0;
      return {
        attr: document.documentElement.getAttribute('data-vitrine'),
        vitrine: visible(document.getElementById('vitrine')),
        chrome: ['title-bar', 'loading-screen', 'command-dock', 'data-panel', 'cesiumContainer']
          .filter((id) => visible(document.getElementById(id))),
        viewer: Boolean(window.__godsEyeView),
        scrollHeight: document.documentElement.scrollHeight,
        title: document.title,
      };
    });
    check('desktop: the bare root is the showcase', state.attr === '' && state.vitrine, JSON.stringify({ attr: state.attr }));
    check('desktop: no cockpit surface is visible', state.chrome.length === 0, state.chrome.join(', '));
    check('desktop: no Viewer is built for a reader', !state.viewer);
    check('desktop: the page is long enough to scroll', state.scrollHeight > 4000, `${state.scrollHeight} px`);
    check('desktop: the title is the showcase\'s', state.title === 'Surplomb — La France au rayon X.', state.title);
    const early = requests.filter((r) => r.at <= loadedAt && ENGINE_RE.test(r.url));
    check('desktop: no engine byte before the page has loaded', early.length === 0, early.map((r) => r.url).slice(0, 3).join(' '));
    await page.evaluate(() => window.scrollTo({ top: 1500, behavior: 'instant' }));
    await sleep(300);
    check('desktop: the page scrolls', (await page.evaluate(() => window.scrollY)) > 1000);
    const loop = await waitFor(page, () => {
      const s = document.getElementById('vitrine')?.dataset.state;
      return s && s !== 'poster' ? s : null;
    }, { timeout: 12_000 });
    const rendition = await page.evaluate(() => window.__gevVitrine?.getDiagnostics().loop.rendition ?? null);
    const hasLoop = Boolean(rendition);
    check('desktop: the loop leaves the poster state within 12 s', Boolean(loop), `state=${loop}`);
    if (loop === 'live') {
      const t1 = await page.evaluate(() => document.querySelector('#vitrine .world-video').currentTime);
      await sleep(1500);
      const t2 = await page.evaluate(() => document.querySelector('#vitrine .world-video').currentTime);
      check('desktop: the background moves (the loop plays)', t2 > t1, `${t1.toFixed(2)} → ${t2.toFixed(2)} s`);
      const played = await page.evaluate(() => window.__gevVitrine.getDiagnostics().loop.rendition);
      check('desktop: a rendition wide enough for this screen', played && played.width >= played.needed * 0.9,
        JSON.stringify(played));
    } else {
      check('desktop: the background moves (the loop plays)', false, `state ${loop}, loop wired: ${hasLoop}`);
    }
    await sleep(3000);
    const ion = requests.filter((r) => ION_RE.test(r.url));
    check('desktop: reading the showcase costs no ion session', ion.length === 0, ion.map((r) => r.url).slice(0, 2).join(' '));
    await shot(page, 'desktop-scrolled');
    await page.close();
  },

  async share() {
    const page = await freshPage();
    await page.goto(`${BASE}/#v=2&lat=45.7640&lon=4.8357&alt=1200&heading=0&pitch=-55&l=dv.cd`, { waitUntil: 'domcontentloaded' });
    const viewer = await waitFor(page, () => Boolean(window.__godsEyeView?.viewer), { timeout: 90_000 });
    const state = await page.evaluate(() => ({
      attr: document.documentElement.hasAttribute('data-vitrine'),
      vitrine: getComputedStyle(document.getElementById('vitrine')).display,
      seen: localStorage.getItem('gev:vitrine-seen:v1'),
    }));
    check('share link: the cockpit, direct', Boolean(viewer) && !state.attr && state.vitrine === 'none', JSON.stringify(state));
    check('share link: nothing is written down — `/` stays the home page', state.seen === null, String(state.seen));
    await page.close();
  },

  async phone() {
    const page = await freshPage({ phone: true });
    const requests = watchRequests(page);
    await page.goto(phoneUrl(`${BASE}/`), { waitUntil: 'load', timeout: 90_000 });
    await sleep(4000);
    const engine = requests.filter((r) => ENGINE_RE.test(r.url));
    const shell = await page.evaluate(() => ({
      attr: document.documentElement.getAttribute('data-vitrine'),
      shell: document.documentElement.getAttribute('data-shell'),
      world: getComputedStyle(document.querySelector('#vitrine .world')).position,
    }));
    check('phone: the showcase, in the phone shell', shell.attr === '' && shell.shell === 'phone', JSON.stringify(shell));
    // Maquette 2 bis: the picture is fixed behind the whole page on a phone too.
    check('phone: the picture stays behind the whole page', shell.world === 'fixed', shell.world);
    check('phone: not one engine request while reading', engine.length === 0, engine.map((r) => r.url).slice(0, 3).join(' '));
    await shot(page, 'phone-top');
    await page.evaluate(() => document.querySelector('#vitrine form.dock').requestSubmit());
    const viewer = await waitFor(page, () => Boolean(window.__godsEyeView?.viewer), { timeout: 90_000 });
    const after = await page.evaluate(() => ({
      attr: document.documentElement.hasAttribute('data-vitrine'),
      vitrine: Boolean(document.getElementById('vitrine')),
      seen: localStorage.getItem('gev:vitrine-seen:v1'),
      firstRun: sessionStorage.getItem('gev:first-run-mission-session:v1'),
    }));
    check('phone: « Ouvrir le globe » boots the cockpit', Boolean(viewer) && !after.attr && !after.vitrine, JSON.stringify(after));
    check('phone: opening spares the reader the first-run card, and remembers nothing',
      after.firstRun === 'dismissed' && after.seen === null, JSON.stringify(after));
    await page.close();
  },

  async retour() {
    // The way back. Before #260 a browser that had once opened the globe could
    // never reach the home page again, whatever address it typed: a stored flag
    // outranked `/`. Open the globe for real, then go back to `/` in the SAME
    // browser — same `localStorage`, same cookies — and read the home page.
    const page = await freshPage();
    await page.goto(`${BASE}/`, { waitUntil: 'load', timeout: 90_000 });
    await waitFor(page, () => (window.__gevVitrine ? true : null));
    await page.evaluate(() => document.querySelector('#vitrine form.dock').requestSubmit());
    const viewer = await waitFor(page, () => Boolean(window.__godsEyeView?.viewer), { timeout: 90_000 });
    const opened = await page.evaluate(() => location.pathname);
    check('retour: the globe was really opened first', Boolean(viewer) && opened === '/globe', opened);

    await page.goto(`${BASE}/`, { waitUntil: 'load', timeout: 90_000 });
    const back = await page.evaluate(() => ({
      attr: document.documentElement.getAttribute('data-vitrine'),
      vitrine: Boolean(document.getElementById('vitrine')
        && getComputedStyle(document.getElementById('vitrine')).display !== 'none'),
      viewer: Boolean(window.__godsEyeView),
      stale: localStorage.getItem('gev:vitrine-seen:v1'),
    }));
    check('retour: `/` is the home page again, after the globe has been opened',
      back.attr === '' && back.vitrine && !back.viewer, JSON.stringify(back));
    check('retour: the retired « already seen » key is not left behind', back.stale === null, String(back.stale));

    // And a browser carrying the old key from #257/#258 is not stuck either.
    const legacy = await freshPage();
    await legacy.evaluateOnNewDocument(() => { localStorage.setItem('gev:vitrine-seen:v1', '1'); });
    await legacy.goto(`${BASE}/`, { waitUntil: 'load', timeout: 90_000 });
    const migrated = await legacy.evaluate(() => ({
      attr: document.documentElement.getAttribute('data-vitrine'),
      stale: localStorage.getItem('gev:vitrine-seen:v1'),
    }));
    check('retour: a browser carrying the old flag gets the home page, and the flag is cleared',
      migrated.attr === '' && migrated.stale === null, JSON.stringify(migrated));
    await legacy.close();
    await page.close();
  },

  async query() {
    const page = await freshPage();
    await page.goto(`${BASE}/?q=Lyon`, { waitUntil: 'domcontentloaded' });
    await waitFor(page, () => Boolean(window.__godsEyeView?.viewer), { timeout: 90_000 });
    const near = await waitFor(page, () => {
      const c = window.__godsEyeView.viewer.camera.positionCartographic;
      const lat = c.latitude * 180 / Math.PI;
      const lon = c.longitude * 180 / Math.PI;
      const dy = (lat - 45.764) * 111_320;
      const dx = (lon - 4.8357) * 111_320 * Math.cos(45.764 * Math.PI / 180);
      const km = Math.hypot(dx, dy) / 1000;
      return km < 5 && c.height < 60_000 ? { km: +km.toFixed(2), height: Math.round(c.height) } : null;
    }, { timeout: 45_000 });
    check('?q=Lyon: the camera lands within 5 km of Lyon', Boolean(near), JSON.stringify(near));
    const search = await page.evaluate(() => location.search);
    check('?q=Lyon: the query is gone from the address', !/[?&]q=/.test(search), search || '(empty)');
    await page.close();
  },

  async dock() {
    const page = await freshPage();
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    await waitFor(page, () => window.__gevVitrine ? true : null);
    const measure = () => {
      const rect = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const shown = cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.05 && r.width > 1 && r.height > 1;
        return { x: r.x, y: r.y, w: r.width, h: r.height, shown };
      };
      return {
        dock: rect(document.querySelector('#vitrine .dock')),
        field: rect(document.querySelector('#vitrine .dock .field')),
        note: rect(document.querySelector('#vitrine .dock .note')),
        button: rect(document.querySelector('#vitrine .dock .primary')),
        top: rect(document.querySelector('#vitrine .top')),
      };
    };
    const rest = await page.evaluate(measure);
    check('dock at rest: field, button and note', rest.field.shown && rest.button.shown && rest.note.shown);
    await page.evaluate(() => window.scrollTo({ top: 400, behavior: 'instant' }));
    await sleep(400);
    const folded = await page.evaluate(measure);
    check('dock after 400 px: the button alone', !folded.field.shown && !folded.note.shown && folded.button.shown,
      JSON.stringify({ field: folded.field.shown, note: folded.note.shown }));
    const inside = folded.dock.x >= folded.top.x && folded.dock.y >= folded.top.y
      && folded.dock.x + folded.dock.w <= folded.top.x + folded.top.w + 0.5
      && folded.dock.y + folded.dock.h <= folded.top.y + folded.top.h + 0.5;
    check('dock after 400 px: the folded button sits inside the header band', inside,
      `dock ${Math.round(folded.dock.x)},${Math.round(folded.dock.y)} ${Math.round(folded.dock.w)}×${Math.round(folded.dock.h)}`);
    check('dock after 400 px: 213 px wide', Math.abs(folded.dock.w - 213) < 1, `${folded.dock.w}`);
    // Typing keeps the field open whatever the scroll.
    // A real focus: `element.focus()` in a background tab sets activeElement
    // without `:focus` matching, which is not what a reader does.
    // Back to the top first, and let the scroll timeline catch up: a field
    // that is still `visibility: hidden` refuses focus without a word.
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await waitFor(page, () => getComputedStyle(document.querySelector('#vitrine .dock .field')).visibility === 'visible' || null, { timeout: 5000 });
    await page.bringToFront();
    await page.focus('#vitrine-place');
    const focused = await page.evaluate(() => document.activeElement?.id === 'vitrine-place');
    check('dock: the field takes focus', focused);
    await page.evaluate(() => window.scrollTo({ top: 900, behavior: 'instant' }));
    await sleep(400);
    const typing = await page.evaluate(measure);
    check('dock: never folded while the field has focus', typing.field.shown, JSON.stringify(typing.field));
    await page.close();
  },

  async covered() {
    // PLAN § 3.8 / criterion 14: nothing fixed may sit over the content.
    const page = await freshPage();
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    await waitFor(page, () => window.__gevVitrine ? true : null);
    const failures = [];
    for (const y of [0, 200, 400, 800, 1200, 1800, 2600, 3400]) {
      await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), y);
      await sleep(250);
      const report = await page.evaluate(() => {
        const allowed = new Set(['world', 'world-credit', 'dock', 'skip']);
        const fixed = [...document.querySelectorAll('#vitrine *')].filter((el) => {
          const cs = getComputedStyle(el);
          return cs.position === 'fixed' && cs.display !== 'none' && cs.visibility !== 'hidden';
        });
        const strays = fixed.filter((el) => ![...el.classList].some((c) => allowed.has(c))).map((el) => el.className);
        const dock = document.querySelector('#vitrine .dock').getBoundingClientRect();
        const band = document.querySelector('#vitrine .top').getBoundingClientRect();
        // Folded inside the opaque band, the button can only overlap what is
        // already scrolled under that band.
        const inBand = dock.top >= band.top - 0.5 && dock.bottom <= band.bottom + 0.5;
        const hit = (r) => !inBand && r.width > 0 && r.height > 0 && r.left < dock.right && r.right > dock.left && r.top < dock.bottom && r.bottom > dock.top;
        const content = [...document.querySelectorAll('#vitrine .examples li[data-active] a, #vitrine .example-controls, #vitrine .panel h2, #vitrine .view, #vitrine .footer-links a')]
          .filter((el) => hit(el.getBoundingClientRect()))
          .map((el) => el.className || el.tagName);
        return { strays, content, scrollY: Math.round(window.scrollY) };
      });
      if (report.strays.length) failures.push(`${y}: fixed ${report.strays.join(',')}`);
      // At rest the full dock is part of the first screen, over the picture;
      // from the fold onward it must never touch a panel.
      if (y >= 360 && report.content.length) failures.push(`${y}: dock over ${report.content.join(',')}`);
    }
    check('nothing fixed covers the content, at eight scroll depths', failures.length === 0, failures.slice(0, 4).join(' | '));
    await page.close();
  },

  async rotation() {
    const page = await freshPage();
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    await waitFor(page, () => window.__gevVitrine ? true : null);
    await page.evaluate(() => {
      window.__swaps = [];
      window.__swapping = [];
      const list = document.querySelector('#vitrine .examples');
      new MutationObserver(() => {
        const active = list.querySelector('li[data-active]');
        const text = active?.textContent.trim();
        const last = window.__swaps.at(-1);
        if (text && text !== last?.text) window.__swaps.push({ text, at: performance.now() });
        window.__swapping.push({ on: list.hasAttribute('data-swapping'), at: performance.now() });
      }).observe(list, { subtree: true, attributes: true, attributeFilter: ['data-active', 'data-swapping'] });
    });
    const fuse = [];
    for (let i = 0; i < 2; i += 1) {
      fuse.push(await page.evaluate(() => document.querySelector('#vitrine .examples-progress > span').getBoundingClientRect().width));
      await sleep(1000);
    }
    const index1 = await page.evaluate(() => document.querySelector('[data-examples-index]').textContent);
    await sleep(10_500);
    const data = await page.evaluate(() => ({
      swaps: window.__swaps,
      swapping: window.__swapping,
      index: document.querySelector('[data-examples-index]').textContent,
      texts: [...document.querySelectorAll('#vitrine .examples li')].filter((li) => !li.hasAttribute('data-pending')).length,
      permisShown: [...document.querySelectorAll('#vitrine .examples li[data-pending]')].some((li) => li.hasAttribute('data-active')),
      diag: window.__gevVitrine.rotation.getDiagnostics(),
    }));
    const gaps = data.swaps.slice(1).map((s, i) => s.at - data.swaps[i].at);
    check('rotation: one example every 3 s ± 0.2', gaps.length >= 2 && gaps.every((g) => Math.abs(g - 3000) <= 200),
      gaps.map((g) => Math.round(g)).join(', '));
    check('rotation: 7 examples, « permis » never shown', data.diag.count === 7 && data.texts === 7 && !data.permisShown);
    check('rotation: the fuse fills between two readings 1 s apart', fuse[1] > fuse[0] + 20, fuse.map((w) => Math.round(w)).join(' → '));
    check('rotation: the index counts', /^1 \/ 7$/.test(index1) && /^\d \/ 7$/.test(data.index) && data.index !== index1,
      `${index1} → ${data.index}`);
    const ons = data.swapping.filter((s) => s.on).map((s) => s.at);
    const offs = data.swapping.filter((s) => !s.on).map((s) => s.at);
    const spans = ons.map((on) => (offs.find((off) => off > on) ?? Infinity) - on).filter(Number.isFinite);
    check('rotation: each change is animated for ~350 ms', spans.length > 0 && spans.every((d) => d > 250 && d < 600),
      spans.map((d) => Math.round(d)).join(', '));
    await page.close();

    const reduced = await freshPage({ reducedMotion: true });
    await reduced.goto(`${BASE}/`, { waitUntil: 'load' });
    await waitFor(reduced, () => window.__gevVitrine ? true : null);
    const paused = await reduced.evaluate(() => ({
      label: document.querySelector('[data-examples-pause]').textContent,
      state: document.getElementById('vitrine').dataset.state,
    }));
    await sleep(3500);
    const stillFirst = await reduced.evaluate(() => window.__gevVitrine.rotation.getDiagnostics().index === 0);
    check('reduced motion: starts paused, on « Reprendre »', paused.label === 'Reprendre' && stillFirst);
    check('reduced motion: the poster, no loop', paused.state === 'fallback', paused.state);
    await reduced.close();
  },

  async counters() {
    // Criterion 8, through the real path: the page asks `/api/pulse` once,
    // after `load`, and reveals only what the answer backs. The answers are
    // served by interception so each rule is exercised whatever the server
    // happens to hold; the server's own answer is checked apart (`pulse`).
    const AT = new Date().toISOString();
    const answers = {
      empty: { status: 200, body: { at: AT, maxAgeMs: 600000, avions: null, navires: null, bus: null, meteo: null, why: {} } },
      error: { status: 503, body: { error: 'down' } },
      mixed: {
        status: 200,
        body: {
          at: AT,
          maxAgeMs: 600000,
          avions: { value: 0, at: AT },
          navires: { value: 1234, at: AT },
          bus: null,
          meteo: { value: 190, at: '2026-09-08T21:00:00.000Z' },
          why: { bus: 'partial' },
        },
      },
    };
    const openWith = async (answer) => {
      const page = await freshPage();
      const asked = [];
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        if (new URL(request.url()).pathname !== '/api/pulse') { request.continue().catch(() => {}); return; }
        asked.push(Date.now());
        request.respond({
          status: answer.status,
          contentType: 'application/json',
          body: JSON.stringify(answer.body),
        }).catch(() => {});
      });
      await page.goto(`${BASE}/`, { waitUntil: 'load', timeout: 90_000 });
      const settledState = await waitFor(page, () => {
        const phase = window.__gevVitrine?.getDiagnostics().counters?.phase;
        return phase && phase !== 'waiting' && phase !== 'loading' ? phase : null;
      }, { timeout: 20_000 });
      return { page, asked, phase: settledState };
    };
    const read = (page) => page.evaluate(() => {
      const panel = document.querySelector('#vitrine .counter-panel');
      const shown = (el) => Boolean(el) && getComputedStyle(el).display !== 'none';
      return {
        group: shown(panel),
        entries: [...panel.querySelectorAll('.counter')].map((counter) => ({
          key: counter.querySelector('[data-live]').getAttribute('data-live').slice('counter:'.length),
          shown: shown(counter),
          value: counter.getAttribute('data-value'),
          text: counter.querySelector('dd').textContent,
        })),
      };
    });

    {
      const { page, asked, phase } = await openWith(answers.empty);
      const state = await read(page);
      check('counters: one request to /api/pulse', asked.length === 1, `${asked.length} request(s), phase ${phase}`);
      check('counters: the group stays hidden when no figure is backed',
        phase === 'done' && !state.group && state.entries.every((entry) => !entry.shown), JSON.stringify(state));
      await page.close();
    }
    {
      const { page, phase } = await openWith(answers.error);
      const state = await read(page);
      check('counters: an error answer leaves the group hidden, silently',
        phase === 'failed' && !state.group, JSON.stringify({ phase, group: state.group }));
      await page.close();
    }
    {
      const { page, phase } = await openWith(answers.mixed);
      const state = await read(page);
      const byKey = Object.fromEntries(state.entries.map((entry) => [entry.key, entry]));
      check('counters: a zero never shows', !byKey.avions.shown && byKey.avions.value === '', JSON.stringify(byKey.avions));
      check('counters: a positive value shows, formatted in French',
        byKey.navires.shown && byKey.navires.value === '1234' && byKey.navires.text === '1\u202f234',
        JSON.stringify(byKey.navires));
      check('counters: a figure older than ten minutes never shows', !byKey.meteo.shown, JSON.stringify(byKey.meteo));
      check('counters: the group shows once one figure is backed', phase === 'done' && state.group);
      // The stylesheet's own guard, whatever a script does to the markup.
      await page.evaluate(() => {
        const counter = document.querySelector('#vitrine .counter');
        counter.hidden = false;
        counter.setAttribute('data-value', '0');
        counter.querySelector('dd').textContent = '0';
      });
      check('counters: `data-value="0"` is hidden by the stylesheet even unhidden',
        !(await read(page)).entries[0].shown);
      await shot(page, 'counters-mixed');
      await page.close();
    }
  },

  async pulse() {
    // The server's own answer (criterion 8, the other half). Whatever it holds
    // right now, the SHAPE is the contract, and so is the rule: a figure is a
    // positive integer no older than ten minutes, or null with a reason.
    const response = await fetch(`${BASE}/api/pulse`, { headers: { Accept: 'application/json' } });
    const type = response.headers.get('content-type') || '';
    check('pulse: /api/pulse answers 200 JSON, uncached', response.status === 200 && type.includes('application/json')
      && /no-store/.test(response.headers.get('cache-control') || ''), `${response.status} ${type}`);
    const body = await response.json().catch(() => null);
    const builtAt = Date.parse(body?.at ?? '');
    check('pulse: it says when it was made, and its window', Number.isFinite(builtAt) && body.maxAgeMs === 600000,
      JSON.stringify({ at: body?.at, maxAgeMs: body?.maxAgeMs }));
    const report = [];
    let honest = true;
    for (const key of ['avions', 'navires', 'bus', 'meteo']) {
      const entry = body?.[key];
      if (entry === null) {
        report.push(`${key}=null(${body?.why?.[key] ?? '?'})`);
        honest &&= typeof body?.why?.[key] === 'string';
        continue;
      }
      const at = Date.parse(entry?.at ?? '');
      const ok = Number.isInteger(entry?.value) && entry.value > 0 && Number.isFinite(at) && builtAt - at <= 600000;
      honest &&= ok;
      report.push(`${key}=${entry?.value}`);
    }
    check('pulse: every figure is a fresh positive integer, or null with a reason', honest, report.join(' '));
    // A second visitor reads the same counting pass — unless the first one
    // landed at the very end of the server's minute.
    const again = await fetch(`${BASE}/api/pulse`).then((r) => r.json()).catch(() => null);
    const samePass = again?.countedAt === body?.countedAt
      || Date.parse(again?.countedAt) - Date.parse(body?.countedAt) >= 60_000;
    check('pulse: a second visitor within the minute gets the same counting pass', samePass,
      `${body?.countedAt} / ${again?.countedAt}`);
    const unknown = await fetch(`${BASE}/api/pulse/anything`);
    const post = await fetch(`${BASE}/api/pulse`, { method: 'POST' });
    check('pulse: only its own route, only GET', unknown.status === 404 && post.status === 405,
      `${unknown.status} / ${post.status}`);
  },

  async texts() {
    const page = await freshPage();
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    const text = await page.evaluate(() => document.getElementById('vitrine').innerText);
    const html = await page.evaluate(() => document.getElementById('vitrine').outerHTML);
    for (const phrase of [
      'La France',
      'au rayon X.',
      'Tout ce que vous n’auriez jamais pensé à chercher.',
      'Aucun',
      'Tout commence',
      'Les administrations publient.',
      'plus de cinquante sources, au même endroit',
      'Choisissez une vue.',
      'Parlez au',
      '« Montre-moi les bus autour de la gare Saint-Jean. »',
      'Ouvrir le globe',
      'Sans compte. Sans installation.',
    ]) check(`text: « ${phrase} »`, text.includes(phrase));
    for (const banned of ['59 couches', '56 sans clé', 'couches de données', 'pour les ', 'agent immobilier', 'mairie', '€', 'plateforme', 'géospatial', 'jumeau', 'observatoire', 'portail']) {
      check(`text: no « ${banned.trim()} »`, !text.toLowerCase().includes(banned.toLowerCase()));
    }
    const openSource = (text.match(/open source/gi) || []).length;
    check('text: « open source » nowhere above the footer', openSource === 0, `${openSource}`);
    check('links: every internal link is relative', !/href="https:\/\/surplomb\.app/.test(html));
    await page.close();
  },

  async short() {
    const page = await freshPage({ phone: true });
    await page.setViewport({ width: 375, height: 667, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.goto(phoneUrl(`${BASE}/`), { waitUntil: 'load' });
    const overlap = await page.evaluate(() => {
      const place = document.querySelector('#vitrine .hero-place');
      const dock = document.querySelector('#vitrine .dock').getBoundingClientRect();
      if (getComputedStyle(place).display === 'none') return { hidden: true };
      const r = place.getBoundingClientRect();
      return { hidden: false, overlaps: r.bottom > dock.top && r.top < dock.bottom };
    });
    check('375×667: the place label is never under the dock', overlap.hidden || !overlap.overlaps, JSON.stringify(overlap));
    await shot(page, 'phone-375x667');
    await page.close();
  },

  async nojs() {
    const page = await freshPage({ javascript: false });
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    const state = await page.evaluate(() => ({
      vitrine: getComputedStyle(document.getElementById('vitrine')).display,
      items: [...document.querySelectorAll('#vitrine .examples li')]
        .filter((li) => getComputedStyle(li).display !== 'none').map((li) => li.textContent.trim()),
      scroll: document.documentElement.scrollHeight,
    }));
    check('no JavaScript: the showcase is the page', state.vitrine !== 'none' && state.scroll > 3000, JSON.stringify({ d: state.vitrine, h: state.scroll }));
    check('no JavaScript: seven examples, « permis » not among them',
      state.items.length === 7 && !state.items.some((t) => t.includes('permis')), `${state.items.length}`);
    await page.close();
  },

  async handoff() {
    const page = await freshPage();
    const requests = watchRequests(page);
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    await waitFor(page, () => window.__gevVitrine ? true : null);
    await sleep(2500);
    await page.evaluate(() => window.scrollTo({ top: 1400, behavior: 'instant' }));
    const before = await page.evaluate(() => ({
      state: document.getElementById('vitrine').dataset.state,
      t: document.querySelector('#vitrine .world-video')?.currentTime ?? 0,
    }));
    // A value that only survives if the document was never replaced: the
    // address must move from `/` to `/globe` WITHOUT a navigation.
    await page.evaluate(() => { window.__qaSameDocument = 'yes'; });
    await page.evaluate(() => document.querySelector('#vitrine form.dock').requestSubmit());
    const opening = await waitFor(page, () => document.documentElement.getAttribute('data-vitrine') === 'opening' || null, { timeout: 5000 });
    check('hand-off: the frame freezes and the page steps aside', Boolean(opening));
    const viewer = await waitFor(page, () => Boolean(window.__godsEyeView?.viewer), { timeout: 90_000 });
    const pose = viewer && await page.evaluate(() => {
      const record = window.__godsEyeView.vitrineHandoff;
      const c = window.__godsEyeView.viewer.camera;
      return record ? {
        videoTime: record.videoTime,
        heading: c.heading * 180 / Math.PI,
        expected: record.expectedHeadingDeg,
      } : null;
    });
    if (pose) {
      const diff = Math.abs(((pose.heading - pose.expected + 540) % 360) - 180);
      const clock = Math.abs(pose.videoTime - before.t);
      check('hand-off: the globe boots on the frozen frame\'s pose', diff < 0.5 && clock < 0.5,
        `Δheading ${diff.toFixed(3)}°, frozen at ${pose.videoTime.toFixed(2)} s (read ${before.t.toFixed(2)} s)`);
    } else {
      check('hand-off: the globe boots on the frozen frame\'s pose', false, 'no hand-off record: no recorded orbit? (npm run landing:assets)');
    }
    const gone = await waitFor(page, () => (!document.documentElement.hasAttribute('data-vitrine') && !document.getElementById('vitrine')) || null, { timeout: 30_000 });
    check('hand-off: the picture lifts and the cockpit is left alone', Boolean(gone));
    const cockpit = await page.evaluate(() => ({
      scrollY: window.scrollY,
      overflow: getComputedStyle(document.body).overflow,
      theme: document.querySelector('meta[name="theme-color"]').content,
      hash: location.hash.slice(0, 20),
      path: location.pathname,
      sameDocument: window.__qaSameDocument === 'yes',
    }));
    check('hand-off: the document is the cockpit again', cockpit.scrollY === 0 && cockpit.overflow === 'hidden' && cockpit.theme === '#0a0a0f',
      JSON.stringify(cockpit));
    check('hand-off: the address became /globe, in the same document',
      cockpit.path === '/globe' && cockpit.sameDocument, `${cockpit.path} — same document: ${cockpit.sameDocument}`);
    check('hand-off: the loop was live before the press', before.state === 'live', before.state);
    const engineBeforeLoad = requests.filter((r) => ENGINE_RE.test(r.url));
    check('hand-off: the engine was fetched (idle prefetch or press)', engineBeforeLoad.length > 0);
    await shot(page, 'handoff-after');
    await page.close();
  },

  async adresses() {
    // The second URL. A browser that has never met this site, sent straight to
    // the globe's own address: no brochure, no redirect, the cockpit.
    const page = await freshPage();
    await page.goto(`${BASE}/globe`, { waitUntil: 'load', timeout: 90_000 });
    const arrival = await page.evaluate(() => ({
      attr: document.documentElement.getAttribute('data-vitrine'),
      vitrine: Boolean(document.getElementById('vitrine')
        && getComputedStyle(document.getElementById('vitrine')).display !== 'none'
        && document.getElementById('vitrine').getBoundingClientRect().height > 0),
      path: location.pathname,
      loading: Boolean(document.getElementById('loading-screen')),
    }));
    check('/globe: the globe\'s own address opens the cockpit',
      arrival.attr === null && !arrival.vitrine && arrival.path === '/globe', JSON.stringify(arrival));
    const viewer = await waitFor(page, () => Boolean(window.__godsEyeView?.viewer), { timeout: 90_000 });
    check('/globe: a Viewer is built there', Boolean(viewer));
    // And a trailing slash is the same address, not the brochure.
    const slash = await freshPage();
    await slash.goto(`${BASE}/globe/`, { waitUntil: 'load', timeout: 90_000 });
    const slashAttr = await slash.evaluate(() => document.documentElement.getAttribute('data-vitrine'));
    check('/globe/: a trailing slash is the same address', slashAttr === null, String(slashAttr));
    await slash.close();
    // `?vitrine=1` still shows the brochure from there — the demo switch.
    const demo = await freshPage();
    await demo.goto(`${BASE}/globe?vitrine=1`, { waitUntil: 'load', timeout: 90_000 });
    const demoAttr = await demo.evaluate(() => document.documentElement.getAttribute('data-vitrine'));
    check('/globe?vitrine=1: the brochure can still be forced', demoAttr === '', String(demoAttr));
    await demo.close();
    await page.close();
  },

  async locate() {
    // « Utiliser ma position »: asked on the showcase, answered in the
    // cockpit, and no coordinate in the address before the globe is open.
    const page = await freshPage({ phone: true });
    await page.browserContext().overridePermissions(BASE, ['geolocation']);
    await page.setGeolocation({ latitude: 45.764, longitude: 4.8357, accuracy: 30 });
    await page.goto(phoneUrl(`${BASE}/`), { waitUntil: 'load' });
    await waitFor(page, () => window.__gevVitrine ? true : null);
    const enabled = await page.evaluate(() => !document.querySelector('#vitrine [data-action="geolocate"]').disabled);
    check('locate: the button is live where the browser can answer', enabled);
    const urls = [];
    page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) urls.push(frame.url()); });
    await page.evaluate(() => document.querySelector('#vitrine [data-action="geolocate"]').click());
    await waitFor(page, () => Boolean(window.__godsEyeView?.viewer), { timeout: 90_000 });
    const near = await waitFor(page, () => {
      const c = window.__godsEyeView.viewer.camera.positionCartographic;
      const dy = (c.latitude * 180 / Math.PI - 45.764) * 111_320;
      const dx = (c.longitude * 180 / Math.PI - 4.8357) * 78_000;
      const km = Math.hypot(dx, dy) / 1000;
      return km < 3 && c.height < 20_000 ? { km: +km.toFixed(2), height: Math.round(c.height) } : null;
    }, { timeout: 45_000 });
    check('locate: the cockpit flies to the reader', Boolean(near), JSON.stringify(near));
    await page.close();

    const refused = await freshPage();
    await refused.browserContext().overridePermissions(BASE, []);
    await refused.goto(`${BASE}/`, { waitUntil: 'load' });
    await waitFor(refused, () => window.__gevVitrine ? true : null);
    await refused.evaluate(() => {
      document.querySelector('#vitrine-place').value = 'Lyon';
      document.querySelector('#vitrine [data-action="geolocate"]').click();
    });
    const note = await waitFor(refused, () => {
      const text = document.querySelector('#vitrine [data-dock-note]').textContent;
      return /position/i.test(text) && !/Recherche/.test(text) ? text : null;
    }, { timeout: 15_000 });
    const kept = await refused.evaluate(() => ({
      value: document.querySelector('#vitrine-place').value,
      vitrine: document.documentElement.hasAttribute('data-vitrine'),
    }));
    check('locate refused: the reason is written in the dock, the typed text kept', Boolean(note) && kept.value === 'Lyon' && kept.vitrine,
      `${note} / ${JSON.stringify(kept)}`);
    await refused.close();
  },

  async identity() {
    // The « Belvédère » mark (2 bis): the symbol before the word, in the header
    // and at the end of the page, and the same icon in the tab.
    const page = await freshPage();
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    const mark = await page.evaluate(() => {
      const read = (sel) => {
        const link = document.querySelector(sel);
        const symbol = link?.querySelector('svg.brand-symbol');
        const word = link?.querySelector('.brand-word')?.textContent;
        const box = symbol?.getBoundingClientRect();
        return { symbol: Boolean(symbol), hidden: symbol?.getAttribute('aria-hidden'), word, width: box?.width || 0, label: link?.getAttribute('aria-label') };
      };
      return {
        header: read('#vitrine .top .brand'),
        ending: read('#vitrine .closing-brand'),
        icon: document.querySelector('link[rel="icon"]')?.getAttribute('href'),
        slogan: document.querySelector('#vitrine .closing-slogan')?.textContent.replace(/\s+/g, ' ').trim(),
      };
    });
    for (const [where, m] of [['header', mark.header], ['ending', mark.ending]]) {
      check(`identity: ${where} carries the symbol then « surplomb », named for a screen reader`,
        m.symbol && m.hidden === 'true' && m.word === 'surplomb' && m.width > 20 && /Surplomb/.test(m.label || ''), JSON.stringify(m));
    }
    check('identity: the page ends on « Aucun angle mort. »', mark.slogan === 'Aucun angle mort.', mark.slogan);
    check('identity: the tab icon is the Belvédère icon', mark.icon === '/icon.svg', mark.icon);
    await page.close();
  },

  async still() {
    // « Image fixe » stops the loop on the frame being shown, and unticking it
    // starts it again. Offered only while something plays.
    const page = await freshPage();
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    const live = await waitFor(page, () => document.getElementById('vitrine')?.dataset.state === 'live' || null, { timeout: 15_000 });
    if (!live) {
      check('still: the loop plays first', false, 'never went live');
      await page.close();
      return;
    }
    const shown = await page.evaluate(() => getComputedStyle(document.querySelector('#vitrine .motion-control')).display !== 'none');
    check('still: « Image fixe » is offered while the loop plays', shown);
    await page.evaluate(() => document.querySelector('#vitrine-still').click());
    await sleep(400);
    const t1 = await page.evaluate(() => document.querySelector('#vitrine .world-video').currentTime);
    await sleep(1200);
    const frozen = await page.evaluate(() => {
      const v = document.querySelector('#vitrine .world-video');
      return { t: v.currentTime, paused: v.paused, visible: getComputedStyle(v).visibility };
    });
    check('still: ticked, the picture stops where it was (paused, not swapped for the poster)',
      frozen.paused && Math.abs(frozen.t - t1) < 0.05 && frozen.visible === 'visible', JSON.stringify({ t1, ...frozen }));
    await page.evaluate(() => document.querySelector('#vitrine-still').click());
    await sleep(1200);
    const moving = await page.evaluate(() => document.querySelector('#vitrine .world-video').currentTime);
    check('still: unticked, the city moves again', moving > frozen.t + 0.3, `${frozen.t.toFixed(2)} → ${moving.toFixed(2)} s`);
    await page.close();

    const reduced = await freshPage({ reducedMotion: true });
    await reduced.goto(`${BASE}/`, { waitUntil: 'load' });
    await sleep(1500);
    const offered = await reduced.evaluate(() => getComputedStyle(document.querySelector('#vitrine .motion-control')).display !== 'none');
    check('still: not offered under reduced motion (nothing plays)', !offered);
    await reduced.close();
  },

  async gallery() {
    // The six views and the voice answer move — recorded loops over their
    // stills (src/vitrine/gallery.js). Nothing is fetched until a box nears
    // the screen, nothing plays off screen, and « Image fixe » stops them.
    const page = await freshPage();
    const requests = watchRequests(page);
    await page.goto(`${BASE}/`, { waitUntil: 'load', timeout: 90_000 });
    await waitFor(page, () => (window.__gevVitrine ? true : null));
    await sleep(2500);
    const early = requests.filter((r) => GALLERY_LOOP_RE.test(r.url) || /\/(?:assets\/gallery-[^/]*|src\/vitrine\/gallery)\.js/.test(r.url));
    check('gallery: neither a loop nor its code fetched while the reader is at the top', early.length === 0,
      early.map((r) => r.url.split('/').pop()).join(', '));
    await page.evaluate(() => document.querySelector('#vitrine .gallery-grid').scrollIntoView({ block: 'start', behavior: 'instant' }));
    const available = await waitFor(page, () => window.__gevVitrine.getDiagnostics().gallery.available || null, { timeout: 5000 });
    if (!available) {
      console.log('  \x1b[2m   gallery: no loop published (src/vitrine/galleryLoops.js is empty) — stills only\x1b[0m');
      check('gallery: with no loop published, no video is added', await page.evaluate(() => !document.querySelector('#vitrine .loop-video')));
      await page.close();
      return;
    }
    const diag = () => page.evaluate(() => window.__gevVitrine.getDiagnostics().gallery.items);
    const videos = () => page.evaluate(() => [...document.querySelectorAll('#vitrine .loop-video')].map((v) => ({
      media: v.parentElement.dataset.media, paused: v.paused, t: v.currentTime, muted: v.muted, loop: v.loop,
      inline: v.hasAttribute('playsinline'), poster: Boolean(v.poster), opacity: Number(getComputedStyle(v).opacity),
    })));
    const live = await waitFor(page, () => {
      const items = window.__gevVitrine.getDiagnostics().gallery.items;
      const on = Object.entries(items).filter(([, item]) => item.state === 'live' && item.visible).map(([key]) => key);
      return on.length >= 2 ? on : null;
    }, { timeout: 20_000 });
    check('gallery: the thumbnails on screen play', Boolean(live), JSON.stringify(live ?? await diag()));
    if (!live) { await page.close(); return; }
    const first = (await videos()).find((v) => v.media === live[0]);
    await sleep(1200);
    const later = (await videos()).find((v) => v.media === live[0]);
    check('gallery: the picture moves (currentTime advances)', later.t > first.t + 0.5, `${first.t.toFixed(2)} → ${later.t.toFixed(2)} s`);
    const shown = (await videos()).filter((v) => live.includes(v.media));
    check('gallery: muted, looping, inline, the still as poster, faded in',
      shown.every((v) => v.muted && v.loop && v.inline && v.poster && v.opacity > 0.95), JSON.stringify(shown));
    const items = await diag();
    const renditions = live.map((key) => items[key].rendition);
    check('gallery: each box gets a rendition that covers it', renditions.every((r) => r && r.width >= r.needed * 0.9),
      JSON.stringify(renditions));
    const notNear = Object.entries(items).filter(([, item]) => !item.near && item.state !== 'still');
    check('gallery: a box far from the screen is not fetched', notNear.length === 0, notNear.map(([k]) => k).join(', '));

    // Each film (`data-expand`: Roissy, the power grid): the pointer rests on
    // it, it grows on screen over dimmed neighbours, swaps to a wider file
    // without stopping, and shrinks back when the pointer leaves. Pointer
    // events are dispatched (puppeteer's mouse hangs on this page).
    const films = await page.evaluate(() => [...document.querySelectorAll('#vitrine .view[data-expand] [data-media]')]
      .map((box) => box.dataset.media));
    check('gallery: every enlarging view holds a film', films.length >= 2, JSON.stringify(films));
    for (const film of films) {
      await page.evaluate((key) => {
        const view = document.querySelector(`#vitrine [data-media="${key}"]`).closest('.view');
        view.scrollIntoView({ block: 'center', behavior: 'instant' });
        view.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
      }, film);
      const grown = await waitFor(page, (key) => {
        const item = window.__gevVitrine.getDiagnostics().gallery.items[key];
        const view = document.querySelector(`#vitrine [data-media="${key}"]`).closest('.view');
        if (!item?.expanded) return null;
        const box = view.querySelector('.view-image').getBoundingClientRect();
        if (box.width < view.getBoundingClientRect().width * 1.19) return null; // still growing
        const other = document.querySelector('#vitrine .gallery-grid > .view:not([data-expand])');
        return { box: { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width },
          screen: { width: document.documentElement.clientWidth, height: innerHeight },
          dimmed: Number(getComputedStyle(other).opacity), rendition: item.rendition };
      }, { arg: film, timeout: 15_000 });
      check(`gallery: ${film}, a film, grows when the pointer rests on it, on screen, over dimmed neighbours`,
        grown && grown.box.left >= 0 && grown.box.top >= 0 && grown.box.right <= grown.screen.width
          && grown.box.bottom <= grown.screen.height && grown.dimmed < 0.5, JSON.stringify(grown));
      const wider = await waitFor(page, (key) => {
        const item = window.__gevVitrine.getDiagnostics().gallery.items[key];
        return item.rendition && !item.swapping && item.rendition.width >= item.rendition.needed * 0.9 ? item.rendition : null;
      }, { arg: film, timeout: 25_000 });
      const t0 = await page.evaluate((key) => window.__gevVitrine.getDiagnostics().gallery.items[key].currentTime, film);
      await sleep(800);
      const t1 = await page.evaluate((key) => window.__gevVitrine.getDiagnostics().gallery.items[key].currentTime, film);
      check(`gallery: ${film} enlarged plays a file that covers the enlarged box, and keeps moving`,
        Boolean(wider) && t1 > t0 + 0.3, `${JSON.stringify(wider)}; ${t0?.toFixed(2)} → ${t1?.toFixed(2)} s`);
      await shot(page, `gallery-film-enlarged-${film.replace(':', '-')}`);
      await page.evaluate((key) => document.querySelector(`#vitrine [data-media="${key}"]`).closest('.view')
        .dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' })), film);
      await sleep(700);
      const back = await page.evaluate((key) => {
        const view = document.querySelector(`#vitrine [data-media="${key}"]`).closest('.view');
        return { expanded: view.hasAttribute('data-expanded'),
          ratio: view.querySelector('.view-image').getBoundingClientRect().width / view.getBoundingClientRect().width };
      }, film);
      check(`gallery: ${film}, the pointer gone, shrinks back`, !back.expanded && Math.abs(back.ratio - 1) < 0.01,
        JSON.stringify(back));
    }
    await page.evaluate(() => document.querySelector('#vitrine .gallery-grid').scrollIntoView({ block: 'start', behavior: 'instant' }));
    await sleep(600);

    // « Image fixe »: everything stops where it is, and starts again.
    await page.evaluate(() => document.querySelector('#vitrine-still').click());
    await sleep(400);
    const frozenA = await videos();
    await sleep(1000);
    // Every loop stops; the ones that were playing stay on screen, where they stopped.
    const frozenB = await videos();
    const wasLive = frozenB.filter((v) => live.includes(v.media));
    check('gallery: « Image fixe » stops every loop on the frame shown',
      frozenB.every((v) => v.paused) && wasLive.every((v) => v.opacity > 0.95)
        && frozenB.every((v, i) => Math.abs(v.t - frozenA[i].t) < 0.05),
      JSON.stringify(frozenB.map((v) => [v.media, v.paused, v.t.toFixed(2)])));
    await page.evaluate(() => document.querySelector('#vitrine-still').click());
    await sleep(1200);
    const resumed = (await videos()).filter((v) => live.includes(v.media));
    check('gallery: unticked, the loops on screen move again', resumed.every((v) => !v.paused), JSON.stringify(resumed.map((v) => [v.media, v.paused])));

    // Off screen: paused.
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await sleep(1000);
    const away = await videos();
    check('gallery: scrolled away, every loop is paused', away.every((v) => v.paused), JSON.stringify(away.map((v) => [v.media, v.paused])));
    await page.close();

    // Reduced motion, data saver, and a download that fails: stills only.
    const stillsOnly = async (label, { reducedMotion = false, saveData = false, failLoops = false } = {}) => {
      const other = await freshPage({ reducedMotion });
      if (saveData) {
        await other.evaluateOnNewDocument(() => {
          Object.defineProperty(Navigator.prototype, 'connection', { configurable: true, get: () => ({ saveData: true, effectiveType: '4g' }) });
        });
      }
      if (failLoops) {
        await other.setRequestInterception(true);
        other.on('request', (request) => (GALLERY_LOOP_RE.test(request.url()) ? request.abort() : request.continue()));
      }
      const seen = watchRequests(other);
      await other.goto(`${BASE}/`, { waitUntil: 'load', timeout: 90_000 });
      await waitFor(other, () => (window.__gevVitrine ? true : null));
      await other.evaluate(() => document.querySelector('#vitrine .gallery-grid').scrollIntoView({ block: 'start', behavior: 'instant' }));
      await sleep(3500);
      const state = await other.evaluate(() => ({
        videos: document.querySelectorAll('#vitrine .loop-video').length,
        stills: [...document.querySelectorAll('#vitrine .view-image img')].filter((img) => img.getBoundingClientRect().bottom > 0
          && img.getBoundingClientRect().top < innerHeight).map((img) => img.complete && img.naturalWidth > 0),
        states: Object.values(window.__gevVitrine.getDiagnostics().gallery.items || {}).map((item) => item.state),
      }));
      const fetched = seen.filter((r) => GALLERY_LOOP_RE.test(r.url));
      if (failLoops) {
        check(`gallery: ${label} — the still stays, the video goes`,
          state.videos === 0 && state.stills.length > 0 && state.stills.every(Boolean) && state.states.includes('fallback'),
          JSON.stringify(state));
      } else {
        check(`gallery: ${label} — stills only, no loop fetched`,
          state.videos === 0 && fetched.length === 0 && state.stills.every(Boolean), JSON.stringify({ ...state, fetched: fetched.length }));
      }
      await other.close();
    };
    await stillsOnly('reduced motion', { reducedMotion: true });
    await stillsOnly('data saver', { saveData: true });
    await stillsOnly('a loop that fails to download', { failLoops: true });

    // A phone: the loop plays, and never at the desktop's 1440.
    const phone = await freshPage({ phone: true });
    await phone.goto(phoneUrl(`${BASE}/`), { waitUntil: 'load', timeout: 90_000 });
    await waitFor(phone, () => (window.__gevVitrine ? true : null));
    await phone.evaluate(() => document.querySelector('#vitrine .gallery-grid').scrollIntoView({ block: 'start', behavior: 'instant' }));
    const phoneLive = await waitFor(phone, () => {
      const entries = Object.values(window.__gevVitrine.getDiagnostics().gallery.items || {});
      const on = entries.filter((item) => item.state === 'live');
      return on.length ? on.map((item) => item.rendition) : null;
    }, { timeout: 20_000 });
    check('gallery: a phone plays the view on screen, at most 960 px wide', Boolean(phoneLive)
      && phoneLive.every((r) => r.width <= 960), JSON.stringify(phoneLive));
    await phone.close();
  },

  async example() {
    const page = await freshPage();
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    await waitFor(page, () => window.__gevVitrine ? true : null);
    await page.evaluate(() => document.querySelector('#vitrine .examples li[data-active] a').click());
    const viewer = await waitFor(page, () => Boolean(window.__godsEyeView?.viewer), { timeout: 90_000 });
    const hash = await page.evaluate(() => location.hash);
    check('an example link opens the cockpit on its view', Boolean(viewer) && hash.includes('lat=45.758'), hash.slice(0, 40));
    await page.close();
  },

  async weight() {
    // Criterion 9, as the plan words it: what the FIRST SCREEN needs — the
    // document, the stylesheet, the fonts, the poster, the entry script. The
    // gallery below is `loading="lazy"`, but Chrome fetches lazy images that
    // sit within ~1 250 px of the viewport straight away, and on a slow origin
    // they finish before `load`: counting them made the same page read 389 kB
    // locally and 852 kB in production. They are reported, and bounded, apart.
    const phone = await freshPage({ phone: true });
    const client = await phone.createCDPSession();
    await client.send('Network.enable');
    const sizes = new Map();
    const meta = new Map();
    client.on('Network.requestWillBeSent', (e) => meta.set(e.requestId, { url: e.request.url, type: e.type }));
    client.on('Network.loadingFinished', (e) => sizes.set(e.requestId, e.encodedDataLength));
    await phone.goto(phoneUrl(`${BASE}/`), { waitUntil: 'load' });
    await sleep(1500);
    const fetched = [...sizes.entries()].map(([id, bytes]) => ({ ...(meta.get(id) || { url: '' }), bytes }));
    const dev = fetched.some(({ url }) => url.includes('/@vite/client'));
    const kB = (list) => Math.round(list.reduce((sum, { bytes }) => sum + bytes, 0) / 1024);
    const firstScreen = fetched.filter(({ url, type }) => type === 'Document' || type === 'Stylesheet'
      || type === 'Font' || type === 'Script' || /\/landing\/hero-poster-/.test(url));
    const gallery = fetched.filter(({ url }) => /\/landing\/view-\d\d-\d+\.[0-9a-f]{8}\.jpg/.test(url));
    const top = [...firstScreen].sort((a, b) => b.bytes - a.bytes).slice(0, 5)
      .map(({ url, bytes }) => `${url.replace(BASE, '')} ${Math.round(bytes / 1024)} kB`);
    if (dev) {
      console.log(`  \x1b[2m   weight skipped on the dev server (${kB(fetched)} kB unbundled)\x1b[0m`);
    } else {
      check('weight: phone first screen (document, CSS, fonts, poster, entry) under 400 kB on the wire',
        kB(firstScreen) < 400, `${kB(firstScreen)} kB — ${top.join(', ')}`);
      // What a phone pays early for thumbnails it cannot see yet: never a 1440.
      check('weight: no 1440 px thumbnail on a phone', !gallery.some(({ url }) => /-1440\./.test(url)),
        `${kB(gallery)} kB early: ${gallery.map(({ url }) => url.split('/').pop()).join(', ') || 'none'}`);
    }
    // The gallery's loops wait for the reader to scroll to them, dev server or
    // not. Counted on REQUESTS: a video still downloading has not finished.
    const loops = [...meta.values()].filter(({ url }) => GALLERY_LOOP_RE.test(url));
    check('weight: no gallery loop requested on the phone\'s first screen', loops.length === 0,
      loops.map(({ url }) => url.split('/').pop()).join(', '));
    await phone.close();
  },
};

try {
  browser = await puppeteer.launch({
    headless: 'new',
    executablePath: existsSync(CHROME) ? CHROME : undefined,
    protocolTimeout: 240_000,
    args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  });
  for (const [name, run] of Object.entries(CASES)) {
    if (ONLY.size && !ONLY.has(name)) continue;
    console.log(`\n[qa:landing] ${name}`);
    try {
      await run();
    } catch (error) {
      check(`${name}: ran to the end`, false, error.message.split('\n')[0]);
    }
  }
} finally {
  await browser?.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n[qa:landing] ${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
