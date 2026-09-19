#!/usr/bin/env node
/**
 * Encode the gallery's loops for the page: six views and the voice answer,
 * each in the widths the stills already come in, each as light as it can be.
 *
 *     node scripts/build-landing-gallery.mjs                       # from .context/landing-assets/galerie/raw
 *     node scripts/build-landing-gallery.mjs --raw .context/landing-assets/galerie/rehearsal
 *     node scripts/build-landing-gallery.mjs --gif                 # plus a GIF per view, for the README
 *     node scripts/build-landing-gallery.mjs --hero-gif .context/landing-assets/hq-v2/raw
 *                                          # the README's head: the hero loop, docs/media/surplomb-hero.gif
 *
 * Input: the masters `scripts/capture-landing-gallery.mjs` assembled (lossless,
 * 1440×873, 30 fps, seamless). Output: `--out` with STABLE names —
 * `scripts/publish-landing-assets.mjs` fingerprints them into `public/landing/`
 * and writes `src/vitrine/galleryLoops.js`, so a name here is a contract with
 * that step:
 *
 *   view-0N-{480,960,1440}-{av1,h264[,hevc]}.mp4   the loops
 *   voice-bus-{600,1200}-{av1,h264[,hevc]}.mp4      the voice answer, a band of view 05
 *   view-0N-{480,960,1440}.jpg, voice-bus-{600,1200}.jpg
 *                                                   the stills, REPLACED by frame 0 of the loop
 *
 * WHY THE STILLS ARE REPLACED. The page shows the still until the loop plays
 * and fades the loop in over it (and keeps the still for a reader who asked
 * for less motion, less data, or whose browser would not play). A still from
 * another day, another traffic, another cockpit, would jump at the fade. So
 * the still is frame 0 of the loop, decoded as a browser decodes it.
 *
 * WHY A QUALITY TARGET AND NOT A BYTE BUDGET. The hero fills a budget because
 * the whole city moves under its orbit. A thumbnail with a fixed camera is a
 * still picture with a few moving dots: the bytes it needs vary tenfold from
 * one view to the next. So each (loop, width, codec) climbs a constant-quality
 * ladder from the lightest rung, and stops at the first one that reaches
 * `VMAF_TARGET` against the lossless reference of that width — never more
 * bytes than that — under a hard cap that no rung may cross. Every rung is
 * encoded with its own first seconds appended and cut back (the hero's seam
 * fix, `encodeRung`), so the loop point is never the end of a stream.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import sharp from 'sharp';
import { COLOUR_PARAMS, COLOUR_TAGS } from './capture-landing-hero.mjs';
import {
  codecsParameter,
  countFrames,
  encodeRung,
  ffmpeg,
  frameAsPng,
  probe,
  vmafOf,
  writeImage,
} from './build-landing-assets.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KB = 1_000;

/** Bump when the recipe below changes: an encode carrying another recipe is redone. */
const RECIPE = 'landing-gallery-v1';

/**
 * The seven loops. The voice answer is the band of view 05 the page frames
 * at 2.9:1 (`.bus`), centred 60 % of the way down as the still's band was,
 * which also keeps the cockpit's bottom dock out of it (rows 275–771 of 872;
 * the dock starts at ~795).
 */
export const GALLERY_LOOPS = Object.freeze([
  ...['01', '02', '03', '04', '05', '06'].map((id) => Object.freeze({
    key: `view:${id}`, stem: `view-${id}`, view: id, widths: [480, 960, 1440], band: null,
  })),
  Object.freeze({ key: 'voice-response', stem: 'voice-bus', view: '05', widths: [600, 1200],
    band: Object.freeze({ centreY: 0.6, aspect: 2.9 }) }),
]);

/**
 * Constant-quality ladders, lightest first. H.264 is the fallback every
 * browser plays; HEVC (`--hevc`) is for Safari on a Mac or iPhone without AV1
 * — measured, then kept or not (see the report).
 */
export const LADDER = Object.freeze({
  av1: [63, 59, 55, 51, 47, 43, 39],
  hevc: [40, 37, 34, 31, 28, 25],
  h264: [38, 35, 32, 29, 26, 23],
});

