/**
 * @module styles/nightAtlasStage
 *
 * The Night and Dusk passes as Cesium post-process stages: one stage at the
 * frame's resolution, or — on a frame drawn above the canvas's CSS size — the
 * bloom at half of it.
 *
 * ── WHY A PHONE GETS TWO STAGES ─────────────────────────────────────────────
 * A phone renders at twice its CSS size (`phoneRender.js`), so the pass that
 * « Infrastructure numérique » brings with it runs over four times the pixels
 * of the same view on a desktop: 1.3 million on a 390 × 844 screen, each
 * reading the frame seventeen times (sixteen bloom taps and itself), on the
 * one device class where the GPU is the limit.
 *
 * The bloom is a halo: nothing in it needs the frame's full resolution. So on
 * such a frame it is computed at half resolution (a quarter of the pixels, the
 * same sixteen taps at the same distances in frame pixels) and the finish,
 * at full resolution, reads the frame once and the halo four times (by hand,
 * bilinearly). Per full-resolution pixel that is 4 + 5 = 9 texture reads
 * instead of 17, and the map itself is still read at full resolution: only
 * the halo is softer, and on a phone it is laid on the CSS-pixel grid a
 * desktop draws it on.
 *
 * The GPU cost on a real phone is NOT measured here; the shape of the saving
 * is counted, not timed.
 *
 * ── ONE OBJECT FOR THE UI EITHER WAY ────────────────────────────────────────
 * `ui.js` drives a style stage through `enabled` and `uniforms` alone. The pair
 * is a `PostProcessStageComposite` whose `uniforms` forward to the finish
 * stage, where the sliders' values are read — `dimAmt` and `desatAmt` ride
 * along unread, as they do on the single stage, for `nightBasemap.js`.
 */

import { NIGHT_ATLAS_FINISH_SHADER, NIGHT_ATLAS_GLOW_SHADER, noirShader } from './noir.js';

/** The bloom's resolution, as a share of the frame's, on a frame above CSS size. */
export const NIGHT_ATLAS_GLOW_TEXTURE_SCALE = 0.5;

/**
 * Whether the bloom is computed at half resolution: when the frame is drawn
 * above the canvas's CSS size, which only a phone does.
 * @param {number} resolutionScale `Viewer.resolutionScale` at start-up.
 */
export function nightAtlasGlowHalved(resolutionScale) {
  return Number(resolutionScale) > 1;
}

/**
 * One Night-atlas pass (Night or Dusk) as a stage the UI can drive.
 *
 * @param {object} Cesium The Cesium namespace (injected for the tests).
 * @param {object} options
 * @param {string} options.name The stage's name.
 * @param {object} options.uniforms Initial values, `intensity` included.
 * @param {boolean} [options.halfResolutionGlow]
 * @returns {object} A `PostProcessStage`, or a `PostProcessStageComposite`
 *   whose `uniforms` forward to its finish stage.
 */
export function createNightAtlasStage(Cesium, { name, uniforms, halfResolutionGlow = false }) {
  if (!halfResolutionGlow) {
    return new Cesium.PostProcessStage({ name, fragmentShader: noirShader.fragmentShader, uniforms });
  }
  const glow = new Cesium.PostProcessStage({
    name: `${name}_glow`,
    fragmentShader: NIGHT_ATLAS_GLOW_SHADER,
    textureScale: NIGHT_ATLAS_GLOW_TEXTURE_SCALE,
  });
  const finish = new Cesium.PostProcessStage({
    name: `${name}_finish`,
    fragmentShader: NIGHT_ATLAS_FINISH_SHADER,
    uniforms: { ...uniforms, glowTexture: glow.name },
  });
  // Read `finish.uniforms` on every access: Cesium swaps that object for its
  // own getters the first time the stage is drawn.
  const forwarded = {};
  for (const key of Object.keys(uniforms)) {
    Object.defineProperty(forwarded, key, {
      enumerable: true,
      get: () => finish.uniforms[key],
      set: (value) => { finish.uniforms[key] = value; },
    });
  }
  return new Cesium.PostProcessStageComposite({
    name,
    stages: [glow, finish],
    // Both stages read the frame; the finish reads the glow by its name.
    inputPreviousStageTexture: false,
    uniforms: forwarded,
  });
}
