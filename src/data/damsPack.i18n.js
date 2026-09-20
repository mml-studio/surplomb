/**
 * Strings of src/data/damsPack.js — the Dams & levees layer: the three
 * structures a mapper can tag, the three tiers that decide how far out a
 * mark is offered, the filter chips, the key and the card's three lines.
 *
 * The module is imported by `scripts/build-osm-dams.mjs`, which resolves no
 * locale: the frozen tables keep the catalog's French, read from its
 * definition, and every reader-facing call goes through the helpers.
 *
 * WHAT STAYS FRENCH: the material FAMILY written into the pack (`béton`,
 * `maçonnerie`…). It is a value in `dams.geojson`, matched and counted as
 * one, and labelled here when a card prints it.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  /** What OpenStreetMap says the structure is. */
  structures: {
    dam: {
      label: { fr: 'Barrage', en: 'Dam' },
      blurb: {
        fr: 'Barre le cours d’eau et le retient.',
        en: 'Blocks the watercourse and holds it back.',
      },
    },
    dyke: {
      label: { fr: 'Digue', en: 'Levee' },
      blurb: {
        fr: 'Longe l’eau. Protection ou étang : inconnu.',
        en: 'Runs alongside the water. Flood defence or pond bund: unknown.',
        note: 'No OSM tag separates the two, and the French register that does is not open data.',
      },
    },
    'dam+dyke': {
      label: { fr: 'Barrage-digue', en: 'Dam-levee' },
      blurb: {
        fr: 'Les deux à la fois, selon OpenStreetMap.',
        en: 'Both at once, according to OpenStreetMap.',
      },
    },
  },
  unclassified: {
    label: { fr: 'Non classé', en: 'Unclassified' },
    blurb: { fr: 'Hors de France : type inconnu.', en: 'Outside France: type unknown.' },
  },

  /** The material families a card can name, keyed by the pack's own value. */
  materials: {
    béton: { fr: 'béton', en: 'concrete' },
    terre: { fr: 'terre', en: 'earth' },
    maçonnerie: { fr: 'maçonnerie', en: 'masonry' },
    pierre: { fr: 'pierre', en: 'stone' },
    métal: { fr: 'métal', en: 'metal' },
    bois: { fr: 'bois', en: 'wood' },
  },

  /** The three tiers: how far out a mark and its card are offered. */
  tiers: {
    major: {
      label: { fr: 'Grand barrage', en: 'Large dam' },
      blurb: {
        fr: 'Au moins 15 m de haut — le seuil international du grand barrage — '
          + 'ou exploité pour l’électricité (EDF, CNR, SHEM), ou nommé et long de 300 m.',
        en: 'At least 15 m high — the international threshold for a large dam — '
          + 'or run for electricity (EDF, CNR, SHEM), or named and 300 m long.',
      },
    },
    named: {
      label: { fr: 'Barrage nommé', en: 'Named dam' },
      blurb: {
        fr: 'Porte un nom dans OpenStreetMap, sans hauteur, exploitant ni '
          + 'envergure qui le hisse au-dessus.',
        en: 'Carries a name in OpenStreetMap, with no height, operator or '
          + 'span to lift it higher.',
      },
    },
    minor: {
      label: { fr: 'Petit ouvrage', en: 'Small structure' },
      blurb: {
        fr: 'Sans nom, sans hauteur et sans exploitant : sorties d’étang et '
          + 'ouvrages de dérivation, pour l’essentiel.',
        en: 'No name, no height and no operator: pond outlets and diversion '
          + 'structures, for the most part.',
      },
    },
  },

  /** The filter chips on the row strip. */
  chips: {
    all: {
      label: { fr: 'TOUS', en: 'ALL' },
      title: { fr: 'Barrages et digues ensemble', en: 'Dams and levees together' },
    },
    dams: {
      label: { fr: 'BARRAGES', en: 'DAMS' },
      title: {
        fr: 'Ouvrages en travers du cours d’eau (et non classés)',
        en: 'Structures across the watercourse (and unclassified ones)',
      },
    },
    dykes: {
      label: { fr: 'DIGUES', en: 'LEVEES' },
      title: {
        fr: 'Remblais le long de l’eau — protection ou étang, OSM ne dit pas',
        en: 'Embankments along the water — flood defence or pond, OSM does not say',
      },
    },
  },

  /** The key. */
  legend: {
    hidden: {
      fr: (blurb, count) => `${blurb} — ${count} masqué${count > 1 ? 's' : ''}`,
      en: (blurb, count) => `${blurb} — ${count} hidden`,
      sample: ['Blocks the watercourse and holds it back.', 2104],
    },
    spanUnknown: { fr: 'Longueur inconnue', en: 'Length unknown' },
    spanUnknownBlurb: {
      fr: 'Anneau creux : OpenStreetMap ne la publie pas.',
      en: 'Hollow ring: OpenStreetMap does not publish it.',
    },
  },

  /** The card's three lines. */
  card: {
    abandoned: { fr: 'Désaffecté', en: 'Disused' },
    hydro: {
      fr: 'hydroélectrique',
      en: 'hydroelectric',
      note: 'Spelled out only when no operator says it already.',
    },
    high: {
      fr: (metres) => `${metres} de haut`,
      en: (metres) => `${metres} high`,
      sample: ['61 m'],
    },
    long: {
      fr: (metres) => `${metres} de long`,
      en: (metres) => `${metres} long`,
      sample: ['1,205 m'],
    },
  },
});
