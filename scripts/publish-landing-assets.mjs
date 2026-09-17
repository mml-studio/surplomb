#!/usr/bin/env node
/**
 * landing:publish — put the showcase's media where the page can serve them.
 *
 * `scripts/build-landing-assets.mjs` writes stable names (`hero-poster-1920.avif`)
 * into staging directories. This step:
 *
 *   1. copies each file to `public/landing/<stem>.<sha256:8><ext>` and removes
 *      the previous generation — hashed so `staticAssetHeaders` can promise a
 *      year of caching (vite.config.js, `IMMUTABLE_LANDING_RE`), exactly like
 *      `public/fonts/`;
 *   2. rewrites every `/landing/<stem>[.<hash>]<ext>` reference in `index.html`
 *      to the new name, and FAILS on a reference to a file that was not built —
 *      a missing poster is a green rectangle nobody would report;
 *   3. publishes every loop rendition the manifest lists (definition × codec)
 *      and writes `src/vitrine/heroLoop.js`: those renditions with their exact
 *      `codecs=` strings, which src/vitrine/renditions.js chooses between, and
 *      the camera law each loop was filmed with, which the hand-off evaluates
 *      (src/vitrine/handoff.js).
 *
 * `--from` takes several directories, comma-separated, earliest first: the
 * high-definition loops (`--quality hq`, 2026-09-17) live apart from the
 * gallery stills, and a name found in an earlier directory wins.
 *
 * Usage: node scripts/publish-landing-assets.mjs [--from <dir>[,<dir>…]] [--check]
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(name);
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback;
};
const FROM = option('--from', '.context/landing-assets/hq,.context/landing-assets/out')
  .split(',').filter(Boolean).map((dir) => path.resolve(REPO_ROOT, dir));
const PUBLIC_DIR = path.join(REPO_ROOT, 'public', 'landing');
const INDEX_PATH = path.join(REPO_ROOT, 'index.html');
const LOOP_MODULE = path.join(REPO_ROOT, 'src', 'vitrine', 'heroLoop.js');
const checkOnly = args.includes('--check');

/** `hero-poster-1440.webp` → `{stem, ext}`. */
export function splitName(file) {
  const ext = path.extname(file);
  return { stem: file.slice(0, -ext.length), ext };
}

/** The published name of a staged file. */
export function hashedName(file, bytes) {
  const { stem, ext } = splitName(file);
  return `${stem}.${createHash('sha256').update(bytes).digest('hex').slice(0, 8)}${ext}`;
}

/**
 * Rungs the builder makes but the page does not serve. Every loop is ~6 to
 * 15 MB committed, so a fallback has to have somebody behind it:
 *
 *   - `hero-phone-960-h264`: every phone browser left reads AV1 (Chrome,
 *     Firefox, Samsung Internet) or HEVC (every iPhone and iPad), and a
 *     browser that reads neither keeps the poster, which is a finished picture.
 *   - `hero-desktop-1920-hevc`: HEVC is for Safari on an M1/M2 (no AV1); at a
 *     1920 need it gets the H.264 1920 instead, at the same measured quality
 *     (VMAF 88.4 against 89.4).
 */
const NOT_SERVED = new Set(['hero-phone-960-h264.mp4', 'hero-desktop-1920-hevc.mp4']);

const MEDIA_EXT_RE = /\.(?:avif|webp|jpg|jpeg|png|mp4|webm)$/;
const REFERENCE_RE = /\/landing\/([a-z0-9-]+?)(?:\.[0-9a-f]{8})?\.(avif|webp|jpg|jpeg|png|mp4|webm)\b/g;

/**
 * Rewrite the references in `html`. Returns the new text and the stems that
 * were referenced but not built.
 * @param {string} html
 * @param {Map<string, string>} published stable name → hashed name
 */
