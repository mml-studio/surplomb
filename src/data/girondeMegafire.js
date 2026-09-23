/**
 * @module girondeMegafire
 *
 * **Gironde · été 2026** — one closed event, replayed on the globe. The first
 * layer in this repo whose subject is a thing that already finished, and the
 * « Grands incendies » half of the « Incendies » row.
 *
 * ── WHAT IS ON SCREEN (the cinematic replay of 2026-09-23) ──────────────────
 *
 * Three glowing RINGS, one per group of local days (22-23 July, 24-25 July,
 * 26 July → 1 August), each drawn around the ground where satellites first saw
 * heat arrive during those days, inside the burnt area Copernicus EMS mapped.
 * Under them, the 9 524 NASA FIRMS thermal detections that drew those rings,
 * one dot each, in the colour of their days. Over them, EFFIS's closing
 * perimeter as a dashed line. A bar under the map replays the three stages;
 * the camera settles at a low oblique angle over the Bassin d'Arcachon; the
 * ground goes to Dusk (`nightAtlasRow.js`) on Satellite (`basemapLock.js`):
 * the forest dimmed a little, the zones and their rings glowing over it.
 *
 * The rings are built offline (`scripts/build-gironde-megafire-bands.mjs`,
 * `bands.json`); their method and its caveats live in that script's header and
 * in DATA_SOURCES.md. What this module adds is only light and time: a ring
 * appears at the end of its stage with a short flare, a detection flashes when
 * the cursor reaches it and settles to its band's colour. Nothing moves between
 * two instants that the data does not place there.
 *
 * ── « TEMPS EN 3D », THE SECOND VIEW ────────────────────────────────────────
 *
 * A switch over the key (`view: 'ground' | 'strata'`) lifts the same three
 * stages off the map: each one floats at its own height, lowest first, with
 * its zone filled and the outline of everything burnt by then glowing around
 * it; each detection rides on the level of its days. Dashed verticals drop
 * from the highest level shown to the same spots on the ground, a time axis
 * stands beside the stack with one tick per level, and the outline of what has
 * burnt so far stays faint on the ground. Height is the ORDER of the stages and
 * nothing else — its geometry, and why it is not the date to scale, live in
 * `megafireStrata.js`. The replay, the bar and the flares are the ground
 * view's, unchanged: a stage is shown whole once its last day has played.
 *
 * The levels are built the first time a reader asks for them, as plain
 * primitives in the air, and only shown or hidden afterwards.
 *
 * ── WHAT IT NO LONGER DRAWS, AND WHY ────────────────────────────────────────
 *
 * The five Copernicus fills, their fire fronts and flames, and the smoke
 * plumes. Seen side by side, the five perimeters' outer edges coincide from
 * 26 July on — five dates that read as two shapes, and a grading product that
 * draws the Landes parcel grid. The plumes were a rendering nobody measured,
 * and the approved mock has none. The pack still carries every Copernicus
 * geometry (`event.json`); the rings' outermost edge IS that footprint.
 *
 * ── WHY THIS IS NOT A SECOND `local-firms` ──────────────────────────────────
 *
 * `local-firms` draws NASA FIRMS detections from the last 24 hours anywhere on
 * Earth, live, and is empty without a server key. Switch it on over Gironde
 * today and it draws nothing — the fire has been out since 1 August 2026. The
 * two share a sensor and a row, not a subject: one is a smoke alarm, this is a
 * post-mortem.
 *
 * ── RENDERING NOTES ─────────────────────────────────────────────────────────
 *
 * ONE COLOUR PER `GroundPrimitive`: Cesium classifies a batch in one stencil
 * pass and keeps the first instance whose BOUNDING RECTANGLE holds the pixel,
 * so each band's fill is its own primitive. The rings are ground polylines,
 * which cull by distance to the line and have no such rule, but they still get
 * one primitive per band and per stroke, because the flare animates a
 * MATERIAL uniform — one write a frame — rather than every instance's colour.
 *
 * Every primitive is built once, when the pack lands, and only its `show` and
 * one uniform ever change afterwards. A replay costs a binary search and the
 * handful of detections still flaring, never a rebuild.
 */

import * as Cesium from 'cesium';
import { governorRequestRender, holdContinuousRender, releaseContinuousRender } from '../renderGovernor.js';
import { powerClassificationTypeForScene } from './powerGrid.js';
import {
  MEGAFIRE_BANDS,
  MEGAFIRE_EFFIS_COLOR,
  MEGAFIRE_FLASH_COLOR,
  MEGAFIRE_LAYER_ID,
} from './megafirePack.js';
import {
  advanceMegafireClock,
  createMegafireClock,
  megafireClockState,
  megafirePositionOf,
  seekMegafireSegment,
  setMegafirePlaying,
} from './megafireClock.js';
import { createMegafireTimeline } from './megafireTimeline.js';
import {
  MEGAFIRE_STRATA,
  MEGAFIRE_VIEWS,
  MEGAFIRE_VIEW_GROUND,
  MEGAFIRE_VIEW_STRATA,
  megafireAxisAnchor,
  megafireFramingScale,
  megafireGuidePoints,
  megafireRegionFrame,
  megafireStratumHeight,
} from './megafireStrata.js';
import {
  clearOverlaySource,
  setOverlayEntries,
  setOverlaySourceVisible,
} from '../overlays/worldOverlay.js';
import messages from './girondeMegafire.i18n.js';
import taxonomyMessages from './layerTaxonomy.i18n.js';
import { formatNumber, monthName } from '../i18n/format.js';

const EVENT_URL = new URL('./local_data/gironde_megafire_2026/event.json', import.meta.url).href;
const HOTSPOTS_URL = new URL('./local_data/gironde_megafire_2026/hotspots.json', import.meta.url).href;
const BANDS_URL = new URL('./local_data/gironde_megafire_2026/bands.json', import.meta.url).href;

/** @constant {string} Shown on the row before anything is loaded. */
const SOURCE_LABEL = 'Copernicus EMS · EFFIS · NASA FIRMS';

/** @constant {string} World-overlay source for the three date labels. */
export const MEGAFIRE_LABEL_SOURCE_ID = 'gironde-megafire-bands';
const LABEL_SOURCE_OPTIONS = Object.freeze({ cohortLimit: 3, collisionCapacity: 3, moving: false });

/** @constant {number} Ring core stroke, px. */
const RING_CORE_PX = 3.2;
/** @constant {number} Ring halo stroke, px, drawn under the core. */
const RING_HALO_PX = 15;
/** @constant {number} Halo alpha at rest. */
const RING_HALO_ALPHA = 0.32;
/**
 * @constant {number} The dark casing under a ring, px. Under Dusk the ground
 * keeps 89 % of its light, and a bright line laid bare on a sunlit pine forest
 * has no reliable background — the casing is what makes it read as an EDGE
 * (see `batched-groundprimitive-needs-one-colour`: a casing is never
 * decoration).
 */
const RING_CASING_PX = 8;
const CASING_COLOR = Cesium.Color.fromCssColorString('#140a06').withAlpha(0.6);
/** @constant {number} Halo alpha at the peak of a ring's flare. */
const RING_FLARE_ALPHA = 0.85;
/** @constant {number} How long a ring's flare lasts, wall-clock seconds. */
const RING_FLARE_SECONDS = 1.3;
/** @constant {number} EFFIS dashed outline, px. */
const EFFIS_WIDTH_PX = 1.6;

