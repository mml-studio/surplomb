#!/usr/bin/env node
/**
 * Record the landing page's gallery loops — the six views of « Choisissez une
 * vue. » — from the live app, cockpit interface included.
 *
 *     node scripts/capture-landing-gallery.mjs                    # all six, 6 ion sessions
 *     node scripts/capture-landing-gallery.mjs --only 01,05       # 2 ion sessions
 *     node scripts/capture-landing-gallery.mjs --rehearsal        # OSM globe, 0 ion session
 *     node scripts/capture-landing-gallery.mjs --assemble-only    # rebuild the loops from saved frames, 0 session
 *     node scripts/capture-landing-gallery.mjs --rehearsal --only 02 --amplitude 02=1.5 --speed 05=4
 *                                                                 # try another orbit or time-lapse, 0 session
 *
 * The seventh loop, the voice answer (« Montre-moi les bus autour de la gare
 * Saint-Jean »), is a band of view 05 cut by scripts/build-landing-gallery.mjs:
 * the same frames, no seventh session.
 *
 * THE MECHANICS ARE THE HERO'S. `scripts/capture-landing-hero.mjs` records
 * frame by frame on a slowed page clock and places every frame on the loop's
 * timeline by the phase that was rendered into it; this script imports that
 * machinery and only adds what a gallery needs:
 *
 *   - THE INTERFACE STAYS. A thumbnail shows the cockpit as a reader will get
 *     it on a click (legend, panels, labels) — nothing is masked. The capture
 *     is the thumbnail's own `aspect-ratio: 1.65`, so nothing is cropped
 *     either: the horizontal field is Cesium's 60°, as on the stills.
 *   - A FIXED CAMERA where the data move (aircraft, buses, cars in detection):
 *     only the moving things change from frame to frame, which is also what
 *     keeps a thumbnail at a few hundred kilobytes. Where nothing moves on its
 *     own (sales, the grid, parked scooters), a small orbit that comes back —
 *     the hero's law, a few degrees.
 *   - A TIME-LAPSE where the things that move are too slow to see at the
 *     view's altitude (`speed`): a bus at 30 km/h seen from 5 km crosses
 *     ~2 px of a 480 px thumbnail per second. The loop's clock then runs
 *     `speed` times behind the page's, and the report says so.
 *   - A MOTION CHECK on every loop: the share of pixels that change between
 *     two frames and over one second, and at the seam. A loop that reads as a
 *     photograph is reported, not shipped silently.
 *
 * The seam is the hero's: the last `crossfadeS` of the loop blend into the
 * `crossfadeS` that precede t = 0 — same camera pose (fixed, or the periodic
 * law), vehicles where they were — so the loop restarts on the frame it faded
 * into.
 *
 * WHERE FROM. `--origin` defaults to a local server: run it on a production
 * build (`npm run build && npx vite preview`), which is what surplomb.app
 * serves, rather than on the dev server. Its keys are the repo-root `.env`.
 *
 * BUDGET. One fresh browser per view (a view never inherits the layers of the
 * one before — see the QA memory notes), and each boot with the photoreal
 * globe is one billed Cesium ion session: 6 for a full run. No retry; a failed
 * view says why and the next one runs. `--assemble-only` and `--rehearsal`
 * cost nothing.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import puppeteer from 'puppeteer';
import { newQaPage } from './lib/qa-first-run.mjs';
import {
  assembleLoop,
  frameStats,
  pageInstallClock,
  pageInstallOrbit,
  readState,
  runOrbit,
  startScreencast,
  waitForState,
} from './capture-landing-hero.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/**
 * The six views, as `index.html` links them (`.context/landing-pack/liens.md`).
 * `layers` is what `l=` must switch on, sorted as the manager lists them.
 * `camera.amplitudeDeg` 0 is a fixed camera.
 */
