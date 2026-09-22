/**
 * @module data/mobileCoverageTiles
 *
 * Where the coverage tiles are decoded and painted: in `mobileCoverage.worker.js`
 * when the browser can host it, on the main thread otherwise. Both run the same
 * code (`mobileCoverageTile.js`) over the same kind of store, so the answer is
 * identical and only the thread differs.
 *
 * ONE SOURCE FOR THE WHOLE PAGE. The globe's layer, the layer draped on Google
 * 3D and the ground card all ask for the same tiles; sharing one store means a
 * tile is downloaded and decoded once per session, and a chip press repaints
 * from memory.
 */

import {
  COVERAGE_TILE_EDGE,
  coverageTileCode,
  createCoverageTileStore,
  decodeCoverageRgba,
  paintCoverageTile,
} from './mobileCoverageTile.js';

const PIXELS = COVERAGE_TILE_EDGE * COVERAGE_TILE_EDGE;

function defaultCreateWorker() {
  if (typeof Worker !== 'function' || typeof OffscreenCanvas !== 'function') return null;
  try {
    return new Worker(new URL('./mobileCoverage.worker.js', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
}

let _inlineContext = null;

/** The main-thread decode, for a browser without a usable worker. */
async function defaultDecodeInline(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const bitmap = await createImageBitmap(await response.blob(), {
    colorSpaceConversion: 'none',
    premultiplyAlpha: 'none',
  });
  if (!_inlineContext) {
    const canvas = document.createElement('canvas');
    canvas.width = COVERAGE_TILE_EDGE;
    canvas.height = COVERAGE_TILE_EDGE;
    _inlineContext = canvas.getContext('2d', { willReadFrequently: true });
  }
  _inlineContext.clearRect(0, 0, COVERAGE_TILE_EDGE, COVERAGE_TILE_EDGE);
  _inlineContext.drawImage(bitmap, 0, 0);
  bitmap.close?.();
  return decodeCoverageRgba(_inlineContext.getImageData(0, 0, COVERAGE_TILE_EDGE, COVERAGE_TILE_EDGE).data);
}

/**
 * @param {object} [options]
 * @param {number} [options.capacity] Decoded tiles kept (72 KB each at most).
 * @param {() => ?Worker} [options.createWorker] Injected for tests.
 * @param {(url: string) => Promise<object>} [options.decodeInline] Injected for tests.
 */
export function createCoverageTileSource({
  capacity = 192,
  createWorker = defaultCreateWorker,
  decodeInline = defaultDecodeInline,
} = {}) {
  let worker = createWorker();
  let inline = null;
  const jobs = new Map();
  let nextId = 1;

  function run(job) {
    inline.tile(job.url).then((tile) => {
      if (job.kind === 'read') {
        job.resolve(coverageTileCode(tile, job.px, job.py));
      } else if (job.cancelled) {
        job.resolve(null);
      } else {
        const out = new Uint32Array(PIXELS);
        paintCoverageTile(tile, job.lut, out, job.crop);
        job.resolve(out.buffer);
      }
    }, job.reject);
  }

  /** Give up on the worker: every job it still owes is done here instead. */
  function goInline() {
    if (inline) return;
    worker?.terminate?.();
    worker = null;
    inline = createCoverageTileStore(decodeInline, capacity);
    const owed = [...jobs.values()];
    jobs.clear();
    for (const job of owed) run(job);
  }

  if (worker) {
    worker.onmessage = ({ data }) => {
      if (data?.type === 'ready') {
        if (!data.ok) goInline();
        return;
      }
      const job = jobs.get(data?.id);
      if (!job) return;
      jobs.delete(data.id);
      if (data.error) job.reject(new Error(data.error));
      else if (data.cancelled) job.resolve(null);
      else if (job.kind === 'read') job.resolve(data.code ?? null);
      else job.resolve(data.buffer);
    };
    worker.onerror = () => goInline();
    worker.postMessage({ type: 'capacity', capacity });
  } else {
    goInline();
  }

  function submit(job) {
    const promise = new Promise((resolve, reject) => {
      job.resolve = resolve;
      job.reject = reject;
    });
    if (inline) {
      run(job);
    } else {
      jobs.set(job.id, job);
      const { resolve, reject, cancelled, ...message } = job;
      worker.postMessage({ type: job.kind, ...message });
    }
    return promise;
  }

  return {
    /** 'worker' or 'inline' — for the stats and the harness. */
    get backend() { return inline ? 'inline' : 'worker'; },

    /**
     * Paint one tile through `lut`.
     * @returns {{promise: Promise<?ArrayBuffer>, cancel: () => void}} RGBA
     *   bytes, or null when cancelled first.
     */
    paint(url, lut, crop = null) {
      const job = { id: nextId++, kind: 'paint', url, lut, crop };
      const promise = submit(job);
      return {
        promise,
        cancel() {
          job.cancelled = true;
          if (!inline && jobs.has(job.id)) worker.postMessage({ type: 'cancel', id: job.id });
        },
      };
    },

    /** The code of one pixel of one tile, or null off land. */
    read(url, px, py) {
      return submit({ id: nextId++, kind: 'read', url, px, py });
    },

    destroy() {
      worker?.terminate?.();
      worker = null;
      for (const job of jobs.values()) job.resolve(null);
      jobs.clear();
      inline?.clear();
    },
  };
}
