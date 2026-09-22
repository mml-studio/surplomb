/**
 * @module data/mobileCoverageImagery
 *
 * The ARCEP coverage pyramid as a Cesium imagery layer: fetch a coded tile,
 * repaint it in the colours of the current mode, hand Cesium a canvas.
 *
 * ── WHY THE TILES ARE CODES AND THE COLOURS ARE HERE ────────────────────────
 * Five views of the same pixels — the four operators and the count of them —
 * would be five pyramids on the server if the colour were baked in. One byte
 * per pixel holds all five (see `mobileCoverage.js`), and repainting 65 536
 * pixels through a 256-entry lookup table costs well under a millisecond, so
 * switching mode re-reads tiles the browser already holds rather than
 * downloading another pyramid.
 *
 * The decode has to be BIT-EXACT: a code of 0xAA read as 0xAB is a different
 * operator at a different level. Two things guarantee it. The tiles carry no
 * gAMA / iCCP / sRGB chunk (asserted in `coverageTiler.test.mjs`), and the
 * image is decoded with `skipColorSpaceConversion`, which Cesium turns into
 * `createImageBitmap(..., { colorSpaceConversion: 'none', premultiplyAlpha:
 * 'none' })`. Alpha is 0 or 255 and nothing else, so the canvas's internal
 * premultiplication cannot round a code either.
 *
 * ── ON THE GLOBE ONLY ───────────────────────────────────────────────────────
 * The layer is added to `viewer.imageryLayers`, which the photorealistic stack
 * hides with the globe. That is deliberate for now: draping imagery on the
 * Google mesh is an experimental Cesium path this repository has never run,
 * it would climb façades (CARTOGRAPHY F4), and it cannot be exercised by the
 * headless QA fleet, which stays off the metered tiles. The row says so rather
 * than drawing nothing silently (A4).
 */

import * as Cesium from 'cesium';

import {
  COVERAGE_TILE_PX,
  coverageTileAt,
  coverageTileExists,
  coverageTileUrl,
} from './mobileCoverage.js';

const EMPTY_TILE_PX = 1;
let _emptyCanvas = null;

function emptyCanvas() {
  if (!_emptyCanvas && typeof document !== 'undefined') {
    _emptyCanvas = document.createElement('canvas');
    _emptyCanvas.width = EMPTY_TILE_PX;
    _emptyCanvas.height = EMPTY_TILE_PX;
  }
  return _emptyCanvas;
}

/**
 * Repaint decoded RGBA pixels through a lookup table, in place.
 *
 * `rgba` is the canvas's own bytes: the code is in R (G and B repeat it) and
 * the land mask in A. Pure, so the one piece of arithmetic that decides every
 * colour on screen is tested without a canvas.
 * @param {Uint8ClampedArray|Uint8Array} rgba
 * @param {Uint32Array} lut 256 packed RGBA values, little-endian (`ImageData` order)
 */
export function paintCoverageRgba(rgba, lut) {
  const out = new Uint32Array(rgba.buffer, rgba.byteOffset, rgba.byteLength >> 2);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    out[i] = rgba[p + 3] ? lut[rgba[p]] : 0;
  }
}

/** The code and land flag of one pixel of decoded RGBA, or null off land. */
export function coverageCodeAt(rgba, px, py) {
  const p = (py * COVERAGE_TILE_PX + px) * 4;
  if (!rgba[p + 3]) return null;
  return rgba[p];
}

function decodeToCanvas(image) {
  const canvas = document.createElement('canvas');
  canvas.width = COVERAGE_TILE_PX;
  canvas.height = COVERAGE_TILE_PX;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  image.close?.();
  return { canvas, context, image: context.getImageData(0, 0, COVERAGE_TILE_PX, COVERAGE_TILE_PX) };
}

/**
 * An imagery provider over the pyramid, painting through `lut`.
 *
 * A `UrlTemplateImageryProvider` for the tiling scheme, the rectangle and the
 * level range — and its `requestImage` replaced, because the stock one hands
 * Cesium the PNG as decoded, which here would be a grey picture of codes.
 * Tiles the meta's index says were never written (sea, abroad) answer a
 * 1-pixel transparent canvas without a request.
 *
 * @param {object} meta The pyramid's meta.json
 * @param {Uint32Array} lut
 * @param {{credit?: string}} [options]
 */
export function createCoverageImageryProvider(meta, lut, { credit } = {}) {
  const [west, south, east, north] = meta.bounds || [-5.5, 41.2, 9.8, 51.2];
  const provider = new Cesium.UrlTemplateImageryProvider({
    url: coverageTileUrl(meta.edition, '{z}', '{x}', '{y}').replace(/%7B/g, '{').replace(/%7D/g, '}'),
    enablePickFeatures: false,
    tilingScheme: new Cesium.WebMercatorTilingScheme(),
    rectangle: Cesium.Rectangle.fromDegrees(west, south, east, north),
    minimumLevel: meta.minZoom,
    maximumLevel: meta.maxZoom,
    tileWidth: COVERAGE_TILE_PX,
    tileHeight: COVERAGE_TILE_PX,
    hasAlphaChannel: true,
    credit,
  });
  provider.requestImage = (x, y, level, request) => {
    if (!coverageTileExists(meta, level, x, y)) return Promise.resolve(emptyCanvas());
    const resource = new Cesium.Resource({ url: coverageTileUrl(meta.edition, level, x, y, meta.builtAt), request });
    const pending = resource.fetchImage({ preferImageBitmap: true, skipColorSpaceConversion: true, flipY: false });
    // `undefined` is Cesium's "throttled, ask again next frame".
    if (!pending) return undefined;
    return pending.then((bitmap) => {
      const { canvas, context, image } = decodeToCanvas(bitmap);
      paintCoverageRgba(image.data, lut);
      context.putImageData(image, 0, 0);
      return canvas;
    });
  };
  return provider;
}

/**
 * The code under one longitude/latitude, read from the finest tile.
 *
 * The card asks this once per click, so it fetches the zoom-12 tile itself —
 * one small PNG, usually already in the HTTP cache from the drawing — and keeps
 * the last few decoded in memory.
 */
export function createCoveragePointReader(meta, { fetchImpl = (url) => fetch(url), cacheSize = 12 } = {}) {
  const cache = new Map();
  return async function coverageAt(lon, lat) {
    const tile = coverageTileAt(lon, lat, meta.maxZoom);
    if (!tile) return { inside: false };
    if (!coverageTileExists(meta, tile.z, tile.x, tile.y)) return { inside: false };
    const key = `${tile.z}/${tile.x}/${tile.y}`;
    let rgba = cache.get(key);
    if (!rgba) {
      const response = await fetchImpl(coverageTileUrl(meta.edition, tile.z, tile.x, tile.y, meta.builtAt));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bitmap = await createImageBitmap(await response.blob(), {
        colorSpaceConversion: 'none',
        premultiplyAlpha: 'none',
      });
      rgba = decodeToCanvas(bitmap).image.data;
      cache.set(key, rgba);
      if (cache.size > cacheSize) cache.delete(cache.keys().next().value);
    }
    const code = coverageCodeAt(rgba, tile.px, tile.py);
    return code === null ? { inside: false } : { inside: true, code };
  };
}
