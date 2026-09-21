#!/usr/bin/env node
/**
 * Encode a finished film for a box of the gallery, in place of its recorded
 * loop.
 *
 *     node scripts/build-landing-film.mjs --view 01 --src ~/Downloads/surplomb-roissy-v9b.mp4
 *     node scripts/build-landing-film.mjs --view 04 --src ~/Downloads/surplomb-grid-v4.mp4 --start 3
 *     node scripts/publish-landing-assets.mjs        # film/view-<nn> come first in its --from
 *
 * The gallery's loops are six seconds of a fixed camera
 * (scripts/capture-landing-gallery.mjs); from a few metres away they read as
 * stills. A film is cut elsewhere, from the app: the Roissy scene (#315) is
 * 29 s at 1920×1080 that takes off down runway 09R, follows a departure into
 * its Cockpit and climbs to the noise plan; the power grid's (view 04) is
 * 14.7 s that lights France up inside a dark Europe, fills the nuclear plants'
 * columns, dives onto Cruas and switches the country off again. A film
 * replaces its view's loop under the SAME names
 * (`view-<nn>-{480,960,1440}-<codec>.mp4`, `view-<nn>-<width>.jpg`), so
 * `scripts/publish-landing-assets.mjs` serves it wherever it finds this
 * directory's manifest before the gallery's.
 *
 * What changes from the gallery's recipe (scripts/build-landing-gallery.mjs):
 *
 *   - THE FIRST FRAME. The still is frame 0 of the file, and it is all a
 *     reader with reduced motion, data saver or an iPhone in Low Power Mode
 *     ever sees. The grid film opens on Europe unlit, which says nothing of a
 *     power grid, so `--start` turns the film round instead of picking
 *     another still: the file starts at that second, runs to the end and
 *     wraps to the opening. Its last frame is the source frame just before
 *     `--start`, so the loop point is as continuous as any other pair of
 *     frames, and the film's own end-to-start cut stays inside the file,
 *     where the loop would have put it anyway.
 *   - THE SHAPE. The box is 1.65:1 (landing.css, `.view-image`) and the film
 *     16:9. It is cropped to the box here, centred, rather than by
 *     `object-fit: cover` in the page: the files are 7 % lighter, and the
 *     still and the film crop the same way by construction.
 *   - THE KEYFRAMES. The loops have one; a film seeks. The page swaps the 960
 *     for the 1440 at the SAME instant when the reader enlarges the box
 *     (src/vitrine/gallery.js), and a seek costs the decode from the previous
 *     keyframe: {@link GOP} keeps that under 4 s of film.
 *   - HEVC, AND H.264 AT 480 ONLY. A Mac or an iPhone without AV1 (Safari
 *     before M3 / A17 Pro) decodes HEVC in hardware. H.264 at the film's
 *     weights lost: measured on this film (2026-09-21), the 960 H.264 read
 *     VMAF 82 at 3.1 MB and needed 4.7 MB for 89, where AV1 reached 91 at
 *     2.8 MB. The 480 H.264 stays for a browser that reads neither; it is
 *     blown up, and it plays.
 *   - THE CAPS. A flying camera repaints the frame; {@link CAP_BYTES} is sized
 *     for 29 s of that, not six seconds of a still.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
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
import { climbLadder, VMAF_TARGET } from './build-landing-gallery.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KB = 1_000;
const MB = 1_000_000;

/** Bump when the recipe below changes: an encode carrying another recipe is redone. */
const RECIPE = 'landing-film-v1';

/** `.view-image { aspect-ratio: 1.65 }` (landing.css). */
export const BOX_ASPECT = 1.65;

/** The codecs of each width a film is encoded at. */
export const CODECS_BY_WIDTH = Object.freeze({
  480: Object.freeze(['av1', 'hevc', 'h264']),
  960: Object.freeze(['av1', 'hevc']),
  1440: Object.freeze(['av1', 'hevc']),
});

/**
 * The box a film plays in and the stem of its files: the `data-view` and
 * `data-media` of that box in index.html, and the names its loop already had.
 * @param {string} view two digits, `01` to `06`
 */
export function filmFor(view) {
  if (!/^0[1-6]$/.test(view)) throw new Error(`--view takes 01 to 06, not ${view}`);
  return Object.freeze({ key: `view:${view}`, stem: `view-${view}`, view, codecsByWidth: CODECS_BY_WIDTH });
}

