/**
 * Strings of `src/data/bdtopoBuildingsFeed.js` — the BD TOPO usage bands.
 *
 * The band a building falls in is decided by IGN's own `usage_1` value, which
 * stays untouched in the data; only the legend's words are here. The tiers
 * read them through getters so a band is named when the legend is drawn, not
 * when the module loads (docs/i18n/CONVENTIONS.md § 2).
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  tiers: {
    residential: {
      label: { fr: 'Résidentiel', en: 'Residential' },
      blurb: {
        fr: 'Logement. Le nombre de logements, quand il est renseigné, vient des fichiers fonciers.',
        en: 'Housing. The dwelling count, where it is filled in, comes from the land-tax files.',
      },
    },
    commercial: {
      label: { fr: 'Commercial et services', en: 'Commercial and services' },
      blurb: {
        fr: 'Commerce, bureaux, équipements publics et de service.',
        en: 'Shops, offices, public amenities and service buildings.',
      },
    },
    industrial: {
      label: { fr: 'Industriel', en: 'Industrial' },
      blurb: {
        fr: 'Bâti industriel déclaré comme tel par l\'IGN.',
        en: 'Buildings IGN itself declares industrial.',
      },
    },
    agricultural: {
      label: { fr: 'Agricole', en: 'Agricultural' },
      blurb: {
        fr: 'Bâti agricole — hangars, serres, exploitations.',
        en: 'Farm buildings — barns, greenhouses, holdings.',
      },
    },
    civic: {
      label: { fr: 'Sportif, religieux, annexe', en: 'Sports, religious, outbuilding' },
      blurb: {
        fr: 'Les trois usages rares, regroupés parce qu\'aucun ne remplit une légende seul.',
        en: 'The three rare uses, grouped because none of them fills a legend on its own.',
      },
    },
    other: {
      label: { fr: 'Indifférencié', en: 'Undifferentiated' },
      blurb: {
        fr: 'Usage non renseigné ou hors nomenclature. Gris parce qu\'une couleur '
          + 'affirmerait une catégorie que la donnée ne donne pas.',
        en: 'Use not filled in, or outside the nomenclature. Gray because a color '
          + 'would assert a category the data does not give.',
      },
    },
  },
});