/** @constant {number} A settled detection, px. */
const POINT_PX = 2.1;
/** @constant {number} A detection at the instant it appears, px. */
const POINT_FLASH_PX = 7;
/**
 * @constant {number} A settled detection's alpha: a constellation, not a
 * carpet. 9 524 dots at 0.78 covered the eastern lobe edge to edge (first
 * capture of 2026-09-23); the rings have to stay the brightest thing.
 */
const POINT_ALPHA = 0.42;
/**
 * @constant {number} How long a detection flares, in STAGES of the replay
 * (0.12 of a six-second stage ≈ 0.7 s on screen, whatever the stage's length
 * in event time). Measured in position, not in hours, so the flare reads the
 * same in the busiest stage and the quietest.
 */
const POINT_FLASH_SPAN = 0.12;

/**
 * @constant {{heading: number, pitch: number, rangeFactor: number, shift: number}}
 * The arrival: looking north-north-east from above the Bassin d'Arcachon, low
 * enough that the rings read as a landscape and not as a diagram — the
 * approved mock's framing. `rangeFactor` multiplies the region's bounding
 * radius; `shift` slides the aim to the right by that share of the radius, so
 * the scar sits in the part of the screen the key does not cover (the key
 * takes the right fifth of a desktop window, the layer pills the left eighth).
 */
const ARRIVAL = Object.freeze({ heading: 16, pitch: -34, rangeFactor: 2.65, shift: 0.16 });

/**
 * @constant {{heading: number, pitch: number, rangeFactor: number, shift: number}}
 * The same look for « Temps en 3D », lower, so the levels stand apart instead
 * of printing over one another as they do from above. Framed on the whole
 * stack, ground to top level.
 */
const STRATA_ARRIVAL = Object.freeze({ heading: 16, pitch: -24, rangeFactor: 3.4, shift: 0.1 });

/** @constant {number} A level's outline, px. */
const STRATUM_CORE_PX = 2.4;
/** @constant {number} Its glow, px, drawn under the outline. */
const STRATUM_GLOW_PX = 12;
/** @constant {number} Glow alpha at rest, and at the peak of the flare. */
const STRATUM_GLOW_ALPHA = 0.4;
const STRATUM_FLARE_ALPHA = 1;
/**
 * @constant {number} A level's fill alpha, as a share of the ground fill's.
 * In the air nothing is under the fill but the ground far below, and three
 * of them overlap on screen.
 */
const STRATUM_FILL_SHARE = 0.75;
/** @constant {string} The rulers: verticals, axis and the ground outline. */
const RULER_COLOR = '#f3ead8';
/** @constant {number} Dashed verticals, px and alpha. */
const GUIDE_PX = 1.2;
const GUIDE_ALPHA = 0.42;
/** @constant {number} The axis, px and alpha, and how far it rises over the top tick. */
const AXIS_PX = 1.6;
const AXIS_ALPHA = 0.6;
const AXIS_OVERSHOOT = 0.3;
/** @constant {number} An axis tick, px. */
const AXIS_TICK_PX = 9;
/** @constant {number} The ground outline of what has burnt so far, px and alpha. */
const GHOST_PX = 1.6;
const GHOST_ALPHA = 0.5;

let _viewer = null;
let _enabled = false;
let _event = null;
let _hotspots = null;
let _bands = null;
/** @type {?ReturnType<createMegafireClock>} */
let _clock = null;
let _loading = false;
let _error = null;
let _status = 'idle';
let _tickRemover = null;
let _lastTickMs = null;
/** Whether the flare holds the render loop open. */
let _flareHeld = false;
const FLARE_HOLD = `${MEGAFIRE_LAYER_ID}:flare`;
let _classificationType = Cesium.ClassificationType.BOTH;

/** @type {Array<?Cesium.GroundPrimitive>} One fill per band. */
let _fills = [];
/** @type {Array<{halo: ?Cesium.GroundPolylinePrimitive, core: ?Cesium.GroundPolylinePrimitive, haloMaterial: ?Cesium.Material}>} */
let _rings = [];
/** @type {?Cesium.GroundPolylinePrimitive} */
let _effis = null;
/** @type {?Cesium.PointPrimitiveCollection} */
let _points = null;
/**
 * Detections sorted by their paced position, parallel to `_points` by index.
 * @type {Array<{ms: number, position: number, band: number, lon: number, lat: number}>}
 */
let _pointMeta = [];
/** How many of `_pointMeta` are shown — always a prefix, since it is sorted. */
let _revealed = 0;
/** Indices still flaring. */
let _flaring = new Set();
/** Rings drawn — `completed` of the clock state they were drawn for. */
let _ringsShown = 0;
/** The view and stage count the date labels were last published for. */
let _labelsKey = '';
/** Wall-clock second each band's ring started to flare, or null. */
let _ringFlareAt = [];
/** @type {Array<?Cesium.BoundingSphere>} Region of each band, for the camera. */
let _bandSpheres = [];
/** @type {?ReturnType<createMegafireTimeline>} */
let _timeline = null;
/** @type {?(() => void)} Manager callback: "this row's controls changed". */
let _rowControlsListener = null;
/** The view the replay is drawn in: on the ground, or « Temps en 3D ». */
let _view = MEGAFIRE_VIEW_GROUND;
/**
 * « Temps en 3D », built the first time it is asked for; one entry per band
 * in every array.
 * @type {?{
 *   fills: Array<?Cesium.Primitive>,
 *   glows: Array<{primitive: ?Cesium.Primitive, material: ?Cesium.Material}>,
 *   cores: Array<?Cesium.Primitive>,
 *   guides: Array<?Cesium.Primitive>,
 *   axes: Array<?Cesium.Primitive>,
 *   ghosts: Array<?Cesium.GroundPolylinePrimitive>,
 *   ticks: ?Cesium.PointPrimitiveCollection,
 *   axis: ?{lon: number, lat: number},
 *   frame: ?Cesium.BoundingSphere,
 * }}
 */
let _strata = null;

/** The overlay host, behind the same seam the other overlay layers use. */
const _overlayHost = {
  setEntries: setOverlayEntries,
  setVisible: setOverlaySourceVisible,
  clearSource: clearOverlaySource,
};

const _scratchColor = new Cesium.Color();
const _flashColor = Cesium.Color.fromCssColorString(MEGAFIRE_FLASH_COLOR);
const _bandPointColors = MEGAFIRE_BANDS.map((band) => Cesium.Color.fromCssColorString(band.point)
  .withAlpha(POINT_ALPHA));

/** @returns {boolean} Whether the page has a DOM to hang the replay bar on. */
function hasDom() {
  return typeof document !== 'undefined' && Boolean(document.body);
}

/** @returns {boolean} Whether the reader asked the system for less motion. */
function reducedMotion() {
  try {
    return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  } catch {
    return false;
  }
}

/** @returns {boolean} Whether ground polylines can be drawn at all here. */
let _groundLinesSupported = null;
function groundLinesSupported() {
  if (_groundLinesSupported === null && _viewer?.scene) {
    try {
      _groundLinesSupported = Cesium.GroundPolylinePrimitive.isSupported(_viewer.scene);
    } catch {
      _groundLinesSupported = false;
    }
    if (!_groundLinesSupported) {
      console.warn('[Data:Gironde] GroundPolylinePrimitive unsupported — rings and the EFFIS outline are off');
    }
  }
  return _groundLinesSupported !== false;
}

