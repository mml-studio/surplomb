import * as Cesium from 'cesium';
import { PbfReader } from 'pbf';
import { VectorTile } from '@mapbox/vector-tile';
import 'cesium/Build/Cesium/Widgets/widgets.css';

// -----------------------------------------------------------------------------
// PREVIEW — LiDAR HD (MNT) + BD TOPO 3D over a real neighborhood.
//
// See the header of lidar-bdtopo.html for the why. This file is the how, and
// it comes in four pieces:
//
//   1. `loadMntPatch`      one WMS request, a raster of floats, a bilinear
//                          sampler.
//   2. `makeTerrainProvider` that raster presented to Cesium as real terrain.
//   3. `loadBuildings`     the BD TOPO vector tiles, extruded between their
//                          two published altitudes.
//   4. `measureFit`        the measurement that says whether the two really
//                          meet, rather than making us believe they do.
// -----------------------------------------------------------------------------

// --- Neighborhoods ----------------------------------------------------------
// Extents verified as covered by LiDAR HD (0 nodata pixels as of 2026-08-31).
// `view` is what we look at; the downloaded MNT (digital terrain model) spills
// over by `MNT_MARGIN` on each side, so that the relief does not stop dead at
// the edge of the frame. `heading`/`pitch`/`range`: the oblique view that makes
// the change in elevation readable, `range` in multiples of the extent's radius.
const SITES = {
  lyon: {
    label: 'Lyon — Fourvière',
    view: { west: 4.8150, south: 45.7550, east: 4.8300, north: 45.7650 },
    heading: 255, pitch: -14, range: 2.3,
  },
  grenoble: {
    label: 'Grenoble — la Bastille',
    view: { west: 5.7200, south: 45.1900, east: 5.7350, north: 45.2000 },
    heading: 15, pitch: -14, range: 2.6,
  },
  marseille: {
    label: 'Marseille — Notre-Dame-de-la-Garde',
    view: { west: 5.3600, south: 43.2800, east: 5.3750, north: 43.2900 },
    heading: 330, pitch: -16, range: 2.4,
  },
  montmartre: {
    label: 'Paris — la butte Montmartre',
    view: { west: 2.3350, south: 48.8820, east: 2.3480, north: 48.8920 },
    heading: 190, pitch: -16, range: 2.4,
  },
  defense: {
    label: 'Paris — La Défense',
    view: { west: 2.2300, south: 48.8850, east: 2.2500, north: 48.8980 },
    heading: 290, pitch: -12, range: 2.2,
  },
};

/** How far the MNT spills over the viewed extent, as a fraction of its size. */
const MNT_MARGIN = 0.45;

/**
 * The extent to download around a viewed extent.
 * @param {{west:number,south:number,east:number,north:number}} view
 * @returns {{west:number,south:number,east:number,north:number}}
 */
function patchRect(view) {
  const dLon = (view.east - view.west) * MNT_MARGIN;
  const dLat = (view.north - view.south) * MNT_MARGIN;
  return {
    west: view.west - dLon, east: view.east + dLon,
    south: view.south - dLat, north: view.north + dLat,
  };
}

// --- IGN services, all keyless ----------------------------------------------
const WMS_R = 'https://data.geopf.fr/wms-r/wms';
const WMTS = 'https://data.geopf.fr/wmts';
const BDTOPO_TMS = 'https://data.geopf.fr/tms/1.0.0/BDTOPO';

/**
 * LiDAR HD MNT. `.MIXED.` rather than `.ELEVATIONGRIDCOVERAGE.`: the mixed
 * variant fills the areas the LiDAR flights have not covered yet with RGE
 * ALTI, so it never returns a hole in the middle of a city.
 */
const MNT_LAYER = 'IGNF_LIDAR-HD_MNT_ELEVATION.MIXED.WGS84G';
/** The service's nodata value — sea, outside coverage. Never an altitude. */
const MNT_NODATA_BELOW = -1000;

const IGN_CREDIT = '© IGN — Géoplateforme (Licence Ouverte 2.0)';

const BASE_LAYERS = {
  ortho: { layer: 'ORTHOIMAGERY.ORTHOPHOTOS', tms: 'PM_0_19', max: 19, format: 'image/jpeg' },
  mnt: { layer: 'IGNF_LIDAR-HD_MNT_ELEVATION.ELEVATIONGRIDCOVERAGE.SHADOW', tms: 'PM_0_18', max: 18, format: 'image/png' },
  mnh: { layer: 'IGNF_LIDAR-HD_MNH_ELEVATION.ELEVATIONGRIDCOVERAGE.SHADOW', tms: 'PM_0_18', max: 18, format: 'image/png' },
  plan: { layer: 'PLANIGN.LIDAR.TERRAIN', tms: 'PM_6_18', max: 18, min: 6, format: 'image/png' },
};

// --- Buildings --------------------------------------------------------------
/** BD TOPO tile level. z16 carries the complete, unsimplified buildings. */
const BDTOPO_Z = 16;
/** Safety cap: beyond it, the requested extent was too wide. */
const MAX_TILES = 64;
/**
 * The base of each volume is sunk 2 m below `altitude_minimale_sol`.
 * BD TOPO declares `precision_altimetrique` at 1.5 m on photogrammetric
 * buildings and the LiDAR MNT is at ±0.2 m: without this margin, a building
 * whose published altitude sits 40 cm above the measured ground shows daylight
 * under its walls. It changes nothing in the visible part — only the
 * underground part gets longer.
 */
