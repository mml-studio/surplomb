#!/usr/bin/env node
/**
 * Build the landing page's media: the hero loops, their posters, the gallery
 * thumbnails, the microphone and the voice-answer band.
 *
 *     node scripts/build-landing-assets.mjs
 *     node scripts/build-landing-assets.mjs --skip-video      # images only, seconds instead of minutes
 *
 * Inputs: `--raw` (the output of `scripts/capture-landing-hero.mjs`) and
 * `--phase2` (the design pack: `captures/0N-*`, `assets/grand-angle-micro.png`).
 * Output: `--out`, default `.context/landing-assets/out/`, with STABLE names —
 * a later step fingerprints them into `public/landing/` and rewrites the HTML,
 * so a name here is a contract with that step, not a cache key.
 *
 * WHY TWO-PASS BITRATE AND NOT A CRF SEARCH. The loops have a hard byte
 * budget and content that fights compression on every frame: the whole city
 * moves under the orbit and hundreds of sharp VEH-xxxx labels move on top.
 * Measured 2026-09-17 at 1600 px, CRF 28 already weighs 6.9 MB against a
 * 3.5 MB budget. A two-pass encode aimed at the budget spends those bytes
 * where the frames need them; a CRF search only finds the one quality that
 * happens to fit, and wastes the rest.
 *
 * WHY THE POSTERS ARE CUT FROM THE ENCODED VIDEO. The page shows the poster
 * until the video plays, and swaps the paused frame for the live globe on a
 * click. Any difference between poster and frame 0 — resampling, colour
 * matrix, the encoder's own softening — reads as a jump. So the poster is
 * frame 0 as a browser would decode it, and the build checks its colour
 * against the screencast frame it came from.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Colour contract of every video, as in `capture-landing-hero.mjs`: limited
 * range, BT.709 matrix and primaries, sRGB transfer (the pixels are a screen
 * capture). Keep the two scripts in step.
 */
const COLOUR_TAGS = ['-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'iec61966-2-1'];
const COLOUR_PARAMS = 'setparams=range=tv:colorspace=bt709:color_primaries=bt709:color_trc=iec61966-2-1';

/** Megabytes as the brief counts them. */
const MB = 1_000_000;
const KB = 1_000;

/**
 * The two loops. Desktop is cut down from the 1920 capture to 1600: at the
 * same byte budget it keeps the VEH labels legible, where 1280 turns them to
 * smudges. Phone stays at its native 780 — no resample at all, and the
 * poster the page asks for is exactly that width.
 */
const VIDEOS = Object.freeze({
  desktop: { width: 1600, budgetBytes: 3.5 * MB, posterWidths: [1280, 1600] },
  phone: { width: 780, budgetBytes: 1.5 * MB, posterWidths: [780, 1170] },
});

const QUALITY = Object.freeze({ webp: 78, jpeg: 76, microWebp: 85 });
/** Lowest quality a budget may push an image to before the build fails. */
const QUALITY_FLOOR = 50;

const VIEWS = Object.freeze([
  ['01', 'captures/01-roissy-avions.png'],
  ['02', 'captures/02-lyon-ventes.png'],
  ['03', 'captures/03-paris-trafic.jpg'],
  ['04', 'captures/04-reseau-electrique.png'],
  ['05', 'captures/05-bordeaux-bus.png'],
  ['06', 'captures/06-paris-velos-trottinettes.png'],
]);
const VIEW_WIDTHS = [480, 960, 1440];
/** `.view img { aspect-ratio: 1.65; object-fit: cover }` in the mock. */
const VIEW_ASPECT = 1.65;

/**
 * The voice answer shows a band of the Bordeaux capture. In the mock the
 * image is drawn 400 px tall, shifted up 150 px, in a 180 px window: rows
 * 150–330 of 400, i.e. centred 60 % of the way down the source. The band
 * keeps that centre at the 2.9:1 the page frames it in.
 */
const BUS_BAND = Object.freeze({ source: 'captures/05-bordeaux-bus.png', centreY: 240 / 400, aspect: 2.9, widths: [600, 1200] });

const MICRO = Object.freeze({ source: 'assets/grand-angle-micro.png', widths: [768, 1448] });

/** Budgets, in bytes, keyed by output name; both formats must fit. */
const BUDGETS = Object.freeze({
  // 150, not 120: the phone's first screen is budgeted at 400 kB and the rest
  // of it weighs ~130 kB; at 120 this frame dropped below q50 (2026-09-17).
  'hero-poster-phone-780': 150 * KB,
  'hero-poster-1280': 220 * KB,
  'micro-768': 90 * KB,
  ...Object.fromEntries(VIEWS.map(([id]) => [`view-${id}-480`, 45 * KB])),
});

/** Tolerances for the orbit law against the camera the capture read. */
const LAW_TOLERANCE = Object.freeze({ metres: 2, degrees: 0.1 });

const log = (...args) => console.log(...args);

function parseCli(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      raw: { type: 'string', default: '.context/landing-assets/raw' },
      phase2: { type: 'string', default: '.context/landing-pack/retour/phase-2' },
      out: { type: 'string', default: '.context/landing-assets/out' },
      work: { type: 'string', default: '.context/landing-assets/work' },
      'skip-video': { type: 'boolean', default: false },
      reencode: { type: 'boolean', default: false },
    },
  });
  return {
    raw: path.resolve(ROOT, values.raw),
    phase2: path.resolve(ROOT, values.phase2),
    out: path.resolve(ROOT, values.out),
    work: path.resolve(ROOT, values.work),
    skipVideo: values['skip-video'],
    reencode: values.reencode,
  };
}

