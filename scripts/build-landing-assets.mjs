#!/usr/bin/env node
/**
 * Build the landing page's media: the hero loops, their posters, the gallery
 * thumbnails, the microphone and the voice-answer band.
 *
 *     node scripts/build-landing-assets.mjs
 *     node scripts/build-landing-assets.mjs --skip-video      # images only, seconds instead of minutes
 *     node scripts/build-landing-assets.mjs --quality hq      # the Retina ladder, see HQ below
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
 *
 * HQ (`--quality hq`). The standard loop, 1600 px at 1.4 Mbit/s, is enlarged
 * and blocky on a Retina laptop. HQ builds an encoding LADDER for 2880×1800,
 * 1920×1200 and 1170×2532 from lossless masters: AV1 at several constant
 * qualities under a byte cap per tier, then one HEVC and one H.264 rung aimed
 * at a weight. Every rung is scored with VMAF against the master and cut into
 * a 1:1 crop of a dense 600×400 of a moving frame, so the choice is made on
 * numbers AND on eyes. The build serves, per tier, the best AV1 under the cap
 * and the fallbacks, under names that say what they are.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
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
      quality: { type: 'string', default: 'standard' },
      tiers: { type: 'string' },
      codecs: { type: 'string' },
    },
  });
  if (values.quality === 'hq') {
    const given = (name) => argv.some((a) => a === `--${name}` || a.startsWith(`--${name}=`));
    return {
      hq: true,
      raw: path.resolve(ROOT, given('raw') ? values.raw : HQ.raw),
      out: path.resolve(ROOT, given('out') ? values.out : HQ.out),
      work: path.resolve(ROOT, given('work') ? values.work : path.join(HQ.out, 'work')),
      reencode: values.reencode,
      tiers: values.tiers ? values.tiers.split(',') : Object.keys(HQ.tiers),
      codecs: values.codecs ? values.codecs.split(',') : null,
    };
  }
  return {
    raw: path.resolve(ROOT, values.raw),
    phase2: path.resolve(ROOT, values.phase2),
    out: path.resolve(ROOT, values.out),
    work: path.resolve(ROOT, values.work),
    skipVideo: values['skip-video'],
    reencode: values.reencode,
  };
}

function run(cmd, args, { stderr = false } = {}) {
  // SVT-AV1 logs its whole configuration to stderr unless told otherwise.
  const result = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 256 * MB, env: { ...process.env, SVT_LOG: '1' } });
  if (result.status !== 0) throw new Error(`${cmd} ${args.join(' ')}\n${result.stderr}`);
  return stderr ? result.stderr : result.stdout;
}

export const ffmpeg = (args) => run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);

export function probe(file) {
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

export function countFrames(file) {
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
export async function writeImage({ out, name, make, webpOnly = false, webpQuality = QUALITY.webp, keepAlpha = false }) {
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


// ── HQ ladder ──────────────────────────────────────────────────────────────

const HQ = Object.freeze({
  raw: '.context/landing-assets/hq/raw',
  out: '.context/landing-assets/hq',
  recipe: 'landing-hq-v2',
  // `crop` is the top-left of the 1:1 600×400 look, picked by eye on frame
  // 135: the périphérique's VEH labels over the three towers (desktop), the
  // Seine bridges' labels (phone). Edge energy picked the railway instead.
  tiers: {
    'desktop-2880': { device: 'desktop', width: 2880, codecs: ['av1', 'hevc'], crop: { left: 1560, top: 20 } },
    'desktop-1920': { device: 'desktop', width: 1920, codecs: ['av1', 'hevc', 'h264'], crop: { left: 1040, top: 13 } },
    'phone-1170': { device: 'phone', width: 1170, codecs: ['av1', 'hevc', 'h264'], crop: { left: 500, top: 420 } },
    // The same loop reduced for the phone: at 460 ppi a well-coded 960 can beat
    // a crushed 1170. Its crops and its second VMAF are taken at DISPLAY size
    // (upscaled to 1170, as the browser will), against the 1170 master.
    'phone-960': { device: 'phone', width: 960, codecs: ['av1', 'hevc', 'h264'], crop: { left: 500, top: 420 },
      display: { tier: 'phone-1170', width: 1170, height: 2532 } },
  },
  // WEIGHT FIRST, then quality. A first pass aimed at VMAF 95 (ladder-pass1.json)
  // needed 63 MB at 2880, 17 MB at 1920 — and AV1 38 at 2880 (27.7 MB, VMAF
  // 93.5) was already indistinguishable from the reference on the dense crop.
  // So each tier has a byte cap, AV1 is laddered under it, and the fallbacks
  // are single two-pass rungs aimed at a weight: HEVC at the AV1 rung served,
  // H.264 at a fixed size.
  caps: { 'desktop-2880': 18 * MB, 'desktop-1920': 9 * MB, 'phone-1170': 6 * MB, 'phone-960': 6 * MB },
  // The phone serves ONE of its two tiers; the fallbacks are encoded for that
  // one only. H.264 there may weigh up to 8 MB.
  phoneTier: 'phone-960',
  levels: {
    'desktop-2880': {
      av1: [{ crf: 38 }, { crf: 42 }, { crf: 46 }, { crf: 50 }, { crf: 46, fps: 24 }],
      hevc: [{ match: 'av1' }],
    },
    'desktop-1920': {
      av1: [{ crf: 40 }, { crf: 44 }, { crf: 48 }],
      hevc: [{ match: 'av1' }],
      h264: [{ mb: 12 }],
    },
    // 1170 needed CRF 52+ to reach 6 MB (40 → 14.2 MB): the 960 tier exists
    // because of that.
    'phone-1170': {
      av1: [{ crf: 40 }, { crf: 44 }, { crf: 48 }, { crf: 52 }, { crf: 56 }],
    },
    'phone-960': {
      av1: [{ crf: 44 }, { crf: 48 }, { crf: 52 }],
      hevc: [{ match: 'av1' }],
      h264: [{ mb: 7.5 }],
    },
  },
  outputFps: 30,
  // THE LOOP POINT. An encoder spends least on the last frames of a stream,
  // and a loop shows them every 18 s: SVT-AV1 ended 1.4–3.6 VMAF below its
  // start, two-pass x265 up to 11 below even with a 2.5× zone. The loop is
  // seamless, so every rung is encoded with its own first two seconds
  // appended and cut back without re-encoding: the loop point is no longer
  // the end of the stream. x264/x265 put a forced IDR on the cut and never
  // reference across it; AV1 samples in MP4 are in display order and carry
  // any hidden frame they need. Both cuts decode (the VMAF pass proves it).
  tailS: 2,
  av1Preset: 5,
  // A two-pass rung may overshoot its aim by ~6 %: it is re-aimed until it fits.
  maxAimAttempts: 4,
  vmafModel: 'vmaf_v0.6.1',
  vmafTarget: 95,
  // 4.5 s, the orbit's fastest instant: the hardest frame to code. Frame 135
  // at 30 fps, 108 at 24.
  cropAtS: 4.5,
  crop: { width: 600, height: 400 },
  // Browsers take the first `<source>` they can play: best codec first.
  preference: ['av1', 'hevc', 'h264'],
  posters: [
    { name: 'hero-poster-2880', tier: 'desktop-2880', jpeg: 85 },
    { name: 'hero-poster-1920', tier: 'desktop-1920', jpeg: 85 },
    // Named after the width it is cut at: the tier the phone serves. It is on
    // the phone's first screen, budgeted at 400 kB with the page (criterion
    // 9): the AVIF may not pass 260 kB, whatever the SSIM rule would pick —
    // the re-assembled loop's frame 0 wanted q55 and 313 kB (2026-09-19).
    { name: 'hero-poster-phone', tier: 'phone', jpeg: 80, avifMaxBytes: 260_000 },
  ],
  avifQualities: [50, 55, 60, 65, 70, 75, 80, 85],
  avifEffort: 7,
});

const round2 = (v) => Number(v.toFixed(2));

/** The `codecs=` parameter, read from the sample entry's configuration box. */
export function codecsParameter(file) {
  const buf = readFileSync(file);
  const find = (fourcc) => {
    const at = buf.indexOf(Buffer.from(fourcc, 'latin1'));
    return at < 0 ? null : buf.subarray(at + 4, at + 4 + 32);
  };
  const hex = (n, width = 2) => n.toString(16).toUpperCase().padStart(width, '0');
  let box = find('av1C');
  if (box) {
    const profile = box[1] >> 5;
    const level = box[1] & 0x1f;
    const tier = (box[2] >> 7) & 1 ? 'H' : 'M';
    const high = (box[2] >> 6) & 1;
    const twelve = (box[2] >> 5) & 1;
    const depth = high ? (twelve ? 12 : 10) : 8;
    return `av01.${profile}.${String(level).padStart(2, '0')}${tier}.${String(depth).padStart(2, '0')}`;
  }
  box = find('hvcC');
  if (box) {
    const space = ['', 'A', 'B', 'C'][box[1] >> 6];
    const tier = (box[1] >> 5) & 1 ? 'H' : 'L';
    const profile = box[1] & 0x1f;
    let compat = box.readUInt32BE(2);
    let reversed = 0;
    for (let i = 0; i < 32; i++) { reversed = (reversed << 1) | (compat & 1); compat >>>= 1; }
    const constraints = [...box.subarray(6, 12)];
    while (constraints.length && constraints.at(-1) === 0) constraints.pop();
    const level = box[12];
    return [`hvc1.${space}${profile}`, (reversed >>> 0).toString(16).toUpperCase(), `${tier}${level}`,
      ...constraints.map((b) => b.toString(16).toUpperCase())].join('.');
  }
  box = find('avcC');
  if (box) return `avc1.${hex(box[1])}${hex(box[2])}${hex(box[3])}`;
  throw new Error(`${file}: no avcC/hvcC/av1C box`);
}

