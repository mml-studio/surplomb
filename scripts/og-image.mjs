// Build the social share card — `public/og.png`, 1200×630.
//
// THE CARD CARRIES THE « BELVÉDÈRE » MARK (2026-09-19), exactly as the home
// page and the cockpit draw it: the symbol (two ivory planes, the apricot
// sun) and « surplomb » in Manrope 800, on the brand green. The symbol is the
// SAME SVG as `public/icon.svg`, read from it rather than redrawn, so the tab,
// the home-screen icon and the card can never drift apart.
//
// WHY THIS IS RENDERED AND NOT DRAWN BY HAND. Chrome already owns the glyph
// metrics of both faces, so the card is a real page screenshotted at the
// card's size.
//
// THE FONTS ARE INLINED AS DATA URLS, not linked. A `file://` page cannot fetch
// `/fonts/manrope-latin.….woff2`, and a page pointed at the dev server would
// make this script depend on a running server to produce a static asset.
// Inlining the subsets the card actually uses keeps it a pure function of the
// repo. They are found by PREFIX, because `npm run fonts:build` re-hashes the
// file names.
//
//     npm run og:build
//
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'og.png');

/** The card's copy, in one place so a rewrite is a one-line diff. */
export const CARD = Object.freeze({
  hook: 'La France au rayon X.',
  sub: 'Tout ce que vous n’auriez jamais pensé à chercher.',
  site: 'surplomb.app',
  slogan: 'Aucun angle mort.',
});

async function dataUrl(rel, mime) {
  const buf = await readFile(path.join(ROOT, rel));
  return `data:${mime};base64,${buf.toString('base64')}`;
}

/** The hashed latin subset of a family built by `npm run fonts:build`. */
async function fontFile(prefix) {
  const names = await readdir(path.join(ROOT, 'public', 'fonts'));
  const hit = names.find((name) => name.startsWith(`${prefix}.`) && name.endsWith('.woff2'));
  if (!hit) throw new Error(`[og] no public/fonts/${prefix}.*.woff2 — run npm run fonts:build`);
  return `public/fonts/${hit}`;
}

/** The symbol of `public/icon.svg`, without its green plate. */
async function symbolSvg() {
  const icon = await readFile(path.join(ROOT, 'public', 'icon.svg'), 'utf8');
  const group = icon.match(/<g transform="[^"]*">([\s\S]*?)<\/g>\s*<\/svg>/);
  if (!group) throw new Error('[og] public/icon.svg no longer has the expected <g transform> wrapper');
  return `<svg viewBox="0 0 360 320" xmlns="http://www.w3.org/2000/svg">${group[1]}</svg>`;
}

async function cardHtml() {
  const [manrope, dmSans, symbol] = await Promise.all([
    fontFile('manrope-latin').then((rel) => dataUrl(rel, 'font/woff2')),
    fontFile('dm-sans-latin').then((rel) => dataUrl(rel, 'font/woff2')),
    symbolSvg(),
  ]);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: 'Manrope'; font-weight: 500 800; src: url('${manrope}') format('woff2'); }
@font-face { font-family: 'DM Sans'; font-weight: 400 700; src: url('${dmSans}') format('woff2'); }
/* The Belvédère tokens — the same three as landing.css and style.css :root. */
:root { --green:#24473C; --ivory:#F7F4EA; --apricot:#F7AB7C; }
* { margin:0; padding:0; box-sizing:border-box; }
body { width:1200px; height:630px; background:var(--green); overflow:hidden; color:var(--ivory);
       font-family:'DM Sans',sans-serif; -webkit-font-smoothing:antialiased; }
/* A low sun behind the words: one warm bloom, nothing else. */
.bloom { position:absolute; inset:0;
  background: radial-gradient(760px 520px at 92% 0%, rgba(247,171,124,0.20), transparent 64%),
              radial-gradient(900px 600px at 0% 100%, rgba(0,0,0,0.22), transparent 62%); }
.card { position:absolute; inset:0; padding:76px 96px 70px; display:flex; flex-direction:column;
        justify-content:space-between; }
.brand { display:flex; align-items:center; gap:18px;
  font-family:'Manrope',sans-serif; font-weight:800; font-size:44px; letter-spacing:-0.5px; }
.brand svg { width:56px; height:auto; color:var(--ivory); }
.hook { font-family:'Manrope',sans-serif; font-size:88px; font-weight:800; line-height:1.02;
        letter-spacing:-2.5px; }
.sub { margin-top:22px; font-size:38px; font-weight:400; line-height:1.25; opacity:0.82; max-width:960px; }
.foot { display:flex; align-items:baseline; justify-content:space-between; gap:64px;
        font-size:26px; font-weight:500; white-space:nowrap; }
.foot .site { opacity:0.72; }
.foot .slogan { color:var(--apricot); font-family:'Manrope',sans-serif; font-weight:800; }
</style></head><body>
<div class="bloom"></div>
<div class="card">
  <div class="brand">${symbol.replace('<svg ', '<svg aria-hidden="true" ')}<span>surplomb</span></div>
  <div><div class="hook">${CARD.hook}</div><div class="sub">${CARD.sub}</div></div>
  <div class="foot"><span class="site">${CARD.site}</span><span class="slogan">${CARD.slogan}</span></div>
</div></body></html>`;
}

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
  await page.setContent(await cardHtml(), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  // A missing face falls back to Helvetica without a word of warning, and the
  // card still looks plausible — so assert both are really in use.
  const faces = await page.evaluate(() => [
    document.fonts.check('800 88px Manrope'),
    document.fonts.check('400 38px "DM Sans"'),
  ]);
  if (!faces[0] || !faces[1]) {
    throw new Error(`[og] font fallback: Manrope=${faces[0]} DMSans=${faces[1]}`);
  }
  const png = await page.screenshot({ type: 'png' });
  await writeFile(OUT, png);
  console.log(`[og] ${path.relative(ROOT, OUT)} — 1200×630, ${(png.length / 1024).toFixed(1)} kB`);
} finally {
  await browser.close();
}
