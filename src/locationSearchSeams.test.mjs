// src/locationSearchSeams.test.mjs
// The three public seams the first-run card drives the globe through:
// `flyToAddress`, `locateMe` and `openLocationSearch` on StyleManager.
// `ui.js` cannot be imported under `node:test` (it pulls Cesium), so these are
// source-shape pins, like the camera-handoff ones next door.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ui = readFileSync(new URL('./ui.js', import.meta.url), 'utf8');

function method(pattern, name) {
  const match = ui.match(pattern);
  assert.ok(match, `${name} is gone`);
  return match[1];
}

const flyToAddress = method(
  /async flyToAddress\(input, \{ onArrival = null, searchField = null \} = \{\}\) \{([\s\S]*?)\n  \}/,
  'flyToAddress',
);
const locateMe = method(
  /async locateMe\(\{ onArrival = null, notify = true \} = \{\}\) \{([\s\S]*?)\n  \}/,
  'locateMe',
);

test('flyToAddress hands the landing to its caller, both ways it can end', () => {
  // The promise resolves when the flight STARTS. A caller that waits for the
  // camera to land has only these two hooks to go on, so both must be wired.
  assert.match(flyToAddress, /onComplete: \(\) => \{[\s\S]*?onArrival\?\.\('arrived'\);/);
  assert.match(flyToAddress, /onCancel: \(\) => onArrival\?\.\('cancelled'\)/);
  // A reader who shares straight after landing must not post the previous view.
  assert.match(flyToAddress, /onComplete: \(\) => \{[\s\S]*?this\.shareLinkManager\?\.flushHash\?\.\(\);[\s\S]*?onArrival/);
});

test('flyToAddress names every outcome instead of toasting it', () => {
  for (const status of ['refused', 'cancelled', 'not-found', 'superseded', 'failed', 'flying']) {
    assert.match(flyToAddress, new RegExp(`status: '${status}'`), `missing the ${status} outcome`);
  }
  // Toasts are the search box's business, not the seam's: the first-run card
  // writes its own French status line instead.
  assert.doesNotMatch(flyToAddress, /_showToast/);
  assert.match(ui, /if \(outcome\.status === 'not-found'\) this\._showToast\(messages\(\)\.toast\.locationNotFound\);/);
  assert.match(ui, /else if \(outcome\.status === 'failed'\) this\._showToast\(messages\(\)\.toast\.searchFailed\);/);
});

test('flyToAddress always settles the search field it claimed', () => {
  const finallyBlock = flyToAddress.slice(flyToAddress.lastIndexOf('} finally {'));
  assert.match(finallyBlock, /this\._settleLocationSearchUi\(generation\);/);
  // The shared landing state, not a second copy of it.
  assert.match(flyToAddress, /this\._landOnSearchedLocation\(label\);/);
});

test('locateMe reports its landing and only toasts when asked to', () => {
  assert.match(locateMe, /onArrival\?\.\('arrived'\);/);
  assert.match(locateMe, /onCancel: \(\) => onArrival\?\.\('cancelled'\)/);
  assert.match(locateMe, /if \(notify\) this\._showToast\(message, \{ durationMs: 4000 \}\);/);
  assert.match(locateMe, /return \{ status: 'failed', message \};/);
  // The button keeps its own entry point and its toast.
  assert.match(ui, /this\._locateBtn\.addEventListener\('click', \(\) => \{ void this\._locateMe\(\); \}\);/);
  assert.match(ui, /async _locateMe\(\) \{\s*await this\.locateMe\(\);\s*\}/);
});

test('openLocationSearch opens the tray the way a click does, then focuses the field', () => {
  const open = method(/openLocationSearch\(\) \{([\s\S]*?)\n  \}/, 'openLocationSearch');
  assert.match(open, /this\.setPanelCollapsed\('location-bar', false, \{ explicit: true \}\);/);
  assert.match(open, /field\.classList\.add\('expanded'\);/);
  assert.match(open, /field\.focus\(\);/);
  // The tray fades in from `visibility: hidden`, which refuses focus at the
  // fade's first instant: a second attempt once it shows.
  assert.match(open, /if \(document\.activeElement !== field\) \{\s*window\.setTimeout\(\(\) => field\.focus\(\), LOCATION_TRAY_FADE_MS\);/);
  assert.match(ui, /const LOCATION_TRAY_FADE_MS = 200;/);
});
