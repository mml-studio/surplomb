/**
 * @module data/mastViewshed.worker
 *
 * The selected mast's line of sight, off the main thread: twelve DEM tiles
 * fetched and decoded, the rays cast, the relief shaded and the result
 * painted (`mastViewshedPaint.js`). Only the painted RGBA comes back,
 * transferred rather than copied.
 *
 * Measured before it moved here (Node 26, 2026-09-23): the rays, the relief
 * and the paint alone cost 90 to 155 ms for masts of 30 to 150 m, on grids of
 * 1 039 to 1 505 cells a side — one long task on the click that selected the
 * mast, before the twelve tile decodes and the PNG round trip around it.
 *
 * Messages in:  { id, lon, lat, antennaM }
 * Messages out: { id, result } (`result.rgba` transferred) or { id, error }.
 *
 * On start it says whether it can decode at all ({ type: 'ready', ok }): a
 * browser with workers but no 2D OffscreenCanvas (Safari before 16.4) gets
 * `ok: false`, and the page computes on the main thread instead.
 */

import { VIEWSHED_DEM_TILE_PX } from './mastViewshed.js';
import { paintMastViewshed, terrariumToHeights, viewshedDemTileUrl } from './mastViewshedPaint.js';

let context = null;
try {
  context = new OffscreenCanvas(VIEWSHED_DEM_TILE_PX, VIEWSHED_DEM_TILE_PX)
    .getContext('2d', { willReadFrequently: true });
} catch {
  context = null;
}

async function loadDemTile(tile) {
  const response = await fetch(viewshedDemTileUrl(tile));
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  // Bit-exact: a height is three bytes of one pixel, and no colour management
  // may touch them.
  const bitmap = await createImageBitmap(await response.blob(), {
    colorSpaceConversion: 'none',
    premultiplyAlpha: 'none',
  });
  context.clearRect(0, 0, VIEWSHED_DEM_TILE_PX, VIEWSHED_DEM_TILE_PX);
  context.drawImage(bitmap, 0, 0);
  bitmap.close?.();
  return terrariumToHeights(context.getImageData(0, 0, VIEWSHED_DEM_TILE_PX, VIEWSHED_DEM_TILE_PX).data);
}

self.onmessage = async ({ data }) => {
  const { id, lon, lat, antennaM } = data || {};
  try {
    const result = await paintMastViewshed({ lon, lat, antennaM, loadDemTile });
    self.postMessage({ id, result }, [result.rgba.buffer]);
  } catch (error) {
    self.postMessage({ id, error: error?.message || String(error) });
  }
};

self.postMessage({ type: 'ready', ok: Boolean(context) });
