/**
 * Strings of src/data/megafireTimeline.js — see docs/i18n/CONVENTIONS.md.
 *
 * The stage labels and the date lines are NOT here: the layer formats them
 * (`segments[i].label`, `state.heading`, `state.detail`) and hands them over
 * already localised. This catalog holds the bar's own words — its buttons, its
 * end marker, and what it says to a screen reader.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  group: {
    fr: 'Rejouer la progression du mégafeu de Gironde',
    en: 'Replay the spread of the Gironde megafire',
    note: 'Accessible name of the whole bar (role="group"); never shown.',
  },
  eyebrow: {
    fr: 'Progression du feu',
    en: 'Fire spread',
    note: 'Small capitals above the date line, as « LÉGENDE » above the map key.',
  },
  // The one main button. Four states, one label at a time; the glyph beside it
  // is drawn in CSS, so the words carry no ▶ or ↺.
  play: { fr: 'Lire', en: 'Play', note: 'The cursor is at the first detection.' },
  resume: { fr: 'Reprendre', en: 'Resume', note: 'Stopped halfway through the replay.' },
  pause: { fr: 'Pause', en: 'Pause', note: 'The replay is running.' },
  replay: { fr: 'Rejouer', en: 'Replay', note: 'The cursor is on the last detection.' },
  previous: {
    fr: 'Étape précédente',
    en: 'Previous stage',
    note: 'Icon-only button (‹): its accessible name and tooltip. A stage is a group of days.',
  },
  next: {
    fr: 'Étape suivante',
    en: 'Next stage',
    note: 'Icon-only button (›): its accessible name and tooltip.',
  },
  stages: {
    fr: 'Étapes du feu',
    en: 'Stages of the fire',
    note: 'Accessible name of the row of stops; ← and → move between them.',
  },
  stopTitle: {
    fr: (label) => `${label} — aller à la fin de cette étape`,
    en: (label) => `${label} — go to the end of this stage`,
    note: 'Tooltip of a stop. `label` is the stage, formatted by the layer.',
    sample: ['Jul 24-25'],
  },
  end: {
    fr: 'Fin des détections',
    en: 'End of detections',
    note: 'Grey tag after the last stop. The data ends with the last satellite '
      + 'detection (Aug 1, 12:44 UTC) — never “end of the fire”, which no dataset records.',
  },
  endTitle: {
    fr: 'Les données s’arrêtent à la dernière détection d’un satellite : rien n’est connu au-delà.',
    en: 'The data stops at the last detection by a satellite: nothing is known beyond it.',
    note: 'Tooltip of the end tag. Says where the DATA stops, not that the fire did.',
  },
  // What the polite live region says — only when a stop is reached or the
  // replay stops, never on every frame.
  announce: {
    stop: {
      fr: (heading, detail) => (detail ? `${heading}, ${detail}` : heading),
      en: (heading, detail) => (detail ? `${heading}, ${detail}` : heading),
      note: 'A stop was reached. Both values come formatted from the layer; `detail` may be empty.',
      sample: ['July 24, 2026', 'Jul 24-25 · 3,775 detections'],
    },
    paused: {
      fr: (heading) => `En pause, ${heading}`,
      en: (heading) => `Paused, ${heading}`,
      sample: ['July 24, 2026'],
    },
    ended: {
      fr: (heading) => `Fin des détections, ${heading}`,
      en: (heading) => `End of detections, ${heading}`,
      sample: ['August 1, 2026'],
    },
  },
});
