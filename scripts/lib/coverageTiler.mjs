/**
 * The tiling half of `scripts/build-mobile-coverage.mjs`: four operator
 * rasters and a land mask in, a Web-Mercator pyramid of grey+alpha PNG tiles
 * and an area histogram out.
 *
 * The encoding it writes is defined in `src/data/mobileCoverage.js`, which the
 * browser decodes with; this file only implements it. Everything that can be
 * tested without GDAL or a disk — packing, the per-operator mode, the pixel
 * area, the tile index — is a pure function exported for
 * `coverageTiler.test.mjs`.
 *
 * ── STREAMING, BECAUSE THE RASTER DOES NOT FIT ──────────────────────────────
 * Metropolitan France at zoom 12 is 44 032 × 42 240 pixels — 1.86 Gpx per
 * operator, 9.3 GB for the five inputs. So the pyramid is built one tile row
 * (256 pixel rows) at a time: each zoom-12 strip is packed, written, and
 * halved into its parent's strip, which is flushed and halved in turn once both
 * of its halves have arrived. The whole pyramid holds about 67 MB at any time.
 *
 * For that cascade to be exact every strip has to land on a tile boundary at
 * every zoom, so the extent is widened — virtually, never on disk — to the
 * tile grid of the COARSEST zoom. The widened margin is empty and costs one
 * `fill(0)` per strip.
 *
 * @module scripts/lib/coverageTiler
 */

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

import { COVERAGE_OPERATORS, COVERAGE_TILE_PX } from '../../src/data/mobileCoverage.js';

const TILE = COVERAGE_TILE_PX;
/** Web Mercator's sphere, the one tile pixels are measured on. */
const MERCATOR_RADIUS_M = 6378137;

/**
 * Pack four operator strips and the land mask into codes and alpha.
 *
 * Each input is one byte per pixel, the operator's level 0–3 as burnt by
 * `gdal_rasterize`; the mask is 0 or 1. A pixel off the mask gets code 0 and
 * alpha 0 whatever the operators say — coverage spilling past the coast is not
 * a claim about land.
 */
export function packCoverageStrip(ops, mask, length, code, alpha, offset = 0) {
  const [a, b, c, d] = ops;
  const [sa, sb, sc, sd] = COVERAGE_OPERATORS.map((op) => op.shift);
  let land = 0;
  for (let i = 0; i < length; i++) {
    if (mask[i]) {
      code[offset + i] = ((a[i] & 3) << sa) | ((b[i] & 3) << sb) | ((c[i] & 3) << sc) | ((d[i] & 3) << sd);
      alpha[offset + i] = 255;
      land += 1;
    } else {
      code[offset + i] = 0;
      alpha[offset + i] = 0;
    }
  }
  return land;
}

/**
 * The per-operator MODE of up to four children, over the land ones only.
 *
 * Each operator is decided on its own two bits, so every operator's map is the
 * true majority of its own ground at every zoom — a mode over whole codes
 * would let the other three operators decide which level Orange shows. Ties go
 * to the LOWER level, so a coarse pixel never claims more coverage than half
 * its ground has.
 *
 * @returns {number} The coarse code.
 */
export function modeCode(c0, c1, c2, c3, v0, v1, v2, v3) {
  let out = 0;
  for (const { shift } of COVERAGE_OPERATORS) {
    let n0 = 0; let n1 = 0; let n2 = 0; let n3 = 0;
    const tally = (valid, codeValue) => {
      if (!valid) return;
      switch ((codeValue >> shift) & 3) {
        case 0: n0 += 1; break;
        case 1: n1 += 1; break;
        case 2: n2 += 1; break;
        default: n3 += 1;
      }
    };
    tally(v0, c0); tally(v1, c1); tally(v2, c2); tally(v3, c3);
    let level = 0; let best = n0;
    if (n1 > best) { level = 1; best = n1; }
    if (n2 > best) { level = 2; best = n2; }
    if (n3 > best) { level = 3; }
    out |= level << shift;
  }
  return out;
}

/**
 * Halve a strip into its parent: `srcRows` rows of `srcWidth` become
 * `srcRows / 2` rows of `srcWidth / 2`, written from `dstRow` on.
 *
 * A coarse pixel is land when at least TWO of its four children are: one would
 * grow every coastline outward by a pixel at each zoom, three would erode it.
 */