export const GALLERY_VIEWS = Object.freeze([
  {
    id: '01',
    label: 'Roissy et les avions en approche',
    // 4 km up, looking north across the eastern ends of the runways and the
    // approach, which arrivals fly across the picture at 70 m/s. The first
    // link put the camera ON the airport reference point at 9 km, looking at
    // fields; recentred on the airport at 9 km, the aircraft were specks that
    // moved 0.001 % of the pixels a frame; over the terminals at 4 km there
    // were none moving at all — below ~130 m the arrivals leave ADS-B
    // coverage and stand still where they were last heard (2026-09-19).
    pose: { lat: 48.9764, lon: 2.6095, alt: 4000, heading: 0, pitch: -45 },
    hash: 'v=2&lat=48.9764&lon=2.6095&alt=4000&heading=0&pitch=-45&l=f.t',
    layers: ['flights', 'traffic'],
    camera: { amplitudeDeg: 0 },
    // An arrival every minute or so: record when one is drawn and moving.
    subject: { kind: 'aircraft', minCount: 1, timeoutS: 420 },
    // The aircraft as the layer's silhouettes, not its 3D models: a headless
    // Chrome draws neither the models nor, once they are handed a model, the
    // billboards (no aircraft at all on the first photoreal take, 2026-09-19).
    // The DISPLAY rail's « 3D » off, which a reader can choose too.
    params: { flights: { models3d: false } },
  },
  {
    id: '02',
    label: 'Une parcelle vendue à Lyon, et son prix',
    // Under 600 m, where the sales layer draws each sale on its parcel (above,
    // one disc per block: src/data/dvfSales.js) — Lyon 2e, place des Jacobins.
    pose: { lat: 45.758, lon: 4.834, alt: 550, heading: 0, pitch: -45 },
    // Sales alone: the layer already washes each sold parcel, so the cadastre
    // layer on top only drew the same boundaries twice (dropped 2026-09-21).
    hash: 'v=2&lat=45.7580&lon=4.8340&alt=550&heading=0&pitch=-45&l=dv',
    layers: ['dvf-sales'],
    // Sales and parcels do not move: the camera does, a little. « et son prix »:
    // the card of a sale near the middle is open, as a reader's click opens it.
    camera: { amplitudeDeg: 2 },
    select: { layer: 'dvf-sales', source: 'entities', idPrefix: 'dvf:', exclude: ['dvf:scan-edge'], target: [0.42, 0.62] },
  },
  {
    id: '03',
    label: 'Les voitures en direct dans les rues, avec les bouchons',
    pose: { lat: 48.83, lon: 2.265, alt: 600, heading: 350, pitch: -60 },
    hash: 'v=2&lat=48.8300&lon=2.2650&alt=600&heading=350&pitch=-60&dm=DENSE&dd=75&l=t.8',
    layers: ['road-events-fr', 'traffic'],
    camera: { amplitudeDeg: 0 },
  },
  {
    id: '04',
    label: 'Le réseau électrique et ce qu’il produit',
    // The Rhône valley from Cruas to the Bugey, 180 km up and looking north
    // at 58°: the stations stand in relief (70–800 km, src/data/rteGeneration.js)
    // and the grid is the national pack, all four bands and no yard labels.
    // Under the night atlas (`style=night`, src/styles/nightAtlas.js): the
    // ground dark, the grid in its night dress, the columns in their colour.
    // Straight down, a column is a square: the scene is oblique on purpose.
    pose: { lat: 44.15, lon: 4.95, alt: 180_000, heading: 0, pitch: -58 },
    hash: 'v=2&lat=44.15&lon=4.95&alt=180000&heading=0&pitch=-58&l=2.3&style=night',
    layers: ['power-grid', 'rte-generation'],
    // Nothing here moves on its own: the small orbit is what shows the
    // columns as columns, in parallax against the ground.
    camera: { amplitudeDeg: 3 },
  },
  {
    id: '05',
    label: 'Les bus de Bordeaux, en direct',
    pose: { lat: 44.8378, lon: -0.5792, alt: 5000, heading: 0, pitch: -50 },
    hash: 'v=2&lat=44.8378&lon=-0.5792&alt=5000&heading=0&pitch=-50&l=p.t',
    layers: ['traffic', 'transit-fr'],
    camera: { amplitudeDeg: 0 },
    // Seen from 5 km, a bus at 25 km/h crosses 2 px of a 480 px thumbnail a
    // second: the rehearsal read 0.02 % of pixels changing per frame, a
    // photograph. Five times faster it travels, still at a bus's pace
    // (Memel, 2026-09-19: « des bus, pas des voitures de course »); the seam
    // is the cross-fade every loop has, so no bus jumps back.
    speed: 5,
    // One bus with its card and its run, as a click shows them.
    // Low in the picture, so the card above it sits inside the voice
    // answer's band too (build-landing-gallery.mjs, rows 275–771).
    select: { layer: 'transit-fr', source: 'billboards', target: [0.42, 0.66] },
  },
  {
    id: '06',
    label: 'Les vélos et scooters partagés de Paris',
    pose: { lat: 48.8575, lon: 2.351, alt: 1300, heading: 0, pitch: -55 },
    hash: 'v=2&lat=48.8575&lon=2.3510&alt=1300&heading=0&pitch=-55&l=b.k',
    layers: ['bikeshare', 'shared-mobility-fr'],
    // Parked vehicles between two polls: the camera moves instead.
    camera: { amplitudeDeg: 2 },
  },
]);