const rungFps = (level) => level.fps ?? HQ.outputFps;
const rungKey = (codec, level) => (level.mb
  ? `${codec}-${level.mb}mb`
  : `${codec}-${level.crf}${level.fps ? `-${level.fps}fps` : ''}`);

export function rungRecipe(codec, level) {
  return `${HQ.recipe} ${codec} ${JSON.stringify(level)} tail=${HQ.tailS}${codec === 'av1' ? '' : ' idr'}`;
}

/**
 * One rung. `crf` levels are constant quality; `mb` levels are two-pass
 * encodes aimed at that many megabytes over the loop. `fps` below 30 keeps
 * frames by selection (the `fps` filter drops, it never blends), so the
 * content time of every kept frame is its playback time within half a
 * source frame, and the orbit law needs no change.
 */
export function encodeRung({ codec, level, input, output, durationS, work, kbps = null, recipe: named = null, gop = null }) {
  const fps = rungFps(level);
  const frames = Math.round(durationS * fps);
  const recipe = named ?? rungRecipe(codec, level);
  const tailFrames = Math.round(HQ.tailS * fps);
  const extended = path.join(work, `${path.basename(output, '.mp4')}.tail.mp4`);
  const passlog = path.join(work, `pass-${path.basename(output, '.mp4')}`);
  // The master is Matroska, whose millisecond timestamps (0, 33, 67…) would
  // otherwise reach the MP4 as a slightly uneven cadence: `fps` snaps them
  // onto the exact grid (and selects frames when the rung is below 30).
  const graph = `[0:v]fps=${fps},format=yuv420p,${COLOUR_PARAMS},split[a][b];`
    + `[b]trim=end_frame=${tailFrames},setpts=PTS-STARTPTS[c];[a][c]concat=n=2:v=1:a=0,${COLOUR_PARAMS}[v]`;
  const head = ['-i', input, '-filter_complex', graph, '-map', '[v]'];
  const tail = ['-an', '-pix_fmt', 'yuv420p', ...COLOUR_TAGS];
  const idr = ['-force_key_frames', String(durationS), '-forced-idr', '1'];
  // `gop`: the longest keyframe interval the caller wants. A short, mostly
  // still loop (scripts/build-landing-gallery.mjs) spends most of its bytes
  // on keyframes, and SVT-AV1 otherwise opens a new one every ~5 s.
  const keyint = gop ? ['-g', String(gop)] : [];
  const started = Date.now();
  if (codec === 'av1') {
    ffmpeg([...head, '-c:v', 'libsvtav1', '-preset', String(HQ.av1Preset), '-crf', String(level.crf), ...keyint,
      '-tag:v', 'av01', ...tail, extended]);
  } else {
    const isHevc = codec === 'hevc';
    const base = [...head, ...idr, ...keyint, ...(isHevc
      ? ['-c:v', 'libx265', '-preset', 'slow', '-profile:v', 'main', '-tag:v', 'hvc1']
      : ['-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'high'])];
    const x265 = (extra) => ['-x265-params', `log-level=error:open-gop=0${extra}`];
    if (kbps) {
      const rate = ['-b:v', `${kbps}k`];
      if (isHevc) {
        ffmpeg([...base, ...rate, ...x265(`:pass=1:stats=${passlog}.log`), ...tail, '-f', 'null', '/dev/null']);
        ffmpeg([...base, ...rate, ...x265(`:pass=2:stats=${passlog}.log`), ...tail, extended]);
      } else {
        ffmpeg([...base, ...rate, '-passlogfile', passlog, '-pass', '1', ...tail, '-f', 'null', '/dev/null']);
        ffmpeg([...base, ...rate, '-passlogfile', passlog, '-pass', '2', ...tail, extended]);
      }
    } else {
      ffmpeg([...base, '-crf', String(level.crf), ...(isHevc ? x265('') : []), ...tail, extended]);
    }
  }
  ffmpeg(['-i', extended, '-map', '0:v', '-c', 'copy', '-frames:v', String(frames), '-an',
    '-movflags', '+faststart', '-metadata', `comment=${recipe}`, output]);
  rmSync(extended, { force: true });
  return { recipe, frames, fps, kbpsAimed: kbps, encodeS: round2((Date.now() - started) / 1000) };
}

/** `mb` rungs: aim, measure, re-aim until the file fits its weight. */
function encodeToWeight({ codec, level, input, output, durationS, work }) {
  if (!level.mb) return encodeRung({ codec, level, input, output, durationS, work });
  const target = level.mb * MB;
  // The appended tail is encoded too, but cut away: aim at the loop's rate.
  let kbps = Math.floor((target * 8 * 0.97) / durationS / 1000);
  let encodeS = 0;
  for (let attempt = 1; attempt <= HQ.maxAimAttempts; attempt++) {
    const result = encodeRung({ codec, level, input, output, durationS, work, kbps });
    encodeS += result.encodeS;
    const bytes = statSync(output).size;
    if (bytes <= target) return { ...result, encodeS: round2(encodeS), attempts: attempt };
    log(`  ${path.basename(output)}: ${(bytes / MB).toFixed(2)} MB over ${level.mb} MB at ${kbps} kbit/s, re-aiming`);
    kbps = Math.floor(kbps * (target / bytes) * 0.98);
  }
  throw new Error(`${output}: could not fit ${level.mb} MB`);
}

const decoderFor = (file) => (probe(file).codec === 'av1' ? ['-c:v', 'libdav1d'] : []);

export function vmafOf({ dist, ref, work, fps = HQ.outputFps, upscale = null }) {
  const logFile = path.join(work, `vmaf-${upscale ? 'display-' : ''}${path.basename(dist)}.json`);
  // A lower-rate rung is scored against the reference thinned the same way.
  const thin = fps === HQ.outputFps ? '' : `fps=${fps},`;
  const grow = upscale ? `scale=${upscale.width}:${upscale.height}:flags=lanczos,` : '';
  ffmpeg([...decoderFor(dist), '-i', dist, '-i', ref, '-lavfi',
    // Pair frames by INDEX. By timestamp, the reference's millisecond-rounded
    // clock against the MP4's exact one duplicated a frame every few, and
    // scored a 95 encode at 87 with a minimum of 47 (2026-09-17).
    `[0:v]${grow}settb=1/${fps},setpts=N,format=yuv420p[d];[1:v]${thin}settb=1/${fps},setpts=N,format=yuv420p[r];`
    + `[d][r]libvmaf=model=version=${HQ.vmafModel}:n_threads=10:log_fmt=json:log_path=${logFile}`,
    '-f', 'null', '-']);
  const data = JSON.parse(readFileSync(logFile, 'utf8'));
  const scores = data.frames.map((f) => f.metrics.vmaf);
  const sorted = [...scores].sort((a, b) => a - b);
  return {
    mean: round2(data.pooled_metrics.vmaf.mean),
    min: round2(sorted[0]),
    p5: round2(sorted[Math.floor(sorted.length * 0.05)]),
    first: round2(scores[0]),
    last: round2(scores.at(-1)),
    frames: scores.length,
  };
}

/** One decoded frame as sRGB PNG, converted with the matrix the stream declares. */
export function frameAsPng({ file, index, output }) {
  ffmpeg([...decoderFor(file), '-i', file, '-vf',
    `select=eq(n\\,${index}),scale=in_range=tv:in_color_matrix=bt709:out_range=pc,format=rgb24`,
    '-frames:v', '1', '-fps_mode', 'passthrough', output]);
  return output;
}

function stillSsim(a, b) {
  const err = run('ffmpeg', ['-hide_banner', '-i', a, '-i', b, '-lavfi',
    '[0:v]format=rgb24[x];[1:v]format=rgb24[y];[x][y]ssim', '-f', 'null', '-'], { stderr: true });
  return Number(/All:([\d.]+)/.exec(err)?.[1]);
}

/** A frame as the phone shows it: upscaled to the display tier's pixels. */
function toDisplay(image, display) {
  return display ? image.resize(display.width, display.height, { kernel: 'lanczos3', fit: 'fill' }) : image;
}

async function buildPoster({ spec, source, out, work, crop, display = null }) {
  const framePng = frameAsPng({ file: source, index: 0, output: path.join(work, `${spec.name}-frame0.png`) });
  const files = [];
  const jpegFile = path.join(out, `${spec.name}.jpg`);
  await sharp(framePng).jpeg({ quality: spec.jpeg, mozjpeg: true, progressive: true }).toFile(jpegFile);
  const jpegSsim = stillSsim(framePng, jpegFile);
  // AVIF: the lowest quality that is at least as faithful as the JPEG — or,
  // under `avifMaxBytes`, the best one that fits.
  let chosen = null;
  let fitting = null;
  // A capped poster may go under the ladder's floor to fit.
  const qualities = spec.avifMaxBytes ? [40, 45, ...HQ.avifQualities] : HQ.avifQualities;
  for (const quality of qualities) {
    const candidate = path.join(work, `${spec.name}-q${quality}.avif`);
    await sharp(framePng).avif({ quality, effort: HQ.avifEffort }).toFile(candidate);
    const decoded = path.join(work, `${spec.name}-q${quality}.png`);
    await sharp(candidate).png().toFile(decoded);
    const ssim = stillSsim(framePng, decoded);
    chosen = { quality, candidate, decoded, ssim };
    if (spec.avifMaxBytes && statSync(candidate).size > spec.avifMaxBytes) {
      chosen = fitting ?? chosen;
      break;
    }
    fitting = chosen;
    if (ssim >= jpegSsim) break;
  }
  if (spec.avifMaxBytes && statSync(chosen.candidate).size > spec.avifMaxBytes) {
    throw new Error(`${spec.name}.avif: ${statSync(chosen.candidate).size} B over ${spec.avifMaxBytes} B even at q${chosen.quality}`);
  }
  const avifFile = path.join(out, `${spec.name}.avif`);
  writeFileSync(avifFile, readFileSync(chosen.candidate));
  const meta = await sharp(framePng).metadata();
  for (const [format, file, quality, ssim] of [['jpg', jpegFile, spec.jpeg, jpegSsim], ['avif', avifFile, chosen.quality, chosen.ssim]]) {
    files.push({ file: path.basename(file), width: meta.width, height: meta.height, bytes: statSync(file).size,
      note: `q${quality}, SSIM ${ssim.toFixed(4)} vs frame 0 of ${path.basename(source)}` });
    if (crop) {
      const decoded = format === 'jpg' ? jpegFile : chosen.decoded;
      await toDisplay(sharp(decoded), display).extract(crop).png()
        .toFile(path.join(out, 'crops', `poster-${spec.name}-${format}.png`));
    }
  }
  return files;
}

async function buildHq(options) {
  const { raw, out, work, reencode } = options;
  const ladderDir = path.join(out, 'ladder');
  const cropDir = path.join(out, 'crops');
  for (const dir of [out, ladderDir, cropDir, work]) mkdirSync(dir, { recursive: true });
  const report = JSON.parse(readFileSync(path.join(raw, 'hero-capture.json'), 'utf8'));
  const ladderFile = path.join(ladderDir, 'ladder.json');
  const ladder = existsSync(ladderFile) ? JSON.parse(readFileSync(ladderFile, 'utf8')) : {};
  const started = Date.now();

  const encodeOne = async ({ tierName, codec, level, ref, refInfo, crop, display }) => {
    const key = rungKey(codec, level);
    const output = path.join(ladderDir, `${tierName}-${key}.mp4`);
    const known = ladder[tierName].rungs[key];
    const reusable = !reencode && existsSync(output) && known?.vmaf && (!display || known.vmafDisplay)
      && probe(output).comment === rungRecipe(codec, level)
      && statSync(output).mtimeMs > statSync(ref).mtimeMs;
    if (reusable) {
      log(`${tierName} ${key}: reused (${(known.bytes / MB).toFixed(2)} MB, VMAF ${known.vmaf.mean})`);
      return known;
    }
    const encoded = encodeToWeight({ codec, level, input: ref, output, durationS: refInfo.durationS, work });
    const info = probe(output);
    if (info.width !== HQ.tiers[tierName].width || countFrames(output) !== encoded.frames) {
      throw new Error(`${output}: wrong shape`);
    }
    if (Math.abs(info.firstPtsS) > 1e-6 || Math.abs(info.durationS - refInfo.durationS) > 0.02 || info.audioStreams) {
      throw new Error(`${output}: starts at ${info.firstPtsS} s, lasts ${info.durationS} s, ${info.audioStreams} audio`);
    }
    const vmafStarted = Date.now();
    const vmaf = vmafOf({ dist: output, ref, work, fps: encoded.fps });
    const vmafDisplay = display
      ? vmafOf({ dist: output, ref: display.ref, work, fps: encoded.fps, upscale: display }) : null;
    const bytes = statSync(output).size;
    const cropFile = path.join(cropDir, `${tierName}-${key}.png`);
    const png = frameAsPng({ file: output, index: Math.round(HQ.cropAtS * encoded.fps),
      output: path.join(work, `${tierName}-${key}-frame.png`) });
    await toDisplay(sharp(png), display).extract(crop).png().toFile(cropFile);
    const rung = {
      file: path.relative(ROOT, output),
      codec,
      level,
      fps: encoded.fps,
      frames: encoded.frames,
      width: info.width,
      height: info.height,
      durationS: info.durationS,
      bytes,
      bitrateKbps: Math.round((bytes * 8) / info.durationS / 1000),
      kbpsAimed: encoded.kbpsAimed,
      vmaf,
      ...(vmafDisplay ? { vmafDisplay } : {}),
      mime: `video/mp4; codecs="${codecsParameter(output)}"`,
      colour: info.colour,
      encodeS: encoded.encodeS,
      vmafS: round2((Date.now() - vmafStarted) / 1000),
      crop: path.relative(ROOT, cropFile),
    };
    ladder[tierName].rungs[key] = rung;
    log(`${tierName} ${key}: ${(bytes / MB).toFixed(2)} MB, ${rung.bitrateKbps} kbit/s, `
      + `VMAF ${vmaf.mean} (min ${vmaf.min}, first ${vmaf.first}, last ${vmaf.last})`
      + `${vmafDisplay ? `, at display ${vmafDisplay.mean} (min ${vmafDisplay.min})` : ''}, ${encoded.encodeS} s`);
    writeFileSync(ladderFile, `${JSON.stringify(ladder, null, 2)}\n`);
    return rung;
  };

  /** The AV1 rung a tier serves: the best VMAF under the cap, at the full 30 fps. */
  const pickAv1 = (tierName) => Object.values(ladder[tierName]?.rungs ?? {})
    .filter((r) => r.codec === 'av1' && r.fps === HQ.outputFps && r.bytes <= HQ.caps[tierName])
    .sort((a, b) => b.vmaf.mean - a.vmaf.mean || a.bytes - b.bytes)[0] ?? null;

  const wantedKeys = {};
  for (const tierName of options.tiers) {
    const tier = HQ.tiers[tierName];
    const cap = report[tier.device];
    if (!cap?.loop) throw new Error(`${tierName}: no ${tier.device} loop in ${raw}`);
    const master = path.join(ROOT, cap.loop.master);
    const masterInfo = probe(master);
    // The reference every rung of this tier is scored against: the master
    // itself, or its lossless reduction.
    let ref = master;
    if (masterInfo.width !== tier.width) {
      ref = path.join(work, `ref-${tierName}.mkv`);
      if (!existsSync(ref) || statSync(ref).mtimeMs < statSync(master).mtimeMs) {
        ffmpeg(['-i', master, '-vf', `scale=${tier.width}:-2:flags=lanczos,format=yuv420p,${COLOUR_PARAMS}`,
          '-c:v', 'libx264', '-qp', '0', '-preset', 'veryfast', '-an', ...COLOUR_TAGS, ref]);
      }
    }
    const refInfo = probe(ref);
    const crop = { ...tier.crop, ...HQ.crop };
    const display = tier.display ? { ...tier.display, ref: path.join(ROOT, report[tier.device].loop.master) } : null;
    const refPng = frameAsPng({ file: ref, index: Math.round(HQ.cropAtS * HQ.outputFps),
      output: path.join(work, `ref-${tierName}-crop-frame.png`) });
    await toDisplay(sharp(refPng), display).extract(crop).png()
      .toFile(path.join(cropDir, `${tierName}-reference.png`));
    ladder[tierName] ??= { rungs: {} };
    ladder[tierName].crop = { ...crop, atS: HQ.cropAtS };
    ladder[tierName].reference = path.relative(ROOT, ref);
    ladder[tierName].capBytes = HQ.caps[tierName];
    wantedKeys[tierName] = new Set();

    const levels = HQ.levels[tierName];
    const selected = (codec) => !options.codecs || options.codecs.includes(codec);
    for (const [codec, list] of Object.entries(levels)) {
      if (!selected(codec)) continue;
      for (const level of list) {
        if (level.match) continue;
        wantedKeys[tierName].add(rungKey(codec, level));
        await encodeOne({ tierName, codec, level, ref, refInfo, crop, display });
      }
    }
    // Rungs aimed at the weight of the AV1 rung this tier serves.
    const av1 = pickAv1(tierName);
    for (const [codec, list] of Object.entries(levels)) {
      if (!selected(codec)) continue;
      for (const level of list.filter((l) => l.match)) {
        if (!av1) { log(`${tierName} ${codec}: no AV1 rung under the cap to match`); continue; }
        const aimed = { mb: Number((av1.bytes / MB).toFixed(1)) };
        wantedKeys[tierName].add(rungKey(codec, aimed));
        ladder[tierName].matched = { codec, to: rungKey('av1', av1.level) };
        await encodeOne({ tierName, codec, level: aimed, ref, refInfo, crop, display });
      }
    }
  }

  // Rungs from an earlier level set, and files from interrupted runs, go.
  for (const [tierName, entry] of Object.entries(ladder)) {
    if (!wantedKeys[tierName]) continue;
    for (const key of Object.keys(entry.rungs)) {
      if (!wantedKeys[tierName].has(key)) delete entry.rungs[key];
    }
  }
  const keptFiles = new Set(Object.values(ladder).flatMap((e) => Object.values(e.rungs).map((r) => path.basename(r.file))));
  for (const name of readdirSync(ladderDir)) {
    if (name.endsWith('.mp4') && !keptFiles.has(name)) rmSync(path.join(ladderDir, name));
  }
  const keptCrops = new Set(Object.values(ladder).flatMap((e) => Object.values(e.rungs).map((r) => path.basename(r.crop))));
  for (const name of readdirSync(cropDir)) {
    if (/^(desktop|phone)-.*-(av1|hevc|h264)-.*\.png$/.test(name) && !keptCrops.has(name)) rmSync(path.join(cropDir, name));
  }
  writeFileSync(ladderFile, `${JSON.stringify(ladder, null, 2)}\n`);

  // ── Selection: AV1 by quality under the cap, fallbacks as encoded for it.
  const served = {};
  for (const [tierName, tier] of Object.entries(HQ.tiers)) {
    if (tier.device === 'phone' && tierName !== HQ.phoneTier) continue;
    const rungs = Object.values(ladder[tierName]?.rungs ?? {});
    served[tierName] = {};
    const av1 = pickAv1(tierName);
    if (av1) served[tierName].av1 = av1;
    for (const codec of ['hevc', 'h264']) {
      if (!tier.codecs.includes(codec)) continue;
      const rung = rungs.filter((r) => r.codec === codec && r.level.mb).sort((a, b) => b.bytes - a.bytes)[0];
      if (rung) served[tierName][codec] = rung;
    }
  }
  const files = [];
  const sourcesByDevice = { desktop: [], phone: [] };
  // A codec that stops being served must not stay served from a past run.
  for (const name of readdirSync(out)) {
    if (/^hero-(desktop-2880|desktop-1920|phone-1170|phone-960)-(av1|hevc|h264)\.mp4$/.test(name)) rmSync(path.join(out, name));
  }
  for (const [tierName, byCodec] of Object.entries(served)) {
    for (const codec of HQ.preference) {
      const rung = byCodec[codec];
      if (!rung) continue;
      const name = `hero-${tierName}-${codec}.mp4`;
      writeFileSync(path.join(out, name), readFileSync(path.join(ROOT, rung.file)));
      const entry = { file: name, tier: tierName, codec, width: rung.width, height: rung.height, fps: rung.fps,
        durationS: rung.durationS, bytes: rung.bytes, bitrateKbps: rung.bitrateKbps, vmaf: rung.vmaf.mean,
        mime: rung.mime, level: rung.level };
      sourcesByDevice[HQ.tiers[tierName].device].push(entry);
      files.push({ file: name, width: rung.width, height: rung.height, bytes: rung.bytes,
        note: `${codec} ${JSON.stringify(rung.level)}, ${rung.bitrateKbps} kbit/s, VMAF ${rung.vmaf.mean}` });
    }
  }

  // ── Posters, cut from the best-codec file of their tier.
  for (const name of readdirSync(out)) {
    if (/^hero-poster-.*\.(jpg|avif)$/.test(name)) rmSync(path.join(out, name));
  }
  for (const posterSpec of HQ.posters) {
    const spec = posterSpec.tier === 'phone'
      ? { ...posterSpec, tier: HQ.phoneTier, name: `${posterSpec.name}-${HQ.tiers[HQ.phoneTier].width}` }
      : posterSpec;
    const byCodec = served[spec.tier] ?? {};
    const codec = HQ.preference.find((c) => byCodec[c]);
    if (!codec) continue;
    files.push(...await buildPoster({ spec, source: path.join(out, `hero-${spec.tier}-${codec}.mp4`), out, work,
      crop: ladder[spec.tier].crop && { left: ladder[spec.tier].crop.left, top: ladder[spec.tier].crop.top,
        width: HQ.crop.width, height: HQ.crop.height },
      display: HQ.tiers[spec.tier].display ?? null }));
  }

  // ── Manifest, in the standard shape plus the served sources.
  const videos = {};
  const capture = {};
  const law = {};
  for (const device of ['desktop', 'phone']) {
    const cap = report[device];
    const sources = sourcesByDevice[device];
    if (!cap || !sources.length) continue;
    const primary = sources[0];
    if (sources.some((src) => Math.abs(src.durationS - primary.durationS) > 1e-3)) {
      throw new Error(`${device}: served files disagree on the loop length`);
    }
    const orbit = {
      centerLat: cap.orbit.center.lat,
      centerLon: cap.orbit.center.lon,
      centerHeight: cap.orbit.center.height,
      rangeM: cap.orbit.rangeM,
      pitchDeg: deg(cap.orbit.lookAt.pitchRad),
      headingStartDeg: (deg(cap.orbit.lookAt.headingRad) + 360) % 360,
      amplitudeDeg: cap.orbit.amplitudeDeg,
      // The loop period in PLAYBACK time: every served file lasts exactly this.
      periodS: primary.durationS,
      law: 'cosine',
    };
    law[device] = checkLaw(device, orbit, cap);
    videos[device] = {
      file: primary.file,
      width: primary.width,
      height: primary.height,
      durationS: primary.durationS,
      fps: primary.fps,
      bytes: Object.fromEntries(sources.map((src) => [src.file, src.bytes])),
      orbit,
      sources: sources.map(({ file, codec, width, height, fps, bytes, bitrateKbps, vmaf, mime }) => (
        { file, codec, width, height, fps, bytes, bitrateKbps, vmaf, mime })),
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
      tileSse: cap.tilesetSse,
      msaaSamples: cap.msaaSamples,
      slowMotion: cap.slowMotion,
      sourceFps: cap.loop.sourceFpsInWindow,
    };
  }
  const manifest = {
    generatedAt: new Date().toISOString(),
    quality: 'hq',
    vmafModel: HQ.vmafModel,
    capture,
    videos,
    files: Object.fromEntries(files.map((f) => [f.file, { width: f.width, height: f.height, bytes: f.bytes }])),
  };
  writeFileSync(path.join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  const pad = (v, n) => String(v).padEnd(n);
  log(`\n${pad('tier', 14)}${pad('rung', 16)}${pad('MB', 8)}${pad('kbit/s', 9)}${pad('VMAF', 8)}${pad('min', 8)}`
    + `${pad('first', 8)}${pad('last', 8)}${pad('enc s', 8)}mime`);
  for (const [tierName, { rungs }] of Object.entries(ladder)) {
    for (const [key, r] of Object.entries(rungs)) {
      log(`${pad(tierName, 14)}${pad(key, 16)}${pad((r.bytes / MB).toFixed(2), 8)}${pad(r.bitrateKbps, 9)}`
        + `${pad(r.vmaf.mean, 8)}${pad(r.vmaf.min, 8)}${pad(r.vmaf.first, 8)}${pad(r.vmaf.last, 8)}${pad(r.encodeS, 8)}${r.mime}`);
    }
  }
  log('\nserved:');
  for (const f of files) log(`  ${pad(f.file, 32)}${pad(`${f.width}×${f.height}`, 11)}${String(f.bytes).padStart(10)}  ${f.note ?? ''}`);
  log('orbit law vs captured pose:', JSON.stringify(law));
  log(`ladder: ${path.relative(ROOT, ladderFile)}; manifest: ${path.relative(ROOT, path.join(out, 'manifest.json'))}; `
    + `${Math.round((Date.now() - started) / 1000)} s`);
}

async function main() {
  const options = parseCli(process.argv.slice(2));
  if (options.hq) {
    await buildHq(options);
    return;
  }
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