/** One keyframe per loop: the loop plus the tail `encodeRung` appends, and more. */
const GOP = 600;

/** Scored against the lossless reference of the same width (model v0.6.1). */
export const VMAF_TARGET = 90;

/** No rung may weigh more than this, whatever its quality — and no file a megabyte. */
export const CAP_BYTES = Object.freeze({ 480: 300 * KB, 600: 300 * KB, 960: 700 * KB, 1200: 700 * KB, 1440: 1000 * KB });

/**
 * The 1440 exists for a Retina screen of 1 800 px and more, where the
 * thumbnail is drawn ~1 100 px wide. There H.264 needed twice AV1's bytes for
 * the same score (1 037 kB against 553 kB on the traffic view, rehearsal
 * 2026-09-19), so a browser without AV1 — Safari on a Mac before M3 — gets
 * the 960 H.264 instead, 15 % short of its need: the choice in
 * src/vitrine/renditions.js steps down on its own when a width has nothing
 * this browser can play.
 */
export const CODECS_BY_WIDTH = Object.freeze({ 1440: Object.freeze(['av1']) });

/** Browsers take the first playable `<source>`: best codec first. */
const PREFERENCE = ['av1', 'hevc', 'h264'];

/**
 * README GIFs: one palette per clip, and the largest of these steps that
 * stays under the byte ceiling. A GIF has no motion compensation: an orbit
 * repaints every pixel of every frame (6.8 MB at 640 px, 15 fps, rehearsal).
 */
export const GIF = Object.freeze({
  maxBytes: 4_000_000,
  steps: Object.freeze([{ width: 640, fps: 15 }, { width: 560, fps: 12 }, { width: 480, fps: 12 }, { width: 480, fps: 10 },
    { width: 400, fps: 10 }, { width: 320, fps: 10 }]),
});

const log = (...args) => console.log(...args);
const round2 = (v) => Number(v.toFixed(2));

function parseCli(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      raw: { type: 'string', default: '.context/landing-assets/galerie/raw' },
      out: { type: 'string', default: '.context/landing-assets/galerie/out' },
      work: { type: 'string' },
      only: { type: 'string' },
      hevc: { type: 'boolean', default: false },
      gif: { type: 'boolean', default: false },
      'hero-gif': { type: 'string' },
      reencode: { type: 'boolean', default: false },
      target: { type: 'string' },
    },
  });
  const out = path.resolve(ROOT, values.out);
  return {
    raw: path.resolve(ROOT, values.raw),
    out,
    work: path.resolve(ROOT, values.work || path.join(values.out, 'work')),
    only: values.only ? new Set(values.only.split(',')) : null,
    codecs: values.hevc ? ['av1', 'hevc', 'h264'] : ['av1', 'h264'],
    gif: values.gif,
    heroGif: values['hero-gif'] ? path.resolve(ROOT, values['hero-gif']) : null,
    reencode: values.reencode,
    target: values.target ? Number(values.target) : VMAF_TARGET,
  };
}

/**
 * The band of a frame the voice answer shows, in source pixels, even-sized.
 * @param {{width: number, height: number}} frame
 * @param {{centreY: number, aspect: number}} band
 */
export function bandRect(frame, band) {
  const height = 2 * Math.round(frame.width / band.aspect / 2);
  const top = Math.max(0, Math.min(frame.height - height, Math.round(frame.height * band.centreY - height / 2)));
  return { x: 0, y: top, width: frame.width, height };
}

/**
 * Walk a ladder lightest first; keep the first rung at or above the target.
 * If the target is out of reach under the cap, keep the best rung under it.
 * Pure: `encode(crf)` returns `{bytes, vmaf}`.
 */
export async function climbLadder(crfs, encode, { target, capBytes }) {
  const tried = [];
  let best = null;
  for (const crf of crfs) {
    const rung = { crf, ...await encode(crf) };
    tried.push(rung);
    if (rung.bytes > capBytes) break;
    best = rung;
    if (rung.vmaf >= target) return { chosen: rung, tried, reached: true };
  }
  if (!best) throw new Error(`even CRF ${crfs[0]} weighs ${tried[0].bytes} B, over the ${capBytes} B cap`);
  return { chosen: best, tried, reached: false };
}

