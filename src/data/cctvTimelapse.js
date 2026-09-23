/**
 * @module cctvTimelapse
 * @description The last hour of a public traffic camera, recorded by this
 * server because nobody else keeps it. Server-only (node:fs, node:crypto).
 *
 * ── Why the server has to record ───────────────────────────────────────────
 *
 * The Métropole de Lyon "Criter" cameras publish ONE still per camera, re-
 * extracted from the live video roughly every 62 s, over the top of the last.
 * There is no archive, no `?t=` parameter, not even a Last-Modified header on
 * the frame (only the catalog row's `last_update`). So "what did this junction
 * look like at 10:26?" has an answer only if something fetched the frame at
 * 10:26 and kept it. This module is that something: it polls every capable
 * camera about once a minute, keeps a shrunken copy on DISK for a rolling
 * window (60 min by default), and serves the window back as a manifest of
 * frame URLs the camera panel plays as a short accelerated video.
 *
 * It is the chronicle's argument (`chronicle.js`) at camera scale: an hour this
 * server did not record is an hour nobody can show.
 *
 * ── What it costs (measured 2026-09-23) ────────────────────────────────────
 *
 *   - Upstream: Lyon frames are mostly 1920x1080 JPEG, 340–608 KB (a few
 *     640x360 / 320x240). Twelve working cameras polled every minute is
 *     12 × 0.42 MB × 1440 ≈ 7.3 GB a day inbound from
 *     download.data.grandlyon.com while recording.
 *   - Disk: each frame is re-encoded to 640 px wide, mozjpeg quality 68 —
 *     34–54 KB for a 1920x1080 source, 45–65 ms each on an M-series Mac. One
 *     camera-hour (≈ 60 frames) is 2–3 MB; twelve cameras ≈ 30 MB.
 *   - Memory: only an index of `{ t, bytes }` per frame is held; the bytes stay
 *     on disk. The staging container has a 1 GiB ceiling.
 *
 * ── What is never stored ───────────────────────────────────────────────────
 *
 * A failed fetch, the provider's "Image indisponible" placeholder (CWL7033
 * serves it), a JPEG published truncated (CWL5801, every cycle), and a frame
 * byte-identical to the camera's previous stored one — Criter re-publishes
 * about every 62 s, so a 60 s poll sometimes reads the same picture twice.
 * Nothing is stored at full resolution, ever: if the encoder cannot load, the
 * recorder switches itself off rather than keep 450 KB originals.
 *
 * ── Modes (`CCTV_TIMELAPSE`) ───────────────────────────────────────────────
 *
 *   - `always`: record while the server runs. The only mode that has an hour
 *     to show on a quiet deployment; set on staging.
 *   - `on-demand` (default): record every capable camera while someone has
 *     looked at ANY capable camera in the last `warmMs` (3 h). Interest is
 *     global because a reader hops between cameras, and the next one they open
 *     should already have a past.
 *   - `off`: no fetch, no disk.
 */
import { promises as fsp } from 'node:fs';
import path from 'node:path';

import { CCTV_PLACEHOLDER_FRAME_SHA256, cctvFrameSha256, isTruncatedJpegFrame } from './cctvFrameChecks.js';

export const CCTV_TIMELAPSE_MODES = Object.freeze(['always', 'on-demand', 'off']);
export const CCTV_TIMELAPSE_DEFAULT_MODE = 'on-demand';
export const CCTV_TIMELAPSE_DEFAULT_INTERVAL_MS = 60_000;
/** No source may be polled faster than this, whatever cadence it declares. */
export const CCTV_TIMELAPSE_MIN_INTERVAL_MS = 30_000;
export const CCTV_TIMELAPSE_DEFAULT_WINDOW_MIN = 60;
export const CCTV_TIMELAPSE_MIN_WINDOW_MIN = 5;
export const CCTV_TIMELAPSE_MAX_WINDOW_MIN = 360;
export const CCTV_TIMELAPSE_DEFAULT_WARM_MIN = 180;
/**
 * The bytes behind a frame URL never change (the URL is the capture time), so
 * a browser or the edge may keep it for the day. A pruned frame answers 404,
 * which is `no-store`.
 */
export const CCTV_TIMELAPSE_FRAME_CACHE_CONTROL = 'public, max-age=86400, immutable';
/** Width the stored frames are shrunk to; the panel never shows more. */
export const CCTV_TIMELAPSE_FRAME_WIDTH = 640;
export const CCTV_TIMELAPSE_JPEG_QUALITY = 68;
/**
 * Upper bound on an upstream body worth encoding. The largest Lyon frame
 * measured is 608 KB; anything ten times that is not a traffic still.
 */