function run(cmd, args) {
  const result = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * MB });
  if (result.status !== 0) throw new Error(`${cmd} ${args.join(' ')}\n${result.stderr}`);
  return result.stdout;
}

const ffmpeg = (args) => run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);

function probe(file) {
  const info = JSON.parse(run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]));
  const video = info.streams.find((s) => s.codec_type === 'video');
  const [num, den] = video.r_frame_rate.split('/').map(Number);
  const firstPts = run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'frame=pts_time',
    '-read_intervals', '%+#1', '-of', 'csv=p=0', file]).trim().split('\n')[0];
  return {
    width: video.width,
    height: video.height,
    codec: video.codec_name,
    profile: video.profile,
    pixFmt: video.pix_fmt,
    colour: [video.color_range, video.color_space, video.color_primaries, video.color_transfer].join('/'),
    fps: num / den,
    durationS: Number(info.format.duration),
    audioStreams: info.streams.filter((s) => s.codec_type === 'audio').length,
    comment: info.format.tags?.comment ?? info.format.tags?.COMMENT ?? null,
    firstPtsS: Number(firstPts),
  };
}

function countFrames(file) {
  return Number(run('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0',
    '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', file]).trim());
}

/**
 * Written into every encode, and required to reuse one: bump it whenever the
 * recipe below changes, or a stale file would be kept.
 */
const ENCODE_RECIPE = 'landing-hero-v2';

/**
 * THE LOOP POINT IS WHERE A LOW-BITRATE LOOP SHOWS. Measured 2026-09-17 on
 * the plain two-pass encodes: the last frame came out 5 dB (H.264) to 8 dB
 * (VP9) below the first, so every restart snapped from soft to sharp. Two
 * causes, one fix each:
 *   - the closing cross-fade carries two sets of labels and is the most
 *     expensive second of the loop. x264 takes a zone: 2.5× the bits for the
 *     last 1.3 s (seam gap 5.4 → 0.4 dB, mean −0.5 dB, phone).
 *   - libvpx starves the end of a stream and has no zones. It encodes the loop
 *     twice over with a keyframe at the join, and the first copy is cut out
 *     without re-encoding, so its last frames are mid-stream frames (last
 *     frame 26.1 → 29.9 dB, mean +0.6 dB at a smaller size, phone).
 */