const SINK_M = 2;
/** `precision_altimetrique` when BD TOPO has no Z at all. */
const NO_Z_SENTINEL = 9999;

const USAGE_COLOR = {
  'Résidentiel': '#e8b96a',
  'Commercial et services': '#6ad0e8',
  'Industriel': '#e87d7d',
  'Agricole': '#9ee87d',
  'Sportif': '#b9a7e8',
  'Religieux': '#b9a7e8',
  'Annexe': '#b9a7e8',
};
/** Neutral tint of the “massing” mode: the shape speaks, not the category. */
const MASSING_BASE = '#d8cbb4';

/**
 * The color of a volume.
 *
 * OPAQUE, without exception. Even an alpha of 0.94 tips the geometry into
 * Cesium's translucent pass, which does not write depth: buildings stop hiding
 * one another and the city reads as a single mass where everything shows
 * through everything. That was the main defect of the first render.
 *
 * Lightness carries HEIGHT, and on purpose: on these tiles, 83 to 87% of the
 * buildings fall into two `usage_1` values (Résidentiel and Indifférencié), so
 * color by use is almost constant and separates nothing. Height, on the other
 * hand, varies between immediate neighbors — it is the only channel that tells
 * two adjoining buildings apart when no edge separates them.
 * @param {string} usage
 * @param {number} heightM — visible height of the volume.
 * @param {'usage'|'massing'} mode
 * @returns {Cesium.Color}
 * @returns {Cesium.Color}
 */
function colorFor(usage, heightM, mode) {
  const base = Cesium.Color.fromCssColorString(
    mode === 'usage' ? (USAGE_COLOR[usage] || '#8d9aa6') : MASSING_BASE,
  );
  const t = Math.min(Math.max(((Number(heightM) || 6) - 4) / 34, 0), 1);
  // `darken` is an INSTANCE method on Cesium.Color; there is no static form.
  return base.darken(0.42 * (1 - t), new Cesium.Color());
}

// -----------------------------------------------------------------------------
// 1. The MNT, in one request
// -----------------------------------------------------------------------------

/**
 * NGF-IGN69 altitude raster over an extent, continuously samplable.
 *
 * The Géoplateforme raster WMS is capped at 40 requests/minute: a classic tiled
 * terrain provider exceeds that within a few seconds of navigation. So we
 * download ONE patch covering the whole neighborhood and keep it in memory.
 * Pleasant side effect: no more seams between tiles.
 */
class MntPatch {
  /**
   * @param {{west:number,south:number,east:number,north:number}} rect — degrees.
   * @param {number} width — raster columns.
   * @param {number} height — raster rows.
   * @param {Float32Array} values — NGF altitudes, row 0 = north.
   * @param {number} geoidN — geoid undulation at the center, in meters.
   */
  constructor(rect, width, height, values, geoidN) {
    this.rect = rect;
    this.width = width;
    this.height = height;
    this.values = values;
    this.geoidN = geoidN;

    let min = Infinity; let max = -Infinity; let holes = 0; let sum = 0; let n = 0;
    for (let i = 0; i < values.length; i += 1) {
      const v = values[i];
      if (v <= MNT_NODATA_BELOW) { holes += 1; continue; }
      if (v < min) min = v;
      if (v > max) max = v;
      sum += v; n += 1;
    }
    this.minM = n ? min : 0;
    this.maxM = n ? max : 0;
    this.holes = holes;
    // Holes take the NEAREST VALID value, not the mean of the extent: in
    // Grenoble, where the LiDAR flight stops halfway up the mountain, a mean
    // would put a plateau at 350 m right in the middle of a slope that is
    // actually at 430. Extending the edge is barely visible.
    if (holes) fillHolesNearest(values, width, height, n ? sum / n : 0);
  }

  /**
   * ORTHOMETRIC altitude (NGF-IGN69) at a point, by bilinear interpolation
   * between pixel centers. Outside the extent, the edge value is extended: the
   * world carries on flat instead of dropping off a cliff.
   * @param {number} lonDeg
   * @param {number} latDeg
   * @returns {number} NGF meters
   */
  orthometricAt(lonDeg, latDeg) {
    const { west, south, east, north } = this.rect;
    const w = this.width; const h = this.height;
    // -0.5: the first sample is at the CENTER of the first pixel, not its edge.
    let fx = ((lonDeg - west) / (east - west)) * w - 0.5;
    let fy = ((north - latDeg) / (north - south)) * h - 0.5;
    fx = Math.min(Math.max(fx, 0), w - 1);
    fy = Math.min(Math.max(fy, 0), h - 1);
    const x0 = Math.floor(fx); const y0 = Math.floor(fy);
    const x1 = Math.min(x0 + 1, w - 1); const y1 = Math.min(y0 + 1, h - 1);
    const tx = fx - x0; const ty = fy - y0;
    const v = this.values;
    const a = v[y0 * w + x0]; const b = v[y0 * w + x1];
    const c = v[y1 * w + x0]; const d = v[y1 * w + x1];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  }

