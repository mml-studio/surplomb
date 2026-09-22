/**
 * @module data/mobileCoverageImagery
 *
 * The ARCEP coverage pyramid as a Cesium imagery layer: fetch a coded tile,
 * repaint it in the colours of the current mode, hand Cesium the pixels.
 *
 * ── WHY THE TILES ARE CODES AND THE COLOURS ARE HERE ────────────────────────
 * Five views of the same pixels — the four operators and the count of them —
 * would be five pyramids on the server if the colour were baked in. One byte
 * per pixel holds all five (see `mobileCoverage.js`), and repainting 65 536
 * pixels through a 256-entry lookup table costs well under a millisecond, so
 * switching mode repaints codes the page already holds rather than
 * downloading another pyramid.
 *
 * The decode has to be BIT-EXACT: a code of 0xAA read as 0xAB is a different
 * operator at a different level. The tiles carry no gAMA / iCCP / sRGB chunk
 * (asserted in `coverageTiler.test.mjs`), the image is decoded with
 * `colorSpaceConversion: 'none'`, and alpha is 0 or 255 and nothing else.
 *
 * ── OFF THE MAIN THREAD ─────────────────────────────────────────────────────
 * Download, decode and repaint happen in `mobileCoverage.worker.js`, through
 * one page-wide source (`mobileCoverageTiles.js`) that keeps the decoded codes:
 * Cesium receives an `ImageData`, whose straight alpha it uploads as is. The
 * requests still go through Cesium's `RequestScheduler`, so a tile the view
 * has left is dropped in the queue exactly as a stock provider's would be.
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

import { isPhoneShell } from '../inputMode.js';
import {
  COVERAGE_HATCH,
  COVERAGE_TILE_PX,
  coverageTileAt,
  coverageTileExists,
  coverageTileUrl,
} from './mobileCoverage.js';
import { createCoverageTileSource } from './mobileCoverageTiles.js';

/**
 * Decoded tiles the page keeps. A Mont-Blanc view at 22 km asks for ~60; the
 * rest is what a pan and a chip press come back to. 72 KB a tile at most, so
 * ~14 MB on a desktop and half that on a phone.
 */
const DESKTOP_TILES_KEPT = 192;
const PHONE_TILES_KEPT = 96;

let _tiles = null;

/** The page's one tile source, created on first use. */
export function coverageTileSource() {
  if (!_tiles) {
    _tiles = createCoverageTileSource({ capacity: isPhoneShell() ? PHONE_TILES_KEPT : DESKTOP_TILES_KEPT });
  }
  return _tiles;
}

let _emptyImage = null;

function emptyImage() {
  if (!_emptyImage) _emptyImage = new ImageData(1, 1);
  return _emptyImage;
}

function toImageData(buffer) {
  return buffer ? new ImageData(new Uint8ClampedArray(buffer), COVERAGE_TILE_PX, COVERAGE_TILE_PX) : emptyImage();
}

/** Absolute, so `RequestScheduler` files it under this server. */
function absoluteUrl(url) {
  try {
    return new URL(url, globalThis.location?.href).href;
  } catch {
    return url;
  }
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
 * An imagery provider over the pyramid, painting through `lut`.
 *
 * A `UrlTemplateImageryProvider` for the tiling scheme, the rectangle and the
 * level range — and its `requestImage` replaced, because the stock one hands
 * Cesium the PNG as decoded, which here would be a grey picture of codes.
 * Tiles the meta's index says were never written (sea, abroad) answer a
 * 1-pixel transparent image without a request.
 *
 * @param {object} meta The pyramid's meta.json
 * @param {Uint32Array} lut
 * @param {{credit?: string, drape?: boolean, hatchLut?: ?Uint32Array, tiles?: object}} [options]
 *   `drape`: for a tileset's `imageryLayers`, one level past the pyramid — see
 *   the header. `hatchLut`: the colours of the pixels on a stripe of
 *   `COVERAGE_HATCH` — that table differs from `lut` on rung 0 only, which is
 *   how the hatching lands on that rung and nowhere else.
 */
export function createCoverageImageryProvider(meta, lut, {
  credit, drape = false, hatchLut = null, tiles = coverageTileSource(),
} = {}) {
  const hatch = hatchLut ? { lut: hatchLut, period: COVERAGE_HATCH.period, width: COVERAGE_HATCH.width } : null;
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
  // Tiles asked for and not yet answered: how the layer owner knows a layer
  // loading out of sight has caught up (see `anfrFrance.js`, the mode swap).
  let pending = 0;
  const track = (promise) => {
    pending += 1;
    return promise.finally(() => { pending -= 1; });
  };
  provider.coveragePending = () => pending;
  provider.requestImage = (x, y, level, request) => {
    const source = coverageOverzoomSource(level, x, y, meta.maxZoom);
    if (!coverageTileExists(meta, source.z, source.x, source.y)) return Promise.resolve(emptyImage());
    const url = absoluteUrl(coverageTileUrl(meta.edition, source.z, source.x, source.y, meta.builtAt));
    const crop = source.z === level ? null : source;
    if (!request) return track(tiles.paint(url, lut, crop, hatch).promise.then(toImageData));
    let job = null;
    request.url = url;
    request.requestFunction = () => {
      job = tiles.paint(url, lut, crop, hatch);
      return job.promise;
    };
    request.cancelFunction = () => job?.cancel();
    // `undefined` is Cesium's "throttled, ask again next frame".
    const issued = Cesium.RequestScheduler.request(request);
    return issued ? track(issued.then(toImageData)) : undefined;
  };
  return provider;
}

/**
 * The code under one longitude/latitude, read from the finest tile.
 *
 * Read from the page's tile source, so a click on ground already drawn at
 * zoom 12 answers from memory, and otherwise costs one small PNG.
 */
export function createCoveragePointReader(meta, { tiles = coverageTileSource() } = {}) {
  return async function coverageAt(lon, lat) {
    const tile = coverageTileAt(lon, lat, meta.maxZoom);
    if (!tile) return { inside: false };
    if (!coverageTileExists(meta, tile.z, tile.x, tile.y)) return { inside: false };
    const url = absoluteUrl(coverageTileUrl(meta.edition, tile.z, tile.x, tile.y, meta.builtAt));
    const code = await tiles.read(url, tile.px, tile.py);
    return code === null ? { inside: false } : { inside: true, code };
  };
}