export const CCTV_TIMELAPSE_MAX_SOURCE_BYTES = 6 * 1024 * 1024;
/**
 * Decoded-pixel ceiling handed to sharp, ~16.8 MP. A 1920x1080 frame is 2 MP
 * and shrink-on-load decodes it at half size anyway; the cap exists so one odd
 * upstream image cannot ask libvips for a gigabyte inside a 1 GiB container.
 */
export const CCTV_TIMELAPSE_MAX_INPUT_PIXELS = 4096 * 4096;

const SAFE_ID_RE = /^[a-z0-9._-]{1,96}$/;
const FRAME_FILE_RE = /^(\d{1,16})\.jpg$/;
const TEMP_FILE_RE = /^\.\d{1,16}\.jpg\.[a-z0-9.]+\.tmp$/;
const LOG_PREFIX = '[cctv-timelapse]';

/**
 * Whether a camera id may name a directory under the recorder's root.
 *
 * REJECTS rather than rewrites: a sanitiser that mapped `A` and `a` (or `a/b`
 * and `a_b`) to one directory would merge two cameras' pasts. Lower-case
 * letters, digits, `.`, `_`, `-`; no leading dot, so neither `.`/`..` nor a
 * hidden name can be spelled. Grand Lyon ids (`lyon-cwl9018`) pass as they are.
 *
 * @param {*} id
 * @returns {boolean}
 */
export function isSafeTimelapseCameraId(id) {
  return typeof id === 'string' && SAFE_ID_RE.test(id) && !id.startsWith('.');
}

/**
 * The frame URL a source declares, when it is plain http(s).
 *
 * @param {object|null|undefined} source
 * @returns {string} '' when none.
 */
function frameUrlOf(source) {
  const candidate = source?.snapshotUrl || source?.url || '';
  return typeof candidate === 'string' && /^https?:\/\//i.test(candidate) ? candidate : '';
}

/**
 * Does this catalog row opt into timelapse recording?
 *
 * The opt-in is the row's own `timelapse: true` (set by the pack that knows
 * its frames are a still re-published on a cadence — today only Grand Lyon),
 * plus a frame URL this server can fetch and an id it can use as a directory.
 *
 * @param {object|null|undefined} source
 * @returns {boolean}
 */
export function isTimelapseCapableSource(source) {
  return Boolean(source)
    && source.timelapse === true
    && isSafeTimelapseCameraId(source.id)
    && frameUrlOf(source) !== '';
}

/**
 * How often to poll one source: its declared upstream cadence, never faster
 * than 30 s, else the recorder default.
 *
 * @param {object|null|undefined} source
 * @param {number} [fallbackMs]
 * @returns {number}
 */
export function timelapseIntervalMs(source, fallbackMs = CCTV_TIMELAPSE_DEFAULT_INTERVAL_MS) {
  const declared = Number(source?.upstreamCadenceMs);
  if (source?.upstreamCadenceMs !== null && source?.upstreamCadenceMs !== undefined && Number.isFinite(declared)) {
    return Math.max(CCTV_TIMELAPSE_MIN_INTERVAL_MS, Math.round(declared));
  }
  return fallbackMs;
}

/**
 * Read the three switches. Nothing reads the environment at import time.
 *
 *   CCTV_TIMELAPSE            always | on-demand | off (anything else: on-demand)
 *   CCTV_TIMELAPSE_WINDOW_MIN rolling window kept on disk, 5..360, default 60
 *   CCTV_TIMELAPSE_WARM_MIN   on-demand: minutes recording continues after the
 *                             last look, 5..1440, default 180
 *
 * @param {Record<string, string|undefined>} [env]
 * @returns {{mode: 'always'|'on-demand'|'off', windowMs: number, warmMs: number}}
 */
export function cctvTimelapseOptionsFromEnv(env = process.env) {
  const rawMode = String(env?.CCTV_TIMELAPSE ?? '').trim().toLowerCase();
  const mode = CCTV_TIMELAPSE_MODES.includes(rawMode) ? rawMode : CCTV_TIMELAPSE_DEFAULT_MODE;
  const minutes = (raw, fallback, min, max) => {
    const text = String(raw ?? '').trim();
    const value = text === '' ? NaN : Number(text);
    return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
  };
  const windowMin = minutes(
    env?.CCTV_TIMELAPSE_WINDOW_MIN,
    CCTV_TIMELAPSE_DEFAULT_WINDOW_MIN,
    CCTV_TIMELAPSE_MIN_WINDOW_MIN,
    CCTV_TIMELAPSE_MAX_WINDOW_MIN,
  );
  const warmMin = minutes(env?.CCTV_TIMELAPSE_WARM_MIN, CCTV_TIMELAPSE_DEFAULT_WARM_MIN, 5, 1440);
  return { mode, windowMs: Math.round(windowMin * 60_000), warmMs: Math.round(warmMin * 60_000) };
}

