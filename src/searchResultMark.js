/**
 * @module searchResultMark
 *
 * What a place search leaves on the globe, as Google Maps does (owner,
 * 2026-09-23): a PIN on a precise place — an address, a building, a monument
 * — with its name beside it, and the LIMITS of the place when the answer is
 * a town, a département or a région.
 *
 * WHAT DECIDES WHICH. The geocode's Google-shaped `types`
 * (`placeOutlineLevelForTypes`): a town, a département or a région gets an
 * outline; everything else gets a pin. A country gets nothing — the camera is
 * already showing the whole of it. A mountain range or a sea framed as a
 * swath gets nothing either: there is no single point to pin.
 *
 * WHERE THE OUTLINE COMES FROM. `/api/place-outline` for metropolitan France
 * (src/placeOutline.js: geo.api.gouv.fr for a commune, the bundled IGN
 * outlines for a département and a région); elsewhere, the OpenStreetMap
 * administrative boundary the voice annotations already use
 * (`resolveAdminOutlineAt` in src/annotations/annotationResolver.js). An
 * outline that cannot be found becomes a pin on the geocoded centre, so a
 * search always leaves something.
 *
 * HOW IT IS DRAWN. The pin is a FILLED shape — a red drop with an ivory core
 * and a dark rim — because the line-art marks of the address layers read as
 * characters typed on the photo, and the owner rejected them for exactly that.
 * It clamps to whatever the globe draws (photoreal mesh or terrain) and is
 * never hidden behind a building. The outline is a ground polyline
 * (`drawGroundHighlight`), unpickable, so a click through it reaches the map.
 *
 * ONE AT A TIME. A new search, a city shortcut or a landmark replaces the mark;
 * emptying the search field, « Autour de moi » or another landing clears it.
 */

import * as Cesium from 'cesium';
import { drawGroundHighlight } from './data/groundHighlight.js';
import { placeOutlineLevelForTypes } from './placeOutline.js';
import { governorRequestRender } from './renderGovernor.js';

/** The pin's body: a warm red that holds on satellite imagery and on OSM. */
export const SEARCH_PIN_FILL = '#e5484d';
/** Its rim, dark enough to separate it from red roofs. */
export const SEARCH_PIN_RIM = '#5c1414';
/** The outline's colour: the pin's red, a little lighter, nearly opaque. */
export const SEARCH_OUTLINE_CSS = 'rgba(255, 99, 88, 0.92)';
/** Width of the outline on screen, px. */
export const SEARCH_OUTLINE_WIDTH_PX = 3;
/** The pin's size on screen, px (the SVG's own aspect). */
export const SEARCH_PIN_WIDTH_PX = 30;
export const SEARCH_PIN_HEIGHT_PX = 42;
/** The chrome's face (`--font-ui`), for the name beside the pin. */
const SEARCH_LABEL_FONT = '600 15px "DM Sans", system-ui, sans-serif'; // i18n-ignore-line — a CSS font, not prose
/** Longest name printed beside the pin. */
const SEARCH_LABEL_MAX_CHARS = 48;
/** Levels `/api/place-outline` answers (metropolitan France). */
const SERVER_OUTLINE_LEVELS = new Set(['municipality', 'department', 'region']);

/**
 * Pin, outline or nothing, for one search result.
 * @param {{types?: ReadonlyArray<string>, navigationMode?: string}} result
 * @returns {{kind: 'pin'}|{kind: 'outline', level: string}|{kind: 'none'}}
 */
export function searchMarkPlan({ types, navigationMode } = {}) {
  if (navigationMode === 'natural-region-swath') return { kind: 'none' };
  const level = placeOutlineLevelForTypes(types);
  if (level === 'country') return { kind: 'none' };
  if (level) return { kind: 'outline', level };
  return { kind: 'pin' };
}

/**
 * The name printed beside the pin: the first part of a geocoder label
 * (« 12 Avenue de la Marne, 64200 Biarritz, France » → « 12 Avenue de la
 * Marne »), cut to fit.
 * @param {string} label
 * @returns {string}
 */
export function shortPlaceLabel(label) {
  const first = String(label ?? '').split(',')[0].replace(/\s+/g, ' ').trim();
  return first.length > SEARCH_LABEL_MAX_CHARS ? `${first.slice(0, SEARCH_LABEL_MAX_CHARS - 1).trimEnd()}…` : first;
}

/**
 * The pin as an SVG data URI: a filled drop with an ivory core, drawn at 2×
 * the screen size so it stays sharp on a dense display.
 * @returns {string}
 */