export function halveCoverageStrip(src, dst, { srcWidth, srcRows, dstRow = 0 }) {
  const dstWidth = srcWidth >> 1;
  const { code: sc, alpha: sa } = src;
  const { code: dc, alpha: da } = dst;
  for (let y = 0; y < srcRows >> 1; y++) {
    const top = (2 * y) * srcWidth;
    const bottom = top + srcWidth;
    const outRow = (dstRow + y) * dstWidth;
    for (let x = 0; x < dstWidth; x++) {
      const i0 = top + 2 * x; const i1 = i0 + 1;
      const i2 = bottom + 2 * x; const i3 = i2 + 1;
      const v0 = sa[i0] !== 0; const v1 = sa[i1] !== 0; const v2 = sa[i2] !== 0; const v3 = sa[i3] !== 0;
      const valid = v0 + v1 + v2 + v3;
      const o = outRow + x;
      if (valid < 2) { dc[o] = 0; da[o] = 0; continue; }
      da[o] = 255;
      const c0 = sc[i0];
      // The common case by far: four land children with one code.
      if (valid === 4 && c0 === sc[i1] && c0 === sc[i2] && c0 === sc[i3]) { dc[o] = c0; continue; }
      dc[o] = modeCode(c0, sc[i1], sc[i2], sc[i3], v0, v1, v2, v3);
    }
  }
}

/** Ground area of one pixel at zoom `z` and latitude `latDeg`, in km². */
export function mercatorPixelAreaKm2(z, latDeg) {
  const size = (2 * Math.PI * MERCATOR_RADIUS_M) / (TILE * 2 ** z);
  const ground = size * Math.cos((latDeg * Math.PI) / 180);
  return (ground * ground) / 1e6;
}