function encodeOnce({ codec, input, output, width, kbps, passlog, durationS, fps, work }) {
  const vf = `scale=${width}:-2:flags=lanczos,format=yuv420p,${COLOUR_PARAMS}`;
  const frames = Math.round(durationS * fps);
  const tags = ['-metadata', `comment=${ENCODE_RECIPE}`];
  if (codec === 'h264') {
    const zoneStart = Math.round((durationS - 1.3) * fps);
    const common = ['-i', input, '-vf', vf, '-an', '-b:v', `${kbps}k`, '-pix_fmt', 'yuv420p', ...COLOUR_TAGS,
      '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'veryslow',
      '-maxrate', `${kbps * 2}k`, '-bufsize', `${kbps * 4}k`,
      '-x264-params', `zones=${zoneStart},${frames - 1},b=2.5`, '-passlogfile', passlog];
    ffmpeg([...common, '-pass', '1', '-f', 'null', '/dev/null']);
    ffmpeg([...common, '-pass', '2', '-movflags', '+faststart', ...tags, output]);
  } else {
    const twice = path.join(work, `${path.basename(output, '.webm')}-twice.ffconcat`);
    writeFileSync(twice, `ffconcat version 1.0\nfile '${input}'\nfile '${input}'\n`);
    const double = path.join(work, `${path.basename(output, '.webm')}-twice.webm`);
    const common = ['-f', 'concat', '-safe', '0', '-i', twice, '-vf', vf, '-an', '-b:v', `${kbps}k`,
      '-pix_fmt', 'yuv420p', ...COLOUR_TAGS,
      '-c:v', 'libvpx-vp9', '-row-mt', '1', '-tile-columns', '1', '-auto-alt-ref', '1',
      '-lag-in-frames', '25', '-deadline', 'good', '-g', String(frames),
      '-force_key_frames', `0,${durationS}`, '-passlogfile', passlog];
    ffmpeg([...common, '-cpu-used', '4', '-pass', '1', '-f', 'null', '/dev/null']);
    ffmpeg([...common, '-cpu-used', '1', '-pass', '2', '-f', 'webm', double]);
    ffmpeg(['-i', double, '-t', String(durationS), '-c', 'copy', ...tags, '-f', 'webm', output]);
  }
  return statSync(output).size;
}

/** Luma PSNR against the master: the whole loop, and the two frames that meet at the seam. */
function seamQuality({ output, input, width, work }) {
  const stats = path.join(work, `psnr-${path.basename(output)}.log`);
  ffmpeg(['-i', output, '-i', input, '-lavfi',
    `[1:v]scale=${width}:-2:flags=lanczos,format=yuv420p[r];[0:v]format=yuv420p[d];[d][r]psnr=stats_file=${stats}`,
    '-f', 'null', '-']);
  const values = readFileSync(stats, 'utf8').trim().split('\n').map((line) => Number(/psnr_y:([\d.]+)/.exec(line)?.[1]));
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const round = (v) => Number(v.toFixed(2));
  return { meanDb: round(mean), firstDb: round(values[0]), lastDb: round(values.at(-1)), frames: values.length };
}

/**
 * Aim at 92 % of the budget, then correct: two-pass lands within a few
 * percent, and a miss is re-aimed by the ratio it missed by.
 */
function encodeToBudget({ codec, input, output, width, budgetBytes, durationS, fps, passlog, work }) {
  let kbps = Math.floor((budgetBytes * 8 * 0.92) / durationS / 1000);
  for (let attempt = 1; attempt <= 5; attempt++) {
    const bytes = encodeOnce({ codec, input, output, width, kbps, passlog, durationS, fps, work });
    if (bytes <= budgetBytes) return { kbps, bytes, attempts: attempt };
    log(`  ${path.basename(output)}: ${bytes} B over ${budgetBytes} at ${kbps} kbit/s, re-aiming`);
    kbps = Math.floor(kbps * (budgetBytes / bytes) * 0.97);
  }
  throw new Error(`${output}: could not fit ${budgetBytes} B`);
}

// ── Geodesy, for checking the orbit law without Cesium ─────────────────────
// Mirrors what the page will call: `Cartesian3.fromDegrees`, `camera.lookAt`
// with a HeadingPitchRange (ENU frame from the scaled surface normal), then
// the camera's own heading/pitch/cartographic readout.

const WGS84_A = 6378137;
const WGS84_F = 1 / 298.257223563;
const WGS84_B = WGS84_A * (1 - WGS84_F);
const E2 = WGS84_F * (2 - WGS84_F);
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const vadd = (a, b) => a.map((x, i) => x + b[i]);
const vscale = (a, s) => a.map((x) => x * s);
const vdot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const vcross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vunit = (a) => vscale(a, 1 / Math.hypot(...a));

