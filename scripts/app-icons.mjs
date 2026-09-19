// Build the home-screen icons — `public/apple-touch-icon.png` and the three
// manifest sizes.
//
// THE MARK IS THE « BELVÉDÈRE » ICON (identity validated 2026-09-18):
// `public/icon.svg`, the ivory-and-apricot symbol on the brand green, which is
// also the tab icon. `public/logo.svg` — the cockpit's eye — is no longer the
// app's icon.
//
// WHY THESE ARE RENDERED AND NOT THE SVG. Every home screen this targets
// wants a PNG, and iOS in particular ignores an SVG `apple-touch-icon`
// outright and falls back to a screenshot of the page. So the icon is drawn
// full-bleed onto its own green, at each size, by the browser that already
// knows how to rasterise it. The SVG's rounded corners sit on the same green,
// so the launcher's own mask is the only shape anyone sees.
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

/** The brand green (`--green` in landing.css), `public/icon.svg`'s own plate. */
const BACKGROUND = '#24473C';

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
  { file: 'apple-touch-icon.png', size: 180, markShare: 1 },
  { file: 'icon-192.png', size: 192, markShare: 1 },
  { file: 'icon-512.png', size: 512, markShare: 1 },
  // The symbol spans ~76 % of icon.svg; at 72 % of that its corners stay
  // inside the 80 % circle Android guarantees to keep.
  { file: 'icon-512-maskable.png', size: 512, markShare: 0.72 },
]);

async function iconHtml(size, markShare, logo) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
* { margin:0; padding:0; box-sizing:border-box; }
html, body { width:${size}px; height:${size}px; background:${BACKGROUND}; overflow:hidden; }
.plate { width:${size}px; height:${size}px; display:flex; align-items:center; justify-content:center;
  background: ${BACKGROUND}; }
.plate img { width:${Math.round(size * markShare)}px; height:auto; }
</style></head><body><div class="plate"><img src="${logo}" alt=""></div></body></html>`;
}

const logoSvg = await readFile(path.join(ROOT, 'public', 'icon.svg'));
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