/** Latitude of the CENTRE of global pixel row `row` at zoom `z`. */
export function mercatorPixelRowLatitude(z, row) {
  const n = TILE * 2 ** z;
  const y = (row + 0.5) / n;
  return (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
}

/**
 * Add one strip's land pixels to a 256-bin area histogram, keyed on the code.
 * Everything the legend says in km² or % is derived from this histogram with
 * the same decoders the browser uses, so the numbers cannot drift apart.
 */
export function accumulateCoverageArea(histogram, strip, { width, rows, z, globalRow, colStart = 0, colEnd = width }) {
  const { code, alpha } = strip;
  for (let y = 0; y < rows; y++) {
    const area = mercatorPixelAreaKm2(z, mercatorPixelRowLatitude(z, globalRow + y));
    const base = y * width;
    for (let x = colStart; x < colEnd; x++) {
      const i = base + x;
      if (alpha[i]) histogram[code[i]] += area;
    }
  }
}

/** Copy one 256 × 256 tile out of a strip as interleaved grey+alpha, or null if it has no land. */
export function extractCoverageTile(strip, width, tileCol) {
  const { code, alpha } = strip;
  const out = Buffer.allocUnsafe(TILE * TILE * 2);
  let land = false;
  const x0 = tileCol * TILE;
  for (let y = 0; y < TILE; y++) {
    const row = y * width + x0;
    const o = y * TILE * 2;
    for (let x = 0; x < TILE; x++) {
      const a = alpha[row + x];
      if (a) land = true;
      out[o + 2 * x] = a ? code[row + x] : 0;
      out[o + 2 * x + 1] = a;
    }
  }
  return land ? out : null;
}

/** Encode an interleaved grey+alpha tile as a PNG of colour type 4, no colour chunks. */
export function encodeCoverageTilePng(raw) {
  return sharp(raw, { raw: { width: TILE, height: TILE, channels: 2 } })
    .toColourspace('b-w')
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * The tiles written at one zoom, as a bounding range plus a bitset.
 * @param {Set<string>|Array<[number, number]>} written `[x, y]` pairs
 */
export function buildTileIndex(written) {
  const pairs = [...written];
  if (!pairs.length) return null;
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const [x, y] of pairs) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  const cols = x1 - x0 + 1;
  const rows = y1 - y0 + 1;
  const bytes = new Uint8Array(Math.ceil((cols * rows) / 8));
  for (const [x, y] of pairs) {
    const bit = (y - y0) * cols + (x - x0);
    bytes[bit >> 3] |= 1 << (bit & 7);
  }
  return { x0, y0, cols, rows, count: pairs.length, bits: Buffer.from(bytes).toString('base64') };
}

/**
 * Build the whole pyramid.
 *
 * @param {object} options
 * @param {(rowStart:number, rows:number) => {ops:Uint8Array[], mask:Uint8Array}} options.readRows
 *   Rows of the maxZoom rasters, `dataCols` wide, starting at `rowStart`.
 * @param {number} options.dataCols
 * @param {number} options.dataRows
 * @param {number} options.originTileX  maxZoom tile column of raster column 0
 * @param {number} options.originTileY  maxZoom tile row of raster row 0
 * @param {number} options.maxZoom
 * @param {number} options.minZoom
 * @param {string} options.outDir
 * @param {(event:object) => void} [options.onProgress]
 * @returns {Promise<{tiles:object, histogram:number[], bytes:number, files:number}>}
 */
export async function buildCoveragePyramid({
  readRows, dataCols, dataRows, originTileX, originTileY, maxZoom, minZoom, outDir, onProgress = () => {},
}) {
  if (dataCols % TILE || dataRows % TILE) throw new Error('raster must be a whole number of tiles');
  const align = 2 ** (maxZoom - minZoom);
  const vx0 = Math.floor(originTileX / align) * align;
  const vy0 = Math.floor(originTileY / align) * align;
  const vx1 = Math.ceil((originTileX + dataCols / TILE) / align) * align;
  const vy1 = Math.ceil((originTileY + dataRows / TILE) / align) * align;
  const levels = new Map();
  for (let z = maxZoom; z >= minZoom; z--) {
    const shrink = 2 ** (maxZoom - z);
    const width = ((vx1 - vx0) / shrink) * TILE;
    levels.set(z, {
      z,
      tileX0: vx0 / shrink,
      tileY0: vy0 / shrink,
      width,
      strip: { code: new Uint8Array(width * TILE), alpha: new Uint8Array(width * TILE) },
      land: false,
      written: [],
    });
  }
  const histogram = new Float64Array(256);
  let bytes = 0;
  let files = 0;
  const dataColOffset = (originTileX - vx0) * TILE;

  async function flush(level, stripIndex) {
    const tileY = level.tileY0 + stripIndex;
    if (level.land) {
      const jobs = [];
      for (let col = 0; col < level.width / TILE; col++) {
        const raw = extractCoverageTile(level.strip, level.width, col);
        if (!raw) continue;
        const tileX = level.tileX0 + col;
        level.written.push([tileX, tileY]);
        jobs.push(encodeCoverageTilePng(raw).then(async (png) => {
          const dir = path.join(outDir, String(level.z), String(tileX));
          await fs.promises.mkdir(dir, { recursive: true });
          await fs.promises.writeFile(path.join(dir, `${tileY}.png`), png);
          bytes += png.length;
          files += 1;
        }));
      }
      await Promise.all(jobs);
    }
    const parent = levels.get(level.z - 1);
    if (parent) {
      const half = stripIndex & 1;
      if (level.land) {
        halveCoverageStrip(level.strip, parent.strip, { srcWidth: level.width, srcRows: TILE, dstRow: half * (TILE / 2) });
        parent.land = true;
      }
      if (half === 1) {
        await flush(parent, stripIndex >> 1);
        parent.strip.code.fill(0);
        parent.strip.alpha.fill(0);
        parent.land = false;
      }
    }
  }

  const top = levels.get(maxZoom);
  const strips = vy1 - vy0;
  for (let s = 0; s < strips; s++) {
    top.strip.code.fill(0);
    top.strip.alpha.fill(0);
    top.land = false;
    const tileRow = vy0 + s;
    const rowStart = (tileRow - originTileY) * TILE;
    if (rowStart >= 0 && rowStart < dataRows) {
      const { ops, mask } = readRows(rowStart, TILE);
      let land = 0;
      for (let y = 0; y < TILE; y++) {
        const from = y * dataCols;
        land += packCoverageStrip(
          ops.map((op) => op.subarray(from, from + dataCols)),
          mask.subarray(from, from + dataCols),
          dataCols,
          top.strip.code,
          top.strip.alpha,
          y * top.width + dataColOffset,
        );
      }
      if (land) {
        top.land = true;
        accumulateCoverageArea(histogram, top.strip, {
          width: top.width, rows: TILE, z: maxZoom, globalRow: tileRow * TILE,
          colStart: dataColOffset, colEnd: dataColOffset + dataCols,
        });
      }
    }
    await flush(top, s);
    onProgress({ strip: s + 1, strips, files, bytes });
  }

  const tiles = {};
  for (const [z, level] of levels) {
    const index = buildTileIndex(level.written);
    if (index) tiles[z] = index;
  }
  return { tiles, histogram: [...histogram], bytes, files };
}
