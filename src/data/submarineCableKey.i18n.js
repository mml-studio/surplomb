/**
 * Strings of src/data/submarineCableKey.js — the key of the submarine cables
 * and the card of a landing point.
 *
 * « POINT D'ATTERRISSEMENT » is the ARCEP's word for where a submarine cable
 * comes ashore (« station d'atterrissement »), and the approved mock's; English
 * says "landing point", as TeleGeography does.
 *
 * THE ROUTES ARE SCHEMATIC. TeleGeography draws each system as a stylised
 * line between its landings; a laid cable wanders from it. Every surface that
 * shows a route says so.
 *
 * See docs/i18n/CONVENTIONS.md.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  /** The cables' block of the map key. */
  key: {
    route: { fr: 'Tracé publié', en: 'Published route' },
    landing: { fr: 'Point d’atterrissement', en: 'Landing point' },
    note: {
      fr: 'Tracés schématiques de TeleGeography (fichier du 24 mai 2026), pas le relevé du câble posé. Cliquez sur un point d’atterrissement pour ses câbles.',
      en: 'Schematic routes by TeleGeography (file of 24 May 2026), not the survey of the laid cable. Click a landing point for its cables.',
    },
  },

  /** The card of a clicked landing point. */
  card: {
    kind: {
      fr: (country) => `Point d’atterrissement · ${country}`,
      en: (country) => `Landing point · ${country}`,
      sample: ['France'],
    },
    tbd: {
      fr: 'Emplacement encore à confirmer selon TeleGeography.',
      en: 'Location still to be confirmed, according to TeleGeography.',
    },
    cables: {
      fr: (count, n) => (n === 1 ? 'Voir le câble associé' : `Voir les ${count} câbles associés`),
      en: (count, n) => (n === 1 ? 'See the connected cable' : `See the ${count} connected cables`),
      sample: ['15', 15],
    },
    count: {
      fr: (count, n) => (n === 1 ? '1 câble arrive ici' : `${count} câbles arrivent ici`),
      en: (count, n) => (n === 1 ? '1 cable lands here' : `${count} cables land here`),
      sample: ['15', 15],
    },
    none: {
      fr: 'Aucun tracé publié ne touche ce point.',
      en: 'No published route reaches this point.',
    },
    footnote: {
      fr: 'Géométries illustratives · câbles dont le tracé passe à moins de 2 km du point',
      en: 'Illustrative geometry · cables whose route passes within 2 km of the point',
    },
    /** The globe card's list, when the key cannot carry the card. */
    more: {
      fr: (count, n) => (n === 1 ? 'et 1 autre' : `et ${count} autres`),
      en: (count, n) => (n === 1 ? 'and 1 more' : `and ${count} more`),
      sample: ['9', 9],
    },
  },
});
