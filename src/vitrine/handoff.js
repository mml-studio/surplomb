/**
 * The showcase → globe hand-off, on the globe's side.
 *
 * ── WHAT THE READER SEES ─────────────────────────────────────────────────────
 *
 * The showcase's background is a loop recorded from this app: the hero view,
 * photorealistic, with the traffic layer in detection mode and the camera
 * swinging a few degrees to show that the city is 3D. Nothing runs behind it,
 * so a visitor who only reads costs no Cesium ion session and downloads no
 * engine (decision of 2026-09-17: « ce n'est pas grave si les données sont
 * périmées, tant qu'elles paraissent live, photoréalistes et 3D »).
 *
 * When « Ouvrir le globe » is pressed on a wide screen, the loop is frozen on
 * the frame being shown, the engine boots UNDER that frame with its camera on
 * the exact pose the frame was recorded from, and the frame fades only once
 * the globe has drawn the same view. The reader sees the picture come alive
 * instead of a loading screen.
 *
 * ── WHERE THE POSE COMES FROM ────────────────────────────────────────────────
 *
 * `scripts/capture-landing-hero.mjs` records the loop with a known camera law
 * (an eased orbit around one ground point) and writes it into the landing
 * manifest. {@link applyHeroPose} evaluates that law at the video's own clock, so
 * the pose is computed, never guessed from pixels.
 *
 * ── WHY THROUGH A SHARE HASH ─────────────────────────────────────────────────
 *
 * The frame shows a camera AND a state: which layers, which detection mode, no
 * scope mask, the photoreal globe. A share hash already says all of that, and
 * the share restore already knows how to apply every part of it in the right
 * order. So the hand-off builds one — never writing it into the address — and
 * the cockpit restores it with a zero-length flight.
 *
 * @module vitrine/handoff
 */

import * as Cesium from 'cesium';
// Written by `npm run landing:assets` from the capture's own record. A module
// rather than JSON next to the media: it is code input, Vite does not import
// from the public directory, and Node's test runner needs no import attribute.
import { HERO_LOOP } from './heroLoop.js';

/**
 * The state the hero loop was recorded in, minus the camera. `map=photoreal`
 * is deliberate: the reader has just asked for the globe, which is the moment
 * the product already spends its one ion session on (see
 * src/photorealAdoption.js), and it is the only surface whose frame matches the
 * recording.
 */
export const HERO_STATE_PARAMS = Object.freeze({
  v: '2',
  dm: 'DENSE',
  dd: '75',
  l: 't.8',
  sc: '0',
  map: 'photoreal',
});

/** How long the frozen frame may wait for the globe before it fades anyway. */
export const HANDOFF_READY_DEADLINE_MS = 9000;

/**
 * The recorded orbit for one of the two loops, or null when the manifest has
 * none (a build whose landing assets were never generated).
 * @param {'desktop'|'phone'} kind
 * @param {object} [manifest]
 * @returns {?object}
 */
export function heroOrbit(kind = 'desktop', manifest = HERO_LOOP) {
  const orbit = manifest?.videos?.[kind]?.orbit;
  if (!orbit || orbit.law !== 'cosine') return null;
  const numbers = ['centerLat', 'centerLon', 'centerHeight', 'rangeM', 'pitchDeg',
    'headingStartDeg', 'amplitudeDeg', 'periodS'];
  return numbers.every((key) => Number.isFinite(orbit[key])) && orbit.periodS > 0 ? orbit : null;
}

/**
 * The camera heading of the loop at playback time `t`, in degrees.
 * @param {object} orbit - From {@link heroOrbit}.
 * @param {number} t - `video.currentTime`, seconds.
 * @returns {number}
 */
export function orbitHeadingDeg(orbit, t) {
  const time = Number.isFinite(t) ? ((t % orbit.periodS) + orbit.periodS) % orbit.periodS : 0;
  return orbit.headingStartDeg
    + orbit.amplitudeDeg * (1 - Math.cos((2 * Math.PI * time) / orbit.periodS)) / 2;
}

/**
 * Put the camera where the loop's camera was at playback time `t`, and read
 * the pose back in share-hash units.
 *
 * `lookAt` then `lookAtTransform(IDENTITY)`: the second call releases the
 * camera from the reference frame the first one sets, otherwise every later
 * gesture would orbit that point instead of behaving like the cockpit.
 *
 * @param {Cesium.Camera} camera
 * @param {object} orbit
 * @param {number} t
 * @returns {{lat: number, lon: number, alt: number, heading: number, pitch: number, roll: number}}
 */
