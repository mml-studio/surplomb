// Unit contract for when the app buys the 3D globe.
//
// ion bills Google Photorealistic 3D Tiles per "root tile", and one root tile
// is one reader. So the question this module answers is a billing question
// wearing a rendering costume: the app opens on the keyless satellite stack,
// and swaps in the photoreal mesh when the reader is close enough that the two
// stop being the same picture.
//
// The trap these pins exist for: `flyToDefaultCity()` descends to 600 m by
// ITSELF on every boot, so a rule that only read the altimeter would fire on
// every page load and save nothing at all.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PHOTOREAL_ADOPTION_ALTITUDE_M,
  PHOTOREAL_ADOPTION_STACK,
  installPhotorealAdoption,
  photorealAlreadyAdopted,
  rememberPhotorealAdoption,
  PHOTOREAL_ADOPTION_STORAGE_KEY,
} from './photorealAdoption.js';

/** A camera whose rest event and altitude the test drives by hand. */
function fakeCamera(height = 1_800_000) {
  const listeners = [];
  return {
    positionCartographic: { height },
    moveEnd: {
      addEventListener: (fn) => listeners.push(fn),
      removeEventListener: (fn) => {
        const i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      },
    },
    listenerCount: () => listeners.length,
    /**
     * Come to rest at `to` metres, and let every listener finish. Called with
     * no argument it rests wherever the altimeter currently says — which is
     * how the unreadable-altitude case is reachable at all.
     */
    async restAt(to) {
      if (to !== undefined && this.positionCartographic) this.positionCartographic.height = to;
      await Promise.all(listeners.slice().map((fn) => fn()));
    },
  };
}

/** A controller stub that records the stacks it was asked for. */
function fakeController({ activeId = PHOTOREAL_ADOPTION_STACK, canLoad = true } = {}) {
  const asked = [];
  return {
    asked,
    getActiveId: () => activeId,
    canLoadPhotoreal: () => canLoad,
    setStack: async (id) => { asked.push(id); activeId = id; },
    pick(id) { activeId = id; },
  };
}

test('the threshold is the height the app itself calls "arrived over a city"', () => {
  assert.equal(PHOTOREAL_ADOPTION_ALTITUDE_M, 25000);
  // Not OSM: from orbit an orthophoto and a photogrammetric mesh are the same
  // picture, and a drawing of the Earth is not.
  assert.equal(PHOTOREAL_ADOPTION_STACK, 'ign-ortho');
});

test('the boot descent arms the watch, it does not trip it', async () => {
  // THE point of the module. `flyToDefaultCity` sets 25 km and flies to 600 m
  // on every boot with no share state, so an altimeter-only rule would buy a
  // root tile on every page load — and this file would save nothing.
  const camera = fakeCamera(25000);
  const controller = fakeController();
  const adoption = installPhotorealAdoption({ camera }, controller);

  // Everything the boot flight does happens before `arm()`.
  await camera.restAt(600);
  assert.deepEqual(controller.asked, [], 'a visitor who only watched the descent pays nothing');
  assert.equal(adoption.isArmed(), false);

  adoption.arm();
  assert.equal(adoption.isArmed(), true);
  assert.deepEqual(controller.asked, [], 'arming is not itself a reason to buy');

  // Cesium raises `flyTo`'s `complete` BEFORE the camera's own `moveEnd`, so
  // the rest immediately after arming is still the boot flight landing. The
  // first browser probe of this module bought a root tile on an untouched boot
  // for exactly this reason.
  await camera.restAt(600);
  assert.deepEqual(controller.asked, [], 'the flight that armed the watch does not trip it');

  // The reader's own first rest, at the same altitude the app had already
  // taken them to, is what buys.
  await camera.restAt(600);
  assert.deepEqual(controller.asked, ['photoreal']);
});

