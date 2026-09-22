import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DESKTOP_CACHE_BYTES,
  DESKTOP_CACHE_OVERFLOW_BYTES,
  GOOGLE_PHOTOREAL_ION_ASSET_ID,
  PHONE_CACHE_BYTES,
  PHONE_CACHE_OVERFLOW_BYTES,
  PHONE_MAX_SCREEN_SPACE_ERROR,
  PHOTOREAL_DISABLE_GLOBAL,
  describePhotorealFailure,
  loadPhotorealTileset,
  photorealDisabled,
  photorealTilesetOptions,
} from './photorealTileset.js';

/**
 * A CesiumJS stand-in that records every door tried. `googleResult` and
 * `ionResult` are either a tileset or an Error to throw.
 */
function stubCesium({ googleResult, ionResult } = {}) {
  const calls = [];
  return {
    calls,
    createGooglePhotorealistic3DTileset(apiOptions, tilesetOptions) {
      calls.push({ door: 'google-key', apiOptions, tilesetOptions });
      if (googleResult instanceof Error) return Promise.reject(googleResult);
      return Promise.resolve(googleResult ?? null);
    },
    IonResource: {
      fromAssetId(assetId, options) {
        calls.push({ door: 'ion-resource', assetId, options });
        if (ionResult instanceof Error) return Promise.reject(ionResult);
        return Promise.resolve({ assetId });
      },
    },
    Cesium3DTileset: {
      fromUrl(resource, tilesetOptions) {
        calls.push({ door: 'ion', resource, tilesetOptions });
        return Promise.resolve(ionResult ?? null);
      },
    },
  };
}

test('a working Google key is used, and ion is never touched', async () => {
  const tileset = { name: 'google' };
  const Cesium = stubCesium({ googleResult: tileset });
  const result = await loadPhotorealTileset(Cesium, { googleApiKey: 'AIza-key', ionToken: 'ion-token' });

  assert.equal(result.tileset, tileset);
  assert.equal(result.source, 'google-key');
  assert.deepEqual(result.errors, []);
  assert.deepEqual(Cesium.calls.map((call) => call.door), ['google-key']);
  // The key travels in the call, not through a global another module could clear.
  assert.equal(Cesium.calls[0].apiOptions.key, 'AIza-key');
});

test('an EEA-refused key falls through to ion, which serves the same tileset', async () => {
  // What Google actually answers on a key billed to an EEA address.
  const refused = new Error('403 PERMISSION_DENIED: 3D tiles are not available for your account and region');
  const ionTileset = { name: 'ion' };
  const Cesium = stubCesium({ googleResult: refused, ionResult: ionTileset });
  const result = await loadPhotorealTileset(Cesium, { googleApiKey: 'AIza-key', ionToken: 'ion-token' });

  assert.equal(result.tileset, ionTileset);
  assert.equal(result.source, 'ion');
  assert.deepEqual(result.errors, [{ source: 'google-key', message: refused.message }]);
  assert.deepEqual(Cesium.calls.map((call) => call.door), ['google-key', 'ion-resource', 'ion']);
  // The published asset, and a token passed explicitly rather than read off
  // `Ion.defaultAccessToken` — the caller may hold a token it never installed.
  assert.equal(Cesium.calls[1].assetId, GOOGLE_PHOTOREAL_ION_ASSET_ID);
  assert.equal(Cesium.calls[1].options.accessToken, 'ion-token');
});

test('a keyless build with an ion token still gets the 3D globe', async () => {
  const ionTileset = { name: 'ion' };
  const Cesium = stubCesium({ ionResult: ionTileset });
  const result = await loadPhotorealTileset(Cesium, { ionToken: 'ion-token' });

  assert.equal(result.source, 'ion');
  assert.deepEqual(Cesium.calls.map((call) => call.door), ['ion-resource', 'ion']);
});

test('with neither credential nothing is requested at all', async () => {
  const Cesium = stubCesium({});
  const result = await loadPhotorealTileset(Cesium, {});

  assert.equal(result.tileset, null);
  assert.equal(result.source, null);
  assert.deepEqual(result.errors, []);
  // The point of the empty attempt list: no doomed round-trip on boot.
  assert.deepEqual(Cesium.calls, []);
});

test('when both doors are shut the failure names which is which', async () => {
  const Cesium = stubCesium({
    googleResult: new Error('403 PERMISSION_DENIED'),
    ionResult: new Error('401 invalid token'),
  });
  const result = await loadPhotorealTileset(Cesium, { googleApiKey: 'k', ionToken: 't' });

  assert.equal(result.tileset, null);
  assert.equal(
    describePhotorealFailure(result.errors),
    'Google key: 403 PERMISSION_DENIED · Cesium ion: 401 invalid token',
  );
  // A single failure stays a bare cause: naming one door of one is noise.
  assert.equal(describePhotorealFailure([{ source: 'ion', message: '401' }]), '401');
  assert.equal(describePhotorealFailure([]), '');
});

test('each attempt gets its own options object', () => {
  // CesiumJS writes its defaults INTO the options it is handed, so a shared or
  // frozen constant would either leak across doors or throw in strict mode.
  const first = photorealTilesetOptions();
  const second = photorealTilesetOptions();
  assert.notEqual(first, second);
  assert.deepEqual(first, second);
  first.cacheBytes = 1;
  assert.notEqual(second.cacheBytes, 1);
});

