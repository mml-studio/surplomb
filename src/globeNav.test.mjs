// src/globeNav.test.mjs — the navigation bar at the bottom of a desktop (2026-09-23).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  DEFAULT_TILT_PITCH_DEG,
  FLAT_DRIFT_DEG,
  HISTORY_ZOOM_RATIO,
  PLACE_LOOKUP_URL,
  TOP_VIEW_PITCH_DEG,
  VIEW_HISTORY_MAX,
  ZOOM_MAX_RANGE_M,
  ZOOM_MIN_RANGE_M,
  createViewHistory,
  headingDeltaDeg,
  isInFranceBoxes,
  isNorthUp,
  isSameFraming,
  isTopDownPitch,
  needsLevelling,
  normalizeDeg,
  placeLevelForRange,
  placeLookupKey,
  placeLookupUrl,
  placeNameFromReply,
  viewMode,
  zoomedRange,
} from './globeNav.js';

const indexHtml = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const uiSource = fs.readFileSync(new URL('./ui.js', import.meta.url), 'utf8');
const mainSource = fs.readFileSync(new URL('./main.js', import.meta.url), 'utf8');

/** A settled camera over Paris, in round numbers: 1 km up, looking north-west. */
function pose({ x = 4_200_000, y = 170_000, z = 4_780_000, heightM = 1000, headingDeg = 315, pitchDeg = -30 } = {}) {
  return {
    position: { x, y, z },
    direction: { x: 0, y: 0, z: -1 },
    up: { x: 0, y: 1, z: 0 },
    heightM,
    headingDeg,
    pitchDeg,
  };
}

test('headings wrap, and the shortest turn is taken either way round', () => {
  assert.equal(normalizeDeg(-10), 350);
  assert.equal(normalizeDeg(725), 5);
  assert.equal(headingDeltaDeg(350, 10), 20);
  assert.equal(headingDeltaDeg(10, 350), -20);
  assert.equal(headingDeltaDeg(0, 180), 180);
  assert.equal(isNorthUp(359.5), true);
  assert.equal(isNorthUp(0.9), true);
  assert.equal(isNorthUp(3), false);
  assert.equal(isNorthUp(NaN), false);
});

test('a view looks straight down from -85°, and « Vue du dessus » flies just short of -90° to keep its heading', () => {
  assert.equal(isTopDownPitch(-90), true);
  assert.equal(isTopDownPitch(-85), true);
  assert.equal(isTopDownPitch(-84.9), false);
  assert.equal(isTopDownPitch(TOP_VIEW_PITCH_DEG), true);
  assert.ok(TOP_VIEW_PITCH_DEG > -90, 'at exactly -90° Cesium lookAt puts north up whatever the heading');
  assert.ok(DEFAULT_TILT_PITCH_DEG < -5 && DEFAULT_TILT_PITCH_DEG > -85);
  assert.equal(viewMode({ flat: true, pitchDeg: -30 }), 'flat');
  assert.equal(viewMode({ flat: false, pitchDeg: -89.9 }), 'top');
  assert.equal(viewMode({ flat: false, pitchDeg: -30 }), 'relief');
});

test('2D levels a settled view that drifted past a few degrees, not after every notch of the wheel', () => {
  assert.equal(needsLevelling({ pitchDeg: -90, headingDeg: 0 }), false);
  assert.equal(needsLevelling({ pitchDeg: -89.4, headingDeg: 359.2 }), false);
  assert.equal(needsLevelling({ pitchDeg: -90 + FLAT_DRIFT_DEG + 1, headingDeg: 0 }), true);
  assert.equal(needsLevelling({ pitchDeg: -30, headingDeg: 315 }), true, 'a search lands tilted');
  assert.equal(needsLevelling({ pitchDeg: -90, headingDeg: 10 }), true);
  assert.equal(needsLevelling({ pitchDeg: NaN, headingDeg: 0 }), false);
});

test('one zoom press halves or doubles the distance, never through the ground nor past the globe', () => {
  assert.equal(zoomedRange(1000, 1), 500);
  assert.equal(zoomedRange(1000, -1), 2000);
  assert.equal(zoomedRange(80, 1), ZOOM_MIN_RANGE_M);
  assert.equal(zoomedRange(ZOOM_MAX_RANGE_M * 0.9, -1), ZOOM_MAX_RANGE_M);
});

