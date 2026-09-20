/**
 * Strings of src/voice/gevBrainVoice.js — the keyless-ears path's diagnoses.
 *
 * Almost everything here is a FAILURE explained to the person it just happened
 * to, which is why this catalog is longer than the module's interface: the
 * browser supplies the ears, and a browser has six different ways of refusing
 * to listen. Every one of them was English on the French globe, including
 * « l'autorisation du micro a été refusée », the single most common of them.
 *
 * Each message keeps the shape the module argued for: name what the fault is
 * NOT — the microphone — then name the way out. The browser names (Arc, Brave,
 * Chrome, Edge, Safari) and the paths (`docs/DEPLOY.md`, `GEV_VOICE_LANGUAGE`)
 * are the same in both languages; they are names, not words.
 *
 * `RATE LIMITED — RETRY IN 8 S` and `VOICE STANDBY` are not here: they are the
 * dock's lettering — see `gevRealtime.i18n.js`.
 *
 * See docs/i18n/CONVENTIONS.md.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  /** The configuration lookup never got an answer. Four reasons, four ways out. */
  unreachable: {
    rateLimited: {
      fr: 'Pas le micro : un limiteur de débit devant ce serveur (pas l’application) refuse les requêtes /api '
        + 'venant de votre adresse. Autre chose y est occupé — un script, une série de tests, plusieurs onglets '
        + 'qui rechargent — ou la règle de bordure est réglée sous ce que l’application demande ; voir docs/DEPLOY.md.',
      en: 'Not the microphone: a rate limit in front of this server (not the app) is refusing /api requests from your network address. '
        + 'Something else on it is busy — a script, a test run, several tabs reloading — or the edge rule is set below what the app needs; see docs/DEPLOY.md.',
      note: 'HTTP 429. Staging sits behind a Cloudflare rule of 30 requests per 10 s per address.',
    },
    unauthorized: {
      fr: 'Pas le micro : le portail d’accès a refusé la requête. Rechargez la page et identifiez-vous à nouveau.',
      en: 'Not the microphone: the access gate refused the request. Reload the page and sign in again.',
    },
    notFound: {
      fr: 'Pas le micro : cette version est antérieure au point d’entrée vocal. Déployez une version à jour.',
      en: 'Not the microphone: this build predates the voice endpoint. Deploy a current build.',
    },
    silent: {
      fr: 'Pas le micro : le serveur n’a jamais répondu. Vérifiez que cet hôte est joignable, puis cliquez le micro à nouveau.',
      en: 'Not the microphone: the server never answered. Check that this host is reachable, then click the mic again.',
    },
  },

  /**
   * One diagnosis per `SpeechRecognition` error code. The codes are the Web
   * Speech API's own and stay as keys; only the sentences have a language.
   */
  recognition: {
    network: {
      message: {
        fr: 'Ce navigateur ne peut pas joindre son service de reconnaissance vocale',
        en: 'This browser cannot reach its speech recognition service',
      },
      hint: {
        fr: 'Ni votre connexion ni ce serveur — les dérivés de Chromium (Arc, Brave, Electron) sont livrés sans '
          + 'la clé qu’exige le service vocal de Google. Ouvrez l’application dans Chrome, Edge ou Safari.',
        en: "Not your connection and not this server — Chromium forks (Arc, Brave, Electron) ship without the key Google's speech service needs. Open the app in Chrome, Edge or Safari.",
        note: 'Reported on Arc, 2026-09-09: the app, the server and the connection were all fine.',
      },
    },
    'not-allowed': {
      message: {
        fr: 'L’autorisation du micro a été refusée',
        en: 'Microphone permission was denied',
      },
      hint: {
        fr: 'Autorisez le micro pour ce site, puis cliquez le micro à nouveau.',
        en: 'Allow the microphone for this site, then click the mic again.',
      },
    },
    'service-not-allowed': {
      message: {
        fr: 'Ce navigateur a refusé de démarrer la reconnaissance vocale',
        en: 'This browser refused to start speech recognition',
      },
      hint: {
        fr: 'La page doit être servie en HTTPS ou depuis localhost, et le navigateur doit autoriser son service '
          + 'vocal. Essayez Chrome, Edge ou Safari en HTTPS.',
        en: 'The page must be served over HTTPS or from localhost, and the browser must allow its speech service. Try Chrome, Edge or Safari over HTTPS.',
      },
    },
    'audio-capture': {
      message: { fr: 'Aucun microphone n’a été trouvé', en: 'No microphone was found' },
      hint: {
        fr: 'Vérifiez qu’un périphérique d’entrée est branché et sélectionné dans les réglages de son du système.',
        en: 'Check that an input device is connected and selected in the system sound settings.',
      },
    },
    'language-not-supported': {
      message: {
        fr: 'Ce navigateur ne parle pas la langue configurée',
        en: 'This browser does not speak the configured language',
      },
      hint: {
        fr: 'Réglez GEV_VOICE_LANGUAGE sur une langue que ce navigateur gère, ou essayez Chrome.',
        en: 'Set GEV_VOICE_LANGUAGE to a language this browser supports, or try Chrome.',
      },
    },
    'bad-grammar': {
      message: {
        fr: 'La reconnaissance vocale a rejeté sa grammaire',
        en: 'Speech recognition rejected its grammar',
      },
      hint: {
        fr: 'C’est un bogue du navigateur plutôt qu’un problème de configuration. Essayez Chrome, Edge ou Safari.',
        en: 'This is a browser bug rather than a configuration problem. Try Chrome, Edge or Safari.',
      },
    },
    unknown: {
      message: {
        fr: (code) => `Échec de la reconnaissance vocale : ${code}`,
        en: (code) => `Speech recognition failed: ${code}`,
        sample: ['some-new-code'],
        note: 'The raw code stays visible in both languages: it is what a bug report needs.',
      },
      hint: {
        fr: 'Essayez Chrome, Edge ou Safari en HTTPS. Si cela persiste, rechargez la page.',
        en: 'Try Chrome, Edge or Safari over HTTPS. If it persists, reload the page.',
      },
      code: {
        fr: 'erreur inconnue',
        en: 'unknown error',
        note: 'Stands in for the code itself when the browser sent none.',
      },
    },
  },

  /** The two refusals that happen before a session exists at all. */
  start: {
    ios: {
      fr: 'Voix sans clé indisponible sur iOS — utilisez le mode Realtime',
      en: 'Keyless voice is unavailable on iOS — use Realtime mode',
      note: 'Safari on iOS honours neither continuous nor interimResults, so the restart loop replays the dictation chime forever.',
    },
    noRecognition: {
      fr: 'Ce navigateur n’a pas de reconnaissance vocale — essayez Chrome, Edge ou Safari',
      en: 'This browser has no speech recognition — try Chrome, Edge or Safari',
    },
    micFailed: {
      fr: (detail) => `Le microphone n’a pas pu démarrer : ${detail}`,
      en: (detail) => `Microphone could not start: ${detail}`,
      sample: ['NotAllowedError'],
    },
  },

  /**
   * Where a better French voice lives. Each language names the menu path as
   * that language's macOS prints it — the reader is walking through their own
   * System Settings, not through ours.
   */
  voiceUpgrade: {
    fr: 'Seule la voix française compacte est installée. Pour une voix naturelle : Réglages Système → '
      + 'Accessibilité → Contenu énoncé → Voix système → Français → téléchargez Audrey ou Amélie (Premium).',
    en: 'Only the compact French voice is installed. For a natural one: System Settings → '
      + 'Accessibility → Spoken Content → System Voice → French → download Audrey or Amélie (Premium).',
  },

  /** The running cost readout on the relay path, where the model is named. */
  cost: {
    title: { fr: 'Coût estimé de la session', en: 'Estimated session cost' },
    titleWith: {
      fr: (model) => `Coût estimé de la session — ${model}`,
      en: (model) => `Estimated session cost — ${model}`,
      sample: ['mistralai/mistral-medium-3.1'],
    },
  },
});
