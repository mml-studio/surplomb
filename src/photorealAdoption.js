/**
 * WHEN THE 3D GLOBE IS WORTH BUYING.
 *
 * Cesium ion meters Google Photorealistic 3D Tiles by "root tile", and one root
 * tile is one successful request for the tileset — so the fetch is the charge,
 * and it is charged per reader. The free tier is 1 000 a month; the paid ones
 * are 5 000 for $149 and 10 000 for $499. At one root tile per visitor, a
 * public opening on the photoreal globe plateaus at about 160 visitors a day
 * for the most expensive plan, and a single post that works exceeds it in an
 * afternoon.
 *
 * So the app opens on a keyless satellite basemap and adopts the 3D globe when
 * the reader is close enough for it to be the thing they came for. Above the
 * threshold the two are the same picture — an orthophoto and a photogrammetric
 * mesh seen from orbit are indistinguishable — and below it they are not
 * remotely the same picture, because one has buildings.
 *
 * WHY THE APP'S OWN ARRIVAL DOES NOT COUNT, which is the whole subtlety here.
 * `flyToDefaultCity()` sets the camera at 25 km over Paris and then flies it to
 * **600 m** in four seconds, on every boot with no share state. A rule that
 * only read the altimeter would therefore fire on every single page load, five
 * seconds in, and this module would save nothing at all while making the first
 * five seconds worse. The reader's own movement is the signal, not the
 * altitude the app took them to by itself — so the boot flight arms the watch
 * rather than triggering it, and the next rest below the threshold is the one
 * that buys.
 *
 * ARMING SWALLOWS ONE REST, and that is not belt-and-braces. Measured here on
 * 2026-09-15: Cesium raises `flyTo`'s `complete` callback BEFORE the camera's
 * own `moveEnd` for the same flight, so a watch armed from `complete` is armed
 * in time to be tripped by the very flight that armed it — which is exactly
 * what the first browser probe of this module did, buying a root tile on a
 * boot nobody had touched. The first rest after arming is therefore the app's
 * own arrival, by construction, and is skipped.
 *
 * A visitor who lands, watches the descent and leaves costs nothing. A visitor
 * who takes hold of the camera gets the 3D globe on their first rest.
 *
 * WHAT NEVER FIRES IT. A deliberate pick from the map-source tray — including
 * a pick of `photoreal` itself — retires this for the session: an automatic
 * switch that overrides somebody's choice is a bug, not a feature. So does a
 * refused purchase, which the controller has already greyed the chip for.
 * And while a data layer holds the globe on Satellite (`basemapLock.js`) the
 * watch waits: the controller would refuse the switch, but only after
 * `onAdopt` had recorded a verdict the reader never got.
 *
 * THE SIGNAL IS THE READER'S HAND, NOT THEIR STILLNESS. Waiting for the camera
 * to come to REST means the swap starts after the reader has finished moving:
 * they drag, they let go, and only then does a basemap they were looking at
 * get thrown away and replaced. That reads as the page reloading itself, and
 * it was the first thing anybody said about the public opening. The first
 * touch of the canvas is the same verdict — this reader is engaged — arriving
 * two to four seconds earlier, while the camera is still moving and the mesh
 * can stream in under cover of the motion. Rest stays as the second gate, for
 * the reader whose first touch happens from orbit: nobody buys a city mesh to
 * look at a continent.
 *
 * AND IT IS REMEMBERED. The verdict outlives the tab (`localStorage`), so the
 * second visit opens on the 3D globe directly and builds ONE surface instead
 * of two. That costs no extra root tile in the normal case — a reader who
 * adopted once would have bought again on their next first touch anyway — and
 * it is the only way to make the swap invisible, because the only way to not
 * see two basemaps is to not build two.
 */

/**
 * Altitude, in metres, under which the photoreal mesh is the better picture.
 *
 * 25 km is not a guess: it is `DEFAULT_CITY_VIEW.approachAltitudeM`, the height
 * the app itself considers "arrived over a city", and the same height
 * `groundHeight` uses to stop paying for terrain samples. Above it a reader is
 * looking at a region, not at a place.
 */
