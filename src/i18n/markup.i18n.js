/**
 * English for the static markup of `index.html` — see src/i18n/markup.js.
 *
 * One entry per `data-i18n*` key used in the HTML. `fr` is the French the HTML
 * carries, whitespace collapsed; `markup.test.mjs` fails when the two drift.
 * Group keys by the part of the page they belong to (`loader.*`, `search.*`,
 * `firstRun.*`), and give a `note` wherever the English needs context the key
 * does not give — a button label out of context is the hardest string there is
 * to translate.
 *
 *     loader: {
 *       status: { fr: 'Initialisation du globe…', en: 'Starting the globe…' },
 *     },
 *
 * WHAT IS NOT HERE. The showcase (`#vitrine`) and `<head>`: the landing page
 * gets its own English document later (plan decision D2), and its root carries
 * `lang="fr"` so an English `<html lang>` never mislabels it. Values that are
 * the same word in both languages — a style name (NORMAL, CRT, NVG), a brand,
 * a provider — carry `translate="no"` in the HTML instead of a key they would
 * only echo.
 */
import { defineMessages } from './messages.js';

export default defineMessages({
  overlay: {
    actions: {
      fr: 'Objets visibles sur la carte',
      en: 'Visible map targets',
      note: 'Region holding one button per object the world overlay has drawn, for readers who do not click the canvas.',
    },
  },
  title: {
    tagline: { fr: 'Aucun angle mort.', en: 'No blind spots.', note: 'The product’s slogan, under the logo.' },
  },
  style: {
    activeLabel: { fr: 'STYLE ACTIF', en: 'ACTIVE STYLE', note: 'Label of the chip naming the visual preset in use.' },
  },
  actions: {
    nav: { fr: 'Actions du globe', en: 'Globe actions' },
    clearLayers: { fr: 'Éteindre les couches sélectionnées', en: 'Clear selected data layers' },
    clearLayersTitle: { fr: 'Éteindre toutes les couches sélectionnées', en: 'Turn off all selected data layers' },
    share: { fr: 'Copier le lien de partage', en: 'Copy share link' },
    locate: { fr: 'Autour de moi', en: 'Around me' },
    locateTitle: { fr: 'Centrer la carte sur ma position', en: 'Center the map on my location' },
    resetGlobe: { fr: 'Revenir au globe entier', en: 'Reset to full globe view' },
    resetGlobeTitle: {
      fr: 'Réinitialiser la caméra et revenir au globe entier',
      en: 'Reset camera and return to full globe view',
    },
    stopFollow: { fr: 'Ne plus suivre', en: 'Stop following', note: 'Releases the object the camera is tracking.' },
    stopFollowTitle: { fr: 'Ne plus suivre cet objet', en: 'Stop following this object' },
  },
  status: {
    loading: {
      fr: 'CHARGEMENT DES DONNÉES EN DIRECT',
      en: 'LOADING LIVE DATA',
      note: 'First state of the loading chip; src/loadingFeedback.js writes the ones that follow.',
    },
    trafficSync: {
      fr: 'synchronisation du réseau routier',
      en: 'syncing road network',
      note: 'Lower case on purpose: the traffic chip is a quiet progress line, not a headline.',
    },
    cctvSync: { fr: 'chargement des images', en: 'loading frames', note: 'Camera frames of the public-camera layer.' },
  },
});
