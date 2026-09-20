/**
 * Words for the server's error codes — see src/i18n/serverMessages.js.
 *
 * Keyed by the `code` the server sends. `fr` is the French the server writes
 * under `error` today, byte for byte where the server writes French at all, so
 * a page that resolves a code prints exactly what it printed before while an
 * English page finally gets English.
 *
 * WHY EVERY CODE HERE, AND NOT EVERY ERROR THE SERVER HAS. `vite.config.js`
 * answers about 250 `error:` strings, and the great majority are addressed to
 * whoever is running the server: `Method Not Allowed`, `invalid_tile`,
 * `no_key`, `firms proxy error`. Those are already English, no page prints
 * them as a sentence, and giving each a code would be 250 lines of ceremony
 * for nothing. What is coded here is the two sets that reach a READER:
 *
 *   1. the French prose a layer shows when its source is down — eleven
 *      messages, and every one of them was French on the English globe;
 *   2. the voice path's own refusals, which land in the mic's error tray.
 *
 * Plus the trial's four, which no page shows today (`trialRefusal.js` reads
 * `quota` and opens the waitlist card instead) but which any other client
 * reading the payload would otherwise get in French only.
 *
 * A message may be a function; it is called with the payload's `params`
 * object, so a leaf takes ONE argument and reads its fields by name.
 */
import { defineMessages } from './messages.js';