export const PHOTOREAL_ADOPTION_ALTITUDE_M = 25000;

/**
 * What the app opens on instead of the 3D globe.
 *
 * The keyless satellite stack, not OSM: from orbit an orthophoto and a
 * photogrammetric mesh are the same picture, and a drawing of the Earth is
 * not. It also costs the account nothing — IGN's Géoplateforme is keyless and
 * the world base beneath it is free — which is the entire reason this stack
 * and not Google's 2D cartography, which is metered.
 */
export const PHOTOREAL_ADOPTION_STACK = 'ign-ortho';

/**
 * Where "this reader has already taken the 3D globe" is kept between visits.
 *
 * A boolean, deliberately, and not the last active basemap: the double build
 * this fixes only happens on the photoreal swap, and persisting a preference
 * for the seven other stacks is a feature nobody asked for that would also
 * strand a reader on whichever source was slow the day they left.
 */
export const PHOTOREAL_ADOPTION_STORAGE_KEY = 'gev.photoreal.adopted';

/**
 * The DOM events that mean a reader took hold of the globe.
 *
 * `pointerdown` covers mouse and pen, `touchstart` the phones that do not
 * emit pointer events, `wheel` the zoom that never presses a button, and
 * `keydown` the arrow keys Cesium's own camera controller listens to. Bound
 * on the Cesium canvas, so the first-run card — a DOM overlay above it — is
 * dismissed without ever counting as navigation.
 */
const READER_INPUT_EVENTS = ['pointerdown', 'touchstart', 'wheel', 'keydown'];

