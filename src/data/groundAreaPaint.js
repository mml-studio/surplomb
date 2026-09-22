/**
 * Cadastral shapes painted on the ground, as primitives — the draw shared by
 * the two layers that paint the cadastre from altitude: property prices
 * (`dvfSales.js`) and energy ratings (`dpeFrance.js`).
 *
 * WRITTEN FOR THE PRICES FIRST (#301) and extracted when the energy ratings
 * needed the same thing (2026-09-22): parcels from 600 m, cadastral sections
 * above 1 800 m, one colour each, a click answered by geometry.
 *
 * PRIMITIVES, NOT ENTITIES. The densest price box holds 1 698 parcels and the
 * densest energy box measured 2 469 (Lyon Presqu'île); as entities that is
 * 3 500 to 5 000 objects — a fill and an outline each — at the ~30 KiB of
 * `Entity` machinery `localGeojson.js` measured per feature. Drawn the way
 * `cadastreParcels.js` draws its 5 000 parcels instead, it is ONE
 * classification `GroundPrimitive` per colour and one
 * `GroundPolylinePrimitive` for every edge. One colour per batch is not a
 * style choice: a batch mixing colours repaints its neighbours along their
 * bounding rectangles (`cadastreParcels.js`, `drawRecords`).
 *
 * A CLICK IS ANSWERED BY GEOMETRY, not by the pick. Ground classification
 * answers `scene.pick` with whichever shadow volume the ray enters first,
 * which at this globe's oblique angles is often not the shape under the
 * pointer; the shapes are in memory, so {@link createGroundAreaPaint}'s
 * `shapeAt` finds the one under the ground point directly.
 *
 * @module data/groundAreaPaint
 */

import * as Cesium from 'cesium';
import { decodeParts } from './dvfFeed.js';
import { pointInPolygons, polygonsBounds } from './ringGeometry.js';
import { governorRequestRender } from '../renderGovernor.js';

/** Frames a freshly built draw is re-rendered for, at most, while it tessellates. */
const BUILD_FRAME_CAP = 240;

/**
 * The shape under a ground point, or null. The smallest wins where two
 * overlap — a multipart plot's neighbour, a section drawn over a sliver of
 * another — because the smaller shape is the more specific claim.
 * @param {number} lon @param {number} lat
 * @param {Array<{parts: Array, bounds: ?object}>} shapes
 * @returns {?object}
 */
export function groundShapeAt(lon, lat, shapes) {
  let best = null;
  let bestSpan = Infinity;
  for (const shape of shapes || []) {
    const bounds = shape.bounds;
    // The bbox rejects almost everything for almost nothing — at 2 000 plots
    // it is the difference between a hit test and a stutter.
    if (!bounds || lat < bounds.south || lat > bounds.north
      || lon < bounds.west || lon > bounds.east) continue;
    if (!pointInPolygons(shape.parts, lon, lat)) continue;
    const span = (bounds.north - bounds.south) * (bounds.east - bounds.west);
    if (span < bestSpan) { best = shape; bestSpan = span; }
  }
  return best;
}

/** Positions for one ring, without its repeated closing vertex. */
function ringPositions(ring) {
  const degrees = [];
  const last = ring.length - 1;
  const closed = last > 0 && ring[0][0] === ring[last][0] && ring[0][1] === ring[last][1];
  for (let i = 0; i < (closed ? last : ring.length); i += 1) {
    const point = ring[i];
    if (Array.isArray(point)) degrees.push(point[0], point[1]);
  }
  return degrees.length >= 6 ? Cesium.Cartesian3.fromDegreesArray(degrees) : null;
}

/**
 * One layer's painter. Each layer holds its own, so the two can be on screen
 * together and each tears down only what it drew.
 *
 * @param {{renderReason: string}} options The render-governor reason the
 *   build pump requests frames under.
 * @returns {{
 *   draw: Function, clear: Function, shapeAt: Function,
 *   shapes: () => Array<object>, stats: () => {shapes: number, fills: number, ready: boolean},
 * }}
 */
