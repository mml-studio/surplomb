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
 *     rings of eight taps, at 3 and 7 device pixels: one pass, no blur chain.
 *   - a vignette.
 *
 * `dimAmt` and `desatAmt` are declared here, as uniforms, because that is how
 * the sliders, the share link and the preset defaults already carry a style's
 * parameters. The shader itself never reads them.
 */
import messages from './noir.i18n.js';

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

    // Only what is already bright contributes: the brightest channel, not the
    // luma, so a saturated orange line glows as much as an ivory one.
    vec3 brightPass(vec2 uv) {
      vec3 c = texture(colorTexture, uv).rgb;
      float peak = max(c.r, max(c.g, c.b));
      return c * smoothstep(0.55, 0.95, peak);
    }

    void main() {
      vec2 uv = v_textureCoordinates;
      vec4 color = texture(colorTexture, uv);
      vec2 texel = 1.0 / colorTextureDimensions;

      vec3 glow = vec3(0.0);
      for (int i = 0; i < 8; i++) {
        float a = float(i) * 0.7853982 + 0.3926991;
        vec2 dir = vec2(cos(a), sin(a)) * texel;
        glow += brightPass(uv + dir * 3.0) * 0.6;
        glow += brightPass(uv + dir * 7.0) * 0.4;
      }
      glow /= 8.0;
      vec3 result = color.rgb + glow * glowAmt;

      vec2 vigUV = uv * (1.0 - uv);
      float vig = pow(clamp(vigUV.x * vigUV.y * 16.0, 0.0, 1.0), 0.1 + 0.45 * vignetteAmt);
      result *= vig;

      out_FragColor = vec4(mix(color.rgb, clamp(result, 0.0, 1.0), intensity), color.a);
    }
  `,
};
