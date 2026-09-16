// Build the home-screen icons — `public/apple-touch-icon.png` and the three
// manifest sizes.
//
// WHY THESE ARE RENDERED AND NOT THE SVG. `public/logo.svg` is 775×520 with a
// transparent background, and every home screen this targets wants a SQUARE
// with an OPAQUE one. iOS in particular ignores an SVG `apple-touch-icon`
// outright and falls back to a screenshot of the page, which on this app is a
// dark rectangle nobody can identify at 60 px. So the logo is letterboxed onto
// the app's own `--bg-dark`, at each size, by the browser that already knows
// how to rasterise it.
//
// THE MASKABLE ONE IS NOT A COPY. Android crops a maskable icon to whatever
// shape the launcher uses — circle, squircle, teardrop — and only the middle
// 80 % of the canvas is guaranteed to survive. So that variant draws the mark
// at 60 % instead of 76 %, inside the safe zone, on a full-bleed background.
//
//     npm run icons:build
//
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Copied from `:root` in style.css — the same token `theme-color` carries. */
const BACKGROUND = '#0a0a0f';

/**
 * Every icon this app ships, and who asks for it.
 *
 * `apple-touch-icon.png` is 180×180 because that is what iOS asks for at
 * @3x and iOS does not resize down gracefully from anything else.
 */
// NOT exported: importing this module launches a browser at the top level, so
// an export here would advertise a contract nothing can safely take up. The
// list a test can check is the one in `public/manifest.webmanifest`, and
// `src/webManifest.test.mjs` checks it against the files on disk.
const APP_ICONS = Object.freeze([
  { file: 'apple-touch-icon.png', size: 180, markShare: 0.76 },
  { file: 'icon-192.png', size: 192, markShare: 0.76 },
  { file: 'icon-512.png', size: 512, markShare: 0.76 },
  { file: 'icon-512-maskable.png', size: 512, markShare: 0.6 },
]);

async function iconHtml(size, markShare, logo) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
* { margin:0; padding:0; box-sizing:border-box; }
html, body { width:${size}px; height:${size}px; background:${BACKGROUND}; overflow:hidden; }
.plate { width:${size}px; height:${size}px; display:flex; align-items:center; justify-content:center;
  background:
    radial-gradient(${size * 0.9}px ${size * 0.9}px at 78% 16%, rgba(0,212,255,0.20), transparent 64%),
    ${BACKGROUND}; }
.plate img { width:${Math.round(size * markShare)}px; height:auto;
  filter: drop-shadow(0 0 ${Math.round(size * 0.06)}px rgba(0,212,255,0.45)); }
</style></head><body><div class="plate"><img src="${logo}" alt=""></div></body></html>`;
}

const logoSvg = await readFile(path.join(ROOT, 'public', 'logo.svg'));
const logo = `data:image/svg+xml;base64,${logoSvg.toString('base64')}`;

// `headless: 'shell'`, and not the default. In Chrome's new headless mode a
// page that never produces a compositor frame — which is every page in this
// file, four static plates with no animation and no WebGL — leaves
// `Page.captureScreenshot` waiting for a frame that never comes, and the call
// hangs until the protocol timeout. Measured here on 2026-09-16: default
// headless timed out on every variant tried (png, jpeg, clip, raw CDP with
// `fromSurface: false`, file:// and http:// alike); the shell answered in
// 90 ms. `scripts/og-image.mjs` gets away with the default because nothing
// has re-run it since.
const browser = await puppeteer.launch({
  headless: 'shell',
  protocolTimeout: 60_000,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
try {
  const page = await browser.newPage();
  for (const { file, size, markShare } of APP_ICONS) {
    await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
    await page.setContent(await iconHtml(size, markShare, logo), { waitUntil: 'load' });
    // A `<img>` pointed at a data URL can still be undecoded when `load`
    // fires on a page with nothing else in it — and an icon of empty
    // background looks exactly like an icon that worked.
    const drawn = await page.evaluate(() => {
      const img = document.querySelector('img');
      return img.complete && img.naturalWidth > 0;
    });
    if (!drawn) throw new Error(`[icons] ${file}: the logo did not decode`);
    const png = await page.screenshot({ type: 'png' });
    await writeFile(path.join(ROOT, 'public', file), png);
    console.log(`[icons] public/${file} — ${size}×${size}, ${(png.length / 1024).toFixed(1)} kB`);
  }
} finally {
  await browser.close();
}