  /**
   * The same altitude, brought onto the WGS84 ellipsoid Cesium expects:
   * h = H + N. N is taken at the center of the extent — it varies by less than
   * 2 cm across a neighborhood, far below the noise of the MNT itself.
   * @param {number} lonDeg
   * @param {number} latDeg
   * @returns {number} ellipsoidal meters
   */
  ellipsoidalAt(lonDeg, latDeg) {
    return this.orthometricAt(lonDeg, latDeg) + this.geoidN;
  }
}

/**
 * One back-and-forth “nearest neighbor” fill along one axis.
 * @param {Float32Array} values — modified in place.
 * @param {number} width
 * @param {number} height
 * @param {boolean} horizontal — true: sweep by rows, false: by columns.
 * @returns {number} number of holes still open after this pass.
 */
function nearestSweep(values, width, height, horizontal) {
  const bad = (v) => v <= MNT_NODATA_BELOW;
  const best = new Float32Array(values.length);
  const has = new Uint8Array(values.length);
  const dist = new Int32Array(values.length);
  const outer = horizontal ? height : width;
  const inner = horizontal ? width : height;
  const step = horizontal ? 1 : width;

  for (let o = 0; o < outer; o += 1) {
    const base = horizontal ? o * width : o;
    let lastVal = 0; let lastPos = -1;
    for (let i = 0; i < inner; i += 1) {
      const k = base + i * step;
      if (!bad(values[k])) { lastVal = values[k]; lastPos = i; continue; }
      if (lastPos >= 0) { best[k] = lastVal; has[k] = 1; dist[k] = i - lastPos; }
    }
    lastPos = -1;
    for (let i = inner - 1; i >= 0; i -= 1) {
      const k = base + i * step;
      if (!bad(values[k])) { lastVal = values[k]; lastPos = i; continue; }
      if (lastPos < 0) continue;
      const d = lastPos - i;
      if (!has[k] || d < dist[k]) { best[k] = lastVal; has[k] = 1; dist[k] = d; }
    }
  }

  let remaining = 0;
  for (let k = 0; k < values.length; k += 1) {
    if (!bad(values[k])) continue;
    if (has[k]) values[k] = best[k]; else remaining += 1;
  }
  return remaining;
}

/**
 * Fills the no-data pixels with the nearest valid value.
 *
 * The axes alternate: a pixel whose WHOLE ROW and WHOLE COLUMN are empty only
 * has a neighbor diagonally and is only reached on the next round. Two rounds
 * are enough on a real raster — the third is there so that the loop has an
 * end, and the fallback for the case where the extent is empty from end to
 * end, which is a failed request, not a hole.
 * @param {Float32Array} values — modified in place.
 * @param {number} width
 * @param {number} height
 * @param {number} fallback
 * @returns {void}
 */
function fillHolesNearest(values, width, height, fallback) {
  for (let pass = 0; pass < 4; pass += 1) {
    if (nearestSweep(values, width, height, pass % 2 === 0) === 0) return;
  }
  for (let k = 0; k < values.length; k += 1) {
    if (values[k] <= MNT_NODATA_BELOW) values[k] = fallback;
  }
}

/** true if the platform is little-endian (they all are, but let's check). */
const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

/** Meters per degree of longitude at a given latitude. @returns {number} */
const metresPerLonDeg = (latDeg) => 111320 * Math.cos((latDeg * Math.PI) / 180);
/** Meters per degree of latitude — constant, as far as we use it. */
const METRES_PER_LAT_DEG = 111320;

/**
 * Downloads the LiDAR HD MNT over an extent, in a single WMS request.
 *
 * `budget` is the LONGEST side of the raster; the other is computed so that the
 * pixel stays square on the ground. A square raster over an extent that is not
 * square would stretch the sampling in one direction and squash it in the
 * other.
 * @param {{west:number,south:number,east:number,north:number}} rect
 * @param {number} budget — 1024 / 2048 / 4096.
 * @param {number} geoidN — geoid undulation at the center of the extent.
 * @returns {Promise<MntPatch>}
 */
async function loadMntPatch(rect, budget, geoidN) {
  const midLat = (rect.south + rect.north) / 2;
  const spanXm = (rect.east - rect.west) * metresPerLonDeg(midLat);
  const spanYm = (rect.north - rect.south) * METRES_PER_LAT_DEG;
  const scale = budget / Math.max(spanXm, spanYm);
  const width = Math.max(2, Math.round(spanXm * scale));
  const height = Math.max(2, Math.round(spanYm * scale));

  // WMS 1.3.0 + EPSG:4326: the BBOX is in (lat, lon), not the other way round.
  const url = `${WMS_R}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap`
    + `&LAYERS=${encodeURIComponent(MNT_LAYER)}&STYLES=`
    + `&CRS=EPSG:4326&BBOX=${rect.south},${rect.west},${rect.north},${rect.east}`
    + `&WIDTH=${width}&HEIGHT=${height}&FORMAT=${encodeURIComponent('image/x-bil;bits=32')}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`MNT LiDAR : HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  const expected = width * height * 4;
  if (buf.byteLength !== expected) {
    // The service answers in XML when it is unhappy; we say so.
    const head = new TextDecoder().decode(buf.slice(0, 300));
    throw new Error(`MNT LiDAR : ${buf.byteLength} octets au lieu de ${expected} — ${head.slice(0, 160)}`);
  }

  let values;
  if (LITTLE_ENDIAN) {
    values = new Float32Array(buf);
  } else {
    const view = new DataView(buf);
    values = new Float32Array(width * height);
    for (let i = 0; i < values.length; i += 1) values[i] = view.getFloat32(i * 4, true);
  }
  return new MntPatch(rect, width, height, values, geoidN);
}