test('a small adjustment is the same framing; a zoom, a turn, a tilt or a move away is a new one', () => {
  const here = pose();
  assert.equal(isSameFraming(here, pose({ x: 4_200_100 })), true, '100 m at 1 km up');
  assert.equal(isSameFraming(here, pose({ heightM: 1200, headingDeg: 330, pitchDeg: -35 })), true);
  assert.equal(isSameFraming(here, pose({ x: 4_200_500 })), false, '500 m at 1 km up');
  assert.equal(isSameFraming(here, pose({ heightM: 1000 * HISTORY_ZOOM_RATIO })), false);
  assert.equal(isSameFraming(here, pose({ headingDeg: 5 })), false, 'a 50° turn across north');
  assert.equal(isSameFraming(here, pose({ pitchDeg: -89.9 })), false);
  assert.equal(isSameFraming(here, null), false);
});

test('« Vue précédente » steps back through framings, not through every settle', () => {
  const history = createViewHistory();
  const paris = pose();
  const parisNudged = pose({ x: 4_200_150 });
  const lyon = pose({ x: 4_420_000, y: 370_000, z: 4_580_000, headingDeg: 20 });
  assert.equal(history.canGoBack(), false);
  assert.equal(history.back(paris), null, 'nothing before the first framing');

  assert.equal(history.record(paris), true);
  assert.equal(history.record(parisNudged), false, 'a nudge refines the framing');
  assert.equal(history.size, 1);
  assert.equal(history.canGoBack(), false);

  assert.equal(history.record(lyon), true);
  assert.equal(history.canGoBack(), true);
  // Back from Lyon returns to where the reader last stood in Paris: the nudge.
  assert.deepEqual(history.back(lyon), parisNudged);
  assert.equal(history.size, 1);
  // The flight home settles on that framing: no new entry, and nothing further back.
  assert.equal(history.record(parisNudged), false);
  assert.equal(history.canGoBack(), false);
});

test('small moves that add up to a new place do open a new framing', () => {
  const history = createViewHistory();
  const start = pose();
  history.record(start);
  let last = start;
  for (let step = 1; step <= 6; step += 1) {
    last = pose({ x: 4_200_000 + step * 100 });
    history.record(last);
  }
  assert.equal(history.size, 2, 'measured from where the framing began, not from the last settle');
  assert.deepEqual(history.back(last), pose({ x: 4_200_300 }), 'the last pose before it crossed the line');
});

test('pressed mid-move, « Vue précédente » returns to the framing the camera left', () => {
  const history = createViewHistory();
  const paris = pose();
  history.record(paris);
  const midDrag = pose({ x: 4_205_000 });
  assert.deepEqual(history.back(midDrag), paris);
  assert.equal(history.size, 1, 'the framing stays: it is where the camera is going');
});

test('the history keeps the last thirty framings', () => {
  const history = createViewHistory();
  for (let i = 0; i < VIEW_HISTORY_MAX + 5; i += 1) history.record(pose({ x: 4_200_000 + i * 10_000 }));
  assert.equal(history.size, VIEW_HISTORY_MAX);
});

test('the chip names the commune, then the département, then the région, then nothing', () => {
  assert.equal(placeLevelForRange(900), 'commune');
  assert.equal(placeLevelForRange(60_000), 'commune');
  assert.equal(placeLevelForRange(200_000), 'departement');
  assert.equal(placeLevelForRange(1_000_000), 'region');
  assert.equal(placeLevelForRange(18_000_000), null, 'the whole globe');
  assert.equal(placeLevelForRange(NaN), null);

  const reply = [{
    nom: 'Biarritz',
    code: '64122',
    departement: { code: '64', nom: 'Pyrénées-Atlantiques' },
    region: { code: '75', nom: 'Nouvelle-Aquitaine' },
  }];
  assert.equal(placeNameFromReply(reply, 'commune'), 'Biarritz');
  assert.equal(placeNameFromReply(reply, 'departement'), 'Pyrénées-Atlantiques');
  assert.equal(placeNameFromReply(reply, 'region'), 'Nouvelle-Aquitaine');
  assert.equal(placeNameFromReply([], 'commune'), null, 'the sea, or abroad');
  assert.equal(placeNameFromReply(null, 'commune'), null);
  assert.equal(placeNameFromReply(reply, null), null);
});