/** The lossless reference a width is encoded from and scored against. */
function reference({ master, loop, width, work, frame }) {
  const band = loop.band ? bandRect(frame, loop.band) : null;
  // The band is in the name: moving it must not reuse the old cut.
  const file = path.join(work, `ref-${loop.stem}-${width}${band ? `-y${band.y}h${band.height}` : ''}.mkv`);
  if (existsSync(file) && statSync(file).mtimeMs > statSync(master).mtimeMs) return file;
  const crop = band ? `crop=${band.width}:${band.height}:${band.x}:${band.y},` : '';
  ffmpeg(['-i', master, '-vf', `${crop}scale=${width}:-2:flags=lanczos,format=yuv420p,${COLOUR_PARAMS}`,
    '-c:v', 'libx264', '-qp', '0', '-preset', 'veryfast', '-an', ...COLOUR_TAGS, file]);
  return file;
}

async function buildLoop({ loop, capture, options }) {
  const { out, work, codecs, target, reencode } = options;
  const master = path.join(ROOT, capture.loop.master);
  const masterInfo = probe(master);
  const durationS = masterInfo.durationS;
  const sources = [];
  const ladders = {};
  for (const width of loop.widths) {
    if (width > masterInfo.width) throw new Error(`${loop.stem}: ${width} px asked of a ${masterInfo.width} px master`);
    const ref = reference({ master, loop, width, work, frame: masterInfo });
    for (const codec of codecs.filter((c) => !CODECS_BY_WIDTH[width] || CODECS_BY_WIDTH[width].includes(c))) {
      const name = `${loop.stem}-${width}-${codec}`;
      const encode = async (crf) => {
        const output = path.join(work, `${name}-crf${crf}.mp4`);
        const recipe = `${RECIPE} ${codec} crf=${crf} g=${GOP}`;
        const reusable = !reencode && existsSync(output) && existsSync(`${output}.json`)
          && statSync(output).mtimeMs > statSync(ref).mtimeMs && probe(output).comment === recipe;
        if (reusable) return JSON.parse(readFileSync(`${output}.json`, 'utf8'));
        const encoded = encodeRung({ codec, level: { crf }, input: ref, output, durationS, work, recipe, gop: GOP });
        if (countFrames(output) !== encoded.frames) throw new Error(`${output}: wrong frame count`);
        const vmaf = vmafOf({ dist: output, ref, work, fps: encoded.fps });
        const result = { bytes: statSync(output).size, vmaf: vmaf.mean, vmafMin: vmaf.min, vmafLast: vmaf.last,
          encodeS: encoded.encodeS, file: output };
        writeFileSync(`${output}.json`, JSON.stringify(result));
        return result;
      };
      const { chosen, tried, reached } = await climbLadder(LADDER[codec], encode, { target, capBytes: CAP_BYTES[width] });
      ladders[name] = tried.map(({ crf, bytes, vmaf, vmafMin }) => ({ crf, bytes, vmaf, vmafMin }));
      const file = `${name}.mp4`;
      writeFileSync(path.join(out, file), readFileSync(chosen.file));
      const info = probe(path.join(out, file));
      sources.push({
        file, codec, width: info.width, height: info.height, fps: info.fps, durationS: info.durationS,
        bytes: chosen.bytes, bitrateKbps: Math.round((chosen.bytes * 8) / info.durationS / 1000),
        crf: chosen.crf, vmaf: chosen.vmaf, vmafMin: chosen.vmafMin, reachedTarget: reached,
        mime: `video/mp4; codecs="${codecsParameter(path.join(out, file))}"`,
      });
      log(`${file.padEnd(28)} ${info.width}×${info.height}  ${String(Math.round(chosen.bytes / KB)).padStart(5)} kB  `
        + `CRF ${chosen.crf}  VMAF ${chosen.vmaf} (min ${chosen.vmafMin})${reached ? '' : `  BELOW TARGET ${target}`}`
        + `  — ladder ${tried.map((r) => `${r.crf}:${Math.round(r.bytes / KB)}kB/${r.vmaf}`).join(' ')}`);
    }
  }
  sources.sort((a, b) => a.width - b.width || PREFERENCE.indexOf(a.codec) - PREFERENCE.indexOf(b.codec));

  // The stills: frame 0 of the best file at the largest width, as a browser decodes it.
  const top = sources.filter((s) => s.width === Math.max(...loop.widths))
    .sort((a, b) => PREFERENCE.indexOf(a.codec) - PREFERENCE.indexOf(b.codec))[0];
  const frame0 = frameAsPng({ file: path.join(out, top.file), index: 0, output: path.join(work, `${loop.stem}-frame0.png`) });
  const stills = [];
  for (const width of loop.widths) {
    const written = await writeImage({ out, name: `${loop.stem}-${width}`,
      make: () => sharp(frame0).resize({ width, kernel: 'lanczos3' }) });
    // The page names JPEG stills only (mozjpeg beat WebP on these captures).
    for (const entry of written) {
      if (entry.file.endsWith('.webp')) rmSync(path.join(out, entry.file), { force: true });
      else stills.push(entry);
    }
  }
  return {
    entry: {
      stem: loop.stem,
      view: loop.view,
      durationS: round2(durationS),
      fps: masterInfo.fps,
      aspect: round2(sources[0].width / sources[0].height),
      speed: capture.speed || 1,
      camera: capture.orbit?.amplitudeDeg ? `orbit ±${capture.orbit.amplitudeDeg}°` : 'fixed',
      motion: capture.loop.motion ?? null,
      sources,
      stills: stills.map(({ file, width, height, bytes }) => ({ file, width, height, bytes })),
    },
    ladders,
  };
}

