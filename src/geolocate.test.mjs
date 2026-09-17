import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_CITY_VIEW } from './defaultView.js';
import {
  GEOLOCATE_OPTIONS,
  GEOLOCATE_RANGE_M,
  GEOLOCATE_TOP_DOWN_RANGE_M,
  canGeolocate,
  geolocateErrorMessage,
  geolocateRangeM,
  requestCurrentPosition,
} from './geolocate.js';

test('the fix is asked for cheaply, once, and a recent one is accepted', () => {
  // High accuracy powers the GPS radio: ten to thirty seconds outdoors, never
  // indoors. At 1.2 km of range a cell fix and a satellite fix look the same.
  assert.deepEqual({ ...GEOLOCATE_OPTIONS }, {
    enableHighAccuracy: false,
    timeout: 8000,
    maximumAge: 60000,
  });
  assert.ok(Object.isFrozen(GEOLOCATE_OPTIONS), 'a caller must not retune this per site');
});

test('a vague fix is framed wide enough to contain the truth', () => {
  assert.equal(geolocateRangeM(0), GEOLOCATE_RANGE_M);
  assert.equal(geolocateRangeM(30), GEOLOCATE_RANGE_M, 'a good fix keeps the standard framing');
  assert.equal(geolocateRangeM(600), GEOLOCATE_RANGE_M, 'still inside the 1.2 km frame');
  // THE CASE THIS EXISTS FOR: a desktop IP fix five kilometres wide, framed at
  // 1.2 km, puts the reader confidently in the wrong neighbourhood.
  assert.equal(geolocateRangeM(5000), 10000);
  assert.equal(geolocateRangeM(Number.NaN), GEOLOCATE_RANGE_M);
  assert.equal(geolocateRangeM(-4), GEOLOCATE_RANGE_M);
  assert.equal(geolocateRangeM(undefined), GEOLOCATE_RANGE_M);
});

test('straight down, the fix lands at the opening shot\'s height', () => {
  // Range is height when the camera looks straight down, so a phone keeping
  // 1 200 m would arrive twice as high as its own opening shot.
  assert.equal(GEOLOCATE_TOP_DOWN_RANGE_M, DEFAULT_CITY_VIEW.settleAltitudeM);
  assert.equal(geolocateRangeM(30, { topDown: true }), GEOLOCATE_TOP_DOWN_RANGE_M);
  assert.equal(geolocateRangeM(Number.NaN, { topDown: true }), GEOLOCATE_TOP_DOWN_RANGE_M);
  // The accuracy rule still wins over the base.
  assert.equal(geolocateRangeM(500, { topDown: true }), 1000);
  assert.equal(geolocateRangeM(30, { topDown: false }), GEOLOCATE_RANGE_M);
});

test('every refusal names the next move', () => {
  assert.match(geolocateErrorMessage({ code: 1 }), /réglages du navigateur/);
  assert.match(geolocateErrorMessage({ code: 2 }), /indisponible/);
  assert.match(geolocateErrorMessage({ code: 3 }), /trop de temps/);
  assert.match(geolocateErrorMessage(null), /indisponible/);
  // An insecure origin is refused by the API itself, whatever the code says.
  assert.match(geolocateErrorMessage({ code: 1 }, false), /https/);
});

test('a fix resolves to plain numbers; anything else rejects with a code', async () => {
  const geolocation = {
    getCurrentPosition(onSuccess) {
      onSuccess({ coords: { latitude: 44.8378, longitude: -0.5792, accuracy: 42 } });
    },
  };
  assert.deepEqual(await requestCurrentPosition({ geolocation }), {
    lat: 44.8378, lon: -0.5792, accuracyM: 42,
  });

  const options = [];
  await requestCurrentPosition({
    geolocation: {
      getCurrentPosition(onSuccess, _onError, positionOptions) {
        options.push(positionOptions);
        onSuccess({ coords: { latitude: 1, longitude: 2 } });
      },
    },
  });
  assert.deepEqual(options, [GEOLOCATE_OPTIONS], 'the frozen options reach the browser');

  await assert.rejects(
    requestCurrentPosition({ geolocation: { getCurrentPosition: (_s, onError) => onError({ code: 1 }) } }),
    (error) => error.code === 1,
  );
  // A browser without the API is the same thing from the reader's side.
  await assert.rejects(requestCurrentPosition({ geolocation: undefined }), (e) => e.code === 2);
  // A fix that carries no coordinates is a failure, not a flight to (0, 0).
  await assert.rejects(
    requestCurrentPosition({ geolocation: { getCurrentPosition: (s) => s({ coords: {} }) } }),
    (e) => e.code === 2,
  );
});

test('the button is not offered where it could only ever fail', () => {
  const nav = { geolocation: { getCurrentPosition() {} } };
  assert.equal(canGeolocate({ nav, secure: true }), true);
  assert.equal(canGeolocate({ nav, secure: false }), false, 'plain HTTP refuses the API outright');
  assert.equal(canGeolocate({ nav: {}, secure: true }), false);
});

test('the flight reuses the search landing state, and closes the address gap', () => {
  const ui = readFileSync(new URL('./ui.js', import.meta.url), 'utf8');
  assert.match(ui, /_initLocateButton\(\)/);
  assert.match(ui, /if \(!canGeolocate\(\)\) return;/);
  // Same landing state as a free-text search: that is what this is.
  assert.match(ui, /this\._searchedLocationLabel = 'Autour de moi';/);
  // `camera.changed` is quiet until `moveEnd`; without the flush a reader who
  // shares straight after arriving posts the PREVIOUS view.
  assert.match(ui, /shareLinkManager\?\.flushHash\?\.\(\)/);
  // One fix, not a watch: a globe that chases the reader cannot be panned away.
  assert.doesNotMatch(ui, /watchPosition/);
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="locate-me"[^>]*hidden[^>]*aria-label="Autour de moi"/);
  assert.match(html, /id="locate-me"[\s\S]{0,200}my_location/);
});
