/**
 * Strings of src/voice/voiceControlDom.js — the mic panel, in both languages.
 *
 * WHAT IS TRANSLATED AND WHAT IS NOT, because this panel has both kinds.
 *
 * The SENTENCES are translated: how to open the mic, what a failure means and
 * what to do next, what a tooltip is estimating. They are addressed to a
 * person, and a person reading an English globe should not be told « Cliquez
 * le micro ou maintenez Espace pour parler ».
 *
 * The INSTRUMENT FACE is not: `AI AGENT`, `OFF`, `MIC`, `HEARD`, `SAID`,
 * `STD`, `VOICE STANDBY`, `VOICE SYSTEM ERROR`, `DISMISS`. Those are the
 * cockpit's own lettering, the same decision `styles/*.js` made for `NVG`,
 * `FLIR` and `Ironbow` (#295): they read as the labels stencilled on
 * equipment, they are four to six characters wide because the dock is, and
 * they have always been English on the French globe. Translating them would
 * not make the panel more French; it would make it a different panel.
 *
 * See docs/i18n/CONVENTIONS.md.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  /**
   * The one sentence that says how the mic is used, in the three states it
   * can be read in. It is written in three places at once — the button's
   * `aria-label`, the help tray, and the dock's status line — so all three
   * name the same gesture: on a phone there is no Space key to hold.
   */
  hint: {
    coarse: {
      fr: 'Touchez le micro pour parler · il se referme seul',
      en: 'Tap the mic to speak · it closes itself',
      note: 'Touchscreen. The mic shuts after one request, which is why "it closes itself" is a promise and not a warning.',
    },
    release: {
      fr: 'Relâchez Espace pour envoyer',
      en: 'Release Space to send',
      note: 'Shown while the Space key is held down.',
    },
    click: {
      fr: 'Cliquez le micro ou maintenez Espace pour parler',
      en: 'Click the mic or hold Space to speak',
    },
  },

  /** The dock caption when a session is open and the mic is shut: how to reopen it. */
  ready: {
    coarse: { fr: 'Touchez le micro pour parler', en: 'Tap the mic to speak' },
    fine: {
      fr: 'Micro ou Espace pour parler',
      en: 'Mic or Space to speak',
      note: 'About thirty characters fit on the dock line; both languages are under it.',
    },
  },

  /**
   * The mic button's screen-reader name: the control, then how to use it.
   * It opens with the words the desktop button SHOWS (`caption`), so someone
   * who drives the page by voice can say « cliquer Parler à Surplomb » and be
   * understood (WCAG 2.5.3, label in name).
   */
  buttonAria: {
    fr: (hint) => `Parler à Surplomb — ${hint}`,
    en: (hint) => `Talk to Surplomb — ${hint}`,
    sample: ['Click the mic or hold Space to speak'],
    keep: ['Surplomb'],
  },

  /** The `?` button, which is how a touchscreen reaches the help tray at all. */
  help: {
    fr: 'Aide vocale',
    en: 'Voice help',
    note: 'Both the aria-label and the title of the round ? button.',
  },

  tier: {
    fr: 'Niveau du modèle vocal — s’applique à la prochaine session',
    en: 'Voice model tier — applies next session',
    note: 'The STD/MINI button. The model is fixed when the session token is minted, so a live session is left alone.',
  },

  cost: {
    fr: 'Coût estimé de la session',
    en: 'Estimated session cost',
  },

  preview: {
    fr: 'Écouter cette voix',
    en: 'Hear this voice',
    note: 'The ▶ button beside the synthesis-voice picker.',
  },

  errorHint: {
    fr: 'Vérifiez l’autorisation du micro et l’accès réseau, puis réessayez.',
    en: 'Check microphone permission and network access, then try again.',
    note: 'The last line of the error tray when nothing more specific is known.',
  },

  // ── The compact mic of the desktop globe (src/globeShell.js) ──────────────
  // Sentences, not lettering: on a desktop the mic rests as one labelled
  // button in the bottom-right corner and opens into a small card while it is
  // used. The instrument face above stays for the phone and the old dock.

  caption: {
    fr: 'Parler à Surplomb',
    en: 'Talk to Surplomb',
    keep: ['Surplomb'],
    note: 'The desktop mic button at rest. Surplomb is the product name.',
  },

  /** What the mic is doing, as the card's first line. Keyed like `data-status`. */
  phase: {
    connecting: { fr: 'Connexion…', en: 'Connecting…' },
    listening: { fr: 'Je vous écoute', en: 'Listening' },
    answering: {
      fr: 'Surplomb répond',
      en: 'Surplomb is answering',
      keep: ['Surplomb'],
      note: 'The request was taken and the answer is being prepared or spoken.',
    },
    ready: {
      fr: 'À vous',
      en: 'Your turn',
      note: 'A session is open and the mic is shut: the next click or Space opens it.',
    },
    executing: { fr: 'J’agis sur la carte…', en: 'Working on the map…' },
    error: { fr: 'Voix indisponible', en: 'Voice unavailable' },
  },

  stop: {
    fr: 'Arrêter',
    en: 'Stop',
    note: 'The button that ends the voice session, in the desktop card.',
  },
  stopAria: {
    fr: 'Arrêter la conversation avec Surplomb',
    en: 'Stop the conversation with Surplomb',
    keep: ['Surplomb'],
    note: 'Starts with the visible word of the button (`stop`), for voice control users (WCAG 2.5.3).',
  },

  /** Who said each line of the transcript. */
  heard: {
    fr: 'Vous',
    en: 'You',
    note: 'Label of what the recogniser heard, in the desktop transcript.',
  },
  said: {
    fr: 'Surplomb',
    en: 'Surplomb',
    keep: ['Surplomb'],
    note: 'Label of what the assistant answered, in the desktop transcript.',
  },

  dismiss: {
    fr: 'Fermer le message d’erreur',
    en: 'Close the error message',
    note: 'Tooltip of the error tray’s DISMISS button, drawn as × on the desktop card. A tooltip, not its accessible name: the phone shows the word DISMISS, and the name must contain what is shown.',
  },
});
