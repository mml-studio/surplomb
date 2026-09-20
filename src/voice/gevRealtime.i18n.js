/**
 * Strings of src/voice/gevRealtime.js — the dock, and what it says back.
 *
 * Same split as `voiceControlDom.i18n.js`, and for the same reason: the
 * SENTENCES are translated, the INSTRUMENT FACE is not. `MIC`, `VOICE
 * STANDBY`, `VOICE ACTIVE`, `VOICE UNAVAILABLE`, `STD`, `MINI` and
 * `TOKEN LIMIT REACHED — RESETS IN 12 S` stay English in both languages: they
 * are the dock's lettering, sized to a line that holds about thirty
 * characters, and they have read that way on the French globe since upstream.
 *
 * Two kinds of string are deliberately absent. Anything the MODEL reads — the
 * screenshot prompt, a tool result — belongs to the tool contract and stays
 * English (see the header of `gevActions.js`). Anything written into the debug
 * record — `No browser error message supplied` — is a log field, not a
 * surface.
 *
 * See docs/i18n/CONVENTIONS.md.
 */
import { defineMessages } from '../i18n/messages.js';
import { countNoun, plural } from '../i18n/format.js';

export default defineMessages({
  /** The dock's caption line, under the mic. */
  dock: {
    ask: {
      fr: 'Question ou commande',
      en: 'Ask or command',
      note: 'The caption of a live mic when nothing more specific applies.',
    },
  },

  /**
   * The hosted trial's own words. A visitor gets a few free spoken requests
   * (src/trialQuota.js); the dock counts them down and then says so.
   */
  trial: {
    spent: {
      fr: 'Commandes offertes utilisées',
      en: 'Free commands used up',
      note: 'Every free request is spent. The mic then opens the waitlist card instead of a session.',
    },
    last: { fr: 'Dernière commande offerte', en: 'Last free command' },
    left: {
      fr: (count) => `${count} commandes offertes`,
      en: (count) => countNoun(count, 'free command', 'free commands'),
      sample: [3],
      note: 'Only ever shown for two or more: one has its own line above.',
    },
  },

  /** Audio that a browser refused to play, and the gesture that unlocks it. */
  audio: {
    tapToHear: {
      fr: 'Touchez le micro pour activer le son',
      en: 'Tap the mic to turn the sound on',
      note: 'Safari rejects autoplay until a gesture; the reply is already arriving, muted.',
    },
  },

  session: {
    backgrounded: {
      fr: 'Session vocale interrompue en arrière-plan',
      en: 'Voice session stopped in the background',
      note: 'A phone leaving the app keeps the mic hot and the token burning, so the session is closed for it.',
    },
    couldNotStart: {
      fr: 'La session vocale n’a pas pu démarrer.',
      en: 'Voice session could not be started.',
      note: 'The error tray when the failure carried no message of its own.',
    },
  },

  /** The synthesis-voice picker: the first option is the app's own choice. */
  picker: {
    automatic: { fr: 'Automatique', en: 'Automatic' },
    automaticWith: {
      fr: (name) => `Automatique (${name})`,
      en: (name) => `Automatic (${name})`,
      sample: ['Thomas'],
      note: 'A real option, not a label: it is the way back to the app’s pick.',
    },
  },

  /** The STD/MINI button's tooltip. The model is fixed when the token is minted. */
  tier: {
    pending: {
      fr: (next, current) => `Prochaine session : ${next} — celle-ci reste sur ${current}`,
      en: (next, current) => `Next session: ${next} — this session stays on ${current}`,
      sample: ['gpt-realtime-mini', 'gpt-realtime'],
    },
    current: {
      fr: (model, other) => `Modèle vocal : ${model} — cliquez pour passer à ${other} ; s’applique à la prochaine session`,
      en: (model, other) => `Voice model: ${model} — click to switch to ${other}; applies next session`,
      sample: ['gpt-realtime', 'mini'],
    },
  },

  /** The running cost readout's tooltip: what is counted, and where it stops. */
  cost: {
    title: {
      fr: (model, responses, warn, cap) => `Coût estimé de la session sur ${model} — ${responses} `
        + `${plural(responses, 'réponse', 'réponses')}. `
        + `Alerte à ${warn}, fin de la session à ${cap}.`,
      en: (model, responses, warn, cap) => `Estimated session cost on ${model} — `
        + `${countNoun(responses, 'response', 'responses')}. `
        + `Warns at ${warn}, ends the session at ${cap}.`,
      sample: ['gpt-realtime', 3, '$0.40', '$1.00'],
      note: 'The warn and cap arrive formatted as dollars. French CLDR puts 0 and 1 in the singular, which is why both sides go through plural().',
    },
  },
});
