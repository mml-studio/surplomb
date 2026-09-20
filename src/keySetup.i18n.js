/**
 * The provider-key dialog, in both languages — see src/keySetup.js.
 *
 * WHY THE KEY REGISTRY IS NOT HERE. `src/keySetupCore.mjs` is imported by
 * `vite.config.js` and by `scripts/setup-doctor.mjs`, so it runs in Node,
 * where there is no page and no locale. Its `title` values are provider brand
 * names and stay as they are; what a key UNLOCKS is prose, so the browser
 * translates it here, keyed by the registry's own id ({@link KEY_UNLOCKS}),
 * and falls back to the server's English for a key this table does not know.
 * That is the `labelFor` shape of docs/i18n/CONVENTIONS.md § 4 applied to a
 * server payload.
 */
import { defineMessages } from './i18n/messages.js';

/** What each key switches on, keyed by `KEY_SETUP_KEYS[].id`. */
export const KEY_UNLOCKS = defineMessages({
  'google-maps': {
    fr: 'La planète 3D photoréaliste et la recherche de lieux',
    en: 'The photorealistic 3D planet + place search',
  },
  'cesium-ion': {
    fr: 'Le 3D Google depuis un compte de l’EEE, l’imagerie Bing et le terrain mondial',
    en: 'Google 3D from an EEA account, Bing imagery + world terrain',
  },
  openai: { fr: 'La commande vocale — parler à la planète', en: 'Voice control — talk to the planet' },
  openrouter: {
    fr: 'La commande vocale sans compte OpenAI (tour par tour)',
    en: 'Voice control without an OpenAI account (turn-based)',
  },
  aisstream: {
    fr: 'Les navires en direct (fenêtre France par défaut, monde entier sur demande)',
    en: 'Live ships (France box by default, worldwide on request)',
  },
  firms: { fr: 'Les détections de feux actifs en direct', en: 'Live active-fire detections' },
  tomtom: {
    fr: 'Le vrai trafic en direct (sans clé, c’est une simulation)',
    en: 'Real live traffic (keyless runs a simulation)',
  },
  rte: {
    fr: 'Ce que produit en ce moment chaque groupe de production français',
    en: 'What each French generating unit is producing right now',
  },
  opensky: {
    fr: 'Plus de crédits d’interrogation des vols (l’anonyme marche sans)',
    en: 'More flight-polling credits (anonymous works without)',
  },
  'meteo-france': {
    fr: 'L’API vigilance contractuelle (le miroir ouvert marche sans elle)',
    en: 'The contracted vigilance API (the open mirror works without it)',
  },
  'launch-library': { fr: 'Un quota de requêtes plus large pour les missions spatiales', en: 'Higher space-missions request allowance' },
});

export default defineMessages({
  chip: {
    fr: (count) => `PUISSANCE · ${count} ${count === 1 ? 'CLÉ' : 'CLÉS'} EN ATTENTE`,
    en: (count) => `POWER UP · ${count} ${count === 1 ? 'KEY' : 'KEYS'} WAITING`,
    sample: [8],
    note: 'The chip counts the keys still missing; at zero it reads `chipDone` and retires.',
  },
  chipDone: { fr: 'PLEINE PUISSANCE', en: 'POWERED UP' },
  tierMetered: { fr: 'Payante — compte avec facturation activée', en: 'Metered — a billing-enabled account' },
  tierFree: { fr: 'Clé gratuite — inscription, collage, terminé', en: 'Free key — register, paste, done' },
  browserSide: { fr: 'côté navigateur', en: 'browser-side' },
  browserSideTitle: {
    fr: 'Cette clé tourne dans le navigateur par conception — restreignez-la chez le fournisseur (voir SECURITY.md)',
    en: 'This key runs in the browser by design — restrict it at the provider (see SECURITY.md)',
  },
  external: { fr: 'configurée ailleurs', en: 'configured externally' },
  externalTitle: {
    fr: 'Fournie par votre environnement, votre trousseau ou votre lanceur — changez-la là où elle a été posée',
    en: 'Supplied by your environment, Keychain, or launcher — change it where it was set',
  },
  manage: { fr: 'GÉRER ↗', en: 'MANAGE ↗' },
  getKey: { fr: 'OBTENIR UNE CLÉ ↗', en: 'GET KEY ↗' },
  savedPlaceholder: {
    fr: (envVar) => `${envVar} enregistrée — collez pour remplacer`,
    en: (envVar) => `${envVar} saved — paste to replace`,
    sample: ['OPENAI_API_KEY'],
  },
  pastePlaceholder: {
    fr: (envVar) => `collez ${envVar}`,
    en: (envVar) => `paste ${envVar}`,
    sample: ['OPENAI_API_KEY'],
  },
  remove: { fr: 'RETIRER', en: 'REMOVE' },
  removeTitle: {
    fr: (title) => `Retirer ${title} des clés enregistrées par cette application`,
    en: (title) => `Remove ${title} from this app’s saved keys`,
    sample: ['TOMTOM'],
  },
  storeApp: { fr: 'votre configuration d’application', en: 'your app configuration', note: 'Pinokio, which owns the environment.' },
  storeEnv: { fr: 'votre .env local', en: 'your local .env' },
  saving: { fr: 'Enregistrement…', en: 'Saving…' },
  saveFailedStatus: {
    fr: (status) => `Échec de l’enregistrement (${status}).`,
    en: (status) => `Save failed (${status}).`,
    sample: [500],
  },
  saveFailed: {
    fr: (reason) => `Échec de l’enregistrement : ${reason}`,
    en: (reason) => `Save failed: ${reason}`,
    sample: ['NetworkError'],
  },
  savedTo: {
    fr: (store) => `Enregistré dans ${store}. Redémarrage — la page se recharge toute seule.`,
    en: (store) => `Saved to ${store}. Restarting — this page reloads itself.`,
    sample: ['your local .env'],
  },
  removedFrom: {
    fr: (store) => `Retiré de ${store}. Redémarrage — la page se recharge toute seule.`,
    en: (store) => `Removed from ${store}. Restarting — this page reloads itself.`,
    sample: ['your local .env'],
  },
  pasteFirst: { fr: 'Collez d’abord au moins une clé.', en: 'Paste at least one key first.' },
  confirmRemove: {
    fr: 'Retirer cette clé de votre configuration enregistrée ?',
    en: 'Remove this key from your saved configuration?',
  },
});