export function createGroundAreaPaint({ renderReason }) {
  let viewer = null;
  /** @type {Array<object>} One classification primitive per colour. */
  let fills = [];
  let outline = null;
  let pumpStop = null;
  /** @type {Array<{kind: string, record: object, parts: Array, bounds: ?object, css: string}>} */
  let shapes = [];

  /** Take the draw off the globe. Idempotent. */
  function clear() {
    pumpStop?.();
    pumpStop = null;
    const primitives = viewer?.scene?.primitives;
    if (primitives) {
      for (const fill of fills) primitives.remove(fill);
      if (outline) primitives.remove(outline);
    }
    fills = [];
    outline = null;
    shapes = [];
  }

  /**
   * Keep rendering while the batches tessellate on the worker pool, then stop.
   *
   * The globe renders on demand, and nothing else asks for the frames in which
   * an asynchronous `GroundPrimitive` becomes ready — without this a box of
   * plots can land and stay invisible until the reader next moves. Bounded, so
   * a primitive that never readies cannot hold the render loop open.
   */
  function pumpUntilReady(scene) {
    if (!scene?.postRender) return;
    let framesLeft = BUILD_FRAME_CAP;
    const stop = scene.postRender.addEventListener(() => {
      const pending = fills.some((fill) => !fill.ready) || (outline && !outline.ready);
      framesLeft -= 1;
      if (!pending || framesLeft <= 0) {
        stop();
        if (pumpStop === stop) pumpStop = null;
        return;
      }
      governorRequestRender(renderReason);
    });
    pumpStop = stop;
    governorRequestRender(renderReason);
  }

  /**
   * Paint shapes: one fill primitive per colour, one outline primitive.
   *
   * @param {object} targetViewer
   * @param {Iterable<{id: string, kind: string, record: object,
   *   parts: Array, css: string}>} items `parts` ENCODED (`dvfFeed.encodeRing`),
   *   decoded once here for the draw and the click test both; `id` is the pick
   *   id every instance of the shape carries.
   * @param {{style: {fill: number, outline: number, widthPx: number},
   *   classificationType: number}} options
   * @returns {number} Shapes drawn.
   */
  function draw(targetViewer, items, { style, classificationType }) {
    clear();
    if (!targetViewer?.scene?.primitives) return 0;
    viewer = targetViewer;
    const fillsByColor = new Map();
    const outlines = [];
    const drawn = [];
    for (const item of items || []) {
      const parts = decodeParts(item?.parts);
      if (!parts.length) continue;
      const fill = Cesium.Color.fromCssColorString(item.css).withAlpha(style.fill);
      const stroke = Cesium.Color.fromCssColorString(item.css).withAlpha(style.outline);
      let batch = fillsByColor.get(item.css);
      if (!batch) { batch = []; fillsByColor.set(item.css, batch); }
      for (const rings of parts) {
        const outer = ringPositions(rings[0] || []);
        if (!outer) continue;
        const holes = [];
        for (let h = 1; h < rings.length; h += 1) {
          const hole = ringPositions(rings[h]);
          // A courtyard is not part of the plot, and a hole in a section is
          // another commune's enclave: filled in, the wash claims ground the
          // numbers are not about.
          if (hole) holes.push(new Cesium.PolygonHierarchy(hole));
        }
        batch.push(new Cesium.GeometryInstance({
          id: item.id,
          geometry: new Cesium.PolygonGeometry({
            polygonHierarchy: new Cesium.PolygonHierarchy(outer, holes),
            vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
          }),
          attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(fill) },
        }));
        for (const ring of rings) {
          const positions = ringPositions(ring || []);
          if (!positions) continue;
          outlines.push(new Cesium.GeometryInstance({
            id: item.id,
            geometry: new Cesium.GroundPolylineGeometry({
              positions: [...positions, positions[0]],
              width: style.widthPx,
            }),
            attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(stroke) },
          }));
        }
      }
      drawn.push({ kind: item.kind, record: item.record, parts, bounds: polygonsBounds(parts), css: item.css });
    }
    const primitives = viewer.scene.primitives;
    for (const instances of fillsByColor.values()) {
      if (!instances.length) continue;
      const primitive = new Cesium.GroundPrimitive({
        geometryInstances: instances,
        appearance: new Cesium.PerInstanceColorAppearance({ flat: true, translucent: true }),
        classificationType,
        asynchronous: true,
      });
      fills.push(primitive);
      primitives.add(primitive);
    }
    if (outlines.length) {
      // One batch, colours per instance: safe for polylines, which cull by
      // distance to the line and not by bounding rectangle.
      outline = new Cesium.GroundPolylinePrimitive({
        geometryInstances: outlines,
        appearance: new Cesium.PolylineColorAppearance({ translucent: true }),
        classificationType,
        asynchronous: true,
      });
      primitives.add(outline);
    }
    shapes = drawn;
    pumpUntilReady(viewer.scene);
    return drawn.length;
  }

  return {
    draw,
    clear,
    /** The drawn shape under a ground point, or null. */
    shapeAt: (lon, lat) => groundShapeAt(lon, lat, shapes),
    shapes: () => shapes,
    /** What is on the globe, for the harnesses — see each layer's `getAreaDraw()`. */
    stats: () => ({
      shapes: shapes.length,
      fills: fills.length,
      ready: fills.every((fill) => fill.ready) && (!outline || outline.ready),
    }),
  };
}