/**
 * The filter that makes a width's reference from the source film: turned
 * round to begin at `startFrame` (see THE FIRST FRAME above), then cropped to
 * the box and scaled. Frame numbers, not seconds, so no frame is dropped or
 * repeated at the join.
 * @param {{crop: {x: number, y: number, width: number, height: number}, width: number, startFrame: number}} args
 */
export function referenceFilter({ crop, width, startFrame }) {
  const shape = `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},scale=${width}:-2:flags=lanczos,`
    + `format=yuv420p,${COLOUR_PARAMS}`;
  if (!startFrame) return `[0:v]${shape}[v]`;
  return `[0:v]split[head][tail];`
    + `[tail]trim=start_frame=${startFrame},setpts=PTS-STARTPTS[late];`
    + `[head]trim=end_frame=${startFrame},setpts=PTS-STARTPTS[early];`
    + `[late][early]concat=n=2:v=1:a=0,${shape}[v]`;
}

/**
 * Constant-quality ladders, lightest first. The gallery's start at CRF 63,
 * where a still thumbnail already reads well; this film scored 65 there
 * (480 AV1) and settled at 47–51, so its ladders start where it can land.
 */
export const LADDER = Object.freeze({
  av1: Object.freeze([55, 51, 47, 43, 39]),
  hevc: Object.freeze([34, 31, 28, 25]),
  h264: Object.freeze([32, 29, 26, 23]),
});

/** Four seconds at 30 fps. */
export const GOP = 120;

/** No rung may weigh more than this, whatever its quality. */
export const CAP_BYTES = Object.freeze({ 480: 1.5 * MB, 960: 4 * MB, 1440: 8 * MB });

/** Browsers take the first playable `<source>`: best codec first. */
const PREFERENCE = ['av1', 'hevc', 'h264'];

const log = (...args) => console.log(...args);
const round2 = (v) => Number(v.toFixed(2));
const even = (v) => 2 * Math.round(v / 2);

/**
 * The part of a frame the box shows, centred, even-sized: full height when
 * the frame is wider than the box, full width when it is taller.
 * @param {{width: number, height: number}} frame
 * @param {number} aspect
 */
export function boxCrop(frame, aspect) {
  if (frame.width / frame.height >= aspect) {
    const width = Math.min(frame.width, even(frame.height * aspect));
    return { x: even((frame.width - width) / 2), y: 0, width, height: frame.height };
  }
  const height = Math.min(frame.height, even(frame.width / aspect));
  return { x: 0, y: even((frame.height - height) / 2), width: frame.width, height };
}

function parseCli(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      src: { type: 'string' },
      view: { type: 'string', default: '01' },
      start: { type: 'string', default: '0' },
      out: { type: 'string' },
      work: { type: 'string' },
      reencode: { type: 'boolean', default: false },
      target: { type: 'string' },
    },
  });
  if (!values.src) throw new Error('--src <film.mp4> is required');
  const film = filmFor(values.view);
  const startS = Number(values.start);
  if (!(startS >= 0)) throw new Error(`--start takes seconds, not ${values.start}`);
  const outArg = values.out || `.context/landing-assets/film/${film.stem}`;
  return {
    film,
    startS,
    src: path.resolve(values.src.replace(/^~(?=\/)/, process.env.HOME || '~')),
    out: path.resolve(ROOT, outArg),
    work: path.resolve(ROOT, values.work || path.join(outArg, 'work')),
    reencode: values.reencode,
    target: values.target ? Number(values.target) : VMAF_TARGET,
  };
}

/** The lossless reference a width is encoded from and scored against. */
function reference({ src, film, width, work, crop, startFrame }) {
  const file = path.join(work, `ref-${film.stem}-${width}-x${crop.x}w${crop.width}-s${startFrame}.mkv`);
  if (existsSync(file) && statSync(file).mtimeMs > statSync(src).mtimeMs) return file;
  ffmpeg(['-i', src, '-filter_complex', referenceFilter({ crop, width, startFrame }), '-map', '[v]',
    '-c:v', 'libx264', '-qp', '0', '-preset', 'veryfast', '-an', ...COLOUR_TAGS, file]);
  return file;
}

