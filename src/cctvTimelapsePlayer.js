/**
 * The camera panel's timelapse: the last hour of one camera, played back as a
 * short loop instead of a single still.
 *
 * WHY IT EXISTS. The French traffic cameras (Métropole de Lyon, Criter) publish
 * one still per camera, replaced about once a minute, and keep no past: the
 * picture a reader sees is whatever the last minute looked like, with nothing
 * to say whether the queue is growing or clearing. The server records those
 * stills (`/api/cctv/timelapse/<id>`, see `src/data/cctvTimelapse.js`), and
 * this module turns the recording into something a reader can watch: sixty
 * frames at eight a second, a pause on the newest one, and the two clock times
 * that bound what is shown.
 *
 * WHAT IT DOES NOT DO. It never replaces the live frame: `#cctv-frame` keeps
 * its own refresh cycle underneath, the in-world projection keeps reading it,
 * and AGRANDIR still opens that full-resolution picture. The loop is drawn on
 * a canvas laid over it, from 640-pixel copies — a reader who wants detail
 * wants the live frame anyway.
 *
 * DOM-light on purpose: the player takes its canvas, its fetch, its image
 * loader and its timers as arguments, so the scheduling below runs under
 * `node --test` with fakes and no browser.
 */

import { formatTime } from './i18n/format.js';

/** Below this many recorded frames the loop is too short to read as motion. */
export const TIMELAPSE_MIN_FRAMES = 5;
/** Eight frames a second: an hour of one-a-minute stills plays in 7.5 s. */
export const TIMELAPSE_FRAME_MS = 125;
/** How long the newest frame stays up before the loop starts over. */
export const TIMELAPSE_HOLD_LAST_MS = 2000;
/** The recorder adds a frame about once a minute; ask for it at that pace. */
export const TIMELAPSE_MANIFEST_REFRESH_MS = 60_000;
/** Parallel frame downloads during the first fill (≈ 40 KB each). */
export const TIMELAPSE_PRELOAD_CONCURRENCY = 4;
/** While the panel is folded or the tab hidden, how often to look again. */
export const TIMELAPSE_IDLE_RECHECK_MS = 1000;

const FRAME_URL_PREFIX = '/api/cctv/timelapse/';

/**
 * Recorder outcomes that mean the camera itself publishes nothing usable
 * right now (src/data/cctvTimelapse.js): its "image indisponible" graphic, a
 * JPEG cut off before its end, or no answer. Not 'duplicate' — that is a
 * healthy camera read twice inside one publication minute.
 */
const FAILING_OUTCOMES = new Set(['placeholder', 'truncated', 'failed', 'oversize', 'encode']);

/**
 * @param {string} cameraId
 * @returns {string} The recording's manifest URL.
 */
export function timelapseManifestUrl(cameraId) {
  return `${FRAME_URL_PREFIX}${encodeURIComponent(String(cameraId || ''))}`;
}

/**
 * Validates a manifest from the recorder.
 *
 * Frames are sorted and de-duplicated by time, and only URLs under the
 * recorder's own path survive — the player draws whatever it is handed, so the
 * manifest is not trusted to point anywhere else.
 *
 * @param {unknown} raw Parsed JSON body.
 * @returns {{frames: Array<{t: number, url: string}>, from: number|null, to: number|null,
 *   recording: boolean, publishing: boolean, intervalMs: number|null, windowMs: number|null}|null}
 */
export function normalizeTimelapseManifest(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.frames)) return null;
  const byTime = new Map();
  for (const frame of raw.frames) {
    const t = Number(frame?.t);
    const url = typeof frame?.url === 'string' ? frame.url : '';
    if (!Number.isFinite(t) || t <= 0) continue;
    if (!url.startsWith(FRAME_URL_PREFIX)) continue;
    byTime.set(t, { t, url });
  }
  const frames = [...byTime.values()].sort((a, b) => a.t - b.t);
  const finiteOrNull = (value) => (Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null);
  return {
    frames,
    from: frames.length ? frames[0].t : null,
    to: frames.length ? frames[frames.length - 1].t : null,
    recording: raw.recording === true,
    publishing: !FAILING_OUTCOMES.has(String(raw.lastOutcome || '')),
    intervalMs: finiteOrNull(raw.intervalMs),
    windowMs: finiteOrNull(raw.windowMs),
  };
}

/**
 * Clock time of a frame, in the reader's language ("10:26", "10:26 AM").
 * @param {number} t Epoch milliseconds.
 * @param {{locale?: string, timeZone?: string}} [options] `timeZone` exists
 *   for tests; the panel uses the reader's own.
 * @returns {string}
 */
export function formatTimelapseClock(t, { locale, timeZone } = {}) {
  if (!Number.isFinite(t)) return '--:--';
  return formatTime(t, {
    hour: '2-digit',
    minute: '2-digit',
    ...(locale ? { locale } : {}),
    ...(timeZone ? { timeZone } : {}),
  });
}

/**
 * How long frame `index` of `count` stays on screen.
 * @param {number} index
 * @param {number} count
 * @returns {number} Milliseconds.
 */