function geodeticToEcef(latDeg, lonDeg, h) {
  const lat = rad(latDeg);
  const lon = rad(lonDeg);
  const n = WGS84_A / Math.sqrt(1 - E2 * Math.sin(lat) ** 2);
  return [(n + h) * Math.cos(lat) * Math.cos(lon), (n + h) * Math.cos(lat) * Math.sin(lon), (n * (1 - E2) + h) * Math.sin(lat)];
}

function ecefToGeodetic([x, y, z]) {
  const p = Math.hypot(x, y);
  let lat = Math.atan2(z, p * (1 - E2));
  let h = 0;
  for (let i = 0; i < 12; i++) {
    const n = WGS84_A / Math.sqrt(1 - E2 * Math.sin(lat) ** 2);
    h = p / Math.cos(lat) - n;
    lat = Math.atan2(z, p * (1 - (E2 * n) / (n + h)));
  }
  return { lat: deg(lat), lon: deg(Math.atan2(y, x)), height: h };
}

/** Cesium's `eastNorthUpToFixedFrame` basis at an ECEF point. */
function enuAt(point) {
  const up = vunit([point[0] / WGS84_A ** 2, point[1] / WGS84_A ** 2, point[2] / WGS84_B ** 2]);
  const east = vunit([-up[1], up[0], 0]);
  return { east, north: vcross(up, east), up };
}

/** The pose `camera.lookAt(center, HeadingPitchRange)` produces, as the camera reads it back. */
export function lookAtPose(orbit, headingOffsetDeg) {
  const center = geodeticToEcef(orbit.centerLat, orbit.centerLon, orbit.centerHeight);
  const frame = enuAt(center);
  const h = rad(orbit.headingStartDeg + headingOffsetDeg);
  const p = rad(orbit.pitchDeg);
  const local = [Math.cos(p) * Math.sin(h), Math.cos(p) * Math.cos(h), Math.sin(p)];
  const direction = vadd(vadd(vscale(frame.east, local[0]), vscale(frame.north, local[1])), vscale(frame.up, local[2]));
  const position = vadd(center, vscale(direction, -orbit.rangeM));
  const own = enuAt(position);
  const geo = ecefToGeodetic(position);
  return {
    ...geo,
    headingDeg: (deg(Math.atan2(vdot(direction, own.east), vdot(direction, own.north))) + 360) % 360,
    pitchDeg: deg(Math.asin(vdot(direction, own.up))),
  };
}

export function headingOffsetDeg(orbit, t) {
  return (orbit.amplitudeDeg * (1 - Math.cos((2 * Math.PI * t) / orbit.periodS))) / 2;
}

function poseDelta(a, b) {
  const metresPerDegLat = 111_132;
  const metresPerDegLon = 111_320 * Math.cos(rad(a.lat));
  return {
    metres: Math.hypot((a.lat - b.lat) * metresPerDegLat, (a.lon - b.lon) * metresPerDegLon, a.height - b.height),
    headingDeg: Math.abs(((a.headingDeg - b.headingDeg + 540) % 360) - 180),
    pitchDeg: Math.abs(a.pitchDeg - b.pitchDeg),
  };
}

function checkLaw(device, orbit, capture) {
  const checks = [
    { t: 0, want: capture.camera },
    { t: orbit.periodS / 2, want: capture.orbit.lookAt.maxDeviation.find((c) => c.offsetDeg === orbit.amplitudeDeg)?.cameraReadout },
  ];
  const results = [];
  for (const { t, want } of checks) {
    if (!want) continue;
    const got = lookAtPose(orbit, headingOffsetDeg(orbit, t));
    const delta = poseDelta(got, want);
    const ok = delta.metres <= LAW_TOLERANCE.metres && delta.headingDeg <= LAW_TOLERANCE.degrees
      && delta.pitchDeg <= LAW_TOLERANCE.degrees;
    results.push({ t, ok, metres: Number(delta.metres.toExponential(2)),
      headingDeg: Number(delta.headingDeg.toExponential(2)), pitchDeg: Number(delta.pitchDeg.toExponential(2)) });
    if (!ok) throw new Error(`${device}: orbit law misses the captured pose at t=${t}: ${JSON.stringify(delta)}`);
  }
  return results;
}

// ── Images ─────────────────────────────────────────────────────────────────

