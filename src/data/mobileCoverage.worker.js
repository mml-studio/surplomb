/**
 * @module data/mobileCoverage.worker
 *
 * The coverage tiles' CPU work, off the main thread: download, PNG decode,
 * codes kept per tile, and the repaint through the mode's lookup table.
 *
 * Measured before it moved here, on a phone-class CPU (Chrome, 4× throttle):
 * a 12 s flight over the Mont-Blanc with the dead-zone view on spent 580 ms
 * more in main-thread long tasks than the masts alone, and dropped 11 more
 * frames past 50 ms. Every one of those milliseconds was a tile being drawn
 * into a canvas, read back and painted between two frames.
 *
 * Messages in:
 *   { type: 'capacity', capacity }             decoded tiles kept
 *   { type: 'paint', id, url, lut, crop, hatch } → { id, buffer } (RGBA, transferred)
 *   { type: 'read', id, url, px, py }          → { id, code } (null off land)
 *   { type: 'cancel', id }                     the paint is no longer wanted
 * Any failure answers { id, error }. The tables travel with every paint — the
 * mode's, and the stripes' in `hatch` — 1 KB each, and a worker that kept
 * tables would need the page to know which.
 *
 * On start it says whether it can decode at all ({ type: 'ready', ok }): a
 * browser with workers but no 2D OffscreenCanvas (Safari before 16.4) gets
 * `ok: false`, and the page falls back to decoding on the main thread.
 */

import {
  COVERAGE_TILE_EDGE,
  createCoverageTileStore,
  coverageTileCode,
  decodeCoverageRgba,
  paintCoverageTile,
} from './mobileCoverageTile.js';

const CAPACITY_DEFAULT = 192;

let context = null;
try {
  context = new OffscreenCanvas(COVERAGE_TILE_EDGE, COVERAGE_TILE_EDGE)
    .getContext('2d', { willReadFrequently: true });
} catch {
  context = null;
}

async function decode(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  // Bit-exact: the tiles carry no colour profile, and nothing here converts one.
  const bitmap = await createImageBitmap(await response.blob(), {
    colorSpaceConversion: 'none',
    premultiplyAlpha: 'none',
  });
  context.clearRect(0, 0, COVERAGE_TILE_EDGE, COVERAGE_TILE_EDGE);
  context.drawImage(bitmap, 0, 0);
  bitmap.close?.();
  return decodeCoverageRgba(context.getImageData(0, 0, COVERAGE_TILE_EDGE, COVERAGE_TILE_EDGE).data);
}

let store = createCoverageTileStore(decode, CAPACITY_DEFAULT);
const cancelled = new Set();

self.onmessage = async ({ data }) => {
  const { type, id } = data || {};
  if (type === 'capacity') {
    store = createCoverageTileStore(decode, Math.max(16, data.capacity | 0));
    return;
  }
  if (type === 'cancel') {
    // A cancel can cross the finished paint in flight; never let those pile up.
    if (cancelled.size > 512) cancelled.clear();
    cancelled.add(id);
    return;
  }
  try {
    const tile = await store.tile(data.url);
    if (type === 'read') {
      self.postMessage({ id, code: coverageTileCode(tile, data.px, data.py) });
      return;
    }
    if (cancelled.delete(id)) {
      self.postMessage({ id, cancelled: true });
      return;
    }
    const out = new Uint32Array(COVERAGE_TILE_EDGE * COVERAGE_TILE_EDGE);
    paintCoverageTile(tile, data.lut, out, data.crop, data.hatch);
    self.postMessage({ id, buffer: out.buffer }, [out.buffer]);
  } catch (error) {
    cancelled.delete(id);
    self.postMessage({ id, error: error?.message || String(error) });
  }
};

self.postMessage({ type: 'ready', ok: Boolean(context) });