/**
 * Flat `[lon, lat, ...]` → Cartesian positions, closed when asked.
 * @param {ArrayLike<number>} flat
 * @param {boolean} [close]
 * @param {number} [height] - Metres above the ellipsoid.
 * @returns {Cesium.Cartesian3[]}
 */
function ringPositions(flat, close = false, height = 0) {
  const positions = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    positions.push(Cesium.Cartesian3.fromDegrees(flat[i], flat[i + 1], height));
  }
  if (close && positions.length > 2) positions.push(positions[0]);
  return positions;
}

/** The label of a band, by id and length, in the page's language. */
function bandLabel(id, length = 'long') {
  return messages().bands[id]?.[length] ?? id;
}

// --- Building the scene, once ------------------------------------------------

/** A band's style, the last one standing in for any band past the table. */
function bandStyle(index) {
  return MEGAFIRE_BANDS[index] ?? MEGAFIRE_BANDS[MEGAFIRE_BANDS.length - 1];
}

/**
 * A band's own zone as polygon instances of one colour — draped on the ground
 * when `height` is absent, flat at `height` metres otherwise.
 */
function zoneInstances(band, color, kind, height) {
  const instances = [];
  (band.band || []).forEach((polygon, polygonIndex) => {
    const outer = ringPositions(polygon[0]);
    if (outer.length < 3) return;
    const holes = polygon.slice(1)
      .map((ring) => ringPositions(ring))
      .filter((hole) => hole.length >= 3)
      .map((hole) => new Cesium.PolygonHierarchy(hole));
    instances.push(new Cesium.GeometryInstance({
      id: `${MEGAFIRE_LAYER_ID}:${kind}:${band.id}:${polygonIndex}`,
      geometry: new Cesium.PolygonGeometry({
        polygonHierarchy: new Cesium.PolygonHierarchy(outer, holes),
        ...(height === undefined ? {} : { height }),
        vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
      }),
      attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(color) },
    }));
  });
  return instances;
}

/**
 * Every boundary of a band's cumulative region, one instance per ring, its
 * geometry made by `geometryOf(positions)`.
 */
function regionRingInstances(band, kind, height, geometryOf) {
  const instances = [];
  (band.region || []).forEach((polygon, polygonIndex) => {
    polygon.forEach((ring, ringIndex) => {
      const positions = ringPositions(ring, true, height);
      if (positions.length < 3) return;
      instances.push(new Cesium.GeometryInstance({
        id: `${MEGAFIRE_LAYER_ID}:${kind}:${band.id}:${polygonIndex}:${ringIndex}`,
        geometry: geometryOf(positions),
      }));
    });
  });
  return instances;
}

/** One band's translucent fill: its own primitive, its own single colour. */
function buildFill(band, style, index) {
  const color = Cesium.Color.fromCssColorString(style.fill).withAlpha(style.fillAlpha);
  const instances = zoneInstances(band, color, 'fill');
  if (!instances.length) return null;
  const primitive = new Cesium.GroundPrimitive({
    geometryInstances: instances,
    classificationType: _classificationType,
    appearance: new Cesium.PerInstanceColorAppearance({ flat: true, translucent: true }),
    asynchronous: true,
    // Kept for the harness: it reads the one colour back off the live batch.
    releaseGeometryInstances: false,
  });
  primitive.show = false;
  primitive[Symbol.for('surplomb.megafire.band')] = index;
  return _viewer.scene.groundPrimitives.add(primitive);
}

/** One stroke of a band's ring on the ground: every boundary of its cumulative region. */
function buildStroke(band, color, width, kind) {
  const instances = regionRingInstances(band, kind, 0,
    (positions) => new Cesium.GroundPolylineGeometry({ positions, width }));
  if (!instances.length) return { primitive: null, material: null };
  const material = Cesium.Material.fromType('Color', { color });
  const primitive = new Cesium.GroundPolylinePrimitive({
    geometryInstances: instances,
    classificationType: _classificationType,
    appearance: new Cesium.PolylineMaterialAppearance({ material }),
    asynchronous: true,
    releaseGeometryInstances: false,
  });
  primitive.show = false;
  return { primitive: _viewer.scene.groundPrimitives.add(primitive), material };
}

/** EFFIS's closing perimeter, dashed: the edge a different method drew later. */
function buildEffis() {
  const rings = _event?.effis?.main?.rings;
  if (!rings?.length || !groundLinesSupported()) return null;
  const instances = [];
  rings.forEach((polygon, index) => {
    // Outer ring only: an EFFIS hole is an artefact of a MODIS burnt-area
    // classifier, not an observed island of green.
    const positions = ringPositions(polygon[0], true);
    if (positions.length < 3) return;
    instances.push(new Cesium.GeometryInstance({
      id: `${MEGAFIRE_LAYER_ID}:effis:${index}`,
      geometry: new Cesium.GroundPolylineGeometry({ positions, width: EFFIS_WIDTH_PX }),
    }));
  });
  if (!instances.length) return null;
  const primitive = new Cesium.GroundPolylinePrimitive({
    geometryInstances: instances,
    classificationType: _classificationType,
    appearance: new Cesium.PolylineMaterialAppearance({
      material: Cesium.Material.fromType('PolylineDash', {
        color: Cesium.Color.fromCssColorString(MEGAFIRE_EFFIS_COLOR).withAlpha(0.75),
        gapColor: Cesium.Color.TRANSPARENT,
        dashLength: 14,
      }),
    }),
    asynchronous: true,
    releaseGeometryInstances: false,
  });
  primitive.show = false;
  return _viewer.scene.groundPrimitives.add(primitive);
}

/** A bounding sphere around every vertex of a band's region. */
function regionSphere(band) {
  const positions = [];
  for (const polygon of band.region || []) {
    const outer = polygon[0] || [];
    for (let i = 0; i + 1 < outer.length; i += 2) {
      positions.push(Cesium.Cartesian3.fromDegrees(outer[i], outer[i + 1]));
    }
  }
  return positions.length ? Cesium.BoundingSphere.fromPoints(positions) : null;
}

/**
 * Build every primitive the replay will ever show, all hidden.
 *
 * INSERTION ORDER IS DRAW ORDER among ground primitives, and it is what makes
 * each zone read as one closed shape. The regions are cumulative, so where the
 * fire stopped early its rings COINCIDE: the edge of the 24-25 July zone on
 * the north-west is also the edge of the whole scar. Drawn in date order, the
 * latest ring covered every earlier one along those stretches and the orange
 * zone had no edge of its own there (capture of 2026-09-23). So the rings go
 * down LATEST FIRST: a shared stretch shows the earliest zone it closes, and
 * every zone keeps a whole outline in its own colour. Strokes are layered by
 * kind across bands — every casing, then every halo, then every core — so no
 * halo ever washes over another band's core.
 */
