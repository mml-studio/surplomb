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
    check('share link: the browser now counts as having met the globe', state.seen === '1');
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
    check('phone: the picture belongs to the first screen', shell.world === 'absolute', shell.world);
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
    check('phone: opening remembers the reader, and spares them the first-run card', after.seen === '1' && after.firstRun === 'dismissed');
    await page.close();
  },

  async seen() {
    const page = await freshPage();
    await page.evaluateOnNewDocument(() => { localStorage.setItem('gev:vitrine-seen:v1', '1'); });
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    const viewer = await waitFor(page, () => Boolean(window.__godsEyeView?.viewer), { timeout: 90_000 });
    const attr = await page.evaluate(() => document.documentElement.hasAttribute('data-vitrine'));
    check('returning reader: the bare root opens the cockpit', Boolean(viewer) && !attr);
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
    const page = await freshPage();
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    const shown = (sel) => page.evaluate((s) => {
      const el = document.querySelector(s);
      return Boolean(el) && getComputedStyle(el).display !== 'none';
    }, sel);
    check('counters: the group is hidden until a value arrives', !(await shown('#vitrine .counter-panel')));
    await page.evaluate(() => {
      const panel = document.querySelector('#vitrine .counter-panel');
      panel.hidden = false;
      const [a, b] = panel.querySelectorAll('.counter');
      a.hidden = false; a.dataset.value = '0';
      b.hidden = false; b.dataset.value = '123';
    });
    check('counters: a zero never shows', !(await shown('#vitrine .counter:nth-child(1)')));
    check('counters: a positive value shows', await shown('#vitrine .counter:nth-child(2)'));
    await page.close();
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

  async example() {
    const page = await freshPage();
    await page.goto(`${BASE}/`, { waitUntil: 'load' });
    await waitFor(page, () => window.__gevVitrine ? true : null);
    await page.evaluate(() => document.querySelector('#vitrine .examples li[data-active] a').click());
    const viewer = await waitFor(page, () => Boolean(window.__godsEyeView?.viewer), { timeout: 90_000 });
    const hash = await page.evaluate(() => location.hash);
    check('an example link opens the cockpit on its view', Boolean(viewer) && hash.includes('lat=45.76'), hash.slice(0, 40));
    await page.close();
  },

  async weight() {
    const phone = await freshPage({ phone: true });
    const client = await phone.createCDPSession();
    await client.send('Network.enable');
    const sizes = new Map();
    const urls = new Map();
    client.on('Network.requestWillBeSent', (e) => urls.set(e.requestId, e.request.url));
    client.on('Network.loadingFinished', (e) => sizes.set(e.requestId, e.encodedDataLength));
    await phone.goto(phoneUrl(`${BASE}/`), { waitUntil: 'load' });
    const firstScreen = [...sizes.entries()]
      .map(([id, bytes]) => ({ url: urls.get(id) || '', bytes }))
      .filter(({ url }) => !/\.(?:mp4|webm)(?:\?|$)/.test(url));
    const dev = firstScreen.some(({ url }) => url.includes('/@vite/client'));
    const total = firstScreen.reduce((sum, { bytes }) => sum + bytes, 0);
    const top = firstScreen.sort((a, b) => b.bytes - a.bytes).slice(0, 5)
      .map(({ url, bytes }) => `${url.replace(BASE, '')} ${Math.round(bytes / 1024)} kB`);
    if (dev) {
      console.log(`  \x1b[2m   weight skipped on the dev server (${Math.round(total / 1024)} kB unbundled)\x1b[0m`);
    } else {
      check('weight: phone first screen under 400 kB on the wire', total < 400 * 1024, `${Math.round(total / 1024)} kB — ${top.join(', ')}`);
    }
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