/** `localStorage` that never throws — Safari private mode and iframes both do. */
function safeStorage(scope = globalThis) {
  try {
    // A GETTER, not a property: reading it is what throws SecurityError, so
    // the access has to happen inside the try. See src/firstRunExperience.js.
    return scope.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Has this reader already been given the 3D globe on an earlier visit?
 * @param {{getItem: Function}|null} [storage]
 * @returns {boolean}
 */
export function photorealAlreadyAdopted(storage = safeStorage()) {
  try {
    return storage?.getItem(PHOTOREAL_ADOPTION_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Record that this reader has the 3D globe, so the next visit opens on it.
 * Best effort: a browser that refuses storage just gets today's behaviour.
 * @param {{setItem: Function}|null} [storage]
 * @returns {void}
 */
export function rememberPhotorealAdoption(storage = safeStorage()) {
  try {
    storage?.setItem(PHOTOREAL_ADOPTION_STORAGE_KEY, '1');
  } catch { /* best effort */ }
}

/**
 * Watch the camera and adopt the 3D globe once, when it is worth it.
 *
 * @param {object} viewer - Cesium viewer.
 * @param {object} controller - The live {@link MapStackController}.
 * @param {object} [options]
 * @param {number} [options.altitudeM] - Threshold; see {@link PHOTOREAL_ADOPTION_ALTITUDE_M}.
 * @param {string} [options.fromStackId] - Only adopt while THIS stack is still
 *   the active one. Anything else means the reader has chosen, or another
 *   mechanism has.
 * @param {EventTarget|null} [options.inputTarget] - Where the reader's hand is
 *   heard; defaults to the Cesium canvas. `null` disables the touch gate and
 *   leaves only the rest gate, which is what a headless unit test gets.
 * @param {(info: {altitudeM: number, reason: string}) => void} [options.onAdopt] - Diagnostics.
 * @returns {{arm: () => void, dispose: () => void, isArmed: () => boolean, isSpent: () => boolean}}
 */
export function installPhotorealAdoption(viewer, controller, {
  altitudeM = PHOTOREAL_ADOPTION_ALTITUDE_M,
  fromStackId = PHOTOREAL_ADOPTION_STACK,
  inputTarget = viewer?.scene?.canvas ?? null,
  onAdopt = null,
} = {}) {
  let armed = false;
  let spent = false;
  let listening = false;
  // See ARMING SWALLOWS ONE REST above.
  let skipNextRest = false;
  /**
   * The reader has touched the globe, whether or not the watch was armed when
   * they did. Recorded rather than acted on, because the touch that INTERRUPTS
   * the opening flight lands before `arm()` — and that reader is the most
   * engaged one there is.
   */
  let touched = false;

  const camera = viewer?.camera;
  if (!camera?.moveEnd) {
    return { arm() {}, dispose() {}, isArmed: () => false, isSpent: () => true };
  }

  const detachInput = () => {
    if (!inputTarget?.removeEventListener) return;
    for (const type of READER_INPUT_EVENTS) inputTarget.removeEventListener(type, onInput);
    inputTarget = null;
  };

  const dispose = () => {
    spent = true;
    armed = false;
    detachInput();
    if (listening) {
      camera.moveEnd.removeEventListener(onRest);
      listening = false;
    }
  };

  function currentAltitude() {
    const height = camera.positionCartographic?.height;
    return Number.isFinite(height) ? height : Number.POSITIVE_INFINITY;
  }

  /**
   * Buy the globe, if this is still the moment to.
   *
   * Returns without spending when the reader is too high — that is not a
   * refusal, it is "not yet", and the rest gate will ask again once they have
   * come down. Every other exit is final.
   * @param {string} reason - `input` or `rest`, for the diagnostics line.
   */
  async function adopt(reason) {
    if (spent) return;
    // The reader has moved on — to another basemap, or to the 3D globe by
    // hand. Either way this watch has nothing left to decide.
    if (controller.getActiveId() !== fromStackId) {
      dispose();
      return;
    }
    if (!controller.canLoadPhotoreal()) {
      // No door, or a door that has already been tried and refused. Retrying
      // would re-bill a root tile to re-learn the same answer.
      dispose();
      return;
    }
    // "Not yet", like the altitude below: a layer holds the globe, and the
    // next rest once it lets go asks again.
    if (controller.getLock?.()) return;
    const height = currentAltitude();
    if (height > altitudeM) return;

    // Spend BEFORE the await: a second rest arriving while the tileset is in
    // flight must not start a second adoption.
    dispose();
    onAdopt?.({ altitudeM: height, reason });
    await controller.setStack('photoreal');
  }

  function onInput() {
    touched = true;
    // One hand is all the evidence there is to collect; keeping the listeners
    // alive would run this on every frame of a drag.
    detachInput();
    if (!armed || spent) return;
    // The camera belongs to the reader from here on, so there is no arrival
    // left to swallow — the next rest is theirs even if the opening flight
    // never got to announce its own. Matters for the reader who grabs the
    // globe from orbit: without this their first stop would be skipped and
    // they would have to come to rest twice.
    skipNextRest = false;
    void adopt('input');
  }

  async function onRest() {
    if (!armed || spent) return;
    if (skipNextRest) {
      // The app's own arrival. Not a reason to buy anything.
      skipNextRest = false;
      return;
    }
    await adopt('rest');
  }

  if (inputTarget?.addEventListener) {
    for (const type of READER_INPUT_EVENTS) {
      inputTarget.addEventListener(type, onInput, { passive: true });
    }
  }

  return {
    /**
     * Start watching. Called once the app's OWN opening move has finished, so
     * the descent it performs by itself is not mistaken for the reader zooming
     * in — see the note at the top of this file.
     */
    arm() {
      if (spent || armed) return;
      armed = true;
      skipNextRest = true;
      if (!listening) {
        camera.moveEnd.addEventListener(onRest);
        listening = true;
      }
      if (touched) {
        // They grabbed the camera during the opening flight — which is how
        // `cancel` got us here. Their own move is not the app's arrival, so
        // there is no rest left to swallow.
        skipNextRest = false;
        void adopt('input');
      }
    },
    dispose,
    isArmed: () => armed,
    isSpent: () => spent,
  };
}
