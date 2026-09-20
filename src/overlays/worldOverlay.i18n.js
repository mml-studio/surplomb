/**
 * Strings of src/overlays/worldOverlay.js — see docs/i18n/CONVENTIONS.md.
 *
 * The overlay paints its cards on a canvas, which a screen reader cannot
 * read. The two messages here belong to the DOM mirror built beside it
 * (`#world-overlay-accessibility`): the region's name, and what the live
 * region announces after a button in it is pressed. Everything else in that
 * mirror is a layer's own label.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  region: {
    fr: 'Cibles visibles sur la carte',
    en: 'Visible map targets',
    note: 'aria-label of the region that mirrors the painted cards as buttons.',
  },
  focusing: {
    fr: (label) => `Cadrage sur ${label}`,
    en: (label) => `Focusing ${label}`,
    note: 'Announced once the camera accepted the move. `label` is the target’s own name.',
    sample: ['RCH451'],
  },
});
