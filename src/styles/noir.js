/**
 * Noir Style — the night atlas: a dark basemap, data in full colour, a glow
 * around what is bright.
 *
 * It used to be film noir (desaturation, S-curve contrast, grain, sepia) over
 * the whole composed frame, which turned every colour ramp on the map grey.
 * The darkening moved INTO the scene, onto the basemap alone —
 * `nightBasemap.js` reads `dimAmt` and `desatAmt` off this stage every frame —
 * and `nightAtlas.js` says why. What stays in this pass is what only a
 * post-process can do:
 *
 *   - a BLOOM around bright pixels. The threshold sits above anything the
 *     dimmed basemap can reach (a snowfield at 0.9 luma lands at ~0.39 under
 *     the default darkness), so what glows is what the layers drew bright:
 *     the 400 and 225 kV lines, a station's column, a label's leader. Two
 *     rings of eight taps, at 3 and 7 device pixels: one pass, no blur chain
 *     (on a phone, that bloom is drawn at half resolution by a stage of its
 *     own — `nightAtlasStage.js`).
 *   - a vignette.
 *
 * `dimAmt` and `desatAmt` are declared here, as uniforms, because that is how
 * the sliders, the share link and the preset defaults already carry a style's
 * parameters. The shader itself never reads them.
 */
import messages from './noir.i18n.js';

/*
 * The pass in two pieces, shared by the one-stage pass below and the
 * half-resolution pair after it.
 */

/**
 * The bloom around one pixel: two rings of eight taps, at 3 and 7 pixels of
 * the frame (`texel` is one of them). Only what is already bright
 * contributes: the brightest channel, not the luma, so a saturated orange line
 * glows as much as an ivory one.
 */
const NIGHT_ATLAS_GLOW_GLSL = /* glsl */ `
    vec3 brightPass(vec2 uv) {
      vec3 c = texture(colorTexture, uv).rgb;
      float peak = max(c.r, max(c.g, c.b));
      return c * smoothstep(0.55, 0.95, peak);
    }

    vec3 nightAtlasGlow(vec2 uv, vec2 texel) {
      vec3 glow = vec3(0.0);
      for (int i = 0; i < 8; i++) {
        float a = float(i) * 0.7853982 + 0.3926991;
        vec2 dir = vec2(cos(a), sin(a)) * texel;
        glow += brightPass(uv + dir * 3.0) * 0.6;
        glow += brightPass(uv + dir * 7.0) * 0.4;
      }
      return glow / 8.0;
    }
`;

/** The bloom added to the frame, the vignette, and the crossfade. */
const NIGHT_ATLAS_FINISH_GLSL = /* glsl */ `
    vec4 nightAtlasFinish(vec4 color, vec3 glow, vec2 uv) {
      vec3 result = color.rgb + glow * glowAmt;

      vec2 vigUV = uv * (1.0 - uv);
      float vig = pow(clamp(vigUV.x * vigUV.y * 16.0, 0.0, 1.0), 0.1 + 0.45 * vignetteAmt);
      result *= vig;

      return vec4(mix(color.rgb, clamp(result, 0.0, 1.0), intensity), color.a);
    }
`;

/*
 * The slider labels are GETTERS, read from the catalog beside this file when the panel is
 * painted: this object is built when the module loads, and a plain string
 * would fix its language at import (ratchet R5).
 */
export const noirShader = {
  name: 'noir',
  uniforms: {
    dimAmt: { default: 0.7, min: 0, max: 1, get label() { return messages().darkness; } },
    desatAmt: { default: 0.6, min: 0, max: 1, get label() { return messages().desaturation; } },
    glowAmt: { default: 0.55, min: 0, max: 1, get label() { return messages().bloom; } },
    vignetteAmt: { default: 0.45, min: 0, max: 1, get label() { return messages().vignette; } },
  },
  fragmentShader: /* glsl */ `
    uniform sampler2D colorTexture;
    uniform vec2 colorTextureDimensions;
    uniform float intensity;
    uniform float glowAmt;
    uniform float vignetteAmt;
    in vec2 v_textureCoordinates;
${NIGHT_ATLAS_GLOW_GLSL}
${NIGHT_ATLAS_FINISH_GLSL}
    void main() {
      vec2 uv = v_textureCoordinates;
      vec4 color = texture(colorTexture, uv);
      out_FragColor = nightAtlasFinish(color, nightAtlasGlow(uv, 1.0 / colorTextureDimensions), uv);
    }
  `,
};

/*
 * The same pass in two stages, for a frame drawn above the canvas's CSS size
 * (a phone, `phoneRender.js`): the bloom at half the frame's resolution, then
 * the finish at full resolution reading it back — see `nightAtlasStage.js`.
 * The pieces are the ones above, so the two can never disagree about what
 * glows or how far.
 */

/** The half-resolution stage: the bloom alone. Its taps stay in full-frame pixels. */
export const NIGHT_ATLAS_GLOW_SHADER = /* glsl */ `
    uniform sampler2D colorTexture;
    uniform vec2 colorTextureDimensions;
    in vec2 v_textureCoordinates;
${NIGHT_ATLAS_GLOW_GLSL}
    void main() {
      out_FragColor = vec4(nightAtlasGlow(v_textureCoordinates, 1.0 / colorTextureDimensions), 1.0);
    }
`;

/**
 * The full-resolution stage: the frame, the bloom read back from the
 * half-resolution stage, and the vignette. The bloom texture is sampled
 * bilinearly by hand — a stage's output is a NEAREST texture, and a halo
 * magnified in blocks would show its steps.
 */
export const NIGHT_ATLAS_FINISH_SHADER = /* glsl */ `
    uniform sampler2D colorTexture;
    uniform sampler2D glowTexture;
    uniform vec2 glowTextureDimensions;
    uniform float intensity;
    uniform float glowAmt;
    uniform float vignetteAmt;
    in vec2 v_textureCoordinates;
${NIGHT_ATLAS_FINISH_GLSL}
    vec3 glowAt(vec2 uv) {
      vec2 texel = 1.0 / glowTextureDimensions;
      vec2 p = uv * glowTextureDimensions - 0.5;
      vec2 f = fract(p);
      vec2 base = (floor(p) + 0.5) * texel;
      vec3 a = texture(glowTexture, base).rgb;
      vec3 b = texture(glowTexture, base + vec2(texel.x, 0.0)).rgb;
      vec3 c = texture(glowTexture, base + vec2(0.0, texel.y)).rgb;
      vec3 d = texture(glowTexture, base + texel).rgb;
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    void main() {
      vec2 uv = v_textureCoordinates;
      out_FragColor = nightAtlasFinish(texture(colorTexture, uv), glowAt(uv), uv);
    }
`;
