/**
 * Strings of src/annotations/annotationEngine.js — see docs/i18n/CONVENTIONS.md.
 *
 * Two things a reader can see: the route label the engine appends to a drawn
 * itinerary, and the labels of the scripted San Francisco demo
 * (`window.__gevAnnotations.demo()` / `.tour()`), which exists so the feature
 * can be watched end to end without a mic session.
 *
 * The distance and the time arrive ALREADY FORMATTED (`formatDistance`,
 * `formatInteger`): a message only places words around them.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  route: {
    byCar: { fr: 'en voiture', en: 'by car' },
    byBike: { fr: 'à vélo', en: 'by bike' },
    onFoot: { fr: 'à pied', en: 'on foot' },
    timed: {
      fr: (distance, minutes, how) => `${distance} · ${minutes} min ${how}`,
      en: (distance, minutes, how) => `${distance} · ${minutes} min ${how}`,
      note: 'A routed itinerary: the distance along the streets, and how long it takes.',
      sample: ['1.2 km', '14', 'on foot'],
    },
    straightLine: {
      fr: (distance) => `${distance} · à vol d’oiseau, sans itinéraire`,
      en: (distance) => `${distance} · as the crow flies, no route`,
      note: 'Routing was unavailable, so a straight line was drawn. Never claim '
        + 'a travel time that was not computed.',
      sample: ['1.2 km'],
    },
    withBase: {
      fr: (baseLabel, metrics) => `${baseLabel} — ${metrics}`,
      en: (baseLabel, metrics) => `${baseLabel} — ${metrics}`,
      note: 'The caller’s own label, then the measurements. `baseLabel` comes '
        + 'from whoever asked for the route.',
      sample: ['Bureau', '1.2 km · 14 min on foot'],
    },
  },
  // The scripted demo. Place names are proper nouns in both languages; only
  // what is said ABOUT them is translated.
  demo: {
    palace: { fr: 'Palace of Fine Arts', en: 'Palace of Fine Arts', keep: ['Palace of Fine Arts'] },
    presidio: { fr: 'Le Presidio (ancienne base militaire)', en: 'The Presidio (former Army base)', keep: ['Presidio'] },
    presidioLong: { fr: 'Le Presidio — une ancienne base militaire', en: 'The Presidio — a former Army base', keep: ['Presidio'] },
    ilm: { fr: 'ILM / Lucasfilm', en: 'ILM / Lucasfilm', keep: ['ILM', 'Lucasfilm'] },
    marina: { fr: 'à côté de la Marina', en: 'next to the Marina', keep: ['Marina'] },
    crissy: { fr: 'Le rivage de Crissy Field', en: 'Crissy Field shoreline', keep: ['Crissy Field'] },
  },
});
