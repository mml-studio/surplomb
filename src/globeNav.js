/**
 * The globe's navigation bar on a desktop, at the bottom centre: « Vue
 * précédente », « Vue du dessus », 2D / 3D, the north needle, zoom and
 * « Réinitialiser », with a chip above it naming what the view is on
 * (« Paris · Vue 3D »).
 *
 * WHY (2026-09-23). The owner's review of the whole screen against a mock-up:
 * the camera controls were a row of round glyphs at the top, read by their
 * shape alone, and nothing let a reader explore freely and then find their
 * framing again. Each control here says what it does in words, and every one
 * has a tooltip that says it in a sentence.
 *
 * WHAT EACH ONE DOES.
 *
 *   - « Vue précédente » steps back through the framings the camera settled
 *     on (`createViewHistory`). A settle within the same framing refines the
 *     entry instead of adding one, so the history holds places and framings,
 *     not every notch of the wheel.
 *   - « Vue du dessus » turns the camera about the point at the centre of the
 *     screen until it looks straight down, keeping its heading and its distance
 *     to that point; pressed again, it tilts back to where it was.
 *   - 2D is a mode, not a move: straight down, north up, and Cesium's tilt and
 *     look gestures off, so a drag pans and the wheel zooms and the map stays a
 *     map. A flight that lands tilted (a search, a share link) is levelled
 *     again when it settles. 3D gives the gestures back and tilts to 45°, or
 *     to the angle the view had before 2D.
 *   - The needle points north on the screen; pressing it turns the view about
 *     its centre until north is up.
 *   - − and + halve or double the distance to the point at the centre.
 *   - « Réinitialiser » is `#reset-globe-view`, MOVED here from the « Plus
 *     d'actions » menu with its listener: the same route as the voice's
 *     zoom_to_globe (ui.js `resetToGlobeView`).
 *
 * THE CAMERA IS THE READER'S. A press here is a gesture, like a drag: it stops
 * a flight, an orbit or a cinematic verb in progress (ui.js
 * `takeCameraForGlobeNav`), but it does not stamp a new navigation — the
 * search mark and the searched place stay. Zoom on a followed object zooms on
 * it, as the wheel does; the other controls let the object go first, since
 * the follow camera owns heading and pitch.
 *
 * NOT ON A PHONE, NOT IN THE COCKPIT. The phone has its own glass and its own
 * top-down rule (src/topDownView.js); `initGlobeNav` returns null there. The
 * bar lives in `#command-dock`, which the cockpit, the clean view and the
 * recording mode already hide.
 *
 * @module globeNav
 */

import * as Cesium from 'cesium';
import messages from './globeNav.i18n.js';
import { interruptCameraMotion, prefersReducedMotion } from './cameraVerbs.js';
import { isPhoneShell } from './inputMode.js';
import { GLOBE_VIEW } from './locations.js';
import { paintShellIcons } from './globeShell.js';

/** Settled framings kept for « Vue précédente ». */
export const VIEW_HISTORY_MAX = 30;
/** A settle this far from the entry's first framing, in camera heights, is a new framing. */
export const HISTORY_MOVE_FRACTION = 0.35;
/** A zoom by this factor or more is a new framing. */
export const HISTORY_ZOOM_RATIO = 1.6;
/** A turn by this many degrees or more is a new framing. */
export const HISTORY_TURN_DEG = 25;
/** A tilt by this many degrees or more is a new framing. */
export const HISTORY_TILT_DEG = 12;

/** At or below this pitch the view counts as looking straight down. */
export const TOP_DOWN_PITCH_DEG = -85;
/**
 * The pitch « Vue du dessus » flies to. Not -90: at exactly -90° Cesium's
 * `lookAt` rebuilds the camera's right vector from east, which puts north up
 * whatever the heading was — right for 2D, wrong for a button that promises to
 * keep the orientation. A tenth of a degree off vertical keeps it and cannot
 * be seen.
 */
export const TOP_VIEW_PITCH_DEG = -89.9;
/** Where 3D and a second press of « Vue du dessus » tilt to, with no angle remembered. */
export const DEFAULT_TILT_PITCH_DEG = -45;
/** Within this many degrees of 0 the view counts as north up. */
export const NORTH_TOLERANCE_DEG = 1;
/**
 * How far a settled 2D view may drift before it is levelled again. Wider than
 * the needle's tolerance: a wheel zoom towards the cursor turns the camera by
 * a fraction of a degree, and snapping back after every notch would twitch.
 */
