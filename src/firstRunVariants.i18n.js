/**
 * What the first-visit card says while it works — see src/firstRunVariants.js.
 *
 * The card's own headings, tiles and buttons live in `index.html` (they are
 * markup); these are the sentences the module writes into the status line
 * after the reader has acted: what is being switched on, what the search
 * found, and what to do when it found nothing.
 */
import { defineMessages } from './i18n/messages.js';

export default defineMessages({
  // One per B tile, keyed by the tile's own id.
  busy: {
    sales: { fr: 'Allumage : ce que les voisins ont payé…', en: 'Switching on: what the neighbors paid…' },
    permits: { fr: 'Allumage : ce qui se construit…', en: 'Switching on: what is going up…' },
    live: { fr: 'Allumage : ce qui bouge maintenant…', en: 'Switching on: what is moving right now…' },
  },
  phoneSubcopy: {
    sales: {
      fr: 'Ventes DVF, 5 ans',
      en: 'Property sales (DVF), 5 years',
      note: 'Replaces the tile’s subcopy on a phone, where the parcel layer is too heavy to ship with it.',
    },
  },
  searching: {
    fr: (query) => `Recherche de « ${query} »…`,
    en: (query) => `Searching for “${query}”…`,
    sample: ['Bordeaux'],  // a place name, so the parity check reads the sentence and not the address
  },
  notFound: {
    fr: 'Introuvable. Essayez une commune ou une adresse plus précise.',
    en: 'Not found. Try a municipality, or a more precise address.',
  },
  searchFailed: {
    fr: 'La recherche a échoué. Réessayez, ou regardez autour d’ici.',
    en: 'The search failed. Try again, or look around here.',
  },
  theseLayers: { fr: 'ces couches', en: 'these layers', note: 'Stands in when the failed layers have no names to list.' },
  layersFailed: {
    fr: (layers) => `Impossible d’allumer ${layers}. Réessayez, ou regardez par vous-même.`,
    en: (layers) => `${layers} could not be switched on. Try again, or look around yourself.`,
    sample: ['dvf-sales'],
  },
});
