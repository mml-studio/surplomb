/**
 * Slider labels of the NVG night-vision style — see docs/i18n/CONVENTIONS.md.
 *
 * The styles came from upstream in English, so the ENGLISH here is the
 * original, kept verbatim, and the French is what is new. Controls that
 * several styles share (`Pixellisation`, `Halo`) are worded identically across their
 * catalogs on purpose: one control, one name.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  gain: { fr: 'Gain', en: 'Gain', note: 'Image-intensifier gain: the bloom/noise balance.' },
  bloom: { fr: 'Halo', en: 'Bloom', note: 'Glow bleeding out of bright sources.' },
  scanlines: { fr: 'Lignes de balayage', en: 'Scanlines' },
  pixelation: { fr: 'Pixellisation', en: 'Pixelation', note: 'Intensifier-tube resolution grid.' },
});