export const FLAT_DRIFT_DEG = 3;
/** One press of − or + multiplies the distance to the centre by this, or divides it. */
export const ZOOM_STEP = 2;
/** Closest a zoom press brings the camera to the point at the centre. */
export const ZOOM_MIN_RANGE_M = 60;
/** Farthest a zoom press takes it: the touch controller's ceiling. */
export const ZOOM_MAX_RANGE_M = GLOBE_VIEW.heightM * 1.5;
/** A turn about the centre (north, top view, 2D, 3D). */
export const TURN_DURATION_MS = 650;
/** One zoom step. */
export const ZOOM_DURATION_MS = 380;
/** The needle and the pressed states are sampled no more often than this. */
const SAMPLE_INTERVAL_MS = 100;
/** The needle turns only when the heading moved by this much. */
const NEEDLE_STEP_DEG = 0.5;
/** Wait after a settle before asking which place the view is on. */
const PLACE_LOOKUP_DELAY_MS = 350;
/** A place lookup that has not answered by then is dropped. */
const PLACE_LOOKUP_TIMEOUT_MS = 6000;
/** Place answers kept, by rounded point. */
const PLACE_CACHE_MAX = 64;
export const PLACE_LOOKUP_URL = 'https://geo.api.gouv.fr/communes';

/**
 * Which name the chip gives, by distance from the camera to the point at the
 * centre: a municipality at city scale, then its département, then its région;
 * above that, the view is on a country or the globe, and the chip says nothing.
 */
export const PLACE_LEVELS = Object.freeze([
  Object.freeze({ level: 'commune', maxRangeM: 60_000 }), // i18n-ignore-line — an id, not a label
  Object.freeze({ level: 'departement', maxRangeM: 350_000 }),
  Object.freeze({ level: 'region', maxRangeM: 1_400_000 }),
]);

/**
 * Boxes around France, metropolitan and overseas, where the API Géo has
 * something to answer. A view centred anywhere else asks nothing.
 * [west, south, east, north] in degrees.
 */
const FRANCE_BOXES = Object.freeze([
  [-5.3, 41.3, 9.7, 51.2], // metropolitan France and Corsica
  [-61.9, 15.8, -60.9, 16.6], // Guadeloupe
  [-61.3, 14.3, -60.7, 14.95], // Martinique
  [-54.7, 2.1, -51.5, 5.9], // Guyane
  [55.2, -21.45, 55.9, -20.85], // La Réunion
  [44.9, -13.1, 45.35, -12.6], // Mayotte
]);

// ── Pure helpers ────────────────────────────────────────────────────────────

const DEG = Math.PI / 180;

/**
 * @param {number} degrees
 * @returns {number} the same angle in [0, 360).
 */
export function normalizeDeg(degrees) {
  const value = Number(degrees) % 360;
  return value < 0 ? value + 360 : value;
}

/**
 * The shortest signed turn from one heading to another, in degrees (-180, 180].
 * @param {number} fromDeg
 * @param {number} toDeg
 * @returns {number}
 */
export function headingDeltaDeg(fromDeg, toDeg) {
  const delta = normalizeDeg(toDeg - fromDeg);
  return delta > 180 ? delta - 360 : delta;
}

/**
 * @param {number} pitchDeg
 * @returns {boolean} whether the view looks straight down.
 */
export function isTopDownPitch(pitchDeg) {
  return Number.isFinite(pitchDeg) && pitchDeg <= TOP_DOWN_PITCH_DEG;
}

/**
 * @param {number} headingDeg
 * @returns {boolean} whether north is up on the screen.
 */
export function isNorthUp(headingDeg) {
  return Number.isFinite(headingDeg) && Math.abs(headingDeltaDeg(0, headingDeg)) <= NORTH_TOLERANCE_DEG;
}

/**
 * The distance to the centre after one press of − (`direction` -1) or +
 * (`direction` 1), kept between the two limits.
 * @param {number} rangeM
 * @param {1|-1} direction
 * @returns {number}
 */
export function zoomedRange(rangeM, direction) {
  const next = direction > 0 ? rangeM / ZOOM_STEP : rangeM * ZOOM_STEP;
  return Math.min(ZOOM_MAX_RANGE_M, Math.max(ZOOM_MIN_RANGE_M, next));
}

/**
 * Whether a settled camera has left the 2D pose: straight down, north up.
 * @param {{pitchDeg: number, headingDeg: number}} pose
 * @returns {boolean}
 */
