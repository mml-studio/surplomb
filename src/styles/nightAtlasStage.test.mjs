// Night and Dusk as the post-process stages the UI drives: one stage on a
// desktop, the bloom at half resolution on a frame drawn above CSS size.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';

import { duskShader } from './dusk.js';
import { NIGHT_ATLAS_FINISH_SHADER, NIGHT_ATLAS_GLOW_SHADER, noirShader } from './noir.js';
import { createNightAtlasStage, nightAtlasGlowHalved } from './nightAtlasStage.js';

const uniformsOf = (shader) => ({
  intensity: 0,
  ...Object.fromEntries(Object.entries(shader.uniforms).map(([key, meta]) => [key, meta.default])),
});

test('only a frame drawn above CSS size halves the bloom', () => {
  assert.equal(nightAtlasGlowHalved(2), true, 'a phone (phoneRender.js)');
  assert.equal(nightAtlasGlowHalved(1.5), true);
  assert.equal(nightAtlasGlowHalved(1), false, 'a desktop at CSS size');
  assert.equal(nightAtlasGlowHalved(undefined), false);
});

test('on a desktop the pass is the one stage it always was', () => {
  const stage = createNightAtlasStage(Cesium, { name: 'godsEyeView_dusk', uniforms: uniformsOf(duskShader) });
  assert.ok(stage instanceof Cesium.PostProcessStage);
  assert.equal(stage.fragmentShader, noirShader.fragmentShader);
  assert.equal(stage.textureScale, 1);
});

test('on a phone the bloom is a half-resolution stage the finish reads back by name', () => {
  const stage = createNightAtlasStage(Cesium, {
    name: 'godsEyeView_dusk', uniforms: uniformsOf(duskShader), halfResolutionGlow: true,
  });
  assert.ok(stage instanceof Cesium.PostProcessStageComposite);
  assert.equal(stage.name, 'godsEyeView_dusk');
  assert.equal(stage.inputPreviousStageTexture, false, 'both stages read the frame');
  const [glow, finish] = [stage.get(0), stage.get(1)];
  assert.equal(glow.textureScale, 0.5);
  assert.equal(glow.fragmentShader, NIGHT_ATLAS_GLOW_SHADER);
  assert.equal(finish.textureScale, 1, 'the map itself stays at full resolution');
  assert.equal(finish.fragmentShader, NIGHT_ATLAS_FINISH_SHADER);
  assert.equal(finish.uniforms.glowTexture, glow.name);
  // The same bloom as the one-stage pass: its taps, its threshold.
  for (const piece of ['smoothstep(0.55, 0.95, peak)', 'dir * 3.0', 'dir * 7.0', 'glow / 8.0']) {
    assert.ok(noirShader.fragmentShader.includes(piece) && glow.fragmentShader.includes(piece), piece);
  }
});

test('the UI drives the pair exactly as it drives one stage: enabled and uniforms', () => {
  const uniforms = uniformsOf(duskShader);
  const stage = createNightAtlasStage(Cesium, { name: 'godsEyeView_dusk', uniforms, halfResolutionGlow: true });
  const finish = stage.get(1);
  assert.deepEqual(Object.keys(stage.uniforms).sort(), Object.keys(uniforms).sort());
  assert.equal(stage.uniforms.dimAmt, duskShader.uniforms.dimAmt.default, 'nightBasemap.js reads it here');
  assert.equal(stage.uniforms.time, undefined, 'not an animated style');
  stage.uniforms.intensity = 0.4;
  stage.uniforms.glowAmt = 0.9;
  assert.equal(finish.uniforms.intensity, 0.4);
  assert.equal(finish.uniforms.glowAmt, 0.9);
  assert.equal(stage.uniforms.intensity, 0.4);
  stage.enabled = true;
  assert.equal(stage.get(0).enabled && stage.get(1).enabled, true);
  stage.enabled = false;
  assert.equal(stage.get(0).enabled || stage.get(1).enabled, false);
});
