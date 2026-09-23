/**
 * Strings of src/globeNav.js — see docs/i18n/CONVENTIONS.md.
 *
 * The bar's fixed labels are in the markup (src/i18n/markup.i18n.js,
 * `globeNav.*`). What is here is what the module writes itself: the chip that
 * names the view, the tooltips that change with the view, and the label it
 * gives the reset button it moves into the bar.
 */
import { defineMessages } from './i18n/messages.js';

export default defineMessages({
  topTitle: {
    fr: 'Regarder droit vers le sol, sans changer d’orientation',
    en: 'Look straight down at the ground, keeping the same orientation',
    note: 'Tooltip of « Vue du dessus » while the view is tilted.',
  },
  topOffTitle: {
    fr: 'Incliner de nouveau la vue',
    en: 'Tilt the view again',
    note: 'Tooltip of the same button once the view looks straight down: pressing it again tilts back.',
  },
  topFlatTitle: {
    fr: 'Déjà vue du dessus : la carte 2D ne s’incline pas',
    en: 'Already a top view: the 2D map does not tilt',
    note: 'Tooltip of the same button, disabled while the 2D mode is on.',
  },
  reset: {
    fr: 'Réinitialiser',
    en: 'Reset',
    note: 'Visible label of the button that releases the camera and flies back out to the whole globe.',
  },
  viewRelief: { fr: 'Vue 3D', en: '3D view', note: 'In the chip above the bar: the camera tilts freely.' },
  viewFlat: { fr: 'Vue 2D', en: '2D view', note: 'In the chip above the bar: flat map, north up, tilt locked.' },
  viewTop: { fr: 'Vue du dessus', en: 'Top view', note: 'In the chip above the bar: 3D view looking straight down.' },
  chip: {
    fr: (place, view) => `${place} · ${view}`,
    en: (place, view) => `${place} · ${view}`,
    sample: ['Paris', 'Vue 3D'],
    keep: ['Paris'],
    note: 'The chip above the navigation bar: the municipality, département or région at the centre of the view, then the view mode.',
  },
  chipTitle: {
    fr: (place) => `Centre de la vue : ${place} (API Géo, geo.api.gouv.fr)`,
    en: (place) => `Centre of the view: ${place} (API Géo, geo.api.gouv.fr)`,
    sample: ['Paris'],
    keep: ['Paris', 'API Géo'],
    note: 'Tooltip of the chip: where the name comes from.',
  },
});