export function needsLevelling({ pitchDeg, headingDeg }) {
  if (!Number.isFinite(pitchDeg) || !Number.isFinite(headingDeg)) return false;
  return pitchDeg > -90 + FLAT_DRIFT_DEG || Math.abs(headingDeltaDeg(0, headingDeg)) > FLAT_DRIFT_DEG;
}

/**
 * The view's mode, as the chip names it.
 * @param {{flat: boolean, pitchDeg: number}} state
 * @returns {'flat'|'top'|'relief'}
 */
export function viewMode({ flat, pitchDeg }) {
  if (flat) return 'flat';
  return isTopDownPitch(pitchDeg) ? 'top' : 'relief';
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/**
 * @typedef {object} ViewPose A settled camera, in world coordinates.
 * @property {{x: number, y: number, z: number}} position
 * @property {{x: number, y: number, z: number}} direction
 * @property {{x: number, y: number, z: number}} up
 * @property {number} heightM Camera height above the ellipsoid.
 * @property {number} headingDeg
 * @property {number} pitchDeg
 */

/**
 * Whether two settled cameras frame the same thing: close in camera heights,
 * at a similar height, turned and tilted by less than a glance.
 * @param {ViewPose} a
 * @param {ViewPose} b
 * @returns {boolean}
 */
export function isSameFraming(a, b) {
  if (!a || !b) return false;
  const low = Math.max(50, Math.min(a.heightM, b.heightM));
  const high = Math.max(50, Math.max(a.heightM, b.heightM));
  if (high / low >= HISTORY_ZOOM_RATIO) return false;
  if (distance(a.position, b.position) > low * HISTORY_MOVE_FRACTION) return false;
  if (Math.abs(a.pitchDeg - b.pitchDeg) >= HISTORY_TILT_DEG) return false;
  // Heading means nothing looking straight down at a turning globe; it still
  // does for the map on the screen, so it counts at every pitch.
  return Math.abs(headingDeltaDeg(a.headingDeg, b.headingDeg)) < HISTORY_TURN_DEG;
}

/**
 * The framings « Vue précédente » steps back through.
 *
 * Each entry keeps the FIRST pose of its framing (`anchor`) and the LAST
 * (`pose`). A settle is compared with the anchor, so twenty small pans that
 * add up to a new place do become a new entry; the entry left behind returns
 * its last pose, i.e. where the reader was just before they moved away.
 *
 * @param {{max?: number, same?: (a: ViewPose, b: ViewPose) => boolean}} [options]
 */
export function createViewHistory({ max = VIEW_HISTORY_MAX, same = isSameFraming } = {}) {
  /** @type {Array<{anchor: ViewPose, pose: ViewPose}>} */
  const entries = [];
  return {
    get size() { return entries.length; },
    /**
     * @param {ViewPose} pose A settled camera.
     * @returns {boolean} whether it opened a new entry.
     */
    record(pose) {
      if (!pose) return false;
      const top = entries.at(-1);
      if (top && same(top.anchor, pose)) {
        top.pose = pose;
        return false;
      }
      entries.push({ anchor: pose, pose });
      if (entries.length > max) entries.shift();
      return true;
    },
    /** @returns {boolean} whether there is a framing before the current one. */
    canGoBack() {
      return entries.length >= 2;
    },
    /**
     * The framing to return to, taken off the history.
     * @param {ViewPose|null} current Where the camera is now.
     * @returns {ViewPose|null}
     */
    back(current) {
      const top = entries.at(-1);
      if (!top) return null;
      // The camera left the last framing without settling yet (mid-drag, mid-
      // flight): the last framing is the one to go back to.
      if (current && !same(top.anchor, current)) return top.pose;
      if (entries.length < 2) return null;
      entries.pop();
      return entries.at(-1).pose;
    },
    clear() {
      entries.length = 0;
    },
  };
}

/**
 * Which name the chip gives at this distance, or null.
 * @param {number} rangeM Camera to the point at the centre.
 * @returns {'commune'|'departement'|'region'|null}
 */
export function placeLevelForRange(rangeM) {
  if (!Number.isFinite(rangeM) || rangeM < 0) return null;
  return PLACE_LEVELS.find((entry) => rangeM <= entry.maxRangeM)?.level ?? null;
}

/**
 * @param {number} lat
 * @param {number} lon
 * @returns {boolean} whether the point may be French ground.
 */
export function isInFranceBoxes(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  return FRANCE_BOXES.some(([west, south, east, north]) => (
    lon >= west && lon <= east && lat >= south && lat <= north
  ));
}

/**
 * The cache key of a place lookup: the point rounded to ~100 m.
 * @param {number} lat
 * @param {number} lon
 * @returns {string}
 */
export function placeLookupKey(lat, lon) {
  return `${lat.toFixed(3)},${lon.toFixed(3)}`;
}

/**
 * @param {number} lat
 * @param {number} lon
 * @returns {string} the API Géo request for the municipality under a point.
 */
export function placeLookupUrl(lat, lon) {
  const params = new URLSearchParams({
    lat: lat.toFixed(5),
    lon: lon.toFixed(5),
    fields: 'nom,departement,region',
    format: 'json',
  });
  return `${PLACE_LOOKUP_URL}?${params}`;
}

/**
 * The name at a level, from an API Géo answer.
 * @param {unknown} reply `GET /communes?lat=&lon=` body: an array of communes.
 * @param {'commune'|'departement'|'region'|null} level
 * @returns {string|null}
 */
export function placeNameFromReply(reply, level) {
  const commune = Array.isArray(reply) ? reply[0] : null;
  if (!commune || typeof commune !== 'object' || !level) return null;
  const raw = level === 'commune' ? commune.nom // i18n-ignore-line — an id
    : level === 'departement' ? commune.departement?.nom
      : commune.region?.nom;
  const name = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
  return name ? name.slice(0, 60) : null;
}

// ── Camera ──────────────────────────────────────────────────────────────────

function toPlain(cartesian) {
  return { x: cartesian.x, y: cartesian.y, z: cartesian.z };
}

function isSurfacePoint(point) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z)) return false;
  const carto = Cesium.Cartographic.fromCartesian(point);
  // A depth read off the sky or a far tile edge lands anywhere; the ground is
  // between the Dead Sea and the highest summit.
  return !!carto && carto.height > -500 && carto.height < 9000;
}