// -----------------------------------------------------------------------------
// 2. The raster presented to Cesium as terrain
// -----------------------------------------------------------------------------

/** Side of the altitude grid handed to Cesium for each terrain tile. */
const HEIGHTMAP_SIDE = 64;

/**
 * Cesium terrain backed by an in-memory MNT patch.
 *
 * `CustomHeightmapTerrainProvider` wants a grid of ELLIPSOIDAL altitudes per
 * tile, in row-major order, row 0 at the NORTH — exactly the order in which the
 * WMS delivers its BIL, which avoids any flipping.
 * @param {MntPatch} patch
 * @returns {Cesium.CustomHeightmapTerrainProvider}
 */
function makeTerrainProvider(patch) {
  const tilingScheme = new Cesium.GeographicTilingScheme();
  const side = HEIGHTMAP_SIDE;
  return new Cesium.CustomHeightmapTerrainProvider({
    width: side,
    height: side,
    tilingScheme,
    credit: new Cesium.Credit(`MNT LiDAR HD — ${IGN_CREDIT}`, false),
    callback(x, y, level) {
      const rect = tilingScheme.tileXYToRectangle(x, y, level);
      const west = Cesium.Math.toDegrees(rect.west);
      const east = Cesium.Math.toDegrees(rect.east);
      const north = Cesium.Math.toDegrees(rect.north);
      const south = Cesium.Math.toDegrees(rect.south);
      const out = new Float32Array(side * side);
      for (let row = 0; row < side; row += 1) {
        const lat = north - ((north - south) * row) / (side - 1);
        for (let col = 0; col < side; col += 1) {
          const lon = west + ((east - west) * col) / (side - 1);
          out[row * side + col] = patch.ellipsoidalAt(lon, lat);
        }
      }
      return out;
    },
  });
}

// -----------------------------------------------------------------------------
// The viewer
// -----------------------------------------------------------------------------

const viewer = new Cesium.Viewer('cesiumContainer', {
  baseLayer: false,
  terrainProvider: new Cesium.EllipsoidTerrainProvider(),
  baseLayerPicker: false, geocoder: false, homeButton: false,
  sceneModePicker: false, navigationHelpButton: false,
  animation: false, timeline: false, fullscreenButton: false,
  infoBox: true, selectionIndicator: true,
});
viewer.scene.globe.depthTestAgainstTerrain = true;
viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#0b1620');
viewer.scene.skyAtmosphere.show = true;
// Grazing sunlight: without shading, a 50 cm MNT looks like a tablecloth.
// The sun lights the ground AND the volumes: without it, walls and roofs render
// the same tone and a flat-roofed box has no shape at all.
viewer.scene.globe.enableLighting = true;
viewer.scene.light = new Cesium.SunLight();

const statsEl = document.getElementById('stats');
const probeEl = document.getElementById('probe');
const placeEl = document.getElementById('place');
const resEl = document.getElementById('res');
const baseEl = document.getElementById('base');
const tintEl = document.getElementById('tint');
const terrainEl = document.getElementById('terrain');
const buildingsEl = document.getElementById('buildings');
const reloadEl = document.getElementById('reload');

/** Current state, so that the checkboxes do not have to reload everything. */
const state = {
  siteId: null,
  patch: null,
  terrainProvider: null,
  flatTerrain: new Cesium.EllipsoidTerrainProvider(),
  imageryLayer: null,
  buildingStats: null,
  loading: false,
};

/** Installs the chosen basemap, replacing the previous one. */
function setBaseLayer(key) {
  const spec = BASE_LAYERS[key] || BASE_LAYERS.ortho;
  const labels = [];
  for (let i = 0; i <= spec.max; i += 1) labels.push(String(i));
  const provider = new Cesium.WebMapTileServiceImageryProvider({
    url: WMTS,
    layer: spec.layer,
    style: 'normal',
    format: spec.format,
    tileMatrixSetID: spec.tms,
    tileMatrixLabels: labels,
    maximumLevel: spec.max,
    credit: new Cesium.Credit(IGN_CREDIT, false),
  });
  const next = new Cesium.ImageryLayer(provider);
  viewer.imageryLayers.add(next, 0);
  if (state.imageryLayer) viewer.imageryLayers.remove(state.imageryLayer, true);
  state.imageryLayer = next;
}

