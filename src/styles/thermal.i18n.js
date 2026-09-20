/**
 * Slider labels of the FLIR thermal style — see docs/i18n/CONVENTIONS.md.
 *
 * The styles came from upstream in English, so the ENGLISH here is the
 * original, kept verbatim, and the French is what is new. Controls that
 * several styles share (`Pixellisation`, `Halo`) are worded identically across their
 * catalogs on purpose: one control, one name.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  sensitivity: { fr: 'Sensibilité', en: 'Sensitivity', note: 'Contrast and range of the temperature mapping.' },
  bloom: { fr: 'Halo', en: 'Bloom', note: 'Hot-spot bloom.' },
  // The instrument's own two switches. `WHOT/BHOT` is white-hot / black-hot
  // and `Ironbow` is a named palette: equipment vocabulary, kept as it is in
  // both languages, the way `NVG`, `FLIR` and `CRT` are.
  mode: { fr: 'WHOT/BHOT', en: 'WHOT/BHOT', keep: ['WHOT', 'BHOT'] },
  pixelation: { fr: 'Pixellisation', en: 'Pixelation', note: 'Sensor-resolution grid.' },
  palette: { fr: 'Ironbow', en: 'Ironbow', keep: ['Ironbow'] },
});
