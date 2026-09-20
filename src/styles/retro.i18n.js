/**
 * Slider labels of the CRT terminal style — see docs/i18n/CONVENTIONS.md.
 *
 * The styles came from upstream in English, so the ENGLISH here is the
 * original, kept verbatim, and the French is what is new. Controls that
 * several styles share (`Pixellisation`, `Halo`) are worded identically across their
 * catalogs on purpose: one control, one name.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  pixelation: { fr: 'Pixellisation', en: 'Pixelation', note: 'Size of the pixel grid.' },
  distortion: { fr: 'Distorsion', en: 'Distortion', note: 'CRT barrel/lens bulge.' },
  instability: { fr: 'Instabilité', en: 'Instability', note: 'Jitter, flicker and glitch lines.' },
});
