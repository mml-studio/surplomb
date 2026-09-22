/**
 * Which published shape a point stands on — a grid index over polygons, with
 * a short snap for the points a register publishes ON a boundary.
 *
 * WHY THIS EXISTS. The DPE register names no parcel: a diagnostic carries the
 * BAN geocode of its address and nothing else the cadastre can be joined on.
 * So the area regimes of `dpeFrance.js` place each diagnostic by geometry —
 * the parcel, or the cadastral section, its point falls in — and thousands of
 * points have to be tested against thousands of shapes per box. A grid over
 * the shapes' bounding boxes turns that into a handful of ray casts per point.
 *
 * THE SNAP, AND WHY IT IS NEEDED AT ALL. A BAN address point is usually put at
 * the front door, and the front door is ON the parcel line, facing the street.
 * Measured on 2026-09-22 over one 0.01° tile of Lyon 1er–2e (8 338 diagnostics,
 * 1 107 distinct points): 552 points inside a parcel, **534 within 2 m of one**
 * and outside it, 17 between 2 and 20 m, one further. Paris 11e: 1 177 of
 * 1 185 inside. Pessac: 164 inside, 113 within 2 m. The street itself is not
 * cadastred in France, so a point a metre into the road belongs to the parcel
 * whose frontage it sits on — and nearest-edge is exactly that frontage.
 *
 * A SNAP IS NOT AN INSIDE, and the answer says which it was — `inside`, and
 * `distanceM` for the gap — so a caller can count the two apart the way the
 * building join counts "by identifier" and "by point".
 *
 * Dependency-free and side-effect-free, so the Vite proxy and `node --test`
 * run the same index.
 *
 * @module data/shapeLocator
 */

/** Metres per degree of latitude, and of longitude at the equator. */
const M_PER_DEG_LAT = 110_574;
const M_PER_DEG_LON = 111_320;

/**
 * One grid cell's integer key. Offsets keep every French (and every global)
 * index positive, and the product stays well inside 2^53.
 */
function cellKey(i, j) {
  return ((i + 400_000) * 400_000) + (j + 200_000);
}

/**
 * Distance in metres from a point to a segment, in a local equirectangular
 * frame. Exact enough at the few-metre range a snap works at.
 */
function segmentDistanceM(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = (dx * dx) + (dy * dy);
  const t = lengthSq > 0
    ? Math.max(0, Math.min(1, (((px - ax) * dx) + ((py - ay) * dy)) / lengthSq))
    : 0;
  return Math.hypot(px - (ax + (t * dx)), py - (ay + (t * dy)));
}

/** Grow a typed array, keeping what it holds. */
function grow(array, minLength) {
  if (array.length >= minLength) return array;
  const next = new array.constructor(Math.max(minLength, array.length * 2));
  next.set(array);
  return next;
}

/**
 * Build the index.
 *
 * ONE ARRAY OF COORDINATES PER INDEX, and offsets into it — not an array per
 * vertex, nor a typed array per ring. MEASURED on 2026-09-22: Toulouse's
 * 91 938 parcels held 181 MB of heap as GeoJSON's nested `[lon, lat]` pairs,
 * still 94 MB of heap plus 83 MB of buffers as one `Float64Array` per ring,
 * each one an object of its own, and 24 MB plus 33 MB as one `Float64Array`
 * for the whole commune. The proxy keeps several whole communes
 * indexed at once, and this layout is what makes that a cache and not a leak.
 *
 * @param {Iterable<{id: string, parts: Array<Array<Array<number[]>>>}>} shapes
 *   Shapes in degrees, GeoJSON's part layout (`[outer, ...holes]`).
 * @param {{cellDeg?: number}} [options] Grid step. Pick it near the size of a
 *   typical shape: 0.0005° (~40 × 55 m) for parcels, 0.005° for sections.
 * @returns {{size: number, locate: (lon: number, lat: number,
 *   options?: {snapM?: number}) => ?{id: string, inside: boolean, distanceM: number},
 *   partsOf: (id: string) => ?Array}}
 */