function buildScene() {
  if (!_viewer?.scene?.groundPrimitives || !_bands) return;
  const lines = groundLinesSupported();
  _fills = [];
  _rings = _bands.bands.map(() => ({ casing: null, halo: null, core: null, haloMaterial: null }));
  _bandSpheres = [];
  _bands.bands.forEach((band, index) => {
    _fills.push(buildFill(band, bandStyle(index), index));
    _bandSpheres.push(regionSphere(band));
  });
  if (lines) {
    const latestFirst = _bands.bands.map((band, index) => ({ band, index })).reverse();
    for (const { band, index } of latestFirst) {
      _rings[index].casing = buildStroke(band, CASING_COLOR, RING_CASING_PX, 'casing').primitive;
    }
    for (const { band, index } of latestFirst) {
      const color = Cesium.Color.fromCssColorString(bandStyle(index).ring);
      const halo = buildStroke(band, color.withAlpha(RING_HALO_ALPHA), RING_HALO_PX, 'halo');
      _rings[index].halo = halo.primitive;
      _rings[index].haloMaterial = halo.material;
    }
    for (const { band, index } of latestFirst) {
      const color = Cesium.Color.fromCssColorString(bandStyle(index).ring);
      _rings[index].core = buildStroke(band, color.withAlpha(0.97), RING_CORE_PX, 'ring').primitive;
    }
  }
  _effis = buildEffis();
  _ringFlareAt = _bands.bands.map(() => null);
  _ringsShown = 0;
  _labelsKey = '';
}

/** Tear down every ground primitive this layer owns. */
function clearScene() {
  const ground = _viewer?.scene?.groundPrimitives;
  const drop = (primitive) => {
    if (!primitive) return;
    if (ground?.contains?.(primitive)) ground.remove(primitive);
    else if (!primitive.isDestroyed?.()) primitive.destroy?.();
  };
  _fills.forEach(drop);
  for (const ring of _rings) {
    drop(ring.casing);
    drop(ring.halo);
    drop(ring.core);
  }
  drop(_effis);
  _fills = [];
  _rings = [];
  _effis = null;
  _ringsShown = 0;
}

// --- « Temps en 3D », built the first time it is asked for -------------------

/**
 * Where a primitive in the air says what it is: a built `Primitive` drops its
 * instances and their ids, and a minified constructor name reads `$o`.
 */
export const MEGAFIRE_AIR_ROLE = Symbol.for('surplomb.megafire.air');

/** A primitive in the air, hidden, added to the scene, tagged with its role. */
function addAirPrimitive(instances, appearance, role) {
  if (!instances.length) return null;
  const primitive = new Cesium.Primitive({
    geometryInstances: instances,
    appearance,
    // A few hundred vertices a level: built on the frame it is first shown,
    // where a worker round-trip would leave that first frame empty.
    asynchronous: false,
  });
  primitive.show = false;
  primitive[MEGAFIRE_AIR_ROLE] = role;
  return _viewer.scene.primitives.add(primitive);
}

/** A straight line in the air — the chart's rulers, and a level's outline. */
function airLine(positions, width) {
  return new Cesium.PolylineGeometry({
    positions,
    width,
    arcType: Cesium.ArcType.NONE,
    vertexFormat: Cesium.PolylineMaterialAppearance.VERTEX_FORMAT,
  });
}

/** One level: its band's own zone filled, and its cumulative outline glowing. */
function buildStratum(band, index, height) {
  const style = bandStyle(index);
  const ringColor = Cesium.Color.fromCssColorString(style.ring);
  const fillColor = Cesium.Color.fromCssColorString(style.fill)
    .withAlpha(style.fillAlpha * STRATUM_FILL_SHARE);
  const fill = addAirPrimitive(
    zoneInstances(band, fillColor, 'stratum-fill', height),
    // Not `closed`: a level is a sheet, seen from above and from below.
    new Cesium.PerInstanceColorAppearance({ flat: true, translucent: true, closed: false }),
    `stratum-fill:${band.id}`,
  );
  const glowMaterial = Cesium.Material.fromType('PolylineGlow', {
    color: ringColor.withAlpha(STRATUM_GLOW_ALPHA),
    glowPower: 0.2,
    taperPower: 1,
  });
  const glow = addAirPrimitive(
    regionRingInstances(band, 'stratum-glow', height, (positions) => airLine(positions, STRATUM_GLOW_PX)),
    new Cesium.PolylineMaterialAppearance({ material: glowMaterial }),
    `stratum-glow:${band.id}`,
  );
  const core = addAirPrimitive(
    regionRingInstances(band, 'stratum-ring', height, (positions) => airLine(positions, STRATUM_CORE_PX)),
    new Cesium.PolylineMaterialAppearance({
      material: Cesium.Material.fromType('Color', { color: ringColor.withAlpha(0.97) }),
    }),
    `stratum-ring:${band.id}`,
  );
  return { fill, glow: { primitive: glow, material: glow ? glowMaterial : null }, core };
}

/** Dashed verticals from a level's silhouette down to the same spots on the ground. */
function buildGuides(band, height, ruler) {
  const instances = megafireGuidePoints(band.region).map((point, index) => new Cesium.GeometryInstance({
    id: `${MEGAFIRE_LAYER_ID}:guide:${band.id}:${index}`,
    geometry: airLine([
      Cesium.Cartesian3.fromDegrees(point.lon, point.lat, 0),
      Cesium.Cartesian3.fromDegrees(point.lon, point.lat, height),
    ], GUIDE_PX),
  }));
  return addAirPrimitive(instances, new Cesium.PolylineMaterialAppearance({
    material: Cesium.Material.fromType('PolylineDash', {
      color: ruler.withAlpha(GUIDE_ALPHA),
      gapColor: Cesium.Color.TRANSPARENT,
      dashLength: 10,
    }),
  }), `guide:${band.id}`);
}

/** The time axis, from the ground to just over the level `height`. */
function buildAxis(anchor, height, band, ruler) {
  const top = height + MEGAFIRE_STRATA.stepM * AXIS_OVERSHOOT;
  return addAirPrimitive([new Cesium.GeometryInstance({
    id: `${MEGAFIRE_LAYER_ID}:axis:${band.id}`,
    geometry: airLine([
      Cesium.Cartesian3.fromDegrees(anchor.lon, anchor.lat, 0),
      Cesium.Cartesian3.fromDegrees(anchor.lon, anchor.lat, top),
    ], AXIS_PX),
  })], new Cesium.PolylineMaterialAppearance({
    material: Cesium.Material.fromType('Color', { color: ruler.withAlpha(AXIS_ALPHA) }),
  }), `axis:${band.id}`);
}

/** What has burnt by the end of a band, as a faint outline on the ground. */
function buildGhost(band, ruler) {
  const instances = regionRingInstances(band, 'ghost', 0,
    (positions) => new Cesium.GroundPolylineGeometry({ positions, width: GHOST_PX }));
  if (!instances.length) return null;
  const primitive = new Cesium.GroundPolylinePrimitive({
    geometryInstances: instances,
    classificationType: _classificationType,
    appearance: new Cesium.PolylineMaterialAppearance({
      material: Cesium.Material.fromType('Color', { color: ruler.withAlpha(GHOST_ALPHA) }),
    }),
    asynchronous: true,
    releaseGeometryInstances: false,
  });
  primitive.show = false;
  return _viewer.scene.groundPrimitives.add(primitive);
}