/**
 * 1440×872 CSS at DPR 1: the widest thumbnail the page serves is 1440 px, the
 * box is 1.65:1 (872, not 873: every encoder wants even sides), and at this
 * width the cockpit lays itself out as on a laptop.
 */
export const CAPTURE = Object.freeze({ cssWidth: 1440, cssHeight: 872, dpr: 1, window: '1600,1000' });

/** Loop length and seam, shared by every view (4 to 8 s asked; 6 s is enough to read one pass). */
export const LOOP = Object.freeze({ periodS: 6, crossfadeS: 0.5, outputFps: 30 });

/**
 * The one thing the capture takes OUT of the interface: the POWER UP chip,
 * which only a dev server with keys missing shows (src/keySetup.js removes it
 * from a production build). A reader of surplomb.app never sees it.
 */
const CAPTURE_CSS = '#key-setup-chip, #key-setup { display: none !important; }';

/** Pose tolerances before anything is recorded (the hero's). */
const POSE_TOLERANCE = Object.freeze({ deg: 0.0005, heightRel: 0.002, heightM: 2, angleDeg: 0.5 });

/** A frame-to-frame change below this share of pixels reads as a photograph. */
export const MOTION_FLOOR_PCT = 0.05;

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
const log = (...args) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...args);

function parseCli(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      origin: { type: 'string', default: 'http://127.0.0.1:4393' },
      only: { type: 'string' },
      out: { type: 'string' },
      rehearsal: { type: 'boolean', default: false },
      'assemble-only': { type: 'boolean', default: false },
      settle: { type: 'string', default: '15' },
      slow: { type: 'string', default: 'auto' },
      period: { type: 'string' },
      amplitude: { type: 'string' },
      speed: { type: 'string' },
    },
  });
  // `--amplitude 02=1.5,06=2`: per-view overrides, for trying before paying.
  const perView = (text) => Object.fromEntries(String(text || '').split(',').filter(Boolean).map((pair) => {
    const [id, value] = pair.split('=');
    if (!id || !Number.isFinite(Number(value))) throw new Error(`bad per-view value "${pair}" (want 02=1.5)`);
    return [id.trim().padStart(2, '0'), Number(value)];
  }));
  const amplitudes = perView(values.amplitude);
  const speeds = perView(values.speed);
  const rehearsal = values.rehearsal;
  const out = path.resolve(ROOT, values.out
    || (rehearsal ? '.context/landing-assets/galerie/rehearsal' : '.context/landing-assets/galerie/raw'));
  const only = values.only ? values.only.split(',').map((s) => s.trim().padStart(2, '0')) : null;
  const views = GALLERY_VIEWS.filter((view) => !only || only.includes(view.id)).map((view) => ({
    ...view,
    camera: view.id in amplitudes ? { amplitudeDeg: amplitudes[view.id] } : view.camera,
    speed: speeds[view.id] ?? view.speed,
  }));
  if (only && views.length !== only.length) throw new Error(`--only: unknown view in ${values.only}`);
  const loop = values.period ? { ...LOOP, periodS: Number(values.period) } : LOOP;
  return {
    origin: values.origin.replace(/\/+$/, ''),
    views,
    out,
    rehearsal,
    assembleOnly: values['assemble-only'],
    settleMs: Number(values.settle) * 1000,
    slow: values.slow === 'auto' ? null : Number(values.slow),
    loop,
  };
}

// ── In-page probes ──────────────────────────────────────────────────────────

/* eslint-disable no-undef */
/** Each expected layer's lifecycle, as the data manager holds it. */
function pageLayerLifecycle(ids) {
  const layers = window.__godsEyeView?.dataManager?.layers;
  return Object.fromEntries(ids.map((id) => [id, layers?.get(id)?.lifecycleState ?? 'missing']));
}

/** Each expected layer's own stats, reduced to "still loading" and a count. */
function pageLayerLoading(ids) {
  const layers = window.__godsEyeView?.dataManager?.layers;
  return Object.fromEntries(ids.map((id) => {
    let stats = null;
    try { stats = layers?.get(id)?.module?.getStats?.() ?? null; } catch { stats = null; }
    return [id, { loading: Boolean(stats?.loading), count: stats?.count ?? null, status: stats?.status ?? null }];
  }));
}

/**
 * Open the card of the drawn object nearest `target` (fractions of the
 * canvas), through the layer's own `selectCard` — the selection a click
 * makes, without a synthetic click. `source` says where the layer draws:
 * `entities` (a data source, ids under `idPrefix`) or `billboards` (a
 * primitive collection, ids the layer recognises). Only candidates clear of
 * the interface's side panels are considered.
 */
