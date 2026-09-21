#!/usr/bin/env node
/**
 * Encode a finished film for a box of the gallery, in place of its recorded
 * loop.
 *
 *     node scripts/build-landing-film.mjs --src ~/Downloads/surplomb-roissy-v9b.mp4
 *     node scripts/publish-landing-assets.mjs        # film/out is first in its --from
 *
 * The gallery's loops are six seconds of a fixed camera
 * (scripts/capture-landing-gallery.mjs); from a few metres away they read as
 * stills. A film is cut elsewhere, from the app: the Roissy scene (#315) is
 * 29 s at 1920×1080 that takes off down runway 09R, follows a departure into
 * its Cockpit and climbs to the noise plan. It replaces view 01's loop under
 * the SAME names (`view-01-{480,960,1440}-<codec>.mp4`, `view-01-<width>.jpg`),
 * so `scripts/publish-landing-assets.mjs` serves it wherever it finds this
 * directory's manifest before the gallery's.
 *
 * What changes from the gallery's recipe (scripts/build-landing-gallery.mjs):
 *
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

/** The box the film plays in, the stem of its files, and the codecs of each width. */
export const FILM = Object.freeze({
  key: 'view:01',
  stem: 'view-01',
  view: '01',
  codecsByWidth: Object.freeze({
    480: Object.freeze(['av1', 'hevc', 'h264']),
    960: Object.freeze(['av1', 'hevc']),
    1440: Object.freeze(['av1', 'hevc']),
  }),
});

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
      out: { type: 'string', default: '.context/landing-assets/film/out' },
      work: { type: 'string' },
      reencode: { type: 'boolean', default: false },
      target: { type: 'string' },
    },
  });
  if (!values.src) throw new Error('--src <film.mp4> is required');
  const out = path.resolve(ROOT, values.out);
  return {
    src: path.resolve(values.src.replace(/^~(?=\/)/, process.env.HOME || '~')),
    out,
    work: path.resolve(ROOT, values.work || path.join(values.out, 'work')),
    reencode: values.reencode,
    target: values.target ? Number(values.target) : VMAF_TARGET,
  };
}

/** The lossless reference a width is encoded from and scored against. */
function reference({ src, width, work, crop }) {
  const file = path.join(work, `ref-${FILM.stem}-${width}-x${crop.x}w${crop.width}.mkv`);
  if (existsSync(file) && statSync(file).mtimeMs > statSync(src).mtimeMs) return file;
  ffmpeg(['-i', src, '-vf',
    `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},scale=${width}:-2:flags=lanczos,format=yuv420p,${COLOUR_PARAMS}`,
    '-c:v', 'libx264', '-qp', '0', '-preset', 'veryfast', '-an', ...COLOUR_TAGS, file]);
  return file;
}

async function main() {
  const options = parseCli(process.argv.slice(2));
  const { src, out, work, reencode, target } = options;
  if (!existsSync(src)) throw new Error(`no film at ${src}`);
  for (const dir of [out, work]) mkdirSync(dir, { recursive: true });
  // A codec dropped from FILM must not linger here for the publish step to find.
  for (const file of readdirSync(out)) {
    if (file.startsWith(`${FILM.stem}-`) && file.endsWith('.mp4')) rmSync(path.join(out, file));
  }
  const started = Date.now();
  const info = probe(src);
  const crop = boxCrop(info, BOX_ASPECT);
  const durationS = info.durationS;
  log(`${path.basename(src)}: ${info.width}×${info.height}, ${info.fps} fps, ${round2(durationS)} s; `
    + `box crop ${crop.width}×${crop.height} at x=${crop.x}`);

  const sources = [];
  const ladders = {};
  for (const [widthKey, codecs] of Object.entries(FILM.codecsByWidth)) {
    const width = Number(widthKey);
    if (width > crop.width) throw new Error(`${width} px asked of a ${crop.width} px crop`);
    const ref = reference({ src, width, work, crop });
    for (const codec of codecs) {
      const name = `${FILM.stem}-${width}-${codec}`;
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
  const widths = Object.keys(FILM.codecsByWidth).map(Number);
  const top = sources.filter((s) => s.width === Math.max(...widths))
    .sort((a, b) => PREFERENCE.indexOf(a.codec) - PREFERENCE.indexOf(b.codec))[0];
  const frame0 = frameAsPng({ file: path.join(out, top.file), index: 0, output: path.join(work, `${FILM.stem}-frame0.png`) });
  const stills = [];
  for (const width of widths) {
    const written = await writeImage({ out, name: `${FILM.stem}-${width}`,
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
    },
    // The shape scripts/publish-landing-assets.mjs merges with the gallery's.
    capture: { capturedAt: new Date(statSync(src).mtimeMs).toISOString() },
    gallery: {
      [FILM.key]: {
        stem: FILM.stem,
        view: FILM.view,
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