export default defineMessages({
  // ── The hosted trial (src/trialQuota.js) ──────────────────────────────────
  'trial-exhausted': {
    fr: 'Essai terminé',
    en: 'Trial over',
    note: 'Every free try is spent. The page reads `quota` and opens the waitlist card.',
  },
  'trial-reserved-for-voice': {
    fr: 'Le dernier essai est gardé pour la voix',
    en: 'The last try is held back for the voice',
    note: 'A lookup is refused so the visitor can still hear the mic answer once.',
  },
  'trial-voice-spent': { fr: 'Essai de la voix terminé', en: 'Voice trial over' },
  'trial-voice-closed': {
    fr: 'La voix n’est pas incluse dans l’essai',
    en: 'The voice is not part of the trial',
    note: 'GEV_TRIAL_VOICE=0 — this instance never offered a spoken try at all.',
  },

  // ── Sources that are down, as the layers report them ──────────────────────
  'commune-outlines-unavailable': {
    fr: 'Les contours communaux sont momentanément indisponibles',
    en: 'Municipality outlines are temporarily unavailable',
    note: 'Childcare coverage. The French side is new: this proxy answered in English, so the French globe read an English sentence.',
  },
  'commune-contours-unavailable': {
    fr: (params) => `Les contours communaux du département ${params.departement} sont momentanément indisponibles`,
    en: (params) => `Municipality outlines for department ${params.departement} are temporarily unavailable`,
    sample: [{ departement: '33' }],
    note: 'Recorded crime, one department at a time.',
  },
  'commune-register-unavailable': {
    fr: 'Le référentiel des communes est momentanément indisponible',
    en: 'The register of municipalities is temporarily unavailable',
    note: 'geo.api.gouv.fr, behind the building-permit layer.',
  },
  'dido-too-many-requests': {
    fr: 'DiDo n’accepte que 3 requêtes simultanées — réessaie dans quelques secondes',
    en: 'DiDo accepts only 3 requests at once — try again in a few seconds',
    note: 'The publisher’s own concurrency ceiling, not a fault: the answer carries Retry-After: 5.',
  },
  'ads-commune-unavailable': {
    fr: (params) => `Les autorisations d’urbanisme de ${params.commune} sont momentanément indisponibles`,
    en: (params) => `Planning permissions for ${params.commune} are temporarily unavailable`,
    sample: [{ commune: 'Bordeaux' }],
  },
  'idfm-region-unavailable': {
    fr: 'L’offre régionale Île-de-France Mobilités est momentanément indisponible',
    en: 'The Île-de-France Mobilités region-wide service is temporarily unavailable',
    note: '“L’offre” is the published service: how often each stop is served.',
  },
  'idfm-schedule-unavailable': {
    fr: 'L’offre horaire Île-de-France Mobilités est momentanément indisponible',
    en: 'The Île-de-France Mobilités timetable service is temporarily unavailable',
  },
  'peb-register-unavailable': {
    fr: 'Le registre des arrêtés PEB (Géoplateforme WFS) n’a pas répondu et aucune copie locale n’existe.',
    en: 'The register of noise-exposure orders (PEB, Géoplateforme WFS) did not answer, and there is no local copy.',
    note: 'PEB — plan d’exposition au bruit, the airport noise-exposure plan an order enacts.',
  },
  'peb-copy-stale': {
    fr: (params) => `La copie locale du registre des arrêtés PEB a ${params.days} jours et l’amont ne répond pas.`,
    en: (params) => `The local copy of the PEB order register is ${params.days} days old, and the source is not answering.`,
    sample: [{ days: 12 }],
    note: 'The count arrives as a whole number of days; both languages read it the same way.',
  },
  'amenities-pack-unavailable': {
    fr: 'La base permanente des équipements et le registre FINESS sont momentanément indisponibles ; le pack national n’a pas pu être construit.',
    en: 'The permanent facilities database (BPE) and the FINESS register are temporarily unavailable; the national pack could not be built.',
    note: 'The payload also names the command that builds it out of process: npm run amenities:pack.',
  },
  'filosofi-grid-unavailable': {
    fr: 'Le carroyage INSEE est temporairement indisponible',
    en: 'The INSEE income grid is temporarily unavailable',
  },
  'poste-id-invalid': {
    fr: 'L’identifiant doit être un numéro de poste à 8 chiffres',
    en: 'The id must be an 8-digit station number',
    note: 'Météo-France numbers each weather station with an 8-digit “poste” id; the glossary reads poste (météo) as station.',
  },

  // ── The voice path's own refusals, shown in the mic's error tray ──────────
  'method-not-allowed': { fr: 'Méthode non autorisée', en: 'Method not allowed' },
  'voice-not-configured': {
    fr: 'La voix n’est pas configurée sur ce serveur.',
    en: 'Voice is not configured on this server.',
    note: 'The payload’s `error` carries the operator’s reason (which key is missing); this is the reader’s half.',
  },
  'voice-key-missing': {
    fr: 'Aucune clé vocale n’est posée sur ce serveur.',
    en: 'No voice key is set on this server.',
  },
  'bad-json-body': {
    fr: (params) => `Corps de requête illisible : ${params.detail}`,
    en: (params) => `Unreadable request body: ${params.detail}`,
    sample: [{ detail: 'Unexpected end of JSON input' }],
  },
  'voice-request-refused': {
    fr: 'Cette requête vocale a été refusée par le serveur.',
    en: 'The server refused this voice request.',
    note: 'The browser owns the conversation and nothing else; anything more in the payload is refused rather than sanitised.',
  },
  'voice-brain-refused': {
    fr: (params) => `Le modèle vocal a refusé la requête : ${params.detail}`,
    en: (params) => `The voice model refused the request: ${params.detail}`,
    sample: [{ detail: 'HTTP 429' }],
  },
  'voice-brain-empty': {
    fr: 'Le modèle vocal n’a rien répondu.',
    en: 'The voice model returned no message.',
  },
  'voice-brain-unreachable': {
    fr: (params) => `Le modèle vocal est injoignable : ${params.detail}`,
    en: (params) => `The voice model is unreachable: ${params.detail}`,
    sample: [{ detail: 'fetch failed' }],
  },
  'realtime-token-failed': {
    fr: 'La session vocale n’a pas pu être ouverte auprès du fournisseur.',
    en: 'The voice session could not be opened with the provider.',
  },
});