test('a reader who stays high never buys', async () => {
  const camera = fakeCamera();
  const controller = fakeController();
  const adoption = installPhotorealAdoption({ camera }, controller);
  adoption.arm();
  await camera.restAt(1_800_000);   // the app's own arrival, swallowed

  for (const height of [1_800_000, 400_000, 25_001]) {
    await camera.restAt(height);
  }
  assert.deepEqual(controller.asked, []);
  assert.equal(adoption.isSpent(), false, 'still watching — they may yet come down');

  // 25 km exactly is close enough; the threshold is the arrival height.
  await camera.restAt(25_000);
  assert.deepEqual(controller.asked, ['photoreal']);
});

test('it buys once, and stops listening', async () => {
  const camera = fakeCamera();
  const controller = fakeController();
  const adoption = installPhotorealAdoption({ camera }, controller);
  adoption.arm();
  await camera.restAt(1_800_000);   // the app's own arrival, swallowed

  await camera.restAt(5000);
  await camera.restAt(900);
  await camera.restAt(300);
  assert.deepEqual(controller.asked, ['photoreal'], 'one root tile, not three');
  assert.equal(adoption.isSpent(), true);
  assert.equal(camera.listenerCount(), 0, 'the watch releases the camera it no longer needs');
});

test('a deliberate pick retires the watch', async () => {
  // An automatic switch that overrides somebody's choice is a bug. This holds
  // for a pick of the 3D globe itself, which is why the guard is on the ACTIVE
  // id rather than on a "did they choose" flag nobody would remember to set.
  const camera = fakeCamera();
  const controller = fakeController();
  const adoption = installPhotorealAdoption({ camera }, controller);
  adoption.arm();
  await camera.restAt(1_800_000);   // the app's own arrival, swallowed

  controller.pick('osm');
  await camera.restAt(300);
  assert.deepEqual(controller.asked, []);
  assert.equal(adoption.isSpent(), true);
  assert.equal(camera.listenerCount(), 0);
});

test('a build with no door, or one already refused, is not knocked on again', async () => {
  const camera = fakeCamera();
  const controller = fakeController({ canLoad: false });
  const adoption = installPhotorealAdoption({ camera }, controller);
  adoption.arm();
  await camera.restAt(1_800_000);   // the app's own arrival, swallowed

  await camera.restAt(300);
  assert.deepEqual(controller.asked, []);
  assert.equal(adoption.isSpent(), true);
});

test('a viewer with no camera is inert rather than fatal', () => {
  // Tests and tools build partial viewers; a basemap optimisation must never
  // be the thing that stops the app from opening.
  const adoption = installPhotorealAdoption({}, fakeController());
  adoption.arm();
  assert.equal(adoption.isArmed(), false);
  assert.equal(adoption.isSpent(), true);
  assert.doesNotThrow(() => adoption.dispose());
});

test('an unreadable altitude is treated as far away, never as close', async () => {
  // Fail-closed: the failure that costs money is buying when nobody asked.
  const camera = fakeCamera();
  const controller = fakeController();
  const adoption = installPhotorealAdoption({ camera }, controller);
  adoption.arm();
  await camera.restAt(1_800_000);   // the app's own arrival, swallowed

  camera.positionCartographic = null;
  await camera.restAt();
  assert.deepEqual(controller.asked, [], 'no altitude is not a low altitude');
  assert.equal(adoption.isSpent(), false, 'and it keeps watching for one it can read');

  camera.positionCartographic = { height: Number.NaN };
  await camera.restAt();
  assert.deepEqual(controller.asked, []);

  // A readable one still works afterwards.
  camera.positionCartographic = { height: 800 };
  await camera.restAt(800);
  assert.deepEqual(controller.asked, ['photoreal']);
});

/** A canvas whose reader input the test delivers by hand. */
function fakeCanvas() {
  const listeners = new Map();
  return {
    addEventListener(type, fn) {
      listeners.set(type, [...(listeners.get(type) || []), fn]);
    },
    removeEventListener(type, fn) {
      const left = (listeners.get(type) || []).filter((f) => f !== fn);
      if (left.length) listeners.set(type, left);
      else listeners.delete(type);
    },
    boundTypes: () => [...listeners.keys()].sort(),
    fire(type) {
      for (const fn of (listeners.get(type) || []).slice()) fn();
    },
  };
}

