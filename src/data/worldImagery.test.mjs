// Which world satellite base a page may draw, and what it credits.
//
// The rule that matters is the one a browser would break SILENTLY: the
// anonymous Esri endpoint is not available for commercial use, the browser
// fetches its tiles itself, so no page may ask it before the server has said
// the deployment allows it — and a build with its own ArcGIS key never asks it.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';

import {
  ANONYMOUS_ESRI_SOURCE_ID,
  WORLD_IMAGERY,
  WORLD_IMAGERY_CREDIT_KEYS,
  anonymousEsriAllowedByProbe,
  chooseWorldImagery,
  createEsriWorldImageryProvider,
  createWorldImageryProvider,
  hasArcgisApiKey,
  unusedWorldImageryCreditKeys,
} from './worldImagery.js';
import { DATA_CREDITS } from './dataCredits.js';
import { NONCOMMERCIAL_SOURCES, creditKeysOf, sourcesOff } from '../nonCommercialSources.js';

test('a key opens the licensed path, whatever the switch says; without one, only an explicit yes opens Esri', () => {
  const { LICENSED, ANONYMOUS, S2CLOUDLESS } = WORLD_IMAGERY;
  const rows = [
    // key        allowed  degraded  → base
    ['AAPTkey',   false,   false,    LICENSED],
    ['AAPTkey',   true,    false,    LICENSED],
    ['',          true,    false,    ANONYMOUS],
    ['',          false,   false,    S2CLOUDLESS],
    // Not told yet is not "yes": the hosted site's first tiles would be Esri.
    ['',          undefined, false,  S2CLOUDLESS],
    ['',          'true',  false,    S2CLOUDLESS],
    // A dead Esri — either path — lands on Sentinel-2, never on the other Esri.
    ['AAPTkey',   true,    true,     S2CLOUDLESS],
    ['',          true,    true,     S2CLOUDLESS],
    // Whitespace is not a key.
    ['   ',       false,   false,    S2CLOUDLESS],
  ];
  for (const [arcgisApiKey, anonymousEsriAllowed, degraded, expected] of rows) {
    assert.equal(
      chooseWorldImagery({ arcgisApiKey, anonymousEsriAllowed, degraded }),
      expected,
      JSON.stringify({ arcgisApiKey, anonymousEsriAllowed, degraded }),
    );
  }
  assert.equal(chooseWorldImagery(), S2CLOUDLESS);
  assert.equal(hasArcgisApiKey(undefined), false);
  assert.equal(hasArcgisApiKey(42), false);
});

test('the page allows the anonymous endpoint only on an answer that lists what is off and leaves it out', () => {
  assert.equal(anonymousEsriAllowedByProbe({ sourcesOff: [] }), true, 'a clone');
  assert.equal(anonymousEsriAllowedByProbe({ sourcesOff: ['open-meteo'] }), true, 'another source off');
  assert.equal(anonymousEsriAllowedByProbe({ sourcesOff: ['open-meteo', ANONYMOUS_ESRI_SOURCE_ID] }), false);
  // Unlike `offSourcesFromProbe`, a failed read is NOT a clone here: the
  // browser is the only check on these tiles, and a 429 from the edge in front
  // of the hosted site must not turn into Esri requests.
  for (const probe of [null, undefined, 'off', [], {}, { sourcesOff: null }, { sourcesOff: 'x' }]) {
    assert.equal(anonymousEsriAllowedByProbe(probe), false, JSON.stringify(probe));
  }
});