export function timelapseFrameDelay(index, count) {
  return index >= count - 1 ? TIMELAPSE_HOLD_LAST_MS : TIMELAPSE_FRAME_MS;
}

/**
 * Loads one frame into a decoded image. Resolves null on failure: one missing
 * frame drops out of the loop, it does not stop it.
 * @param {string} url
 * @returns {Promise<HTMLImageElement|null>}
 */
function defaultLoadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      if (typeof img.decode === 'function') img.decode().then(() => resolve(img), () => resolve(img));
      else resolve(img);
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * @param {string} url
 * @returns {Promise<{ok: boolean, status: number, json: () => Promise<unknown>}>}
 */
function defaultFetchJson(url) {
  return fetch(url, { cache: 'no-store' });
}

/**
 * Creates the player for one panel.
 *
 * States, as `getState().status`:
 *   - `off`       no camera, or one without a recording (the panel shows the
 *                 live frame and nothing else);
 *   - `building`  the recorder has fewer than TIMELAPSE_MIN_FRAMES frames yet;
 *   - `loading`   frames are downloading (`loaded` / `total`);
 *   - `ready`     the loop is on screen, `playing` or paused on `index`.
 *
 * @param {object} options
 * @param {{width: number, height: number, getContext: Function}|null} options.canvas
 * @param {(state: object) => void} [options.onChange]
 * @param {() => boolean} [options.isVisible] False while the panel is folded or
 *   the tab hidden: nothing is drawn or fetched, and the loop waits.
 * @param {boolean} [options.reducedMotion] Start paused on the newest frame.
 * @param {(url: string) => Promise<object>} [options.fetchJson]
 * @param {(url: string) => Promise<object|null>} [options.loadImage]
 * @param {(fn: Function, ms: number) => unknown} [options.setTimer]
 * @param {(handle: unknown) => void} [options.clearTimer]
 * @returns {object}
 */