/**
 * Write `name.webp` (and `name.jpg` unless `webpOnly`) from a sharp pipeline
 * factory, lowering the quality of THIS image only if it breaks its budget.
 */
async function writeImage({ out, name, make, webpOnly = false, webpQuality = QUALITY.webp, keepAlpha = false }) {
  const budget = BUDGETS[name] ?? Infinity;
  const written = [];
  const formats = webpOnly ? ['webp'] : ['webp', 'jpg'];
  for (const format of formats) {
    let quality = format === 'webp' ? webpQuality : QUALITY.jpeg;
    const base = quality;
    for (;;) {
      let pipeline = await make();
      pipeline = format === 'webp'
        ? pipeline.webp({ quality, effort: 6, alphaQuality: 100 })
        : pipeline.flatten({ background: '#000' }).jpeg({ quality, mozjpeg: true, progressive: true });
      if (format === 'webp' && !keepAlpha) pipeline = pipeline.removeAlpha();
      const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
      if (data.length <= budget || quality - 4 < QUALITY_FLOOR) {
        if (data.length > budget) throw new Error(`${name}.${format}: ${data.length} B over its ${budget} B budget at q${quality}`);
        const file = `${name}.${format}`;
        writeFileSync(path.join(out, file), data);
        written.push({ file, width: info.width, height: info.height, bytes: data.length,
          quality, loweredFrom: quality !== base ? base : null });
        break;
      }
      quality -= 4;
    }
  }
  return written;
}

async function hasRealAlpha(file) {
  const image = sharp(file);
  const meta = await image.metadata();
  if (!meta.hasAlpha) return false;
  return !(await image.stats()).isOpaque;
}

async function buildViews({ phase2, out }) {
  const files = [];
  for (const [id, rel] of VIEWS) {
    const src = path.join(phase2, rel);
    const { width, height } = await sharp(src).metadata();
    // `object-fit: cover` at 1.65: keep the full width when the source is
    // taller than that, the full height when it is wider.
    const crop = width / height > VIEW_ASPECT
      ? { width: Math.round(height * VIEW_ASPECT), height }
      : { width, height: Math.round(width / VIEW_ASPECT) };
    crop.left = Math.round((width - crop.width) / 2);
    crop.top = Math.round((height - crop.height) / 2);
    for (const w of VIEW_WIDTHS) {
      const written = await writeImage({
        out,
        name: `view-${id}-${w}`,
        make: () => sharp(src).extract(crop).resize({ width: w, kernel: 'lanczos3' }),
      });
      for (const entry of written) entry.upscaled = w > crop.width ? `${crop.width} → ${w}` : null;
      files.push(...written);
    }
  }
  return files;
}

async function buildMicro({ phase2, out }) {
  const src = path.join(phase2, MICRO.source);
  const keepAlpha = await hasRealAlpha(src);
  const files = [];
  for (const w of MICRO.widths) {
    files.push(...await writeImage({
      out,
      name: `micro-${w}`,
      webpOnly: true,
      webpQuality: QUALITY.microWebp,
      keepAlpha,
      make: () => sharp(src).resize({ width: w, kernel: 'lanczos3', withoutEnlargement: true }),
    }));
  }
  return files;
}

async function buildBusBand({ phase2, out }) {
  const src = path.join(phase2, BUS_BAND.source);
  const { width, height } = await sharp(src).metadata();
  const bandHeight = Math.round(width / BUS_BAND.aspect);
  const top = Math.max(0, Math.min(height - bandHeight, Math.round(height * BUS_BAND.centreY - bandHeight / 2)));
  const files = [];
  for (const w of BUS_BAND.widths) {
    files.push(...await writeImage({
      out,
      name: `voice-bus-${w}`,
      make: () => sharp(src).extract({ left: 0, top, width, height: bandHeight }).resize({ width: w, kernel: 'lanczos3' }),
    }));
  }
  return { files, band: { top, height: bandHeight, sourceWidth: width, sourceHeight: height } };
}