/** Applies the LiDAR terrain or the flat ellipsoid, depending on the checkbox. */
function applyTerrain() {
  const wanted = terrainEl.checked && state.terrainProvider
    ? state.terrainProvider
    : state.flatTerrain;
  if (viewer.terrainProvider !== wanted) viewer.terrainProvider = wanted;
}

// -----------------------------------------------------------------------------
// 3. The BD TOPO buildings
// -----------------------------------------------------------------------------

const lon2x = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2y = (lat, z) =>
  Math.floor(((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z);

/**
 * @param {number} z @param {number} x @param {number} y
 * @returns {Promise<?{tile: VectorTile, z: number, x: number, y: number, bytes: number}>}
 */
async function fetchTile(z, x, y) {
  const res = await fetch(`${BDTOPO_TMS}/${z}/${x}/${y}.pbf`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`tuile ${z}/${x}/${y} : HTTP ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (!buf.length) return null;
  return { tile: new VectorTile(new PbfReader(buf)), z, x, y, bytes: buf.length };
}

const finite = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

/**
 * Where to seat a building, and why.
 *
 * The order is a hierarchy of evidence, not a rendering preference:
 *   1. the two altitudes published by IGN — the building knows where it is;
 *   2. the published ground altitude + the published height — the roof is
 *      deduced;
 *   3. the MNT under the centroid + the published height — the ground is
 *      measured, since IGN did not declare it for this building;
 *   4. none of the above: 6 m above the MNT, and it is counted separately.
 * @param {object} props — BD TOPO attributes.
 * @param {{lon:number, lat:number}} centroid
 * @param {MntPatch} patch
 * @returns {{base:number, top:number, basis:'published'|'height'|'lidar'|'guess'}}
 */
function seatBuilding(props, centroid, patch) {
  const N = patch.geoidN;
  const minSol = finite(props.altitude_minimale_sol);
  const maxToit = finite(props.altitude_maximale_toit);
  const hauteur = finite(props.hauteur);

  if (minSol !== null && maxToit !== null && maxToit > minSol) {
    return { base: minSol + N - SINK_M, top: maxToit + N, basis: 'published' };
  }
  if (minSol !== null && hauteur !== null && hauteur > 0) {
    return { base: minSol + N - SINK_M, top: minSol + N + hauteur, basis: 'height' };
  }
  const ground = patch.ellipsoidalAt(centroid.lon, centroid.lat);
  if (hauteur !== null && hauteur > 0) {
    return { base: ground - SINK_M, top: ground + hauteur, basis: 'lidar' };
  }
  return { base: ground - SINK_M, top: ground + 6, basis: 'guess' };
}

/**
 * The measurement that makes this demo worth having: does the ground altitude
 * BD TOPO DECLARES land on the ground the LiDAR MEASURES?
 *
 * The MNT under the centroid is compared with the building's
 * [altitude_minimale_sol, altitude_maximale_sol] range — the range is the
 * right target, because a building on a slope does not have ONE ground
 * altitude. One meter of tolerance on either side: BD TOPO itself announces
 * 1.5 m of altimetric precision on photogrammetric buildings.
 * @param {object} props
 * @param {{lon:number, lat:number}} centroid
 * @param {MntPatch} patch
 * @returns {?{inside: boolean, deltaM: number}}
 */
function measureFit(props, centroid, patch) {
  const minSol = finite(props.altitude_minimale_sol);
  if (minSol === null) return null;
  const declared = finite(props.precision_altimetrique);
  // 9999 is not a 10 km precision: it is the “no Z” sentinel. A building that
  // has no altitude cannot be checked against a measurement.
  if (declared === NO_Z_SENTINEL) return null;

  const mnt = patch.orthometricAt(centroid.lon, centroid.lat);
  const maxSol = finite(props.altitude_maximale_sol);
  // The tolerance is the one BD TOPO grants itself — never one we would pick to
  // prove ourselves right. Floor at 1 m: below that, we would be measuring the
  // noise of the MNT and the position of the centroid.
  const tol = Math.max(declared === null ? 1.5 : declared, 1);
  const high = (maxSol === null ? minSol : maxSol) + tol;
  return {
    inside: mnt >= minSol - tol && mnt <= high,
    deltaM: mnt - minSol,
    tol,
    // Paris publishes neither `altitude_maximale_sol` nor
    // `altitude_maximale_toit`: there the target is a point, elsewhere it is a
    // range. Saying which avoids comparing two different strictnesses as if
    // they were the same.
    ranged: maxSol !== null,
  };
}

/** Median of an array of numbers (mutates the array). @returns {number} */
function median(values) {
  if (!values.length) return 0;
  values.sort((a, b) => a - b);
  const mid = values.length >> 1;
  return values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
}

/** A building's card, shown by Cesium's infoBox. @returns {string} */
function describe(props, seat, fit) {
  const rows = [
    ['Usage principal', props.usage_1],
    ['Usage secondaire', props.usage_2],
    ['Nature', props.nature],
    ['Hauteur publiée', props.hauteur ? `${props.hauteur} m` : null],
    ['Étages', props.nombre_d_etages],
    ['Logements', props.nombre_de_logements],
    ['Altitude sol (BD TOPO)', props.altitude_minimale_sol != null
      ? `${props.altitude_minimale_sol} → ${props.altitude_maximale_sol ?? '?'} m NGF` : null],
    ['Altitude toit (BD TOPO)', props.altitude_maximale_toit != null
      ? `${props.altitude_maximale_toit} m NGF` : null],
    ['Sol mesuré (MNT LiDAR)', fit ? `${(props.altitude_minimale_sol + fit.deltaM).toFixed(1)} m NGF` : null],
    ['Écart déclaré ↔ mesuré', fit ? `${fit.deltaM >= 0 ? '+' : ''}${fit.deltaM.toFixed(1)} m` : null],
    ['Posé sur', {
      published: 'ses deux altitudes publiées',
      height: 'son altitude de sol + sa hauteur',
      lidar: 'le MNT LiDAR + sa hauteur',
      guess: 'le MNT LiDAR, hauteur inconnue (6 m par défaut)',
    }[seat.basis]],
    ['Précision altimétrique', props.precision_altimetrique ? `${props.precision_altimetrique} m` : null],
    ['Acquisition altimétrique', props.methode_d_acquisition_altimetrique],
    ['Matériaux toiture', props.materiaux_de_la_toiture],
    ['Identifiant RNB', props.identifiants_rnb],
    ['Clé IGN', props.cleabs],
  ].filter(([, v]) => v !== null && v !== undefined && v !== '');

  return '<table class="cesium-infoBox-defaultTable"><tbody>'
    + rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')
    + '</tbody></table>';
}

/**
 * Loads and draws the BD TOPO buildings of the neighborhood's visible extent.
 * @param {object} site
 * @param {MntPatch} patch
 * @returns {Promise<object>} loading statistics.
 */
async function loadBuildings(site, patch) {
  // The buildings spill over the viewed extent exactly like the MNT: otherwise
  // the city stops dead on a straight line in the middle of the frame, which
  // reads as a data boundary when it is only a request boundary.
  const rect = patchRect(site.view);
  const { west, south, east, north } = rect;
  const x0 = lon2x(west, BDTOPO_Z); const x1 = lon2x(east, BDTOPO_Z);
  const y0 = lat2y(north, BDTOPO_Z); const y1 = lat2y(south, BDTOPO_Z);
  const wanted = (x1 - x0 + 1) * (y1 - y0 + 1);
  if (wanted > MAX_TILES) throw new Error(`${wanted} tuiles demandées, plafond ${MAX_TILES}`);

  const jobs = [];
  for (let x = x0; x <= x1; x += 1) for (let y = y0; y <= y1; y += 1) jobs.push(fetchTile(BDTOPO_Z, x, y));

  const t0 = performance.now();
  const tiles = (await Promise.all(jobs)).filter(Boolean);
  const tFetch = performance.now() - t0;
  const bytes = tiles.reduce((acc, t) => acc + t.bytes, 0);

  viewer.entities.removeAll();
  viewer.entities.suspendEvents();

  const t1 = performance.now();
  const seen = new Set();
  const deltas = [];
  const basis = { published: 0, height: 0, lidar: 0, guess: 0 };
  const methods = new Map();
  let volumes = 0; let insideCount = 0; let fitCount = 0; let rangedCount = 0;
  let tallest = 0; let homes = 0; let outside = 0;

  for (const { tile, z, x, y } of tiles) {
    const layer = tile.layers.batiment;
    if (!layer) continue;
    for (let i = 0; i < layer.length; i += 1) {
      const feature = layer.feature(i);
      const props = feature.properties || {};

      const gj = feature.toGeoJSON(x, y, z);
      const polygons = gj.geometry.type === 'MultiPolygon'
        ? gj.geometry.coordinates : [gj.geometry.coordinates];
      for (const polygon of polygons) {
        const ring = polygon[0];
        if (!ring || ring.length < 4) continue;

        let cx = 0; let cy = 0;
        const flat = [];
        for (const [lon, lat] of ring) { flat.push(lon, lat); cx += lon; cy += lat; }
        const centroid = { lon: cx / ring.length, lat: cy / ring.length };

        // The INNER rings, which the first version threw away. BD TOPO publishes
        // them on 11% of polygons in Lyon and 6% in Grenoble: they are
        // courtyards and light wells. Filling them poured solid concrete into
        // exactly the gaps that separate one building from the next, and turned
        // a street front into a single block.
        const holes = [];
        for (let h = 1; h < polygon.length; h += 1) {
          const inner = polygon[h];
          if (!inner || inner.length < 4) continue;
          const flatHole = [];
          for (const [lon, lat] of inner) flatHole.push(lon, lat);
          holes.push(new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(flatHole)));
        }

        // The z16 tiles spill several hundred meters past the MNT's extent.
        // Beyond the edge, `orthometricAt` extends the last known value: we
        // would draw buildings sitting on invented ground there, and count them
        // in an agreement measurement that would no longer be one. So we leave
        // them out, and say so.
        if (centroid.lon < west || centroid.lon > east
          || centroid.lat < south || centroid.lat > north) { outside += 1; continue; }

        // A building straddling two tiles shows up cut in two: every piece is
        // drawn (they join back up) but the building is counted only once.
        const fresh = props.cleabs && !seen.has(props.cleabs);
        if (fresh) {
          seen.add(props.cleabs);
          homes += Number(props.nombre_de_logements) || 0;
          const method = props.methode_d_acquisition_altimetrique || 'non renseignée';
          methods.set(method, (methods.get(method) || 0) + 1);
        }

        const seat = seatBuilding(props, centroid, patch);
        const fit = measureFit(props, centroid, patch);
        if (fresh) {
          basis[seat.basis] += 1;
          if (fit) {
            fitCount += 1;
            deltas.push(fit.deltaM);
            if (fit.inside) insideCount += 1;
            if (fit.ranged) rangedCount += 1;
          }
          const above = seat.top - (seat.base + SINK_M);
          if (above > tallest) tallest = above;
        }

        viewer.entities.add({
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(
              Cesium.Cartesian3.fromDegreesArray(flat), holes,
            ),
            height: seat.base,
            extrudedHeight: seat.top,
            material: colorFor(props.usage_1, seat.top - seat.base - SINK_M, tintEl.value),
            outline: false,
            closeTop: true,
            // Closed: on a slope the base of a volume ends up surfacing, and an
            // open bottom shows the inside of the opposite walls.
            closeBottom: true,
          },
          name: props.usage_1 || props.nature || 'Bâtiment',
          description: describe(props, seat, fit),
        });
        volumes += 1;
      }
    }
  }

  viewer.entities.resumeEvents();
  return {
    buildings: seen.size,
    volumes,
    tiles: tiles.length,
    bytes,
    tFetch,
    tDraw: performance.now() - t1,
    basis,
    methods: [...methods.entries()].sort((a, b) => b[1] - a[1]),
    homes,
    tallest,
    outside,
    fitCount,
    rangedPct: fitCount ? (100 * rangedCount) / fitCount : null,
    insidePct: fitCount ? (100 * insideCount) / fitCount : null,
    medianDelta: deltas.length ? median(deltas) : null,
  };
}

// -----------------------------------------------------------------------------
// Orchestration
// -----------------------------------------------------------------------------

/** Repaints the statistics block from the current state. */
function renderStats() {
  const patch = state.patch;
  if (!patch) { statsEl.textContent = 'Chargement…'; return; }
  const spanM = patch.maxM - patch.minM;
  const px = ((patch.rect.north - patch.rect.south) * METRES_PER_LAT_DEG) / patch.height;

  const lines = [];
  lines.push(`<span class="k">MNT LiDAR</span> <b>${patch.width}×${patch.height}</b> px`
    + ` · <b>${px.toFixed(2)} m</b>/px`);
  lines.push(`<span class="k">relief</span> <b>${patch.minM.toFixed(1)}</b> → <b>${patch.maxM.toFixed(1)}</b> m NGF`
    + ` (<b>${spanM.toFixed(0)} m</b>)`);
  lines.push(`<span class="k">géoïde EGM96</span> N = <b>${patch.geoidN.toFixed(2)} m</b>`
    + (patch.holes ? ` · <span class="warn">${patch.holes} px sans donnée</span>` : ''));

  const b = state.buildingStats;
  if (b) {
    const total = Math.max(b.buildings, 1);
    const pct = (n) => `${((100 * n) / total).toFixed(1)}%`;
    lines.push('<hr style="border:0;border-top:1px solid rgba(120,190,240,.15);margin:7px 0">');
    lines.push(`<span class="k">BD TOPO</span> <b>${b.buildings}</b> bâtiments · ${b.volumes} volumes`
      + ` · ${b.tiles} tuiles z${BDTOPO_Z}`);
    lines.push(`<span class="k">posés sur</span> sol + toit publiés <b>${pct(b.basis.published)}</b>`
      + ` · sol + hauteur <b>${pct(b.basis.height)}</b>`
      + ((b.basis.lidar + b.basis.guess)
        ? ` · MNT LiDAR <b>${pct(b.basis.lidar + b.basis.guess)}</b>` : ''));
    if (b.insidePct !== null) {
      // Paris publishes only ONE ground altitude, Lyon publishes two: the target
      // is not the same width, and the sentence must say so or the percentage
      // lies.
      const cible = b.rangedPct > 50
        ? 'dans la fourchette de sol publiée'
        : "sur l'altitude de sol publiée";
      lines.push(`<span class="k">sol déclaré ↔ sol LiDAR</span> <b>${b.insidePct.toFixed(1)}%</b>`
        + ` ${cible} · écart médian`
        + ` <b>${b.medianDelta >= 0 ? '+' : ''}${b.medianDelta.toFixed(2)} m</b>`);
    }
    if (b.methods?.length) {
      const [name, count] = b.methods[0];
      lines.push(`<span class="k">altimétrie IGN</span> ${name.toLowerCase()} pour <b>${pct(count)}</b>`
        + (b.methods.length > 1 ? ` <span class="k">(+${b.methods.length - 1} autres)</span>` : ''));
    }
    lines.push(`<span class="k">le plus haut</span> <b>${b.tallest.toFixed(1)} m</b>`
      + (b.homes ? ` · <b>${b.homes}</b> logements` : ''));
    lines.push(`<span class="k">réseau</span> ${(b.bytes / 1024).toFixed(0)} Ko en ${b.tFetch.toFixed(0)} ms`
      + ` · rendu ${b.tDraw.toFixed(0)} ms`
      + (b.outside ? ` · <span class="k">${b.outside} hors emprise MNT, non dessinés</span>` : ''));
  }
  statsEl.innerHTML = lines.join('<br>');
}

/** Loads a neighborhood end to end: MNT, terrain, basemap, buildings, camera. */
async function loadSite(siteId) {
  if (state.loading) return;
  const site = SITES[siteId];
  if (!site) return;
  state.loading = true;
  reloadEl.disabled = true;
  placeEl.disabled = true;
  statsEl.innerHTML = `Téléchargement du MNT LiDAR HD sur <b>${site.label}</b>…`;

  try {
    const { meanSeaLevel } = await import('egm96-universal');
    const rect = patchRect(site.view);
    const centreLat = (rect.south + rect.north) / 2;
    const centreLon = (rect.west + rect.east) / 2;
    const geoidN = meanSeaLevel(centreLat, centreLon);

    const patch = await loadMntPatch(rect, Number(resEl.value), geoidN);
    state.siteId = siteId;
    state.patch = patch;
    state.terrainProvider = makeTerrainProvider(patch);
    state.buildingStats = null;
    applyTerrain();
    renderStats();

    // `flyTo` on a Rectangle frames straight down and ignores the requested
    // orientation: we go through a bounding sphere, the only way to get an
    // oblique view at a chosen distance — and the oblique view is the whole
    // point here.
    const target = Cesium.Rectangle.fromDegrees(
      site.view.west, site.view.south, site.view.east, site.view.north,
    );
    const sphere = Cesium.BoundingSphere.fromRectangle3D(
      target, Cesium.Ellipsoid.WGS84, patch.ellipsoidalAt(centreLon, centreLat),
    );
    viewer.camera.flyToBoundingSphere(sphere, {
      offset: new Cesium.HeadingPitchRange(
        Cesium.Math.toRadians(site.heading),
        Cesium.Math.toRadians(site.pitch),
        sphere.radius * site.range,
      ),
      duration: 1.8,
    });

    if (buildingsEl.checked) {
      statsEl.innerHTML += '<br><span class="k">Chargement du bâti BD TOPO…</span>';
      state.buildingStats = await loadBuildings(site, patch);
    } else {
      viewer.entities.removeAll();
    }
    renderStats();
  } catch (error) {
    statsEl.innerHTML = `<span class="warn">Échec : ${error.message}</span>`;
    console.error('[lidar-bdtopo]', error);
  } finally {
    state.loading = false;
    reloadEl.disabled = false;
    placeEl.disabled = false;
  }
}

// --- Ground probe -----------------------------------------------------------
// A click on the terrain returns the altitude MEASURED where you clicked: it is
// the only honest way to show that we are looking at a measurement and not at a
// stage set.
const clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
clickHandler.setInputAction((movement) => {
  if (viewer.scene.pick(movement.position)) return; // a building: the infoBox handles it
  const ray = viewer.camera.getPickRay(movement.position);
  const hit = ray && viewer.scene.globe.pick(ray, viewer.scene);
  if (!hit || !state.patch) return;
  const carto = Cesium.Cartographic.fromCartesian(hit);
  const lon = Cesium.Math.toDegrees(carto.longitude);
  const lat = Cesium.Math.toDegrees(carto.latitude);
  const ngf = state.patch.orthometricAt(lon, lat);
  probeEl.innerHTML =
    `<b>${lat.toFixed(5)}°N ${lon.toFixed(5)}°E</b> · sol LiDAR <b>${ngf.toFixed(2)} m NGF</b>`
    + ` (= ${(ngf + state.patch.geoidN).toFixed(2)} m ellipsoïdaux, N = ${state.patch.geoidN.toFixed(2)} m)`;
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);

// --- Controls ---------------------------------------------------------------
placeEl.addEventListener('change', () => loadSite(placeEl.value));
resEl.addEventListener('change', () => loadSite(placeEl.value));
reloadEl.addEventListener('click', () => loadSite(placeEl.value));
baseEl.addEventListener('change', () => setBaseLayer(baseEl.value));
tintEl.addEventListener('change', async () => {
  if (!state.patch || !buildingsEl.checked) return;
  // Full redraw: the tiles are in the browser cache, so it is a memory round
  // trip, not a network one.
  state.buildingStats = await loadBuildings(SITES[state.siteId], state.patch);
  renderStats();
});
terrainEl.addEventListener('change', applyTerrain);
buildingsEl.addEventListener('change', async () => {
  if (!state.patch) return;
  if (!buildingsEl.checked) {
    viewer.entities.removeAll();
    state.buildingStats = null;
    renderStats();
    return;
  }
  state.buildingStats = await loadBuildings(SITES[state.siteId], state.patch);
  renderStats();
});

setBaseLayer(baseEl.value);
loadSite(placeEl.value);

// For inspection from the console and for automated screenshots.
window.__lidarBdtopo = { state, SITES, loadSite };
