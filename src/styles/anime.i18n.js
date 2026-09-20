/**
 * Slider labels of the Anime style — see docs/i18n/CONVENTIONS.md.
 *
 * The styles came from upstream in English, so the ENGLISH here is the
 * original, kept verbatim, and the French is what is new. Controls that
 * several styles share (`Pixellisation`, `Halo`) are worded identically across their
 * catalogs on purpose: one control, one name.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  saturation: { fr: 'Saturation', en: 'Saturation' },
  edgeThickness: { fr: 'Épaisseur du trait', en: 'Edge Thickness', note: 'Width of the cel-shading outline.' },
});
