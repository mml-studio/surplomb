/**
 * @module data/mastViewshedImagery
 *
 * The selected mast's line of sight, computed and laid on the globe.
 *
 * `mastViewshed.js` is the geometry and `mastViewshedPaint.js` the colours,
 * both without a browser in them; this file is what needs one: the thread the
 * work runs on, and the imagery layer that shows it.
 *
 * ── OFF THE MAIN THREAD ─────────────────────────────────────────────────────
 * The whole computation — twelve Mapterhorn terrarium tiles fetched straight
 * from their CDN (CORS open, keyless, cached a week at the edge) and decoded,
 * the rays, the relief, the paint — runs in `mastViewshed.worker.js`. It used
 * to run on the main thread, on the click that selected the mast: 90 to
 * 155 ms of rays, relief and paint (Node 26, masts of 30 to 150 m), then a
 * synchronous PNG encode of the result (`toDataURL`, up to 10 MB of pixels)
 * that Cesium decoded back into the same pixels.
 *
 * Now the worker hands back the painted RGBA, transferred, and the layer gives
 * it to Cesium as an `ImageData`, whose straight alpha it uploads as is — the
 * same way the coverage tiles arrive (`mobileCoverageImagery.js`). A browser
 * with no usable worker (no 2D `OffscreenCanvas`: Safari before 16.4) runs the
 * same code on the main thread, as before, minus the PNG round trip.
 */

import * as Cesium from 'cesium';

import { VIEWSHED_DEM_TILE_PX, viewshedWindowBounds } from './mastViewshed.js';
import { paintMastViewshed, terrariumToHeights, viewshedDemTileUrl, viewshedRgba } from './mastViewshedPaint.js';

export {
  VIEWSHED_COLOR,
  VIEWSHED_RIM_CELLS,
  assembleHeights,
  terrariumToHeights,
  viewshedRelief,
  viewshedRgba,
} from './mastViewshedPaint.js';

/**
 * Never fetched: the provider's `requestImage` is replaced below. Cesium's
 * debug build checks that a URL was given, so one is.
 */
const PIXELS_HANDED_OVER = 'data:,viewshed';

function defaultCreateWorker() {
  if (typeof Worker !== 'function' || typeof OffscreenCanvas !== 'function') return null;
  try {
    return new Worker(new URL('./mastViewshed.worker.js', import.meta.url), { type: 'module' });
  } catch {
    return null;
  }
}

/** The main-thread DEM tile decode, for a browser without a usable worker. */
function inlineDemTileLoader(fetchImpl) {
  return async (tile) => {
    const response = await fetchImpl(viewshedDemTileUrl(tile));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bitmap = await createImageBitmap(await response.blob(), {
      colorSpaceConversion: 'none',
      premultiplyAlpha: 'none',
    });
    const canvas = document.createElement('canvas');
    canvas.width = VIEWSHED_DEM_TILE_PX;
    canvas.height = VIEWSHED_DEM_TILE_PX;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0);
    bitmap.close?.();
    return terrariumToHeights(context.getImageData(0, 0, VIEWSHED_DEM_TILE_PX, VIEWSHED_DEM_TILE_PX).data);
  };
}

/**
 * Where line-of-sight jobs run: the worker when the browser can host it, the
 * main thread otherwise — and any job the worker still owes when it turns out
 * it cannot decode, or crashes, is run on the main thread instead.
 * @param {object} [options]
 * @param {() => ?Worker} [options.createWorker] Injected for tests.
 * @param {(input: object) => Promise<object>} [options.computeInline] Injected for tests.
 */
export function createViewshedRunner({
  createWorker = defaultCreateWorker,
  computeInline = ({ lon, lat, antennaM, fetchImpl = (url) => fetch(url) }) => paintMastViewshed({
    lon, lat, antennaM, loadDemTile: inlineDemTileLoader(fetchImpl),
  }),
} = {}) {
  let worker = createWorker();
  const jobs = new Map();
  let nextId = 1;

  function goInline() {
    if (!worker) return;
    worker.terminate?.();
    worker = null;
    const owed = [...jobs.values()];
    jobs.clear();
    for (const job of owed) computeInline(job.input).then(job.resolve, job.reject);
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
      else job.resolve(data.result);
    };
    worker.onerror = () => goInline();
  }

  return {
    /** 'worker' or 'inline' — for the stats and the harness. */
    get backend() { return worker ? 'worker' : 'inline'; },

    /** @returns {Promise<object>} What `paintMastViewshed` returns. */
    run(input) {
      if (!worker) return computeInline(input);
      return new Promise((resolve, reject) => {
        const id = nextId++;
        jobs.set(id, { input, resolve, reject });
        const { lon, lat, antennaM } = input;
        worker.postMessage({ id, lon, lat, antennaM });
      });
    },
  };
}

let _runner = null;

/**
 * Line of sight from the top of a mast, out to its radio horizon, painted.
 * The page's one runner is made on the first selection that asks for one.
 * @param {{lon:number, lat:number, antennaM:number, fetchImpl?:Function}} input
 */
export function computeMastViewshed(input) {
  _runner ??= createViewshedRunner();
  return _runner.run(input);
}

/** The viewshed as a Cesium imagery layer over its window. */
export function createViewshedImageryLayer(result) {
  const { rgba, size } = result.rgba ? result : viewshedRgba(result);
  const image = new ImageData(rgba, size, size);
  const [west, south, east, north] = viewshedWindowBounds(result.window);
  const provider = new Cesium.SingleTileImageryProvider({
    url: PIXELS_HANDED_OVER,
    rectangle: Cesium.Rectangle.fromDegrees(west, south, east, north),
    tileWidth: size,
    tileHeight: size,
  });
  provider.requestImage = () => Promise.resolve(image);
  return new Cesium.ImageryLayer(provider);
}