function pageSelectCard({ layer, source, idPrefix = '', exclude = [], target }) {
  const g = window.__godsEyeView;
  const viewer = g.viewer;
  const scene = viewer.scene;
  const module = g.dataManager.layers.get(layer)?.module;
  if (typeof module?.selectCard !== 'function') return { ok: false, reason: `${layer} has no selectCard` };
  const w = viewer.canvas.clientWidth;
  const h = viewer.canvas.clientHeight;
  const tx = target[0] * w;
  const ty = target[1] * h;
  const inside = (x, y) => x > 0.2 * w && x < 0.7 * w && y > 0.2 * h && y < 0.85 * h;
  const candidates = [];
  const consider = (id, position) => {
    if (!position) return;
    const xy = scene.cartesianToCanvasCoordinates(position);
    if (!xy || !inside(xy.x, xy.y)) return;
    candidates.push({ id, x: Math.round(xy.x), y: Math.round(xy.y), d: Math.hypot(xy.x - tx, xy.y - ty) });
  };
  if (source === 'entities') {
    const now = viewer.clock.currentTime;
    for (let i = 0; i < viewer.dataSources.length; i++) {
      for (const entity of viewer.dataSources.get(i).entities.values) {
        const id = String(entity.id);
        if (!id.startsWith(idPrefix) || exclude.includes(id) || entity.show === false) continue;
        consider(id, entity.position?.getValue?.(now));
      }
    }
  } else {
    // Duck-typed: a minified build renames the Cesium classes.
    const visit = (collection, depth) => {
      if (depth > 6) return;
      for (let i = 0; i < collection.length; i++) {
        const item = collection.get(i);
        if (!item) continue;
        if (typeof item.length === 'number' && typeof item.get === 'function') visit(item, depth + 1);
        else if (typeof item.id === 'string' && item.position && item.show !== false && 'image' in item) consider(item.id, item.position);
      }
    };
    visit(scene.primitives, 0);
  }
  candidates.sort((a, b) => a.d - b.d);
  let tried = 0;
  for (const candidate of candidates.slice(0, 40)) {
    tried++;
    if (module.selectCard(candidate.id)) {
      g.requestRender?.('landing-gallery-select');
      return { ok: true, id: candidate.id, x: candidate.x, y: candidate.y, tried, candidates: candidates.length };
    }
  }
  return { ok: false, reason: `no selectable ${layer} object near the middle`, tried, candidates: candidates.length };
}

/**
 * The aircraft the flights layer is DRAWING in the picture, and which of them
 * moved over `sampleMs`. Read from its own billboards (ids are ICAO 24-bit
 * addresses) rather than from the feed: the feed ignores a bounding box on
 * the public origin, and a plane on the far side of the Earth projects
 * inside the frame all the same.
 */
async function pageMovingAircraft({ sampleMs = 1500 }) {
  const viewer = window.__godsEyeView.viewer;
  const scene = viewer.scene;
  const w = viewer.canvas.clientWidth;
  const h = viewer.canvas.clientHeight;
  const read = () => {
    const out = new Map();
    const visit = (collection, depth) => {
      if (depth > 6) return;
      for (let i = 0; i < collection.length; i++) {
        const item = collection.get(i);
        if (!item) continue;
        if (typeof item.length === 'number' && typeof item.get === 'function') visit(item, depth + 1);
        else if (item.show && 'image' in item && /^[0-9a-f]{6}$/.test(String(item.id)) && item.position) {
          const xy = scene.cartesianToCanvasCoordinates(item.position);
          if (xy && xy.x > 0.12 * w && xy.x < 0.72 * w && xy.y > 0.1 * h && xy.y < 0.88 * h) out.set(item.id, [xy.x, xy.y]);
        }
      }
    };
    visit(scene.primitives, 0);
    return out;
  };
  const a = read();
  scene.requestRender();
  await new Promise((resolve) => { setTimeout(resolve, sampleMs); });
  scene.requestRender();
  await new Promise((resolve) => { setTimeout(resolve, 100); });
  const b = read();
  const moving = [];
  for (const [id, [x, y]] of b) {
    const before = a.get(id);
    if (before && Math.hypot(x - before[0], y - before[1]) > 3) moving.push({ id, x: Math.round(x), y: Math.round(y) });
  }
  return { drawn: b.size, moving };
}

/** Whether the layer still holds the selection (address layers report it). */
function pageSelectedId(layer) {
  try { return window.__godsEyeView.dataManager.layers.get(layer)?.module?.getStats?.()?.selectedId ?? null; } catch { return null; }
}

