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
 * ── ON THE GLOBE AND ON GOOGLE'S MESH ───────────────────────────────────────
 * The photorealistic stack hides the globe, and `viewer.imageryLayers` with
 * it, so the layer owner adds a SECOND layer over the same pyramid to the
 * tileset's own `imageryLayers` (Cesium ≥ 1.131, marked experimental). Only
 * the surface on screen is traversed, so the hidden one requests nothing.
 *
 * Two things differ on the mesh. Cesium clamps a draped layer's level to
 * `[minimumLevel, maximumLevel)` — the globe's range is inclusive — so the
 * draped provider declares one level more than the pyramid holds, and
 * `requestImage` answers any level past the finest by magnifying a quarter of
 * its ancestor. Without it the mesh would show zoom 11, whose pixels are the
 * MODE of four, and could contradict the card, which reads zoom 12.
 *
 * And the colour climbs façades (CARTOGRAPHY F4): the drape is vertical, so a
 * wall wears the pixel at its foot. Accepted here because the ink is where the
 * network is missing, and that is almost never where the buildings are: in
 * `gaps` mode a town with the four operators is not painted at all.
 */

import * as Cesium from 'cesium';

import {
  COVERAGE_HATCH,
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
 *
 * With `hatchLut`, the pixels on a stripe of `COVERAGE_HATCH` are painted
 * through it instead — that table differs from `lut` on rung 0 only, which is
 * how the hatching lands on that rung and nowhere else.
 * @param {Uint8ClampedArray|Uint8Array} rgba
 * @param {Uint32Array} lut 256 packed RGBA values, little-endian (`ImageData` order)
 * @param {?Uint32Array} [hatchLut] Same shape, for the stripe pixels.
 */
export function paintCoverageRgba(rgba, lut, hatchLut = null) {
  const out = new Uint32Array(rgba.buffer, rgba.byteOffset, rgba.byteLength >> 2);
  const { period, width } = COVERAGE_HATCH;
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    if (!rgba[p + 3]) {
      out[i] = 0;
      continue;
    }
    const code = rgba[p];
    const x = i % COVERAGE_TILE_PX;
    const y = (i - x) / COVERAGE_TILE_PX;
    out[i] = hatchLut && (x + y) % period < width ? hatchLut[code] : lut[code];
  }
}

/** The code and land flag of one pixel of decoded RGBA, or null off land. */
export function coverageCodeAt(rgba, px, py) {
  const p = (py * COVERAGE_TILE_PX + px) * 4;
  if (!rgba[p + 3]) return null;
  return rgba[p];
}

/**
 * Where a tile past the pyramid's finest zoom is read from: the ancestor at
 * `maxZoom`, and the square of it, in pixels, that the tile magnifies.
 * @returns {{z:number, x:number, y:number, sx:number, sy:number, size:number}}
 */
export function coverageOverzoomSource(level, x, y, maxZoom) {
  const over = Math.max(0, level - maxZoom);
  const ax = x >> over;
  const ay = y >> over;
  const size = COVERAGE_TILE_PX >> over;
  return { z: level - over, x: ax, y: ay, sx: (x - (ax << over)) * size, sy: (y - (ay << over)) * size, size };
}

/**
 * Draw a decoded tile — or, past the pyramid, the square of its ancestor that
 * a tile magnifies — onto a fresh canvas, and read its codes back.
 *
 * The CODES are magnified, before any colour exists, so the painting that
 * follows runs at the output's own pixel size: the hatching keeps one stripe
 * width at every level instead of doubling with each level of magnification.
 * Nearest neighbour, because a smoothed edge would invent codes between two
 * pixels — and with them operators and levels nobody published.
 */
function decodeToCanvas(image, crop = null) {
  const canvas = document.createElement('canvas');
  canvas.width = COVERAGE_TILE_PX;
  canvas.height = COVERAGE_TILE_PX;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (crop) {
    context.imageSmoothingEnabled = false;
    context.drawImage(image, crop.sx, crop.sy, crop.size, crop.size, 0, 0, COVERAGE_TILE_PX, COVERAGE_TILE_PX);
  } else {
    context.drawImage(image, 0, 0);
  }
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
 * @param {{credit?: string, drape?: boolean, hatchLut?: Uint32Array}} [options]
 *   `drape`: for a tileset's `imageryLayers`, one level past the pyramid — see
 *   the header. `hatchLut`: the stripe colours, see `paintCoverageRgba`.
 */
export function createCoverageImageryProvider(meta, lut, { credit, drape = false, hatchLut = null } = {}) {
  const [west, south, east, north] = meta.bounds || [-5.5, 41.2, 9.8, 51.2];
  const provider = new Cesium.UrlTemplateImageryProvider({
    url: coverageTileUrl(meta.edition, '{z}', '{x}', '{y}').replace(/%7B/g, '{').replace(/%7D/g, '}'),
    enablePickFeatures: false,
    tilingScheme: new Cesium.WebMercatorTilingScheme(),
    rectangle: Cesium.Rectangle.fromDegrees(west, south, east, north),
    minimumLevel: meta.minZoom,
    maximumLevel: meta.maxZoom + (drape ? 1 : 0),
    tileWidth: COVERAGE_TILE_PX,
    tileHeight: COVERAGE_TILE_PX,
    hasAlphaChannel: true,
    credit,
  });
  provider.requestImage = (x, y, level, request) => {
    const source = coverageOverzoomSource(level, x, y, meta.maxZoom);
    if (!coverageTileExists(meta, source.z, source.x, source.y)) return Promise.resolve(emptyCanvas());
    const resource = new Cesium.Resource({ url: coverageTileUrl(meta.edition, source.z, source.x, source.y, meta.builtAt), request });
    const pending = resource.fetchImage({ preferImageBitmap: true, skipColorSpaceConversion: true, flipY: false });
    // `undefined` is Cesium's "throttled, ask again next frame".
    if (!pending) return undefined;
    return pending.then((bitmap) => {
      const { canvas, context, image } = decodeToCanvas(bitmap, source.z === level ? null : source);
      paintCoverageRgba(image.data, lut, hatchLut);
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