/**
 * The point at the centre of the screen: the drawn surface when the depth
 * buffer has it (3D tiles, terrain), the ellipsoid otherwise, nothing when the
 * centre is sky.
 * @param {Cesium.Scene} scene
 * @param {Cesium.Camera} camera
 * @returns {Cesium.Cartesian3|null}
 */
function centreTarget(scene, camera) {
  const canvas = scene.canvas;
  const centre = new Cesium.Cartesian2(
    (canvas.clientWidth || canvas.width) / 2,
    (canvas.clientHeight || canvas.height) / 2,
  );
  if (scene.pickPositionSupported) {
    try {
      const picked = scene.pickPosition(centre);
      if (isSurfacePoint(picked)) return picked;
    } catch {
      // no depth this frame: the ellipsoid answers
    }
  }
  try {
    const onEllipsoid = camera.pickEllipsoid(centre, scene.globe?.ellipsoid ?? Cesium.Ellipsoid.WGS84);
    return onEllipsoid || null;
  } catch {
    return null;
  }
}

/**
 * The camera as seen from a point it looks at: heading and pitch of its line
 * of sight in that point's east-north-up frame, and its distance.
 * @param {Cesium.Cartesian3} target
 * @param {Cesium.Camera} camera
 * @returns {{heading: number, pitch: number, range: number}} radians, metres.
 */
function orbitAround(target, camera) {
  const frame = Cesium.Transforms.eastNorthUpToFixedFrame(target);
  const inverse = Cesium.Matrix4.inverseTransformation(frame, new Cesium.Matrix4());
  const local = Cesium.Matrix4.multiplyByPoint(inverse, camera.positionWC, new Cesium.Cartesian3());
  const range = Cesium.Cartesian3.magnitude(local);
  const pitch = Math.asin(Math.max(-1, Math.min(1, -local.z / Math.max(range, 1e-6))));
  // Straight down, the horizontal part of the line of sight is noise: the
  // camera's own heading is the orientation the reader sees.
  const heading = pitch < -88 * DEG ? camera.heading : Math.atan2(-local.x, -local.y);
  return { heading, pitch, range };
}

function easeInOut(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
}

/**
 * Wire the navigation bar. Returns null on a phone, or when the page lacks its
 * markup (tests, a stripped page).
 *
 * @param {object} options
 * @param {Cesium.Viewer} options.viewer
 * @param {object} [options.ui] The StyleManager: `takeCameraForGlobeNav`.
 * @param {Document} [options.doc]
 * @param {typeof fetch} [options.fetchImpl]
 * @returns {{setFlat: (flat: boolean) => void, back: () => void, dispose: () => void}|null}
 */