export function applyHeroPose(camera, orbit, t) {
  const center = Cesium.Cartesian3.fromDegrees(orbit.centerLon, orbit.centerLat, orbit.centerHeight);
  camera.lookAt(center, new Cesium.HeadingPitchRange(
    Cesium.Math.toRadians(orbitHeadingDeg(orbit, t)),
    Cesium.Math.toRadians(orbit.pitchDeg),
    orbit.rangeM,
  ));
  camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
  const carto = camera.positionCartographic;
  return {
    lat: Cesium.Math.toDegrees(carto.latitude),
    lon: Cesium.Math.toDegrees(carto.longitude),
    alt: carto.height,
    heading: Cesium.Math.toDegrees(camera.heading),
    pitch: Cesium.Math.toDegrees(camera.pitch),
    roll: Cesium.Math.toDegrees(camera.roll),
  };
}

/**
 * A share hash for that pose and the hero's state. Full precision: this hash
 * is parsed, never shown, and four decimals of latitude are eleven metres.
 * @param {{lat: number, lon: number, alt: number, heading: number, pitch: number, roll: number}} pose
 * @returns {string}
 */
export function heroShareHash(pose) {
  const params = new URLSearchParams();
  params.set('v', HERO_STATE_PARAMS.v);
  params.set('lat', String(pose.lat));
  params.set('lon', String(pose.lon));
  params.set('alt', String(pose.alt));
  params.set('heading', String(pose.heading));
  params.set('pitch', String(pose.pitch));
  params.set('roll', String(pose.roll));
  for (const key of ['dm', 'dd', 'sc', 'map', 'l']) params.set(key, HERO_STATE_PARAMS[key]);
  return `#${params.toString()}`;
}

/**
 * Resolve once the scene has drawn a settled frame of the active surface, or
 * after `timeoutMs`.
 *
 * "Settled" is read off the surface that is actually shown: the photoreal
 * tileset's `tilesLoaded` when it is the ground, the globe's otherwise. Not
 * `sampleHeight`, which answers garbage mid-stream (docs in
 * src/data/renderedSurface.js). One more rendered frame is awaited after the
 * flag turns true, so the fade never uncovers a frame that was not drawn yet.
 *
 * `alsoReady` adds what the frame shows ON the ground — the recorded loop has
 * cars in it, and a fade from cars to bare streets and back to cars reads as a
 * glitch. It is asked the same way, under the same deadline, and a throw
 * counts as « not yet ».
 *
 * @param {Cesium.Viewer} viewer
 * @param {{getActiveId: Function, getPhotorealTileset: Function}} mapStackController
 * @param {{timeoutMs?: number, requestRender?: Function, alsoReady?: () => boolean}} [options]
 * @returns {Promise<{status: 'ready'|'timeout', waitedMs: number, surface: string}>}
 */
export function whenSurfaceSettled(viewer, mapStackController, {
  timeoutMs = HANDOFF_READY_DEADLINE_MS,
  requestRender = () => viewer.scene.requestRender(),
  alsoReady = () => true,
} = {}) {
  const started = performance.now();
  return new Promise((resolve) => {
    let done = false;
    let removePostRender = null;
    const finish = (status, surface) => {
      if (done) return;
      done = true;
      clearInterval(poll);
      removePostRender?.();
      resolve({ status, waitedMs: Math.round(performance.now() - started), surface });
    };
    const surfaceState = () => {
      const tileset = mapStackController.getPhotorealTileset?.();
      if (mapStackController.getActiveId?.() === 'photoreal' && tileset?.show) {
        return { surface: 'photoreal', loaded: tileset.tilesLoaded === true };
      }
      const globe = viewer.scene.globe;
      return { surface: 'globe', loaded: Boolean(globe?.show && globe.tilesLoaded) };
    };
    const poll = setInterval(() => {
      if (performance.now() - started > timeoutMs) {
        finish('timeout', surfaceState().surface);
        return;
      }
      const { surface, loaded } = surfaceState();
      let extra = false;
      try { extra = loaded && Boolean(alsoReady()); } catch { extra = false; }
      if (!extra || removePostRender) {
        // The governor may have parked the scene; a stream only progresses
        // while frames are drawn.
        requestRender();
        return;
      }
      removePostRender = viewer.scene.postRender.addEventListener(() => finish('ready', surface));
      requestRender();
    }, 100);
  });
}
