/**
 * Strings of `src/data/baremeNational.js` — the national scale that turns a
 * value measured at an address into a rank, and only sometimes into a letter.
 *
 * TWO TABLES, TWO JOBS. `reasons` is keyed by a stable refusal CODE, so a
 * caller can test which silence it met without comparing sentences;
 * `indicators` carries what each indicator is called, in what unit, and
 * — for the ones that carry no letter — WHY no direction is defensible. Those
 * `directionNote` sentences are the editorial heart of this module: an
 * indicator with no defensible direction gets its rank and never a judgment,
 * and the note says on whose behalf the judgment would have been made.
 */
import { defineMessages } from '../i18n/messages.js';

export default defineMessages({
  /**
   * Why an indicator could not be placed, keyed by `score.reasonCode`.
   *
   * A named refusal is half the product: "no scale for this indicator" and
   * "scale measured on another shape" are two different sentences, and a
   * reader deserves the second rather than a dash.
   */
  reasons: {
    'no-reference': {
      fr: 'aucune échelle nationale pour cet indicateur',
      en: 'no national scale for this indicator',
    },
    geometry: {
      fr: 'échelle mesurée sur une autre géométrie',
      en: 'scale measured on a different geometry',
      note: 'The comparison that justifies the whole module: a ring value scored '
        + 'against a grid-cell scale gives a plausible and wrong letter.',
    },
    'not-a-number': { fr: 'aucune valeur à situer', en: 'no value to place' },
    'no-direction': {
      fr: 'pas de sens défendable — rang seulement, sans lettre',
      en: 'no defensible direction — rank only, no letter',
    },
  },

  /**
   * What the report knows how to place: the name of each indicator, its unit,
   * and the sentence that says why it carries no letter.
   */
  indicators: {
    acces: {
      short: { fr: 'accès à pied', en: 'walking access' },
      label: { fr: 'Surface atteignable à pied', en: 'Ground reachable on foot' },
      unit: { fr: 'km² en 10 min', en: 'km² in 10 min' },
      directionNote: {
        fr: 'Sens non contesté : plus de sol accessible à pied est plus '
          + 'd’accès, pour tout lecteur.',
        en: 'The direction is not in dispute: more ground reachable on foot is more access, '
          + 'for any reader.',
      },
    },
    niveau: {
      short: { fr: 'niveau de vie', en: 'standard of living' },
      label: { fr: 'Niveau de vie du voisinage', en: 'Standard of living in the neighborhood' },
      unit: { fr: '€/an par personne', en: '€/yr per person' },
      directionNote: {
        fr: 'Point de vue du résident acheteur, et lui seul. Un bailleur '
          + 'social ou une enseigne discount liraient l’échelle à l’envers.',
        en: 'The point of view of a resident buying a home, and of nobody else. A social '
          + 'landlord or a discount chain would read the scale upside down.',
        note: 'The disputable choice of this module, written down rather than implied.',
      },
    },
    pauvrete: {
      short: { fr: 'pauvreté', en: 'poverty' },
      label: { fr: 'Ménages sous le seuil de pauvreté', en: 'Households below the poverty line' },
      unit: { fr: '% des ménages', en: '% of households' },
      directionNote: {
        fr: 'Même point de vue, et donc même réserve, que le niveau de vie.',
        en: 'The same point of view, and so the same caveat, as the standard of living.',
      },
    },
    habitants: {
      short: { fr: 'habitants', en: 'residents' },
      label: { fr: 'Habitants dans l’anneau', en: 'Residents inside the ring' },
      unit: { fr: 'habitants', en: 'residents' },
      directionNote: {
        fr: 'La densité est une préférence, pas une qualité : elle est '
          + 'la clientèle d’un commerce et le bruit d’un riverain.',
        en: 'Density is a preference, not a quality: it is a shop’s custom and a '
          + 'neighbor’s noise.',
      },
    },
    menages: {
      short: { fr: 'ménages', en: 'households' },
      label: { fr: 'Ménages dans l’anneau', en: 'Households inside the ring' },
      unit: { fr: 'ménages', en: 'households' },
      directionNote: {
        fr: 'Même raison que les habitants : un nombre de ménages est '
          + 'une clientèle ou une pression, selon qui lit.',
        en: 'The same reason as residents: a number of households is custom or pressure, '
          + 'depending on who is reading.',
      },
    },
    social: {
      short: { fr: 'logement social', en: 'social housing' },
      label: { fr: 'Logement social', en: 'Social housing' },
      unit: { fr: '% des ménages', en: '% of households' },
      directionNote: {
        fr: 'Résultat d’une politique publique, pas une qualité du lieu — '
          + 'rang seulement.',
        en: 'The result of a public policy, not a quality of the place — rank only.',
        note: 'Refusing the letter here is a choice: an E stuck on a social-housing '
          + 'neighborhood is exactly the use this module does not want to make easy.',
      },
    },
    jeunes: {
      short: { fr: 'moins de 18 ans', en: 'under 18' },
      label: { fr: 'Moins de 18 ans', en: 'Under 18' },
      unit: { fr: '% des habitants', en: '% of residents' },
      directionNote: {
        fr: 'La part d’enfants décrit qui habite là, pas si le lieu est '
          + 'bon : elle est une école pleine et une cour bruyante à la fois.',
        en: 'The share of children describes who lives there, not whether the place is good: '
          + 'it is a full school and a noisy playground at once.',
      },
    },
    aines: {
      short: { fr: '65 ans et plus', en: '65 and over' },
      label: { fr: '65 ans et plus', en: '65 and over' },
      unit: { fr: '% des habitants', en: '% of residents' },
      directionNote: {
        fr: 'La part d’aînés décrit qui habite là. Elle est du calme pour '
          + 'les uns et un marché qui se retire pour les autres.',
        en: 'The share of older residents describes who lives there. It is quiet for some '
          + 'and a market pulling back for others.',
      },
    },
    solo: {
      short: { fr: 'personnes seules', en: 'people living alone' },
      label: { fr: 'Personnes seules', en: 'People living alone' },
      unit: { fr: '% des ménages', en: '% of households' },
      directionNote: {
        fr: 'Vivre seul n’est ni bien ni mal ; c’est une structure de '
          + 'ménages, et elle se lit différemment selon ce qu’on vient y faire.',
        en: 'Living alone is neither good nor bad; it is a household structure, and it reads '
          + 'differently depending on what you came here to do.',
      },
    },
    proprietaires: {
      short: { fr: 'propriétaires', en: 'owner-occupiers' },
      label: { fr: 'Propriétaires', en: 'Owner-occupiers' },
      unit: { fr: '% des ménages', en: '% of households' },
      directionNote: {
        fr: 'La part de propriétaires est une stabilité pour un riverain '
          + 'et un marché fermé pour un agent. Rang seulement.',
        en: 'The share of owner-occupiers is stability for a neighbor and a closed market for '
          + 'an agent. Rank only.',
      },
    },
    prixM2: {
      short: { fr: 'prix au m²', en: 'price per m²' },
      label: { fr: 'Prix médian au m²', en: 'Median price per m²' },
      unit: { fr: '€/m²', en: '€/m²' },
      directionNote: {
        fr: 'Bonne nouvelle pour un vendeur, mauvaise pour un acheteur — '
          + 'la même mesure, deux lectures.',
        en: 'Good news for a seller, bad news for a buyer — one measurement, two readings.',
        note: 'The textbook case of a direction that depends on the reader.',
      },
    },
  },
});
