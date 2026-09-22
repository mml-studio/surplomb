/**
 * @module data/mobileCoverageTile
 *
 * One coverage tile as CODES, and the arithmetic that turns it into colours —
 * with no DOM, no Cesium and no i18n, because it runs in two places: the tile
 * worker (`mobileCoverage.worker.js`) and, where a browser cannot host that
 * worker, the main thread (`mobileCoverageTiles.js`).
 *
 * ── WHY THE CODES ARE KEPT ──────────────────────────────────────────────────
 * The pyramid stores one byte per pixel for all five views (see
 * `mobileCoverage.js`), so a decoded tile is worth keeping: a chip press, a
 * switch to Google 3D and a click on the ground all ask again for tiles the
 * session has already decoded, and a kept tile answers each of them with one
 * pass through a 256-entry table instead of a download and a PNG decode.
 *
 * A kept tile is its codes (64 KB) and its land mask as one bit per pixel
 * (8 KB) — or no mask at all when every pixel is land, which is most tiles
 * inland.
 */

/** Tile edge in pixels; equal to `COVERAGE_TILE_PX` (asserted in the tests). */
export const COVERAGE_TILE_EDGE = 256;
const PIXELS = COVERAGE_TILE_EDGE * COVERAGE_TILE_EDGE;

/**
 * Codes and land mask of one decoded tile.
 * @param {Uint8ClampedArray|Uint8Array} rgba Decoded pixels: the code in R, land in A.
 * @returns {{codes: Uint8Array, land: ?Uint8Array}} `land` is null when every pixel is land.
 */
export function decodeCoverageRgba(rgba) {
  const codes = new Uint8Array(PIXELS);
  const land = new Uint8Array(PIXELS >> 3);
  let sea = 0;
  for (let i = 0, p = 0; i < PIXELS; i++, p += 4) {
    codes[i] = rgba[p];
    if (rgba[p + 3]) land[i >> 3] |= 1 << (i & 7);
    else sea++;
  }
  return { codes, land: sea ? land : null };
}

/** The code of one pixel, or null off land. */
export function coverageTileCode(tile, px, py) {
  if (!tile || px < 0 || py < 0 || px >= COVERAGE_TILE_EDGE || py >= COVERAGE_TILE_EDGE) return null;
  const i = py * COVERAGE_TILE_EDGE + px;
  if (tile.land && !((tile.land[i >> 3] >> (i & 7)) & 1)) return null;
  return tile.codes[i];
}

/**
 * Paint a tile through a lookup table into `out`, one packed RGBA per pixel.
 *
 * `crop` magnifies a square of the tile to the whole output, nearest
 * neighbour — a smoothed edge would invent colours between two rungs. That is
 * how a level past the pyramid is drawn (see `coverageOverzoomSource`).
 *
 * With `hatch`, the output pixels on a stripe — `(x + y) % period < width`,
 * lower left to upper right — are painted through `hatch.lut` instead. That
 * table differs from `lut` on the no-coverage rung only (`coverageHatchLut`),
 * which is how the hatching lands there and nowhere else. The stripes are laid
 * on the OUTPUT, after the magnification, so they keep one width at every
 * level instead of doubling with each level past the pyramid.
 * @param {{codes: Uint8Array, land: ?Uint8Array}} tile
 * @param {Uint32Array} lut 256 packed colours, `ImageData` byte order.
 * @param {Uint32Array} out PIXELS entries.
 * @param {?{sx:number, sy:number, size:number}} [crop]
 * @param {?{lut: Uint32Array, period: number, width: number}} [hatch]
 */
export function paintCoverageTile(tile, lut, out, crop = null, hatch = null) {
  const { codes, land } = tile;
  const whole = !crop || crop.size >= COVERAGE_TILE_EDGE;
  if (whole && !hatch) {
    if (!land) {
      for (let i = 0; i < PIXELS; i++) out[i] = lut[codes[i]];
      return out;
    }
    for (let i = 0; i < PIXELS; i++) out[i] = (land[i >> 3] >> (i & 7)) & 1 ? lut[codes[i]] : 0;
    return out;
  }
  const sx = whole ? 0 : crop.sx;
  const sy = whole ? 0 : crop.sy;
  const shift = whole ? 0 : Math.log2(COVERAGE_TILE_EDGE / crop.size);
  const period = hatch?.period || 1;
  const width = hatch ? hatch.width : 0;
  for (let y = 0, o = 0; y < COVERAGE_TILE_EDGE; y++) {
    const row = (sy + (y >> shift)) * COVERAGE_TILE_EDGE + sx;
    for (let x = 0; x < COVERAGE_TILE_EDGE; x++, o++) {
      const i = row + (x >> shift);
      if (land && !((land[i >> 3] >> (i & 7)) & 1)) {
        out[o] = 0;
        continue;
      }
      out[o] = hatch && (x + y) % period < width ? hatch.lut[codes[i]] : lut[codes[i]];
    }
  }
  return out;
}

/**
 * Decoded tiles by URL, least recently used out first, and one decode per URL
 * however many callers ask for it at once (four zoom-13 children of one
 * zoom-12 tile, say).
 * @param {(url: string) => Promise<{codes: Uint8Array, land: ?Uint8Array}>} decode
 * @param {number} capacity Tiles kept.
 */
export function createCoverageTileStore(decode, capacity) {
  const tiles = new Map();
  const inflight = new Map();
  return {
    get size() { return tiles.size; },
    has: (url) => tiles.has(url),
    /** @returns {Promise<{codes: Uint8Array, land: ?Uint8Array}>} */
    tile(url) {
      const kept = tiles.get(url);
      if (kept) {
        tiles.delete(url);
        tiles.set(url, kept);
        return Promise.resolve(kept);
      }
      let pending = inflight.get(url);
      if (!pending) {
        pending = decode(url)
          .then((tile) => {
            tiles.set(url, tile);
            while (tiles.size > capacity) tiles.delete(tiles.keys().next().value);
            return tile;
          })
          .finally(() => inflight.delete(url));
        inflight.set(url, pending);
      }
      return pending;
    },
    clear() {
      tiles.clear();
    },
  };
}