export function createShapeLocator(shapes, { cellDeg = 0.0005 } = {}) {
  const step = Number.isFinite(cellDeg) && cellDeg > 0 ? cellDeg : 0.0005;
  // coords[2k], coords[2k+1] = lon, lat of vertex k, RELATIVE to the first
  // vertex indexed (lon0, lat0) and stored as float32: a float32 holds an
  // absolute latitude near 45° to 0.4 m, which is a tenth of the snap; an
  // offset of under a degree it holds to a millimetre. A ring r spans vertices
  // ringStart[r] .. ringStart[r+1]; a part p spans rings partStart[p] ..
  // partStart[p+1] (the first is the outer ring); a shape s spans parts
  // shapeStart[s] .. shapeStart[s+1].
  let coords = new Float32Array(1 << 16);
  let lon0 = null;
  let lat0 = null;
  let ringStart = new Int32Array(1 << 12);
  let partStart = new Int32Array(1 << 12);
  let shapeStart = new Int32Array(1 << 12);
  let bounds = new Float64Array(1 << 12);
  const ids = [];
  const byId = new Map();
  const grid = new Map();
  let vertices = 0;
  let rings = 0;
  let parts = 0;
  for (const shape of shapes || []) {
    if (!shape?.id || !Array.isArray(shape.parts)) continue;
    const firstPart = parts;
    let south = Infinity;
    let west = Infinity;
    let north = -Infinity;
    let east = -Infinity;
    for (const part of shape.parts) {
      if (!Array.isArray(part)) continue;
      const firstRing = rings;
      for (let r = 0; r < part.length; r += 1) {
        const ring = part[r];
        if (!Array.isArray(ring) || ring.length < 3) continue;
        const start = vertices;
        coords = grow(coords, (vertices + ring.length) * 2);
        for (const point of ring) {
          const lon = Number(point?.[0]);
          const lat = Number(point?.[1]);
          if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
          if (lon0 === null) { lon0 = lon; lat0 = lat; }
          coords[vertices * 2] = lon - lon0;
          coords[(vertices * 2) + 1] = lat - lat0;
          vertices += 1;
          // The outer ring bounds the shape; holes are inside it.
          if (r === 0) {
            if (lon < west) west = lon;
            if (lon > east) east = lon;
            if (lat < south) south = lat;
            if (lat > north) north = lat;
          }
        }
        if (vertices - start < 3) { vertices = start; continue; }
        // A part whose outer ring collapsed keeps no hole of its own.
        if (r > 0 && rings === firstRing) { vertices = start; continue; }
        ringStart = grow(ringStart, rings + 2);
        ringStart[rings] = start;
        rings += 1;
        ringStart[rings] = vertices;
      }
      if (rings === firstRing) continue;
      partStart = grow(partStart, parts + 2);
      partStart[parts] = firstRing;
      parts += 1;
      partStart[parts] = rings;
    }
    if (parts === firstPart || !Number.isFinite(south)) continue;
    const index = ids.length;
    shapeStart = grow(shapeStart, index + 2);
    shapeStart[index] = firstPart;
    shapeStart[index + 1] = parts;
    bounds = grow(bounds, (index + 1) * 4);
    bounds.set([south, west, north, east], index * 4);
    ids.push(shape.id);
    if (!byId.has(shape.id)) byId.set(shape.id, index);
    const i0 = Math.floor(west / step);
    const i1 = Math.floor(east / step);
    const j0 = Math.floor(south / step);
    const j1 = Math.floor(north / step);
    for (let i = i0; i <= i1; i += 1) {
      for (let j = j0; j <= j1; j += 1) {
        const key = cellKey(i, j);
        const held = grid.get(key);
        if (held) held.push(index); else grid.set(key, [index]);
      }
    }
  }
  // Trimmed to what is used: the growth doubling would otherwise hold up to
  // twice the memory for the life of the index.
  coords = coords.slice(0, vertices * 2);
  ringStart = ringStart.slice(0, rings + 1);
  partStart = partStart.slice(0, parts + 1);
  shapeStart = shapeStart.slice(0, ids.length + 1);
  bounds = bounds.slice(0, ids.length * 4);

  /** Ray-casting point-in-ring over ring `r`, the point already relative. */
  function inRing(lon, lat, r) {
    const from = ringStart[r];
    const to = ringStart[r + 1];
    let inside = false;
    for (let i = from, j = to - 1; i < to; j = i, i += 1) {
      const ax = coords[j * 2];
      const ay = coords[(j * 2) + 1];
      const bx = coords[i * 2];
      const by = coords[(i * 2) + 1];
      if (((by > lat) !== (ay > lat)) && (lon < (((ax - bx) * (lat - by)) / (ay - by)) + bx)) inside = !inside;
    }
    return inside;
  }

  /** Inside one of shape `s`'s outer rings and none of that part's holes. */
  function inShape(s, absLon, absLat) {
    const lon = absLon - lon0;
    const lat = absLat - lat0;
    for (let p = shapeStart[s]; p < shapeStart[s + 1]; p += 1) {
      const first = partStart[p];
      if (!inRing(lon, lat, first)) continue;
      let inHole = false;
      for (let r = first + 1; r < partStart[p + 1]; r += 1) {
        if (inRing(lon, lat, r)) { inHole = true; break; }
      }
      if (!inHole) return true;
    }
    return false;
  }

  /** Nearest distance in metres from a point to any ring of shape `s`. */
  function distanceM(s, lon, lat) {
    const kx = Math.cos((lat * Math.PI) / 180) * M_PER_DEG_LON;
    const ky = M_PER_DEG_LAT;
    const px = (lon - lon0) * kx;
    const py = (lat - lat0) * ky;
    let best = Infinity;
    for (let p = shapeStart[s]; p < shapeStart[s + 1]; p += 1) {
      for (let r = partStart[p]; r < partStart[p + 1]; r += 1) {
        const from = ringStart[r];
        const to = ringStart[r + 1];
        for (let i = from, j = to - 1; i < to; j = i, i += 1) {
          const d = segmentDistanceM(px, py, coords[j * 2] * kx, coords[(j * 2) + 1] * ky,
            coords[i * 2] * kx, coords[(i * 2) + 1] * ky);
          if (d < best) best = d;
        }
      }
    }
    return best;
  }

  const span = (s) => (bounds[(s * 4) + 2] - bounds[s * 4]) * (bounds[(s * 4) + 3] - bounds[(s * 4) + 1]);

  /**
   * The shape a point stands on, or the nearest one within `snapM`.
   *
   * Inside wins over near, and where two shapes contain the point — a sliver
   * published twice, a multipart parcel's neighbour — the SMALLER wins,
   * because it is the more specific claim (the rule `dvfAreaShapeAt` uses for
   * a click).
   */
  function locate(lon, lat, { snapM = 0 } = {}) {
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    const ci = Math.floor(lon / step);
    const cj = Math.floor(lat / step);
    let inside = -1;
    for (const s of grid.get(cellKey(ci, cj)) || []) {
      const o = s * 4;
      if (lat < bounds[o] || lat > bounds[o + 2] || lon < bounds[o + 1] || lon > bounds[o + 3]) continue;
      if (!inShape(s, lon, lat)) continue;
      if (inside < 0 || span(s) < span(inside)) inside = s;
    }
    if (inside >= 0) return { id: ids[inside], inside: true, distanceM: 0 };
    if (!(snapM > 0)) return null;
    // The cells a snap radius can reach, and no further: a snap is a few
    // metres, so this is the point's own cell and its eight neighbours for
    // every grid step used here.
    const reachLat = snapM / M_PER_DEG_LAT;
    const reachLon = snapM / (Math.cos((lat * Math.PI) / 180) * M_PER_DEG_LON);
    const ri = Math.max(1, Math.ceil(reachLon / step));
    const rj = Math.max(1, Math.ceil(reachLat / step));
    const seen = new Set();
    let best = -1;
    let bestM = snapM;
    for (let i = ci - ri; i <= ci + ri; i += 1) {
      for (let j = cj - rj; j <= cj + rj; j += 1) {
        for (const s of grid.get(cellKey(i, j)) || []) {
          if (seen.has(s)) continue;
          seen.add(s);
          const o = s * 4;
          if (lat < bounds[o] - reachLat || lat > bounds[o + 2] + reachLat
            || lon < bounds[o + 1] - reachLon || lon > bounds[o + 3] + reachLon) continue;
          const d = distanceM(s, lon, lat);
          if (d <= bestM) { best = s; bestM = d; }
        }
      }
    }
    return best >= 0 ? { id: ids[best], inside: false, distanceM: Math.round(bestM * 10) / 10 } : null;
  }

  /**
   * A shape's rings as GeoJSON parts, rebuilt from the flat form — what a
   * caller draws once it is hit, a few thousand at most per answer.
   */
  function partsOf(id) {
    const s = byId.get(id);
    if (s === undefined) return null;
    const out = [];
    for (let p = shapeStart[s]; p < shapeStart[s + 1]; p += 1) {
      const part = [];
      for (let r = partStart[p]; r < partStart[p + 1]; r += 1) {
        const ring = [];
        for (let v = ringStart[r]; v < ringStart[r + 1]; v += 1) {
          ring.push([coords[v * 2] + lon0, coords[(v * 2) + 1] + lat0]);
        }
        part.push(ring);
      }
      out.push(part);
    }
    return out;
  }

  return { size: ids.length, locate, partsOf };
}