export function rewriteReferences(html, published) {
  const missing = new Set();
  const out = html.replace(REFERENCE_RE, (match, stem, ext) => {
    const hashed = published.get(`${stem}.${ext}`);
    if (!hashed) {
      missing.add(`${stem}.${ext}`);
      return match;
    }
    return `/landing/${hashed}`;
  });
  return { html: out, missing: [...missing].sort() };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const missingDirs = FROM.filter((dir) => !existsSync(dir));
  if (missingDirs.length) throw new Error(`nothing staged in ${missingDirs.join(', ')} — run scripts/build-landing-assets.mjs first`);
  /** Where a staged name lives: the first directory that has it. */
  const locate = (file) => FROM.map((dir) => path.join(dir, file)).find((full) => existsSync(full)) || null;
  const manifestPath = locate('manifest.json');
  if (!manifestPath) throw new Error('no manifest.json in any staging directory');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

  // Only what the page names, plus the loops the manifest lists. The builder
  // also writes WebP twins and every rung of its encoding ladder; measured on
  // these captures, mozjpeg beat WebP for the stills, and the ladder is a
  // decision record, not a delivery.
  const html0 = readFileSync(INDEX_PATH, 'utf8');
  const wanted = new Set([...html0.matchAll(REFERENCE_RE)].map((m) => `${m[1]}.${m[2]}`));
  for (const video of Object.values(manifest.videos || {})) {
    for (const source of video.sources || []) {
      if (!NOT_SERVED.has(source.file)) wanted.add(source.file);
    }
  }
  const published = new Map();
  const payload = [];
  for (const file of [...wanted].sort()) {
    const full = locate(file);
    if (!full) continue; // reported below as missing, if the page names it
    const bytes = readFileSync(full);
    const hashed = hashedName(file, bytes);
    published.set(file, hashed);
    payload.push({ file, full, hashed, bytes: bytes.length });
  }

  const html = html0;
  const { html: nextHtml, missing } = rewriteReferences(html, published);
  if (missing.length) {
    console.error(`index.html references media that were not built:\n  ${missing.join('\n  ')}`);
    process.exit(1);
  }

  const videos = {};
  for (const [kind, video] of Object.entries(manifest.videos || {})) {
    const sources = (video.sources || []).filter((source) => published.has(source.file));
    if (!sources.length) throw new Error(`the ${kind} loop lists no published file`);
    const first = sources[0];
    videos[kind] = {
      aspect: +(first.width / first.height).toFixed(6),
      fps: video.fps || first.fps,
      durationS: video.durationS,
      orbit: video.orbit,
      renditions: sources.map((source) => ({
        src: `/landing/${published.get(source.file)}`,
        mime: source.mime,
        codec: source.codec,
        width: source.width,
        height: source.height,
        bytes: source.bytes,
        bitrateKbps: source.bitrateKbps,
      })),
    };
  }
  const loopModule = `// GENERATED by \`npm run landing:assets\` (scripts/publish-landing-assets.mjs) from
// the capture's own record. Do not edit by hand: re-record instead.
//
// The recorded hero loops: every rendition the page may choose between
// (src/vitrine/renditions.js), and the camera law each loop was filmed with,
// which src/vitrine/handoff.js evaluates at the video's clock.
export const HERO_LOOP = Object.freeze(${JSON.stringify({ capturedAt: manifest.capture?.desktop?.capturedAt || manifest.generatedAt || null, videos }, null, 2)});
`;

  const total = payload.reduce((sum, item) => sum + item.bytes, 0);
  for (const item of payload.sort((a, b) => a.file.localeCompare(b.file))) {
    console.log(`  ${item.hashed.padEnd(44)} ${(item.bytes / 1024).toFixed(1).padStart(8)} kB`);
  }
  console.log(`${payload.length} files, ${(total / 1024 / 1024).toFixed(2)} MB`);
  if (checkOnly) {
    const current = existsSync(PUBLIC_DIR) ? new Set(readdirSync(PUBLIC_DIR)) : new Set();
    const stale = [...published.values()].filter((name) => !current.has(name));
    console.log(stale.length ? `DRIFT: ${stale.length} file(s) to publish` : 'published media are current');
    process.exit(stale.length || nextHtml !== html ? 1 : 0);
  }
  mkdirSync(PUBLIC_DIR, { recursive: true });
  const keep = new Set(published.values());
  for (const old of readdirSync(PUBLIC_DIR)) {
    if (!keep.has(old)) rmSync(path.join(PUBLIC_DIR, old));
  }
  for (const item of payload) copyFileSync(item.full, path.join(PUBLIC_DIR, item.hashed));
  writeFileSync(INDEX_PATH, nextHtml);
  writeFileSync(LOOP_MODULE, loopModule);
  console.log('published to public/landing/, index.html and src/vitrine/heroLoop.js rewritten');
}
