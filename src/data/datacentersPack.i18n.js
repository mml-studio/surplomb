/**
 * Strings of src/data/datacentersPack.js — the Digital infrastructure layer:
 * the card of one data center, and the four surface classes that say what a
 * shape on the globe actually outlines.
 *
 * The module is read by the pack build script, which resolves no locale: the
 * frozen table keeps the catalog's French, read from its definition, and the
 * reader-facing helpers resolve the page's language.
 *
 * The four blurbs carry MEASURED figures (medians, shares, object counts) and
 * the English keeps every one of them — they are the file's own record of
 * what each class is, and the reason no default height is invented.
 */
import { defineMessages } from '../i18n/messages.js';
import { plural } from '../i18n/format.js';

export default defineMessages({
  surfaces: {
    volume: {
      label: { fr: 'Volume bâti', en: 'Built volume' },
      blurb: {
        fr: 'Emprise OSM extrudée à sa hauteur publiée — height en mètres, ou '
          + 'building:levels × 5 m (médiane mesurée sur les 59 objets qui portent '
          + 'les deux tags). 461 objets, 10,6 % du paquet.',
        en: 'OSM footprint extruded to its published height — `height` in meters, or '
          + '`building:levels` × 5 m (the median measured over the 59 objects carrying '
          + 'both tags). 461 objects, 10.6% of the pack.',
      },
    },
    slab: {
      label: { fr: 'Emprise seule', en: 'Footprint only' },
      blurb: {
        fr: 'Emprise connue, hauteur non publiée : dessinée à plat, jamais '
          + 'extrudée. 2 739 objets, 63 % du paquet — c’est la raison pour '
          + 'laquelle aucune hauteur par défaut n’est inventée.',
        en: 'Footprint known, height not published: drawn flat, never extruded. '
          + '2,739 objects, 63% of the pack — which is why no default height is '
          + 'invented.',
      },
    },
    site: {
      label: { fr: 'Contour de site', en: 'Site outline' },
      blurb: {
        fr: 'Polygone sans tag building : une clôture ou un campus, pas un '
          + 'hall — médiane 31 204 m² contre 5 008 m². Jamais extrudé, même '
          + 'quand un mappeur y a posé une hauteur (5 cas).',
        en: 'A polygon with no `building` tag: a fence or a campus, not a hall — '
          + 'median 31,204 m² against 5,008 m². Never extruded, even where a mapper '
          + 'put a height on it (5 cases).',
      },
    },
    point: {
      label: { fr: 'Sans emprise', en: 'No footprint' },
      blurb: {
        fr: 'Aucune surface publiée. Anneau creux et non disque plein, parce '
          + 'qu’« absent » ne doit pas se lire « petit ». 1 121 objets, 24,2 % : '
          + '834 nœuds OSM, plus 287 sites français que DCWatch situe et que '
          + 'personne n’a jamais tracés.',
        en: 'No area published. A hollow ring rather than a filled disc, because '
          + '“absent” must not read as “small”. 1,121 objects, 24.2%: 834 OSM nodes, '
          + 'plus 287 French sites DCWatch locates and nobody has ever drawn.',
      },
    },
  },

  /** The card's four lines. */
  card: {
    buildingFootprint: { fr: 'emprise au sol', en: 'building footprint' },
    siteFootprint: { fr: 'emprise du site', en: 'site footprint' },
    footprint: {
      fr: (what, area) => `${what} ≈ ${area}`,
      en: (what, area) => `${what} ≈ ${area}`,
      sample: ['building footprint', '5,000 m²'],
    },
    levels: {
      fr: (count) => `${count} niveau${count > 1 ? 'x' : ''}`,
      en: (count) => `${count} ${plural(count, 'floor', 'floors', { locale: 'en' })}`,
      sample: [3],
    },
    height: {
      fr: (metres) => `${metres} m de haut`,
      en: (metres) => `${metres} m high`,
      sample: ['12.5'],
    },
    inServiceSince: {
      fr: (year) => `en service depuis ${year}`,
      en: (year) => `in service since ${year}`,
      sample: ['2019'],
    },
    /** Which of the lines above came from DCWatch rather than from OSM. */
    fromDcwatch: {
      fr: (fields, release) => `${fields} : DCWatch${release}`,
      en: (fields, release) => `${fields}: DCWatch${release}`,
      sample: ['power', ' 2026-06'],
    },
    fieldPower: { fr: 'puissance', en: 'power' },
    fieldYear: { fr: 'année', en: 'year' },
  },
});