export function initGlobeNav({ viewer, ui = null, doc = globalThis.document, fetchImpl = globalThis.fetch } = {}) {
  if (!doc || !viewer?.scene || isPhoneShell()) return null;
  const bar = doc.getElementById('globe-nav');
  const backButton = doc.getElementById('globe-nav-back');
  const topButton = doc.getElementById('globe-nav-top');
  const flatButton = doc.getElementById('globe-nav-2d');
  const reliefButton = doc.getElementById('globe-nav-3d');
  const northButton = doc.getElementById('globe-nav-north');
  const needle = doc.getElementById('globe-nav-needle');
  const zoomOutButton = doc.getElementById('globe-nav-zoom-out');
  const zoomInButton = doc.getElementById('globe-nav-zoom-in');
  const chip = doc.getElementById('globe-nav-place');
  const chipText = doc.getElementById('globe-nav-place-text');
  if (!bar || !backButton || !topButton || !flatButton || !reliefButton || !northButton || !zoomOutButton || !zoomInButton) {
    return null;
  }

  const m = messages();
  const scene = viewer.scene;
  const camera = viewer.camera;
  const controller = scene.screenSpaceCameraController;
  const cleanups = [];
  const listen = (target, type, handler, options) => {
    target?.addEventListener(type, handler, options);
    cleanups.push(() => target?.removeEventListener(type, handler, options));
  };
  const inCockpit = () => !!doc.body?.classList.contains('cockpit-mode');
  const isFollowing = () => !!viewer.trackedEntity
    || !Cesium.Matrix4.equals(camera.transform, Cesium.Matrix4.IDENTITY);

  // ── « Réinitialiser », moved in from the « Plus d'actions » menu ─────────
  const resetButton = doc.getElementById('reset-globe-view');
  if (resetButton) {
    resetButton.classList.add('globe-nav-btn');
    resetButton.replaceChildren();
    const glyph = doc.createElement('span');
    glyph.className = 'shell-icon';
    glyph.dataset.shellIcon = 'rotate-ccw';
    glyph.setAttribute('aria-hidden', 'true');
    const label = doc.createElement('span');
    label.className = 'globe-nav-label';
    label.textContent = m.reset;
    resetButton.append(glyph, label);
    bar.querySelector('.globe-nav-row')?.append(resetButton);
    // Reset lands on the whole globe in 3D: the 2D lock does not survive it.
    listen(resetButton, 'click', () => setFlat(false, { animate: false }));
  }

  // ── Motion ────────────────────────────────────────────────────────────────
  let animation = null;
  const stopAnimation = () => {
    if (!animation) return;
    cancelAnimationFrame(animation.frame);
    animation = null;
  };

  /**
   * Turn and move the camera about `target` to `to`, from where it is now.
   * Without a target (the centre is sky), turn it where it stands.
   */
  const animateTo = (target, to, durationMs, onDone = null) => {
    stopAnimation();
    const reduced = prefersReducedMotion();
    const duration = reduced ? 0 : durationMs;
    const start = globalThis.performance?.now?.() ?? Date.now();
    const position = Cesium.Cartesian3.clone(camera.positionWC);
    const from = target
      ? orbitAround(target, camera)
      : { heading: camera.heading, pitch: camera.pitch, range: 0 };
    const turn = headingDeltaDeg(from.heading / DEG, to.heading / DEG) * DEG;
    const zoomRatio = from.range > 0 ? to.range / from.range : 1;
    // Tweens already running are not ours to wait for; a flight started
    // after this one is.
    const tweensAtStart = scene.tweens?.length ?? 0;
    const apply = (e) => {
      const heading = from.heading + turn * e;
      const pitch = from.pitch + (to.pitch - from.pitch) * e;
      if (target) {
        // Distance on a log scale: a zoom step looks the same at every height.
        const range = from.range > 0 ? from.range * (zoomRatio ** e) : to.range;
        camera.lookAt(target, new Cesium.HeadingPitchRange(heading, pitch, range));
        camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
      } else {
        camera.setView({ destination: position, orientation: { heading, pitch, roll: 0 } });
      }
      scene.requestRender?.();
    };
    const state = { frame: 0 };
    const step = () => {
      if (animation !== state) return;
      // Someone else started a flight (a search, the voice): theirs wins.
      if ((scene.tweens?.length ?? 0) > tweensAtStart) { animation = null; return; }
      const now = globalThis.performance?.now?.() ?? Date.now();
      const t = duration > 0 ? Math.min(1, (now - start) / duration) : 1;
      apply(easeInOut(t));
      if (t < 1) {
        state.frame = requestAnimationFrame(step);
        return;
      }
      animation = null;
      onDone?.();
    };
    animation = state;
    step();
  };

  /**
   * Take the camera the way a drag does. `release` lets a followed object go
   * first — every control but zoom needs the camera in the world's frame.
   * @returns {boolean} whether the bar may move the camera.
   */
  const takeCamera = ({ release = false } = {}) => {
    if (inCockpit()) return false;
    if (ui?.takeCameraForGlobeNav) {
      if (ui.takeCameraForGlobeNav({ release: release && isFollowing() }) === false) return false;
    } else {
      interruptCameraMotion('globe-nav');
      camera.cancelFlight();
    }
    return true;
  };

  // Any gesture on the globe takes the camera back from the bar.
  listen(scene.canvas, 'pointerdown', stopAnimation, { passive: true });
  listen(scene.canvas, 'wheel', stopAnimation, { passive: true });

  // ── 2D ────────────────────────────────────────────────────────────────────
  let flat = false;
  let savedGestures = null;
  /** The tilt « Vue du dessus » or 2D left, to go back to. */
  let tiltBeforeTopDown = null;

  const lockGestures = () => {
    if (savedGestures || !controller) return;
    savedGestures = { tilt: controller.enableTilt, look: controller.enableLook };
    controller.enableTilt = false;
    controller.enableLook = false;
  };
  const unlockGestures = () => {
    if (!savedGestures || !controller) return;
    controller.enableTilt = savedGestures.tilt;
    controller.enableLook = savedGestures.look;
    savedGestures = null;
  };

  const levelFlat = () => {
    const target = centreTarget(scene, camera);
    const range = target ? orbitAround(target, camera).range : 0;
    animateTo(target, { heading: 0, pitch: -Math.PI / 2, range }, TURN_DURATION_MS);
  };

  /**
   * @param {boolean} next
   * @param {{animate?: boolean}} [options]
   */
  const setFlat = (next, { animate = true } = {}) => {
    if (next === flat) return;
    if (next && inCockpit()) return;
    flat = next;
    if (flat) {
      lockGestures();
      if (animate && takeCamera({ release: true })) {
        const target = centreTarget(scene, camera);
        const pitchDeg = (target ? orbitAround(target, camera).pitch : camera.pitch) / DEG;
        if (!isTopDownPitch(pitchDeg)) tiltBeforeTopDown = pitchDeg * DEG;
        levelFlat();
      }
    } else {
      unlockGestures();
      if (animate && takeCamera({ release: true })) {
        const target = centreTarget(scene, camera);
        const from = target ? orbitAround(target, camera) : { heading: camera.heading, range: 0 };
        animateTo(target, {
          heading: from.heading,
          pitch: tiltBeforeTopDown ?? DEFAULT_TILT_PITCH_DEG * DEG,
          range: from.range,
        }, TURN_DURATION_MS);
        tiltBeforeTopDown = null;
      }
    }
    syncState(true);
    scheduleChip();
  };

  listen(flatButton, 'click', () => setFlat(true));
  listen(reliefButton, 'click', () => setFlat(false));

  // The cockpit flies its own camera: 2D lets go of the gestures without a move.
  if (typeof MutationObserver === 'function' && doc.body) {
    const observer = new MutationObserver(() => {
      if (inCockpit()) {
        stopAnimation();
        setFlat(false, { animate: false });
      }
    });
    observer.observe(doc.body, { attributes: true, attributeFilter: ['class'] });
    cleanups.push(() => observer.disconnect());
  }

  // ── « Vue du dessus » ─────────────────────────────────────────────────────
  listen(topButton, 'click', () => {
    if (flat || !takeCamera({ release: true })) return;
    const target = centreTarget(scene, camera);
    const from = target ? orbitAround(target, camera) : { heading: camera.heading, pitch: camera.pitch, range: 0 };
    if (isTopDownPitch(from.pitch / DEG)) {
      animateTo(target, {
        heading: from.heading,
        pitch: tiltBeforeTopDown ?? DEFAULT_TILT_PITCH_DEG * DEG,
        range: from.range,
      }, TURN_DURATION_MS);
      tiltBeforeTopDown = null;
    } else {
      tiltBeforeTopDown = from.pitch;
      animateTo(target, { heading: from.heading, pitch: TOP_VIEW_PITCH_DEG * DEG, range: from.range }, TURN_DURATION_MS);
    }
  });

  // ── North ─────────────────────────────────────────────────────────────────
  listen(northButton, 'click', () => {
    if (!takeCamera({ release: true })) return;
    const target = centreTarget(scene, camera);
    const from = target ? orbitAround(target, camera) : { heading: camera.heading, pitch: camera.pitch, range: 0 };
    animateTo(target, { heading: 0, pitch: from.pitch, range: from.range }, TURN_DURATION_MS);
  });

  // ── Zoom ──────────────────────────────────────────────────────────────────
  const zoom = (direction) => {
    if (!takeCamera()) return;
    if (isFollowing()) {
      // The follow camera's frame is centred on the object: moving along the
      // line of sight is what the wheel does there.
      const rangeM = Cesium.Cartesian3.magnitude(camera.position);
      const next = zoomedRange(rangeM, direction);
      if (direction > 0) camera.zoomIn(rangeM - next);
      else camera.zoomOut(next - rangeM);
      scene.requestRender?.();
      return;
    }
    const target = centreTarget(scene, camera);
    if (!target) {
      const heightM = Math.max(ZOOM_MIN_RANGE_M, camera.positionCartographic.height);
      if (direction > 0) camera.moveForward(heightM / ZOOM_STEP);
      else camera.moveBackward(heightM);
      scene.requestRender?.();
      return;
    }
    const from = orbitAround(target, camera);
    animateTo(target, { heading: from.heading, pitch: from.pitch, range: zoomedRange(from.range, direction) }, ZOOM_DURATION_MS);
  };
  listen(zoomInButton, 'click', () => zoom(1));
  listen(zoomOutButton, 'click', () => zoom(-1));

  // ── « Vue précédente » ────────────────────────────────────────────────────
  const history = createViewHistory();
  const currentPose = () => {
    if (isFollowing()) return null;
    const carto = camera.positionCartographic;
    return {
      position: toPlain(camera.positionWC),
      direction: toPlain(camera.directionWC),
      up: toPlain(camera.upWC),
      heightM: carto?.height ?? 0,
      headingDeg: normalizeDeg(camera.heading / DEG),
      pitchDeg: camera.pitch / DEG,
    };
  };

  const back = () => {
    if (!takeCamera({ release: true })) return;
    stopAnimation();
    const pose = history.back(currentPose());
    syncBack();
    if (!pose) return;
    const destination = new Cesium.Cartesian3(pose.position.x, pose.position.y, pose.position.z);
    const hop = Cesium.Cartesian3.distance(destination, camera.positionWC);
    camera.flyTo({
      destination,
      orientation: {
        direction: new Cesium.Cartesian3(pose.direction.x, pose.direction.y, pose.direction.z),
        up: new Cesium.Cartesian3(pose.up.x, pose.up.y, pose.up.z),
      },
      // Cesium's own duration grows with the hop; a short one needs no more
      // than a second, and none at all for a reader who asked for no motion.
      duration: prefersReducedMotion() ? 0 : (hop < 50_000 ? 1 : undefined),
    });
  };
  listen(backButton, 'click', back);

  const syncBack = () => {
    const disabled = !history.canGoBack();
    if (backButton.disabled !== disabled) backButton.disabled = disabled;
  };

  // ── What the bar shows ────────────────────────────────────────────────────
  let lastNeedleDeg = null;
  let lastSampleMs = -Infinity;
  let lastMode = null;
  const syncState = (force = false) => {
    const now = globalThis.performance?.now?.() ?? Date.now();
    if (!force && now - lastSampleMs < SAMPLE_INTERVAL_MS) return;
    lastSampleMs = now;
    const headingDeg = normalizeDeg((camera.heading || 0) / DEG);
    const pitchDeg = (camera.pitch || 0) / DEG;
    if (needle && (lastNeedleDeg === null || Math.abs(headingDeltaDeg(lastNeedleDeg, headingDeg)) >= NEEDLE_STEP_DEG)) {
      lastNeedleDeg = headingDeg;
      needle.style.setProperty('--globe-nav-heading', `${(-headingDeg).toFixed(1)}deg`);
    }
    const north = isNorthUp(headingDeg);
    if (northButton.classList.contains('is-north') !== north) northButton.classList.toggle('is-north', north);
    const mode = viewMode({ flat, pitchDeg });
    if (mode === lastMode && !force) return;
    lastMode = mode;
    flatButton.setAttribute('aria-pressed', String(flat));
    reliefButton.setAttribute('aria-pressed', String(!flat));
    topButton.setAttribute('aria-pressed', String(mode !== 'relief'));
    topButton.disabled = flat;
    topButton.title = flat ? m.topFlatTitle : mode === 'top' ? m.topOffTitle : m.topTitle;
    renderChip();
  };

  const preRemove = scene.preRender?.addEventListener?.(() => syncState());
  if (preRemove) cleanups.push(preRemove);

  // ── The chip: which place, which view ─────────────────────────────────────
  const placeCache = new Map();
  let placeName = null;
  let placeTimer = null;
  let placeAbort = null;

  const renderChip = () => {
    if (!chip || !chipText) return;
    const mode = viewMode({ flat, pitchDeg: (camera.pitch || 0) / DEG });
    const view = mode === 'flat' ? m.viewFlat : mode === 'top' ? m.viewTop : m.viewRelief;
    const show = !!placeName;
    if (show) {
      const text = m.chip(placeName, view);
      if (chipText.textContent !== text) chipText.textContent = text;
      chip.title = m.chipTitle(placeName);
    }
    if (chip.hidden === show) chip.hidden = !show;
  };

  let placeGeneration = 0;
  const lookUpPlace = async () => {
    placeTimer = null;
    placeAbort?.abort();
    placeAbort = null;
    const generation = ++placeGeneration;
    if (inCockpit() || isFollowing()) return;
    const target = centreTarget(scene, camera);
    const range = target ? Cesium.Cartesian3.distance(target, camera.positionWC) : NaN;
    const level = placeLevelForRange(range);
    const carto = target ? Cesium.Cartographic.fromCartesian(target) : null;
    const lat = carto ? carto.latitude / DEG : NaN;
    const lon = carto ? carto.longitude / DEG : NaN;
    if (!level || !isInFranceBoxes(lat, lon) || typeof fetchImpl !== 'function') {
      placeName = null;
      renderChip();
      return;
    }
    const key = placeLookupKey(lat, lon);
    let reply = placeCache.get(key);
    if (reply === undefined) {
      const request = new AbortController();
      placeAbort = request;
      const timer = setTimeout(() => request.abort(), PLACE_LOOKUP_TIMEOUT_MS);
      try {
        const response = await fetchImpl(placeLookupUrl(lat, lon), { signal: request.signal });
        reply = response.ok ? await response.json() : null;
      } catch {
        reply = null;
      } finally {
        clearTimeout(timer);
        if (placeAbort === request) placeAbort = null;
      }
      // A later settle asked in the meantime: its answer is the one to show.
      if (generation !== placeGeneration) return;
      // A failed lookup is not remembered: the next settle asks again.
      if (reply !== null) {
        placeCache.set(key, reply);
        if (placeCache.size > PLACE_CACHE_MAX) placeCache.delete(placeCache.keys().next().value);
      }
    }
    placeName = placeNameFromReply(reply, level);
    renderChip();
  };

  const scheduleChip = () => {
    if (!chip) return;
    clearTimeout(placeTimer);
    placeTimer = setTimeout(() => { void lookUpPlace(); }, PLACE_LOOKUP_DELAY_MS);
  };
  cleanups.push(() => {
    clearTimeout(placeTimer);
    placeAbort?.abort();
  });

  // ── On every settle ───────────────────────────────────────────────────────
  const moveEndRemove = camera.moveEnd?.addEventListener?.(() => {
    syncState(true);
    if (inCockpit()) return;
    const pose = currentPose();
    if (pose) history.record(pose);
    syncBack();
    scheduleChip();
    // 2D holds whatever landed: a search or a share link flies in tilted.
    if (flat && !animation && pose && needsLevelling(pose)) levelFlat();
  });
  if (moveEndRemove) cleanups.push(moveEndRemove);

  paintShellIcons(bar);
  syncBack();
  syncState(true);
  bar.hidden = false;
  doc.documentElement.classList.add('globe-nav');
  scheduleChip();

  return {
    setFlat,
    back,
    dispose() {
      stopAnimation();
      unlockGestures();
      for (const cleanup of cleanups.splice(0)) cleanup();
    },
  };
}
