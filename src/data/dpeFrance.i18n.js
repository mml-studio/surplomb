/**
 * Strings of `src/data/dpeFrance.js` — the energy rating (DPE) layer.
 *
 * TWO WORDS CARRY THE DOMAIN. A *diagnostic de performance énergétique* is a
 * RATING of one dwelling; a *passoire thermique* — a home rated F or G — is an
 * *energy-inefficient home*, which is the glossary's term and the one the law
 * attaches its consequences to. The acronym DPE stays where the French uses
 * it as a noun, because it is the register's name.
 *
 * WHAT THIS LAYER REFUSES TO SAY is as translated as what it says: it never
 * averages letters, and a cell carries a SHARE of F and G rather than a grade
 * for the block. Every one of those refusals is a sentence here.
 */
import { countNoun } from '../i18n/format.js';
import { defineMessages } from '../i18n/messages.js';

/** A leaf that counts its own noun says which language it is in. */
const FR = Object.freeze({ locale: 'fr' });
const EN = Object.freeze({ locale: 'en' });

export default defineMessages({
  /**
   * The energy axis of the 2021 classes, in kWh/m²/an of primary energy
   * (arrêté du 31 mars 2021). The published class is the WORSE of two axes,
   * so these bounds explain a class without predicting it.
   */
  energy: {
    A: { fr: 'jusqu\'à 70 kWh/m²/an', en: 'up to 70 kWh/m²/yr' },
    B: { fr: '71 à 110 kWh/m²/an', en: '71 to 110 kWh/m²/yr' },
    C: { fr: '111 à 180 kWh/m²/an', en: '111 to 180 kWh/m²/yr' },
    D: { fr: '181 à 250 kWh/m²/an', en: '181 to 250 kWh/m²/yr' },
    E: { fr: '251 à 330 kWh/m²/an', en: '251 to 330 kWh/m²/yr' },
    F: { fr: '331 à 420 kWh/m²/an', en: '331 to 420 kWh/m²/yr' },
    G: { fr: 'plus de 420 kWh/m²/an', en: 'over 420 kWh/m²/yr' },
  },

  /** What the theme says on the Bâti 3D row when it paints the volumes. */
  theme: {
    label: { fr: 'Performance énergétique (DPE)', en: 'Energy rating (DPE)' },
    unknown: {
      fr: 'sans DPE dans le rayon scanné',
      en: 'no energy rating inside the scanned radius',
      note: 'Two causes in one phrase: no rating, or a building the scan never reached.',
    },
  },

  /** How many ratings stand behind a mark. */
  ratings: {
    fr: (count) => countNoun(count, 'DPE', 'DPE', FR),
    en: (count) => countNoun(count, 'rating', 'ratings', EN),
    sample: [14],
  },

  /** One site: an address, a building, and the letters it holds. */
  site: {
    noAddress: { fr: 'Adresse non publiée', en: 'Address not published' },
    title: {
      fr: (where, ratings) => `${where} — ${ratings}`,
      en: (where, ratings) => `${where} — ${ratings}`,
      sample: ['12 Tolbiac street', '14 ratings'],
    },
    spreadNone: { fr: 'aucune étiquette publiée', en: 'no label published' },
    spreadMixed: {
      fr: (best, worst, grade) => `de ${best} à ${worst}, majorité ${grade}`,
      en: (best, worst, grade) => `from ${best} to ${worst}, mostly ${grade}`,
      sample: ['C', 'G', 'E'],
    },
    spreadAll: {
      fr: (grade) => `tous ${grade}`,
      en: (grade) => `all ${grade}`,
      sample: ['C'],
    },
    ungraded: {
      fr: (count) => `${count} sans étiquette publiée`,
      en: (count) => `${count} with no published label`,
      sample: [2],
    },
    poor: {
      fr: (count) => `${countNoun(count, 'passoire', 'passoires', FR)} (F ou G)`,
      en: (count) => `${countNoun(count, 'energy-inefficient home', 'energy-inefficient homes', EN)} (F or G)`,
      note: 'The one cut of this register with a legal consequence attached to it.',
      sample: [3],
    },
    cost: {
      fr: (amount) => `${amount} €/an estimés (médiane du site)`,
      en: (amount) => `€${amount}/yr estimated (median for the site)`,
      note: 'All uses, as each rating estimates them; a median, never a mean.',
      sample: ['1,240'],
    },
    footprint: {
      fr: (area) => `emprise ${area} m² au sol`,
      en: (area) => `footprint ${area} m² on the ground`,
      sample: ['412'],
    },
    parcel: {
      fr: (idu) => `parcelle ${idu}`,
      en: (idu) => `parcel ${idu}`,
      sample: ['75113000AB0042'],
    },
    parcelArea: {
      fr: (area) => ` — ${area} m² cadastrés`,
      en: (area) => ` — ${area} m² on the cadastre`,
      sample: ['688'],
    },
    volumePainted: {
      fr: (grade) => `volume Bâti 3D peint ${grade}`,
      en: (grade) => `3D buildings volume painted ${grade}`,
      note: 'Only when the volume under the badge DISAGREES with it.',
      sample: ['D'],
    },
    volumeOutside: {
      fr: 'hors des emprises BD TOPO chargées',
      en: 'outside the BD TOPO footprints loaded',
    },
    distance: {
      fr: (metres) => `${metres} m du centre du scan`,
      en: (metres) => `${metres} m from the scan center`,
      sample: [120],
    },
  },

  /** The seven letters, always all seven (C1: the ladder is the state's). */
  legend: {
    letterBlurb: {
      fr: (energy) => `${energy} — la classe publiée est la pire des deux axes, `
        + 'énergie et gaz à effet de serre. Le volume porte l\'étiquette tenue par le plus '
        + 'de diagnostics du bâtiment, jamais leur moyenne.',
      en: (energy) => `${energy} — the published class is the worse of the two axes, `
        + 'energy and greenhouse gas. The volume carries the label held by the most of the '
        + 'building’s ratings, never their average.',
      sample: ['181 to 250 kWh/m²/yr'],
    },
    letterBlurbShort: {
      fr: (energy) => `${energy} — la classe publiée est la pire des deux axes, `
        + 'énergie et gaz à effet de serre.',
      en: (energy) => `${energy} — the published class is the worse of the two axes, `
        + 'energy and greenhouse gas.',
      note: 'The badge ramp on the layer’s own row, where the volumes are not the subject.',
      sample: ['181 to 250 kWh/m²/yr'],
    },
    mixed: {
      fr: (buildings, letter) => ` ${countNoun(buildings, 'immeuble', 'immeubles', FR)} `
        + `peint${buildings > 1 ? 's' : ''} ${letter} `
        + `${buildings > 1 ? 'ne sont pas unanimes' : 'n\'est pas unanime'} : les diagnostics `
        + 'qui en diffèrent gardent leur badge à taille pleine sur le toit.',
      en: (buildings, letter) => ` ${countNoun(buildings, 'building', 'buildings', EN)} `
        + `painted ${letter} ${buildings > 1 ? 'are' : 'is'} not unanimous: the ratings that `
        + 'differ keep their full-size badge on the roof.',
      note: 'Appended to a letter’s blurb when the volumes it painted are not unanimous.',
      sample: [2, 'E'],
    },
    ungraded: {
      label: { fr: 'étiquette non publiée', en: 'label not published' },
      blurb: {
        fr: 'Diagnostic présent dans le registre sans étiquette exploitable. Il ne peut '
          + 'peindre aucun volume et n\'est jamais rapproché de la lettre la plus proche.',
        en: 'A rating present in the register with no usable label. It can paint no volume '
          + 'and is never rounded to the nearest letter.',
      },
    },
  },

  /** The coverage line on the row: what was served, painted and outlined. */
  coverage: {
    truncated: {
      fr: (served, total, radius) => `${served} DPE servis sur ${total} `
        + `dans ${radius} m (les plus proches du centre)`,
      en: (served, total, radius) => `${served} ratings served out of ${total} `
        + `within ${radius} m (the nearest to the center)`,
      sample: ['200', '2,805', 300],
    },
    served: {
      fr: (ratings, radius) => `${ratings} dans ${radius} m`,
      en: (ratings, radius) => `${ratings} within ${radius} m`,
      note: '`ratings` is already counted and named (`200 ratings`).',
      sample: ['200 ratings', 300],
    },
    painted: {
      fr: (painted, loaded) => ` · ${countNoun(painted, 'volume', 'volumes', FR)} `
        + `peint${painted > 1 ? 's' : ''} sur ${loaded} chargés`,
      en: (painted, loaded) => ` · ${countNoun(painted, 'volume', 'volumes', EN)} painted `
        + `out of ${loaded} loaded`,
      sample: [42, '1,204'],
    },
    sites: {
      fr: (sites, outlined) => ` · ${countNoun(sites, 'adresse', 'adresses', FR)} `
        + `· ${outlined} avec emprise bâtie`,
      en: (sites, outlined) => ` · ${countNoun(sites, 'address', 'addresses', EN)} `
        + `· ${outlined} with a building footprint`,
      sample: [10, 8],
    },
  },

  /** Above 600 m: one disc per patch of ground, and never a grade for it. */
  cells: {
    classes: {
      veryHigh: {
        label: { fr: '25 % et plus', en: '25% and over' },
        blurb: {
          fr: 'Au moins un logement diagnostiqué sur quatre est classé F ou G — deux fois et demie '
            + 'la part du registre national.',
          en: 'At least one rated dwelling in four is F or G — two and a half times the share '
            + 'of the national register.',
        },
      },
      high: {
        label: { fr: '15 à 25 %', en: '15% to 25%' },
        blurb: {
          fr: 'Nettement au-dessus de la part du registre national.',
          en: 'Clearly above the share of the national register.',
        },
      },
      near: {
        label: { fr: '5 à 15 %', en: '5% to 15%' },
        blurb: {
          fr: 'La bande où tombe le registre national (9,75 %) : un îlot ordinaire à cette échelle.',
          en: 'The band the national register falls in (9.75%): an ordinary block at this scale.',
        },
      },
      low: {
        label: { fr: 'moins de 5 %', en: 'less than 5%' },
        blurb: {
          fr: 'Deux fois moins de passoires que le registre national.',
          en: 'Half as many energy-inefficient homes as the national register.',
        },
      },
      none: {
        label: { fr: 'aucune', en: 'none' },
        blurb: {
          fr: 'Aucun diagnostic F ou G publié dans cette cellule.',
          en: 'No F or G rating published in this cell.',
        },
      },
    },
    tooFew: {
      label: {
        fr: (minimum) => `moins de ${minimum} DPE`,
        en: (minimum) => `fewer than ${minimum} ratings`,
        sample: [8],
      },
      blurb: {
        fr: (minimum) => `Trop peu de diagnostics pour publier un taux : sous ${minimum}, un seul `
          + 'DPE déplace la part de plus de douze points et le chiffre porterait '
          + 'l\'échantillonnage, pas l\'îlot. La cellule est quand même dessinée, à la taille '
          + 'que son nombre lui vaut.',
        en: (minimum) => `Too few ratings to publish a share: under ${minimum}, one rating `
          + 'moves the share by more than twelve points and the figure would carry the '
          + 'sampling, not the block. The cell is drawn all the same, at the size its count '
          + 'earns it.',
        sample: [8],
      },
    },
    anchor: {
      fr: (national) => `Part de passoires (F ou G) · ${national} % dans le registre national`,
      en: (national) => `Share of energy-inefficient homes (F or G) · ${national}% in the `
        + 'national register',
      sample: ['9.75'],
    },
    here: {
      fr: (share) => `${share} % ici`,
      en: (share) => `${share}% here`,
      sample: ['12.4'],
    },
    registerNotStock: {
      fr: 'un DPE est obligatoire à la vente et à la location : le registre n’est pas le parc',
      en: 'a rating is compulsory on a sale or a new let: the register is not the housing stock',
      note: 'A2 — the denominator is the register, not the housing stock.',
    },
    discSize: {
      fr: 'taille du disque = nombre de DPE',
      en: 'disc size = number of ratings',
    },
    box: { fr: 'la boîte', en: 'the box' },
    aggregated: {
      fr: (span) => `vue agrégée sur ${span} de côté`,
      en: (span) => `view aggregated over ${span} a side`,
      sample: ['2.2 km'],
    },
    inCells: {
      fr: (ratings, cells) => `${ratings} en ${countNoun(cells, 'cellule', 'cellules', FR)}`,
      en: (ratings, cells) => `${ratings} in ${countNoun(cells, 'cell', 'cells', EN)}`,
      note: '`ratings` is already counted and named.',
      sample: ['1,324 ratings', 96],
    },
    tilesMissing: {
      fr: (missing, tiles) => `${missing} tuile(s) sur ${tiles} sans réponse : `
        + 'ce sol est vide faute de donnée, pas faute de diagnostic',
      en: (missing, tiles) => `${missing} tile(s) of ${tiles} did not answer: `
        + 'this ground is empty for want of data, not for want of a rating',
      sample: [2, 16],
    },
    truncated: {
      fr: 'agrégation écrêtée par l’API : la grille est un sous-ensemble du sol',
      en: 'aggregation capped by the API: the grid is a subset of the ground',
    },
    descendForBuildings: {
      fr: (metres) => `descendre sous ${metres} m pour retrouver chaque bâtiment, `
        + 'son emprise et ses étiquettes',
      en: (metres) => `drop below ${metres} m to get each building back, its footprint and `
        + 'its labels',
      sample: [600],
    },
    inCell: {
      fr: (ratings) => `${ratings} dans cette cellule`,
      en: (ratings) => `${ratings} in this cell`,
      sample: ['14 ratings'],
    },
    noShare: {
      fr: (minimum) => `moins de ${minimum} diagnostics : aucun taux publié`,
      en: (minimum) => `fewer than ${minimum} ratings: no share published`,
      sample: [8],
    },
    poorShare: {
      fr: (poor, share) => `${poor} — ${share} %`,
      en: (poor, share) => `${poor} — ${share}%`,
      note: '`poor` is already counted and named (`3 energy-inefficient homes (F or G)`).',
      sample: ['3 energy-inefficient homes (F or G)', '12.4'],
    },
    national: {
      fr: (share) => `registre national ${share} %`,
      en: (share) => `national register ${share}%`,
      sample: ['9.75'],
    },
    notAGrade: {
      fr: 'part de F et G, jamais une note moyenne du quartier',
      en: 'a share of F and G, never an average grade for the neighborhood',
    },
    descendForLabels: {
      fr: (metres) => `descendre sous ${metres} m pour les étiquettes bâtiment par bâtiment`,
      en: (metres) => `drop below ${metres} m for the labels building by building`,
      sample: [600],
    },
    discName: {
      fr: (share) => `${share} % de passoires`,
      en: (share) => `${share}% energy-inefficient`,
      sample: ['12.4'],
    },
  },
});