export function createCctvTimelapsePlayer({
  canvas = null,
  onChange = () => {},
  isVisible = () => true,
  reducedMotion = false,
  fetchJson = defaultFetchJson,
  loadImage = defaultLoadImage,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (handle) => clearTimeout(handle),
} = {}) {
  let cameraId = null;
  let generation = 0;
  let status = 'off';
  let manifest = null;
  /** @type {Map<number, object>} frame time → decoded image */
  const images = new Map();
  /** Frames with a decoded image, in time order: what the loop plays. */
  let playable = [];
  let index = 0;
  let playing = !reducedMotion;
  let loaded = 0;
  let total = 0;
  let playTimer = null;
  let refreshTimer = null;
  let refreshing = false;

  const state = () => ({
    cameraId,
    status,
    playing: status === 'ready' && playing,
    index,
    count: playable.length,
    frameTime: playable[index]?.t ?? null,
    from: playable[0]?.t ?? manifest?.from ?? null,
    to: playable[playable.length - 1]?.t ?? manifest?.to ?? null,
    recorded: manifest?.frames.length ?? 0,
    recording: !!manifest?.recording,
    loaded,
    total,
  });
  const emit = () => onChange(state());

  const stopPlayTimer = () => {
    if (playTimer !== null) clearTimer(playTimer);
    playTimer = null;
  };
  const stopRefreshTimer = () => {
    if (refreshTimer !== null) clearTimer(refreshTimer);
    refreshTimer = null;
  };

  const draw = () => {
    const frame = playable[index];
    const img = frame ? images.get(frame.t) : null;
    if (!canvas || !img) return;
    const w = img.naturalWidth || img.width || 0;
    const h = img.naturalHeight || img.height || 0;
    if (!w || !h) return;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx?.drawImage(img, 0, 0, w, h);
  };

  const schedulePlay = (delay) => {
    stopPlayTimer();
    const gen = generation;
    playTimer = setTimer(() => {
      playTimer = null;
      if (gen !== generation || status !== 'ready' || !playing) return;
      if (!isVisible()) {
        schedulePlay(TIMELAPSE_IDLE_RECHECK_MS);
        return;
      }
      index = playable.length ? (index + 1) % playable.length : 0;
      draw();
      emit();
      schedulePlay(timelapseFrameDelay(index, playable.length));
    }, delay);
  };

  const rebuildPlayable = () => {
    const current = playable[index]?.t ?? null;
    playable = (manifest?.frames || []).filter((frame) => images.has(frame.t));
    const kept = current === null ? -1 : playable.findIndex((frame) => frame.t === current);
    index = kept >= 0 ? kept : Math.max(0, playable.length - 1);
  };

  const preload = async (gen, frames) => {
    const queue = frames.filter((frame) => !images.has(frame.t));
    total = frames.length;
    loaded = frames.length - queue.length;
    const worker = async () => {
      while (queue.length) {
        const frame = queue.shift();
        const img = await loadImage(frame.url);
        if (gen !== generation) return;
        if (img) images.set(frame.t, img);
        loaded += 1;
        if (status === 'loading') emit();
      }
    };
    const workers = [];
    for (let i = 0; i < TIMELAPSE_PRELOAD_CONCURRENCY; i += 1) workers.push(worker());
    await Promise.all(workers);
  };

  const scheduleRefresh = (delay = TIMELAPSE_MANIFEST_REFRESH_MS) => {
    stopRefreshTimer();
    const gen = generation;
    refreshTimer = setTimer(() => {
      refreshTimer = null;
      if (gen !== generation) return;
      if (!isVisible()) {
        scheduleRefresh(TIMELAPSE_IDLE_RECHECK_MS * 5);
        return;
      }
      refresh();
    }, delay);
  };

  async function refresh() {
    if (!cameraId || refreshing) return;
    const gen = generation;
    refreshing = true;
    try {
      let response = null;
      try {
        response = await fetchJson(timelapseManifestUrl(cameraId));
      } catch {
        response = null;
      }
      if (gen !== generation) return;
      if (response && response.status === 404) {
        // This camera has no recording at all: the panel is a still, for good.
        status = 'off';
        manifest = null;
        emit();
        return;
      }
      const next = response?.ok ? normalizeTimelapseManifest(await response.json().catch(() => null)) : null;
      if (gen !== generation) return;
      if (!next) {
        // A failed refresh keeps whatever loop is already on screen.
        if (status !== 'ready') {
          status = 'off';
          emit();
        }
        scheduleRefresh();
        return;
      }
      manifest = next;
      const wanted = new Set(next.frames.map((frame) => frame.t));
      for (const t of images.keys()) if (!wanted.has(t)) images.delete(t);

      if (next.frames.length < TIMELAPSE_MIN_FRAMES && !next.recording && status !== 'ready') {
        // Nothing to play and nothing coming (the server records nothing):
        // the panel keeps its still and makes no promise.
        status = 'off';
        emit();
        return;
      }
      if (next.frames.length < TIMELAPSE_MIN_FRAMES && !next.publishing && status !== 'ready') {
        // The camera itself sends no usable picture: no promise either, but
        // keep asking — it may come back.
        status = 'off';
        emit();
        scheduleRefresh();
        return;
      }
      if (next.frames.length < TIMELAPSE_MIN_FRAMES) {
        if (status !== 'ready') {
          status = 'building';
          rebuildPlayable();
          emit();
          scheduleRefresh();
          return;
        }
      }
      if (status !== 'ready') {
        status = 'loading';
        emit();
      }
      await preload(gen, next.frames);
      if (gen !== generation) return;
      const wasReady = status === 'ready';
      rebuildPlayable();
      if (playable.length < TIMELAPSE_MIN_FRAMES && !wasReady) {
        status = 'building';
        emit();
        scheduleRefresh();
        return;
      }
      status = 'ready';
      if (!wasReady) {
        // First fill: open on the oldest frame so the loop reads forward in
        // time — unless motion is unwelcome, then sit on the newest.
        index = playing ? 0 : playable.length - 1;
        draw();
        emit();
        if (playing) schedulePlay(timelapseFrameDelay(index, playable.length));
      } else {
        draw();
        emit();
      }
      scheduleRefresh();
    } finally {
      if (gen === generation) refreshing = false;
    }
  }

  const reset = () => {
    generation += 1;
    stopPlayTimer();
    stopRefreshTimer();
    refreshing = false;
    images.clear();
    playable = [];
    manifest = null;
    index = 0;
    loaded = 0;
    total = 0;
    playing = !reducedMotion;
    status = 'off';
  };

  return {
    /**
     * Points the player at a camera, or at none. `capable` is the catalog's
     * `timelapse` flag; a camera without it never asks the server.
     * @param {string|null} nextCameraId
     * @param {{capable?: boolean}} [options]
     */
    setCamera(nextCameraId, { capable = true } = {}) {
      const id = nextCameraId && capable ? String(nextCameraId) : null;
      if (id === cameraId) return;
      reset();
      cameraId = id;
      emit();
      if (id) refresh();
    },
    play() {
      if (status !== 'ready' || playing) return;
      playing = true;
      // Pressing play on the newest frame starts the hour over.
      if (index >= playable.length - 1) index = 0;
      draw();
      emit();
      schedulePlay(timelapseFrameDelay(index, playable.length));
    },
    pause() {
      if (!playing) return;
      playing = false;
      stopPlayTimer();
      emit();
    },
    toggle() {
      if (playing && status === 'ready') this.pause();
      else this.play();
    },
    /** Shows frame `i` and pauses there — the scrubber's handler. */
    seek(i) {
      if (status !== 'ready' || !playable.length) return;
      playing = false;
      stopPlayTimer();
      index = Math.max(0, Math.min(playable.length - 1, Math.round(Number(i) || 0)));
      draw();
      emit();
    },
    /** Redraws the current frame (after the canvas was re-attached or resized). */
    redraw() { draw(); },
    getState: state,
    destroy() {
      reset();
      cameraId = null;
    },
  };
}
