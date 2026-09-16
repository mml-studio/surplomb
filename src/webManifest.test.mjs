// The phone's front door: the manifest, the icons, and the two meta tags that
// decide what a handset shows before a single line of app code runs.
//
// All three fail SILENTLY. A manifest whose icon 404s installs an app with a
// blank tile; an `apple-touch-icon` that is missing makes iOS screenshot the
// page instead, which on this app is an unidentifiable dark rectangle; and a
// `theme-color` that drifts from `--bg-dark` paints a pale band above a black
// globe. None of them throws, and none of them is visible on a desktop.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(REPO_ROOT, 'public');
const INDEX_HTML = readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');
const MANIFEST_PATH = path.join(PUBLIC_DIR, 'manifest.webmanifest');
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));

/** The token every surface copies. `style.css:7` is where it is defined. */
const BG_DARK = '#0a0a0f';

test('the viewport opts into the two things a phone layout needs', () => {
  const viewport = INDEX_HTML.match(/<meta name="viewport" content="([^"]+)"/)?.[1];
  assert.ok(viewport, 'no viewport meta');
  // Without this, `env(safe-area-inset-*)` is 0 everywhere and the two uses
  // already in style.css protect nothing from the iOS home bar.
  assert.match(viewport, /viewport-fit=cover/);
  // The software keyboard shrinks the layout viewport instead of sliding the
  // page under itself, which is the difference between a search field you can
  // see while typing into it and one pushed off screen.
  assert.match(viewport, /interactive-widget=resizes-content/);
  assert.match(viewport, /width=device-width/);
});

test('theme-color is the app background, not an approximation of it', () => {
  const themeColor = INDEX_HTML.match(/<meta name="theme-color" content="([^"]+)"/)?.[1];
  assert.equal(themeColor?.toLowerCase(), BG_DARK);
  assert.equal(manifest.theme_color.toLowerCase(), BG_DARK);
  assert.equal(manifest.background_color.toLowerCase(), BG_DARK);
  // The same token, read from where it is actually defined. A drift here is a
  // pale band above a black globe, on the one device that shows it.
  const css = readFileSync(path.join(REPO_ROOT, 'style.css'), 'utf8');
  assert.match(css, new RegExp(`--bg-dark:\\s*${BG_DARK}`, 'i'));
});

test('index.html links a manifest and an apple-touch-icon that exist', () => {
  assert.match(INDEX_HTML, /<link rel="manifest" href="\/manifest\.webmanifest"/);
  assert.ok(existsSync(MANIFEST_PATH), 'public/manifest.webmanifest is missing');

  const appleIcon = INDEX_HTML.match(/<link rel="apple-touch-icon" href="([^"]+)"/)?.[1];
  assert.ok(appleIcon, 'iOS falls back to a screenshot of the page without this');
  // A PNG, deliberately: iOS ignores an SVG apple-touch-icon outright.
  assert.match(appleIcon, /\.png$/);
  const appleFile = path.join(PUBLIC_DIR, appleIcon.replace(/^\//, ''));
  assert.ok(existsSync(appleFile), `${appleIcon} is missing`);
  // 180×180 is what iOS asks for at @3x, and it does not scale down from
  // anything else gracefully.
  const applePng = readFileSync(appleFile);
  assert.equal(applePng.readUInt32BE(16), 180);
  assert.equal(applePng.readUInt32BE(20), 180);
});

test('the manifest installs as this app, in French, standalone', () => {
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.lang, 'fr');
  assert.equal(manifest.start_url, '/');
  assert.match(manifest.short_name, /Surplomb/);
  // Home screens truncate around 12 characters; the long name is for the
  // install prompt and the app list, not the icon label.
  assert.ok(manifest.short_name.length <= 12, `short_name is ${manifest.short_name.length} chars`);
});

test('every icon the manifest names is on disk and is a PNG', () => {
  assert.ok(manifest.icons?.length >= 2);
  for (const icon of manifest.icons) {
    const file = path.join(PUBLIC_DIR, icon.src.replace(/^\//, ''));
    assert.ok(existsSync(file), `${icon.src} is declared and missing — the tile installs blank`);
    // PNG magic number: a JPEG or an SVG renamed to .png is rejected by every
    // launcher, silently, and the manifest would still validate.
    const head = readFileSync(file).subarray(0, 8);
    assert.deepEqual([...head], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], `${icon.src} is not a PNG`);
    assert.ok(statSync(file).size > 1024, `${icon.src} is suspiciously small`);
    assert.match(icon.sizes, /^\d+x\d+$/);
    // The declared size is what a launcher picks by, and a file that is not it
    // is scaled — badly, and only on the device. Read the real one out of the
    // PNG's IHDR chunk rather than trusting the string.
    const png = readFileSync(file);
    const [w, h] = [png.readUInt32BE(16), png.readUInt32BE(20)];
    assert.equal(`${w}x${h}`, icon.sizes, `${icon.src} is ${w}x${h}, declared ${icon.sizes}`);
  }
  // Android crops a maskable icon to the launcher's own shape, and only the
  // middle 80 % survives. Without one declared, it pads the `any` icon with
  // white — a white ring around a black tile.
  assert.ok(
    manifest.icons.some((icon) => icon.purpose === 'maskable'),
    'no maskable icon: Android will pad the square one with white',
  );
  assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512' && icon.purpose === 'any'));
});

test('there is deliberately no service worker', () => {
  // A console of live data — ~96 `/api` responses go out `no-store` — behind a
  // build whose engine is already `immutable`. A SW would have nothing left to
  // cache except the stale build `src/staleBuildRecovery.js` spends its time
  // fighting. If one is ever added, this test is the conversation.
  assert.doesNotMatch(INDEX_HTML, /serviceWorker/);
  assert.ok(!existsSync(path.join(PUBLIC_DIR, 'sw.js')));
});