/**
 * Public URL of one stored frame.
 *
 * @param {string} cameraId
 * @param {number} t - Capture time, epoch ms.
 * @returns {string}
 */
export function cctvTimelapseFrameUrl(cameraId, t) {
  return `/api/cctv/timelapse/${encodeURIComponent(cameraId)}/${t}.jpg`;
}

/**
 * Production encoder: sharp, loaded lazily, shrinking a frame to 640 px wide.
 *
 * sharp is a devDependency that the Docker image installs (`npm ci
 * --include=dev`), so it is present at runtime — but it is a native module,
 * and if it ever fails to load the recorder must stay OFF rather than fall
 * back to storing 450 KB originals. `ready()` answers that once; every later
 * call reuses the answer. `sharp.cache(false)` and `sharp.concurrency(1)` keep
 * libvips' native memory flat: one frame a second at most goes through it, so
 * its operation cache buys nothing and its thread pool only adds peaks.
 *
 * @param {object} [options]
 * @param {{log?: Function, warn?: Function}} [options.log]
 * @param {() => Promise<any>} [options.importSharp] - Seam for tests.
 * @returns {{ready: () => Promise<boolean>, encode: (buffer: Buffer) => Promise<Buffer|null>}}
 */
export function createSharpFrameEncoder({ log = console, importSharp = () => import('sharp') } = {}) {
  let loading = null;
  const load = () => {
    if (!loading) {
      loading = Promise.resolve()
        .then(importSharp)
        .then((mod) => {
          const sharp = mod?.default || mod;
          if (typeof sharp !== 'function') throw new Error('sharp module has no default export');
          sharp.cache(false);
          sharp.concurrency(1);
          return sharp;
        })
        .catch((error) => {
          log?.warn?.(`${LOG_PREFIX} sharp failed to load (${error?.message || error}); timelapse recording stays off.`);
          return null;
        });
    }
    return loading;
  };
  return {
    ready: async () => Boolean(await load()),
    encode: async (buffer) => {
      const sharp = await load();
      if (!sharp) return null;
      return sharp(buffer, { failOn: 'none', limitInputPixels: CCTV_TIMELAPSE_MAX_INPUT_PIXELS })
        .resize({ width: CCTV_TIMELAPSE_FRAME_WIDTH, withoutEnlargement: true })
        .jpeg({ quality: CCTV_TIMELAPSE_JPEG_QUALITY, mozjpeg: true })
        .toBuffer();
    },
  };
}

/**
 * Create the recorder. Nothing runs until `start()`; `tick()` may also be
 * driven by hand (the tests do).
 *
 * @param {object} options
 * @param {string} options.rootDir - `<rootDir>/<cameraId>/<t>.jpg`.
 * @param {() => Promise<object[]>|object[]} options.listSources - Current catalog.
 * @param {(url: string, source: object) => Promise<{ok: boolean, body: Buffer}|null>} options.fetchFrame
 * @param {(buffer: Buffer) => Promise<Buffer|null>} options.encodeFrame
 * @param {() => Promise<boolean>} [options.encoderReady] - False switches recording off.
 * @param {() => number} [options.now]
 * @param {number} [options.intervalMs] - Default poll interval.
 * @param {number} [options.windowMs] - Rolling window kept.
 * @param {'always'|'on-demand'|'off'} [options.mode]
 * @param {number} [options.warmMs] - On-demand: how long interest keeps recording.
 * @param {number} [options.concurrency] - Parallel upstream fetches, ≤ 3.
 * @param {number} [options.maxCameras] - Runaway bound on cameras recorded.
 * @param {number} [options.startDelayMs] - First tick after start (always mode).
 * @param {readonly string[]} [options.placeholderDigests]
 * @param {{setTimeout: Function, clearTimeout: Function}} [options.timers]
 * @param {{log?: Function, warn?: Function}} [options.log]
 */
