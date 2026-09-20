/**
 * Strings of `src/data/rocketLaunches.js` — Space missions.
 *
 * INHERITED IN ENGLISH, AND NOW FRENCH TOO. This layer and its mission panel
 * came from the upstream project with English strings, so a French reader has
 * been reading `SELECTED SPACE MISSION` and `STAGE / RE-ENTRY / RECOVERY`.
 * The English below is the shipped wording, word for word; the French is what
 * was missing.
 *
 * ── THE PANEL IS ONE MARKUP TEMPLATE, AND IT STAYS ONE ──────────────────────
 *
 * The detail panel is built with a single `innerHTML`, and its `data-*`
 * attributes, class names and element structure are load-bearing — the module
 * queries every one of them. So the template is NOT duplicated per language:
 * only the WORDS inside it come from here, interpolated at build time. A
 * French copy of the markup would be a second thing to keep in step with the
 * selectors, and it would drift.
 *
 * `T−`, `1×`, `0.25×` and the two transport glyphs (`▶`, `Ⅱ`) are symbols and
 * ride unchanged.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  /** The replay transport, which is the panel's one moving part. */
  replay: {
    ascent: { fr: 'REJOUER L’ASCENSION', en: 'REPLAY ASCENT' },
    ascentTitle: {
      fr: 'Rejouer l’ascension estimée avec une caméra qui suit',
      en: 'Replay the estimated ascent with a following camera',
    },
    resume: { fr: 'Reprendre la lecture', en: 'Resume replay' },
    pause: { fr: 'Mettre la lecture en pause', en: 'Pause replay' },
    cancel: { fr: 'Annuler la lecture', en: 'Cancel replay' },
    paused: {
      fr: ', en pause',
      en: ', paused',
      note: 'Appended to the transport’s aria-label, so a screen reader hears '
        + 'the phase and its state in one string.',
    },
    speed: { fr: 'VITESSE DE LECTURE', en: 'REPLAY SPEED' },
    speedAria: {
      fr: 'Multiplicateur de vitesse de lecture',
      en: 'Replay speed multiplier',
    },
  },

  /** What the replay is doing, for the transport's aria-label. */
  phase: {
    countdown: {
      fr: (seconds) => `T moins ${seconds}`,
      en: (seconds) => `T minus ${seconds}`,
      sample: [12],
    },
    preparing: { fr: 'Préparation du pas de tir', en: 'Preparing launch site' },
    liftoff: { fr: 'Décollage', en: 'Liftoff' },
    ascent: { fr: 'Lecture de l’ascension', en: 'Ascent replay' },
    orbit: { fr: 'Lecture de l’orbite', en: 'Orbit replay' },
  },

  /** The roster of missions in the 30-day window. */
  roster: {
    empty: {
      fr: 'AUCUNE MISSION DANS LA FENÊTRE DE 30 JOURS',
      en: 'NO MISSIONS AVAILABLE IN THE CURRENT 30-DAY WINDOW',
    },
  },

  /** The detail panel. Words only — the markup around them is shared. */
  panel: {
    aria: { fr: 'Mission spatiale sélectionnée', en: 'Selected Space Mission' },
    header: { fr: 'MISSION SPATIALE SÉLECTIONNÉE', en: 'SELECTED SPACE MISSION' },
    showAllTitle: { fr: 'Afficher toutes les missions', en: 'Show all missions' },
    deselectAria: { fr: 'Désélectionner la mission', en: 'Deselect mission' },
    mission: { fr: 'MISSION', en: 'MISSION' },
    status: { fr: 'STATUT', en: 'STATUS' },
    site: { fr: 'SITE DE LANCEMENT', en: 'LAUNCH SITE' },
    time: { fr: 'HEURE DE LANCEMENT', en: 'LAUNCH TIME' },
    orbit: { fr: 'ORBITE', en: 'ORBIT' },
    ascentPath: { fr: 'TRAJECTOIRE D’ASCENSION', en: 'ASCENT PATH' },
    distance: { fr: 'DISTANCE ACTUELLE À LA TERRE', en: 'CURRENT DISTANCE FROM EARTH' },
    speed: { fr: 'VITESSE DU SATELLITE', en: 'SATELLITE SPEED' },
    payload: { fr: 'CHARGE UTILE', en: 'PAYLOAD' },
    name: { fr: 'NOM', en: 'NAME' },
    type: { fr: 'TYPE', en: 'TYPE' },
    destination: { fr: 'DESTINATION', en: 'DESTINATION' },
    stagesSection: {
      fr: 'ÉTAGE / RENTRÉE / RÉCUPÉRATION',
      en: 'STAGE / RE-ENTRY / RECOVERY',
    },
    stage: { fr: 'ÉTAGE', en: 'STAGE' },
    finalPosition: { fr: 'POSITION FINALE', en: 'FINAL POSITION' },
    focus: { fr: 'CIBLER', en: 'FOCUS' },
    prev: { fr: 'PRÉC', en: 'PREV' },
    next: { fr: 'SUIV', en: 'NEXT' },
    prevTitle: { fr: 'Mission précédente', en: 'Previous mission' },
    nextTitle: { fr: 'Mission suivante', en: 'Next mission' },
    showAll: { fr: 'TOUT AFFICHER / DÉSÉLECTIONNER', en: 'SHOW ALL / DESELECT' },
  },

  /** The two labels drawn on the world, beside the track. */
  world: {
    reentry: { fr: 'RENTRÉE D’ÉTAGE', en: 'STAGE RE-ENTRY' },
    orbit: {
      fr: 'ORBITE',
      en: 'ORBIT',
      note: 'The orbit actually flown, from a satellite track.',
    },
    projectedOrbit: {
      fr: 'ORBITE PROJETÉE',
      en: 'PROJECTED ORBIT',
      note: 'No satellite track yet: this one is computed, and says so.',
    },
  },
});
