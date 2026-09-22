/**
 * @module data/mastViewshedImagery
 *
 * The selected mast's line of sight, fetched, computed and laid on the globe.
 *
 * `mastViewshed.js` is the geometry and has no browser in it; this file is
 * the three things that need one: fetching Mapterhorn's terrarium tiles
 * straight from their CDN (CORS open, keyless, cached a week at the edge),
 * decoding them to metres, and painting the result as ONE imagery tile over
 * the window's rectangle.
 *
 * ── THE COLOUR IS THE SELECTION'S ───────────────────────────────────────────
 * The lit ground belongs to the selected mast and to nothing else, so it wears
 * the selection cyan the dot and the rays already wear. It is not a class of
 * any key: it appears with a selection and goes with it.
 *
 * ── ONE TILE, RE-ROWED FROM MERCATOR TO LATITUDE ────────────────────────────
 * `SingleTileImageryProvider` stretches its image linearly in LATITUDE; the
 * DEM grid is linear in Mercator. Over 80 km the difference is a pixel or two,
 * but it costs one lookup per row to remove, so each output row is read from
 * the Mercator row that holds its latitude.
 */

import * as Cesium from 'cesium';

import {
  VIEWSHED_DEM_TILE_PX,
  VIEWSHED_DEM_URL,
  VIEWSHED_MAX_RADIUS_M,
  VIEWSHED_VISIBLE,
  computeViewshed,
  radioHorizonM,
  terrariumHeight,
  viewshedArea,
  viewshedWindow,
  viewshedWindowBounds,
} from './mastViewshed.js';

export const VIEWSHED_COLOR = '#00ffff';
export const VIEWSHED_ALPHA = 0.36;

/** Decode one terrarium tile's RGBA into heights. Pure, for the tests. */
export function terrariumToHeights(rgba, out = new Float32Array(rgba.length >> 2)) {
  for (let i = 0, p = 0; i < out.length; i++, p += 4) out[i] = terrariumHeight(rgba[p], rgba[p + 1], rgba[p + 2]);
  return out;
}

async function fetchDemTile({ z, x, y }, fetchImpl) {
  const url = VIEWSHED_DEM_URL.replace('{z}', z).replace('{x}', x).replace('{y}', y);
  const response = await fetchImpl(url);
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
}

/** Copy each fetched tile's overlap into the window's height grid. Pure. */
export function assembleHeights(window, tiles) {
  const { size, x0, y0 } = window;
  const heights = new Float32Array(size * size);
  const tilePx = VIEWSHED_DEM_TILE_PX;
  for (const { tile, heights: tileHeights } of tiles) {
    const tx0 = tile.x * tilePx;
    const ty0 = tile.y * tilePx;
    const colStart = Math.max(0, tx0 - x0);
    const colEnd = Math.min(size, tx0 + tilePx - x0);
    const rowStart = Math.max(0, ty0 - y0);
    const rowEnd = Math.min(size, ty0 + tilePx - y0);
    for (let row = rowStart; row < rowEnd; row++) {
      const source = (row + y0 - ty0) * tilePx + (colStart + x0 - tx0);
      heights.set(tileHeights.subarray(source, source + (colEnd - colStart)), row * size + colStart);
    }
  }
  return heights;
}

/**
 * Line of sight from the top of a mast, out to its radio horizon.
 * @param {{lon:number, lat:number, antennaM:number, fetchImpl?:Function}} input
 */
export async function computeMastViewshed({ lon, lat, antennaM, fetchImpl = (url) => fetch(url) }) {
  const horizonM = radioHorizonM(antennaM);
  const radiusM = Math.min(horizonM, VIEWSHED_MAX_RADIUS_M);
  const window = viewshedWindow(lon, lat, radiusM);
  const tiles = await Promise.all(window.tiles.map(async (tile) => ({ tile, heights: await fetchDemTile(tile, fetchImpl) })));
  const heights = assembleHeights(window, tiles);
  const grid = computeViewshed({
    heights,
    size: window.size,
    observerCol: window.observerCol,
    observerRow: window.observerRow,
    antennaM,
    pixelM: window.pixelM,
    radiusPx: window.radiusPx,
  });
  return {
    window,
    grid,
    radiusM,
    horizonM,
    capped: horizonM > VIEWSHED_MAX_RADIUS_M,
    groundM: heights[window.observerRow * window.size + window.observerCol],
    area: viewshedArea(grid, window.pixelM),
  };
}

/**
 * The visible cells as RGBA, rows re-sampled from Mercator to latitude so the
 * single tile lands where the cells are. Pure: returns the bytes and the size.
 */
export function viewshedRgba(result) {
  const { window, grid } = result;
  const { size, y0, z } = window;
  const [, south, , north] = viewshedWindowBounds(window);
  const worldPx = VIEWSHED_DEM_TILE_PX * 2 ** z;
  const rgba = new Uint8ClampedArray(size * size * 4);
  const r = Number.parseInt(VIEWSHED_COLOR.slice(1, 3), 16);
  const g = Number.parseInt(VIEWSHED_COLOR.slice(3, 5), 16);
  const b = Number.parseInt(VIEWSHED_COLOR.slice(5, 7), 16);
  const a = Math.round(VIEWSHED_ALPHA * 255);
  for (let row = 0; row < size; row++) {
    const lat = north - ((row + 0.5) * (north - south)) / size;
    const rad = (lat * Math.PI) / 180;
    const py = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * worldPx;
    const sourceRow = Math.min(size - 1, Math.max(0, Math.floor(py - y0)));
    for (let col = 0; col < size; col++) {
      if (grid[sourceRow * size + col] !== VIEWSHED_VISIBLE) continue;
      const p = (row * size + col) * 4;
      rgba[p] = r; rgba[p + 1] = g; rgba[p + 2] = b; rgba[p + 3] = a;
    }
  }
  return { rgba, size };
}

/** The viewshed as a Cesium imagery layer over its window. */
export function createViewshedImageryLayer(result) {
  const { rgba, size } = viewshedRgba(result);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  canvas.getContext('2d').putImageData(new ImageData(rgba, size, size), 0, 0);
  const [west, south, east, north] = viewshedWindowBounds(result.window);
  const provider = new Cesium.SingleTileImageryProvider({
    url: canvas.toDataURL('image/png'),
    rectangle: Cesium.Rectangle.fromDegrees(west, south, east, north),
    tileWidth: size,
    tileHeight: size,
  });
  return new Cesium.ImageryLayer(provider);
}