export function createCctvTimelapseRecorder({
  rootDir,
  listSources,
  fetchFrame,
  encodeFrame,
  encoderReady = async () => true,
  now = Date.now,
  intervalMs = CCTV_TIMELAPSE_DEFAULT_INTERVAL_MS,
  windowMs = CCTV_TIMELAPSE_DEFAULT_WINDOW_MIN * 60_000,
  mode = CCTV_TIMELAPSE_DEFAULT_MODE,
  warmMs = CCTV_TIMELAPSE_DEFAULT_WARM_MIN * 60_000,
  concurrency = 3,
  maxCameras = 60,
  startDelayMs = 5_000,
  placeholderDigests = CCTV_PLACEHOLDER_FRAME_SHA256,
  timers = { setTimeout, clearTimeout },
  log = console,
} = {}) {
  if (!rootDir || typeof rootDir !== 'string') throw new TypeError('rootDir is required');
  const resolvedMode = CCTV_TIMELAPSE_MODES.includes(mode) ? mode : CCTV_TIMELAPSE_DEFAULT_MODE;
  const root = path.resolve(rootDir);
  const poolSize = Math.max(1, Math.min(3, Math.floor(concurrency) || 1));
  // Frames older than the window by up to one poll are kept, so the left edge
  // of a manifest is never a gap the player has to paper over.
  const retainMs = windowMs + intervalMs;
  // Second bound after the window: a camera polled at the 30 s floor fills
  // exactly this at the default 60 s interval, nothing legitimate exceeds it.
  const maxFramesPerCamera = Math.ceil(windowMs / intervalMs) * 2;

  /** @type {Map<string, {id: string, frames: {t: number, bytes: number}[], lastSourceSha: string|null, lastEncodedSha: string|null, lastAttemptAt: number, intervalMs: number, outcome: string|null}>} */
  const cameras = new Map();
  const counters = { stored: 0, placeholder: 0, truncated: 0, duplicate: 0, failed: 0, encode: 0, oversize: 0 };
  let lastInterestAt = null;
  let wasArmed = false;
  let running = false;
  let stopped = false;
  /** @type {Promise<void>|null} */
  let restoring = null;
  let timer = null;
  let inFlight = null;
  let ticks = 0;
  let lastTickAt = null;
  let lastTickMs = null;
  let encoderState = 'unloaded'; // → 'ready' | 'unavailable'
  let encodeChain = Promise.resolve();
  let warnedCameraCap = false;

  const info = (message) => log?.log?.(`${LOG_PREFIX} ${message}`);
  const warn = (message) => log?.warn?.(`${LOG_PREFIX} ${message}`);

  const enabled = () => resolvedMode !== 'off' && encoderState !== 'unavailable' && !stopped;
  const isArmed = (at) => {
    if (!enabled()) return false;
    if (resolvedMode === 'always') return true;
    return lastInterestAt !== null && at - lastInterestAt < warmMs;
  };

  const cameraDir = (id) => path.join(root, id);

  const stateFor = (id) => {
    let state = cameras.get(id);
    if (!state) {
      state = {
        id,
        frames: [],
        lastSourceSha: null,
        lastEncodedSha: null,
        lastAttemptAt: 0,
        intervalMs,
        outcome: null,
      };
      cameras.set(id, state);
    }
    return state;
  };

  /**
   * Log a camera's outcome only when it changes between healthy (stored, or a
   * re-read of the same frame) and a named failure, so a dead camera is one
   * line, not 1 440 a day.
   */
  const noteOutcome = (state, outcome) => {
    const previous = state.outcome;
    state.outcome = outcome;
    const healthy = (value) => value === 'stored' || value === 'duplicate';
    if (healthy(outcome)) {
      if (previous !== null && !healthy(previous)) info(`${state.id}: recording again (was ${previous}).`);
      return;
    }
    if (outcome !== previous) info(`${state.id}: not recording — ${outcome}.`);
  };

  const skip = (state, reason) => {
    counters[reason] += 1;
    noteOutcome(state, reason);
    return false;
  };

  /** Encodes one frame at a time: fetches overlap, CPU peaks do not. */
  const encodeSerially = (buffer) => {
    const run = encodeChain.then(() => encodeFrame(buffer));
    encodeChain = run.then(() => undefined, () => undefined);
    return run;
  };

  const ensureEncoder = async () => {
    if (encoderState === 'ready') return true;
    if (encoderState === 'unavailable') return false;
    let ok = false;
    try { ok = Boolean(await encoderReady()); } catch { ok = false; }
    encoderState = ok ? 'ready' : 'unavailable';
    if (!ok) warn('frame encoder unavailable — recording is OFF (full-resolution frames are never stored).');
    return ok;
  };

  const writeFrame = async (state, t, bytes) => {
    const dir = cameraDir(state.id);
    // Every time, not once: a directory swept by hand (or by the prune, for a
    // camera that came back) would otherwise fail every write after it. It is
    // one syscall a frame.
    await fsp.mkdir(dir, { recursive: true });
    const finalPath = path.join(dir, `${t}.jpg`);
    const tempPath = path.join(dir, `.${t}.jpg.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`);
    await fsp.writeFile(tempPath, bytes);
    if (stopped) {
      // A recorder replaced mid-tick (dev-server restart) must not leave a
      // file its successor's index will never hear of.
      await fsp.unlink(tempPath).catch(() => {});
      return false;
    }
    await fsp.rename(tempPath, finalPath);
    return true;
  };

  const capture = async (source) => {
    const state = stateFor(source.id);
    state.intervalMs = timelapseIntervalMs(source, intervalMs);
    state.lastAttemptAt = now();
    let fetched = null;
    try {
      fetched = await fetchFrame(frameUrlOf(source), source);
    } catch {
      fetched = null;
    }
    // Upstream frames carry no capture time (no Last-Modified), so the frame
    // is stamped with the moment this server received it.
    let t = Math.floor(now());
    const body = fetched?.ok ? fetched.body : null;
    if (!body || !body.length) return skip(state, 'failed');
    if (body.length > CCTV_TIMELAPSE_MAX_SOURCE_BYTES) return skip(state, 'oversize');
    const sourceSha = cctvFrameSha256(body);
    if (placeholderDigests.includes(sourceSha)) return skip(state, 'placeholder');
    if (isTruncatedJpegFrame(body)) return skip(state, 'truncated');
    if (sourceSha === state.lastSourceSha) return skip(state, 'duplicate');

    let encoded = null;
    try {
      encoded = await encodeSerially(body);
    } catch {
      encoded = null;
    }
    if (!encoded || !encoded.length) return skip(state, 'encode');
    // The encoder is deterministic, so after a restart (no source hash in
    // memory yet) the stored frame's own hash still catches a re-read.
    const encodedSha = cctvFrameSha256(encoded);
    state.lastSourceSha = sourceSha;
    if (encodedSha === state.lastEncodedSha) return skip(state, 'duplicate');

    const newest = state.frames[state.frames.length - 1];
    if (newest && t <= newest.t) t = newest.t + 1;
    if (!(await writeFrame(state, t, encoded))) return false;
    state.frames.push({ t, bytes: encoded.length });
    state.lastEncodedSha = encodedSha;
    counters.stored += 1;
    noteOutcome(state, 'stored');
    return true;
  };

  /** Drop what left the window (or overflowed the cap), from the index and the disk. */
  const prune = async (at, liveIds) => {
    const cutoff = at - retainMs;
    for (const [id, state] of cameras) {
      let drop = 0;
      while (drop < state.frames.length && state.frames[drop].t < cutoff) drop += 1;
      const overflow = state.frames.length - drop - maxFramesPerCamera;
      if (overflow > 0) drop += overflow;
      if (drop > 0) {
        const removed = state.frames.splice(0, drop);
        for (const frame of removed) {
          await fsp.unlink(path.join(cameraDir(id), `${frame.t}.jpg`)).catch(() => {});
        }
      }
      if (!state.frames.length && liveIds && !liveIds.has(id)) {
        // A camera that left the catalog and whose last frame expired: its
        // directory goes too (rmdir refuses anything not empty, by design).
        await fsp.rmdir(cameraDir(id)).catch(() => {});
        cameras.delete(id);
      }
    }
  };

  /** Rebuild the index from disk, so a redeploy keeps the last hour. */
  const restore = async () => {
    let entries = [];
    try {
      entries = await fsp.readdir(root, { withFileTypes: true });
    } catch {
      return; // nothing recorded yet
    }
    const cutoff = now() - retainMs;
    let frameCount = 0;
    for (const entry of entries) {
      if (!entry.isDirectory() || !isSafeTimelapseCameraId(entry.name)) continue;
      const dir = cameraDir(entry.name);
      let names = [];
      try {
        names = await fsp.readdir(dir);
      } catch {
        continue;
      }
      const frames = [];
      for (const name of names) {
        if (TEMP_FILE_RE.test(name)) {
          // Only this recorder's own temp names are swept — never anything else.
          await fsp.unlink(path.join(dir, name)).catch(() => {});
          continue;
        }
        const match = FRAME_FILE_RE.exec(name);
        if (!match) continue;
        const t = Number(match[1]);
        if (!Number.isSafeInteger(t)) continue;
        if (t < cutoff) {
          await fsp.unlink(path.join(dir, name)).catch(() => {});
          continue;
        }
        try {
          const stat = await fsp.stat(path.join(dir, name));
          if (stat.isFile()) frames.push({ t, bytes: stat.size });
        } catch { /* vanished between readdir and stat */ }
      }
      if (!frames.length) continue;
      frames.sort((a, b) => a.t - b.t);
      const state = stateFor(entry.name);
      state.frames = frames;
      try {
        state.lastEncodedSha = cctvFrameSha256(
          await fsp.readFile(path.join(dir, `${frames[frames.length - 1].t}.jpg`)),
        );
      } catch { /* dedup restarts from the next frame */ }
      frameCount += frames.length;
    }
    if (frameCount) info(`${frameCount} frames of ${cameras.size} cameras restored from disk.`);
  };

  const runTick = async () => {
    // A tick racing the restore would write a frame the restore's directory
    // listing may miss, and that file would never be indexed or pruned.
    if (restoring) await restoring;
    const startedAt = now();
    ticks += 1;
    let nextDelay = intervalMs;
    if (resolvedMode === 'off') return nextDelay;
    const armed = isArmed(startedAt);
    if (armed !== wasArmed) {
      if (resolvedMode === 'on-demand') {
        info(armed
          ? `armed by a reader — recording every capable camera for ${Math.round(warmMs / 60_000)} min after the last look.`
          : `disarmed — nobody looked for ${Math.round(warmMs / 60_000)} min; the recorded window ages out.`);
      }
      wasArmed = armed;
    }
    let liveIds = null;
    if (armed && (await ensureEncoder()) && !stopped) {
      let sources = null;
      try {
        sources = await listSources();
      } catch (error) {
        warn(`catalog unavailable (${error?.message || error}); skipping this tick.`);
      }
      let capable = Array.isArray(sources) ? sources.filter(isTimelapseCapableSource) : [];
      if (capable.length > maxCameras) {
        if (!warnedCameraCap) {
          warn(`${capable.length} capable cameras; recording the first ${maxCameras}.`);
          warnedCameraCap = true;
        }
        capable = capable.slice(0, maxCameras);
      }
      // An unreadable catalog says nothing about which cameras left it.
      if (Array.isArray(sources)) liveIds = new Set(capable.map((source) => source.id));
      if (capable.length) {
        nextDelay = Math.min(...capable.map((source) => timelapseIntervalMs(source, intervalMs)));
      }
      // A camera is due when at least its interval, less half a tick of
      // jitter, has passed: a 60 s camera on a 60 s tick is polled every tick
      // even when one fetch lands a few hundred ms early.
      const due = capable.filter((source) => {
        const state = cameras.get(source.id);
        if (!state?.lastAttemptAt) return true;
        return startedAt - state.lastAttemptAt >= timelapseIntervalMs(source, intervalMs) - nextDelay / 2;
      });
      let cursor = 0;
      const worker = async () => {
        while (cursor < due.length && !stopped) {
          const source = due[cursor];
          cursor += 1;
          try {
            await capture(source);
          } catch (error) {
            const state = stateFor(source.id);
            counters.failed += 1;
            noteOutcome(state, `error: ${error?.message || error}`);
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(poolSize, due.length) }, worker));
    }
    await prune(now(), liveIds);
    return nextDelay;
  };

  const clearTimer = () => {
    if (timer !== null) {
      timers.clearTimeout(timer);
      timer = null;
    }
  };

  const schedule = (delayMs) => {
    clearTimer();
    if (!running || stopped) return;
    timer = timers.setTimeout(() => {
      timer = null;
      void recorder.tick();
    }, Math.max(1_000, Math.round(delayMs)));
    timer?.unref?.();
  };

  const findFrame = (cameraId, t) => {
    if (!isSafeTimelapseCameraId(cameraId) || !Number.isSafeInteger(t)) return null;
    const state = cameras.get(cameraId);
    if (!state) return null;
    return state.frames.find((frame) => frame.t === t) || null;
  };

  const recorder = {
    rootDir: root,
    mode: resolvedMode,

    /** A reader looked at a capable camera: keep (or start) recording all of them. */
    noteInterest() {
      if (resolvedMode !== 'on-demand' || !enabled()) return;
      const at = now();
      const wasCold = !isArmed(at);
      lastInterestAt = at;
      // From cold, record NOW rather than up to a minute later: the first
      // frame is what turns "no history yet" into a timelapse that grows.
      if (wasCold && running && !inFlight) void recorder.tick();
    },

    /** Whether this camera has (or could have) a timelapse on this server. */
    isCapable(source) {
      return enabled() && isTimelapseCapableSource(source);
    },

    /** The window of stored frames for one camera, oldest first. */
    manifest(cameraId) {
      const at = now();
      const state = isSafeTimelapseCameraId(cameraId) ? cameras.get(cameraId) : null;
      const from = at - windowMs;
      const frames = (state?.frames || [])
        .filter((frame) => frame.t >= from)
        .map((frame) => ({ t: frame.t, url: cctvTimelapseFrameUrl(cameraId, frame.t) }));
      return {
        id: cameraId,
        recording: isArmed(at),
        mode: resolvedMode,
        windowMs,
        intervalMs: state?.intervalMs || intervalMs,
        from: frames.length ? frames[0].t : null,
        to: frames.length ? frames[frames.length - 1].t : null,
        // What the last attempt did ('stored', 'duplicate', or why it was
        // skipped). A camera that serves the "image indisponible" graphic or a
        // cut-off JPEG every minute records nothing for ever; this is how the
        // panel knows not to promise a timelapse for it.
        lastOutcome: state?.outcome || null,
        frames,
      };
    },

    /** Absolute path of a stored frame, or null. Only indexed frames resolve. */
    frameFile(cameraId, t) {
      return findFrame(cameraId, t) ? path.join(cameraDir(cameraId), `${t}.jpg`) : null;
    },

    /** Bytes of a stored frame, or null when unknown or already pruned. */
    async readFrame(cameraId, t) {
      const file = recorder.frameFile(cameraId, t);
      if (!file) return null;
      try {
        return await fsp.readFile(file);
      } catch {
        return null;
      }
    },

    /** One poll of every due camera, then the prune. Ticks never overlap. */
    tick() {
      if (inFlight) return inFlight;
      const startedAt = now();
      inFlight = (async () => {
        let nextDelay = intervalMs;
        try {
          nextDelay = await runTick();
        } catch (error) {
          warn(`tick failed: ${error?.message || error}`);
        } finally {
          lastTickAt = startedAt;
          lastTickMs = now() - startedAt;
          inFlight = null;
        }
        // Fixed RATE, not fixed delay: the next tick is counted from this
        // one's start, or a 3 s tick would stretch a 60 s poll to 63 s and
        // skip one of Criter's 62 s publications every half hour.
        schedule(nextDelay - (now() - startedAt));
      })();
      return inFlight;
    },

    /** Restore the index from disk and arm the scheduler. Resolves after the restore. */
    async start() {
      if (running || stopped || resolvedMode === 'off') {
        if (resolvedMode === 'off' && !running) info('off (CCTV_TIMELAPSE=off).');
        return;
      }
      running = true;
      if (!restoring) {
        restoring = restore().catch((error) => {
          warn(`restore failed: ${error?.message || error}`);
        });
      }
      await restoring;
      if (stopped) return;
      info(`mode ${resolvedMode}, window ${Math.round(windowMs / 60_000)} min, `
        + `poll every ${Math.round(intervalMs / 1_000)} s → ${root}`);
      schedule(resolvedMode === 'always' ? startDelayMs : intervalMs);
    },

    /** Clear every timer. Idempotent; an in-flight tick finishes without writing. */
    stop() {
      stopped = true;
      running = false;
      clearTimer();
    },

    /** Operator view, served under /api/cctv/health. */
    stats() {
      let frames = 0;
      let bytes = 0;
      let recordedCameras = 0;
      for (const state of cameras.values()) {
        if (state.frames.length) recordedCameras += 1;
        frames += state.frames.length;
        for (const frame of state.frames) bytes += frame.bytes;
      }
      const at = now();
      return {
        mode: resolvedMode,
        enabled: enabled(),
        recording: isArmed(at),
        encoder: encoderState,
        windowMs,
        intervalMs,
        warmMs,
        lastInterestAt,
        cameras: recordedCameras,
        frames,
        bytes,
        ticks,
        lastTickAt,
        lastTickMs,
        counts: { ...counters },
      };
    },
  };
  return recorder;
}