test('the switch the server reads names the anonymous endpoint, and withdraws its credit', () => {
  const entry = NONCOMMERCIAL_SOURCES.find((source) => source.id === ANONYMOUS_ESRI_SOURCE_ID);
  assert.ok(entry, `${ANONYMOUS_ESRI_SOURCE_ID} must be in NONCOMMERCIAL_SOURCES, or the server never reports it`);
  assert.ok(sourcesOff({ GEV_NONCOMMERCIAL_SOURCES: 'off' }).includes(ANONYMOUS_ESRI_SOURCE_ID));
  assert.ok(!sourcesOff({}).includes(ANONYMOUS_ESRI_SOURCE_ID));
  assert.deepEqual(creditKeysOf([ANONYMOUS_ESRI_SOURCE_ID]), [WORLD_IMAGERY_CREDIT_KEYS[WORLD_IMAGERY.ANONYMOUS]]);
  // And the server's answer, read by the page, is what closes the endpoint.
  assert.equal(anonymousEsriAllowedByProbe({ sourcesOff: sourcesOff({ GEV_NONCOMMERCIAL_SOURCES: 'off' }) }), false);
  assert.equal(anonymousEsriAllowedByProbe({ sourcesOff: sourcesOff({}) }), true);
});

test('each world base has its own popover line, and a build withdraws the Esri path it cannot draw', () => {
  const keys = new Set(DATA_CREDITS.map((credit) => credit.key));
  for (const key of Object.values(WORLD_IMAGERY_CREDIT_KEYS)) assert.ok(keys.has(key), `${key} has no attribution entry`);
  const html = (key) => DATA_CREDITS.find((credit) => credit.key === key).html;
  assert.match(html('world-satellite-arcgis'), /Powered by <a[^>]*>Esri<\/a>/);
  assert.match(html('world-satellite-arcgis'), /ArcGIS Location Platform/);
  assert.match(html('world-satellite-keyless'), /not available for commercial use/);
  assert.match(html('world-satellite-s2cloudless'), /Sentinel-2 cloudless 2017/);
  // The Sentinel-2 line never names Esri, so withdrawing Esri leaves a true popover.
  assert.doesNotMatch(html('world-satellite-s2cloudless'), /arcgis|Esri World Imagery/i);

  assert.deepEqual(unusedWorldImageryCreditKeys('AAPTkey'), ['world-satellite-keyless']);
  assert.deepEqual(unusedWorldImageryCreditKeys(''), ['world-satellite-arcgis']);
  assert.deepEqual(unusedWorldImageryCreditKeys(undefined), ['world-satellite-arcgis']);
});

test('the licensed provider asks ibasemaps with the key as `token`, and says "Powered by Esri" on screen', () => {
  const provider = createEsriWorldImageryProvider({ apiKey: '  AAPT+key/with=chars  ' });
  assert.ok(provider instanceof Cesium.UrlTemplateImageryProvider);
  assert.match(provider.url, /^https:\/\/ibasemaps-api\.arcgis\.com\/arcgis\/rest\/services\/World_Imagery\/MapServer\/tile\/\{z\}\/\{y\}\/\{x\}\?token=/);
  assert.ok(provider.url.endsWith(`token=${encodeURIComponent('AAPT+key/with=chars')}`), provider.url);
  assert.doesNotMatch(provider.url, /arcgisonline/);
  // Same cap as the anonymous path: the base never outruns IGN, and every
  // level past it would be a billed tile.
  assert.equal(provider.maximumLevel, 19);
  assert.match(provider.credit.html, /^Powered by <a[^>]*>Esri<\/a>/);
  assert.match(provider.credit.html, /Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community/);
  assert.equal(provider.credit.showOnScreen, true);
});

test('each kind builds the provider it names, and none asks a NonCommercial EOX vintage', () => {
  const licensed = createWorldImageryProvider(WORLD_IMAGERY.LICENSED, { arcgisApiKey: 'AAPTkey' });
  const anonymous = createWorldImageryProvider(WORLD_IMAGERY.ANONYMOUS, { arcgisApiKey: 'AAPTkey' });
  const fallback = createWorldImageryProvider(WORLD_IMAGERY.S2CLOUDLESS);
  assert.match(licensed.url, /ibasemaps-api\.arcgis\.com/);
  assert.match(anonymous.url, /^https:\/\/services\.arcgisonline\.com\//);
  assert.doesNotMatch(anonymous.url, /token=/, 'the anonymous endpoint is never handed the key');
  assert.match(fallback.url, /s2cloudless-2017_3857/);
  assert.equal(fallback.maximumLevel, 14);
});
