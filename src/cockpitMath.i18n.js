/**
 * Strings of `src/cockpitMath.js` — the one line that file writes.
 *
 * `formatCockpitContextScope` composes the Contacts panel's scope readout:
 * WHAT is being watched, HOW FAR around it, and — for the installations
 * cohort alone — that its count is what the camera can see rather than
 * everything inside the radius. That hedge is the whole point of the line, and
 * a hedge only works in a language the reader has.
 *
 * It was English in both languages until this batch, because the coverage
 * string it frames (`src/data/militaryAwareness.js`) was English too and half
 * a translated sentence reads worse than none. Both move here together.
 *
 * Register: the Contacts panel is uppercase throughout, in both languages —
 * see `context` in `src/i18n/ui.i18n.js` (`CONTEXTE EN VEILLE`, `VOL
 * MILITAIRE`). Accents survive `text-transform: uppercase` when they are
 * already there, so `FENÊTRE` keeps its circumflex.
 *
 * See docs/i18n/CONVENTIONS.md.
 */
import { defineMessages } from './i18n/messages.js';

export default defineMessages({
  /**
   * Subject and radius. French puts the noun before its measurement, English
   * after it, which is why this is one message and not three fragments.
   */
  contextScope: {
    fr: (subject, radiusKm) => `${subject} · FENÊTRE AIR/MER ${radiusKm} KM`,
    en: (subject, radiusKm) => `${subject} · ${radiusKm} KM AIR/SEA WINDOW`,
    sample: ['AF1234', '250'],
  },

  /** The installations hedge, appended to the line above. */
  contextScopeInstallations: {
    fr: (scope, coverage) => `${scope} · INSTALLATIONS ${coverage}`,
    en: (scope, coverage) => `${scope} · INSTALLATIONS ${coverage}`,
    sample: ['AF1234 · 250 KM AIR/SEA WINDOW', 'CURRENT VIEWPORT ONLY'],
    note: 'Identical in both: `installations` is the same word, and the coverage '
      + 'arrives already translated from militaryAwareness.i18n.js.',
  },
});