// ── One recorder per directory per process ──────────────────────────────────

/**
 * Keyed on `globalThis`, not on this module: Vite re-bundles and re-imports
 * `vite.config.js` (and everything it inlines, this file included) on a config
 * change or an in-process restart, and each import would otherwise bring a
 * second recorder polling the same cameras into the same directory.
 */
const REGISTRY_KEY = Symbol.for('surplomb.cctvTimelapse.recorders');

/**
 * Make `recorder` the only live one for its directory, stopping any previous
 * one. The newest wins because it carries the newest code and configuration.
 *
 * @param {ReturnType<typeof createCctvTimelapseRecorder>} recorder
 * @returns {typeof recorder}
 */
export function installCctvTimelapseRecorder(recorder) {
  const registry = globalThis[REGISTRY_KEY] || (globalThis[REGISTRY_KEY] = new Map());
  const previous = registry.get(recorder.rootDir);
  if (previous && previous !== recorder) previous.stop();
  registry.set(recorder.rootDir, recorder);
  return recorder;
}

// ── HTTP: the request → response decision, without the server ──────────────

/**
 * Parse a path under the `/api/cctv` mount.
 *
 *   /timelapse/<id>          → { kind: 'manifest', id }
 *   /timelapse/<id>/<t>.jpg  → { kind: 'frame', id, t }
 *
 * Anything else under `/timelapse/` is `{ kind: 'invalid' }` (a 404); a path
 * outside it is `null`, left to the other CCTV routes. `<t>` is digits only
 * and the id must pass `isSafeTimelapseCameraId` AFTER decoding, so `%2F` or
 * `..` cannot walk out of the recorder's directory.
 *
 * @param {string} pathname
 * @returns {null|{kind: 'invalid'}|{kind: 'manifest', id: string}|{kind: 'frame', id: string, t: number}}
 */