test('only French ground is asked about, once per ~100 m, and with the three names in one request', () => {
  assert.equal(isInFranceBoxes(48.8584, 2.2945), true, 'Paris');
  assert.equal(isInFranceBoxes(43.48, -1.56), true, 'Biarritz');
  assert.equal(isInFranceBoxes(41.93, 8.74), true, 'Ajaccio');
  assert.equal(isInFranceBoxes(-20.88, 55.45), true, 'Saint-Denis de La Réunion');
  assert.equal(isInFranceBoxes(40.71, -74.0), false, 'New York');
  assert.equal(isInFranceBoxes(NaN, 2), false);
  assert.equal(placeLookupKey(48.85812, 2.29412), placeLookupKey(48.8584, 2.2944));
  assert.notEqual(placeLookupKey(48.8584, 2.2944), placeLookupKey(48.8604, 2.2944));
  const url = new URL(placeLookupUrl(43.4832, -1.5586));
  assert.equal(`${url.origin}${url.pathname}`, PLACE_LOOKUP_URL);
  assert.equal(url.searchParams.get('fields'), 'nom,departement,region');
  assert.equal(url.searchParams.get('lat'), '43.48320');
});

test('the bar ships hidden inside the dock, with a name and a tooltip on every control', () => {
  const nav = indexHtml.match(/<nav id="globe-nav"[\s\S]*?<\/nav>/)?.[0];
  assert.ok(nav, '#globe-nav is in the markup');
  assert.match(nav, /<nav id="globe-nav"[^>]*\shidden>/);
  const dock = indexHtml.indexOf('<div id="command-dock"');
  const leftStack = indexHtml.indexOf('<div id="left-panel-stack">');
  const navAt = indexHtml.indexOf('<nav id="globe-nav"');
  assert.ok(dock < navAt && navAt < leftStack, 'the bar lives in #command-dock, which the cockpit, clean view and recording hide');
  for (const id of ['globe-nav-back', 'globe-nav-2d', 'globe-nav-3d', 'globe-nav-north', 'globe-nav-zoom-out', 'globe-nav-zoom-in']) {
    assert.match(nav, new RegExp(`id="${id}"[^>]*title="`), `${id} has a tooltip`);
  }
  assert.match(nav, /id="globe-nav-back"[^>]*disabled/, 'nothing to go back to at boot');
  assert.match(nav, /id="globe-nav-3d"[^>]*aria-pressed="true"/);
  assert.match(nav, /id="globe-nav-place"[^>]*hidden/, 'the chip waits for a place');
});

test('« Réinitialiser » is the reset button moved in, and its name starts with its label', () => {
  const navSource = fs.readFileSync(new URL('./globeNav.js', import.meta.url), 'utf8');
  assert.match(navSource, /getElementById\('reset-globe-view'\)/);
  assert.match(indexHtml, /id="reset-globe-view"[\s\S]{0,200}?aria-label="Réinitialiser : revenir au globe entier"/);
  assert.match(mainSource, /initGlobeShell\([^)]*\)\);\s*[\s\S]{0,400}?initGlobeNav\(/, 'after the top row');
});

test('the bar takes the camera like a drag: no navigation stamp, a followed object let go only on request', () => {
  const method = uiSource.match(/takeCameraForGlobeNav\([^)]*\) \{[\s\S]*?\n {2}\}/)?.[0];
  assert.ok(method, 'ui.js has takeCameraForGlobeNav');
  assert.doesNotMatch(method, /_stampNavigation/);
  assert.match(method, /cockpitView\?\.active\) return false/);
  assert.match(method, /if \(release\)[\s\S]*_releaseFollowCamera/);
});

test('the dock holds the bar alone once the voice has left it', () => {
  assert.match(css, /html\.globe-shell #command-dock \{\s*grid-template-areas: 'nav';/);
  assert.match(css, /html\.globe-shell #command-dock:has\(> #gev-voice-control\) \{\s*grid-template-areas: 'nav voice';/);
  assert.match(css, /#globe-nav\[hidden\],\s*#globe-nav-place\[hidden\] \{ display: none !important; \}/);
});
