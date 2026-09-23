/**
 * Dusk Style — the night atlas, half-way: a dimmed basemap, data in full
 * colour, a glow around what is bright.
 *
 * Night (`noir.js`) keeps 43 % of the basemap's brightness, which is right for
 * the power grid — thin coloured lines that need a black ground — and too dark
 * for « Infrastructure numérique »: the reader of the antennas' line of sight
 * or of the data-centre poles is reading the TERRAIN under them (a valley the
 * mast does not see, a coast a cable lands on), and at night that terrain is
 * gone. At its defaults Dusk keeps 89 % of the ground's light and 92 % of its
 * colour — the operator turned down 66 %, 80 % and 84 % as still too dark.
 *
 * So Dusk is Night's machinery with Night's knobs set lower: the basemap is
 * dimmed and desaturated INSIDE the scene (`nightBasemap.js` reads `dimAmt`
 * and `desatAmt` off this stage exactly as it reads them off Noir's), and this
 * pass adds only the bloom and the vignette. The fragment shader is Noir's own,
 * so the two presets can never disagree about what glows.
 *
 * Switching the « Infrastructure numérique » row on brings this preset, and
 * switching it off puts it away — see `nightAtlasRow.js`.
 */
import { noirShader } from './noir.js';
import messages from './noir.i18n.js';

/** The preset id — what the style buttons, the stages and `ui.js` key on. */
export const DUSK_STYLE = 'dusk';

/*
 * The slider labels are GETTERS over Noir's catalog: the four controls are the
 * same four controls, and one control has one name (docs/i18n/CONVENTIONS.md).
 */
export const duskShader = {
  name: DUSK_STYLE,
  uniforms: {
    dimAmt: { default: 0.14, min: 0, max: 1, get label() { return messages().darkness; } },
    desatAmt: { default: 0.08, min: 0, max: 1, get label() { return messages().desaturation; } },
    glowAmt: { default: 0.6, min: 0, max: 1, get label() { return messages().bloom; } },
    vignetteAmt: { default: 0.25, min: 0, max: 1, get label() { return messages().vignette; } },
  },
  fragmentShader: noirShader.fragmentShader,
};
