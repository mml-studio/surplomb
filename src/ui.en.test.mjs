// The shell in English, read through the catalogs the shell draws from.
//
// `src/ui.js` cannot be imported here — it evaluates Cesium's module graph,
// which needs a browser — so this file asserts the two catalogs a reader
// actually meets (`ui.i18n.js` and the static markup's `markup.i18n.js`),
// sentence by sentence, and sweeps both for French that slipped into English.
// The English screenshots in the pull request cover the rendering.
import test from 'node:test';
import assert from 'node:assert/strict';

import uiMessages from './ui.i18n.js';
import markupMessages from './i18n/markup.i18n.js';
import { assertNoFrench, useTestLocale } from './i18n/testing.js';

const ALLOW = ['Open-Meteo.com', 'OPEN-METEO', 'Français', 'SECURITY.md'];

test('every string src/ui.js can draw has an English with no French left in it', (t) => {
  useTestLocale('en', t);
  const m = uiMessages();
  // Functions are not walked by assertNoFrench, so the ones that matter are
  // rendered here with realistic arguments.
  assertNoFrench([
    m,
    m.cockpit.trackCourse('AF1234', '275'),
    m.cockpit.aircraftMeta(m.cockpit.commercial, m.cockpit.liveTrack),
    m.cockpit.route.fitsTitle('CDG', 'JFK'),
    m.cockpit.route.tooLongTitle('CDG', 'SYD'),
    m.cockpit.context.inputsUnknown(2),
    m.cockpit.local.cloud(40),
    m.radio.channel('03', '42'),
    m.radio.playbackPlaying('FIP'),
    m.cctv.meta('Paris', 41, 62, 180, 'MONITOR', ' · CALIBRATED', 'Configured Source', ''),
    m.cctv.loadedClick(128),
    m.toast.cleared(3),
    m.toast.notCleared(1),
    m.share.followExpired('AF1234'),
    m.detection.overlay('dense'),
    m.legend.keyInvalid('FLIR'),
    m.panel.collapseNamed('LAYERS'),
  ], { allow: ALLOW });
});

test('the sentences an English reader meets say the same thing as the French', (t) => {
  useTestLocale('en', t);
  const m = uiMessages();
  assert.equal(m.cockpit.aircraftMeta('COMMERCIAL', 'LIVE TRACK'), 'COMMERCIAL · LIVE TRACK · COURSE ALIGNED');
  assert.equal(m.cockpit.context.inputsUnknown(1), '1 INPUT UNKNOWN · NOT AN ALL-CLEAR');
  assert.equal(m.cockpit.context.inputsUnknown(3), '3 INPUTS UNKNOWN · NOT AN ALL-CLEAR');
  assert.equal(m.cockpit.compass[6], 'W', 'the eight points are a table, and west is W in English');
  assert.equal(m.radio.playbackReady, 'Ready — playback starts only from your action');
  assert.equal(m.cctv.off, 'CCTV OFF');
  assert.equal(m.toast.cleared(3), 'Cleared 3 data layers');
  assert.equal(m.toast.linkCopied, 'Link copied!');
  assert.equal(m.detection.overlayOff, 'Detection overlay: off');
});

test('and the French says what it has always said', () => {
  const m = uiMessages('fr');
  assert.equal(m.cockpit.aircraftMeta('COMMERCIAL', 'SUIVI EN DIRECT'), 'COMMERCIAL · SUIVI EN DIRECT · CAP ALIGNÉ');
  assert.equal(m.cockpit.context.inputsUnknown(1), '1 ENTRÉE INCONNUE · PAS UN FEU VERT');
  assert.equal(m.cockpit.context.inputsUnknown(3), '3 ENTRÉES INCONNUES · PAS UN FEU VERT');
  assert.equal(m.cockpit.compass[6], 'O');
  assert.equal(m.toast.cleared(3), '3 couches éteintes');
  assert.equal(m.toast.cleared(1), '1 couche éteinte');
});

test('the static shell has an English for every element it labels', (t) => {
  useTestLocale('en', t);
  const m = markupMessages();
  assert.equal(m.layers.title, 'DATA LAYERS');
  assert.equal(m.mapSource.title, 'MAP SOURCE');
  assert.equal(m.legend.title, 'LEGEND');
  assert.equal(m.location.title, 'LOCATION');
  assert.equal(m.keySetup.chip, 'POWER UP');
  assert.equal(m.loader.status, 'Initializing photorealistic world…');
  assert.equal(m.firstRun.status, '59 public data layers · 56 need no key');
  assert.equal(m.phone.tabLayers, 'Layers');
  assertNoFrench(m, { allow: ALLOW });
});

test('the numbers the first-visit card carries are the same in both languages', () => {
  for (const locale of ['fr', 'en']) {
    const card = markupMessages(locale).firstRun;
    assert.match(card.status, /59/, `${locale}: the layer count`);
    assert.match(card.status, /56/, `${locale}: the keyless count`);
    assert.match(card.c.chip, /59/);
    assert.match(card.c.chip, /56/);
  }
});