/** Mean signed and absolute RGB difference between two images of one size. */
async function colourDelta(fileA, fileB, width) {
  const read = async (file) => sharp(file).resize({ width, kernel: 'lanczos3' }).removeAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  const [a, b] = await Promise.all([read(fileA), read(fileB)]);
  if (a.info.height !== b.info.height) throw new Error(`colour check: ${fileA} and ${fileB} differ in shape`);
  const signed = [0, 0, 0];
  let abs = 0;
  for (let i = 0; i < a.data.length; i++) {
    const d = a.data[i] - b.data[i];
    signed[i % 3] += d;
    abs += Math.abs(d);
  }
  const n = a.data.length / 3;
  return { meanSigned: signed.map((s) => Number((s / n).toFixed(2))), meanAbs: Number((abs / a.data.length).toFixed(2)) };
}

/**
 * An encode already in `out` is kept when it is newer than the loop it was cut
 * from and still fits: a two-pass VP9 at cpu-used 1 costs minutes, and the
 * posters and the manifest are the parts that change most. `--reencode`
 * overrides.
 */
function reusableEncode({ output, input, width, budgetBytes }) {
  if (!existsSync(output)) return null;
  const { size, mtimeMs } = statSync(output);
  if (mtimeMs <= statSync(input).mtimeMs || size > budgetBytes) return null;
  const info = probe(output);
  if (info.width !== width || info.comment !== ENCODE_RECIPE) return null;
  return { kbps: Math.round((size * 8) / info.durationS / 1000), bytes: size, attempts: 0 };
}

async function buildVideos({ raw, out, work, reencode }) {
  const report = JSON.parse(readFileSync(path.join(raw, 'hero-capture.json'), 'utf8'));
  const videos = {};
  const capture = {};
  const files = [];
  const colour = {};
  const law = {};
  for (const [device, spec] of Object.entries(VIDEOS)) {
    const cap = report[device];
    if (!cap?.loop) throw new Error(`${device}: no assembled loop in ${raw}/hero-capture.json`);
    const input = path.join(ROOT, cap.loop.master);
    const master = probe(input);
    const outputs = {};
    for (const [codec, ext] of [['h264', 'mp4'], ['vp9', 'webm']]) {
      const output = path.join(out, `hero-${device}.${ext}`);
      const result = (!reencode && reusableEncode({ output, input, width: spec.width, budgetBytes: spec.budgetBytes }))
        || encodeToBudget({ codec, input, output, width: spec.width, budgetBytes: spec.budgetBytes,
          durationS: master.durationS, fps: master.fps, work, passlog: path.join(work, `pass-${device}-${ext}`) });
      const info = probe(output);
      const frames = countFrames(output);
      if (info.audioStreams) throw new Error(`${output}: has an audio stream`);
      if (Math.abs(info.firstPtsS) > 1e-6) throw new Error(`${output}: first frame at ${info.firstPtsS} s, not 0`);
      if (Math.abs(info.durationS - master.durationS) > 0.05) throw new Error(`${output}: lasts ${info.durationS} s`);
      if (frames !== Math.round(master.durationS * master.fps)) throw new Error(`${output}: ${frames} frames`);
      const seam = seamQuality({ output, input, width: spec.width, work });
      outputs[ext] = { ...info, ...result, frames, seam };
      files.push({ file: path.basename(output), width: info.width, height: info.height, bytes: result.bytes,
        note: `${info.codec} ${info.profile ?? ''} ${result.kbps} kbit/s, ${frames} frames, `
          + `PSNR-Y ${seam.meanDb} dB (first ${seam.firstDb} / last ${seam.lastDb})` });
      log(`${path.basename(output)}: ${result.bytes} B, ${info.width}×${info.height}, ${result.kbps} kbit/s, `
        + `${result.attempts ? `encoded in ${result.attempts} pass(es)` : 'reused'}, ${info.colour}`);
    }

    // Frame 0 as a browser decodes it, then the poster sizes cut from it.
    const posterPng = path.join(work, `hero-${device}-frame0.png`);
    ffmpeg(['-i', path.join(out, `hero-${device}.mp4`), '-frames:v', '1',
      '-vf', 'scale=in_range=tv:in_color_matrix=bt709:out_range=pc,format=rgb24', posterPng]);
    const videoWidth = outputs.mp4.width;
    for (const w of spec.posterWidths) {
      if (w > videoWidth) {
        log(`hero-poster ${device} ${w}: skipped, the video is ${videoWidth} px wide`);
        continue;
      }
      const name = device === 'phone' ? `hero-poster-phone-${w}` : `hero-poster-${w}`;
      files.push(...await writeImage({ out, name, make: () => sharp(posterPng).resize({ width: w, kernel: 'lanczos3' }) }));
    }
    colour[device] = await colourDelta(posterPng, path.join(ROOT, cap.loop.t0SourceFrame.file), videoWidth);

    const orbit = {
      centerLat: cap.orbit.center.lat,
      centerLon: cap.orbit.center.lon,
      centerHeight: cap.orbit.center.height,
      rangeM: cap.orbit.rangeM,
      pitchDeg: deg(cap.orbit.lookAt.pitchRad),
      headingStartDeg: (deg(cap.orbit.lookAt.headingRad) + 360) % 360,
      amplitudeDeg: cap.orbit.amplitudeDeg,
      periodS: master.durationS,
      law: 'cosine',
    };
    if (Math.abs(cap.orbit.periodS - master.durationS) > 1e-6) {
      throw new Error(`${device}: loop lasts ${master.durationS} s but the orbit period is ${cap.orbit.periodS} s`);
    }
    law[device] = checkLaw(device, orbit, cap);
    videos[device] = {
      file: `hero-${device}.mp4`,
      width: outputs.mp4.width,
      height: outputs.mp4.height,
      durationS: outputs.mp4.durationS,
      fps: outputs.mp4.fps,
      bytes: { mp4: outputs.mp4.bytes, webm: outputs.webm.bytes },
      orbit,
    };
    capture[device] = {
      cssWidth: cap.cssWidth,
      cssHeight: cap.cssHeight,
      dpr: cap.dpr,
      fovRad: cap.fovRad,
      fovyRad: cap.fovyRad,
      aspect: cap.aspect,
      camera: cap.camera,
      capturedAt: cap.capturedAt,
      origin: cap.origin,
      activeStack: cap.activeStack,
      sourceFps: cap.loop.sourceFpsInWindow,
    };
  }
  return { videos, capture, files, colour, law };
}

