/**
 * Strings of src/data/mobileCoverage.js — the ARCEP 4G coverage under the
 * antennas, written for someone who has never heard of the ARCEP.
 *
 * THE FOUR LEVELS IN EVERYDAY WORDS. The ARCEP's *très bonne / bonne /
 * couverture limitée* become « très bon / bon / faible (dehors seulement) »:
 * limited coverage is the level that works outdoors and probably not inside,
 * and that is the one fact a reader needs from it.
 *
 * "ZONE BLANCHE" IS "DEAD ZONE": no operator reaches the spot, not even
 * weakly. One operator only is not a dead zone, and the card names who it is.
 *
 * AN ESTIMATE, NEVER A MEASUREMENT. The operators compute these maps and the
 * ARCEP publishes them; every surface that shows a level says « estimation ».
 *
 * See docs/i18n/CONVENTIONS.md.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  /** The five chips on the Antennes row, and their tooltips. */
  chip: {
    gaps: {
      fr: 'Zones blanches',
      en: 'Dead zones',
      note: 'Chip: paints where fewer than four operators have 4G, darkest where none does.',
    },
    gapsTitle: {
      fr: 'Où la 4G manque : plus c’est foncé, moins il y a d’opérateurs.',
      en: 'Where 4G is missing: the darker, the fewer operators.',
    },
    operatorTitle: {
      fr: (name) => `Où ${name} capte mal ou pas en 4G.`,
      en: (name) => `Where ${name} has weak or no 4G.`,
      sample: ['Orange'],
    },
    loading: { fr: 'Chargement…', en: 'Loading…' },
    missing: { fr: 'Carte indisponible sur ce serveur.', en: 'Map not available on this server.' },
    failed: { fr: 'Carte indisponible pour le moment.', en: 'Map unavailable for now.' },
  },

  /** One operator's level, as the card says it after the operator's name. */
  level: {
    none: { fr: 'aucun réseau', en: 'no signal' },
    cl: { fr: 'faible (dehors seulement)', en: 'weak (outdoors only)' },
    bc: { fr: 'bon', en: 'good' },
    tbc: { fr: 'très bon', en: 'very good' },
  },

  legend: {
    headingGaps: {
      fr: 'Réseau 4G : opérateurs qui captent',
      en: '4G: operators with signal',
    },
    headingOperator: {
      fr: (name) => `Réseau 4G ${name}`,
      en: (name) => `${name} 4G`,
      sample: ['Orange'],
    },
    gaps: {
      0: { fr: 'Aucun opérateur : zone blanche', en: 'No operator: dead zone' },
      1: { fr: '1 seul opérateur', en: 'Only 1 operator' },
      2: { fr: '2 opérateurs', en: '2 operators' },
      3: { fr: '3 opérateurs', en: '3 operators' },
      4: { fr: 'Les 4 opérateurs : pas de couleur', en: 'All 4 operators: no colour' },
    },
    operator: {
      none: { fr: 'Pas de réseau', en: 'No signal' },
      cl: { fr: 'Faible : dehors seulement', en: 'Weak: outdoors only' },
      bc: { fr: 'Bon', en: 'Good' },
      tbc: { fr: 'Très bon : pas de couleur', en: 'Very good: no colour' },
    },
    source: {
      fr: (month) => `Estimation des opérateurs, publiée par l’ARCEP (${month}).`,
      en: (month) => `Operators’ estimate, published by ARCEP (${month}).`,
      sample: ['March 2026'],
    },
    note: {
      fr: 'Cliquez sur la carte pour voir le réseau à un endroit. Métropole seulement.',
      en: 'Click the map to see the signal at a spot. Mainland France only.',
    },
    photoreal: {
      fr: 'Pas visible en vue Google 3D : choisissez Satellite, Plan IGN ou OSM.',
      en: 'Not shown in Google 3D: pick Satellite, IGN map or OSM.',
      note: 'Shown instead of the classes while the photorealistic stack hides the globe. Stack names '
        + 'as the basemap chips print them (mapStackController.i18n.js).',
    },
  },

  /** The card of one clicked spot: the verdict as the title, then each operator. */
  card: {
    deadZone: { fr: 'Zone blanche : pas de 4G ici', en: 'Dead zone: no 4G here' },
    one: {
      fr: (name) => `Seul ${name} capte ici`,
      en: (name) => `Only ${name} has signal here`,
      sample: ['Orange'],
    },
    some: {
      fr: (count) => `${count} opérateurs sur 4 captent ici`,
      en: (count) => `${count} of 4 operators have signal here`,
      sample: ['3'],
    },
    all: { fr: 'Les 4 opérateurs captent ici', en: 'All 4 operators have signal here' },
    operatorLine: {
      fr: (name, level) => `${name} : ${level}`,
      en: (name, level) => `${name}: ${level}`,
      sample: ['Orange', 'very good'],
    },
    source: {
      fr: (month) => `Estimation des opérateurs (ARCEP, ${month})`,
      en: (month) => `Operators’ estimate (ARCEP, ${month})`,
      sample: ['March 2026'],
    },
    readingTitle: { fr: 'Réseau 4G ici', en: '4G here' },
    reading: { fr: 'Chargement…', en: 'Loading…' },
    failed: { fr: 'Lecture impossible pour le moment.', en: 'Could not read the map for now.' },
    outsideTitle: { fr: 'Pas de données ici', en: 'No data here' },
    outside: {
      fr: 'La carte couvre la France métropolitaine, hors mer.',
      en: 'The map covers mainland France, not the sea.',
    },
  },
});