/** A looping GIF of a master, as large as fits under {@link GIF}'s ceiling. */
export function buildGif({ master, file, window = null, minWidth = 0 }) {
  mkdirSync(path.dirname(file), { recursive: true });
  // A window of a longer loop: [start, end] with its last `crossfadeS` blended
  // into the moment before `start`, the loops' own seam, so it loops too. Only
  // valid where the camera is in the same pose at `start` and `end`.
  const cut = window
    ? `[0:v]split[x][y];[x]trim=start=${window.start}:end=${window.end},setpts=PTS-STARTPTS[A];`
      + `[y]trim=start=${window.start - window.crossfadeS}:end=${window.start},setpts=PTS-STARTPTS[P];`
      + `[A][P]xfade=transition=fade:duration=${window.crossfadeS}:offset=${window.end - window.start - window.crossfadeS}[w];[w]`
    : '[0:v]';
  for (const step of GIF.steps.filter((st) => st.width >= minWidth)) {
    ffmpeg(['-i', master, '-filter_complex',
      `${cut}fps=${step.fps},scale=${step.width}:-2:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];`
      + '[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle', '-loop', '0', file]);
    const bytes = statSync(file).size;
    if (bytes <= GIF.maxBytes) return { file: path.relative(ROOT, file), bytes, ...step, window };
  }
  return null;
}

/**
 * The README's head: the hero loop as a GIF, at least 480 px wide if it can
 * be. The whole 18 s orbit first; then windows centred on the orbit's far
 * point, where the camera is slowest — the law is symmetric about 9 s, so the
 * pose at 9 − h and 9 + h is the same and the window loops with the video's
 * own cross-fade. Measured on the hero (2026-09-19): 18 s does not fit at any
 * readable width, 6 s fits at 400 px, 4 s at 480 px and 10 fps (3.3 MB).
 */
export function buildHeroGif({ raw, file }) {
  const report = JSON.parse(readFileSync(path.join(raw, 'hero-capture.json'), 'utf8'));
  const loop = report.desktop?.loop;
  if (!loop) throw new Error(`no desktop hero loop in ${raw}`);
  const master = path.join(ROOT, loop.master);
  const middle = (report.desktop.orbit?.periodS ?? 18) / 2;
  const windowOf = (half) => ({ start: middle - half, end: middle + half, crossfadeS: 0.5 });
  const attempts = [
    { window: null, minWidth: 480 },
    { window: windowOf(3), minWidth: 480 },
    { window: windowOf(2), minWidth: 480 },
    { window: windowOf(3), minWidth: 0 },
  ];
  for (const attempt of attempts) {
    const built = buildGif({ master, file, ...attempt });
    if (built) return built;
  }
  throw new Error(`${file}: over ${GIF.maxBytes} B even as a 6 s window at ${JSON.stringify(GIF.steps.at(-1))}`);
}

