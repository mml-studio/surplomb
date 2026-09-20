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

  /** The mic button's screen-reader name: the control, then how to use it. */
  buttonAria: {
    fr: (hint) => `Contrôle vocal — ${hint}`,
    en: (hint) => `Voice control — ${hint}`,
    sample: ['Click the mic or hold Space to speak'],
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
});
