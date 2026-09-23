// The night atlas: Noir darkens the BASEMAP inside the scene and leaves every
// layer its own colour. These tests hold the two halves of that contract that
// run without a GPU — the arithmetic of the dimmed ground, and the signal a
// layer follows to put on its night dress.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NIGHT_ATLAS_STYLE,
  STYLE_CHANGE_EVENT,
  isNightAtlasStyle,
  nightAtlasActive,
  watchNightAtlas,
} from './nightAtlas.js';
import {
  NIGHT_BASEMAP_DEFAULTS,
  NIGHT_BRIGHTNESS_FLOOR,
  createNightBasemap,
  nightBasemapAdjustment,
} from './nightBasemap.js';
import { noirShader } from './noir.js';

test('Noir is the night atlas, and no other preset is', () => {
  assert.equal(NIGHT_ATLAS_STYLE, 'noir');
  assert.equal(isNightAtlasStyle('noir'), true);
  for (const style of ['normal', 'retro', 'surveillance', 'thermal', 'anime', 'dusk', null, undefined]) {
    assert.equal(isNightAtlasStyle(style), false, String(style));
  }
});

test('the dimmed ground is untouched at zero intensity and floored at full', () => {
  assert.deepEqual(nightBasemapAdjustment(0, 1, 1), { brightness: 1, saturation: 1 });
  const full = nightBasemapAdjustment(1, 1, 1);
  assert.ok(Math.abs(full.brightness - NIGHT_BRIGHTNESS_FLOOR) < 1e-12);
  assert.equal(full.saturation, 0);
  // Halfway through the crossfade, halfway there.
  const half = nightBasemapAdjustment(0.5, 1, 0);
  assert.ok(Math.abs(half.brightness - (1 + NIGHT_BRIGHTNESS_FLOOR) / 2) < 1e-12);
  assert.equal(half.saturation, 1);
  // Out-of-range and missing inputs clamp rather than invert the ground.
  assert.deepEqual(nightBasemapAdjustment(3, -1, Number.NaN), { brightness: 1, saturation: 1 });
});

test('the default darkness sends a snowfield under the bloom threshold', () => {
  // `noir.js` blooms from a peak channel of 0.55 up; a snowfield is ~0.9.
  const { brightness } = nightBasemapAdjustment(1, NIGHT_BASEMAP_DEFAULTS.dim, NIGHT_BASEMAP_DEFAULTS.desat);
  assert.ok(0.9 * brightness < 0.55, `snow lands at ${(0.9 * brightness).toFixed(2)}`);
  // The sliders start where the controller's defaults are.
  assert.equal(noirShader.uniforms.dimAmt.default, NIGHT_BASEMAP_DEFAULTS.dim);
  assert.equal(noirShader.uniforms.desatAmt.default, NIGHT_BASEMAP_DEFAULTS.desat);
});

test('the post pass no longer desaturates: it reads neither darkness nor desaturation', () => {
  // Those two act on the basemap, in the scene. A shader that read them would
  // be greying the data again.
  assert.doesNotMatch(noirShader.fragmentShader, /dimAmt|desatAmt|sepia|luma\s*=/);
});

function fakeScene() {
  const listeners = [];
  return {
    preRender: {
      addEventListener(listener) {
        listeners.push(listener);
        return () => listeners.splice(listeners.indexOf(listener), 1);
      },
    },
    frame() { for (const listener of [...listeners]) listener(); },
    listeners,
  };
}

test('only the basemap imagery is dimmed, and it is restored exactly', () => {
  const scene = fakeScene();
  const basemap = { brightness: 1, saturation: 1 };
  const tinted = { brightness: 0.8, saturation: 1.2 };
  const overlay = { brightness: 1, saturation: 1 };
  const state = { intensity: 1, dim: 1, desat: 0.5 };
  const layers = [basemap, tinted];
  const night = createNightBasemap({
    scene,
    readState: () => state,
    getImageryLayers: () => layers,
  });
  scene.frame();
  assert.ok(Math.abs(basemap.brightness - NIGHT_BRIGHTNESS_FLOOR) < 1e-12);
  assert.equal(basemap.saturation, 0.5);
  // A stack's own adjustment is scaled, not replaced.
  assert.ok(Math.abs(tinted.brightness - 0.8 * NIGHT_BRIGHTNESS_FLOOR) < 1e-12);
  assert.ok(Math.abs(tinted.saturation - 0.6) < 1e-12);
  // A data overlay is not the ground.
  assert.deepEqual(overlay, { brightness: 1, saturation: 1 });

  state.intensity = 0;
  scene.frame();
  assert.deepEqual(basemap, { brightness: 1, saturation: 1 });
  assert.deepEqual(tinted, { brightness: 0.8, saturation: 1.2 });

  state.intensity = 1;
  scene.frame();
  night.destroy();
  assert.deepEqual(basemap, { brightness: 1, saturation: 1 });
  assert.equal(scene.listeners.length, 0);
});

test('the tileset shader is attached only while the preset is visible', () => {
  const scene = fakeScene();
  const tileset = { customShader: undefined, isDestroyed: () => false };
  const state = { intensity: 0, dim: 0.7, desat: 0.6 };
  let active = tileset;
  const night = createNightBasemap({ scene, readState: () => state, getTileset: () => active });
  scene.frame();
  assert.equal(tileset.customShader, undefined, 'no shader, no recompile, at intensity 0');
  state.intensity = 1;
  scene.frame();
  assert.ok(tileset.customShader, 'attached once the preset shows');
  // The stack switched away: the tileset is no longer the ground.
  active = null;
  scene.frame();
  assert.equal(tileset.customShader, undefined);
  night.destroy();
});

test('a layer hears the night atlas turn on and off, and nothing else', { skip: typeof EventTarget === 'undefined' }, () => {
  const target = new EventTarget();
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const root = { dataset: { gevStyle: 'normal' } };
  globalThis.window = target;
  globalThis.document = { documentElement: root };
  try {
    const heard = [];
    const stop = watchNightAtlas((night) => heard.push(night));
    const change = (style) => {
      root.dataset.gevStyle = style;
      target.dispatchEvent(Object.assign(new Event(STYLE_CHANGE_EVENT), { detail: { style } }));
    };
    change('retro');
    change('noir');
    assert.equal(nightAtlasActive(), true);
    change('noir');
    change('thermal');
    change('surveillance');
    stop();
    change('noir');
    assert.deepEqual(heard, [true, false]);
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  }
});
