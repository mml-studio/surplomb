/**
 * @module data/mastViewshed
 *
 * **What one antenna can SEE of the relief** — the line of sight from the top
 * of a selected mast, over bare terrain, out to its radio horizon.
 *
 * ── WHAT THIS IS, AND THE ONE THING IT IS NOT ───────────────────────────────
 * It is geometry, computed from three measured things and one declared one:
 *   - the mast's position and height, from the ANFR register (`sup_nm_haut`,
 *     published for 99.24 % of the 72 700 supports);
 *   - the ground, from Mapterhorn's terrain tiles (CC BY 4.0, keyless, the
 *     same terrain this globe is already credited for);
 *   - the curvature of the Earth, with the standard 4/3 radius for radio
 *     refraction;
 *   - DECLARED: a handset held 1.5 m above the ground.
 *
 * It is NOT coverage. A cell's reach depends on its power, its frequency, its
 * tilt and its beamwidth — none of which ANFR publishes — and on buildings and
 * trees, which a bare-earth model does not have. So a lit slope says "the
 * antenna is in view from here", and the ARCEP coverage underneath says whether
 * the operators' own model expects a signal there. The card and the key say
 * both halves; neither is painted as the other.
 *
 * ── THE RADIUS IS THE RADIO HORIZON, NOT A CHOICE ───────────────────────────
 * Past the radio horizon — 4.12 × (√h_antenna + √h_handset) km on a smooth
 * Earth with k = 4/3 — no line of sight exists at all, whatever the terrain.
 * That distance follows from the mast's MEASURED height, so it is the honest
 * edge: 27.6 km for the national median mast (30 m). It is capped at 40 km
 * (a 76 m mast), because past that the DEM needed grows as the square of the
 * radius for masts that are almost all broadcast towers, and the cap is said
 * on the card whenever it bites.
 *
 * ── THE ALGORITHM ───────────────────────────────────────────────────────────
 * "R2" (Franklin & Ray): one ray from the antenna to every cell on the
 * perimeter of the square that holds the horizon disc, walked cell by cell
 * along its major axis, keeping the steepest angle of terrain met so far. A
 * cell is visible when a handset on it sits at or above that angle. Every cell
 * of the square is crossed by at least one ray, and the cost is
 * O(perimeter × radius) — about 1.2 M steps for a 30 m mast at 50 m cells.
 */

/** Height of the handset above the ground, in metres — DECLARED, and said. */
export const VIEWSHED_TARGET_HEIGHT_M = 1.5;
/** Mean Earth radius (IUGG), metres. */
export const EARTH_RADIUS_M = 6_371_008.8;
/** Standard atmosphere's effective-radius factor for VHF/UHF refraction. */
export const REFRACTION_K = 4 / 3;
/** The radius is never wider than this, and the card says when it is cut. */
export const VIEWSHED_MAX_RADIUS_M = 40_000;
/** Largest DEM grid side, in cells, before a coarser zoom is used. */
export const VIEWSHED_MAX_GRID_PX = 1_600;
/** Mapterhorn's terrarium tiles: 512 px, XYZ, CORS open. */
export const VIEWSHED_DEM_URL = 'https://tiles.mapterhorn.com/{z}/{x}/{y}.webp';
export const VIEWSHED_DEM_TILE_PX = 512;
/** Finest DEM zoom worth asking for: 13 m cells at 46° N is already finer than the question. */
export const VIEWSHED_DEM_MAX_ZOOM = 12;

/** Cell states in the result grid. */
export const VIEWSHED_HIDDEN = 0;
export const VIEWSHED_VISIBLE = 1;
export const VIEWSHED_OUTSIDE = 2;

/**
 * Radio horizon, in metres, between an antenna and a handset over a smooth
 * Earth of effective radius k·R.
 */
export function radioHorizonM(antennaM, handsetM = VIEWSHED_TARGET_HEIGHT_M, k = REFRACTION_K) {
  const r = k * EARTH_RADIUS_M;
  const a = Math.max(0, Number(antennaM) || 0);
  const b = Math.max(0, Number(handsetM) || 0);
  return Math.sqrt(2 * r * a) + Math.sqrt(2 * r * b);
}

/** Decode one terrarium pixel into metres. */
export function terrariumHeight(r, g, b) {
  return r * 256 + g + b / 256 - 32768;
}

/** Ground size of one pixel of a `tilePx` Web-Mercator tile at zoom `z` and latitude `lat`. */
export function mercatorGroundPixelM(z, latDeg, tilePx = VIEWSHED_DEM_TILE_PX) {
  return ((2 * Math.PI * 6378137) / (tilePx * 2 ** z)) * Math.cos((latDeg * Math.PI) / 180);
}

/**
 * The DEM window a viewshed needs: which zoom, which tiles, and where the
 * antenna falls inside the assembled grid.
 */