/** Render at the emulated DPR, not the one Cesium would pick for a phone. */
function pageFullResolution() {
  const g = window.__godsEyeView;
  g.viewer.useBrowserRecommendedResolution = false;
  g.requestRender?.('landing-gallery-capture');
}
/* eslint-enable no-undef */

// ── Node side ──────────────────────────────────────────────────────────────

function poseOk(camera, pose) {
  const heading = Math.abs(((camera.headingDeg - pose.heading + 540) % 360) - 180);
  // Straight down, heading is ill-defined: Cesium may read it as anything.
  const headingOk = pose.pitch <= -89.5 || heading <= POSE_TOLERANCE.angleDeg;
  return Math.abs(camera.lat - pose.lat) <= POSE_TOLERANCE.deg
    && Math.abs(camera.lon - pose.lon) <= POSE_TOLERANCE.deg
    && Math.abs(camera.height - pose.alt) <= Math.max(POSE_TOLERANCE.heightM, pose.alt * POSE_TOLERANCE.heightRel)
    && headingOk
    && Math.abs(camera.pitchDeg - pose.pitch) <= POSE_TOLERANCE.angleDeg;
}

/** Share of pixels, in %, whose largest channel moved by more than `threshold`. */
export function changedShare(a, b, threshold = 20) {
  if (a.length !== b.length) throw new Error('changedShare: frames differ in size');
  let changed = 0;
  for (let i = 0; i < a.length; i += 3) {
    const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
    if (d > threshold) changed++;
  }
  return Number(((changed / (a.length / 3)) * 100).toFixed(3));
}

/** Every frame of a master, reduced to `width`, as raw sRGB buffers. */
function decodeFrames(master, width) {
  const info = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height',
    '-of', 'csv=p=0', master], { encoding: 'utf8' }).stdout.trim().split(',').map(Number);
  const height = 2 * Math.round((info[1] * width) / info[0] / 2);
  const result = spawnSync('ffmpeg', ['-v', 'error', '-i', master, '-vf',
    `scale=${width}:${height}:in_range=tv:in_color_matrix=bt709:out_range=pc,format=rgb24`, '-f', 'rawvideo', '-'],
  { maxBuffer: 2 ** 31 - 1 });
  if (result.status !== 0) throw new Error(`ffmpeg decode failed: ${result.stderr}`);
  const size = width * height * 3;
  const frames = [];
  for (let at = 0; at + size <= result.stdout.length; at += size) frames.push(result.stdout.subarray(at, at + size));
  return frames;
}

/**
 * Does the loop move, and does its seam show? Every pair of neighbours is
 * compared (what the eye reads as motion), every frame against the one a
 * second later (what it reads as travel), and the last frame against the
 * first (the seam, which should look like any other pair of neighbours). A
 * pair with no change at all is a REPEATED frame: a stutter on a moving loop.
 */
export async function motionReport({ master, fps, orbit }) {
  const frames = decodeFrames(master, 720);
  const n = frames.length;
  const next = [];
  for (let i = 0; i + 1 < n; i++) next.push(changedShare(frames[i], frames[i + 1]));
  const second = [];
  for (let i = 0; i + fps < n; i += Math.round(fps / 2)) second.push(changedShare(frames[i], frames[i + fps]));
  const mean = (list) => Number((list.reduce((a, b) => a + b, 0) / Math.max(1, list.length)).toFixed(3));
  const seam = changedShare(frames[n - 1], frames[0]);
  const sorted = [...next].sort((a, b) => a - b);
  const report = {
    frames: n,
    nextFramePct: mean(next),
    nextFrameP90Pct: sorted[Math.floor(sorted.length * 0.9)],
    oneSecondPct: mean(second),
    repeatedFrames: next.filter((v) => v === 0).length,
    seamPct: seam,
  };
  // A few small icons crossing the picture change few pixels a frame but
  // travel over a second; a photograph does neither.
  report.verdict = orbit
    ? 'camera orbit (every pixel moves; the data may not)'
    : report.oneSecondPct < MOTION_FLOOR_PCT ? 'FROZEN — nothing visible moves'
      : report.nextFramePct < MOTION_FLOOR_PCT ? 'small things move (a few icons)' : 'moves';
  // A seam is clean when it changes no more than the busiest ordinary pair.
  report.seamClean = seam <= report.nextFrameP90Pct * 1.5 + 0.05;
  return report;
}