async function main() {
  const options = parseCli(process.argv.slice(2));
  for (const dir of [options.raw, options.phase2]) {
    if (!existsSync(dir)) throw new Error(`missing input directory ${dir}`);
  }
  mkdirSync(options.out, { recursive: true });
  rmSync(options.work, { recursive: true, force: true });
  mkdirSync(options.work, { recursive: true });

  const manifestFile = path.join(options.out, 'manifest.json');
  const previous = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, 'utf8')) : {};
  const files = [];
  let videoPart = { videos: previous.videos, capture: previous.capture, files: [], colour: null, law: null };
  if (!options.skipVideo) {
    videoPart = await buildVideos(options);
    files.push(...videoPart.files);
  }
  files.push(...await buildViews(options));
  files.push(...await buildMicro(options));
  const bus = await buildBusBand(options);
  files.push(...bus.files);

  const byName = { ...(options.skipVideo ? previous.files : {}) };
  for (const f of files) byName[f.file] = { width: f.width, height: f.height, bytes: f.bytes };
  const manifest = {
    generatedAt: new Date().toISOString(),
    capture: videoPart.capture,
    videos: videoPart.videos,
    files: Object.fromEntries(Object.entries(byName).sort(([a], [b]) => a.localeCompare(b))),
  };
  writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);

  const pad = (s, n) => String(s).padEnd(n);
  log(`\n${pad('file', 30)}${pad('size', 12)}${'bytes'.padStart(10)}  notes`);
  for (const f of files) {
    const notes = [f.note, f.loweredFrom ? `q${f.loweredFrom}→q${f.quality} (budget)` : null,
      f.upscaled ? `upscaled ${f.upscaled}` : null].filter(Boolean).join('; ');
    log(`${pad(f.file, 30)}${pad(`${f.width}×${f.height}`, 12)}${String(f.bytes).padStart(10)}  ${notes}`);
  }
  log(`\nbus band: rows ${bus.band.top}–${bus.band.top + bus.band.height} of ${bus.band.sourceHeight}`);
  if (videoPart.colour) log('poster vs source frame colour (RGB, 0-255):', JSON.stringify(videoPart.colour));
  if (videoPart.law) log('orbit law vs captured pose:', JSON.stringify(videoPart.law));
  log(`manifest: ${path.relative(ROOT, manifestFile)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