export function viewshedWindow(lon, lat, radiusM, { maxGridPx = VIEWSHED_MAX_GRID_PX, maxZoom = VIEWSHED_DEM_MAX_ZOOM } = {}) {
  let z = maxZoom;
  while (z > 0 && (2 * radiusM) / mercatorGroundPixelM(z, lat) > maxGridPx) z -= 1;
  const worldPx = VIEWSHED_DEM_TILE_PX * 2 ** z;
  const rad = (lat * Math.PI) / 180;
  const px = ((lon + 180) / 360) * worldPx;
  const py = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * worldPx;
  const pixelM = mercatorGroundPixelM(z, lat);
  const radiusPx = Math.ceil(radiusM / pixelM);
  const x0 = Math.floor(px) - radiusPx;
  const y0 = Math.floor(py) - radiusPx;
  const size = 2 * radiusPx + 1;
  const tileX0 = Math.floor(x0 / VIEWSHED_DEM_TILE_PX);
  const tileY0 = Math.floor(y0 / VIEWSHED_DEM_TILE_PX);
  const tileX1 = Math.floor((x0 + size - 1) / VIEWSHED_DEM_TILE_PX);
  const tileY1 = Math.floor((y0 + size - 1) / VIEWSHED_DEM_TILE_PX);
  const tiles = [];
  for (let ty = tileY0; ty <= tileY1; ty++) {
    for (let tx = tileX0; tx <= tileX1; tx++) tiles.push({ z, x: tx, y: ty });
  }
  return {
    z, pixelM, radiusPx, size, x0, y0, tiles,
    observerCol: Math.floor(px) - x0,
    observerRow: Math.floor(py) - y0,
  };
}

/** Lon/lat rectangle of a window's grid, `[west, south, east, north]` in degrees. */
export function viewshedWindowBounds(window) {
  const worldPx = VIEWSHED_DEM_TILE_PX * 2 ** window.z;
  const lon = (px) => (px / worldPx) * 360 - 180;
  const lat = (py) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * py) / worldPx))) * 180) / Math.PI;
  return [lon(window.x0), lat(window.y0 + window.size), lon(window.x0 + window.size), lat(window.y0)];
}

/**
 * Line of sight from one antenna over a height grid.
 *
 * @param {object} input
 * @param {Float32Array} input.heights  row-major, `size × size`, metres
 * @param {number} input.size
 * @param {number} input.observerCol
 * @param {number} input.observerRow
 * @param {number} input.antennaM   height of the antenna above ITS ground
 * @param {number} input.pixelM     ground size of one cell
 * @param {number} input.radiusPx   cells beyond this distance are OUTSIDE
 * @param {number} [input.targetM]  handset height above ground
 * @returns {Uint8Array} one state per cell: VIEWSHED_HIDDEN / VISIBLE / OUTSIDE
 */
export function computeViewshed({
  heights, size, observerCol, observerRow, antennaM, pixelM, radiusPx, targetM = VIEWSHED_TARGET_HEIGHT_M,
}) {
  const out = new Uint8Array(size * size).fill(VIEWSHED_OUTSIDE);
  const effectiveRadius = REFRACTION_K * EARTH_RADIUS_M;
  const observerZ = heights[observerRow * size + observerCol] + antennaM;
  const r2 = radiusPx * radiusPx;
  // Everything inside the disc starts HIDDEN and is lit by a ray that sees it.
  for (let row = 0; row < size; row++) {
    const dy = row - observerRow;
    for (let col = 0; col < size; col++) {
      const dx = col - observerCol;
      if (dx * dx + dy * dy <= r2) out[row * size + col] = VIEWSHED_HIDDEN;
    }
  }
  out[observerRow * size + observerCol] = VIEWSHED_VISIBLE;

  const castTo = (endCol, endRow) => {
    const dx = endCol - observerCol;
    const dy = endRow - observerRow;
    const steps = Math.max(Math.abs(dx), Math.abs(dy));
    if (!steps) return;
    const sx = dx / steps;
    const sy = dy / steps;
    let maxSlope = -Infinity;
    for (let i = 1; i <= steps; i++) {
      const col = Math.round(observerCol + sx * i);
      const row = Math.round(observerRow + sy * i);
      const ddx = col - observerCol;
      const ddy = row - observerRow;
      const cells2 = ddx * ddx + ddy * ddy;
      if (cells2 > r2) break;
      const index = row * size + col;
      const distance = Math.sqrt(cells2) * pixelM;
      // The Earth falls away under a straight ray: d² / 2kR.
      const drop = (distance * distance) / (2 * effectiveRadius);
      const ground = heights[index] - drop;
      const handset = (ground + targetM - observerZ) / distance;
      if (handset >= maxSlope) out[index] = VIEWSHED_VISIBLE;
      const terrain = (ground - observerZ) / distance;
      if (terrain > maxSlope) maxSlope = terrain;
    }
  };
  const last = size - 1;
  for (let i = 0; i <= last; i++) {
    castTo(i, 0);
    castTo(i, last);
    castTo(0, i);
    castTo(last, i);
  }
  return out;
}

/** Visible area and its share of the disc, in km² and 0–1. */
export function viewshedArea(grid, pixelM) {
  let visible = 0;
  let inside = 0;
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === VIEWSHED_OUTSIDE) continue;
    inside += 1;
    if (grid[i] === VIEWSHED_VISIBLE) visible += 1;
  }
  const cellKm2 = (pixelM * pixelM) / 1e6;
  return { visibleKm2: visible * cellKm2, discKm2: inside * cellKm2, share: inside ? visible / inside : 0 };
}
