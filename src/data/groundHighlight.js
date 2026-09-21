/**
 * The ground under a selection, lit — one fill and one ring per shape,
 * clamped to whichever surface the globe is drawing.
 *
 * Written for the DVF sale card (#312) and shared since the DPE site card took
 * the same shape (2026-09-21): a click moves the card into the map key, and the
 * ground says which object that card is about. On the photoreal mesh a ground
 * classification paints every surface of the tileset inside the shape, walls
 * and roof alike, so a lit plot reads as a lit building.
 *
 * PRIMITIVES, NOT ENTITIES, AND UNPICKABLE. An entity in a scan layer's data
 * source is indexed as a card of its own (a polyline has a position), and a
 * click on the lit ground has to reach whatever is under it exactly as it did
 * before the highlight existed.
 *
 * A RING DRAPES DOWN EVERY WALL STANDING ON IT. A ground polyline on the
 * photoreal mesh paints the façades along the boundary, so the ring's colour is
 * a statement about the whole street front: the DVF learnt that with a cyan
 * ring nobody could decode. The caller picks the colour knowing that.
 *
 * @module data/groundHighlight
 */

import * as Cesium from 'cesium';
import { gpuClassificationTypeForScene } from './urbanismeGpu.js';
import { governorRequestRender } from '../renderGovernor.js';

/**
 * Frames a freshly built highlight is re-rendered for, at most, while its
 * asynchronous primitives tessellate. The globe renders on demand, and the
 * frame in which a ground primitive becomes ready is one nobody else asks for.
 */
export const GROUND_HIGHLIGHT_FRAME_CAP = 240;

/**
 * Positions for one ring, open (the closing vertex is dropped when present).
 * @param {Array<number[]>} ring `[lon, lat]` vertices, in degrees.
 * @returns {?Array<object>} Null under three vertices.
 */
export function highlightRingPositions(ring) {
  if (!Array.isArray(ring)) return null;
  const degrees = [];
  const last = ring.length - 1;
  const closed = last > 0 && ring[0]?.[0] === ring[last]?.[0] && ring[0]?.[1] === ring[last]?.[1];
  for (let i = 0; i < (closed ? last : ring.length); i += 1) {
    const point = ring[i];
    if (Array.isArray(point)) degrees.push(point[0], point[1]);
  }
  return degrees.length >= 6 ? Cesium.Cartesian3.fromDegreesArray(degrees) : null;
}

/**
 * Draw one highlight and return the handle that removes it.
 *
 * @param {object} viewer Cesium viewer.
 * @param {Array<{parts: Array<Array<Array<number[]>>>, fill?: ?object,
 *   stroke?: ?object, widthPx?: number}>} shapes `parts` is
 *   `[[outer, ...holes], ...]` in degrees; `fill` and `stroke` are Cesium
 *   colours, either of which may be absent.
 * @param {string} [tag] Render-governor tag.
 * @returns {?{clear: () => void}} Null when nothing could be drawn.
 */
export function drawGroundHighlight(viewer, shapes, tag = 'ground-highlight') {
  const scene = viewer?.scene;
  if (!scene?.primitives || !Array.isArray(shapes)) return null;
  const fills = [];
  const outlines = [];
  for (const shape of shapes) {
    for (const rings of shape?.parts || []) {
      const outer = highlightRingPositions(rings?.[0]);
      if (!outer) continue;
      if (shape.fill) {
        const holes = [];
        for (let h = 1; h < rings.length; h += 1) {
          const hole = highlightRingPositions(rings[h]);
          if (hole) holes.push(new Cesium.PolygonHierarchy(hole));
        }
        fills.push(new Cesium.GeometryInstance({
          geometry: new Cesium.PolygonGeometry({
            polygonHierarchy: new Cesium.PolygonHierarchy(outer, holes),
            vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
          }),
          attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(shape.fill) },
        }));
      }
      if (!shape.stroke) continue;
      for (const ring of rings) {
        const positions = highlightRingPositions(ring);
        if (!positions) continue;
        outlines.push(new Cesium.GeometryInstance({
          geometry: new Cesium.GroundPolylineGeometry({
            positions: [...positions, positions[0]],
            width: shape.widthPx ?? 3,
          }),
          attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(shape.stroke) },
        }));
      }
    }
  }
  if (!fills.length && !outlines.length) return null;
  const classificationType = gpuClassificationTypeForScene(scene);
  const primitives = scene.primitives;
  const drawn = [];
  if (fills.length) {
    drawn.push(primitives.add(new Cesium.GroundPrimitive({
      geometryInstances: fills,
      appearance: new Cesium.PerInstanceColorAppearance({ flat: true, translucent: true }),
      classificationType,
      allowPicking: false,
      asynchronous: true,
    })));
  }
  if (outlines.length) {
    drawn.push(primitives.add(new Cesium.GroundPolylinePrimitive({
      geometryInstances: outlines,
      appearance: new Cesium.PolylineColorAppearance({ translucent: true }),
      classificationType,
      allowPicking: false,
      asynchronous: true,
    })));
  }
  let stop = null;
  if (scene.postRender) {
    let framesLeft = GROUND_HIGHLIGHT_FRAME_CAP;
    stop = scene.postRender.addEventListener(() => {
      framesLeft -= 1;
      if (!drawn.some((primitive) => !primitive.ready) || framesLeft <= 0) {
        stop?.();
        stop = null;
        return;
      }
      governorRequestRender(`${tag}-build`);
    });
  }
  governorRequestRender(tag);
  return {
    clear() {
      stop?.();
      stop = null;
      if (!primitives.isDestroyed?.()) {
        for (const primitive of drawn) primitives.remove(primitive);
      }
      drawn.length = 0;
      governorRequestRender(`${tag}-clear`);
    },
  };
}