export function searchPinImage() {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="84" viewBox="0 0 30 42">'
    + `<path d="M15 1.2C7.4 1.2 1.2 7.3 1.2 14.9c0 9.9 11.2 21.5 13 25.3.3.6 1.3.6 1.6 0 1.8-3.8 13-15.4 13-25.3C28.8 7.3 22.6 1.2 15 1.2z" fill="${SEARCH_PIN_FILL}" stroke="${SEARCH_PIN_RIM}" stroke-width="1.6"/>`
    + '<circle cx="15" cy="14.8" r="5.2" fill="#f7f4ea"/>'
    + '</svg>';
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Ask the server for the outline of the commune, département or région
 * containing a point. Null on a 404 (outside metropolitan France) or on any
 * failure: the caller falls back.
 * @param {string} level
 * @param {number} lat
 * @param {number} lon
 * @param {{fetchImpl?: typeof fetch, signal?: AbortSignal}} [options]
 * @returns {Promise<?{rings: Array, name?: string}>}
 */
export async function fetchPlaceOutline(level, lat, lon, { fetchImpl = globalThis.fetch, signal } = {}) {
  if (!SERVER_OUTLINE_LEVELS.has(level) || typeof fetchImpl !== 'function') return null;
  const url = `/api/place-outline?level=${encodeURIComponent(level)}&lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}`;
  try {
    const response = await fetchImpl(url, { signal });
    if (!response.ok) return null;
    const payload = await response.json();
    return Array.isArray(payload?.rings) && payload.rings.length ? payload : null;
  } catch {
    return null;
  }
}

/** OpenStreetMap boundaries, for a place outside metropolitan France. */
async function fetchForeignOutline(place, signal) {
  try {
    const { resolveAdminOutlineAt } = await import('./annotations/annotationResolver.js');
    return await resolveAdminOutlineAt(place, signal);
  } catch {
    return null;
  }
}

/**
 * The mark's controller for one viewer.
 *
 * @param {object} viewer Cesium viewer.
 * @param {object} [deps] Seams for tests.
 * @param {typeof fetchPlaceOutline} [deps.outline]
 * @param {typeof fetchForeignOutline} [deps.foreignOutline]
 * @param {typeof drawGroundHighlight} [deps.drawOutline]
 * @returns {{show: (place: object) => Promise<string>, clear: () => void, dispose: () => void, current: () => ?object}}
 */
export function createSearchResultMark(viewer, {
  outline = fetchPlaceOutline,
  foreignOutline = fetchForeignOutline,
  drawOutline = drawGroundHighlight,
} = {}) {
  const scene = viewer?.scene;
  // Primitives, not entities, like the ground highlight: an entity in a data
  // source is something the pick and card machinery may index. `scene` on
  // the collections is what lets them clamp to the ground.
  const billboards = scene?.primitives?.add(new Cesium.BillboardCollection({ scene }));
  const labels = scene?.primitives?.add(new Cesium.LabelCollection({ scene }));
  let highlight = null;
  let generation = 0;
  let controller = null;
  let shown = null;

  const addPin = (lat, lon, label) => {
    if (!billboards || !labels) return;
    const position = Cesium.Cartesian3.fromDegrees(lon, lat);
    billboards.add({
      position,
      image: searchPinImage(),
      width: SEARCH_PIN_WIDTH_PX,
      height: SEARCH_PIN_HEIGHT_PX,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    });
    const text = shortPlaceLabel(label);
    if (text) {
      labels.add({
        position,
        text,
        font: SEARCH_LABEL_FONT,
        fillColor: Cesium.Color.fromCssColorString('#f7f4ea'),
        outlineColor: Cesium.Color.fromCssColorString('rgba(8, 14, 12, 0.9)'),
        outlineWidth: 4,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        pixelOffset: new Cesium.Cartesian2(SEARCH_PIN_WIDTH_PX / 2 + 4, -SEARCH_PIN_HEIGHT_PX + 13),
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      });
    }
  };

  const clear = () => {
    generation += 1;
    controller?.abort();
    controller = null;
    billboards?.removeAll();
    labels?.removeAll();
    highlight?.clear();
    highlight = null;
    shown = null;
    governorRequestRender('search-mark');
  };

  /**
   * Show one result, replacing the previous one. Resolves to what was drawn:
   * 'pin', 'outline', 'none' or 'superseded'.
   * @param {{lat: number, lng: number, label?: string, types?: string[], navigationMode?: string}} place
   * @returns {Promise<string>}
   */
  const show = async (place) => {
    clear();
    const lat = Number(place?.lat);
    const lon = Number(place?.lng ?? place?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return 'none';
    const plan = searchMarkPlan(place);
    const mine = generation;
    shown = { ...plan, lat, lon, label: place.label || '' };
    if (plan.kind === 'none') return 'none';
    if (plan.kind === 'pin') {
      addPin(lat, lon, place.label);
      governorRequestRender('search-mark');
      return 'pin';
    }
    controller = typeof AbortController === 'function' ? new AbortController() : null;
    const signal = controller?.signal;
    let found = await outline(plan.level, lat, lon, { signal });
    if (mine !== generation) return 'superseded';
    if (!found) {
      found = await foreignOutline({
        lat, lon, name: shortPlaceLabel(place.label), types: place.types,
      }, signal);
      if (mine !== generation) return 'superseded';
    }
    const rings = Array.isArray(found?.rings) ? found.rings.filter((ring) => Array.isArray(ring) && ring.length >= 4) : [];
    if (rings.length) {
      highlight = drawOutline(viewer, [{
        parts: rings.map((ring) => [ring]),
        stroke: Cesium.Color.fromCssColorString(SEARCH_OUTLINE_CSS),
        widthPx: SEARCH_OUTLINE_WIDTH_PX,
      }], 'search-outline');
      if (highlight) return 'outline';
    }
    // No limits to draw: a pin on the centre still says where the search went.
    addPin(lat, lon, place.label);
    governorRequestRender('search-mark');
    return 'pin';
  };

  return {
    show,
    clear,
    current: () => shown,
    dispose() {
      clear();
      if (billboards && !billboards.isDestroyed?.()) scene?.primitives?.remove(billboards);
      if (labels && !labels.isDestroyed?.()) scene?.primitives?.remove(labels);
    },
  };
}