/** Let an adoption started from a synchronous DOM handler finish. */
const settle = () => new Promise((resolve) => { setTimeout(resolve, 0); });

test('the first touch buys, without waiting for the camera to stop', async () => {
  // THE POINT of the touch gate. Rest means "after they let go", so the swap
  // landed once the reader was already still and read as the page reloading
  // itself. The hand is the same verdict, two to four seconds earlier, while
  // the motion still covers the mesh streaming in.
  const camera = fakeCamera(600);
  const controller = fakeController();
  const canvas = fakeCanvas();
  const adoption = installPhotorealAdoption({ camera }, controller, { inputTarget: canvas });
  adoption.arm();

  canvas.fire('wheel');
  await settle();
  assert.deepEqual(controller.asked, ['photoreal'], 'no moveEnd was needed');
  assert.equal(adoption.isSpent(), true);
  assert.deepEqual(canvas.boundTypes(), [], 'and the canvas is released');
});

test('a hand on the globe from orbit is not a reason to buy a city', async () => {
  // The touch gate answers "is this reader engaged", never "is this the right
  // picture" — that is still the altimeter's job, and a reader who grabs the
  // camera at 500 km is on their way somewhere, not there.
  const camera = fakeCamera(500_000);
  const controller = fakeController();
  const canvas = fakeCanvas();
  const adoption = installPhotorealAdoption({ camera }, controller, { inputTarget: canvas });
  adoption.arm();

  canvas.fire('pointerdown');
  await settle();
  assert.deepEqual(controller.asked, [], 'too high to be worth a root tile');
  assert.equal(adoption.isSpent(), false, 'and the watch is still alive');

  // The rest gate catches them at the bottom of the move they just started.
  await camera.restAt(700);
  assert.deepEqual(controller.asked, ['photoreal']);
});

test('a reader who interrupts the opening flight is not made to wait for a second rest', async () => {
  // Their touch lands BEFORE `arm()` — it is what cancelled the flight, and
  // `cancel` is what arms the watch. Without recording it, the swallowed rest
  // would be the reader's own move and the mesh would wait for another one.
  const camera = fakeCamera(600);
  const controller = fakeController();
  const canvas = fakeCanvas();
  const adoption = installPhotorealAdoption({ camera }, controller, { inputTarget: canvas });

  canvas.fire('touchstart');
  await settle();
  assert.deepEqual(controller.asked, [], 'nothing is bought before the app has finished arriving');

  adoption.arm();
  await settle();
  assert.deepEqual(controller.asked, ['photoreal']);
});

test('a touch is heard on four kinds of hand, and released with the watch', () => {
  const canvas = fakeCanvas();
  const adoption = installPhotorealAdoption({ camera: fakeCamera() }, fakeController(), {
    inputTarget: canvas,
  });
  assert.deepEqual(canvas.boundTypes(), ['keydown', 'pointerdown', 'touchstart', 'wheel']);
  adoption.dispose();
  assert.deepEqual(canvas.boundTypes(), [], 'a disposed watch holds nothing');
});

test('the verdict outlives the tab, and a browser that refuses storage still opens', () => {
  const store = new Map();
  const storage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, value); },
  };
  assert.equal(photorealAlreadyAdopted(storage), false);
  rememberPhotorealAdoption(storage);
  assert.equal(photorealAlreadyAdopted(storage), true);
  assert.equal(store.get(PHOTOREAL_ADOPTION_STORAGE_KEY), '1');

  // Safari private mode and sandboxed iframes THROW on both calls. A basemap
  // optimisation must never be the thing that stops the app from opening.
  const hostile = {
    getItem() { throw new Error('SecurityError'); },
    setItem() { throw new Error('SecurityError'); },
  };
  assert.equal(photorealAlreadyAdopted(hostile), false);
  assert.doesNotThrow(() => rememberPhotorealAdoption(hostile));
  assert.equal(photorealAlreadyAdopted(null), false);
  assert.doesNotThrow(() => rememberPhotorealAdoption(null));
});