async function main() {
  const options = parseCli(process.argv.slice(2));
  const { film, startS, src, out, work, reencode, target } = options;
  if (!existsSync(src)) throw new Error(`no film at ${src}`);
  for (const dir of [out, work]) mkdirSync(dir, { recursive: true });
  // A codec dropped from CODECS_BY_WIDTH must not linger here for the publish step to find.
  for (const file of readdirSync(out)) {
    if (file.startsWith(`${film.stem}-`) && file.endsWith('.mp4')) rmSync(path.join(out, file));
  }
  const started = Date.now();
  const info = probe(src);
  const crop = boxCrop(info, BOX_ASPECT);
  const durationS = info.durationS;
  const startFrame = Math.round(startS * info.fps);
  if (startFrame >= Math.round(durationS * info.fps)) throw new Error(`--start ${startS} s is past the film's end`);
  log(`${path.basename(src)}: ${info.width}×${info.height}, ${info.fps} fps, ${round2(durationS)} s; `
    + `box crop ${crop.width}×${crop.height} at x=${crop.x}; ${film.key}`
    + (startFrame ? `, turned round to begin at frame ${startFrame} (${round2(startFrame / info.fps)} s)` : ''));

  const sources = [];
  const ladders = {};
  for (const [widthKey, codecs] of Object.entries(film.codecsByWidth)) {
    const width = Number(widthKey);
    if (width > crop.width) throw new Error(`${width} px asked of a ${crop.width} px crop`);
    const ref = reference({ src, film, width, work, crop, startFrame });
    for (const codec of codecs) {
      const name = `${film.stem}-${width}-${codec}`;
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
      const got = probe(path.join(out, file));
      sources.push({
        file, codec, width: got.width, height: got.height, fps: got.fps, durationS: got.durationS,
        bytes: chosen.bytes, bitrateKbps: Math.round((chosen.bytes * 8) / got.durationS / 1000),
        crf: chosen.crf, vmaf: chosen.vmaf, vmafMin: chosen.vmafMin, reachedTarget: reached,
        mime: `video/mp4; codecs="${codecsParameter(path.join(out, file))}"`,
      });
      log(`${file.padEnd(28)} ${got.width}×${got.height}  ${String(Math.round(chosen.bytes / KB)).padStart(5)} kB  `
        + `CRF ${chosen.crf}  VMAF ${chosen.vmaf} (min ${chosen.vmafMin})${reached ? '' : `  BELOW TARGET ${target}`}`
        + `  — ladder ${tried.map((r) => `${r.crf}:${Math.round(r.bytes / KB)}kB/${r.vmaf}`).join(' ')}`);
    }
  }
  sources.sort((a, b) => a.width - b.width || PREFERENCE.indexOf(a.codec) - PREFERENCE.indexOf(b.codec));

  // The stills: frame 0 of the best file at the largest width, as a browser
  // decodes it — the page fades the film in over its still.
  const widths = Object.keys(film.codecsByWidth).map(Number);
  const top = sources.filter((s) => s.width === Math.max(...widths))
    .sort((a, b) => PREFERENCE.indexOf(a.codec) - PREFERENCE.indexOf(b.codec))[0];
  const frame0 = frameAsPng({ file: path.join(out, top.file), index: 0, output: path.join(work, `${film.stem}-frame0.png`) });
  const stills = [];
  for (const width of widths) {
    const written = await writeImage({ out, name: `${film.stem}-${width}`,
      make: () => sharp(frame0).resize({ width, kernel: 'lanczos3' }) });
    for (const entry of written) {
      if (entry.file.endsWith('.webp')) rmSync(path.join(out, entry.file), { force: true });
      else stills.push(entry);
    }
  }

  const sourceBytes = readFileSync(src);
  const manifest = {
    generatedAt: new Date().toISOString(),
    recipe: RECIPE,
    vmafTarget: target,
    film: {
      file: path.basename(src),
      bytes: sourceBytes.length,
      sha256: createHash('sha256').update(sourceBytes).digest('hex'),
      width: info.width,
      height: info.height,
      crop,
      // Where the file begins in the film (THE FIRST FRAME above).
      startS: round2(startFrame / info.fps),
    },
    // The shape scripts/publish-landing-assets.mjs merges with the gallery's.
    capture: { capturedAt: new Date(statSync(src).mtimeMs).toISOString() },
    gallery: {
      [film.key]: {
        stem: film.stem,
        view: film.view,
        durationS: round2(durationS),
        fps: info.fps,
        aspect: round2(sources[0].width / sources[0].height),
        camera: 'film',
        sources,
        stills: stills.map(({ file, width, height, bytes }) => ({ file, width, height, bytes })),
      },
    },
    ladders,
  };
  writeFileSync(path.join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  for (const still of stills) log(`${still.file.padEnd(28)} ${still.width}×${still.height}  ${Math.round(still.bytes / KB)} kB`);
  log(`manifest: ${path.relative(ROOT, path.join(out, 'manifest.json'))}; ${Math.round((Date.now() - started) / 1000)} s`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