export function parseCctvTimelapsePath(pathname) {
  if (typeof pathname !== 'string' || !pathname.startsWith('/timelapse/')) return null;
  const rest = pathname.slice('/timelapse/'.length);
  const frame = /^([^/]+)\/(\d{1,16})\.jpg$/.exec(rest);
  const manifest = frame ? null : /^([^/]+)\/?$/.exec(rest);
  const rawId = frame ? frame[1] : manifest?.[1];
  if (!rawId) return { kind: 'invalid' };
  let id;
  try {
    id = decodeURIComponent(rawId);
  } catch {
    return { kind: 'invalid' };
  }
  if (!isSafeTimelapseCameraId(id)) return { kind: 'invalid' };
  if (!frame) return { kind: 'manifest', id };
  const t = Number(frame[2]);
  return Number.isSafeInteger(t) ? { kind: 'frame', id, t } : { kind: 'invalid' };
}

const JSON_NO_STORE = Object.freeze({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });

/**
 * Answer one timelapse request.
 *
 * A manifest needs the camera's CURRENT catalog row (`source`): only a capable
 * camera has one, and asking for it counts as interest. A frame needs only the
 * recorder's index — a camera briefly missing from a stale catalog keeps its
 * recorded past.
 *
 * @param {ReturnType<typeof parseCctvTimelapsePath>} route
 * @param {object} context
 * @param {ReturnType<typeof createCctvTimelapseRecorder>|null} context.recorder
 * @param {object|null} [context.source] - Catalog row for `route.id`.
 * @returns {Promise<{status: number, headers: Record<string, string>, body: string|Buffer}>}
 */