/** Build every primitive « Temps en 3D » will ever show, all hidden. */
function buildStrata() {
  if (_strata || !_viewer?.scene?.primitives || !_bands) return;
  const bands = _bands.bands;
  const ruler = Cesium.Color.fromCssColorString(RULER_COLOR);
  const last = bands[bands.length - 1];
  const axis = megafireAxisAnchor(last?.region, STRATA_ARRIVAL.heading);
  const ground = groundLinesSupported() && Boolean(_viewer.scene.groundPrimitives);
  const ticks = new Cesium.PointPrimitiveCollection();
  ticks.show = false;
  const top = megafireStratumHeight(bands.length - 1);
  // The camera's sphere: the widest region, ground to top level.
  const frame = last ? megafireRegionFrame(last.region, top / 2, top / 2) : null;
  _strata = {
    fills: [],
    glows: [],
    cores: [],
    guides: [],
    axes: [],
    ghosts: [],
    ticks: null,
    axis,
    frame: frame
      ? new Cesium.BoundingSphere(Cesium.Cartesian3.fromDegrees(frame.lon, frame.lat, frame.heightM), frame.radiusM)
      : null,
  };
  bands.forEach((band, index) => {
    const height = megafireStratumHeight(index);
    const level = buildStratum(band, index, height);
    _strata.fills.push(level.fill);
    _strata.glows.push(level.glow);
    _strata.cores.push(level.core);
    _strata.guides.push(buildGuides(band, height, ruler));
    _strata.axes.push(axis ? buildAxis(axis, height, band, ruler) : null);
    _strata.ghosts.push(ground ? buildGhost(band, ruler) : null);
    if (axis) {
      ticks.add({
        position: Cesium.Cartesian3.fromDegrees(axis.lon, axis.lat, height),
        color: Cesium.Color.fromCssColorString(bandStyle(index).ring),
        pixelSize: AXIS_TICK_PX,
        outlineColor: CASING_COLOR,
        outlineWidth: 2,
        show: false,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      });
    }
  });
  _strata.ticks = _viewer.scene.primitives.add(ticks);
}

/** Tear down « Temps en 3D ». */
function clearStrata() {
  if (!_strata) return;
  const air = _viewer?.scene?.primitives;
  const ground = _viewer?.scene?.groundPrimitives;
  const drop = (collection, primitive) => {
    if (!primitive) return;
    if (collection?.contains?.(primitive)) collection.remove(primitive);
    else if (!primitive.isDestroyed?.()) primitive.destroy?.();
  };
  [
    ..._strata.fills,
    ..._strata.glows.map((glow) => glow.primitive),
    ..._strata.cores,
    ..._strata.guides,
    ..._strata.axes,
    _strata.ticks,
  ].forEach((primitive) => drop(air, primitive));
  _strata.ghosts.forEach((primitive) => drop(ground, primitive));
  _strata = null;
}

/**
 * One point primitive per detection, all hidden, sorted by the instant the
 * replay reaches them — so "what is shown" is always a prefix of the list and
 * a cursor move is a binary search, forwards or backwards.
 */
function buildPoints() {
  if (!_points || !_hotspots || !_clock || !_bands) return;
  _points.removeAll();
  const epoch = Date.parse(_hotspots.epoch);
  const column = Object.fromEntries(_hotspots.columns.map((name, i) => [name, i]));
  const ends = _bands.bands.map((band) => Date.parse(band.to));
  const rows = _hotspots.rows.map((row) => {
    const ms = epoch + row[column.minutes] * 60_000;
    let band = ends.findIndex((end) => ms <= end);
    if (band < 0) band = ends.length - 1;
    return { lon: row[column.lon], lat: row[column.lat], ms, band };
  }).sort((a, b) => a.ms - b.ms);
  _pointMeta = rows.map((row) => {
    _points.add({
      position: Cesium.Cartesian3.fromDegrees(row.lon, row.lat),
      color: _bandPointColors[row.band] ?? _bandPointColors[0],
      pixelSize: POINT_PX,
      show: false,
      // Drawn over the ground rather than into it: a 375 m pixel has no
      // height worth testing, and a ring must never hide the heat it is
      // drawn around.
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    });
    return {
      ms: row.ms,
      position: megafirePositionOf(_clock, row.ms),
      band: row.band,
      lon: row.lon,
      lat: row.lat,
    };
  });
  _revealed = 0;
  _flaring = new Set();
}

const _scratchPosition = new Cesium.Cartesian3();

/**
 * Put every detection where the current view draws it: on the ground, or on
 * the level of its days. A point copies the position it is given, so one
 * scratch serves all 9 524.
 */
function placePoints() {
  if (!_points || !_bands || !_pointMeta.length) return;
  const strata = _view === MEGAFIRE_VIEW_STRATA;
  const heights = _bands.bands.map((band, index) => (strata ? megafireStratumHeight(index) : 0));
  for (let i = 0; i < _pointMeta.length; i += 1) {
    const meta = _pointMeta[i];
    _points.get(i).position = Cesium.Cartesian3.fromDegrees(
      meta.lon, meta.lat, heights[meta.band] ?? 0, undefined, _scratchPosition,
    );
  }
}

/** Make what is drawn match `_view`: the levels built if asked for, the dots moved. */
function applyView() {
  if (_view === MEGAFIRE_VIEW_STRATA) buildStrata();
  placePoints();
}

// --- Drawing an instant ------------------------------------------------------