async function main() {
  const options = parseCli(process.argv.slice(2));
  if (options.heroGif) {
    const gif = buildHeroGif({ raw: options.heroGif, file: path.join(ROOT, 'docs', 'media', 'surplomb-hero.gif') });
    log(`hero gif: ${gif.file} ${Math.round(gif.bytes / KB)} kB (${gif.width} px, ${gif.fps} fps${gif.window ? `, ${gif.window.start}–${gif.window.end} s` : ', whole loop'})`);
    return;
  }
  const reportFile = path.join(options.raw, 'gallery-capture.json');
  if (!existsSync(reportFile)) throw new Error(`no ${reportFile} — run scripts/capture-landing-gallery.mjs first`);
  const report = JSON.parse(readFileSync(reportFile, 'utf8'));
  for (const dir of [options.out, options.work]) mkdirSync(dir, { recursive: true });
  const manifestFile = path.join(options.out, 'manifest.json');
  const previous = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, 'utf8')) : {};
  const gallery = { ...(previous.gallery || {}) };
  const ladders = { ...(previous.ladders || {}) };
  const gifs = { ...(previous.gifs || {}) };
  const started = Date.now();
  for (const loop of GALLERY_LOOPS) {
    if (options.only && !options.only.has(loop.view) && !options.only.has(loop.key)) continue;
    const capture = report.views?.[loop.view];
    if (!capture?.loop) {
      log(`${loop.key}: no assembled loop for view ${loop.view} in ${reportFile}, skipped`);
      continue;
    }
    const built = await buildLoop({ loop, capture, options });
    gallery[loop.key] = built.entry;
    Object.assign(ladders, built.ladders);
    if (options.gif && !loop.band) {
      gifs[loop.key] = buildGif({ master: path.join(ROOT, capture.loop.master),
        file: path.join(options.out, 'gif', `${loop.stem}.gif`) });
      if (!gifs[loop.key]) throw new Error(`${loop.stem}.gif: over ${GIF.maxBytes} B at every size`);
    }
  }
  const files = {};
  for (const entry of Object.values(gallery)) {
    for (const f of [...entry.sources, ...entry.stills]) files[f.file] = { width: f.width, height: f.height, bytes: f.bytes };
  }
  const manifest = {
    generatedAt: new Date().toISOString(),
    recipe: RECIPE,
    vmafTarget: options.target,
    capture: { ...report.capture, rehearsal: Object.values(report.views || {}).some((v) => v.rehearsal),
      capturedAt: Object.values(report.views || {}).map((v) => v.capturedAt).sort().at(-1) ?? null },
    gallery,
    ladders,
    gifs,
    files,
  };
  writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);

  const pad = (v, n) => String(v).padEnd(n);
  log(`\n${pad('loop', 16)}${pad('width', 7)}${PREFERENCE.filter((c) => options.codecs.includes(c)).map((c) => pad(`${c} kB`, 10)).join('')}still kB`);
  for (const [key, entry] of Object.entries(gallery)) {
    for (const width of [...new Set(entry.sources.map((s) => s.width))]) {
      const cells = PREFERENCE.filter((c) => options.codecs.includes(c))
        .map((c) => entry.sources.find((s) => s.width === width && s.codec === c))
        .map((s) => pad(s ? Math.round(s.bytes / KB) : '—', 10)).join('');
      const still = entry.stills.find((s) => s.width === width);
      log(`${pad(key, 16)}${pad(width, 7)}${cells}${still ? Math.round(still.bytes / KB) : '—'}`);
    }
  }
  for (const [key, gif] of Object.entries(gifs)) {
    log(`gif ${key}: ${gif.file} ${Math.round(gif.bytes / KB)} kB (${gif.width ?? '?'} px, ${gif.fps ?? '?'} fps)`);
  }
  log(`manifest: ${path.relative(ROOT, manifestFile)}; ${Math.round((Date.now() - started) / 1000)} s`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