export async function cctvTimelapseResponse(route, { recorder, source = null } = {}) {
  if (route?.kind === 'manifest') {
    if (!recorder || !source || source.id !== route.id || !recorder.isCapable(source)) {
      return {
        status: 404,
        headers: { ...JSON_NO_STORE },
        body: JSON.stringify({ error: 'No timelapse for this camera', timelapse: false }),
      };
    }
    recorder.noteInterest();
    return { status: 200, headers: { ...JSON_NO_STORE }, body: JSON.stringify(recorder.manifest(route.id)) };
  }
  if (route?.kind === 'frame') {
    const bytes = recorder ? await recorder.readFrame(route.id, route.t) : null;
    if (bytes) {
      return {
        status: 200,
        headers: {
          'Content-Type': 'image/jpeg',
          'Content-Length': String(bytes.length),
          'Cache-Control': CCTV_TIMELAPSE_FRAME_CACHE_CONTROL,
          'X-Content-Type-Options': 'nosniff',
        },
        body: bytes,
      };
    }
    return { status: 404, headers: { ...JSON_NO_STORE }, body: JSON.stringify({ error: 'Timelapse frame not found' }) };
  }
  return { status: 404, headers: { ...JSON_NO_STORE }, body: JSON.stringify({ error: 'not found' }) };
}