test('the attempt callback reports the door before it is tried', async () => {
  const seen = [];
  const Cesium = stubCesium({ googleResult: new Error('nope'), ionResult: { name: 'ion' } });
  await loadPhotorealTileset(Cesium, {
    googleApiKey: 'k',
    ionToken: 't',
    onAttempt: (source) => seen.push(source),
  });
  assert.deepEqual(seen, ['google-key', 'ion']);
});

// ---------------------------------------------------------------------------
// The off switch. ion bills one "root tile" per successful endpoint request,
// so every boot of the app costs a session whether or not anyone looks at the
// 3D globe — which is how 113 harnesses took a 1 000/month tier to 1 001 by
// the fifteenth of the month.
// ---------------------------------------------------------------------------

test('photoreal is on by default, and off for ?photoreal=0', () => {
  assert.equal(photorealDisabled({ location: { search: '' } }), false);
  assert.equal(photorealDisabled({ location: { search: '?photoreal=0' } }), true);
  assert.equal(photorealDisabled({ location: { search: '?lat=48&photoreal=0&lon=2' } }), true);
});

test('only an explicit 0 disables it', () => {
  // A typo must not silently cost the app its default basemap, so every value
  // that is not `0` — including the ones that LOOK falsy — leaves it on.
  for (const search of ['?photoreal=1', '?photoreal=', '?photoreal', '?photoreal=false', '?photoreal=00']) {
    assert.equal(photorealDisabled({ location: { search } }), false, search);
  }
});

test('the window flag disables it without touching the URL', () => {
  // The door the QA fleet uses: a query param falls off the moment a harness
  // composes its own URL mid-run, and that would flip the surface regime under
  // a height assertion rather than merely losing the saving.
  assert.equal(photorealDisabled({ [PHOTOREAL_DISABLE_GLOBAL]: true, location: { search: '' } }), true);
  // Truthy is not enough: only the boolean, so a stray string on `window`
  // cannot switch the globe off.
  assert.equal(photorealDisabled({ [PHOTOREAL_DISABLE_GLOBAL]: 'yes', location: { search: '' } }), false);
});

test('a scope with no location does not throw', () => {
  assert.equal(photorealDisabled({}), false);
  assert.equal(photorealDisabled(null), false);
});

test('the desktop options are pinned whole, and no phone lever leaks into them', () => {
  // The phone ceilings are a NEW branch, not a rewrite of the old one. A
  // desktop that started degrading its mesh because a phone needed less memory
  // would be a regression nobody looked for, so the old object is pinned whole
  // — including the two options a phone adds and a desktop must not have.
  assert.deepEqual(photorealTilesetOptions({ phone: false }), {
    cacheBytes: 1536 * 1024 * 1024,
    maximumCacheOverflowBytes: 1024 * 1024 * 1024,
    enableCollision: true,
    // Inert until a layer drapes imagery on the mesh; then the difference
    // between a mesh that waits for the drape and one that shows meanwhile.
    asynchronouslyLoadImagery: true,
  });
  assert.equal(DESKTOP_CACHE_BYTES, 1536 * 1024 * 1024);
  assert.equal(DESKTOP_CACHE_OVERFLOW_BYTES, 1024 * 1024 * 1024);
});

test('a phone declares a sixth of the cache, and keeps its collisions', () => {
  const options = photorealTilesetOptions({ phone: true });
  assert.equal(options.cacheBytes, PHONE_CACHE_BYTES);
  assert.equal(options.maximumCacheOverflowBytes, PHONE_CACHE_OVERFLOW_BYTES);
  assert.equal(options.maximumScreenSpaceError, PHONE_MAX_SCREEN_SPACE_ERROR);
  // A `flyTo` that preloaded its destination would hold two views of tiles at
  // once, on the one device that cannot hold one.
  assert.equal(options.preloadFlightDestinations, false);
  // NOT a memory lever, and switching it off would break `Scene.getHeight` —
  // the camera's floor under a pinch — plus every CLAMP_TO_GROUND placement.
  assert.equal(options.enableCollision, true);
  assert.equal(options.asynchronouslyLoadImagery, true);
  // The declared ceiling plus its overflow has to leave room for the heap, the
  // imagery under the mesh and the terrain inside a ~1.2 GB process budget.
  assert.ok(
    (PHONE_CACHE_BYTES + PHONE_CACHE_OVERFLOW_BYTES) * 1.5 < 800 * 1024 * 1024,
    'estimated bytes undercount real residency by roughly half again',
  );
});

test('both doors build the tileset with the ceilings this session asked for', () => {
  const doorOptions = async (phone) => {
    const Cesium = stubCesium({ googleResult: { name: 'google' } });
    await loadPhotorealTileset(Cesium, { googleApiKey: 'k', phone });
    const ion = stubCesium({ googleResult: null, ionResult: { name: 'ion' } });
    await loadPhotorealTileset(ion, { ionToken: 't', phone });
    return [
      Cesium.calls.find((c) => c.door === 'google-key').tilesetOptions,
      ion.calls.find((c) => c.door === 'ion').tilesetOptions,
    ];
  };
  return Promise.all([doorOptions(true), doorOptions(false)]).then(([phone, desktop]) => {
    for (const options of phone) assert.equal(options.cacheBytes, PHONE_CACHE_BYTES);
    for (const options of desktop) assert.equal(options.cacheBytes, DESKTOP_CACHE_BYTES);
  });
});