/** How many detections sit at or before a paced position. */
function revealedAt(position) {
  let lo = 0;
  let hi = _pointMeta.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (_pointMeta[mid].position <= position + 1e-9) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Put a detection back to its settled look. */
function settlePoint(index) {
  const point = _points.get(index);
  point.color = _bandPointColors[_pointMeta[index].band] ?? _bandPointColors[0];
  point.pixelSize = POINT_PX;
}

/**
 * Show exactly the detections the cursor has reached, and flare the fresh ones.
 * @param {number} position - Paced cursor.
 * @param {boolean} flare - Whether newly reached detections flash (playback)
 *   or appear already settled (a seek, the first paint).
 */
function paintPoints(position, flare) {
  if (!_points || !_pointMeta.length) return;
  const target = revealedAt(position);
  if (target > _revealed) {
    for (let i = _revealed; i < target; i += 1) {
      const point = _points.get(i);
      point.show = true;
      if (flare) _flaring.add(i);
      else settlePoint(i);
    }
  } else if (target < _revealed) {
    for (let i = target; i < _revealed; i += 1) {
      _points.get(i).show = false;
      _flaring.delete(i);
    }
  }
  _revealed = target;
  for (const index of _flaring) {
    const age = position - _pointMeta[index].position;
    if (!flare || age >= POINT_FLASH_SPAN || age < 0) {
      settlePoint(index);
      _flaring.delete(index);
      continue;
    }
    const strength = 1 - age / POINT_FLASH_SPAN;
    const point = _points.get(index);
    const base = _bandPointColors[_pointMeta[index].band] ?? _bandPointColors[0];
    point.color = Cesium.Color.lerp(base, _flashColor, strength, _scratchColor);
    point.pixelSize = POINT_PX + (POINT_FLASH_PX - POINT_PX) * strength;
  }
}

/** Show or hide a primitive that may not exist. */
function setShown(primitive, shown) {
  if (primitive && primitive.show !== shown) primitive.show = shown;
}

/**
 * Show the rings (and fills and labels) of every completed stage, in the
 * current view: on the ground, or as levels in the air.
 * @param {number} completed - Stages the cursor has reached the end of.
 * @param {boolean} flare - Whether a ring that just appeared flares.
 * @param {number} nowSec - Wall clock, seconds.
 */
function paintRings(completed, flare, nowSec) {
  const count = _bands?.bands.length ?? 0;
  const strata = _view === MEGAFIRE_VIEW_STRATA;
  for (let index = 0; index < count; index += 1) {
    const shown = index < completed;
    const onGround = shown && !strata;
    const inAir = shown && strata;
    setShown(_fills[index], onGround);
    const ring = _rings[index];
    setShown(ring?.casing, onGround);
    setShown(ring?.halo, onGround);
    setShown(ring?.core, onGround);
    if (_strata) {
      // The rulers belong to the highest level shown: every level is inside
      // the one above it, so its silhouette is the stack's.
      const top = inAir && index === completed - 1;
      setShown(_strata.fills[index], inAir);
      setShown(_strata.glows[index]?.primitive, inAir);
      setShown(_strata.cores[index], inAir);
      setShown(_strata.guides[index], top);
      setShown(_strata.axes[index], top);
      setShown(_strata.ghosts[index], top);
      if (_strata.ticks && index < _strata.ticks.length) _strata.ticks.get(index).show = inAir;
    }
    if (shown && index >= _ringsShown && flare) _ringFlareAt[index] = nowSec;
    if (!shown) _ringFlareAt[index] = null;
  }
  if (_strata?.ticks) _strata.ticks.show = strata && completed > 0;
  // The dashed EFFIS line is the END state's: it is an edge drawn after the
  // last survey, and on screen before then it would read as a forecast.
  if (_effis) _effis.show = completed >= count && count > 0;
  const labelsKey = `${_view}:${completed}`;
  _ringsShown = completed;
  if (labelsKey !== _labelsKey) {
    _labelsKey = labelsKey;
    publishLabels();
  }
}

/** A flare's strength at `age` seconds: up fast, down slow — a flare, not a pulse. */
function flareStrength(age) {
  const rise = 0.18;
  const k = age < rise ? age / rise : 1 - (age - rise) / (RING_FLARE_SECONDS - rise);
  return Math.max(0, k);
}

/** Write a halo's alpha between its rest and its peak. */
function setFlare(material, rest, peak, strength) {
  const color = material?.uniforms?.color;
  if (!color) return;
  const alpha = rest + (peak - rest) * strength;
  if (color.alpha !== alpha) color.alpha = alpha;
}

/**
 * Advance every ring flare, on the ground and in the air; returns whether one
 * is still running.
 * @param {number} nowSec
 * @returns {boolean}
 */
function stepFlares(nowSec) {
  let running = false;
  for (let index = 0; index < _ringFlareAt.length; index += 1) {
    const started = _ringFlareAt[index];
    let strength = 0;
    if (started !== null && started !== undefined) {
      const age = nowSec - started;
      if (age >= RING_FLARE_SECONDS || age < 0) {
        _ringFlareAt[index] = null;
      } else {
        strength = flareStrength(age);
        running = true;
      }
    }
    setFlare(_rings[index]?.haloMaterial, RING_HALO_ALPHA, RING_FLARE_ALPHA, strength);
    setFlare(_strata?.glows[index]?.material, STRATUM_GLOW_ALPHA, STRATUM_FLARE_ALPHA, strength);
  }
  return running;
}

/**
 * The three date labels, for the stages drawn: pinned on the rings on the
 * ground, and on the time axis's ticks in « Temps en 3D ».
 */
function publishLabels() {
  if (!_overlayHost || !_bands || !hasDom()) return;
  const strata = _view === MEGAFIRE_VIEW_STRATA;
  const axis = strata ? _strata?.axis : null;
  try {
    const entries = [];
    _bands.bands.forEach((band, index) => {
      if (index >= _ringsShown) return;
      let position = null;
      if (axis) position = Cesium.Cartesian3.fromDegrees(axis.lon, axis.lat, megafireStratumHeight(index));
      else if (!strata && band.anchor) position = Cesium.Cartesian3.fromDegrees(band.anchor.lon, band.anchor.lat);
      if (!position) return;
      entries.push({
        id: `${MEGAFIRE_LAYER_ID}:label:${band.id}`,
        position,
        variant: 'label',
        title: bandLabel(band.id, 'long'),
        accent: bandStyle(index).ring,
        priority: 1000 - index,
        collisionGroup: 'ambient-label',
        paintLane: 'ambient-label',
        interactive: false,
        edgeFade: 'keyhole',
        horizonCull: true,
        terrainOcclusion: false,
        // Beside its tick, on the sea side of the axis; over its ring on the ground.
        gapPx: axis ? 10 : 12,
        verticalOnly: !axis,
        placement: axis ? 'left' : 'above',
      });
    });
    _overlayHost.setEntries(MEGAFIRE_LABEL_SOURCE_ID, entries, LABEL_SOURCE_OPTIONS);
    _overlayHost.setVisible?.(MEGAFIRE_LABEL_SOURCE_ID, _enabled);
  } catch (error) {
    console.warn('[Data:Gironde] labels unavailable:', error?.message || error);
  }
}

/** Repaint everything the cursor governs. */
function syncToCursor({ flare = false } = {}) {
  if (!_clock || !_enabled) return;
  const state = megafireClockState(_clock);
  const nowSec = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
  paintPoints(state.position, flare && state.playing);
  paintRings(state.completed, flare, nowSec);
  updateTimeline(state);
  governorRequestRender('gironde-megafire');
}

// --- The replay bar ------------------------------------------------------------

/** A local calendar day, in the page's language: « 24 juillet 2026 ». */
function localDay(instantMs) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris', year: 'numeric', month: 'numeric', day: 'numeric',
  }).formatToParts(new Date(instantMs)).map((part) => [part.type, part.value]));
  return messages().replay.day(Number(parts.day), monthName(Number(parts.month) - 1), Number(parts.year));
}

/** What the bar says for a clock state. */
function timelineState(state) {
  const m = messages().replay;
  let detail;
  if (state.atEnd) detail = m.end(formatNumber(_pointMeta.length));
  else if (state.atStart) detail = m.start;
  else detail = m.running(formatNumber(_revealed));
  return {
    position: state.position,
    playing: state.playing,
    atStart: state.atStart,
    atEnd: state.atEnd,
    heading: localDay(state.cursorMs),
    detail,
  };
}

function updateTimeline(state) {
  if (!_timeline) return;
  try {
    _timeline.update(timelineState(state));
  } catch (error) {
    console.warn('[Data:Gironde] replay bar:', error?.message || error);
  }
}

function mountTimeline() {
  if (!hasDom() || !_bands || _timeline) return;
  _timeline = createMegafireTimeline({
    segments: _bands.bands.map((band, index) => ({
      id: band.id,
      label: bandLabel(band.id, 'short'),
      color: (MEGAFIRE_BANDS[index] ?? MEGAFIRE_BANDS[0]).ring,
    })),
    onCommand: runCommand,
  });
  _timeline.mount();
}

function unmountTimeline() {
  if (!_timeline) return;
  _timeline.destroy();
  _timeline = null;
}

/**
 * A press on the bar.
 * @param {{type: string, index?: number}} command
 */
