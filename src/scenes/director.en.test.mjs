// The scene recorder, in both languages.
//
// THE DIRECTION IS REVERSED HERE. The recorder came from upstream in English,
// so the English below is the ORIGINAL, pinned word for word to prove this
// batch did not quietly rewrite it, and the French is the side that is new.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SceneDirector } from './director.js';
import { SCENE_RECIPES } from './recipes.js';
import messages from './director.i18n.js';
import { assertNoFrench, useTestLocale, withLocale } from '../i18n/testing.js';

/** The browser globals the director touches, with no stored project. */
function installRuntime() {
  const noopClassList = { add() {}, remove() {}, toggle() {}, contains: () => false };
  const originalDocument = globalThis.document;
  const originalLocalStorage = globalThis.localStorage;
  globalThis.document = {
    getElementById: () => null,
    createElement: () => ({ classList: noopClassList, style: {}, appendChild() {}, remove() {} }),
    addEventListener() {},
    removeEventListener() {},
    body: { classList: noopClassList, appendChild() {} },
  };
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  return () => {
    globalThis.document = originalDocument;
    globalThis.localStorage = originalLocalStorage;
  };
}

const viewer = { camera: { flyTo() {}, cancelFlight() {} } };
const styleManager = {
  getCameraState: () => ({ lat: 0, lon: 0, alt: 1000, heading: 0, pitch: -40, roll: 0 }),
  getVisualState: () => ({ style: 'normal' }),
  setRecordingMode() {},
};
const dataManager = { getAll: () => [], getLayerParams: () => null };

/** A director over a default project, built in one language. */
function freshDirector(locale) {
  return withLocale(locale, () => {
    const restore = installRuntime();
    try {
      return { director: new SceneDirector(viewer, styleManager, dataManager) };
    } finally {
      restore();
    }
  });
}

test('the built-in scenes keep their English names and gain French ones', () => {
  const english = withLocale('en', () => SCENE_RECIPES.map((recipe) => recipe.title));
  assert.deepEqual(english, [
    'Global Flights Radar',
    'Orbital Watch',
    'Thermal Threat Board',
    'City Overload',
    'Omniscience Pullback',
    'Bordeaux Transport Pulse',
    'France Transit Showcase',
    'Roissy Departures and Noise Exposure Plan',
  ]);
  assertNoFrench(english, { allow: ['Bordeaux', 'France', 'Roissy'] });

  const french = withLocale('fr', () => SCENE_RECIPES.map((recipe) => recipe.title));
  assert.equal(french[0], 'Radar des vols mondiaux');
  assert.equal(french[5], 'Pouls des transports bordelais');
  // The ids never move: a saved project points at them.
  assert.deepEqual(SCENE_RECIPES.map((recipe) => recipe.id),
    withLocale('fr', () => SCENE_RECIPES.map((recipe) => recipe.id)));
});

test('a default project is named in the language it was created in', () => {
  const { director } = freshDirector('en');
  assert.deepEqual(director.listScenes().map((scene) => scene.title)[0], 'Global Flights Radar');
  assert.match(director.listScenes()[0].id, /^flights-radar$/);

  const french = freshDirector('fr');
  assert.equal(french.director.listScenes()[0].title, 'Radar des vols mondiaux');
});

test('a captured shot is a « plan » in French and a “shot” in English', () => {
  const restore = installRuntime();
  try {
    const { director } = freshDirector('en');
    withLocale('en', () => director.captureShot());
    const englishShot = director.listScenes()[0].shots;
    assert.ok(englishShot >= 1);

    // The default title is read at capture time, so the same loaded director
    // answers in whichever language the page is in.
    assert.equal(withLocale('en', () => messages().shotTitle(1)), 'Shot 1');
    assert.equal(withLocale('fr', () => messages().shotTitle(1)), 'Plan 1');
    assert.equal(withLocale('en', () => messages().sceneTitle(2)), 'Scene 2');
    assert.equal(withLocale('fr', () => messages().sceneTitle(2)), 'Scène 2');
  } finally {
    restore();
  }
});

test('the status line, the prompts and the shot metadata read in both languages', (t) => {
  useTestLocale('en', t);
  const m = messages();
  assert.equal(m.ready, 'Ready');
  assert.equal(m.noShots, 'No shots yet. Use CAPTURE SHOT to save current look.');
  assert.equal(m.load, 'LOAD');
  assert.equal(m.delete, 'DEL');
  assert.equal(m.confirmDeleteScene('Orbital Watch'), 'Delete scene “Orbital Watch” and all shots?');
  assert.equal(m.confirmDeleteShot('Shot 3'), 'Delete shot “Shot 3”?');
  assert.equal(m.captured('Orbital Watch', 'Shot 3'), 'Captured: Orbital Watch / Shot 3');
  assert.equal(m.running('2', '5', 'Orbital Watch', 'Shot 3'), 'Running 2/5: Orbital Watch / Shot 3');
  assert.equal(m.runComplete, 'Scene run complete');
  assert.equal(m.cameraUnavailable, 'Camera unavailable — exit cockpit first');
  assert.equal(m.importFailed, 'Import failed (invalid JSON)');
  assert.equal(m.layersRefused('flights, satellites'), 'Layers refused: flights, satellites');
  assert.equal(m.shotMeta('RETRO', 'OFF', '4.0', '0.9'), 'RETRO · OFF · 4.0s + 0.9s');
  assert.equal(m.progress('45'), '45%');
  assertNoFrench(m, { allow: ['Orbital Watch', 'Shot 3'] });

  const fr = withLocale('fr', messages);
  assert.equal(fr.ready, 'Prêt', 'the same word index.html carries under scenes.ready');
  assert.equal(fr.load, 'CHARGER');
  assert.equal(fr.delete, 'SUPPR', 'the same abbreviation as scenes.delete');
  assert.equal(fr.shotMeta('RETRO', 'OFF', '4,0', '0,9'), 'RETRO · OFF · 4,0 s + 0,9 s');
  assert.equal(fr.progress('45'), '45 %');
  assert.match(fr.noShots, /CAPTURER UN PLAN/, 'it names the button by the words on it');
});
