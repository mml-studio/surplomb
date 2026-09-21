/**
 * Slider labels of the Noir style — see docs/i18n/CONVENTIONS.md.
 *
 * The styles came from upstream in English, so for the others the ENGLISH is
 * the original, kept verbatim. Noir's controls are this fork's own since it
 * became the night atlas (`nightAtlas.js`): only `Vignette` is upstream's.
 * Controls that several styles share (`Pixellisation`, `Halo`) are worded
 * identically across their catalogs on purpose: one control, one name.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  darkness: { fr: 'Assombrissement', en: 'Darkness', note: 'How dark the basemap goes; the data layers keep their colour.' },
  desaturation: { fr: 'Désaturation', en: 'Desaturation', note: 'How much colour the basemap loses.' },
  bloom: { fr: 'Halo', en: 'Bloom', note: 'Glow bleeding out of bright sources.' },
  vignette: { fr: 'Vignettage', en: 'Vignette' },
});