function runCommand(command) {
  if (!_clock || !_enabled) return;
  const state = megafireClockState(_clock);
  const count = _clock.segments.length;
  switch (command?.type) {
    case 'toggle':
      girondeMegafireLayer.setParams({ play: !state.playing });
      return;
    case 'prev': {
      // From inside a stage, « previous » is that stage's START — the end of
      // the one before — and from a stop it is the stop before.
      const held = state.completed === state.position ? state.completed - 1 : state.segmentIndex;
      girondeMegafireLayer.setParams({ band: Math.max(0, held - 1), frame: true });
      return;
    }
    case 'next': {
      const next = state.completed === state.position ? state.completed : state.segmentIndex;
      girondeMegafireLayer.setParams({ band: Math.min(count - 1, next), frame: true });
      return;
    }
    case 'seek':
      girondeMegafireLayer.setParams({ band: command.index, frame: true });
      return;
    default:
  }
}

// --- The camera -------------------------------------------------------------

/**
 * Ease the camera over a band's region, from the arrival angle.
 * @param {?Cesium.BoundingSphere} sphere
 * @param {number} [duration] - Seconds; 0 under reduced motion.
 * @param {{heading: number, pitch: number, rangeFactor: number, shift: number}} [arrival]
 */
function frameSphere(sphere, duration = 1.6, arrival = ARRIVAL) {
  const camera = _viewer?.camera;
  if (!camera || !sphere) return;
  camera.cancelFlight?.();
  // Aim a little to the RIGHT of the region (in the camera's own frame), so the
  // region lands a little to the left of the screen's centre.
  const heading = Cesium.Math.toRadians(arrival.heading);
  const along = sphere.radius * arrival.shift;
  const frame = Cesium.Transforms.eastNorthUpToFixedFrame(sphere.center);
  const aim = Cesium.Matrix4.multiplyByPoint(
    frame,
    new Cesium.Cartesian3(Math.cos(heading) * along, -Math.sin(heading) * along, 0),
    new Cesium.Cartesian3(),
  );
  camera.flyToBoundingSphere(new Cesium.BoundingSphere(aim, sphere.radius), {
    offset: new Cesium.HeadingPitchRange(
      heading,
      Cesium.Math.toRadians(arrival.pitch),
      Math.max(6000, sphere.radius * arrival.rangeFactor),
    ),
    duration: reducedMotion() ? 0 : duration,
  });
}

/**
 * Frame the stage `index` (default: the last, the whole fire) in the current
 * view. On the ground, that stage's region. In « Temps en 3D », always the
 * whole stack: the stages still to play rise ABOVE the ones shown, and a
 * camera closed in on the first level lost the next two off the top of the
 * screen as soon as the replay resumed (capture of 2026-09-23). The empty
 * height over a partial stack is where the rest of the fire will appear.
 * @param {number} [index]
 * @param {number} [duration]
 */
function frameStage(index, duration) {
  if (_view === MEGAFIRE_VIEW_STRATA && _strata) {
    const canvas = _viewer?.scene?.canvas;
    const scale = megafireFramingScale(canvas?.clientWidth, canvas?.clientHeight);
    frameSphere(_strata.frame, duration, { ...STRATA_ARRIVAL, rangeFactor: STRATA_ARRIVAL.rangeFactor * scale });
    return;
  }
  const at = Number.isInteger(index) ? index : _bandSpheres.length - 1;
  frameSphere(_bandSpheres[at] ?? null, duration, ARRIVAL);
}

// --- The tick -----------------------------------------------------------------

/**
 * One frame of everything this layer animates: the cursor while it plays, the
 * flares while they burn. Installed on `scene.postRender` for as long as the
 * layer is on — this app renders on request and `clock.onTick` never fires
 * (`cesium-clock-ontick-dead-in-request-render`) — and free while nothing
 * holds the governor, since then no frame is drawn.
 */
function onTick() {
  const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const dt = (nowMs - (_lastTickMs ?? nowMs)) / 1000;
  _lastTickMs = nowMs;
  if (_clock?.playing) {
    const moved = advanceMegafireClock(_clock, dt);
    if (moved) syncToCursor({ flare: true });
    if (!_clock.playing) endPlayback();
  }
  const flaring = stepFlares(nowMs / 1000);
  // A flare outlives the tape by a second: the last ring appears on the very
  // frame playback ends. Hold the render loop while one burns — written on
  // the edge only, since every hold or release re-applies the render mode.
  if (flaring !== _flareHeld) {
    _flareHeld = flaring;
    if (flaring) holdContinuousRender(FLARE_HOLD);
    else releaseContinuousRender(FLARE_HOLD);
  }
}

function startTicking() {
  if (!_viewer?.scene || _tickRemover) return;
  _lastTickMs = null;
  _tickRemover = _viewer.scene.postRender.addEventListener(onTick);
}

function stopTicking() {
  if (_tickRemover) {
    _tickRemover();
    _tickRemover = null;
  }
  releaseContinuousRender(MEGAFIRE_LAYER_ID);
  releaseContinuousRender(FLARE_HOLD);
  _flareHeld = false;
  _lastTickMs = null;
}

function beginPlayback() {
  _lastTickMs = null;
  holdContinuousRender(MEGAFIRE_LAYER_ID);
  notifyRow();
}

function endPlayback() {
  releaseContinuousRender(MEGAFIRE_LAYER_ID);
  syncToCursor();
  notifyRow();
}

function notifyRow() {
  _rowControlsListener?.();
}

// --- Loading ------------------------------------------------------------------