async function captureView(view, options) {
  const { origin, out, rehearsal, settleMs, loop } = options;
  const name = `view-${view.id}`;
  const orbit = { ...loop, amplitudeDeg: view.camera.amplitudeDeg };
  const speed = view.speed || 1;
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: CHROME,
    protocolTimeout: 600_000,
    defaultViewport: null,
    args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization',
      '--hide-scrollbars', '--mute-audio', '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
      `--force-device-scale-factor=${CAPTURE.dpr}`, `--window-size=${CAPTURE.window}`],
  });
  const started = Date.now();
  try {
    const page = await newQaPage(browser, { photoreal: !rehearsal });
    await page.setViewport({ width: CAPTURE.cssWidth, height: CAPTURE.cssHeight, deviceScaleFactor: CAPTURE.dpr });
    // Before the app's first script: every clock it reads must be the slowable one.
    await page.evaluateOnNewDocument(pageInstallClock);
    await page.bringToFront();
    const url = `${origin}/?welcome=0&perf=full#${view.hash}${rehearsal ? '' : '&map=photoreal'}`;
    log(`${name}: ${rehearsal ? 'REHEARSAL (no ion session)' : 'photoreal — 1 ion session'} ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.addStyleTag({ content: CAPTURE_CSS });
    await page.waitForFunction(() => !!window.__godsEyeView?.viewer, { timeout: 120_000 });
    if (CAPTURE.dpr !== 1) await page.evaluate(pageFullResolution);

    const wait = (label, predicate, extra = {}) => waitForState(page, label, predicate, { expectedLayers: view.layers, ...extra });
    const booted = await wait('share-link pose', (s) => poseOk(s.camera, view.pose), { timeoutMs: 60_000 });
    log(`${name}: pose restored`, booted.camera);
    // A share link poses the camera with `setView`, which raises no camera
    // event, and the address layers (sales, parcels) scan on `moveEnd` or on a
    // ten-minute tick: without this they stay empty until the reader moves.
    // The same thing a reader's first touch does.
    await sleep(3000);
    await page.evaluate(() => window.__godsEyeView.viewer.camera.moveEnd.raiseEvent());
    if (!rehearsal) {
      await wait('photoreal stack', (s) => s.activeStack === 'photoreal' && s.photorealReady, { timeoutMs: 90_000 });
    }
    await wait('layers', (s) => s.layersMatch, { timeoutMs: 60_000 });
    const lifecycle = await (async () => {
      const deadline = Date.now() + 60_000;
      let states = null;
      while (Date.now() < deadline) {
        states = await page.evaluate(pageLayerLifecycle, view.layers);
        if (Object.values(states).every((s) => s === 'enabled')) return states;
        await sleep(500);
      }
      log(`${name}: WARN layers not all enabled after 60 s`, states);
      return states;
    })();
    // Each layer's own "still loading": the grid's Overpass box, the traffic
    // flow, a sales scan. A warning, not a failure — the frames will show it.
    const loaded = await (async () => {
      const deadline = Date.now() + 120_000;
      let states = null;
      while (Date.now() < deadline) {
        states = await page.evaluate(pageLayerLoading, view.layers);
        if (Object.values(states).every((s) => !s.loading)) return states;
        await sleep(1000);
      }
      log(`${name}: WARN still loading after 120 s`, states);
      return states;
    })();
    log(`${name}: layers loaded`, loaded);
    for (const [layer, params] of Object.entries(view.params || {})) {
      await page.evaluate((id, p) => window.__godsEyeView.dataManager.setLayerParams(id, p), layer, params);
      log(`${name}: ${layer} params`, params);
    }
    await wait('tiles drained (held 3 s)', (s) => s.tilesLoaded, { holdMs: 3000, timeoutMs: 300_000 });
    const drainedAfterS = Number(((Date.now() - started) / 1000).toFixed(1));
    log(`${name}: tiles drained after ${drainedAfterS} s, layers`, lifecycle);
    if (view.layers.includes('traffic')) {
      // Seated on the ground it is drawn over, as the hero waits for it.
      const traffic = await wait('traffic', (s) => s.traffic && s.traffic.count > 0 && !s.traffic.loading
        && (!s.traffic.floorArmed || s.traffic.floorWaiting === 0), { timeoutMs: 90_000, everyMs: 500 })
        .catch((error) => { log(`${name}: WARN ${error.message.slice(0, 200)}`); return null; });
      log(`${name}: traffic`, traffic?.traffic ?? 'not settled');
    }
    // The layers fetch, draw and label after they are "enabled"; the stills
    // were taken 12 s after the tiles drained.
    await sleep(settleMs);
    // A card in the middle of a thumbnail is all a reader would see of it.
    // The zoom prompt (src/zoomPrompt.js) is closed as a reader closes it: at
    // 1 400 km the grid of view 04 waits for a closer camera, and says so.
    const closed = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('.zoom-prompt-close')];
      for (const button of buttons) button.click();
      return buttons.length;
    });
    if (closed) {
      log(`${name}: closed ${closed} zoom prompt(s)`);
      await sleep(1000);
    }
    await wait('tiles drained after settle', (s) => s.tilesLoaded, { holdMs: 2000, timeoutMs: 120_000 });

    const orbitMeta = await page.evaluate(pageInstallOrbit, orbit);
    log(`${name}: camera ${orbit.amplitudeDeg ? `orbit ±${orbit.amplitudeDeg}°` : 'fixed'}, pivot`, orbitMeta.center,
      `range ${orbitMeta.rangeM.toFixed(0)} m${speed > 1 ? `, time-lapse ×${speed}` : ''}`);

    // Can this machine screencast 1440 px PNG in real time? Five seconds of
    // the real loop answer it, and set the slow-motion factor. Always at
    // least ×2: the slow path is the one that places frames exactly.
    const size = { width: CAPTURE.cssWidth * CAPTURE.dpr, height: CAPTURE.cssHeight * CAPTURE.dpr };
    const trial = await startScreencast(page, { dir: null, maxWidth: size.width, maxHeight: size.height, format: 'png' });
    await runOrbit(page, -orbit.periodS, -orbit.periodS + 5);
    const trialFrames = await trial.stop();
    await page.evaluate(() => window.__landingHero.stop());
    const realtimeTrial = { size: `${size.width}x${size.height}`, ...frameStats(trialFrames.slice(2).map((f) => f.ts)) };
    const needed = Math.ceil(orbit.outputFps / (0.25 * Math.max(realtimeTrial.fps, 0.5)));
    const slow = options.slow ?? Math.min(24, Math.max(2, Math.ceil(needed / speed)));
    log(`${name}: real-time trial`, realtimeTrial, `→ slow motion ×${slow}`);
    await wait('tiles drained after trial', (s) => s.tilesLoaded, { holdMs: 2000, timeoutMs: 180_000 });

    // The card goes up last: a layer that re-reads its view after the trial
    // (the sales rescan on `moveEnd`) redraws and drops any selection.
    let selection = null;
    if (view.select) {
      await sleep(3000);
      // A scan answers on its own schedule: wait for something to select.
      const drawn = await (async () => {
        const deadline = Date.now() + 120_000;
        while (Date.now() < deadline) {
          const states = await page.evaluate(pageLayerLoading, [view.select.layer]);
          const state = states[view.select.layer];
          if (!state.loading && state.count > 0) return state.count;
          await sleep(1000);
        }
        return 0;
      })();
      if (!drawn) throw new Error(`${name}: ${view.select.layer} drew nothing to select in 120 s`);
      await sleep(2000);
      selection = await page.evaluate(pageSelectCard, view.select);
      log(`${name}: card`, selection);
      if (!selection.ok) throw new Error(`${name}: ${selection.reason}`);
      await sleep(2000);
      const held = await page.evaluate(pageSelectedId, view.select.layer);
      if (held !== null && held !== selection.id) throw new Error(`${name}: the card closed before recording (${held})`);
    }

    // Something that moves on its own must be in the picture.
    let subject = null;
    if (view.subject?.kind === 'aircraft') {
      const deadline = Date.now() + view.subject.timeoutS * 1000;
      while (Date.now() < deadline) {
        subject = await page.evaluate(pageMovingAircraft, {}).catch(() => ({ drawn: 0, moving: [] }));
        if (subject.moving.length >= view.subject.minCount) break;
        await sleep(3000);
      }
      log(`${name}: aircraft drawn ${subject?.drawn}, moving`, subject?.moving);
      if (!subject || subject.moving.length < view.subject.minCount) {
        log(`${name}: WARN no aircraft moved in the picture in ${view.subject.timeoutS} s`);
      }
    }

    const before = await readState(page, view.layers);
    if (!poseOk(before.camera, view.pose)) throw new Error(`${name}: pose drifted before recording: ${JSON.stringify(before.camera)}`);
    if (!rehearsal && before.activeStack !== 'photoreal') throw new Error(`${name}: active stack is ${before.activeStack}`);

    const framesDir = path.join(out, `${name}-frames`);
    rmSync(framesDir, { recursive: true, force: true });
    const cast = await startScreencast(page, { dir: framesDir, maxWidth: size.width, maxHeight: size.height, format: 'png' });
    await sleep(500);
    // An orbit gets one full period of pre-roll, which streams every tile the
    // recorded period will look at. A fixed camera only needs the cross-fade
    // material before t = 0.
    const preRollS = orbit.amplitudeDeg ? orbit.periodS : orbit.crossfadeS + 1.5;
    const recordStarted = Date.now();
    // A loaded machine renders slower than the trial said (view 06 once
    // took three times its estimate): wait long rather than lose the session.
    const expectedS = preRollS * speed + (orbit.periodS + 1.5 + orbit.crossfadeS) * speed * slow;
    await runOrbit(page, -preRollS, orbit.periodS + 0.5,
      { slow, switchAtS: -orbit.crossfadeS - 1, targetFps: orbit.outputFps, speed, timeoutMs: (expectedS * 4 + 180) * 1000 });
    const recordRealS = Math.round((Date.now() - recordStarted) / 1000);
    const frames = await cast.stop();
    const renderLog = await page.evaluate(() => ({
      renders: window.__landingHero.renders,
      ticks: window.__landingHero.ticks,
      slow: window.__landingHero.slow,
      switchRealEpochMs: window.__landingHero.switchRealEpochMs,
    }));
    const selectionHeld = view.select ? await page.evaluate(pageSelectedId, view.select.layer) : null;
    await page.evaluate(() => window.__landingHero.stop());
    const after = await readState(page, view.layers);
    if (selection && selectionHeld !== null && selectionHeld !== selection.id) {
      log(`${name}: WARN the card closed during the recording (${selectionHeld})`);
    }
    writeFileSync(path.join(out, `${name}-frames.json`), JSON.stringify({
      frames,
      renders: renderLog.renders,
      slow: renderLog.slow,
      switchRealEpochMs: renderLog.switchRealEpochMs,
      master: 'lossless',
    }));
    log(`${name}: screencast`, frameStats(frames.map((f) => f.ts)), `recorded in ${recordRealS} s`);
    return {
      id: view.id,
      label: view.label,
      capturedAt: new Date().toISOString(),
      rehearsal,
      origin,
      url,
      cssWidth: CAPTURE.cssWidth,
      cssHeight: CAPTURE.cssHeight,
      dpr: CAPTURE.dpr,
      camera: before.camera,
      activeStack: before.activeStack,
      tilesetSource: before.tilesetSource,
      enabledLayers: before.enabledLayers,
      layerLifecycle: lifecycle,
      traffic: after.traffic,
      layersLoaded: loaded,
      subject,
      selection: selection && { ...selection, heldAfterRecording: selectionHeld === null ? 'not reported' : selectionHeld === selection.id },
      perfProfile: before.perf,
      drainedAfterS,
      realtimeTrial,
      slowMotion: renderLog.slow,
      speed,
      recordRealS,
      orbit: {
        ...orbit,
        center: orbitMeta.center,
        rangeM: orbitMeta.rangeM,
        law: orbit.amplitudeDeg ? 'amplitudeDeg * (1 - cos(2 * PI * t / periodS)) / 2' : 'fixed',
      },
      elapsedS: Math.round((Date.now() - started) / 1000),
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

async function main() {
  const options = parseCli(process.argv.slice(2));
  mkdirSync(options.out, { recursive: true });
  const reportFile = path.join(options.out, 'gallery-capture.json');
  const report = existsSync(reportFile) ? JSON.parse(readFileSync(reportFile, 'utf8')) : {};
  report.views ??= {};
  let sessions = 0;
  const failures = [];
  for (const view of options.views) {
    const name = `view-${view.id}`;
    try {
      if (!options.assembleOnly) {
        if (!options.rehearsal) sessions++;
        report.views[view.id] = await captureView(view, options);
      } else if (!report.views[view.id]) {
        throw new Error(`--assemble-only: no entry for view ${view.id} in ${reportFile}`);
      }
      const entry = report.views[view.id];
      const orbit = { ...options.loop, amplitudeDeg: entry.orbit.amplitudeDeg, periodS: entry.orbit.periodS ?? options.loop.periodS };
      const loop = assembleLoop({ name, out: options.out, orbit });
      loop.motion = await motionReport({
        master: path.join(ROOT, loop.master), fps: orbit.outputFps, orbit: orbit.amplitudeDeg > 0,
      });
      entry.loop = loop;
      log(`${name}: loop ${loop.width}×${loop.height}, ${loop.frames} frames, ${loop.sourceClock}, `
        + `renders missed ${loop.rendersMissed}; motion ${JSON.stringify(loop.motion)}`);
    } catch (error) {
      failures.push(`${name}: ${error.message.split('\n')[0]}`);
      log(`${name}: FAILED — ${error.message}`);
    }
    report.capture = { ...CAPTURE, loop: options.loop };
    writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
  }
  log(`done — ion sessions spent by this run: ${sessions}; report ${path.relative(ROOT, reportFile)}`);
  if (failures.length) {
    console.error(`${failures.length} view(s) failed:\n  ${failures.join('\n  ')}`);
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
