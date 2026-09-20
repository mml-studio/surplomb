// The six visual styles, in both languages.
//
// THE DIRECTION IS REVERSED HERE. The styles came from upstream in English,
// so the English below is the ORIGINAL, pinned word for word, and the French
// is the side that is new.
//
// The labels are read through the shader objects themselves, which is the
// property that matters: `ui.js` builds a slider from
// `Object.entries(shader.uniforms)` and writes `uMeta.label` when the panel is
// painted, so one loaded module has to answer in whichever language the page
// is in.
import test from 'node:test';
import assert from 'node:assert/strict';
import { animeShader } from './anime.js';
import { noirShader } from './noir.js';
import { retroShader } from './retro.js';
import { snowShader } from './snow.js';
import { nightVisionShader } from './surveillance.js';
import { thermalShader } from './thermal.js';
import { assertNoFrench, withLocale } from '../i18n/testing.js';

const SHADERS = [animeShader, noirShader, retroShader, snowShader, nightVisionShader, thermalShader];

/** Every slider of one style, the way `ui.js` reads them. */
const labels = (shader) => Object.entries(shader.uniforms).map(([, meta]) => meta.label);

test('every slider keeps the English it shipped with', () => {
  const english = withLocale('en', () => Object.fromEntries(SHADERS.map((s) => [s.name, labels(s)])));
  assert.deepEqual(english, {
    anime: ['Saturation', 'Edge Thickness'],
    noir: ['Contrast', 'Grain', 'Vignette'],
    retro: ['Pixelation', 'Distortion', 'Instability'],
    snow: ['Density', 'Wind'],
    surveillance: ['Gain', 'Bloom', 'Scanlines', 'Pixelation'],
    thermal: ['Sensitivity', 'Bloom', 'WHOT/BHOT', 'Pixelation', 'Ironbow'],
  });
  assertNoFrench(english);
});

test('every slider now has a French one, and one control keeps one name', () => {
  const french = withLocale('fr', () => Object.fromEntries(SHADERS.map((s) => [s.name, labels(s)])));
  assert.deepEqual(french, {
    anime: ['Saturation', 'Épaisseur du trait'],
    noir: ['Contraste', 'Grain', 'Vignettage'],
    retro: ['Pixellisation', 'Distorsion', 'Instabilité'],
    snow: ['Densité', 'Vent'],
    surveillance: ['Gain', 'Halo', 'Lignes de balayage', 'Pixellisation'],
    // The instrument's own switches stay as they are, the way a brand does.
    thermal: ['Sensibilité', 'Halo', 'WHOT/BHOT', 'Pixellisation', 'Ironbow'],
  });
  // Four styles expose a pixel grid and two a bloom: one control, one word.
  assert.equal(new Set([french.retro[0], french.surveillance[3], french.thermal[3]]).size, 1);
  assert.equal(new Set([french.surveillance[1], french.thermal[1]]).size, 1);
});

test('a shader’s own id never follows the language', () => {
  const ids = SHADERS.map((shader) => shader.name);
  assert.deepEqual(withLocale('fr', () => SHADERS.map((shader) => shader.name)), ids);
  // The panel reads a default and a range without ever touching the label,
  // which is what lets the label be a getter at all.
  for (const shader of SHADERS) {
    for (const meta of Object.values(shader.uniforms)) {
      assert.equal(typeof meta.default, 'number');
      assert.ok(meta.max > meta.min);
    }
  }
});
