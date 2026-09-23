/**
 * @module data/mastViewshedPaint
 *
 * The selected mast's line of sight, from DEM tiles to painted pixels, with no
 * DOM and no Cesium — so the same code runs in `mastViewshed.worker.js` and,
 * where a browser cannot host that worker, on the main thread
 * (`mastViewshedImagery.js`). The DEM tile loader is injected: it is the one
 * step that needs a canvas, and each thread has its own.
 *
 * ── THE COLOUR: TWO BLUES, THE RELIEF AND A RIM ─────────────────────────────
 * The lit ground belongs to the selected mast and to nothing else. It is not a
 * class of any key: it appears with a selection and goes with it.
 *
 * It used to be one flat cyan at 36 %, and on the dimmed ground of Dusk it read
 * as a sheet of plastic laid over the map — the operator found it both too
 * loud and not visible enough. The approved mock of 2026-09-23 paints it as
 * LIGHT: a blue that is deep where the ground is flat and far, pale where a
 * slope faces the sun and at the mast's own foot, and a bright rim where the
 * lit ground meets the ground the mast does not see. So each cell is shaded
 * three ways, all from data the computation already holds:
 *
 *   - the RELIEF: a hillshade of the same DEM the line of sight was computed
 *     on (sun in the north-west, 45° up, the cartographer's convention), so
 *     the valleys and ridges that decide what is seen are visible inside it;
 *   - the DISTANCE: brighter and more opaque close to the mast;
 *   - the RIM: a visible cell within {@link VIEWSHED_RIM_CELLS} of a hidden one
 *     is drawn nearly white and nearly opaque. The edge of the horizon circle
 *     (outside the window, not hidden) gets no rim: it is the computation's
 *     reach, not something the relief did.
 *
 * Under Dusk's bloom (`styles/dusk.js`) the rim and the pale slopes glow.
 *
 * ── ONE TILE, RE-ROWED FROM MERCATOR TO LATITUDE ────────────────────────────
 * `SingleTileImageryProvider` stretches its image linearly in LATITUDE; the
 * DEM grid is linear in Mercator. Over 80 km the difference is a pixel or two,
 * but it costs one lookup per row to remove, so each output row is read from
 * the Mercator row that holds its latitude.
 */

import {
  VIEWSHED_DEM_TILE_PX,
  VIEWSHED_DEM_URL,
  VIEWSHED_MAX_RADIUS_M,
  VIEWSHED_HIDDEN,
  VIEWSHED_VISIBLE,
  computeViewshed,
  radioHorizonM,
  terrariumHeight,
  viewshedArea,
  viewshedWindow,
  viewshedWindowBounds,
} from './mastViewshed.js';

/** The key's swatch and the card's dot: the blue the lit ground reads as. */
export const VIEWSHED_COLOR = '#3ab4ff';
/** Flat, far ground. */
const VIEWSHED_DEEP = Object.freeze([26, 128, 245]);
/** A slope facing the sun, and the ground at the mast's foot. */
const VIEWSHED_PALE = Object.freeze([150, 226, 255]);
/** The edge against ground the mast does not see. */
const VIEWSHED_RIM = Object.freeze([210, 246, 255]);
const VIEWSHED_RIM_ALPHA = 0.9;
/** How far from a hidden cell a visible one still counts as the rim. */
export const VIEWSHED_RIM_CELLS = 2;
/** Opacity of flat ground at the horizon, and what the mast's foot adds to it. */
const VIEWSHED_ALPHA_FAR = 0.4;
const VIEWSHED_ALPHA_NEAR_GAIN = 0.24;
/** Vertical exaggeration of the hillshade: 50 m cells over gentle hills read flat at 1. */
const RELIEF_EXAGGERATION = 3;
/** Lambert term of flat ground under a 45° sun. */
const FLAT_LIGHT = Math.SQRT1_2;

/** Decode one terrarium tile's RGBA into heights. Pure, for the tests. */
export function terrariumToHeights(rgba, out = new Float32Array(rgba.length >> 2)) {
  for (let i = 0, p = 0; i < out.length; i++, p += 4) out[i] = terrariumHeight(rgba[p], rgba[p + 1], rgba[p + 2]);
  return out;
}

/** The URL of one DEM tile of a window. */
export function viewshedDemTileUrl({ z, x, y }) {
  return VIEWSHED_DEM_URL.replace('{z}', z).replace('{x}', x).replace('{y}', y);
}

/**
 * A hillshade of the height grid, one byte per cell, 128 for flat ground.
 * Sun in the north-west, 45° up. Rows run south, columns east. Pure.
 */
export function viewshedRelief(heights, size, pixelM) {
  const out = new Uint8Array(size * size).fill(128);
  // Sun direction in (east, north, up): azimuth 315°, altitude 45°.
  const sunE = -0.5;
  const sunN = 0.5;
  const sunU = FLAT_LIGHT;
  const k = RELIEF_EXAGGERATION / (2 * pixelM);
  for (let row = 1; row < size - 1; row++) {
    for (let col = 1; col < size - 1; col++) {
      const i = row * size + col;
      const dzE = (heights[i + 1] - heights[i - 1]) * k;
      const dzN = (heights[i - size] - heights[i + size]) * k;
      const light = (-dzE * sunE - dzN * sunN + sunU) / Math.sqrt(dzE * dzE + dzN * dzN + 1);
      out[i] = Math.max(0, Math.min(255, Math.round(128 + (light - FLAT_LIGHT) * 320)));
    }
  }
  return out;
}