async function fetchJson(url, name) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${name} → HTTP ${response.status}`);
  return response.json();
}

/** Fetch the three pack files, once per session. */
async function load() {
  if (_event && _hotspots && _bands) return;
  if (_loading) return;
  _loading = true;
  _status = 'loading';
  _error = null;
  try {
    const [event, hotspots, bands] = await Promise.all([
      fetchJson(EVENT_URL, 'event.json'),
      fetchJson(HOTSPOTS_URL, 'hotspots.json'),
      fetchJson(BANDS_URL, 'bands.json'),
    ]);
    _event = event;
    _hotspots = hotspots;
    _bands = bands;
    _clock = createMegafireClock({
      startMs: Date.parse(event.window.start),
      endMs: Date.parse(event.window.end),
      segments: bands.bands.map((band) => Date.parse(band.to)),
    });
    buildPoints();
    buildScene();
    _status = 'ready';
  } catch (error) {
    _error = error?.message || String(error);
    _status = 'error';
    console.warn('[Data:Gironde]', _error);
  } finally {
    _loading = false;
  }
}

// --- Layer ------------------------------------------------------------------

const girondeMegafireLayer = {
  id: MEGAFIRE_LAYER_ID,
  // Named by the registry (`layerTaxonomy.i18n.js`), read when drawn.
  get name() { return taxonomyMessages().labels[MEGAFIRE_LAYER_ID]; },
  // The flame belongs to the live row; this is the record of a fire that
  // stopped, so it takes the burn scar.
  icon: '🜂',
  source: SOURCE_LABEL,

  init(viewer) {
    _viewer = viewer;
    _enabled = false;
    _classificationType = powerClassificationTypeForScene(viewer?.scene);
    _points = new Cesium.PointPrimitiveCollection({ blendOption: Cesium.BlendOption.TRANSLUCENT });
    _points.show = false;
    viewer.scene.primitives.add(_points);
  },

  async enable() {
    _enabled = true;
    await load();
    if (!_enabled) return;
    applyView();
    if (_points) _points.show = true;
    startTicking();
    mountTimeline();
    // The first paint is the finished fire, drawn settled: nothing flares for
    // a reader who has not pressed anything.
    syncToCursor();
    notifyRow();
  },

  /**
   * There is nothing to refresh: the fire ended on 1 August 2026 and every
   * byte this layer draws is committed. `true`, because the manager reads a
   * literal `false` as a refused transition.
   * @returns {boolean}
   */
  async update() {
    return _enabled;
  },

  disable() {
    _enabled = false;
    if (_clock) _clock.playing = false;
    stopTicking();
    unmountTimeline();
    if (_points) _points.show = false;
    paintRings(0, false, 0);
    for (const index of _flaring) settlePoint(index);
    _flaring = new Set();
    try {
      _overlayHost?.setVisible?.(MEGAFIRE_LABEL_SOURCE_ID, false);
    } catch { /* no overlay host on this page */ }
    governorRequestRender('gironde-megafire-off');
    notifyRow();
  },

  /**
   * The arrival, when a READER switched the layer on (panel or voice — never a
   * share link or a restored session, which carry their own camera): a low
   * oblique view over the whole scar — or the whole stack, in « Temps en 3D ».
   * Called by `ui.js`.
   */
  onReaderEnable() {
    if (!_enabled || !_bands) return;
    frameStage(undefined, 2.4);
  },

  /** @param {(() => void)|null} listener */
  setRowControlsListener(listener) {
    _rowControlsListener = typeof listener === 'function' ? listener : null;
  },

  getStats() {
    if (!_clock || !_bands) {
      return { count: 0, loading: _loading, status: _status === 'ready' ? 'ok' : _status, error: _error };
    }
    const state = megafireClockState(_clock);
    return {
      count: _revealed,
      loading: _loading,
      status: _status === 'ready' ? 'ok' : _status,
      error: _error,
      playing: state.playing,
      atEnd: state.atEnd,
      atStart: state.atStart,
      position: state.position,
      bandsShown: state.completed,
      bands: _bands.bands.length,
      detections: _pointMeta.length,
      day: state.day,
      days: state.days,
      effisHa: _event?.effis?.main?.areaHa ?? null,
      view: _view,
    };
  },

  /**
   * The key: the view switch, three dates, one kind of dot, one dashed edge.
   * It does not change while the replay runs — the bar under the map is the
   * clock — so a playing layer never makes the right rail rebuild its key.
   * In « Temps en 3D » the dates are captioned by what height means.
   */
  getRowControls() {
    if (!_bands) return { chips: [], legend: [] };
    const m = messages().legend;
    const v = messages().view;
    const strata = _view === MEGAFIRE_VIEW_STRATA;
    const legend = [{ label: strata ? m.strataHeading : m.heading, heading: true }];
    _bands.bands.forEach((band, index) => {
      legend.push({
        label: bandLabel(band.id, 'long'),
        color: bandStyle(index).ring,
        swatch: 'line',
      });
    });
    legend.push({
      label: m.detections,
      color: MEGAFIRE_BANDS[1].point,
      blurb: strata ? m.strataDetectionsBlurb : m.detectionsBlurb,
    });
    if (_event?.effis?.main) {
      const hectares = formatNumber(Math.round(_event.effis.main.areaHa));
      legend.push({
        label: m.effis,
        color: MEGAFIRE_EFFIS_COLOR,
        swatch: 'line',
        blurb: strata ? m.strataEffisBlurb(hectares) : m.effisBlurb(hectares),
      });
    }
    // A lit segment sends its own view again: nothing changes, but it stays a
    // control, so the focus a press left on it survives the key's repaint.
    const segment = (key, label, title) => ({
      key,
      label,
      title,
      active: _view === key,
      toggle: { param: 'view', value: key },
    });
    return {
      chips: [],
      // Named by the event, under the tile that names the mode.
      legendTitle: taxonomyMessages().labels[MEGAFIRE_LAYER_ID],
      legendSegmentsLabel: v.label,
      legendSegments: [
        segment(MEGAFIRE_VIEW_GROUND, v.ground, v.groundTitle),
        segment(MEGAFIRE_VIEW_STRATA, v.strata, v.strataTitle),
      ],
      legend,
      legendNote: m.source,
      note: strata ? m.strataNote : m.note,
    };
  },

  /**
   * Drive the replay.
   *
   * `view` draws the replay on the ground or as « Temps en 3D » and eases the
   * camera to that view's framing — kept, and applied on load, when it
   * arrives first. `play` starts, pauses, or — from the end — rewinds and
   * starts; `band` parks the cursor at the END of that stage (its ring just
   * drawn) and, with `frame`, eases the camera over it. `view` is what the key's
   * switch sends, the others what the bar sends; the voice tools send the same.
   *
   * @param {{view?: string, play?: boolean, band?: number|string, frame?: boolean}} [params]
   * @returns {boolean|undefined} `false` for a view that does not exist.
   */
  setParams(params = {}) {
    if (params.view !== undefined) {
      if (!MEGAFIRE_VIEWS.includes(params.view)) return false;
      if (params.view !== _view) {
        _view = params.view;
        if (_enabled && _clock && _bands) {
          applyView();
          syncToCursor();
          frameStage();
        }
        notifyRow();
      }
    }
    if (!_clock || !_bands) return;
    if (params.band !== undefined) {
      const index = typeof params.band === 'string'
        ? _bands.bands.findIndex((band) => band.id === params.band)
        : Number(params.band);
      if (!Number.isFinite(index) || index < 0) return;
      const wasPlaying = Boolean(_clock.playing);
      const held = seekMegafireSegment(_clock, index);
      if (wasPlaying) releaseContinuousRender(MEGAFIRE_LAYER_ID);
      syncToCursor({ flare: true });
      if (params.frame) frameStage(held);
      notifyRow();
      return;
    }
    if (params.play !== undefined) {
      const playing = setMegafirePlaying(_clock, params.play);
      if (playing) {
        beginPlayback();
        // A replay from the start is watched from the arrival angle.
        if (megafireClockState(_clock).atStart) girondeMegafireLayer.onReaderEnable();
      } else {
        endPlayback();
      }
      syncToCursor();
      notifyRow();
    }
  },

  /** @returns {{cursorMs: ?number, position: ?number, playing: boolean, view: string}} */
  getParams() {
    return {
      cursorMs: _clock?.cursorMs ?? null,
      position: _clock?.position ?? null,
      playing: Boolean(_clock?.playing),
      view: _view,
    };
  },

  destroy(viewer) {
    if (_enabled) this.disable();
    stopTicking();
    unmountTimeline();
    clearStrata();
    clearScene();
    try {
      _overlayHost?.clearSource?.(MEGAFIRE_LABEL_SOURCE_ID);
    } catch { /* no overlay host on this page */ }
    if (_points) {
      if (viewer?.scene?.primitives?.contains(_points)) viewer.scene.primitives.remove(_points);
      else if (!_points.isDestroyed?.()) _points.destroy?.();
    }
    _points = null;
    _pointMeta = [];
    _revealed = 0;
    _flaring = new Set();
    _event = null;
    _hotspots = null;
    _bands = null;
    _clock = null;
    _viewer = null;
    _groundLinesSupported = null;
    _rowControlsListener = null;
    _bandSpheres = [];
    _view = MEGAFIRE_VIEW_GROUND;
    _labelsKey = '';
    _status = 'idle';
  },
};

export default girondeMegafireLayer;