/**
 * How many cells a visible cell sits from the nearest hidden one, along the
 * rows and columns, up to the rim's reach — 0 when it is further than that.
 */
function rimStep(grid, size, col, row) {
  for (let step = 1; step <= VIEWSHED_RIM_CELLS; step++) {
    if (col - step >= 0 && grid[row * size + col - step] === VIEWSHED_HIDDEN) return step;
    if (col + step < size && grid[row * size + col + step] === VIEWSHED_HIDDEN) return step;
    if (row - step >= 0 && grid[(row - step) * size + col] === VIEWSHED_HIDDEN) return step;
    if (row + step < size && grid[(row + step) * size + col] === VIEWSHED_HIDDEN) return step;
  }
  return 0;
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
 * The visible cells as RGBA, rows re-sampled from Mercator to latitude so the
 * single tile lands where the cells are. Pure: returns the bytes and the size.
 * A result with no `relief` is shaded as flat ground.
 */
export function viewshedRgba(result) {
  const { window, grid, relief = null } = result;
  const { size, y0, z } = window;
  const observerCol = window.observerCol ?? (size >> 1);
  const observerRow = window.observerRow ?? (size >> 1);
  const radiusPx = Math.max(1, window.radiusPx ?? (size >> 1));
  const [, south, , north] = viewshedWindowBounds(window);
  const worldPx = VIEWSHED_DEM_TILE_PX * 2 ** z;
  const rgba = new Uint8ClampedArray(size * size * 4);
  const rimAlpha = Math.round(VIEWSHED_RIM_ALPHA * 255);
  for (let row = 0; row < size; row++) {
    const lat = north - ((row + 0.5) * (north - south)) / size;
    const rad = (lat * Math.PI) / 180;
    const py = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * worldPx;
    const sourceRow = Math.min(size - 1, Math.max(0, Math.floor(py - y0)));
    for (let col = 0; col < size; col++) {
      const cell = sourceRow * size + col;
      if (grid[cell] !== VIEWSHED_VISIBLE) continue;
      const p = (row * size + col) * 4;
      const step = rimStep(grid, size, col, sourceRow);
      if (step) {
        // The outermost cell carries the rim; the next one fades it into the
        // fill, so the edge reads as light and not as a stair of white cells.
        const w = 1 - (step - 1) / VIEWSHED_RIM_CELLS;
        rgba[p] = VIEWSHED_PALE[0] + (VIEWSHED_RIM[0] - VIEWSHED_PALE[0]) * w;
        rgba[p + 1] = VIEWSHED_PALE[1] + (VIEWSHED_RIM[1] - VIEWSHED_PALE[1]) * w;
        rgba[p + 2] = VIEWSHED_PALE[2] + (VIEWSHED_RIM[2] - VIEWSHED_PALE[2]) * w;
        rgba[p + 3] = rimAlpha * (0.6 + 0.4 * w);
        continue;
      }
      const shade = relief ? relief[cell] / 255 - 0.5 : 0;
      const dx = col - observerCol;
      const dy = sourceRow - observerRow;
      const near = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) / radiusPx);
      const t = Math.max(0, Math.min(1, 0.18 + 0.9 * shade + 0.4 * near * near));
      rgba[p] = VIEWSHED_DEEP[0] + (VIEWSHED_PALE[0] - VIEWSHED_DEEP[0]) * t;
      rgba[p + 1] = VIEWSHED_DEEP[1] + (VIEWSHED_PALE[1] - VIEWSHED_DEEP[1]) * t;
      rgba[p + 2] = VIEWSHED_DEEP[2] + (VIEWSHED_PALE[2] - VIEWSHED_DEEP[2]) * t;
      rgba[p + 3] = 255 * Math.min(0.85, VIEWSHED_ALPHA_FAR + VIEWSHED_ALPHA_NEAR_GAIN * near + 0.3 * Math.max(0, shade));
    }
  }
  return { rgba, size };
}

/**
 * Line of sight from the top of a mast, out to its radio horizon, painted.
 *
 * Returns what the page needs and nothing heavier: the window (for its
 * bounds), the figures the card says, and the painted RGBA. The height grid,
 * the visibility grid and the hillshade stay where they were computed — 15 MB
 * for a window 1 601 cells wide — instead of crossing to the main thread.
 *
 * @param {object} input
 * @param {number} input.lon
 * @param {number} input.lat
 * @param {number} input.antennaM
 * @param {(tile: {z:number, x:number, y:number}) => Promise<Float32Array>} input.loadDemTile
 *   One tile's heights, row-major, `VIEWSHED_DEM_TILE_PX` square.
 */
export async function paintMastViewshed({ lon, lat, antennaM, loadDemTile }) {
  const horizonM = radioHorizonM(antennaM);
  const radiusM = Math.min(horizonM, VIEWSHED_MAX_RADIUS_M);
  const window = viewshedWindow(lon, lat, radiusM);
  const tiles = await Promise.all(window.tiles.map(async (tile) => ({ tile, heights: await loadDemTile(tile) })));
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
  const relief = viewshedRelief(heights, window.size, window.pixelM);
  const { rgba, size } = viewshedRgba({ window, grid, relief });
  return {
    window,
    radiusM,
    horizonM,
    capped: horizonM > VIEWSHED_MAX_RADIUS_M,
    groundM: heights[window.observerRow * window.size + window.observerCol],
    area: viewshedArea(grid, window.pixelM),
    rgba,
    size,
  };
}
